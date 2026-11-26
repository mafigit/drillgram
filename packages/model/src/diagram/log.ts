import type { WorkspaceEvent } from './events'
import { goTo, record, startHistory } from './history'
import type { History } from './history'
import { emptyWorkspace } from './workspace'

/**
 * One entry of a workspace's log as the server keeps it: the truth about the workspace. The
 * editor's history (the changes, and where in them the editor is) is what the entries add up
 * to, in order (`replay`).
 *
 * `id` is made by whoever writes the entry: by it the writer knows its own entry again when the
 * server gives it back, also after a request whose answer got lost.
 */
export type LogEntry =
  /** A change, with the time it was made at. */
  | { id: string; type: 'change'; at: string; event: WorkspaceEvent }
  /** The editor went to the workspace as it was after `position` changes: undo, redo, the timeline. */
  | { id: string; type: 'wentTo'; position: number }
  /** Everything before was deleted: the workspace starts again, empty. Written by the server. */
  | { id?: string; type: 'cleared' }

/**
 * A change applied to a history, and the entry that says it. No entry for a change that changes
 * nothing: the history is the one given.
 */
export function changeEntry(history: History, event: WorkspaceEvent, at: string, id: string): { history: History; entry?: LogEntry } {
  const next = record(history, event, at)
  return next === history ? { history } : { history: next, entry: { id, type: 'change', at, event } }
}

/** A history at another place of its log, and the entry that says where. No entry when it is there already. */
export function moveEntry(history: History, position: number, id: string): { history: History; entry?: LogEntry } {
  const next = goTo(history, position)
  return next === history ? { history } : { history: next, entry: { id, type: 'wentTo', position: next.cursor } }
}

/**
 * The history that entries add up to, from an empty workspace or from the history given. What
 * is no entry this version knows is passed over, and so is a change that cannot be applied: a
 * log that a later version wrote, or that holds one broken entry, still opens.
 */
export function replay(entries: readonly unknown[], from: History = startHistory(emptyWorkspace())): History {
  let history = from
  for (const entry of entries) {
    if (!isObject(entry)) continue
    if (entry.type === 'cleared') history = startHistory(emptyWorkspace())
    else if (entry.type === 'wentTo' && typeof entry.position === 'number') history = goTo(history, entry.position)
    else if (entry.type === 'change' && typeof entry.at === 'string' && isObject(entry.event) && typeof entry.event.type === 'string') {
      try {
        history = record(history, entry.event as WorkspaceEvent, entry.at)
      } catch {
        // An event this version cannot apply.
      }
    }
  }
  return history
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
