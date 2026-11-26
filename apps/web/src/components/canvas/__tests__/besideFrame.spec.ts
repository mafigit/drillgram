import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { besideTheirCards } from '../besideFrame'
import type { Box } from '../geometry'

type Card = Box & { id: string }
const card = (id: string, x: number, y: number, width = 220, height = 120): Card => ({ id, x, y, width, height })
const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const middle = (box: Box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })

// A frame with four cards, each nearer to the left or right side than to the top or bottom.
const FRAME: Box = { x: 0, y: 0, width: 1000, height: 800 }
const INSIDE = [card('nw', 60, 200), card('ne', 720, 200), card('sw', 60, 480), card('se', 720, 480)]
const GAP = 80

describe('besideTheirCards', () => {
  const place = (outside: Card[], links: { from: string; to: string }[]) => besideTheirCards(FRAME, INSIDE, outside, links, GAP, 20)!
  const of = (cards: Card[], id: string) => cards.find((found) => found.id === id)!

  it('puts a card outside at the side of the frame nearest to the card it connects to, level with it', () => {
    // Far away, at the bottom left, but its card stands at the top right.
    const [placed] = place([card('lst', -400, 1200)], [{ from: 'lst', to: 'ne' }])
    // The middle of "ne" is 170 from the right side and 260 from the top: right of the frame, at its height.
    expect(placed).toEqual(card('lst', FRAME.width + GAP, 200))
  })

  it('takes the side by the middle of all the cards it connects to, in either direction', () => {
    const placed = place([card('ox', 0, -900)], [{ from: 'ox', to: 'sw' }, { from: 'se', to: 'ox' }])
    // Between "sw" and "se": under the frame, in its middle.
    expect(of(placed, 'ox').y).toBe(FRAME.height + GAP)
    // To the grid: half a step off at most.
    expect(Math.abs(middle(of(placed, 'ox')).x - 500)).toBeLessThanOrEqual(10)
  })

  it('is half a step of the grid off its card at most, wherever that stands', () => {
    for (const x of [713, 706, 727, 731]) {
      const inside = [card('nw', 60, 200), card('ne', x, 60)]
      const [placed] = besideTheirCards(FRAME, inside, [card('lst', 0, 0)], [{ from: 'lst', to: 'ne' }], GAP, 20)!
      expect(Math.abs(middle(placed!).x - middle(inside[1]!).x), String(x)).toBeLessThanOrEqual(10)
    }
  })

  it('keeps cards apart that want the same place, in the order of their cards', () => {
    const placed = place(
      [card('a', 0, 0), card('b', 0, 0), card('c', 0, 0)],
      [{ from: 'a', to: 'ne' }, { from: 'b', to: 'ne' }, { from: 'c', to: 'se' }],
    )
    const [a, b, c] = ['a', 'b', 'c'].map((id) => of(placed, id))
    for (const found of [a!, b!, c!]) expect(found.x).toBe(FRAME.width + GAP)
    expect(overlap(a!, b!) || overlap(b!, c!) || overlap(a!, c!)).toBe(false)
    expect(Math.max(a!.y, b!.y)).toBeLessThan(c!.y)
  })

  it('leaves a card that connects to nothing inside at the side it stands, where the engine put it', () => {
    const placed = place([card('lone', 300, -400), card('lst', -400, 1200)], [{ from: 'lst', to: 'ne' }])
    expect(of(placed, 'lone')).toEqual(card('lone', 300, -GAP - 120))
    expect(of(placed, 'lst').x).toBe(FRAME.width + GAP)
  })

  it('gives every card a place off the frame and off every other, on the grid', () => {
    const outside = fc.array(fc.tuple(fc.integer({ min: -40, max: 90 }), fc.integer({ min: -40, max: 80 }), fc.integer({ min: 6, max: 14 })), { minLength: 1, maxLength: 9 })
    const ends = fc.array(fc.tuple(fc.nat(8), fc.constantFrom('nw', 'ne', 'sw', 'se')), { maxLength: 12 })
    fc.assert(
      fc.property(outside, ends, (cards, connections) => {
        const asked = cards.map(([x, y, rows], at) => card(`o${at}`, x * 20, y * 20, 220, rows * 20))
        const links = connections.filter(([at]) => at < asked.length).map(([at, to]) => ({ from: `o${at}`, to }))
        const placed = besideTheirCards(FRAME, INSIDE, asked, links, GAP, 20)
        // No place found is an answer too: the cards then stay where the engine put them.
        if (!placed) return
        expect(placed.map((found) => found.id).sort()).toEqual(asked.map((found) => found.id).sort())
        for (const [at, found] of placed.entries()) {
          expect(overlap(found, FRAME)).toBe(false)
          expect([found.x % 20, found.y % 20].map(Math.abs)).toEqual([0, 0])
          expect([found.width, found.height]).toEqual([of(asked, found.id).width, of(asked, found.id).height])
          for (const other of placed.slice(at + 1)) expect(overlap(found, other)).toBe(false)
        }
      }),
    )
  })
})
