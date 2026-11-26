import { ref, shallowRef } from 'vue'
import type { Ref, ShallowRef } from 'vue'
import type { LogServer } from '../lib/workspaceLog'
import { answerPeer, offerPeer } from './peer'
import type { Peer } from './peer'
import { importKey, newKey, relayLink, sparing } from './relay'
import type { Relay } from './relay'
import { newSecret, roomOf } from './rooms'
import type { FromRoom, IceServer } from './rooms'
import { GuestSession, HOST, HostSession } from './session'
import type { Link, Person, Pointer } from './session'
import { openSignal } from './signal'
import type { Signal } from './signal'

// A shared session as the editor sees it: whether one is on, who is there, where they point.
// Here the parts meet: the room on the signalling server (rooms.ts, signal.ts), the direct
// connections (peer.ts) and what is said over them (session.ts).

export interface Sharing {
  /** Whether this browser shares its own workspace, or is in somebody else's. */
  role: 'host' | 'guest'
  state: Ref<'off' | 'starting' | 'on'>
  /** The link that leads the others here; the host has it while it shares. */
  link: Ref<string | undefined>
  /** Everybody in the session, the host first. */
  people: ShallowRef<Person[]>
  /** Who of them this browser is. */
  you: Ref<string>
  /** Where the others point, by their ids. */
  pointers: ShallowRef<Record<string, Pointer>>
  /** Begins to share (the host). Throws, in words, when the signalling server is not there. */
  start(name: string): Promise<void>
  /** Stops sharing (the host), or leaves (a guest). */
  stop(): void
  /** Says where this browser's own pointer is; nowhere when it left the canvas. */
  point(at: Pointer | undefined): void
}

/**
 * The address of a shared session: what the host gives to the others. After the "#" its key
 * (collab/relay.ts), which a browser keeps to itself: no server is ever sent that part.
 */
export const sessionLink = (room: string, key: string) => `${location.origin}/s/${room}#${key}`

function seen(): Pick<Sharing, 'state' | 'link' | 'people' | 'you' | 'pointers'> & { pointed(from: string, at: Pointer | undefined): void } {
  const pointers = shallowRef<Record<string, Pointer>>({})
  return {
    state: ref<'off' | 'starting' | 'on'>('off'),
    link: ref<string>(),
    people: shallowRef<Person[]>([]),
    you: ref(HOST),
    pointers,
    pointed(from, at) {
      const { [from]: _, ...others } = pointers.value
      pointers.value = at ? { ...others, [from]: at } : others
    },
  }
}

/** The signalling server gave no answer in this time: it is not there. */
const ANSWER_WITHIN = 10_000

/** The first message of a room that says how asking for a seat went. */
function seated(signal: Signal, wanted: FromRoom['type']): Promise<FromRoom> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('The signalling server does not answer.')), ANSWER_WITHIN)
    const done = (answer: FromRoom) => {
      clearTimeout(timeout)
      signal.onClose = undefined
      resolve(answer)
    }
    signal.onMessage = (message) => {
      if (message.type === wanted || message.type === 'nobody' || message.type === 'full' || message.type === 'refused') done(message)
    }
    signal.onClose = () => {
      clearTimeout(timeout)
      reject(new Error('The signalling server closed the connection.'))
    }
  })
}

export interface HostSharing extends Sharing {
  /** The host's own editor wrote to the log: the guests are told. */
  moved(head: number): void
}

/**
 * Sharing of a workspace this browser keeps. `server`: its log, as the editor writes it.
 * `workspace`: its name. `pull`: tells the editor that a guest wrote to the log.
 */
export function hostSharing(deps: { server: LogServer; workspace: () => string; pull: () => void }): HostSharing {
  const state = seen()
  let session: HostSession | undefined
  let signal: Signal | undefined
  let secret = ''
  let key: CryptoKey | undefined
  const peers = new Map<string, Peer>()
  /** The guests that found no direct way: what is said to them goes through the server. */
  const relays = new Map<string, Relay>()

  /** Takes the host's seat in the room, and from then on answers every guest that comes. */
  async function sit(room: string): Promise<void> {
    const opened = await openSignal(room)
    const answer = seated(opened, 'hosting')
    opened.send({ type: 'host', secret })
    const said = await answer.catch((failure: unknown) => {
      opened.close()
      throw failure
    })
    if (said.type !== 'hosting') {
      opened.close()
      throw new Error('The room is taken.')
    }
    signal = opened
    let ice: IceServer[] = said.ice
    opened.onMessage = (message) => {
      if (message.type === 'joined') {
        ice = message.ice ?? ice
        const guest = message.peer
        const peer = answerPeer({ ice, signal: (data) => opened.send({ type: 'signal', to: guest, data }) })
        peers.set(guest, peer)
        peer.link.then(
          (link) => session?.add(guest, link),
          () => peers.delete(guest),
        )
      } else if (message.type === 'signal' && message.from !== undefined) {
        peers.get(message.from)?.signalled(message.data)
      } else if (message.type === 'relay' && message.from !== undefined && key) {
        // A guest that found no direct way, and says so by taking this one.
        const guest = message.from
        let relay = relays.get(guest)
        if (!relay) {
          peers.get(guest)?.close()
          peers.delete(guest)
          relay = relayLink({ key, send: (data) => opened.send({ type: 'relay', to: guest, data }) })
          relays.set(guest, relay)
          session?.add(guest, sparing(relay.link))
        }
        relay.received(message.data)
      } else if (message.type === 'left') {
        relays.get(message.peer)?.closed()
        relays.delete(message.peer)
      }
    }
    // The server let go (a new version of it, the network): the session goes on between the
    // browsers that talk directly, and the seat is taken again so that the next guest finds
    // the host. Who talked through the server was sent away by it.
    opened.onClose = () => {
      for (const relay of relays.values()) relay.closed()
      relays.clear()
      void again(room, 1)
    }
  }

  async function again(room: string, attempt: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** (attempt - 1), 15_000)))
    if (!session || state.state.value !== 'on') return
    try {
      await sit(room)
    } catch {
      void again(room, attempt + 1)
    }
  }

  return {
    role: 'host',
    ...state,
    async start(name) {
      if (state.state.value !== 'off') return
      state.state.value = 'starting'
      secret = newSecret()
      const room = await roomOf(secret)
      const linkKey = newKey()
      key = await importKey(linkKey)
      session = new HostSession({
        server: deps.server,
        name,
        workspace: deps.workspace(),
        onPeople: (people) => (state.people.value = people),
        onPointer: state.pointed,
        wrote: deps.pull,
      })
      try {
        await sit(room)
      } catch {
        session = undefined
        state.state.value = 'off'
        throw new Error('Sharing needs the site\'s meeting point for browsers, and it does not answer. Try again in a moment.')
      }
      state.people.value = session.people
      state.you.value = HOST
      state.link.value = sessionLink(room, linkKey)
      state.state.value = 'on'
    },
    stop() {
      session?.stop()
      session = undefined
      // The goodbye to those who are talked to through the server is on its way through it.
      const closing = signal
      void Promise.all([...relays.values()].map((relay) => relay.flushed())).finally(() => closing?.close())
      relays.clear()
      signal = undefined
      for (const peer of peers.values()) peer.close()
      peers.clear()
      state.state.value = 'off'
      state.link.value = undefined
      state.people.value = []
      state.pointers.value = {}
    },
    point: (at) => session?.pointer(at),
    moved: (head) => session?.moved(head),
  }
}

