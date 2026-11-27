import type { BoxShape, Point } from '@drillgram/model'
import type { Box } from './geometry'
import { boxShape } from './shapes'

// The layout engine lays a connector's route from the border of one card to the border of
// another: the rectangle around the card. A card drawn as a shape (a diamond, a speech bubble)
// does not fill that rectangle, and the line would stop in the air beside it. So the end pieces
// run on, the way they came, until they meet the outline: still upright or level (J30), the
// arrowhead on the shape itself.

/** A card where a connector ends, with the outline it is drawn as. */
export interface Shaped extends Box {
  shape?: BoxShape
}

/** How long a piece of a curve may be when it is drawn as straight pieces, in px. */
const STEP = 2

/** The points of an outline path (as `boxShape` writes it: absolute commands), its curves as short straight pieces. */
export function flatten(path: string): Point[] {
  const points: Point[] = []
  let at: Point = { x: 0, y: 0 }
  let start = at
  // The control point a smooth curve (T) mirrors.
  let control: Point | undefined
  const to = (p: Point) => (points.push(p), (at = p))
  /** A curve from `at`, given by where it is at a time from 0 to 1, in an even number of pieces. */
  const curve = (length: number, point: (t: number) => Point) => {
    const pieces = 2 * Math.max(1, Math.ceil(length / STEP / 2))
    for (let i = 1; i <= pieces; i++) to(point(i / pieces))
  }
  for (const [, command, rest] of path.matchAll(/([MLHVQTCAZ])([^MLHVQTCAZ]*)/g)) {
    const v = (rest!.match(/-?(\d+\.?\d*|\.\d+)(e-?\d+)?/gi) ?? []).map(Number)
    const from = at
    switch (command) {
      case 'M':
        start = to({ x: v[0]!, y: v[1]! })
        for (let i = 2; i + 1 < v.length; i += 2) to({ x: v[i]!, y: v[i + 1]! })
        break
      case 'L':
        for (let i = 0; i + 1 < v.length; i += 2) to({ x: v[i]!, y: v[i + 1]! })
        break
      case 'H':
        to({ x: v[0]!, y: at.y })
        break
      case 'V':
        to({ x: at.x, y: v[0]! })
        break
      case 'Q':
      case 'T': {
        const c = command === 'Q' ? { x: v[0]!, y: v[1]! } : control ? { x: 2 * from.x - control.x, y: 2 * from.y - control.y } : from
        const end = command === 'Q' ? { x: v[2]!, y: v[3]! } : { x: v[0]!, y: v[1]! }
        const length = Math.hypot(c.x - from.x, c.y - from.y) + Math.hypot(end.x - c.x, end.y - c.y)
        curve(length, (t) => ({
          x: (1 - t) ** 2 * from.x + 2 * (1 - t) * t * c.x + t ** 2 * end.x,
          y: (1 - t) ** 2 * from.y + 2 * (1 - t) * t * c.y + t ** 2 * end.y,
        }))
        control = c
        continue
      }
      case 'C': {
        const [c1, c2, end] = [{ x: v[0]!, y: v[1]! }, { x: v[2]!, y: v[3]! }, { x: v[4]!, y: v[5]! }]
        const length = Math.hypot(c1.x - from.x, c1.y - from.y) + Math.hypot(c2.x - c1.x, c2.y - c1.y) + Math.hypot(end.x - c2.x, end.y - c2.y)
        const bezier = (a: number, b: number, c: number, d: number, t: number) =>
          (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d
        curve(length, (t) => ({ x: bezier(from.x, c1.x, c2.x, end.x, t), y: bezier(from.y, c1.y, c2.y, end.y, t) }))
        break
      }
      case 'A':
        arc(from, v, curve, to)
        break
      case 'Z':
        to(start)
        break
    }
    control = undefined
  }
  return points
}

/** An elliptical arc from `from`, as SVG gives it (rx ry rotation large sweep x y), drawn with `curve`. */
function arc(from: Point, [rx0, ry0, rotation, large, sweep, x, y]: number[], curve: (length: number, point: (t: number) => Point) => void, to: (p: Point) => void) {
  const end = { x: x!, y: y! }
  let [rx, ry] = [Math.abs(rx0!), Math.abs(ry0!)]
  if (rx === 0 || ry === 0 || (from.x === end.x && from.y === end.y)) return void to(end)
  // From the ends to the centre (SVG 1.1, appendix F.6.5).
  const phi = (rotation! * Math.PI) / 180
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)]
  const [dx, dy] = [(from.x - end.x) / 2, (from.y - end.y) / 2]
  const [x1, y1] = [cos * dx + sin * dy, -sin * dx + cos * dy]
  const grow = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
  if (grow > 1) [rx, ry] = [rx * Math.sqrt(grow), ry * Math.sqrt(grow)]
  const sign = large === sweep ? -1 : 1
  const square = (rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1) / (rx * rx * y1 * y1 + ry * ry * x1 * x1)
  const k = sign * Math.sqrt(Math.max(0, square))
  const [cx1, cy1] = [(k * rx * y1) / ry, (-k * ry * x1) / rx]
  const [cx, cy] = [cos * cx1 - sin * cy1 + (from.x + end.x) / 2, sin * cx1 + cos * cy1 + (from.y + end.y) / 2]
  const angle = (ux: number, uy: number) => Math.atan2(uy, ux)
  const theta = angle((x1 - cx1) / rx, (y1 - cy1) / ry)
  let delta = angle((-x1 - cx1) / rx, (-y1 - cy1) / ry) - theta
  if (sweep && delta < 0) delta += 2 * Math.PI
  if (!sweep && delta > 0) delta -= 2 * Math.PI
  curve(Math.abs(delta) * Math.max(rx, ry), (t) => {
    if (t === 1) return end
    const a = theta + t * delta
    const [ex, ey] = [rx * Math.cos(a), ry * Math.sin(a)]
    return { x: cx + cos * ex - sin * ey, y: cy + sin * ex + cos * ey }
  })
}

