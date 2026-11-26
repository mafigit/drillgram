import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { joins, routePath } from '../routePath'

const box = (x: number, y: number) => ({ x, y, width: 220, height: 120 })

describe('routePath', () => {
  it('draws a route of two points as one straight line, with the label in its middle', () => {
    expect(
      routePath([
        { x: 220, y: 60 },
        { x: 600, y: 60 },
      ]),
    ).toEqual({ path: 'M 220 60 L 600 60', labelX: 410, labelY: 60 })
  })

  it('rounds a bend, starting and ending the curve the radius away from the corner', () => {
    const { path } = routePath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      8,
    )
    expect(path).toBe('M 0 0 L 92 0 Q 100 0 100 8 L 100 100')
  })

  it('makes the curve smaller where a piece is shorter than twice the radius', () => {
    const { path } = routePath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 100 },
      ],
      8,
    )
    // The first piece is 10 long: the curve may take half of it.
    expect(path).toBe('M 0 0 L 5 0 Q 10 0 10 5 L 10 100')
  })

  it('puts the label halfway along the route, measured along its pieces', () => {
    const { labelX, labelY } = routePath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 300 },
    ])
    // 400 long: halfway is 100 down the second piece.
    expect({ labelX, labelY }).toEqual({ labelX: 100, labelY: 100 })
  })

  it('always starts at the first point, ends at the last and keeps the label on the route', () => {
    const coordinate = fc.integer({ min: -2000, max: 2000 })
    // Upright and level pieces in turn, as the engine gives them.
    const route = fc
      .tuple(coordinate, coordinate, fc.array(fc.integer({ min: 1, max: 500 }), { minLength: 1, maxLength: 8 }))
      .map(([x, y, steps]) => {
        const points = [{ x, y }]
        steps.forEach((step, i) => {
          const last = points.at(-1)!
          points.push(i % 2 === 0 ? { x: last.x + step, y: last.y } : { x: last.x, y: last.y + step })
        })
        return points
      })
    fc.assert(
      fc.property(route, (points) => {
        const { path, labelX, labelY } = routePath(points)
        const first = points[0]!
        const last = points.at(-1)!
        expect(path.startsWith(`M ${first.x} ${first.y} `)).toBe(true)
        expect(path.endsWith(` ${last.x} ${last.y}`)).toBe(true)
        const onAPiece = points.some((p, i) => {
          const q = points[i + 1]
          if (!q) return false
          const within = (v: number, a: number, b: number) => v >= Math.min(a, b) && v <= Math.max(a, b)
          return within(labelX, p.x, q.x) && within(labelY, p.y, q.y)
        })
        expect(onAPiece).toBe(true)
      }),
    )
  })
})

describe('joins', () => {
  const route = [
    { x: 220, y: 60 },
    { x: 600, y: 60 },
  ]

  it('accepts a route that starts and ends on the borders of the two cards', () => {
    expect(joins(route, box(0, 0), box(600, 0))).toBe(true)
  })

  it('rejects a route whose card has moved away from its end', () => {
    expect(joins(route, box(0, 20), box(600, 0))).toBe(true)
    expect(joins(route, box(0, 80), box(600, 0))).toBe(false)
    expect(joins(route, box(0, 0), box(640, 0))).toBe(false)
  })

  it('rejects a route with fewer than two points', () => {
    expect(joins([], box(0, 0), box(600, 0))).toBe(false)
    expect(joins([{ x: 220, y: 60 }], box(0, 0), box(600, 0))).toBe(false)
  })
})