/** Why a link did not lead into a session. */
export class JoinFailed extends Error {
  constructor(
    /**
     * - `unreachable`: the signalling server does not answer.
     * - `nobody`: nobody shares under this link (not yet, or not any more).
     * - `full`: the session has as many people as it takes.
     * - `noWay`: the two browsers found no way to each other.
     */
    readonly why: 'unreachable' | 'nobody' | 'full' | 'noWay',
  ) {
    super(`The session could not be joined: ${why}.`)
  }
}

export interface GuestSharing extends Sharing {
  /** The host's log, as a server of its own would give it. */
  server: LogServer
  /** The name of the workspace that is shared. */
  workspace: string
  /** Asks to be told when somebody else wrote to the log. */
  onMoved(told: () => void): void
}

/**
 * Joins the session of a link. `linkKey`: what the link has after its "#". `ended`: the
 * session is over, because the host stopped sharing (`bye`) or the connection is lost.
 * Throws `JoinFailed`.
 */
export async function joinSharing(room: string, linkKey: string, name: string, ended: (why: 'bye' | 'lost') => void): Promise<GuestSharing> {
  const signal = await openSignal(room).catch(() => {
    throw new JoinFailed('unreachable')
  })
  const answer = seated(signal, 'joining')
  signal.send({ type: 'join' })
  const said = await answer.catch(() => ({ type: 'unreachable' as const }))
  if (said.type !== 'joining') {
    signal.close()
    throw new JoinFailed(said.type === 'nobody' || said.type === 'full' ? said.type : 'unreachable')
  }

  const peer = offerPeer({ ice: said.ice, signal: (data) => signal.send({ type: 'signal', data }) })
  signal.onMessage = (message) => message.type === 'signal' && peer.signalled(message.data)
  const state = seen()
  let moved = () => {}
  /** Whether the two browsers talk directly; else through the server, which then stays connected. */
  let direct = true
  try {
    const link = await peer.link.catch(async (): Promise<Link> => {
      // No direct way: through the server then, sealed with the key of the link. A link
      // without its key leads nowhere from here.
      peer.close()
      const key = await importKey(linkKey)
      direct = false
      const relay = relayLink({ key, send: (data) => signal.send({ type: 'relay', data }) })
      signal.onMessage = (message) => {
        if (message.type === 'relay') relay.received(message.data)
        else if (message.type === 'ended') relay.closed()
      }
      signal.onClose = () => relay.closed()
      const through = sparing(relay.link)
      const close = through.close
      // Leaving is leaving the room: the server tells the host, once the last word is out.
      through.close = () => {
        close()
        void relay.flushed().finally(() => signal.close())
      }
      return through
    })
    const session = new GuestSession(link, {
      name,
      onPeople: (people) => (state.people.value = people),
      onPointer: state.pointed,
      onMoved: () => moved(),
      onEnded: (why) => {
        state.state.value = 'off'
        state.people.value = []
        state.pointers.value = {}
        ended(why)
      },
    })
    const welcome = await Promise.race([
      session.hello(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('The host does not answer.')), ANSWER_WITHIN)),
    ])
    state.you.value = welcome.you
    state.state.value = 'on'
    state.link.value = sessionLink(room, linkKey)
    return {
      role: 'guest',
      ...state,
      server: session.server,
      workspace: welcome.workspace,
      onMoved: (told) => (moved = told),
      start: async () => {},
      stop() {
        session.leave()
        state.state.value = 'off'
        state.people.value = []
        state.pointers.value = {}
      },
      point: (at) => session.pointer(at),
    }
  } catch {
    peer.close()
    direct = true
    throw new JoinFailed('noWay')
  } finally {
    // Two browsers that talk directly, or never will, need the room no more.
    if (direct) signal.close()
  }
}
