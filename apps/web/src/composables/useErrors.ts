import { readonly, ref } from 'vue'

// What went wrong is said on a card in the top right corner (components/ErrorCards.vue), as
// other apps do it: over the page, so it is seen wherever the eye is, and gone by itself.
// One list for the whole app: anything may say that something failed.

export interface ErrorCard {
  id: number
  text: string
}

/** How long a card stays when nobody closes it, in ms. Long enough to read two lines. */
export const ERROR_STAYS = 8000
/** More cards than this are not read: the oldest makes room. */
const MOST = 4

const errors = ref<ErrorCard[]>([])
const timers = new Map<number, ReturnType<typeof setTimeout>>()
let next = 1

/** Close a card. */
export function dismissError(id: number): void {
  clearTimeout(timers.get(id))
  timers.delete(id)
  errors.value = errors.value.filter((card) => card.id !== id)
}

/** Say that something went wrong. The same words are on one card only, which then stays longer. */
export function showError(text: string): void {
  const same = errors.value.find((card) => card.text === text)
  const card = same ?? { id: next++, text }
  if (!same) errors.value = [...errors.value, card]
  clearTimeout(timers.get(card.id))
  timers.set(card.id, setTimeout(() => dismissError(card.id), ERROR_STAYS))
  for (const old of errors.value.slice(0, -MOST)) dismissError(old.id)
}

/** Close every card: what they were about is no longer so. */
export function clearErrors(): void {
  for (const card of errors.value) dismissError(card.id)
}

export function useErrors() {
  return { errors: readonly(errors), dismiss: dismissError }
}
