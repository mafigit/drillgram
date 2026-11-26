import { changeEntry, emptyWorkspace, moveEntry, replay, startHistory } from '@drillgram/model'
import type { History, LogEntry, WorkspaceEvent } from '@drillgram/model'

/** An entry as the server gives it back, with its number in the log. */
export interface ServerEntry {
  seq: number
  entry: LogEntry
}

/** The log of one workspace on the server. A request that fails throws; `{ status }` when the server refused it. */
export interface LogServer {
  /** The entries after the one numbered `after`, and the number of the newest. */
  read(after: number): Promise<{ head: number; entries: ServerEntry[] }>
  /** Appends after the entry numbered `after`; not ok when the log has newer entries. */
  append(after: number, entries: LogEntry[]): Promise<{ ok: boolean; head: number }>
  /** Deletes every entry; the log goes on after an entry that says so. */
  clear(): Promise<{ head: number }>
}

/** Where entries wait that the server does not have yet: somewhere a reload finds them. */
export interface Outbox {
  load(): { after: number; entries: LogEntry[] } | undefined
  /** `after`: the newest entry of the server these come after. No entries: nothing waits. */
  save(after: number, entries: LogEntry[]): void
}

/**
 * What the editor has to tell its user about the log:
 * - `offline`: the server does not answer; it is tried again. `online`: it answers again.
 * - `conflict`: somebody else changed the workspace first; the editor shows theirs, and the
 *   changes of this browser that were not written are gone.
 * - `signedOut`: the session is over; what is not written waits for the next sign-in.
 * - `readOnly`: this user may not change the workspace; the change was taken back.
 * - `gone`: the workspace is not there any more.
 */
export type Problem = 'offline' | 'online' | 'conflict' | 'signedOut' | 'readOnly' | 'gone'

export interface LogDeps {
  server: LogServer
  outbox: Outbox
  onHistory: (history: History) => void
  onProblem: (problem: Problem) => void
  /** An id for a new entry, one of a kind. */
  newId: () => string
  /** Waits before a request is tried again. */
  wait: (milliseconds: number) => Promise<void>
}

/** The server takes this many entries in one request. */
const MAX_BATCH = 500

/**
 * The change log of the open workspace: the server's is the truth, and the editor works on a
 * history made from it. A change shows at once and is then written to the server, in order,
 * one request at a time. What is not written yet waits in the outbox, so a reload loses nothing.
 */
export class WorkspaceLog {
  history: History
  onHistory: (history: History) => void
  /** The number of the newest entry the server is known to have. */
  private head: number
  /** Entries the server does not have yet, in order. */
  private pending: LogEntry[] = []
  private busy = false
  /** No more writing: the session is over or the workspace is gone. */
  private stopped = false
  private waiting: (() => void)[] = []

  private constructor(
    private deps: LogDeps,
    head: number,
    history: History,
  ) {
    this.head = head
    this.history = history
    this.onHistory = deps.onHistory
  }

  /** Reads the server's log and takes up what a reload left unwritten. */
  static async open(deps: LogDeps): Promise<WorkspaceLog> {
    const { head, entries } = await deps.server.read(0)
    const log = new WorkspaceLog(deps, head, replay(entries.map((kept) => kept.entry)))
    const left = deps.outbox.load()
    if (left) {
      const mine = new Set(left.entries.map((entry) => entry.id))
      const since = entries.filter((kept) => kept.seq > left.after)
      if (since.some((kept) => !mine.has(kept.entry.id))) {
        // Somebody else went on from where these entries began: they do not fit any more.
        deps.outbox.save(head, [])
        deps.onProblem('conflict')
      } else {
        const arrived = new Set(since.map((kept) => kept.entry.id))
        log.pending = left.entries.filter((entry) => !arrived.has(entry.id))
        log.history = replay(log.pending, log.history)
        log.keep()
        void log.flush()
      }
    }
    return log
  }

  /** Makes a change: shown at once, then written. */
  dispatch(event: WorkspaceEvent, at: string): void {
    this.took(changeEntry(this.history, event, at, this.deps.newId()))
  }

  /** Goes to the workspace as it was after `position` changes. */
  goTo(position: number): void {
    const { history, entry } = moveEntry(this.history, position, this.deps.newId())
    // A walk along the timeline: only where it ends is worth writing. A place that is on its
    // way to the server gets there all the same.
    if (entry && this.pending.at(-1)?.type === 'wentTo') this.pending.pop()
    this.took({ history, entry })
  }

