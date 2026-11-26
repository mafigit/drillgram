import { nearestLineColour } from './model'
import type { BoxShape, Diagram, DiagramElement, Relationship } from './model'
import type { Drawing, DrawnPath, DrawnText } from './drawing'
import type { Point } from './workspace'

// A Miro board exported as a vector PDF (Board, Export, "Export as image", "Vector PDF"), read
// back into boxes, as Confluence's whiteboards import one. The PDF is only a drawing, so this is
// a reading of shapes: a closed outline is a box (a sticky note, a shape, a frame), a box inside
// another stands in it, an open line between two boxes is a connection (towards its arrowhead),
// and a text belongs to the box it stands in, or to the line it runs along as its caption. Miro
// leaves the titles of frames out of the PDF: a frame is called "Frame". Found on exports of
// boards made for it (2026-11-26).

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

interface Region {
  box: Box
  points: Point[]
  curved: boolean
  fill?: string
  stroke?: string
  parent?: Region
  texts: DrawnText[]
  /** Whether it is a band of another (the head of a container): not a box of its own. */
  band?: boolean
  /** What is drawn on it: the bars of a subroutine, the rim of a cylinder, the dot of a stop. */
  marks: Mark[]
}

interface Mark {
  points: Point[]
  closed: boolean
  filled: boolean
}

interface Line {
  points: Point[]
  stroke?: string
  from?: Region
  to?: Region
  captions: DrawnText[]
}

const boxOf = (points: Point[]): Box => ({
  left: Math.min(...points.map((p) => p.x)),
  top: Math.min(...points.map((p) => p.y)),
  right: Math.max(...points.map((p) => p.x)),
  bottom: Math.max(...points.map((p) => p.y)),
})
const widthOf = (b: Box) => b.right - b.left
const heightOf = (b: Box) => b.bottom - b.top
const areaOf = (b: Box) => widthOf(b) * heightOf(b)
const centre = (b: Box): Point => ({ x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 })
const holds = (outer: Box, inner: Box, slack: number) =>
  inner.left >= outer.left - slack && inner.right <= outer.right + slack && inner.top >= outer.top - slack && inner.bottom <= outer.bottom + slack
const holdsPoint = (b: Box, p: Point, slack = 0) => p.x >= b.left - slack && p.x <= b.right + slack && p.y >= b.top - slack && p.y <= b.bottom + slack
const textBox = (t: DrawnText): Box => ({ left: t.x, top: t.y, right: t.x + t.width, bottom: t.y + t.height })

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = dx * dx + dy * dy
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** How far a point is from a line through the points given, closed or not. */
function distanceToOutline(p: Point, points: Point[], closed: boolean): number {
  let best = Infinity
  const n = points.length
  for (let i = 0; i < (closed ? n : n - 1); i++) best = Math.min(best, distanceToSegment(p, points[i]!, points[(i + 1) % n]!))
  return n === 1 ? Math.hypot(p.x - points[0]!.x, p.y - points[0]!.y) : best
}

const allPoints = (path: DrawnPath) => path.pieces.flatMap((piece) => piece.points)
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0

type Corner = readonly [number, number]

/**
 * Outlines by their corners, in a box one wide and one high, going round. A drawing of them in
 * words, not anybody's paths: a star has ten corners, an arrow seven. Rounded corners are found
 * as one corner each, a little inside the box.
 */
