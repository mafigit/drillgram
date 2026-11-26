import { computed, ref } from 'vue'
import { SHAPE_LIBRARIES } from './kinds'
import type { FoundShape } from './kinds'

// The shapes picked last, in "Add shape" or the quick menu: the quick menu offers them. Kept in
// the browser by library and name, so a shape a library no longer has drops out.
const KEY = 'drillgram.recentShapes'
const KEEP = 6

interface Picked {
  library: string
  label: string
}

function stored(): Picked[] {
  try {
    const kept: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(kept) ? kept.filter((p): p is Picked => typeof p?.library === 'string' && typeof p?.label === 'string') : []
  } catch {
    return []
  }
}

const picked = ref(stored())

/** The shapes picked last, the latest first: at most six. */
export const recentShapes = computed(() =>
  picked.value.flatMap(({ library, label }): FoundShape[] => {
    const shape = SHAPE_LIBRARIES.find((l) => l.name === library)?.shapes.find((s) => s.label === label)
    return shape ? [{ ...shape, library }] : []
  }),
)

export function rememberShape({ library, label }: Picked) {
  picked.value = [{ library, label }, ...picked.value.filter((p) => p.library !== library || p.label !== label)].slice(0, KEEP)
  try {
    window.localStorage.setItem(KEY, JSON.stringify(picked.value))
  } catch {
    // Private windows may refuse: the shapes are then forgotten with the page.
  }
}
