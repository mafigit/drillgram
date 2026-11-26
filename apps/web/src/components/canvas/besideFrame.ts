import { centreOf } from './geometry'
import type { Box } from './geometry'

type Card = Box & { id: string }
type Side = 'top' | 'right' | 'bottom' | 'left'

const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/**
 * The cards around a frame, each put where its connectors are short: at the side of the frame
 * nearest to the cards inside it connects to, level with them. The layout engine lays the frame
 * out as one card, so it cannot know where in the frame a neighbour's card stands; this goes
 * over its answer. A card that connects to nothing inside keeps the side the engine gave it.
 * Cards at one side keep `gap` to each other, in the order of the places they want, and `gap` to
 * the frame. `undefined` when two cards of different sides would meet at a corner: the engine's
 * answer then stays.
 */
export function besideTheirCards(
  frame: Box,
  inside: readonly Card[],
  outside: readonly Card[],
  links: readonly { from: string; to: string }[],
  gap: number,
  grid: number,
): Card[] | undefined {
  const within = new Map(inside.map((card) => [card.id, card]))
  const [right, bottom] = [frame.x + frame.width, frame.y + frame.height]

  // Where each card wants to be: the side, and the place along it.
  const wants = outside.map((card) => {
    const theirs = links.flatMap((link) => {
      const other = link.from === card.id ? link.to : link.to === card.id ? link.from : undefined
      const found = other === undefined ? undefined : within.get(other)
      return found ? [centreOf(found)] : []
    })
    const own = centreOf(card)
    // Nothing inside: as far as it stands off each side now, the furthest wins.
    const off = { top: frame.y - own.y, right: own.x - right, bottom: own.y - bottom, left: frame.x - own.x }
    const at =
      theirs.length > 0
        ? { x: theirs.reduce((sum, point) => sum + point.x, 0) / theirs.length, y: theirs.reduce((sum, point) => sum + point.y, 0) / theirs.length }
        : own
    // To the cards inside: how near their middle is to each side, the nearest wins.
    const near = { top: at.y - frame.y, right: right - at.x, bottom: bottom - at.y, left: at.x - frame.x }
    const sides: Side[] = ['top', 'right', 'bottom', 'left']
    const side =
      theirs.length > 0
        ? sides.reduce((best, next) => (near[next] < near[best] ? next : best))
        : sides.reduce((best, next) => (off[next] > off[best] ? next : best))
    return { card, side, at }
  })

  const snap = (value: number) => Math.round(value / grid) * grid || 0
  const placed: Card[] = []
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const level = side === 'top' || side === 'bottom'
    const length = (card: Card) => (level ? card.width : card.height)
    const row = wants
      .filter((want) => want.side === side)
      .map((want) => ({ card: want.card, wanted: (level ? want.at.x : want.at.y) - length(want.card) / 2 }))
      // The same diagram always gets the same places.
      .sort((a, b) => a.wanted - b.wanted || (a.card.id < b.card.id ? -1 : 1))
    if (row.length === 0) continue
    // One after the other, each at its place or behind the one before; then all back by the mean
    // of what that pushed them, so the row stays around the places it wanted.
    const line = (shift: number, onGrid: (value: number) => number) => {
      const starts: number[] = []
      for (const [at, { wanted }] of row.entries()) {
        const before = at === 0 ? -Infinity : starts[at - 1]! + length(row[at - 1]!.card) + gap
        starts.push(Math.max(onGrid(wanted - shift), before))
      }
      return starts
    }
    // Measured off the grid: what the grid moves a card by is no push.
    const pushed = line(0, (value) => value).reduce((sum, start, at) => sum + (start - row[at]!.wanted), 0) / row.length
    const starts = line(pushed, snap)
    for (const [at, { card }] of row.entries()) {
      const along = starts[at]!
      // Off the frame by the gap, on the grid, never nearer.
      if (side === 'top') placed.push({ ...card, x: along, y: Math.floor((frame.y - gap - card.height) / grid) * grid || 0 })
      else if (side === 'bottom') placed.push({ ...card, x: along, y: Math.ceil((bottom + gap) / grid) * grid || 0 })
      else if (side === 'left') placed.push({ ...card, x: Math.floor((frame.x - gap - card.width) / grid) * grid || 0, y: along })
      else placed.push({ ...card, x: Math.ceil((right + gap) / grid) * grid || 0, y: along })
    }
  }
  // Two rows can only meet beyond a corner of the frame.
  for (const [at, card] of placed.entries()) {
    if (placed.slice(at + 1).some((other) => overlap(card, other))) return undefined
  }
  return placed
}