const OUTLINES: [BoxShape | 'plain', Corner[]][] = [
  ['plain', [[0, 0], [1, 0], [1, 1], [0, 1]]],
  ['triangle', [[0.5, 0], [1, 1], [0, 1]]],
  ['flippedTriangle', [[0, 0], [1, 0], [0.5, 1]]],
  ['diamond', [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]],
  ['parallelogram', [[0.2, 0], [1, 0], [0.8, 1], [0, 1]]],
  ['leanLeft', [[0, 0], [0.8, 0], [1, 1], [0.2, 1]]],
  ['trapezoid', [[0.17, 0], [0.83, 0], [1, 1], [0, 1]]],
  ['invTrapezoid', [[0, 0], [1, 0], [0.83, 1], [0.17, 1]]],
  ['manualInput', [[0, 0.3], [1, 0], [1, 1], [0, 1]]],
  ['pentagon', [[0.5, 0], [1, 0.4], [0.8, 1], [0.2, 1], [0, 0.4]]],
  ['tag', [[0, 0], [0.8, 0], [1, 0.5], [0.8, 1], [0, 1]]],
  ['offPage', [[0, 0], [1, 0], [1, 0.65], [0.5, 1], [0, 0.65]]],
  ['odd', [[0, 0], [1, 0], [1, 1], [0, 1], [0.2, 0.5]]],
  ['card', [[0.1, 0], [1, 0], [1, 1], [0, 1], [0, 0.12]]],
  ['callout', [[0, 0], [1, 0], [1, 0.78], [0.37, 0.78], [0.22, 1], [0.22, 0.78], [0, 0.78]]],
  ['folder', [[0, 0], [0.38, 0], [0.38, 0.12], [1, 0.12], [1, 1], [0, 1]]],
  ['hexagon', [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]]],
  ['step', [[0, 0], [0.8, 0], [1, 0.5], [0.8, 1], [0, 1], [0.2, 0.5]]],
  ['loopLimit', [[0.1, 0], [0.9, 0], [1, 0.2], [1, 1], [0, 1], [0, 0.2]]],
  ['hourglass', [[0, 0], [1, 0], [0.5, 0.5], [1, 1], [0, 1], [0.5, 0.5]]],
  ['bolt', [[0.83, 0], [0.4, 0.45], [1, 0.45], [0.17, 1], [0.6, 0.55], [0, 0.55]]],
  ['arrowRight', [[0, 0.2], [0.68, 0.2], [0.68, 0], [1, 0.5], [0.68, 1], [0.68, 0.8], [0, 0.8]]],
  ['arrowLeft', [[0, 0.5], [0.32, 0], [0.32, 0.2], [1, 0.2], [1, 0.8], [0.32, 0.8], [0.32, 1]]],
  ['octagon', [[0.3, 0], [0.7, 0], [1, 0.3], [1, 0.7], [0.7, 1], [0.3, 1], [0, 0.7], [0, 0.3]]],
  ['arrowBoth', [[0, 0.5], [0.32, 0], [0.32, 0.2], [0.68, 0.2], [0.68, 0], [1, 0.5], [0.68, 1], [0.68, 0.8], [0.32, 0.8], [0.32, 1]]],
  ['star', [[0.5, 0], [0.65, 0.33], [1, 0.38], [0.75, 0.63], [0.8, 1], [0.5, 0.8], [0.2, 1], [0.25, 0.63], [0, 0.38], [0.35, 0.33]]],
  ['cross', [[0.25, 0], [0.75, 0], [0.75, 0.25], [1, 0.25], [1, 0.75], [0.75, 0.75], [0.75, 1], [0.25, 1], [0.25, 0.75], [0, 0.75], [0, 0.25], [0.25, 0.25]]],
]

/** The points of an outline in a box one wide and one high. */
function normalised(points: Point[], box: Box): Point[] {
  const [w, h] = [widthOf(box) || 1, heightOf(box) || 1]
  return points.map((p) => ({ x: (p.x - box.left) / w, y: (p.y - box.top) / h }))
}

