import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { BOX_SHAPES } from '@drillgram/model'
import { BASIC_SHAPES, SHAPE_ABOUT, boxShape } from '../shapes'

/** Every number of a path, in pairs where they are points (arcs' radii and flags left out). */
function points(path: string): { x: number; y: number }[] {
  const found: { x: number; y: number }[] = []
  let at = { x: 0, y: 0 }
  for (const [, command, rest] of path.matchAll(/([MLHVCQTAZ])([^MLHVCQTAZ]*)/g)) {
    const values = (rest!.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
    if (command === 'H') at = { x: values[0]!, y: at.y }
    else if (command === 'V') at = { x: at.x, y: values[0]! }
    else if (command === 'A') at = { x: values[5]!, y: values[6]! }
    else if (command === 'Z') continue
    else {
      for (let i = 0; i + 1 < values.length; i += 2) found.push({ x: values[i]!, y: values[i + 1]! })
      at = found.at(-1) ?? at
      continue
    }
    found.push(at)
  }
  return found
}

describe('the shapes of a box', () => {
  it('each have a name, a line that says what they are for, and a drawing', () => {
    for (const shape of BOX_SHAPES) {
      expect(SHAPE_ABOUT[shape].label, shape).toBeTruthy()
      expect(SHAPE_ABOUT[shape].about, shape).toBeTruthy()
      const drawing = boxShape(shape, 220, 120)
      expect(drawing.outline, shape).toMatch(/^M[\d. -]+.*Z$/)
    }
  })

  it('are closed outlines that keep to the box, at any size, and leave room for the text', () => {
    fc.assert(
      fc.property(fc.constantFrom(...BOX_SHAPES), fc.integer({ min: 120, max: 600 }), fc.integer({ min: 80, max: 480 }), (shape, w, h) => {
        const { outline, lines, inset } = boxShape(shape, w, h)
        expect(outline.endsWith('Z')).toBe(true)
        for (const path of [outline, ...lines]) {
          expect(path).not.toMatch(/NaN|Infinity/)
          // The points the outline runs through (a curve's handles may reach a little further).
          for (const point of points(path)) {
            expect(point.x).toBeGreaterThanOrEqual(-0.06 * w)
            expect(point.x).toBeLessThanOrEqual(1.06 * w)
            expect(point.y).toBeGreaterThanOrEqual(-0.06 * h)
            expect(point.y).toBeLessThanOrEqual(1.06 * h)
          }
        }
        for (const side of Object.values(inset)) expect(side).toBeGreaterThanOrEqual(0)
        expect(w - inset.left - inset.right).toBeGreaterThan(w * 0.5)
        expect(h - inset.top - inset.bottom).toBeGreaterThan(h * 0.5)
      }),
      // Many shapes, and the smallest box is where they break: more runs than the usual hundred.
      { numRuns: 2000 },
    )
    // The smallest and the largest box, for every shape, whatever the runs above drew.
    for (const shape of BOX_SHAPES) {
      for (const [w, h] of [[120, 80], [600, 80], [120, 480], [600, 480]] as const) {
        const { inset } = boxShape(shape, w, h)
        expect(w - inset.left - inset.right, `${shape} ${w}x${h}`).toBeGreaterThan(w * 0.5)
        expect(h - inset.top - inset.bottom, `${shape} ${w}x${h}`).toBeGreaterThan(h * 0.5)
      }
    }
  })

  it('have names of their own, and each stands in one library', () => {
    const labels = BOX_SHAPES.map((shape) => SHAPE_ABOUT[shape].label)
    expect(new Set(labels).size).toBe(labels.length)
    expect(BASIC_SHAPES.every((shape) => BOX_SHAPES.includes(shape))).toBe(true)
    expect(new Set(BASIC_SHAPES).size).toBe(BASIC_SHAPES.length)
  })

  it('draw no two shapes alike', () => {
    const drawings = BOX_SHAPES.map((shape) => {
      const { outline, lines, look } = boxShape(shape, 220, 120)
      return JSON.stringify([outline, lines, look])
    })
    expect(new Set(drawings).size).toBe(BOX_SHAPES.length)
  })

  it('show a text and a comment without an outline, and a data store with a line above and below only', () => {
    expect(boxShape('text', 220, 120)).toMatchObject({ look: 'none', lines: [] })
    expect(boxShape('brace', 220, 120)).toMatchObject({ look: 'none', inset: { left: 12 } })
    expect(boxShape('braces', 220, 120).lines).toHaveLength(2)
    expect(boxShape('dataStore', 220, 120)).toMatchObject({ look: 'ground', lines: ['M0 0H220', 'M0 120H220'] })
    expect(boxShape('cylinder', 220, 120).look).toBeUndefined()
  })

  it('draw the slanted boxes each their own way', () => {
    expect(boxShape('parallelogram', 200, 100).outline).toBe('M20 0H200L180 100H0Z')
    expect(boxShape('leanLeft', 200, 100).outline).toBe('M0 0H180L200 100H20Z')
    expect(boxShape('trapezoid', 210, 100).outline).toBe('M24 0H186L210 100H0Z')
    expect(boxShape('invTrapezoid', 210, 100).outline).toBe('M0 0H210L186 100H24Z')
  })

  it('draw a database as a cylinder with its rim, a queue lying, and a subroutine with a bar at each side', () => {
    expect(boxShape('cylinder', 220, 120).lines).toHaveLength(1)
    expect(boxShape('cylinder', 220, 120).inset.top).toBe(24)
    expect(boxShape('queue', 220, 120).lines).toHaveLength(1)
    expect(boxShape('subroutine', 220, 120).lines).toEqual(['M10 0V120', 'M210 0V120'])
    expect(boxShape('diamond', 200, 100).outline).toBe('M100 0L200 50L100 100L0 50Z')
  })
})
