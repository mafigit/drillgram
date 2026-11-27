import type { Box } from './geometry'
import { centreOf } from './geometry'

/** A line that shows cards are in line: upright through a column of cards, or level through a row. */
export interface Guide {
  upright: boolean
  /** Where the line is: its x when upright, its y when level. */
  at: number
  /** Where it starts and ends along its direction: from the first card's edge to the last one's. */
  from: number
  to: number
}

/**
 * The guides for a card at a place: one through every other card whose middle is in the same
 * column, and one through every other card whose middle is in the same row.
 */
export function guidesFor(card: Box, others: readonly Box[]): Guide[] {
  const middle = centreOf(card)
  const guides: Guide[] = []
  const column = others.filter((other) => centreOf(other).x === middle.x)
  if (column.length > 0) {
    const all = [card, ...column]
    guides.push({
      upright: true,
      at: middle.x,
      from: Math.min(...all.map((b) => b.y)),
      to: Math.max(...all.map((b) => b.y + b.height)),
    })
  }
  const row = others.filter((other) => centreOf(other).y === middle.y)
  if (row.length > 0) {
    const all = [card, ...row]
    guides.push({
      upright: false,
      at: middle.y,
      from: Math.min(...all.map((b) => b.x)),
      to: Math.max(...all.map((b) => b.x + b.width)),
    })
  }
  return guides
}

/**
 * The gaps to mark for a card at a place, because they are equal: the gap between the card and
 * its neighbour in a row (or column), when it is as wide as the next gap along that row. A run of
 * equal gaps is marked as a whole. Neighbours are the cards the card's middle line runs through.
 *
 * A gap is a line across it, at the card's middle: level between cards side by side.
 */
export function gapsFor(card: Box, others: readonly Box[]): Guide[] {
  const middle = centreOf(card)
  const marks: Guide[] = []
  for (const level of [true, false]) {
    // Along the row (or column): where a box starts and ends; across it: where its band lies.
    const start = (b: Box) => (level ? b.x : b.y)
    const end = (b: Box) => (level ? b.x + b.width : b.y + b.height)
    const line = level ? middle.y : middle.x
    const inBand = (b: Box) => (level ? b.y < line && line < b.y + b.height : b.x < line && line < b.x + b.width)
    const run = [card, ...others.filter(inBand)].sort((a, b) => start(a) - start(b))
    const gap = (i: number) => start(run[i + 1]!) - end(run[i]!)
    const at = run.indexOf(card)
    // The gaps on both sides of the card, where it has a neighbour there.
    const left = at > 0 ? at - 1 : undefined
    const right = at < run.length - 1 ? at : undefined
    const marked = new Set<number>()
    if (left !== undefined && right !== undefined && gap(left) === gap(right)) marked.add(left).add(right)
    if (left !== undefined) {
      for (let i = left; i > 0 && gap(i - 1) === gap(left); i--) marked.add(i - 1).add(left)
    }
    if (right !== undefined) {
      for (let i = right; i < run.length - 2 && gap(i + 1) === gap(right); i++) marked.add(i + 1).add(right)
    }
    // When the card sits between two runs of different widths, only one width can be meant:
    // the one on both sides of it, else the left one.
    const width = left !== undefined && marked.has(left) ? gap(left) : right !== undefined ? gap(right) : 0
    for (const i of [...marked].sort((a, b) => a - b)) {
      if (gap(i) === width) marks.push({ upright: !level, at: line, from: end(run[i]!), to: start(run[i + 1]!) })
    }
  }
  return marks
}

/** How far from a card the mark of its size stands: over it for the width, left of it for the height. */
const SIZE_MARK_OFFSET = 12
/** Cards further apart than this, edge to edge, are not nearby: their sizes are not compared. */
const NEARBY = 400

/**
 * The marks for a card being resized that is as wide (or as tall) as a card nearby: one across
 * the card and one across each such card. Only the sizes being changed are compared.
 */
export function sizesFor(card: Box, others: readonly Box[], changing: { width: boolean; height: boolean }): Guide[] {
  const apart = (other: Box) =>
    Math.max(other.x - (card.x + card.width), card.x - (other.x + other.width), other.y - (card.y + card.height), card.y - (other.y + other.height))
  const near = others.filter((other) => apart(other) <= NEARBY)
  const widthMark = (b: Box): Guide => ({ upright: false, at: b.y - SIZE_MARK_OFFSET, from: b.x, to: b.x + b.width })
  const heightMark = (b: Box): Guide => ({ upright: true, at: b.x - SIZE_MARK_OFFSET, from: b.y, to: b.y + b.height })
  const marks: Guide[] = []
  const wide = changing.width ? near.filter((other) => other.width === card.width) : []
  if (wide.length > 0) marks.push(widthMark(card), ...wide.map(widthMark))
  const tall = changing.height ? near.filter((other) => other.height === card.height) : []
  if (tall.length > 0) marks.push(heightMark(card), ...tall.map(heightMark))
  return marks
}
