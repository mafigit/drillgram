// The app had two names before this one and saved what it keeps in the browser under each:
// `ped.` (Product Engineer Designer) and, for a day, `drillplan.`. A browser that ran it then
// still has its diagrams, theme and settings under those names: they are taken over once, when
// the app starts.

/** The earlier names, the first one first: where both saved something, the later one counts. */
const FORMER = ['ped.', 'drillplan.']
const NOW = 'drillgram.'

/**
 * Moves everything saved under an earlier name of the app to its name of today. What is saved
 * under the name of today already stays; the old entries go either way. A storage that cannot be
 * read (blocked, private window) is left alone: the app then starts with nothing saved.
 */
export function adoptFormerKeys(storage: Storage = window.localStorage): void {
  try {
    const keys = Array.from({ length: storage.length }, (_, at) => storage.key(at)).filter((key): key is string => key !== null)
    // What was there under the name of today before this ran: that is never replaced.
    const kept = new Set(keys.filter((key) => key.startsWith(NOW)))
    for (const prefix of FORMER) {
      for (const key of keys.filter((found) => found.startsWith(prefix))) {
        const now = NOW + key.slice(prefix.length)
        const value = storage.getItem(key)
        if (value !== null && !kept.has(now)) storage.setItem(now, value)
        storage.removeItem(key)
      }
    }
  } catch {
    // Nothing to take over.
  }
}
