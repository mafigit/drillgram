import type { LogEntry } from '@drillgram/model'
import type { Outbox } from './workspaceLog'

/** Where the entries of a workspace wait that the server does not have yet. */
export const outboxKey = (workspaceId: string) => `drillgram.outbox.${workspaceId}`

/**
 * The outbox of a workspace in the browser's storage: what it holds is still there after a
 * reload, so a change made a moment before is not lost.
 */
export function storedOutbox(workspaceId: string, storage: Storage = window.localStorage): Outbox {
  const key = outboxKey(workspaceId)
  return {
    load() {
      try {
        const kept = JSON.parse(storage.getItem(key) ?? 'null') as { after?: unknown; entries?: unknown } | null
        if (kept && typeof kept.after === 'number' && Array.isArray(kept.entries)) return { after: kept.after, entries: kept.entries as LogEntry[] }
      } catch {
        // Not what this wrote: nothing waits.
      }
      return undefined
    },
    save(after, entries) {
      if (entries.length === 0) return storage.removeItem(key)
      try {
        storage.setItem(key, JSON.stringify({ after, entries }))
      } catch {
        // The storage is full: the entries are still on their way, only a reload would lose them.
      }
    },
  }
}