/** The corners of a closed outline: where it turns, its straight runs and gentle bends left out. */
function cornersOf(points: Point[]): Point[] {
  // Douglas and Peucker: keep the point farthest from the line between two kept ones.
  const simplify = (run: Point[], tolerance: number): Point[] => {
    if (run.length < 3) return run
    const [a, b] = [run[0]!, run.at(-1)!]
    let [far, at] = [0, 0]
    for (let i = 1; i < run.length - 1; i++) {
      const d = distanceToSegment(run[i]!, a, b)
      if (d > far) [far, at] = [d, i]
    }
    return far <= tolerance ? [a, b] : [...simplify(run.slice(0, at + 1), tolerance).slice(0, -1), ...simplify(run.slice(at), tolerance)]
  }
  const start = points.reduce((best, p, i) => (p.x + p.y < points[best]!.x + points[best]!.y ? i : best), 0)
  const round = [...points.slice(start), ...points.slice(0, start), points[start]!]
  let corners = simplify(round, 0.03).slice(0, -1)
  // Two corners close together are the ends of one rounded corner.
  const merged: Point[] = []
  for (const c of corners) {
    const last = merged.at(-1)
    if (last && Math.hypot(c.x - last.x, c.y - last.y) < 0.115) merged[merged.length - 1] = { x: (c.x + last.x) / 2, y: (c.y + last.y) / 2 }
    else merged.push(c)
  }
  if (merged.length > 2 && Math.hypot(merged[0]!.x - merged.at(-1)!.x, merged[0]!.y - merged.at(-1)!.y) < 0.115) merged.pop()
  // A corner where the outline hardly turns is none.
  corners = merged
  for (let changed = true; changed && corners.length > 3; ) {
    changed = false
    for (let i = 0; i < corners.length && corners.length > 3; i++) {
      const [a, b, c] = [corners[(i + corners.length - 1) % corners.length]!, corners[i]!, corners[(i + 1) % corners.length]!]
      const turn = Math.abs(Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x))
      if (Math.min(turn, 2 * Math.PI - turn) < 0.35) {
        corners.splice(i, 1)
        changed = true
      }
    }
  }
  return corners
}

/**
 * How far the corners found are from those of an outline, at the worst corner, in the best
 * order (either direction, from any corner); infinite for another number of corners.
 */
function distanceTo(found: Point[], outline: Corner[]): number {
  if (found.length !== outline.length) return Infinity
  const n = outline.length
  let best = Infinity
  for (const way of [1, -1]) {
    for (let shift = 0; shift < n; shift++) {
      const worst = Math.max(...outline.map(([x, y], i) => {
        const f = found[(shift + way * i + 2 * n) % n]!
        return Math.hypot(f.x - x, f.y - y)
      }))
      best = Math.min(best, worst)
    }
  }
  return best
}

/** The outline whose corners are nearest to those found, if one is near enough. */
function nearestOutline(found: Point[]): BoxShape | 'plain' | undefined {
  let best: [BoxShape | 'plain' | undefined, number] = [undefined, 0.16]
  for (const [shape, corners] of OUTLINES) {
    const d = distanceTo(found, corners)
    if (d < best[1]) best = [shape, d]
  }
  return best[0]
}

/** How many bumps an outline has: the times its distance from the middle peaks. */
function bumps(outline: Point[]): number {
  const reach = outline.map((p) => Math.hypot(p.x - 0.5, p.y - 0.5))
  let count = 0
  const n = reach.length
  const span = Math.max(2, Math.round(n / 60))
  const window = (i: number, k: number) => Array.from({ length: 2 * k + 1 }, (_, j) => reach[(i - k + j + n) % n]!)
  for (let i = 0; i < n; i++) {
    // The highest point around, and higher by enough than the valleys a little further off.
    if (reach[i] === Math.max(...window(i, span)) && reach[i]! - Math.min(...window(i, 3 * span)) > 0.015) count++
  }
  return count
}

/** Whether the points lie along one straight line. */
const straight = (points: Point[]) => points.every((p) => distanceToSegment(p, points[0]!, points.at(-1)!) < 0.04)

const near = (points: Point[], x: number, y: number, by = 0.08) => points.some((p) => Math.hypot(p.x - x, p.y - y) < by)

/** How dark a colour is, from 0 (white) to 1 (black). */
function darkness(hex: string | undefined): number {
  const found = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '')
  if (!found) return 0
  return 1 - (0.3 * parseInt(found[1]!, 16) + 0.59 * parseInt(found[2]!, 16) + 0.11 * parseInt(found[3]!, 16)) / 255
}

