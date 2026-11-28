import { describe, expect, it } from 'vitest'
import { ROOT_VIEW_ID } from '@drillgram/model'
import type { LogEntry, WorkspaceEvent } from '@drillgram/model'
import type { LogServer, ServerEntry } from '../../lib/workspaceLog'
import { GuestSession, HOST, HostSession, tidyName } from '../session'
import type { Link, Person, Pointer } from '../session'

const add = (name: string): WorkspaceEvent => ({ type: 'objectAdded', view: ROOT_VIEW_ID, kind: 'softwareSystem', name })
const change = (id: string, name: string): LogEntry => ({ id, type: 'change', at: '2026-01-01T09:00:00.000Z', event: add(name) })

/** Everything that is on its way has arrived. */
const settled = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

/** Two ends of one connection: what one sends, the other gets a moment later, as text went over a wire. */
function pair(): [Link, Link] {
  const ends: Link[] = []
  const end = (other: () => Link): Link => {
    let open = true
    return {
      send(message) {
        const wire = JSON.stringify(message)
        if (open) queueMicrotask(() => other().onMessage?.(JSON.parse(wire)))
      },
      close() {
        if (!open) return
        open = false
        queueMicrotask(() => other().onClose?.())
      },
    }
  }
  ends.push(end(() => ends[1]!), end(() => ends[0]!))
  return [ends[0]!, ends[1]!]
}

/** A log in memory, as `lib/api.ts` gives the host its own. */
class Log implements LogServer {
  entries: ServerEntry[] = []
  head = 0
  async read(after: number) {
    return { head: this.head, entries: this.entries.filter((entry) => entry.seq > after) }
  }
  async append(after: number, entries: LogEntry[]) {
    if (after !== this.head) return { ok: false, head: this.head }
    for (const entry of entries) this.entries.push({ seq: ++this.head, entry })
    return { ok: true, head: this.head }
  }
  async clear() {
    return { head: ++this.head }
  }
}

/** A host with its log, and what it was told. */
function hosting() {
  const log = new Log()
  const seen = { people: [] as Person[][], pointers: [] as [string, Pointer | undefined][], wrote: 0 }
  const host = new HostSession({
    server: log,
    name: 'Ada',
    workspace: 'Bookshop',
    onPeople: (people) => seen.people.push(people),
    onPointer: (from, at) => seen.pointers.push([from, at]),
    wrote: () => seen.wrote++,
  })
  let joined = 0
  /** One more guest, connected and welcomed. */
  async function join(name: string) {
    const [theirs, mine] = pair()
    const id = `g${++joined}`
    host.add(id, mine)
    const told = { people: [] as Person[][], pointers: [] as [string, Pointer | undefined][], moved: 0, ended: [] as string[] }
    const guest = new GuestSession(theirs, {
      name,
      onPeople: (people) => told.people.push(people),
      onPointer: (from, at) => told.pointers.push([from, at]),
      onMoved: () => told.moved++,
      onEnded: (why) => told.ended.push(why),
    })
    const welcome = await guest.hello()
    return { id, guest, told, welcome, link: theirs, hostLink: mine }
  }
  return { host, log, seen, join }
}

