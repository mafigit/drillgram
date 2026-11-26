import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { centreOf, elbow } from '../geometry'
import type { Box } from '../geometry'

const box = (x: number, y: number) => ({ x, y, width: 180, height: 100 })

describe('centreOf', () => {
  it('is the middle of the box', () => {
    expect(centreOf(box(40, 40))).toEqual({ x: 130, y: 90 })
  })
})

describe('elbow', () => {
  it('is one level line between two boxes side by side, in the middle of what they share', () => {
    expect(elbow(box(0, 0), box(300, 40))).toEqual([
      { x: 180, y: 70 },
      { x: 300, y: 70 },
    ])
    expect(elbow(box(300, 40), box(0, 0))).toEqual([
      { x: 300, y: 70 },
      { x: 180, y: 70 },
    ])
  })

  it('is one upright line between two boxes above each other', () => {
    expect(elbow(box(0, 0), box(60, 200))).toEqual([
      { x: 120, y: 100 },
      { x: 120, y: 200 },
    ])
    expect(elbow(box(60, 200), box(0, 0))).toEqual([
      { x: 120, y: 200 },
      { x: 120, y: 100 },
    ])
  })

  it('has one bend between two boxes on a diagonal: out of the side, into the top or bottom', () => {
    expect(elbow(box(0, 0), box(300, 200))).toEqual([
      { x: 180, y: 50 },
      { x: 390, y: 50 },
      { x: 390, y: 200 },
    ])
    expect(elbow(box(300, 200), box(0, 0))).toEqual([
      { x: 300, y: 250 },
      { x: 90, y: 250 },
      { x: 90, y: 100 },
    ])
  })

  it('is never slanted and joins the two borders, wherever the boxes are', () => {
    const onBorder = (p: { x: number; y: number }, b: Box) =>
      ((p.x === b.x || p.x === b.x + b.width) && p.y >= b.y && p.y <= b.y + b.height) ||
      ((p.y === b.y || p.y === b.y + b.height) && p.x >= b.x && p.x <= b.x + b.width)
    const place = fc.record({ x: fc.integer({ min: -500, max: 500 }), y: fc.integer({ min: -500, max: 500 }) })
    fc.assert(
      fc.property(place, place, (a, b) => {
        const [from, to] = [box(a.x, a.y), box(b.x, b.y)]
        const points = elbow(from, to)
        expect(points.length).toBeGreaterThanOrEqual(2)
        for (let i = 1; i < points.length; i++) {
          expect(points[i]!.x === points[i - 1]!.x || points[i]!.y === points[i - 1]!.y).toBe(true)
        }
        expect(onBorder(points[0]!, from)).toBe(true)
        expect(onBorder(points.at(-1)!, to)).toBe(true)
      }),
    )
  })
})
