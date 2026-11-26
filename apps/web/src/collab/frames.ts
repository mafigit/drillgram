// A connection between two browsers takes messages of a few thousand bytes for sure, and a
// change log can be megabytes. A message goes as frames, each small enough: all but the last
// begin with "+", the last one with ".". The connection keeps their order.

/** Characters of a frame. One character can be three bytes on the wire: well under 16 KiB either way. */
export const FRAME = 4000

const HIGH_SURROGATE = (code: number) => code >= 0xd800 && code <= 0xdbff

/** A message as the frames that carry it. */
export function frames(text: string, size = FRAME): string[] {
  const made: string[] = []
  let from = 0
  while (text.length - from > size) {
    // Never between the two halves of one character: half a character does not travel.
    const to = from + size - (HIGH_SURROGATE(text.charCodeAt(from + size - 1)) ? 1 : 0)
    made.push(`+${text.slice(from, to)}`)
    from = to
  }
  made.push(`.${text.slice(from)}`)
  return made
}

/** No message of a session is longer: a change log of a thousand large changes is far below. */
export const MAX_MESSAGE = 64_000_000

/**
 * Takes frames as they arrive; gives a message back with its last frame. A message that grows
 * beyond `max` is dropped whole: nobody at the other end can fill this browser's memory.
 */
export function joiner(max = MAX_MESSAGE): (frame: string) => string | undefined {
  let parts: string[] = []
  let length = 0
  return (frame) => {
    length += frame.length - 1
    if (length <= max) parts.push(frame.slice(1))
    if (frame[0] !== '.') return undefined
    const text = length <= max ? parts.join('') : undefined
    parts = []
    length = 0
    return text
  }
}
