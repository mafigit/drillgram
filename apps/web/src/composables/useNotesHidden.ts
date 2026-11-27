import { ref, watch } from 'vue'
import type { Ref } from 'vue'

const KEY = 'drillgram.notesHidden'

/** Whether sticky notes are hidden (J69). Kept in this browser alone, for every workspace. */
export function useNotesHidden(): Ref<boolean> {
  let kept = false
  try {
    kept = window.localStorage.getItem(KEY) === '1'
  } catch {
    // No storage (a private window): hidden as long as the page lasts.
  }
  const hidden = ref(kept)
  watch(hidden, (now) => {
    try {
      if (now) window.localStorage.setItem(KEY, '1')
      else window.localStorage.removeItem(KEY)
    } catch {
      // As above.
    }
  }, { flush: 'sync' })
  return hidden
}
