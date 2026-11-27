import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { clearOfCards, noteTarget, tether } from '../notes'

describe('noteTarget', () => {
  const shop = { id: 'Shop', x: 0, y: 0, width: 220, height: 120 }
  const bank = { id: 'Bank', x: 300, y: 0, width: 220, height: 120 }
  const idea = { id: 'Idea', x: 0, y: 300, width: 160, height: 160, note: true }

  it('is the card under the middle of the note', () => {
    expect(noteTarget({ x: 30, y: -20, width: 160, height: 160 }, [shop, bank, idea])).toBe('Shop')
    expect(noteTarget({ x: 340, y: -40, width: 160, height: 160 }, [shop, bank, idea])).toBe('Bank')
  })

  it('is none over the empty canvas, over another note, or over the note itself', () => {
    expect(noteTarget({ x: 600, y: 600, width: 160, height: 160 }, [shop, bank, idea])).toBeUndefined()
    expect(noteTarget({ x: 10, y: 310, width: 160, height: 160 }, [shop, bank, idea])).toBeUndefined()
  })

  it('is the smaller of two cards that both lie under it', () => {
    const inner = { id: 'Inner', x: 40, y: 20, width: 120, height: 80 }
    expect(noteTarget({ x: 20, y: -20, width: 160, height: 160 }, [shop, inner])).toBe('Inner')
  })
})

describe('tether', () => {
  it('runs between the facing sides of note and card', () => {
    expect(tether({ x: 240, y: 0, width: 160, height: 120 }, { x: 0, y: 0, width: 220, height: 120 })).toEqual({
      from: { x: 240, y: 60 },
      to: { x: 220, y: 60 },
    })
  })

  it('starts and ends on the borders, never inside either box', () => {
    const box = fc.record({ x: fc.integer({ min: -500, max: 500 }), y: fc.integer({ min: -500, max: 500 }), width: fc.integer({ min: 20, max: 300 }), height: fc.integer({ min: 20, max: 300 }) })
    const strictlyIn = (p: { x: number; y: number }, b: { x: number; y: number; width: number; height: number }) =>
      p.x > b.x + 0.01 && p.x < b.x + b.width - 0.01 && p.y > b.y + 0.01 && p.y < b.y + b.height - 0.01
    fc.assert(
      fc.property(box, box, (note, card) => {
        const line = tether(note, card)
        if (!line) return
        expect(strictlyIn(line.from, card) || strictlyIn(line.from, note)).toBe(false)
        expect(strictlyIn(line.to, card) || strictlyIn(line.to, note)).toBe(false)
      }),
    )
  })

  it('is none for boxes that overlap', () => {
    expect(tether({ x: 0, y: 0, width: 100, height: 100 }, { x: 50, y: 50, width: 100, height: 100 })).toBeUndefined()
  })
})

describe('clearOfCards', () => {
  const GAP = 20
  const apart = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
    a.x >= b.x + b.width + GAP || b.x >= a.x + a.width + GAP || a.y >= b.y + b.height + GAP || b.y >= a.y + a.height + GAP
  const card = (x: number, y: number) => ({ x, y, width: 220, height: 120 })
  const note = (id: string, x: number, y: number) => ({ id, x, y, width: 160, height: 160 })

  it('keeps a note where it is wanted when that is free', () => {
    expect(clearOfCards([card(0, 0)], [note('a', 240, 0)], GAP, 20)).toEqual([note('a', 240, 0)])
  })

  it('moves a note off a card, and off a note put before it, to the nearest free place', () => {
    const placed = clearOfCards([card(0, 0)], [note('a', 100, 0), note('b', 100, 0)], GAP, 20)
    expect(placed.map((n) => n.id)).toEqual(['a', 'b'])
    expect(apart(placed[0]!, card(0, 0))).toBe(true)
    expect(apart(placed[1]!, card(0, 0))).toBe(true)
    expect(apart(placed[0]!, placed[1]!)).toBe(true)
  })

  it('leaves every note clear of every card and note, wherever they lie', () => {
    const at = fc.integer({ min: 0, max: 20 }).map((n) => n * 20)
    fc.assert(
      fc.property(fc.array(fc.tuple(at, at), { maxLength: 4 }), fc.array(fc.tuple(at, at), { maxLength: 4 }), (cards, notes) => {
        // Cards that keep their gaps, as an arrangement does.
        const kept = cards.map(([x, y]) => card(x, y)).filter((c, i, all) => all.slice(0, i).every((other) => apart(c, other)))
        const placed = clearOfCards(kept, notes.map(([x, y], i) => note(`n${i}`, x, y)), GAP, 20)
        for (const [i, n] of placed.entries()) {
          for (const c of kept) expect(apart(n, c)).toBe(true)
          for (const other of placed.slice(0, i)) expect(apart(n, other)).toBe(true)
        }
      }),
    )
  })
})
