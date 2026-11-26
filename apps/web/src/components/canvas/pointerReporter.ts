/**
 * Says where this browser's pointer is, at most once per `every` ms: a move at once, the last
 * place of a quick burst after the interval. A move still held when the pointer leaves is
 * dropped, so the others never see it come back to where it was (J19).
 */
export function pointerReporter<At>(say: (at: At | undefined) => void, every = 50) {
  let last = -Infinity
  let held: { at: At; timer: ReturnType<typeof setTimeout> } | undefined
  return {
    move(at: At) {
      if (held) {
        held.at = at
        return
      }
      const since = Date.now() - last
      if (since >= every) {
        last = Date.now()
        say(at)
        return
      }
      const entry = {
        at,
        timer: setTimeout(() => {
          held = undefined
          last = Date.now()
          say(entry.at)
        }, every - since),
      }
      held = entry
    },
    leave() {
      if (held) clearTimeout(held.timer)
      held = undefined
      say(undefined)
    },
  }
}
