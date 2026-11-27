import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { BOX_SHAPES } from '@drillgram/model'
import type { Point } from '@drillgram/model'
import { boxShape } from '../shapes'
import { flatten, toOutlines } from '../outlineEnds'

const near = (a: Point, b: Point) => expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.05)

/** The shortest way from a point to a line drawn through points. */
function gap(point: Point, line: readonly Point[]): number {
  let best = Infinity
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1]!, line[i]!]
    const [dx, dy] = [b.x - a.x, b.y - a.y]
    const length = dx * dx + dy * dy
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length))
    best = Math.min(best, Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)))
  }
  return best
}

describe('a connector at a card with a shape', () => {
  // The outline is drawn half a pixel inside the card, for a box one pixel smaller (ObjectNode.vue).
  const diamond = { x: 100, y: 100, width: 201, height: 101, shape: 'diamond' as const }
  const box = { x: 500, y: 100, width: 200, height: 100 }

  it('ends at its outline: on the slanted side of a diamond, coming the way it came', () => {
    // From below, a quarter across: the diamond's side is halfway down there.
    const route = [box, { x: 150.5, y: 300 }, { x: 150.5, y: 201 }].map(({ x, y }) => ({ x, y }))
    const ends = toOutlines(route, box, diamond)
    near(ends.at(-1)!, { x: 150.5, y: 175.5 })
    expect(ends.slice(0, -1)).toEqual(route.slice(0, -1))
  })

  it('starts at its outline too', () => {
    const route = [{ x: 301, y: 125.5 }, { x: 500, y: 125.5 }]
    const ends = toOutlines(route, diamond, box)
    near(ends[0]!, { x: 250.5, y: 125.5 })
    expect(ends[1]).toEqual(route[1])
  })

  it('stops at the round lower side of a speech bubble, above the corner of its tail', () => {
    const bubble = { x: 0, y: 0, width: 201, height: 101, shape: 'speechBubble' as const }
    const ends = toOutlines([{ x: 100.5, y: 300 }, { x: 100.5, y: 101 }], box, bubble)
    near(ends[1]!, { x: 100.5, y: 0.5 + 100 * 0.85 })
  })

  it('leaves a card without a shape, and a table, as they are', () => {
    const route = [{ x: 200, y: 200 }, { x: 200, y: 400 }]
    const table = { x: 100, y: 400, width: 200, height: 100, shape: 'table' as const }
    expect(toOutlines(route, { x: 100, y: 100, width: 200, height: 100 }, table)).toEqual(route)
  })

  it('of any shape and size, wherever it meets the card, ends on the outline, inside the card and still upright or level', () => {
    const sides = ['top', 'right', 'bottom', 'left'] as const
    fc.assert(
      fc.property(
        fc.constantFrom(...BOX_SHAPES),
        fc.integer({ min: 40, max: 600 }),
        fc.integer({ min: 40, max: 480 }),
        fc.constantFrom(...sides),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (shape, width, height, side, along) => {
          const card = { x: 40, y: 60, width, height, shape }
          const at =
            side === 'top' || side === 'bottom'
              ? { x: card.x + along * width, y: side === 'top' ? card.y : card.y + height }
              : { x: side === 'left' ? card.x : card.x + width, y: card.y + along * height }
          const away = { top: { x: 0, y: -50 }, bottom: { x: 0, y: 50 }, left: { x: -50, y: 0 }, right: { x: 50, y: 0 } }[side]
          const outside = { x: at.x + away.x, y: at.y + away.y }
          const end = toOutlines([outside, at], box, card)[1]!
          // It goes into the card the way it came, and no further than the card.
          expect(Math.abs(end.x - at.x) < 1e-9 || Math.abs(end.y - at.y) < 1e-9).toBe(true)
          expect(end.x).toBeGreaterThanOrEqual(card.x - 1e-9)
          expect(end.x).toBeLessThanOrEqual(card.x + width + 1e-9)
          expect(end.y).toBeGreaterThanOrEqual(card.y - 1e-9)
          expect(end.y).toBeLessThanOrEqual(card.y + height + 1e-9)
          // Where it moved, it lies on the outline.
          if (end.x !== at.x || end.y !== at.y) {
            const outline = flatten(boxShape(shape, width - 1, height - 1).outline).map((p) => ({ x: p.x + card.x + 0.5, y: p.y + card.y + 0.5 }))
            expect(gap(end, outline)).toBeLessThan(0.01)
          }
        },
      ),
    )
  })
})

describe('an outline as a line of points', () => {
  it('follows straight pieces, curves and arcs, a few pixels apart', () => {
    const square = flatten('M0 0H10V10H0Z')
    expect(square).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }])
    // A circle of radius 50 around 50, 50: every point is 50 away from its middle.
    const circle = flatten(boxShape('circle', 100, 100).outline)
    expect(circle.length).toBeGreaterThan(60)
    for (const p of circle) expect(Math.abs(Math.hypot(p.x - 50, p.y - 50) - 50)).toBeLessThan(0.01)
    // The same with a quadratic and a smooth one after it, and a cubic: they start and end where they say.
    const wave = flatten('M0 0Q5 10 10 0T20 0C25 10 30 10 35 0')
    near(wave.at(-1)!, { x: 35, y: 0 })
    near(wave.find((p) => Math.abs(p.x - 15) < 0.01)!, { x: 15, y: -5 })
  })
})
