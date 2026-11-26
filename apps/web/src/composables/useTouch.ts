import { readonly, shallowRef } from 'vue'
import type { Ref } from 'vue'
import { useEventListener } from '@vueuse/core'

/** Whether a media query matches, from the first render on (vueuse's waits for the mount). */
export function useMedia(query: string): Readonly<Ref<boolean>> {
  const list = typeof window.matchMedia === 'function' ? window.matchMedia(query) : undefined
  const matches = shallowRef(list?.matches ?? false)
  if (list) useEventListener(list, 'change', (event: MediaQueryListEvent) => (matches.value = event.matches))
  return readonly(matches)
}

/** The screen is worked with a finger (a phone, a tablet): there is no mouse to hover or right-click with, and no keyboard at hand. */
export const useTouch = () => useMedia('(pointer: coarse)')

/** A phone: narrower than Tailwind's `sm`. */
export const useNarrow = () => useMedia('(max-width: 639px)')
