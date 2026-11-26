import { describe, expect, it } from 'vitest'
import { FRAME, frames, joiner } from '../frames'

const through = (text: string, size?: number) => {
  const join = joiner()
  return frames(text, size).map(join)
}

describe('frames', () => {
  it('sends a short message as one frame', () => {
    expect(frames('{"t":"hello"}')).toEqual(['.{"t":"hello"}'])
    expect(through('{"t":"hello"}')).toEqual(['{"t":"hello"}'])
  })

  it('cuts a long message into frames no longer than a connection takes, and puts it together again', () => {
    const text = JSON.stringify(Array.from({ length: 3000 }, (_, i) => ({ seq: i, name: `Card ${i}` })))
    const made = frames(text)
    expect(made.length).toBeGreaterThan(10)
    for (const frame of made) expect(frame.length).toBeLessThanOrEqual(FRAME + 1)
    const got = through(text)
    expect(got.slice(0, -1).every((part) => part === undefined)).toBe(true)
    expect(got.at(-1)).toBe(text)
  })

  it('never cuts a character in two', () => {
    // Every character here is two halves; whatever the size, a frame holds whole ones.
    const text = '🙂'.repeat(50)
    for (const size of [3, 4, 5, 7, 16]) {
      const made = frames(text, size)
      for (const frame of made) expect(frame.slice(1), `size ${size}`).toMatch(/^(🙂)*$/u)
      expect(through(text, size).at(-1)).toBe(text)
    }
  })

  it('drops a message that is longer than any of a session, and takes the next one', () => {
    const join = joiner(10)
    expect(frames('a'.repeat(25), 4).map(join).every((got) => got === undefined)).toBe(true)
    expect(frames('short', 4).map(join).at(-1)).toBe('short')
  })

  it('takes an empty message, and one message after another', () => {
    expect(through('')).toEqual([''])
    const join = joiner()
    expect([...frames('abcdef', 4), ...frames('gh', 4)].map(join)).toEqual([undefined, 'abcdef', 'gh'])
  })
})
