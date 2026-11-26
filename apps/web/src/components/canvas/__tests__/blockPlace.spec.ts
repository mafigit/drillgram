import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { nearestPlace, placeBlock } from '../blockPlace'
import type { Box } from '../geometry'

const card = (x: number, y: number): Box => ({ x, y, width: 220, height: 120 })
const gapBetween = (a: Box, b: Box) =>
  Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), b.y - (a.y + a.height), a.y - (b.y + b.height))

describe('placeBlock', () => {
  it('leaves a group that is free where it is', () => {
    expect(placeBlock([card(0, 0), card(240, 0)], [card(0, 400)], 20, 20)).toEqual({ x: 0, y: 0 })
  })

  it('moves a group off a card in its way, as little as the grid allows', () => {
    // The other card overlaps the group's right card by 20 px from below.
    const by = placeBlock([card(0, 0), card(240, 0)], [card(240, 100)], 20, 20)
    expect(by).toEqual({ x: 0, y: -40 })
  })

  it('gives up when nothing is free within reach', () => {
    expect(placeBlock([card(0, 0)], [card(0, 0)], 20, 20, 2)).toBeUndefined()
  })

  it('always keeps the gap to every other card, and moves the group as one', () => {
    const place = fc.tuple(fc.integer({ min: -30, max: 30 }), fc.integer({ min: -30, max: 30 })).map(([x, y]) => card(x * 20, y * 20))
    fc.assert(
      fc.property(fc.array(place, { minLength: 1, maxLength: 4 }), fc.array(place, { maxLength: 6 }), (block, others) => {
        const by = placeBlock(block, others, 20, 20)
        expect(by).toBeDefined()
        for (const moved of block.map((c) => ({ ...c, x: c.x + by!.x, y: c.y + by!.y }))) {
          for (const other of others) expect(gapBetween(moved, other)).toBeGreaterThanOrEqual(20)
        }
      }),
    )
  })
})

describe('nearestPlace', () => {
  it('takes the wanted place, on the grid, when it fits', () => {
    expect(nearestPlace({ x: 47, y: 52 }, 20, () => true)).toEqual({ x: 40, y: 60 })
  })

  it('takes the nearest place that fits, and the same one every time', () => {
    // Only places at least 60 below the wanted one fit.
    const fits = (place: { x: number; y: number }) => place.y >= 100
    expect(nearestPlace({ x: 40, y: 40 }, 20, fits)).toEqual({ x: 40, y: 100 })
  })

  it('gives up when nothing fits within reach', () => {
    expect(nearestPlace({ x: 0, y: 0 }, 20, () => false, 3)).toBeUndefined()
  })
})