/** The outline a region has, where it is one of ours, from its corners and what is drawn on it. */
function outlineOf(region: Region): BoxShape | undefined {
  const { box } = region
  if (widthOf(box) <= 0 || heightOf(box) <= 0) return undefined
  const outline = normalised(region.points, box)
  const marks = region.marks.map((mark) => ({ ...mark, points: normalised(mark.points, box) }))
  const lines = marks.filter((mark) => !mark.closed).map((mark) => ({ ...mark, box: boxOf(mark.points) }))
  const across = (m: { box: Box }) => widthOf(m.box) > 0.8
  const upright = (m: { box: Box }) => heightOf(m.box) > 0.8

  const reach = outline.map((p) => Math.hypot(p.x - 0.5, p.y - 0.5) * 2)
  if (outline.length >= 12 && Math.min(...reach) > 0.93 && Math.max(...reach) < 1.07) {
    if (region.fill && !region.stroke && darkness(region.fill) > 0.5) return 'filledCircle'
    if (marks.some((m) => m.closed)) return 'doubleCircle'
    const flat = lines.filter((m) => heightOf(m.box) < 0.1)
    const tall = lines.filter((m) => widthOf(m.box) < 0.1)
    if (flat.some((m) => m.box.top > 0.9)) return 'magneticTape'
    if (flat.length > 0 && tall.length > 0) return 'circlePlus'
    if (lines.length > 0) return 'circleCross'
    return 'circle'
  }
  // What is drawn on it: a rim (curved, across the top), bars and heads (straight), the pages
  // of a pile behind it (bent once).
  const rims = lines.filter((m) => !straight(m.points) && across(m) && heightOf(m.box) < 0.3 && m.box.bottom < 0.4)
  const pages = lines.filter((m) => !straight(m.points) && widthOf(m.box) > 0.4 && heightOf(m.box) > 0.4)
  const bars = lines.filter((m) => straight(m.points) && upright(m))
  const heads = lines.filter((m) => straight(m.points) && across(m))
  if (rims.length > 0) {
    if (rims.length > 1) return 'disk'
    return near(outline, 0, 1, 0.1) ? 'cylinder' : 'bucket'
  }
  if (lines.some((m) => !straight(m.points) && upright(m) && m.box.left > 0.7)) return 'queue'

  const corners = cornersOf(outline)
  const found = nearestOutline(corners)
  if (found !== undefined && found !== 'plain') return found

  // A box with a narrow tail below it: a callout.
  const tail = outline.filter((p) => p.y > 0.9).map((p) => p.x)
  if (near(corners, 0, 0, 0.1) && near(corners, 1, 0, 0.1) && tail.length > 0 && Math.max(...tail) - Math.min(...tail) < 0.3 && Math.min(...tail) > 0.05 && Math.max(...tail) < 0.95 && !near(outline, 0, 1, 0.1) && !near(outline, 1, 1, 0.1)) {
    const body = outline.filter((p) => p.y < 0.7)
    if (body.length > 0 && Math.min(...body.map((p) => p.x)) < 0.03 && Math.max(...body.map((p) => p.x)) > 0.97) return 'callout'
  }
  // A wavy lower edge under a straight top: a document.
  const lowest = (x: number) => {
    let y = -Infinity
    outline.forEach((a, i) => {
      const b = outline[(i + 1) % outline.length]!
      if ((a.x - x) * (b.x - x) <= 0 && a.x !== b.x) y = Math.max(y, a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y))
    })
    return y
  }
  if (near(outline, 0, 0, 0.1) && near(outline, 1, 0, 0.1) && Math.abs(lowest(0.25) - lowest(0.75)) > 0.08) {
    if (pages.length > 0) return 'documents'
    if (bars.length > 0) return 'linedDocument'
    if (lines.length > 0) return 'taggedDocument'
    return 'document'
  }
  if (pages.length > 0) return 'processes'

  const corner = (x: number, y: number) => near(outline, x, y, 0.06)
  const [tl, tr, br, bl] = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)]
  if (found === 'plain' || (!region.curved && corners.length === 4)) {
    // A box: what is drawn on it says which.
    const left = bars.filter((m) => m.box.left < 0.3)
    const right = bars.filter((m) => m.box.right > 0.7)
    if (left.length > 0 && right.length > 0) return 'subroutine'
    if (left.length > 0 && heads.some((m) => m.box.top < 0.3)) return 'internalStorage'
    if (left.length > 0) return 'linedProcess'
    if (heads.some((m) => m.box.top < 0.4)) return 'divided'
    if (marks.some((m) => m.closed && boxOf(m.points).left > 0.6 && boxOf(m.points).top > 0.6)) return 'taggedProcess'
  }
  // An oval with a tail below: a speech bubble.
  const sides = outline.filter((p) => p.x < 0.03 || p.x > 0.97)
  const oval = sides.length > 0 ? (2 * sides.reduce((sum, p) => sum + p.y, 0)) / sides.length : 1
  if (oval < 0.95 && outline.some((p) => p.y > oval + 0.05)) {
    const body = outline.filter((p) => p.y < oval * 0.85)
    const off = body.map((p) => Math.hypot((p.x - 0.5) / 0.5, (p.y - oval / 2) / (oval / 2)))
    if (body.length >= 8 && Math.min(...off) > 0.9 && Math.max(...off) < 1.1) return 'speechBubble'
  }

  // Bumps all round: a cloud, or with many sharp ones a bang.
  const count = bumps(outline)
  if (region.curved && Math.min(...reach) > 0.5 && count >= 5 && corners.length >= 8) return count >= 14 ? 'bang' : 'cloud'

  // Bent at both sides: stored data; round where a box has corners: a pill, a delay, a display.
  if (region.curved) {
    if (tr && br && !tl && !bl && near(outline, 0, 0.5, 0.05) && outline.some((p) => Math.abs(p.y - 0.5) < 0.1 && p.x > 0.8 && p.x < 0.97)) return 'storedData'
    if (found === undefined) {
      const flatTop = outline.filter((p) => p.y < 0.02).map((p) => p.x)
      const flat = flatTop.length > 0 ? Math.max(...flatTop) - Math.min(...flatTop) : 0
      if (!tl && !tr && !br && !bl && flat > 0.3 && Math.min(...flatTop) > 0.15 && Math.max(...flatTop) < 0.85 && near(outline, 0, 0.5) && near(outline, 1, 0.5)) return 'stadium'
      if (tl && bl && !tr && !br && near(outline, 1, 0.5)) return 'delay'
      if (!tl && !bl && !tr && !br && near(outline, 0, 0.5, 0.05) && outline.some((p) => Math.abs(p.y - 0.5) < 0.1 && p.x > 0.97)) return 'display'
    }
  }
  if (found === 'plain') return undefined

  // Four corners, two on the top edge and two on the bottom: slanted or narrowing.
  const top = corners.filter((c) => c.y < 0.1).map((c) => c.x)
  const bottom = corners.filter((c) => c.y > 0.9).map((c) => c.x)
  if (corners.length === 4 && top.length === 2 && bottom.length === 2) {
    const [t, b] = [Math.abs(top[0]! - top[1]!), Math.abs(bottom[0]! - bottom[1]!)]
    if (Math.abs(t - b) < 0.15) return Math.min(...top) > Math.min(...bottom) ? 'parallelogram' : 'leanLeft'
    return t < b ? 'trapezoid' : 'invTrapezoid'
  }
  return undefined
}