/** Where a ray from `from` the way of `way` first meets a line through points, as a distance along the ray. */
function meets(from: Point, way: Point, line: readonly Point[]): number | undefined {
  let nearest: number | undefined
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1]!, line[i]!]
    const [ex, ey] = [b.x - a.x, b.y - a.y]
    const cross = way.x * ey - way.y * ex
    if (Math.abs(cross) < 1e-12) continue
    const [fx, fy] = [a.x - from.x, a.y - from.y]
    const along = (fx * ey - fy * ex) / cross
    const on = (fx * way.y - fy * way.x) / cross
    if (along >= -1e-9 && on >= -1e-9 && on <= 1 + 1e-9 && (nearest === undefined || along < nearest)) nearest = Math.max(0, along)
  }
  return nearest
}

/**
 * An end of a route, `end`, moved on along its last piece (from `before`) to the outline of the
 * card it is at; as it is where the card is a plain rectangle, or the way on misses the outline.
 */
function onOutline(end: Point, before: Point, card: Shaped): Point {
  if (!card.shape || card.shape === 'table') return end
  const length = Math.hypot(end.x - before.x, end.y - before.y)
  if (length === 0) return end
  const way = { x: (end.x - before.x) / length, y: (end.y - before.y) / length }
  // As the canvas draws it: half a pixel inside the card, for a box one pixel smaller (ObjectNode.vue).
  const outline = flatten(boxShape(card.shape, Math.max(card.width - 1, 1), Math.max(card.height - 1, 1)).outline).map((p) => ({
    x: p.x + card.x + 0.5,
    y: p.y + card.y + 0.5,
  }))
  const along = meets(end, way, outline)
  if (along === undefined) return end
  return { x: end.x + way.x * along, y: end.y + way.y * along }
}

/** A connector's route from card `from` to card `to`, its two ends moved onto the cards' outlines. */
export function toOutlines(points: readonly Point[], from: Shaped, to: Shaped): Point[] {
  if (points.length < 2) return [...points]
  const ends = [...points]
  ends[0] = onOutline(points[0]!, points[1]!, from)
  ends[ends.length - 1] = onOutline(points.at(-1)!, points.at(-2)!, to)
  return ends
}
