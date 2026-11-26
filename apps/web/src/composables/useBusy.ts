import { ref } from 'vue'

/**
 * One press, one piece of work (docs/agents/design.md): `busy` is true while the work runs, for
 * the button's spinner, `disabled` and `aria-busy`; a second press while it runs does nothing.
 */
export function useBusy() {
  const busy = ref(false)
  async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
    if (busy.value) return undefined
    busy.value = true
    try {
      return await work()
    } finally {
      busy.value = false
    }
  }
  return { busy, run }
}
