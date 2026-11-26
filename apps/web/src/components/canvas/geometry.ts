import { CARD } from '@drillgram/model'
import type { Point } from '@drillgram/model'

export { CARD }

export interface Box extends Point {
  width: number
  height: number
}

export function centreOf(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** The middle of the stretch two ranges share, if they share one. */
function sharedMiddle(a: number, aLength: number, b: number, bLength: number): number | undefined {
  const [start, end] = [Math.max(a, b), Math.min(a + aLength, b + bLength)]
  return end > start ? (start + end) / 2 : undefined
}

/**
 * A line from the border of one box to the border of another, of upright and level pieces only:
 * one piece where the boxes face each other, two with a bend between them otherwise. It does not
 * look at other boxes.
 */
export function elbow(from: Box, to: Box): Point[] {
  const [a, b] = [centreOf(from), centreOf(to)]
  const below = b.y > a.y
  const x = sharedMiddle(from.x, from.width, to.x, to.width)
  const end = below ? to.y : to.y + to.height
  if (x !== undefined) return [{ x, y: below ? from.y + from.height : from.y }, { x, y: end }]
  const right = b.x > a.x
  const start = right ? from.x + from.width : from.x
  const y = sharedMiddle(from.y, from.height, to.y, to.height)
  if (y !== undefined) return [{ x: start, y }, { x: right ? to.x : to.x + to.width, y }]
  return [
    { x: start, y: a.y },
    { x: b.x, y: a.y },
    { x: b.x, y: end },
  ]
}
