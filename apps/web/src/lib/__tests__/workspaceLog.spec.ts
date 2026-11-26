import { describe, it, expect } from 'vitest'
import { ROOT_VIEW_ID, emptyWorkspace, goTo, record, startHistory } from '@drillgram/model'
import type { LogEntry, WorkspaceEvent } from '@drillgram/model'
import { WorkspaceLog } from '../workspaceLog'
import type { LogServer, Problem, ServerEntry } from '../workspaceLog'

const add = (name: string): WorkspaceEvent => ({ type: 'objectAdded', view: ROOT_VIEW_ID, kind: 'softwareSystem', name })
const AT = '2026-01-01T09:00:00.000Z'

/** A server's log of one workspace, in memory, that can be made slow, deaf or busy with somebody else. */
class FakeServer implements LogServer {
  entries: ServerEntry[] = []
  head = 0
  appends: { after: number; entries: LogEntry[] }[] = []
  /** What the next appends do instead of answering: thrown. */
  failures: unknown[] = []
  /** When set, an append waits for it. */
  gate: Promise<void> | undefined
  /** Appends reach the log, but their answers get lost. */
  loseAnswers = false

  async read(after: number) {
    return { head: this.head, entries: this.entries.filter((entry) => entry.seq > after) }
  }

  async append(after: number, entries: LogEntry[]) {
    this.appends.push({ after, entries })
    // A request is never answered in the same breath.
    await Promise.resolve()
    if (this.gate) await this.gate
    const failure = this.failures.shift()
    if (failure !== undefined) throw failure
    if (after !== this.head) return { ok: false as const, head: this.head }
    this.write(entries)
    if (this.loseAnswers) throw new TypeError('Failed to fetch')
    return { ok: true as const, head: this.head }
  }

  async clear() {
    this.entries = []
    this.write([{ type: 'cleared' }])
    return { head: this.head }
  }

  /** Somebody (this browser or another) wrote entries. */
  write(entries: LogEntry[]) {
    for (const entry of entries) this.entries.push({ seq: ++this.head, entry })
  }
}

class FakeOutbox {
  kept: { after: number; entries: LogEntry[] } | undefined
  load = () => this.kept
  save = (after: number, entries: LogEntry[]) => {
    this.kept = entries.length > 0 ? { after, entries: [...entries] } : undefined
  }
}

async function open(server = new FakeServer(), outbox = new FakeOutbox()) {
  const problems: Problem[] = []
  let made = 0
  const log = await WorkspaceLog.open({
    server,
    outbox,
    onHistory: () => {},
    onProblem: (problem) => problems.push(problem),
    newId: () => `local-${++made}`,
    wait: async () => {},
  })
  const names = () => log.history.states[log.history.cursor]!.model.objects.map((o) => o.name)
  return { log, server, outbox, problems, names }
}

