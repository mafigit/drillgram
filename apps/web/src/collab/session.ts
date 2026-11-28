import type { LineColour, LogEntry } from '@drillgram/model'
import type { LogServer, ServerEntry } from '../lib/workspaceLog'

// A shared session, as the browsers in it talk to each other. The browser that shares is the
// host: its change log is the truth, and it is the server of that log for its guests, who read
// and write it through their connection to the host (collab/peer.ts) as the host itself does
// through `lib/api.ts`. The host also says who is there and where everybody's pointer is.
// Nothing here knows what carries the messages: a `Link` does.

/** A connection to one other browser: messages there and back, in order, none lost. */
export interface Link {
  send(message: unknown): void
  close(): void
  onMessage?: (message: unknown) => void
  /** The other side is gone, or the connection is. Not called after `close()`. */
  onClose?: () => void
}

/** Somebody in the session. `colour`: one of the line colours, by name; each theme draws it in its own tone. */
export type Person = { id: string; name: string; colour: string }
/** Where a pointer is: on which diagram, in the diagram's own measures. */
export type Pointer = { view: string; x: number; y: number }

/** The colours people get, in the order they come: the line colours, red last (it also says "wrong"). */
export const PEOPLE_COLOURS: readonly LineColour[] = ['blue', 'pink', 'green', 'orange', 'purple', 'teal', 'yellow', 'red']

/** The host's id among the people of a session. */
export const HOST = 'host'
export const MAX_NAME = 40
const MAX_BATCH = 500

/** A name as somebody typed it, fit to be shown: no edges of blanks, not endless, never empty. */
export function tidyName(typed: unknown): string {
  const name = typeof typed === 'string' ? [...typed.trim().replace(/\s+/g, ' ')].slice(0, MAX_NAME).join('') : ''
  return name === '' ? 'Guest' : name
}

type ToHost =
  | { t: 'hello'; name: string }
  | { t: 'read'; id: number; after: number }
  | { t: 'append'; id: number; after: number; entries: LogEntry[] }
  | { t: 'pointer'; at?: Pointer }

type ToGuest =
  | { t: 'welcome'; you: string; workspace: string; people: Person[] }
  | { t: 'people'; people: Person[] }
  /** The answer to the request numbered `id`: what the log answered, or the status it refused with. */
  | { t: 'answer'; id: number; data?: unknown; status?: number }
  /** Somebody else wrote to the log. */
  | { t: 'moved'; head: number }
  | { t: 'pointer'; from: string; at?: Pointer }
  /** The host stopped sharing. */
  | { t: 'bye' }

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function pointerOf(said: unknown): Pointer | undefined {
  if (!isObject(said)) return undefined
  const { view, x, y } = said
  return typeof view === 'string' && view.length <= 200 && typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)
    ? { view, x, y }
    : undefined
}

/** What a guest may write: changes, comments and steps along the timeline. Clearing is the host's. */
function entriesOf(said: unknown): LogEntry[] | undefined {
  if (!Array.isArray(said) || said.length === 0 || said.length > MAX_BATCH) return undefined
  const fine = said.every((entry) => isObject(entry) && typeof entry.id === 'string' && entry.id.length <= 100 && (entry.type === 'change' || entry.type === 'comment' || entry.type === 'wentTo'))
  return fine ? (said as LogEntry[]) : undefined
}

const statusOf = (failure: unknown) => (isObject(failure) && typeof failure.status === 'number' ? failure.status : 500)

export interface HostDeps {
  /** The log of the shared workspace, as the host's own editor writes it. */
  server: LogServer
  /** The host's name, and the workspace's. */
  name: string
  workspace: string
  onPeople: (people: Person[]) => void
  /** Where somebody's pointer is; nowhere when it left the canvas, or they left. */
  onPointer: (from: string, at: Pointer | undefined) => void
  /** A guest wrote to the log: the host's own editor is to take it. */
  wrote: () => void
}

/** The host's side: serves the log to its guests and tells everybody what the others do. */
export class HostSession {
  private guests = new Map<string, { link: Link; person?: Person }>()
  private me: Person

  constructor(private deps: HostDeps) {
    this.me = { id: HOST, name: tidyName(deps.name), colour: PEOPLE_COLOURS[0]! }
  }

  get people(): Person[] {
    return [this.me, ...[...this.guests.values()].flatMap((guest) => (guest.person ? [guest.person] : []))]
  }

  /** A guest's browser is connected. It is somebody once it has said its name. */
  add(id: string, link: Link): void {
    this.guests.set(id, { link })
    link.onMessage = (message) => void this.said(id, message)
    link.onClose = () => this.gone(id)
  }

  /** The host's own editor wrote to the log. */
  moved(head: number): void {
    this.toAll({ t: 'moved', head })
  }

  /** Where the host's own pointer is. */
  pointer(at: Pointer | undefined): void {
    this.toAll({ t: 'pointer', from: HOST, at })
  }

  /** Stops sharing: everybody is told, and let go. */
  stop(): void {
    for (const { link } of this.guests.values()) {
      link.onClose = undefined
      link.send({ t: 'bye' } satisfies ToGuest)
      link.close()
    }
    this.guests.clear()
  }

  private toAll(message: ToGuest, but?: string): void {
    for (const [id, guest] of this.guests) if (id !== but && guest.person) guest.link.send(message)
  }

  private gone(id: string): void {
    const guest = this.guests.get(id)
    if (!this.guests.delete(id) || !guest?.person) return
    this.toAll({ t: 'people', people: this.people })
    this.toAll({ t: 'pointer', from: id })
    this.deps.onPointer(id, undefined)
    this.deps.onPeople(this.people)
  }

