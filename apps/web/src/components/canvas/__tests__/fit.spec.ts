import { describe, expect, it } from 'vitest'
import { getViewportForBounds } from '@xyflow/vue'
import { fitPadding } from '../fit'
import type { Box } from '../geometry'

const CANVAS = { width: 1280, height: 752 }
const MINIMAP = { width: 210, height: 150 }
const card = (x: number, y: number): Box => ({ x, y, width: 220, height: 110 })

/** Where the cards are on the screen after a fit with this padding. */
function fitted(cards: Box[], padding: ReturnType<typeof fitPadding>): Box[] {
  const right = Math.max(...cards.map((c) => c.x + c.width))
  const bottom = Math.max(...cards.map((c) => c.y + c.height))
  const [x, y] = [Math.min(...cards.map((c) => c.x)), Math.min(...cards.map((c) => c.y))]
  const view = getViewportForBounds({ x, y, width: right - x, height: bottom - y }, CANVAS.width, CANVAS.height, 0.2, 1, padding)
  return cards.map((c) => ({ x: c.x * view.zoom + view.x, y: c.y * view.zoom + view.y, width: c.width * view.zoom, height: c.height * view.zoom }))
}

describe('fitPadding', () => {
  it('keeps room for the title above, the toolbar below and air at the sides', () => {
    expect(fitPadding([card(0, 0)], CANVAS, {})).toEqual({ top: 56, bottom: 80, left: 24, right: 24 })
  })

  it('keeps room for the frame of an opened box, which is no card', () => {
    expect(fitPadding([card(0, 0)], CANVAS, { framed: true })).toEqual({ top: 128, bottom: 120, left: 64, right: 64 })
  })

  it('leaves a diagram as it is when no card would lie under the minimap', () => {
    // Two cards in the middle of the screen at full size.
    expect(fitPadding([card(0, 0), card(300, 0)], CANVAS, { corner: MINIMAP }).top).toBe(56)
  })

  it('goes below the minimap when a card would lie under it', () => {
    // As wide as the screen and more: the card top right would reach into the corner.
    const cards = [card(0, 0), card(2400, 0), card(1200, 900)]
    const padding = fitPadding(cards, CANVAS, { corner: MINIMAP })
    expect(padding.top).toBe(150)
    for (const box of fitted(cards, padding)) {
      expect(box.x).toBeGreaterThanOrEqual(24)
      expect(box.x + box.width).toBeLessThanOrEqual(CANVAS.width - 24)
      expect(box.y).toBeGreaterThanOrEqual(150)
      expect(box.y + box.height).toBeLessThanOrEqual(CANVAS.height - 80)
    }
  })

  it('fits nothing without cards', () => {
    expect(fitPadding([], CANVAS, { corner: MINIMAP }).top).toBe(56)
  })
})
