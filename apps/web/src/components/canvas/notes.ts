import type { Point } from '@drillgram/model'
import { nearestPlace } from './blockPlace'
import { centreOf } from './geometry'
import type { Box } from './geometry'

/**
 * The card a sticky note would be stuck on, were it let go where it is: the card under its
 * middle, the smallest of those, none of them a note (J69).
 */
export function noteTarget(note: Box, cards: readonly (Box & { id: string; note?: boolean })[]): string | undefined {
  const { x, y } = centreOf(note)
  const under = cards.filter((card) => !card.note && x >= card.x && x <= card.x + card.width && y >= card.y && y <= card.y + card.height)
  return under.sort((a, b) => a.width * a.height - b.width * b.height)[0]?.id
}

/** Where the line from `from` (inside `box`) towards `to` leaves the box: the first point on its border. */
function leaving(box: Box, from: Point, to: Point): Point {
  const [dx, dy] = [to.x - from.x, to.y - from.y]
  const steps = [
    dx > 0 ? (box.x + box.width - from.x) / dx : dx < 0 ? (box.x - from.x) / dx : Infinity,
    dy > 0 ? (box.y + box.height - from.y) / dy : dy < 0 ? (box.y - from.y) / dy : Infinity,
  ]
  const t = Math.min(...steps)
  return { x: from.x + dx * t, y: from.y + dy * t }
}

/**
 * The line that shows a sticky note is stuck on a card: from the border of the note to the
 * border of the card, along the line between their middles. None for boxes that overlap.
 */
export function tether(note: Box, card: Box): { from: Point; to: Point } | undefined {
  const apart = note.x >= card.x + card.width || card.x >= note.x + note.width || note.y >= card.y + card.height || card.y >= note.y + note.height
  if (!apart) return undefined
  const [a, b] = [centreOf(note), centreOf(card)]
  return { from: leaving(note, a, b), to: leaving(card, b, a) }
}

/**
 * Sticky notes made clear of the cards after these were laid out without them ("Arrange"): each
 * note where it is wanted (beside its card, moved with it), else on the free place of the grid
 * nearest to that, clear of the cards and of the notes put before it. Nothing else moves.
 */
export function clearOfCards<T extends Box>(cards: readonly Box[], notes: readonly T[], gap: number, grid: number): T[] {
  const taken: Box[] = [...cards]
  return notes.map((note) => {
    const fits = (at: Point) =>
      taken.every(
        (other) =>
          at.x >= other.x + other.width + gap ||
          other.x >= at.x + note.width + gap ||
          at.y >= other.y + other.height + gap ||
          other.y >= at.y + note.height + gap,
      )
    const at = fits(note) ? { x: note.x, y: note.y } : (nearestPlace(note, grid, fits, 200) ?? { x: note.x, y: note.y })
    const placed = { ...note, ...at }
    taken.push(placed)
    return placed
  })
}
