import { describe, expect, it } from 'vitest'
import { placeCard, roomBelow } from '../place'

const SCREEN = { width: 1000, height: 800 }
const CARD = { width: 300, height: 200 }

describe('placeCard', () => {
  it('puts the card in the middle of the screen when it points at nothing', () => {
    expect(placeCard(undefined, CARD, SCREEN)).toEqual({ x: 350, y: 300 })
  })

  it('puts it under what it points at, centred on it', () => {
    expect(placeCard({ x: 400, y: 100, width: 100, height: 40 }, CARD, SCREEN)).toEqual({ x: 300, y: 154 })
  })

  it('goes above when there is no room below', () => {
    expect(placeCard({ x: 400, y: 700, width: 100, height: 40 }, CARD, SCREEN)).toEqual({ x: 300, y: 486 })
  })

  it('takes the side a step asks for when the card fits there, from the top of the target down', () => {
    expect(placeCard({ x: 400, y: 300, width: 100, height: 40 }, CARD, SCREEN, 'left')).toEqual({ x: 86, y: 300 })
    expect(placeCard({ x: 400, y: 300, width: 100, height: 40 }, CARD, SCREEN, 'right')).toEqual({ x: 514, y: 300 })
    // Near the bottom of the screen: as far down as the screen goes.
    expect(placeCard({ x: 400, y: 700, width: 100, height: 40 }, CARD, SCREEN, 'right')).toEqual({ x: 514, y: 588 })
  })

  it('takes another side when the card does not fit on the one asked for', () => {
    // No 314 px left of it: under it instead.
    expect(placeCard({ x: 100, y: 300, width: 100, height: 40 }, CARD, SCREEN, 'left')).toEqual({ x: 12, y: 354 })
  })

  it('stays on the screen beside something at its edge', () => {
    expect(placeCard({ x: 960, y: 4, width: 32, height: 32 }, CARD, SCREEN)).toEqual({ x: 688, y: 50 })
    expect(placeCard({ x: 0, y: 4, width: 32, height: 32 }, CARD, SCREEN)).toEqual({ x: 12, y: 50 })
  })

  it('never covers what it points at while there is a side with room', () => {
    const target = { x: 300, y: 250, width: 400, height: 300 }
    for (const side of ['bottom', 'top', 'right', 'left'] as const) {
      const at = placeCard(target, CARD, SCREEN, side)
      const apart =
        at.x + CARD.width <= target.x || at.x >= target.x + target.width || at.y + CARD.height <= target.y || at.y >= target.y + target.height
      expect(apart, side).toBe(true)
    }
  })

  it('goes to the half of the screen its target leaves most free when no side has room', () => {
    // As large as the screen: the frame of an opened box.
    expect(placeCard({ x: 20, y: 20, width: 960, height: 500 }, CARD, { width: 1000, height: 600 })).toEqual({ x: 350, y: 388 })
    expect(placeCard({ x: 20, y: 80, width: 960, height: 500 }, CARD, { width: 1000, height: 600 })).toEqual({ x: 350, y: 12 })
  })

  it('goes to the corner farthest from its target when a step asks to stay out of the way', () => {
    // Under the top bar and over the toolbar: the corners of the canvas, not of the screen.
    expect(placeCard({ x: 300, y: 200, width: 100, height: 50 }, CARD, SCREEN, 'away')).toEqual({ x: 688, y: 504 })
    expect(placeCard({ x: 700, y: 600, width: 100, height: 50 }, CARD, SCREEN, 'away')).toEqual({ x: 12, y: 60 })
    expect(placeCard({ x: 700, y: 100, width: 100, height: 50 }, CARD, SCREEN, 'away')).toEqual({ x: 12, y: 504 })
  })

  it('fits a screen narrower than the card', () => {
    expect(placeCard(undefined, CARD, { width: 280, height: 800 }).x).toBe(12)
  })

  it('stays within the room below it says it takes, out of the way of something high on a phone', () => {
    const phone = { width: 393, height: 714 }
    const card = { width: 369, height: 270 }
    const at = placeCard({ x: 100, y: 150, width: 160, height: 90 }, card, phone, 'away')
    expect(phone.height - at.y).toBeLessThanOrEqual(roomBelow(card.height))
  })
})
