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

/** The outline a region has, where it is one of ours: a circle, a diamond, a triangle. */
function outlineOf(region: Region, slack: number): BoxShape | undefined {
  const { box, points } = region
  const [w, h] = [widthOf(box), heightOf(box)]
  if (w <= 0 || h <= 0) return undefined
  if (region.curved) {
    if (points.length < 8) return undefined
    const c = centre(box)
    const reach = points.map((p) => Math.hypot((p.x - c.x) / (w / 2), (p.y - c.y) / (h / 2)))
    return Math.min(...reach) > 0.95 && Math.max(...reach) < 1.16 ? 'circle' : undefined
  }
  // The corners, each once: the last point often closes onto the first.
  const corners = points.filter((p, i) => points.findIndex((q) => Math.hypot(p.x - q.x, p.y - q.y) < slack / 4) === i)
  const near = (p: Point, x: number, y: number) => Math.abs(p.x - x) < slack && Math.abs(p.y - y) < slack
  const at = (x: number, y: number) => corners.some((p) => near(p, x, y))
  const { left, top, right, bottom } = box
  const [mx, my] = [(left + right) / 2, (top + bottom) / 2]
  if (corners.length === 3) {
    if (at(mx, top) && at(left, bottom) && at(right, bottom)) return 'triangle'
    if (at(mx, bottom) && at(left, top) && at(right, top)) return 'flippedTriangle'
    return undefined
  }
  if (corners.length === 4) {
    if (at(mx, top) && at(right, my) && at(mx, bottom) && at(left, my)) return 'diamond'
    if (at(left, top) && at(right, top) && at(right, bottom) && at(left, bottom)) return undefined
    const topEdge = corners.filter((p) => Math.abs(p.y - top) < slack).map((p) => p.x)
    const bottomEdge = corners.filter((p) => Math.abs(p.y - bottom) < slack).map((p) => p.x)
    if (topEdge.length !== 2 || bottomEdge.length !== 2) return undefined
    const [t, b] = [Math.abs(topEdge[0]! - topEdge[1]!), Math.abs(bottomEdge[0]! - bottomEdge[1]!)]
    if (Math.abs(t - b) < slack) return 'parallelogram'
    return t < b ? 'trapezoid' : 'invTrapezoid'
  }
  if (corners.length === 6 && at(left, my) && at(right, my)) return 'hexagon'
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
  for (const path of shapes) {
    if (isArrowhead(path)) continue
    const points = allPoints(path)
    const box = boxOf(points)
    if (Math.min(widthOf(box), heightOf(box)) < size * 0.2) continue
    const same = regions.find((r) => Math.abs(r.box.left - box.left) < slack && Math.abs(r.box.top - box.top) < slack && Math.abs(r.box.right - box.right) < slack && Math.abs(r.box.bottom - box.bottom) < slack)
    if (same) {
      same.fill ??= path.fill
      same.stroke ??= path.stroke
      continue
    }
    regions.push({ box, points, curved: path.pieces.some((piece) => piece.curved), fill: path.fill, stroke: path.stroke, texts: [] })
  }
  // Inside: the smallest region around it. A band across the whole width at the top or the
  // bottom of its region (the head of a container) is part of that region.
  const bySize = [...regions].sort((a, b) => areaOf(a.box) - areaOf(b.box))
  for (const region of regions) {
    region.parent = bySize.find((other) => other !== region && areaOf(other.box) > areaOf(region.box) && holds(other.box, region.box, slack))
    const p = region.parent
    if (
      p &&
      Math.abs(p.box.left - region.box.left) < slack &&
      Math.abs(p.box.right - region.box.right) < slack &&
      (Math.abs(p.box.top - region.box.top) < slack || Math.abs(p.box.bottom - region.box.bottom) < slack)
    ) {
      region.band = true
      p.fill ??= region.fill
    }
  }
  const real = (region: Region | undefined): Region | undefined => (region?.band ? real(region.parent) : region)
  const boxes = regions.filter((region) => !region.band)
  for (const region of boxes) region.parent = real(region.parent)
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
    lines.push({ points, stroke: path.stroke, from, to, captions: [] })
  }

  // Each text to the box it stands in; a text along a line is its caption; a text in no box
  // and on no line is a box of its own, as a text item of Miro.
  const loose: DrawnText[] = []
  for (const text of drawing.texts) {
    const mid = centre(textBox(text))
    const around = bySize.find((region) => !region.band && holdsPoint(region.box, mid))
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
    const shape = outlineOf(region, slack)
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
