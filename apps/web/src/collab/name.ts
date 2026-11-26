import { tidyName } from './session'

// The name somebody goes by in a shared session. It is typed once and belongs to the browser,
// like the theme: the next session starts with it.

export const NAME_KEY = 'drillgram.name'

/** The name this browser was given; none before the first session. */
export function keptName(storage: Storage = window.localStorage): string {
  return storage.getItem(NAME_KEY) ?? ''
}

/** Keeps a name for the next session, and gives it back as it is shown. */
export function keepName(typed: string, storage: Storage = window.localStorage): string {
  const name = tidyName(typed)
  storage.setItem(NAME_KEY, name)
  return name
}