  private async said(id: string, message: unknown): Promise<void> {
    const guest = this.guests.get(id)
    if (!guest || !isObject(message)) return
    const answer = (to: ToGuest) => guest.link.send(to)

    if (message.t === 'hello') {
      if (guest.person) return
      const taken = new Set(this.people.map((person) => person.colour))
      const colour = PEOPLE_COLOURS.find((free) => !taken.has(free)) ?? PEOPLE_COLOURS[this.guests.size % PEOPLE_COLOURS.length]!
      guest.person = { id, name: tidyName(message.name), colour }
      answer({ t: 'welcome', you: id, workspace: this.deps.workspace, people: this.people })
      this.toAll({ t: 'people', people: this.people }, id)
      this.deps.onPeople(this.people)
      return
    }
    // Nobody reads or writes who has not said who they are.
    if (!guest.person) return

    if (message.t === 'pointer') {
      const at = message.at === undefined ? undefined : pointerOf(message.at)
      if (message.at !== undefined && !at) return
      this.toAll({ t: 'pointer', from: id, at }, id)
      this.deps.onPointer(id, at)
      return
    }

    const request = message.id
    if (typeof request !== 'number') return
    try {
      if (message.t === 'read' && typeof message.after === 'number') {
        answer({ t: 'answer', id: request, data: await this.deps.server.read(message.after) })
      } else if (message.t === 'append' && typeof message.after === 'number') {
        const entries = entriesOf(message.entries)
        if (!entries) return answer({ t: 'answer', id: request, status: 400 })
        const written = await this.deps.server.append(message.after, entries)
        answer({ t: 'answer', id: request, data: written })
        if (written.ok) {
          this.deps.wrote()
          this.toAll({ t: 'moved', head: written.head }, id)
        }
      } else {
        answer({ t: 'answer', id: request, status: 400 })
      }
    } catch (failure) {
      answer({ t: 'answer', id: request, status: statusOf(failure) })
    }
  }
}

export interface GuestDeps {
  name: string
  onPeople: (people: Person[]) => void
  onPointer: (from: string, at: Pointer | undefined) => void
  /** Somebody else wrote to the log: the editor is to take it. */
  onMoved: () => void
  /** The session is over: the host stopped sharing (`bye`), or the connection is lost. */
  onEnded: (why: 'bye' | 'lost') => void
}

/** A request the host refused, or could not be asked: a status as of a server. */
class Refused extends Error {
  constructor(readonly status: number) {
    super(`The host answered with ${status}.`)
  }
}

/** A guest's side: the host's log as a server of its own would give it, and what the others do. */
export class GuestSession {
  private asked = 0
  private waiting = new Map<number, { resolve: (data: unknown) => void; reject: (failure: unknown) => void }>()
  private over = false
  private welcomed: ((welcome: { you: string; workspace: string; people: Person[] }) => void) | undefined

  constructor(
    private link: Link,
    private deps: GuestDeps,
  ) {
    link.onMessage = (message) => this.said(message)
    link.onClose = () => this.end('lost')
  }

  /** Says who is there, and learns who else is: the id among them, the workspace's name. */
  hello(): Promise<{ you: string; workspace: string; people: Person[] }> {
    return new Promise((resolve, reject) => {
      this.welcomed = resolve
      this.waiting.set(-1, { resolve: () => {}, reject })
      this.link.send({ t: 'hello', name: tidyName(this.deps.name) } satisfies ToHost)
    })
  }

  /** The host's log. A session that is over answers as a server whose workspace is gone. */
  readonly server: LogServer = {
    read: (after) => this.ask<{ head: number; entries: ServerEntry[] }>({ t: 'read', after }),
    append: (after, entries) => this.ask<{ ok: boolean; head: number }>({ t: 'append', after, entries }),
    // A guest changes the workspace with the others; to empty it is the host's.
    clear: () => Promise.reject(new Refused(403)),
  }

  pointer(at: Pointer | undefined): void {
    if (!this.over) this.link.send({ t: 'pointer', at } satisfies ToHost)
  }

  /** Leaves the session; nobody is told that it ended, it was left. */
  leave(): void {
    if (this.over) return
    this.over = true
    this.link.onClose = undefined
    this.link.close()
    this.fail()
  }

  private ask<T>(request: { t: 'read'; after: number } | { t: 'append'; after: number; entries: LogEntry[] }): Promise<T> {
    if (this.over) return Promise.reject(new Refused(404))
    const id = ++this.asked
    return new Promise<T>((resolve, reject) => {
      this.waiting.set(id, { resolve: resolve as (data: unknown) => void, reject })
      this.link.send({ ...request, id } satisfies ToHost)
    })
  }

  private fail(): void {
    for (const { reject } of this.waiting.values()) reject(new Refused(404))
    this.waiting.clear()
  }

  private end(why: 'bye' | 'lost'): void {
    if (this.over) return
    this.over = true
    this.fail()
    this.deps.onEnded(why)
  }

  private said(message: unknown): void {
    if (!isObject(message)) return
    const said = message as ToGuest
    if (said.t === 'welcome') {
      this.waiting.delete(-1)
      this.welcomed?.({ you: said.you, workspace: said.workspace, people: said.people })
      this.welcomed = undefined
      this.deps.onPeople(said.people)
    } else if (said.t === 'people') this.deps.onPeople(said.people)
    else if (said.t === 'moved') this.deps.onMoved()
    else if (said.t === 'pointer') this.deps.onPointer(said.from, said.at)
    else if (said.t === 'bye') this.end('bye')
    else if (said.t === 'answer') {
      const waiting = this.waiting.get(said.id)
      if (!waiting) return
      this.waiting.delete(said.id)
      if (said.status === undefined) waiting.resolve(said.data)
      else waiting.reject(new Refused(said.status))
    }
  }
}