  /**
   * Brings a history from elsewhere into this workspace, which is empty: where it began, every
   * change with the time it was made at, and the place the editor was at.
   */
  bring(from: History): void {
    const { model } = from.base
    if (model.objects.length > 0 || model.connections.length > 0) {
      this.dispatch({ type: 'workspaceBrought', workspace: from.base }, from.log[0]?.at ?? new Date().toISOString())
    }
    for (const logged of from.log) this.dispatch(logged.event, logged.at)
    this.goTo(this.history.log.length - (from.log.length - from.cursor))
  }

  private took({ history, entry }: { history: History; entry?: LogEntry }): void {
    if (!entry) return
    this.history = history
    this.pending.push(entry)
    this.keep()
    this.onHistory(history)
    void this.flush()
  }

  /** Deletes the workspace's log on the server: an empty workspace, nothing to undo. */
  async clear(): Promise<void> {
    this.pending = []
    this.keep()
    const { head } = await this.deps.server.clear()
    // What was on its way when the log was cleared is refused or gone with it.
    this.pending = []
    this.head = head
    this.keep()
    this.history = startHistory(emptyWorkspace())
    this.onHistory(this.history)
  }

  /** Resolves when nothing waits to be written, or writing has stopped. */
  settled(): Promise<void> {
    if (!this.busy) return Promise.resolve()
    return new Promise((resolve) => this.waiting.push(resolve))
  }

  private keep(): void {
    this.deps.outbox.save(this.head, this.pending)
  }

  private async flush(): Promise<void> {
    if (this.busy || this.stopped) return
    this.busy = true
    let failures = 0
    while (this.pending.length > 0 && !this.stopped) {
      const batch = this.pending.slice(0, MAX_BATCH)
      try {
        const answer = await this.deps.server.append(this.head, batch)
        if (failures > 0) this.deps.onProblem('online')
        failures = 0
        if (answer.ok) this.wrote(batch, answer.head)
        else await this.catchUp()
      } catch (failure) {
        const status = statusOf(failure)
        if (status === 401) this.stop('signedOut')
        else if (status === 404) this.stop('gone')
        else if (status === 403) await this.takeBack()
        else {
          // The server did not answer, or not as a server that is well: once more, later.
          if (failures++ === 0) this.deps.onProblem('offline')
          await this.deps.wait(Math.min(1000 * 2 ** (failures - 1), 15_000))
        }
      }
    }
    this.busy = false
    for (const resolve of this.waiting.splice(0)) resolve()
  }

  /** The entries of a request are in the server's log; `clear` may have emptied the list meanwhile. */
  private wrote(batch: LogEntry[], head: number): void {
    const written = new Set(batch.map((entry) => entry.id))
    this.pending = this.pending.filter((entry) => !written.has(entry.id))
    this.head = Math.max(this.head, head)
    this.keep()
  }

  /** The log has entries this browser has not seen. Its own, from a request whose answer got lost? Then on. */
  private async catchUp(): Promise<void> {
    const { head, entries } = await this.deps.server.read(this.head)
    const mine = new Set(this.pending.map((entry) => entry.id))
    if (entries.every((kept) => mine.has(kept.entry.id))) {
      this.wrote(entries.map((kept) => kept.entry), head)
      this.head = head
      this.keep()
      return
    }
    // Somebody else was first: theirs is the workspace now.
    await this.reload()
    this.deps.onProblem('conflict')
  }

  private async takeBack(): Promise<void> {
    await this.reload()
    this.deps.onProblem('readOnly')
  }

  /** The workspace as the server has it; what was not written is dropped. */
  private async reload(): Promise<void> {
    const { head, entries } = await this.deps.server.read(0)
    this.pending = []
    this.head = head
    this.keep()
    this.history = replay(entries.map((kept) => kept.entry))
    this.onHistory(this.history)
  }

  private stop(problem: Problem): void {
    this.stopped = true
    this.deps.onProblem(problem)
  }
}

function statusOf(failure: unknown): number | undefined {
  const status = typeof failure === 'object' && failure !== null ? (failure as { status?: unknown }).status : undefined
  return typeof status === 'number' ? status : undefined
}
