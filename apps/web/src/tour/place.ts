// Where the tour's card stands: beside what the step points at, never on it while a side has
// room, and always on the screen.

export type Box = { x: number; y: number; width: number; height: number }
export type Size = { width: number; height: number }
export type Side = 'bottom' | 'top' | 'right' | 'left'

/** Between the card and what it points at. */
const GAP = 14
/** Between the card and the edge of the screen. */
const MARGIN = 12

const SIDES: Side[] = ['bottom', 'top', 'right', 'left']

/**
 * The top left corner of the card. Without a target: the middle of the screen. Else the side
 * asked for, then the others, the first one the whole card has room on; when none has, the
 * top or the bottom of the screen, whichever the target leaves more of.
 */
export function placeCard(target: Box | undefined, card: Size, screen: Size, prefer: Side = 'bottom'): { x: number; y: number } {
  const across = (x: number) => Math.round(Math.max(MARGIN, Math.min(x, screen.width - card.width - MARGIN)))
  const down = (y: number) => Math.round(Math.max(MARGIN, Math.min(y, screen.height - card.height - MARGIN)))
  if (!target) return { x: across((screen.width - card.width) / 2), y: down((screen.height - card.height) / 2) }

  // Under or over it: centred on it. Beside it: from its top down, so that a card beside
  // something near the top bar does not reach up over the bar.
  const centred = across(target.x + target.width / 2 - card.width / 2)
  const at: Record<Side, { x: number; y: number }> = {
    bottom: { x: centred, y: target.y + target.height + GAP },
    top: { x: centred, y: target.y - GAP - card.height },
    right: { x: target.x + target.width + GAP, y: down(target.y) },
    left: { x: target.x - GAP - card.width, y: down(target.y) },
  }
  const fits = ({ x, y }: { x: number; y: number }) =>
    x >= MARGIN && y >= MARGIN && x + card.width <= screen.width - MARGIN && y + card.height <= screen.height - MARGIN
  const side = [prefer, ...SIDES.filter((other) => other !== prefer)].find((tried) => fits(at[tried]))
  if (side) return { x: Math.round(at[side].x), y: Math.round(at[side].y) }

  const below = screen.height - (target.y + target.height)
  return { x: across((screen.width - card.width) / 2), y: below >= target.y ? down(screen.height) : MARGIN }
}