describe('WorkspaceLog', () => {
  it('opens a workspace as the server\'s log says it is', async () => {
    const server = new FakeServer()
    server.write([
      { id: 'a', type: 'change', at: AT, event: add('Shop') },
      { id: 'b', type: 'change', at: AT, event: add('Bank') },
      { id: 'c', type: 'wentTo', position: 1 },
    ])
    const { log, names } = await open(server)
    expect(names()).toEqual(['Shop'])
    expect(log.history.log).toHaveLength(2)
  })

  it('shows a change at once and then writes it to the server', async () => {
    const { log, server, names } = await open()
    let seen = 0
    log.onHistory = () => seen++

    log.dispatch(add('Shop'), AT)
    expect(names()).toEqual(['Shop'])
    expect(seen).toBe(1)
    expect(server.entries).toEqual([])

    await log.settled()
    expect(server.entries).toEqual([{ seq: 1, entry: { id: 'local-1', type: 'change', at: AT, event: add('Shop') } }])
  })

  it('writes nothing for a change that changes nothing', async () => {
    const { log, server } = await open()
    log.dispatch(add(' '), AT)
    log.goTo(0)
    await log.settled()
    expect(server.appends).toEqual([])
  })

  it('sends what was changed while a request was on its way in one go, in order', async () => {
    const { log, server, names } = await open()
    let release = () => {}
    server.gate = new Promise((resolve) => (release = resolve))

    log.dispatch(add('Shop'), AT)
    log.dispatch(add('Bank'), AT)
    log.dispatch(add('Mail'), AT)
    release()
    await log.settled()

    expect(server.appends.map((sent) => [sent.after, sent.entries.length])).toEqual([[0, 1], [1, 2]])
    expect(names()).toEqual(['Shop', 'Bank', 'Mail'])
    expect((await open(server)).names()).toEqual(['Shop', 'Bank', 'Mail'])
  })

  it('writes undo, redo and the place on the timeline, so a reload finds the editor where it was', async () => {
    const { log, server, names } = await open()
    log.dispatch(add('Shop'), AT)
    log.dispatch(add('Bank'), AT)
    log.goTo(1)
    await log.settled()
    expect(names()).toEqual(['Shop'])

    const again = await open(server)
    expect(again.names()).toEqual(['Shop'])
    again.log.goTo(2)
    expect(again.names()).toEqual(['Shop', 'Bank'])
  })

  it('writes only the last place of a walk along the timeline', async () => {
    const { log, server } = await open()
    for (const name of ['A', 'B', 'C', 'D']) log.dispatch(add(name), AT)
    await log.settled()
    let release = () => {}
    server.gate = new Promise((resolve) => (release = resolve))

    log.goTo(3) // on its way
    log.goTo(2)
    log.goTo(1)
    log.goTo(0)
    release()
    await log.settled()

    const places = server.entries.map((kept) => kept.entry).filter((entry) => entry.type === 'wentTo')
    expect(places.map((entry) => entry.position)).toEqual([3, 0])
  })

  it('keeps what is not written yet where a reload finds it, and takes it away once it is written', async () => {
    const { log, server, outbox } = await open()
    let release = () => {}
    server.gate = new Promise((resolve) => (release = resolve))

    log.dispatch(add('Shop'), AT)
    expect(outbox.kept).toEqual({ after: 0, entries: [{ id: 'local-1', type: 'change', at: AT, event: add('Shop') }] })
    release()
    await log.settled()
    expect(outbox.kept).toBeUndefined()
  })

  it('writes what a reload interrupted when the workspace opens again', async () => {
    const server = new FakeServer()
    const outbox = new FakeOutbox()
    outbox.kept = { after: 0, entries: [{ id: 'before-reload', type: 'change', at: AT, event: add('Shop') }] }

    const { log, names } = await open(server, outbox)
    expect(names()).toEqual(['Shop'])
    await log.settled()
    expect(server.entries.map((kept) => kept.entry.id)).toEqual(['before-reload'])
    expect(outbox.kept).toBeUndefined()
  })

  it('does not write a second time what reached the server before the reload', async () => {
    const server = new FakeServer()
    const sent: LogEntry = { id: 'before-reload', type: 'change', at: AT, event: add('Shop') }
    const notSent: LogEntry = { id: 'later', type: 'change', at: AT, event: add('Bank') }
    server.write([sent])
    const outbox = new FakeOutbox()
    outbox.kept = { after: 0, entries: [sent, notSent] }

    const { log, names } = await open(server, outbox)
    await log.settled()
    expect(names()).toEqual(['Shop', 'Bank'])
    expect(server.entries.map((kept) => kept.entry.id)).toEqual(['before-reload', 'later'])
  })

  it('drops what a reload interrupted when somebody else has changed the workspace since', async () => {
    const server = new FakeServer()
    server.write([{ id: 'theirs', type: 'change', at: AT, event: add('Theirs') }])
    const outbox = new FakeOutbox()
    outbox.kept = { after: 0, entries: [{ id: 'mine', type: 'change', at: AT, event: add('Mine') }] }

    const { log, names, problems } = await open(server, outbox)
    await log.settled()
    expect(names()).toEqual(['Theirs'])
    expect(problems).toEqual(['conflict'])
    expect(outbox.kept).toBeUndefined()
    expect(server.entries).toHaveLength(1)
  })

  it('goes on after an answer that got lost, without writing the change twice', async () => {
    const { log, server, names, problems } = await open()
    server.loseAnswers = true
    log.dispatch(add('Shop'), AT)
    // The next try is refused: the log has moved on, by this browser's own entry.
    await expect.poll(() => server.appends.length).toBeGreaterThanOrEqual(2)
    server.loseAnswers = false
    log.dispatch(add('Bank'), AT)
    await log.settled()

    expect(server.entries.map((kept) => kept.entry.id)).toEqual(['local-1', 'local-2'])
    expect(names()).toEqual(['Shop', 'Bank'])
    expect(problems).not.toContain('conflict')
  })

  it('tries again while the server does not answer, says so once, and says when it is back', async () => {
    const { log, server, names, problems } = await open()
    server.failures = [new TypeError('Failed to fetch'), new TypeError('Failed to fetch'), { status: 502 }]

    log.dispatch(add('Shop'), AT)
    await log.settled()

    expect(server.appends).toHaveLength(4)
    expect(server.entries).toHaveLength(1)
    expect(names()).toEqual(['Shop'])
    expect(problems).toEqual(['offline', 'online'])
  })

  it('takes the server\'s workspace when somebody else changed it first, and says so', async () => {
    const { log, server, names, problems, outbox } = await open()
    log.dispatch(add('Shop'), AT)
    await log.settled()

    // Another tab, or another person.
    server.write([{ id: 'theirs', type: 'change', at: AT, event: add('Theirs') }])
    let seen = 0
    log.onHistory = () => seen++
    log.dispatch(add('Mine'), AT)
    expect(names()).toEqual(['Shop', 'Mine'])
    await log.settled()

    expect(names()).toEqual(['Shop', 'Theirs'])
    expect(problems).toEqual(['conflict'])
    expect(seen).toBe(2)
    expect(outbox.kept).toBeUndefined()
    // And goes on from there.
    log.dispatch(add('Again'), AT)
    await log.settled()
    expect(server.entries.map((kept) => kept.entry.id)).toEqual(['local-1', 'theirs', 'local-3'])
  })

  it('stops writing when the session is over, and keeps what is not written for after the sign-in', async () => {
    const { log, server, problems, outbox } = await open()
    server.failures = [{ status: 401 }]
    log.dispatch(add('Shop'), AT)
    await log.settled()

    expect(problems).toEqual(['signedOut'])
    expect(server.appends).toHaveLength(1)
    expect(outbox.kept?.entries).toHaveLength(1)
  })

  it('takes a change back that this user may not make', async () => {
    const { log, server, names, problems, outbox } = await open()
    server.failures = [{ status: 403 }]
    log.dispatch(add('Shop'), AT)
    expect(names()).toEqual(['Shop'])
    await log.settled()

    expect(names()).toEqual([])
    expect(problems).toEqual(['readOnly'])
    expect(outbox.kept).toBeUndefined()
  })

  it('says when the workspace is gone', async () => {
    const { log, server, problems } = await open()
    server.failures = [{ status: 404 }]
    log.dispatch(add('Shop'), AT)
    await log.settled()
    expect(problems).toEqual(['gone'])
  })

  it('clears the workspace on the server, with what was not written yet', async () => {
    const { log, server, names, outbox } = await open()
    log.dispatch(add('Shop'), AT)
    await log.settled()
    let release = () => {}
    server.gate = new Promise((resolve) => (release = resolve))
    log.dispatch(add('Bank'), AT)

    const cleared = log.clear()
    release()
    await cleared
    await log.settled()

    expect(names()).toEqual([])
    expect(log.history.log).toEqual([])
    expect(outbox.kept).toBeUndefined()
    expect((await open(server)).names()).toEqual([])
    // And goes on.
    server.gate = undefined
    log.dispatch(add('New'), AT)
    await log.settled()
    expect((await open(server)).names()).toEqual(['New'])
  })

  it('brings a workspace a browser kept, with its changes, their times and the place the editor was at', async () => {
    const { log, server, names } = await open()
    let local = startHistory({ ...emptyWorkspace() })
    local = record(local, add('Shop'), '2025-12-24T18:00:00.000Z')
    local = record(local, add('Bank'), '2025-12-25T10:00:00.000Z')
    local = goTo(local, 1)

    log.bring(local)
    expect(names()).toEqual(['Shop'])
    await log.settled()

    const again = await open(server)
    expect(again.names()).toEqual(['Shop'])
    expect(again.log.history.log.map((logged) => logged.at)).toEqual(['2025-12-24T18:00:00.000Z', '2025-12-25T10:00:00.000Z'])
    again.log.goTo(2)
    expect(again.names()).toEqual(['Shop', 'Bank'])
  })

  it('brings a workspace whose change log does not reach back to its beginning', async () => {
    const { log, server, names } = await open()
    // The oldest changes are part of the base by now.
    const base = record(startHistory(emptyWorkspace()), add('Old'), AT).states[1]!
    const local = record(startHistory(base), add('New'), AT)

    log.bring(local)
    await log.settled()

    const again = await open(server)
    expect(again.names()).toEqual(['Old', 'New'])
    again.log.goTo(1)
    expect(again.names()).toEqual(['Old'])
  })

  it('sends a long backlog in pieces the server takes', async () => {
    const { log, server } = await open()
    let release = () => {}
    server.gate = new Promise((resolve) => (release = resolve))
    for (let i = 0; i < 1201; i++) log.dispatch(add(`S${i}`), AT)
    release()
    await log.settled()
    expect(server.appends.map((sent) => sent.entries.length)).toEqual([1, 500, 500, 200])
    expect(server.entries).toHaveLength(1201)
  })
})
