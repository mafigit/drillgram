import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pointerReporter } from '../pointerReporter'

type At = { x: number; y: number }

describe('pointerReporter', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('says a move at once, then at most once per interval, the last place of a burst after it', () => {
    const said: (At | undefined)[] = []
    const report = pointerReporter<At>((at) => said.push(at), 50)
    report.move({ x: 1, y: 1 })
    report.move({ x: 2, y: 2 })
    report.move({ x: 3, y: 3 })
    expect(said).toEqual([{ x: 1, y: 1 }])
    vi.advanceTimersByTime(50)
    expect(said).toEqual([{ x: 1, y: 1 }, { x: 3, y: 3 }])
  })

  it('says nothing of the canvas after the pointer left it (J19: a pointer that stayed behind)', () => {
    const said: (At | undefined)[] = []
    const report = pointerReporter<At>((at) => said.push(at), 50)
    report.move({ x: 1, y: 1 })
    report.move({ x: 2, y: 2 })
    report.leave()
    vi.advanceTimersByTime(200)
    expect(said.at(-1)).toBeUndefined()
  })

  it('says a move again once the pointer is back', () => {
    const said: (At | undefined)[] = []
    const report = pointerReporter<At>((at) => said.push(at), 50)
    report.move({ x: 1, y: 1 })
    report.leave()
    report.move({ x: 4, y: 4 })
    vi.advanceTimersByTime(50)
    expect(said.at(-1)).toEqual({ x: 4, y: 4 })
  })
})
