import { parseHistory, parseWorkspace, serializeWorkspace, startHistory } from '@drillgram/model'
import type { History } from '@drillgram/model'

// Before the app had a server it kept its one workspace in the browser, under these keys. A
// browser that ran it then still has it: it can be brought into a workspace of the server
// (the editor offers that on an empty one). The app writes nothing here any more.
export const STORAGE_KEY = 'drillgram.workspace.v1'
export const HISTORY_KEY = 'drillgram.history.v1'
/** Set once the browser's workspace was brought into one of the server: the offer was taken. */
export const BROUGHT_KEY = 'drillgram.workspace.brought'

/**
 * The workspace this browser kept, with its change log where the log leads to it; none when
 * there is nothing worth bringing (nothing kept, nothing readable, or an empty workspace that
 * was never changed).
 */
export function localHistory(storage: Storage = window.localStorage): History | undefined {
  const saved = storage.getItem(STORAGE_KEY)
  if (saved === null) return undefined
  let history: History
  try {
    const workspace = parseWorkspace(saved)
    history = startHistory(workspace)
    const log = storage.getItem(HISTORY_KEY)
    if (log !== null) {
      try {
        const logged = parseHistory(log)
        // Another version of the app, or another tab, may have written a different workspace.
        if (serializeWorkspace(logged.states[logged.cursor]!) === serializeWorkspace(workspace)) history = logged
      } catch {
        // A broken log: the workspace alone.
      }
    }
  } catch {
    return undefined
  }
  const { model } = history.states[history.cursor]!
  const empty = model.objects.length === 0 && model.connections.length === 0 && history.log.length === 0
  return empty ? undefined : history
}
