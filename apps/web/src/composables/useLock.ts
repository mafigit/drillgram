import { ref, watch } from 'vue'
import type { Ref } from 'vue'

const KEY = 'drillgram.locked.'

/**
 * Whether the editor is locked for a workspace (J66): it is looked at, not changed. Kept in
 * this browser alone; `of` names the workspace (its id, or the room of a shared one).
 */
export function useLock(of: string): Ref<boolean> {
  const key = KEY + of
  let kept = false
  try {
    kept = window.localStorage.getItem(key) === '1'
  } catch {
    // No storage (a private window): the lock lasts as long as the page.
  }
  const locked = ref(kept)
  watch(locked, (now) => {
    try {
      if (now) window.localStorage.setItem(key, '1')
      else window.localStorage.removeItem(key)
    } catch {
      // As above.
    }
  }, { flush: 'sync' })
  return locked
}
