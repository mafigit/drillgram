import { getViewportForBounds } from '@xyflow/vue'
import { FRAME } from '@drillgram/model'
import type { Box } from './geometry'

// "Fit to screen": the whole diagram on the canvas, clear of what stands over its edges. Vue
// Flow fits the cards alone and to the very edge; the room around them is said here, in pixels
// of the screen (a number is pixels since Vue Flow 2, a share of the diagram before).

/** The title of the diagram and the tabs of its views, top left. */
const TITLE_ROOM = 56
/** The floating toolbar at the bottom of the canvas. */
export const TOOLBAR_HEIGHT = 80
/** Narrower than this (a phone), the zoom buttons and the key stand in a row above the toolbar. */
const NARROW = 640
const ABOVE_THE_TOOLBAR = 50

/** The room the toolbar takes at the bottom of a canvas this wide, and on a phone what stands above it. */
export function toolbarRoom(canvasWidth: number): number {
  return TOOLBAR_HEIGHT + (canvasWidth < NARROW ? ABOVE_THE_TOOLBAR : 0)
}
/** Between the outermost card and the edge of the canvas. */
const AIR = 24

export type FitPadding = { top: number; bottom: number; left: number; right: number }

/**
 * The room a fit leaves around the cards. `framed`: the open diagram draws a frame around its
 * cards (an opened box), which is no card and reaches further out; the fit never zooms in past
 * full size, so the frame's own measures are enough on the screen. `corner`: the room the
 * minimap takes top right. Only a diagram that would put a card under it starts below it:
 * a wide diagram loses nothing by that, and a small one stays in the middle.
 */
export function fitPadding(
  cards: readonly Box[],
  canvas: { width: number; height: number },
  room: { framed?: boolean; corner?: { width: number; height: number }; minZoom?: number; maxZoom?: number },
): FitPadding {
  const side = AIR + (room.framed ? FRAME.side : 0)
  const padding = {
    top: TITLE_ROOM + (room.framed ? FRAME.top : 0),
    bottom: toolbarRoom(canvas.width) + (room.framed ? FRAME.bottom : 0),
    left: side,
    right: side,
  }
  const corner = room.corner
  if (!corner || cards.length === 0 || padding.top >= corner.height) return padding

  const left = Math.min(...cards.map((card) => card.x))
  const top = Math.min(...cards.map((card) => card.y))
  const bounds = {
    x: left,
    y: top,
    width: Math.max(...cards.map((card) => card.x + card.width)) - left,
    height: Math.max(...cards.map((card) => card.y + card.height)) - top,
  }
  const view = getViewportForBounds(bounds, canvas.width, canvas.height, room.minZoom ?? 0.2, room.maxZoom ?? 1, padding)
  const under = cards.some(
    (card) => (card.x + card.width) * view.zoom + view.x > canvas.width - corner.width && card.y * view.zoom + view.y < corner.height,
  )
  return under ? { ...padding, top: corner.height } : padding
}
