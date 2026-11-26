import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { gapsFor, guidesFor } from '../alignment'

const box = (x: number, y: number) => ({ x, y, width: 220, height: 120 })

describe('guidesFor', () => {
  it('draws an upright guide through a card straight above', () => {
    // From the top of the upper card to the bottom of the lower one, through their middles.
    expect(guidesFor(box(0, 300), [box(0, 0)])).toEqual([{ upright: true, at: 110, from: 0, to: 420 }])
  })

  it('draws a level guide through a card straight beside', () => {
    expect(guidesFor(box(600, 40), [box(0, 40)])).toEqual([{ upright: false, at: 100, from: 0, to: 820 }])
  })

  it('draws both when the card is in line with one card above and another beside', () => {
    expect(guidesFor(box(600, 300), [box(600, 0), box(0, 300), box(20, 20)])).toEqual([
      { upright: true, at: 710, from: 0, to: 420 },
      { upright: false, at: 360, from: 0, to: 820 },
    ])
  })

  it('draws one guide through all cards of a column', () => {
    expect(guidesFor(box(0, 300), [box(0, 0), box(0, 900), box(500, 500)])).toEqual([
      { upright: true, at: 110, from: 0, to: 1020 },
    ])
  })

  it('draws nothing for a card that is in line with no other', () => {
    expect(guidesFor(box(40, 300), [box(0, 0), box(600, 20)])).toEqual([])
  })

  it('lines cards of different sizes up by their middles', () => {
    const small = { x: 60, y: 300, width: 100, height: 60 }
    expect(guidesFor(small, [box(0, 0)])).toEqual([{ upright: true, at: 110, from: 0, to: 360 }])
  })

  it('draws an upright guide exactly when some card has the same middle column, a level one for the same row', () => {
    const place = fc.record({ x: fc.integer({ min: -20, max: 20 }), y: fc.integer({ min: -20, max: 20 }) })
    fc.assert(
      fc.property(place, fc.array(place, { maxLength: 6 }), (card, others) => {
        const boxes = others.map((o) => box(o.x * 20, o.y * 20))
        const guides = guidesFor(box(card.x * 20, card.y * 20), boxes)
        expect(guides.some((g) => g.upright)).toBe(others.some((o) => o.x === card.x))
        expect(guides.some((g) => !g.upright)).toBe(others.some((o) => o.y === card.y))
        expect(guides.length).toBeLessThanOrEqual(2)
      }),
    )
  })
})

describe('gapsFor', () => {
  it('marks both gaps when the card is as far from its neighbour as that one is from the next', () => {
    // Three in a row, 100 apart: the dragged card is the last one.
    expect(gapsFor(box(640, 0), [box(0, 0), box(320, 0)])).toEqual([
      { upright: false, at: 60, from: 220, to: 320 },
      { upright: false, at: 60, from: 540, to: 640 },
    ])
  })

  it('marks both gaps when the card sits halfway between two others', () => {
    expect(gapsFor(box(320, 0), [box(0, 0), box(640, 0)])).toEqual([
      { upright: false, at: 60, from: 220, to: 320 },
      { upright: false, at: 60, from: 540, to: 640 },
    ])
  })

  it('marks every gap of a run of equal ones', () => {
    const gaps = gapsFor(box(960, 0), [box(0, 0), box(320, 0), box(640, 0)])
    expect(gaps.map((gap) => [gap.from, gap.to])).toEqual([
      [220, 320],
      [540, 640],
      [860, 960],
    ])
  })

  it('marks nothing when the gaps differ', () => {
    expect(gapsFor(box(660, 0), [box(0, 0), box(320, 0)])).toEqual([])
    expect(gapsFor(box(340, 0), [box(0, 0), box(640, 0)])).toEqual([])
  })

  it('marks nothing next to a single neighbour', () => {
    expect(gapsFor(box(320, 0), [box(0, 0)])).toEqual([])
  })

  it('works the same way down a column', () => {
    expect(gapsFor(box(0, 360), [box(0, 0), box(0, 180)])).toEqual([
      { upright: true, at: 110, from: 120, to: 180 },
      { upright: true, at: 110, from: 300, to: 360 },
    ])
  })

  it('looks only at cards the middle line of the dragged card runs through', () => {
    // The second card is far below the row: it is no neighbour in that row.
    expect(gapsFor(box(640, 0), [box(0, 0), box(320, 400)])).toEqual([])
    // Shifted a little, but still beside: it counts.
    expect(gapsFor(box(640, 0), [box(0, 20), box(320, -40)])).toHaveLength(2)
  })

  it('only ever marks gaps of one width per direction, and always the one next to the card', () => {
    const column = fc.integer({ min: 0, max: 12 })
    fc.assert(
      fc.property(column, fc.uniqueArray(column, { maxLength: 6 }), (card, others) => {
        fc.pre(!others.includes(card))
        // A row of cards on places 260 apart (so gaps are 40, 300, 560, ...).
        const gaps = gapsFor(box(card * 260, 0), others.map((o) => box(o * 260, 0)))
        const widths = new Set(gaps.map((gap) => gap.to - gap.from))
        expect(widths.size).toBeLessThanOrEqual(1)
        if (gaps.length > 0) {
          expect(gaps.length).toBeGreaterThanOrEqual(2)
          const touchesCard = gaps.some((gap) => gap.to === card * 260 || gap.from === card * 260 + 220)
          expect(touchesCard).toBe(true)
        }
      }),
    )
  })
})