describe('a shared session', () => {
  it('welcomes a guest with who is there, and tells the host and the other guests', async () => {
    const { host, seen, join } = hosting()
    const ben = await join('Ben')
    expect(ben.welcome).toEqual({
      you: 'g1',
      workspace: 'Bookshop',
      people: [
        { id: HOST, name: 'Ada', colour: 'blue' },
        { id: 'g1', name: 'Ben', colour: 'pink' },
      ],
    })
    const cleo = await join('Cleo')
    await settled()
    expect(cleo.welcome.people.map((person) => person.name)).toEqual(['Ada', 'Ben', 'Cleo'])
    expect(ben.told.people.at(-1)!.map((person) => person.name)).toEqual(['Ada', 'Ben', 'Cleo'])
    expect(seen.people.at(-1)).toEqual(host.people)
    // Everybody has a colour of their own.
    expect(new Set(host.people.map((person) => person.colour)).size).toBe(3)
  })

  it('gives a guest the host\'s log to read and to write, and tells the others that it moved', async () => {
    const { log, seen, join } = hosting()
    await log.append(0, [change('a', 'Shop')])
    const ben = await join('Ben')
    const cleo = await join('Cleo')

    expect(await ben.guest.server.read(0)).toEqual({ head: 1, entries: [{ seq: 1, entry: change('a', 'Shop') }] })
    expect(await ben.guest.server.append(1, [change('b', 'Bank')])).toEqual({ ok: true, head: 2 })
    await settled()
    expect(log.entries.map((kept) => kept.entry.id)).toEqual(['a', 'b'])
    // The host's own editor takes it, the other guest hears of it, the writer knows already.
    expect(seen.wrote).toBe(1)
    expect(cleo.told.moved).toBe(1)
    expect(ben.told.moved).toBe(0)
    expect(await cleo.guest.server.read(1)).toEqual({ head: 2, entries: [{ seq: 2, entry: change('b', 'Bank') }] })
  })

  it('tells every guest when the host itself wrote', async () => {
    const { host, join } = hosting()
    const ben = await join('Ben')
    const cleo = await join('Cleo')
    host.moved(5)
    await settled()
    expect([ben.told.moved, cleo.told.moved]).toEqual([1, 1])
  })

  it('answers a guest who has not seen everything as the log does: not written, and how far the log is', async () => {
    const { log, seen, join } = hosting()
    await log.append(0, [change('a', 'Shop')])
    const ben = await join('Ben')
    expect(await ben.guest.server.append(0, [change('b', 'Bank')])).toEqual({ ok: false, head: 1 })
    expect(seen.wrote).toBe(0)
  })

  it('lets no guest empty the workspace, nor write what is not a change', async () => {
    const { log, join } = hosting()
    const ben = await join('Ben')
    await expect(ben.guest.server.clear()).rejects.toMatchObject({ status: 403 })
    await expect(ben.guest.server.append(0, [{ type: 'cleared' }])).rejects.toMatchObject({ status: 400 })
    await expect(ben.guest.server.append(0, [])).rejects.toMatchObject({ status: 400 })
    expect(log.head).toBe(0)
  })

  it('lets a guest write comments (J17)', async () => {
    const { log, join } = hosting()
    const ben = await join('Ben')
    const comment: LogEntry = {
      id: 'c',
      type: 'comment',
      at: '2026-01-01T09:00:00.000Z',
      event: { type: 'started', thread: 't1', comment: 'c1', view: ROOT_VIEW_ID, at: { x: 0, y: 0 }, author: 'Ben', text: 'Who owns this?' },
    }
    expect(await ben.guest.server.append(0, [comment])).toEqual({ ok: true, head: 1 })
    expect(log.entries.map((kept) => kept.entry)).toEqual([comment])
  })

  it('says the host\'s refusal with its status', async () => {
    const { log, join } = hosting()
    log.read = () => Promise.reject(Object.assign(new Error('gone'), { status: 404 }))
    const ben = await join('Ben')
    await expect(ben.guest.server.read(0)).rejects.toMatchObject({ status: 404 })
  })

  it('shows everybody where the others point, and no longer where somebody left the canvas', async () => {
    const { host, seen, join } = hosting()
    const ben = await join('Ben')
    const cleo = await join('Cleo')
    const at = { view: ROOT_VIEW_ID, x: 120, y: 80.5 }

    ben.guest.pointer(at)
    await settled()
    expect(seen.pointers).toEqual([['g1', at]])
    expect(cleo.told.pointers).toEqual([['g1', at]])
    // Nobody is told where they point themselves.
    expect(ben.told.pointers).toEqual([])

    host.pointer(at)
    ben.guest.pointer(undefined)
    await settled()
    expect(ben.told.pointers).toEqual([[HOST, at]])
    expect(cleo.told.pointers).toEqual([['g1', at], [HOST, at], ['g1', undefined]])
    expect(seen.pointers.at(-1)).toEqual(['g1', undefined])
  })

  it('takes a guest off the list, with their pointer, when they leave', async () => {
    const { host, seen, join } = hosting()
    const ben = await join('Ben')
    const cleo = await join('Cleo')
    ben.guest.leave()
    await settled()
    expect(host.people.map((person) => person.name)).toEqual(['Ada', 'Cleo'])
    expect(cleo.told.people.at(-1)!.map((person) => person.name)).toEqual(['Ada', 'Cleo'])
    expect(cleo.told.pointers.at(-1)).toEqual(['g1', undefined])
    expect(seen.pointers.at(-1)).toEqual(['g1', undefined])
    // Who leaves is not told that the session ended.
    expect(ben.told.ended).toEqual([])
    // The colour is free for the next one.
    expect((await join('Dana')).welcome.people.at(-1)).toEqual({ id: 'g3', name: 'Dana', colour: 'pink' })
  })

  it('tells the guests when the host stops sharing, and answers them like a workspace that is gone from then on', async () => {
    const { host, join } = hosting()
    const ben = await join('Ben')
    host.stop()
    await settled()
    expect(ben.told.ended).toEqual(['bye'])
    await expect(ben.guest.server.read(0)).rejects.toMatchObject({ status: 404 })
    expect(host.people.map((person) => person.name)).toEqual(['Ada'])
  })

  it('ends for a guest whose connection is lost, with what was on its way', async () => {
    const { log, join } = hosting()
    let answer: () => void = () => {}
    const slow = new Promise<void>((resolve) => (answer = resolve))
    const read = log.read.bind(log)
    log.read = async (after) => (await slow, read(after))
    const ben = await join('Ben')
    const asked = ben.guest.server.read(0)
    ben.hostLink.close()
    await expect(asked).rejects.toMatchObject({ status: 404 })
    expect(ben.told.ended).toEqual(['lost'])
    answer()
  })

  it('serves nobody who has not said who they are, and ignores what is no message', async () => {
    const { host, log, seen } = hosting()
    await log.append(0, [change('a', 'Shop')])
    const [theirs, mine] = pair()
    host.add('g1', mine)
    const got: unknown[] = []
    theirs.onMessage = (message) => got.push(message)
    theirs.send({ t: 'read', id: 1, after: 0 })
    theirs.send({ t: 'pointer', at: { view: 'landscape', x: 1, y: 1 } })
    theirs.send('nonsense')
    theirs.send({ t: 'hello', name: 'Ben' })
    theirs.send({ t: 'pointer', at: { view: 'landscape', x: 'left', y: 1 } })
    theirs.send({ t: 'drop', id: 2 })
    await settled()
    expect(got).toEqual([expect.objectContaining({ t: 'welcome' }), { t: 'answer', id: 2, status: 400 }])
    expect(seen.pointers).toEqual([])
    expect(host.people.map((person) => person.name)).toEqual(['Ada', 'Ben'])
  })

  it('tidies a name: no blanks at its ends, not endless, never empty', () => {
    expect(tidyName('  Ada   Lovelace ')).toBe('Ada Lovelace')
    expect(tidyName('x'.repeat(200))).toHaveLength(40)
    expect(tidyName('   ')).toBe('Guest')
    expect(tidyName(undefined)).toBe('Guest')
  })
})
