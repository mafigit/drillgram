import type { Point } from '@drillgram/model'
import type { Box } from './geometry'

/** How round a connector's bends are, in pixels. */
const BEND_RADIUS = 8

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)

/** The point `length` along the way from `from` to `to`. */
function towards(from: Point, to: Point, length: number): Point {
  const whole = distance(from, to)
  if (whole === 0) return from
  return { x: from.x + ((to.x - from.x) * length) / whole, y: from.y + ((to.y - from.y) * length) / whole }
}

/**
 * The SVG path of a connector that runs through the given points, with rounded bends, and the
 * place for its label: halfway along the route.
 */
export function routePath(
  points: readonly Point[],
  radius = BEND_RADIUS,
): { path: string; labelX: number; labelY: number } {
  const first = points[0]!
  let path = `M ${first.x} ${first.y}`
  for (let i = 1; i < points.length - 1; i++) {
    const [before, corner, after] = [points[i - 1]!, points[i]!, points[i + 1]!]
    // A curve takes at most half of each piece, so two curves on one piece never overlap.
    const r = Math.min(radius, distance(before, corner) / 2, distance(corner, after) / 2)
    const start = towards(corner, before, r)
    const end = towards(corner, after, r)
    path += ` L ${start.x} ${start.y} Q ${corner.x} ${corner.y} ${end.x} ${end.y}`
  }
  const last = points.at(-1)!
  path += ` L ${last.x} ${last.y}`

  const lengths = points.slice(1).map((point, i) => distance(points[i]!, point))
  let left = lengths.reduce((sum, length) => sum + length, 0) / 2
  let piece = 0
  while (piece < lengths.length - 1 && left > lengths[piece]!) left -= lengths[piece++]!
  const label = towards(points[piece]!, points[piece + 1]!, left)
  return { path, labelX: label.x, labelY: label.y }
}

/** Whether a point lies on the border of a box. */
function onBorder(point: Point, box: Box): boolean {
  const dx = point.x - box.x
  const dy = point.y - box.y
  const level = (dy === 0 || dy === box.height) && dx >= 0 && dx <= box.width
  const upright = (dx === 0 || dx === box.width) && dy >= 0 && dy <= box.height
  return level || upright
}

/**
 * Whether a route still joins the two cards where they are now: it starts on the border of the
 * first and ends on the border of the second. A route laid for a card that has moved since does
 * not.
 */
export function joins(route: readonly Point[], from: Box, to: Box): boolean {
  return route.length >= 2 && onBorder(route[0]!, from) && onBorder(route.at(-1)!, to)
}