/** The lines of texts that stand together, top to bottom, each line left to right. */
function linesOf(texts: DrawnText[]): string[] {
  const sorted = [...texts].sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: DrawnText[][] = []
  for (const text of sorted) {
    const line = lines.at(-1)
    if (line && Math.abs(line[0]!.y - text.y) < Math.max(line[0]!.height, text.height) / 2) line.push(text)
    else lines.push([text])
  }
  return lines
    .map((line) =>
      line
        .sort((a, b) => a.x - b.x)
        .reduce((said, text, i) => {
          const before = line[i - 1]
          const gap = before ? text.x - (before.x + before.width) : 0
          return said + (before && gap > text.height * 0.2 && !said.endsWith(' ') && !text.text.startsWith(' ') ? ' ' : '') + text.text
        }, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((line) => line !== '')
}

/** Texts outside every box that stand together, as Miro's text items are drawn: one block each. */
function blocksOf(texts: DrawnText[]): DrawnText[][] {
  const blocks: DrawnText[][] = []
  for (const text of [...texts].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const block = blocks.find((b) =>
      b.some((other) => text.y - (other.y + other.height) < other.height * 0.6 && text.y >= other.y - other.height / 2 && text.x < other.x + other.width + other.height && text.x + text.width > other.x - other.height),
    )
    if (block) block.push(text)
    else blocks.push([text])
  }
  return blocks
}

/** The boxes and connections a page of a Miro board's vector PDF shows. */
export function miroPdfDiagram(drawing: Drawing): Diagram {
  const page = drawing.width * drawing.height
  const closedPaths = drawing.paths.filter((path) => path.pieces.length > 0 && path.pieces.every((piece) => piece.closed) && (path.fill || path.stroke))
  const openPaths = drawing.paths.filter((path) => path.stroke && path.pieces.some((piece) => !piece.closed && piece.points.length > 1))
  // What is drawn behind everything: the board's ground.
  const shapes = closedPaths.filter((path) => areaOf(boxOf(allPoints(path))) < page * 0.9)
  const size = median(shapes.map((path) => Math.max(widthOf(boxOf(allPoints(path))), heightOf(boxOf(allPoints(path))))))
  /** How near counts as touching, for the scale the board was exported at. */
  const slack = Math.max(1, size * 0.04)
  const reach = Math.max(2, size * 0.15)

  const ends = openPaths.map((path) => [path.pieces[0]!.points[0]!, path.pieces.at(-1)!.points.at(-1)!] as const)
  const isArrowhead = (path: DrawnPath) => {
    const box = boxOf(allPoints(path))
    return Math.max(widthOf(box), heightOf(box)) < size * 0.35 && ends.some((pair) => pair.some((p) => holdsPoint(box, p, slack)))
  }
  const arrowheads = shapes.filter(isArrowhead).map((path) => boxOf(allPoints(path)))

  // A shape is often drawn twice, filled and then its outline: one region.
  const regions: Region[] = []
  /** Closed paths too small to be boxes: marks on a box (a dot, a tag), if they stand in one. */
  const small: Mark[] = []
  for (const path of shapes) {
    if (isArrowhead(path)) continue
    const points = allPoints(path)
    const box = boxOf(points)
    if (Math.min(widthOf(box), heightOf(box)) < size * 0.2) {
      small.push({ points, closed: true, filled: path.fill !== undefined && path.stroke === undefined })
      continue
    }
    // The fill and the outline of one shape have the same box; a ring just inside is another.
    const tight = Math.min(slack, Math.max(0.25, Math.min(widthOf(box), heightOf(box)) * 0.02))
    const same = regions.find((r) => Math.abs(r.box.left - box.left) < tight && Math.abs(r.box.top - box.top) < tight && Math.abs(r.box.right - box.right) < tight && Math.abs(r.box.bottom - box.bottom) < tight)
    if (same) {
      same.fill ??= path.fill
      same.stroke ??= path.stroke
      continue
    }
    regions.push({ box, points, curved: path.pieces.some((piece) => piece.curved), fill: path.fill, stroke: path.stroke, texts: [], marks: [] })
  }
  // Inside: the smallest region around it. A band across the whole width at the top or the
  // bottom of its region (the head of a container) is part of that region.
  const bySize = [...regions].sort((a, b) => areaOf(a.box) - areaOf(b.box))
  for (const region of regions) {
    region.parent = bySize.find((other) => other !== region && areaOf(other.box) > areaOf(region.box) && holds(other.box, region.box, slack))
    const p = region.parent
    if (
      p &&
      heightOf(region.box) < heightOf(p.box) * 0.85 &&
      Math.abs(p.box.left - region.box.left) < slack &&
      Math.abs(p.box.right - region.box.right) < slack &&
      (Math.abs(p.box.top - region.box.top) < slack || Math.abs(p.box.bottom - region.box.bottom) < slack)
    ) {
      region.band = true
      p.fill ??= region.fill
    }
  }
  // A ring just inside a round box, or a dot in its middle, is part of it (a double circle).
  for (const region of regions) {
    const p = region.parent
    if (!p || region.band || !region.curved || !p.curved) continue
    const margins = [region.box.left - p.box.left, p.box.right - region.box.right, region.box.top - p.box.top, p.box.bottom - region.box.bottom]
    const [c, pc] = [centre(region.box), centre(p.box)]
    const concentric = Math.hypot(c.x - pc.x, c.y - pc.y) < Math.min(widthOf(p.box), heightOf(p.box)) * 0.1
    // A ring just inside it, or a dot in its middle (a stop).
    if (margins.every((m) => m < Math.min(widthOf(p.box), heightOf(p.box)) * 0.2) || (concentric && areaOf(region.box) < areaOf(p.box) * 0.3)) {
      region.band = true
      p.marks.push({ points: region.points, closed: true, filled: false })
    }
  }
  const real = (region: Region | undefined): Region | undefined => (region?.band ? real(region.parent) : region)
  const boxes = regions.filter((region) => !region.band)
  for (const region of boxes) region.parent = real(region.parent)
  const smallestAround = (points: Point[]) => {
    const b = boxOf(points)
    return [...boxes].sort((x, y) => areaOf(x.box) - areaOf(y.box)).find((region) => holds(region.box, b, slack))
  }
  for (const mark of small) smallestAround(mark.points)?.marks.push(mark)
  const hasParts = (region: Region) => boxes.some((other) => other.parent === region)

  // Lines between two boxes. The end with an arrowhead is where it goes.
  const nearest = (p: Point) => {
    let found: Region | undefined
    let best = reach
    for (const region of boxes) {
      const d = distanceToOutline(p, region.points, true)
      if (d < best || (d === best && found && areaOf(region.box) < areaOf(found.box))) [found, best] = [region, d]
    }
    return found
  }
  const lines: Line[] = []
  for (const path of openPaths) {
    const points = allPoints(path)
    let [start, end] = [points[0]!, points.at(-1)!]
    const arrowAt = (p: Point) => arrowheads.find((box) => holdsPoint(box, p, slack))
    const [atStart, atEnd] = [arrowAt(start), arrowAt(end)]
    // The tip of an arrowhead is the corner farthest from the line's other end.
    const tip = (box: Box, other: Point): Point =>
      [
        { x: box.left, y: box.top },
        { x: box.right, y: box.top },
        { x: box.left, y: box.bottom },
        { x: box.right, y: box.bottom },
        { x: (box.left + box.right) / 2, y: box.top },
        { x: (box.left + box.right) / 2, y: box.bottom },
        { x: box.left, y: (box.top + box.bottom) / 2 },
        { x: box.right, y: (box.top + box.bottom) / 2 },
      ].sort((a, b) => Math.hypot(b.x - other.x, b.y - other.y) - Math.hypot(a.x - other.x, a.y - other.y))[0]!
    if (atEnd) end = tip(atEnd, start)
    if (atStart) start = tip(atStart, end)
    let [from, to] = [nearest(start), nearest(end)]
    if (atStart && !atEnd) [from, to] = [to, from]
    // A line that joins no two boxes, inside one, is drawn on it: a bar, a rim.
    const on = (!from || !to || from === to) && !atStart && !atEnd ? smallestAround(points) : undefined
    if (on) for (const piece of path.pieces) on.marks.push({ points: piece.points, closed: piece.closed, filled: false })
    else lines.push({ points, stroke: path.stroke, from, to, captions: [] })
  }

  // A tall line on its own is a brace or a bracket beside a comment: a box of its own, which
  // takes the room beside it, at its open side, for the words. Two braces facing each other are one.
  const comments: (Region & { shape: BoxShape; opens: 1 | -1 })[] = []
  for (const line of lines) {
    if (line.from && line.to && line.from !== line.to) continue
    const b = boxOf(line.points)
    if (heightOf(b) < 2 * widthOf(b) || heightOf(b) < size * 0.3) continue
    const at = normalised(line.points, b)
    const mean = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, x) => a + x, 0) / xs.length : 0.5)
    // Where it is at its middle (a brace's point), and halfway up and down (its spine).
    const middle = at.filter((p) => Math.abs(p.y - 0.5) < 0.08).map((p) => p.x)
    const spine = mean(at.filter((p) => Math.abs(p.y - 0.25) < 0.08 || Math.abs(p.y - 0.75) < 0.08).map((p) => p.x))
    const curly = spine > 0.25 && spine < 0.75
    const shape: BoxShape = curly && Math.min(...middle, 1) < 0.15 ? 'brace' : curly && Math.max(...middle, 0) > 0.85 ? 'braceRight' : 'bracket'
    const opens = shape === 'braceRight' ? -1 : 1
    const box = opens === 1 ? { ...b, right: b.right + heightOf(b) } : { ...b, left: b.left - heightOf(b) }
    line.from = line.to = undefined
    comments.push({ box, points: [], curved: false, texts: [], marks: [], shape, opens })
  }
  for (const left of comments.filter((c) => c.shape === 'brace')) {
    const right = comments.find((c) => c.shape === 'braceRight' && c.box.left > left.box.left && Math.abs(c.box.top - left.box.top) < slack * 3 && Math.abs(c.box.bottom - left.box.bottom) < slack * 3)
    if (!right) continue
    comments.splice(comments.indexOf(right), 1)
    left.box = { ...left.box, right: right.box.right }
    left.shape = 'braces'
  }
  for (const comment of comments) {
    const { left, top, right, bottom } = comment.box
    comment.points = [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }]
    boxes.push(comment)
  }
  const commentShape = new Map<Region, BoxShape>(comments.map((c) => [c, c.shape]))
  const textHolders = [...boxes].sort((a, b) => areaOf(a.box) - areaOf(b.box))

  // Each text to the box it stands in; a text along a line is its caption; a text in no box
  // and on no line is a box of its own, as a text item of Miro.
  const loose: DrawnText[] = []
  for (const text of drawing.texts) {
    const mid = centre(textBox(text))
    const around = textHolders.find((region) => holdsPoint(region.box, mid))
    const line = lines.find((l) => l.from && l.to && distanceToOutline(mid, l.points, false) < text.height + slack)
    if (around && !hasParts(around)) around.texts.push(text)
    else if (line) line.captions.push(text)
    else if (around) around.texts.push(text)
    else loose.push(text)
  }

  const elements: DiagramElement[] = []
  const ids = new Map<Region, string>()
  const ordered = [...boxes].sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left)
  ordered.forEach((region, i) => ids.set(region, `p${i + 1}`))
  for (const region of ordered) {
    const [name, ...rest] = linesOf(region.texts)
    const shape = commentShape.get(region) ?? outlineOf(region)
    elements.push({
      id: ids.get(region)!,
      kind: 'box',
      name: name ?? (hasParts(region) ? 'Frame' : 'Shape'),
      ...(rest.length > 0 && { description: rest.join('\n') }),
      ...(shape !== undefined && { shape }),
      ...(region.parent && { inside: ids.get(region.parent)! }),
    })
  }
  blocksOf(loose).forEach((block, i) => {
    const [name, ...rest] = linesOf(block)
    if (name === undefined) return
    elements.push({ id: `t${i + 1}`, kind: 'box', name, shape: 'text', ...(rest.length > 0 && { description: rest.join('\n') }) })
  })
  const relationships: Relationship[] = lines.flatMap((line) => {
    if (!line.from || !line.to || line.from === line.to) return []
    const label = linesOf(line.captions).join(' ')
    const colour = line.stroke ? nearestLineColour(line.stroke) : undefined
    return [{ from: ids.get(line.from)!, to: ids.get(line.to)!, ...(label !== '' && { label }), ...(colour !== undefined && { colour }) }]
  })
  return { level: 'context', elements, relationships }
}

/** Every page of the PDF, one after the other: Miro puts a board on one, a long one on more. */
export function miroPdfPagesDiagram(pages: readonly Drawing[]): Diagram {
  const diagrams = pages.map(miroPdfDiagram)
  if (diagrams.length === 1) return diagrams[0]!
  const on = (n: number, id: string) => `page${n + 1}_${id}`
  return {
    level: 'context',
    elements: diagrams.flatMap((d, n) => d.elements.map((e) => ({ ...e, id: on(n, e.id), ...(e.inside !== undefined && { inside: on(n, e.inside) }) }))),
    relationships: diagrams.flatMap((d, n) => d.relationships.map((r) => ({ ...r, from: on(n, r.from), to: on(n, r.to) }))),
  }
}
