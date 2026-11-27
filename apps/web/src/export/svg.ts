import { plainLines } from '@/lib/markdown'
import { LINE_COLOURS, LINE_COLOUR_HEX, FILL_COLOUR_HEX } from '@drillgram/model'
import type { BoxShape, ElementKind, LineColour, FillColour, Point, TableColumn } from '@drillgram/model'
import { codeBadge, isAbstractCode } from '../components/canvas/codeLanguages'
import { KIND_LABEL, cardType } from '../components/canvas/kinds'
import { boxShape } from '../components/canvas/shapes'
import { COLOURS } from './palette'

// The diagram as an SVG file of its own: what the canvas shows, drawn again with plain shapes and
// text, so that any program can open it (no HTML inside, no links to the app). The cards follow
// canvas/ObjectNode.vue, the connectors canvas/ConnectionEdge.vue and the key
// canvas/CanvasKey.vue. Only the diagram: no buttons, no selection, no grid.

/** A card, where it is on the diagram. */
export interface SceneCard {
  x: number
  y: number
  width: number
  height: number
  name: string
  kind: ElementKind
  description?: string
  technology?: string
  external: boolean
  /** Names of its icons, in their order. */
  icons: readonly string[]
  /** Its outline, when it is not a plain rectangle (components/canvas/shapes.ts). */
  shape?: BoxShape
  /** The columns of a table, in their order. */
  columns?: readonly TableColumn[]
  /** The name of the card a sticky note is stuck on: it has a pin. */
  stuckOn?: string
  /** The colour the card is filled with; the light theme's card without (a sticky note: yellow). */
  fill?: FillColour
}

/** A connector, as the canvas draws it. */
export interface SceneConnector {
  /** The SVG path of its line. */
  path: string
  /** The points it runs through, to know how far it reaches. */
  points: readonly Point[]
  label?: string
  /** The middle of its label. */
  labelAt?: Point
  /** It runs to the frame: no part of the opened object has this connection yet. Drawn red. */
  toFrame?: boolean
  /** The colour of its line and arrowhead; the usual grey without. */
  colour?: LineColour
}

/** What the export draws: the open diagram. */
export interface Scene {
  title: string
  cards: readonly SceneCard[]
  connectors: readonly SceneConnector[]
  /** The frame around the parts of the object the diagram is about. */
  boundary?: { name: string; kind: ElementKind; x: number; y: number; width: number; height: number }
  /** The lines from each sticky note that is stuck on a card to that card. */
  tethers?: readonly { from: Point; to: Point }[]
  /** What the key lists: only what is on the diagram. */
  key: { kinds: readonly ElementKind[]; external: boolean; relationships: boolean; toFrame?: boolean }
}

export interface SvgOptions {
  /** The width of a text in a CSS font, in pixels. */
  measure: (text: string, font: string) => number
  /** The diagram font as a `data:` URL of its woff2 file, to put inside the drawing. */
  font?: string
  /** The pictures of the icons, as `data:` URLs, by name. An icon without one is left out. */
  icons?: ReadonlyMap<string, string>
}

export const SANS = "'Geist Variable', Geist, ui-sans-serif, system-ui, sans-serif"
export const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"

/** The fonts of the canvas, as CSS `font` values for measuring. */
const FONT = {
  title: `600 16px ${SANS}`,
  name: `600 15px ${SANS}`,
  description: `400 11px ${SANS}`,
  type: `400 10px ${MONO}`,
  member: `400 10.5px ${MONO}`,
  badge: `600 10px ${MONO}`,
  label: `500 12px ${SANS}`,
  boundaryName: `600 14px ${SANS}`,
  small: `400 12px ${SANS}`,
  keyHeading: `500 12px ${SANS}`,
}

/** Room around the drawing, and between the title, the diagram and the key. */
const MARGIN = 32
const TITLE_HEIGHT = 20
const GAP = 24

/** Lucide's icons (ISC licence) for the kinds, drawn on a 24 px grid. */
const KIND_SHAPES: Record<ElementKind, string> = {
  box: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
  person: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  softwareSystem:
    '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  container: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 4v4"/><path d="M2 8h20"/><path d="M6 4v4"/>',
  component:
    '<path d="M15.536 11.293a1 1 0 0 0 0 1.414l2.376 2.377a1 1 0 0 0 1.414 0l2.377-2.377a1 1 0 0 0 0-1.414l-2.377-2.377a1 1 0 0 0-1.414 0z"/><path d="M2.297 11.293a1 1 0 0 0 0 1.414l2.377 2.377a1 1 0 0 0 1.414 0l2.377-2.377a1 1 0 0 0 0-1.414L6.088 8.916a1 1 0 0 0-1.414 0z"/><path d="M8.916 17.912a1 1 0 0 0 0 1.415l2.377 2.376a1 1 0 0 0 1.414 0l2.377-2.376a1 1 0 0 0 0-1.415l-2.377-2.376a1 1 0 0 0-1.414 0z"/><path d="M8.916 4.674a1 1 0 0 0 0 1.414l2.377 2.376a1 1 0 0 0 1.414 0l2.377-2.376a1 1 0 0 0 0-1.414l-2.377-2.377a1 1 0 0 0-1.414 0z"/>',
  code: '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
}

/** Text made safe for XML. */
export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)
}

/** A number as short as SVG needs it. */
const n = (value: number) => String(Math.round(value * 100) / 100)

/** A text cut to a width, with "…" where it was cut. */
export function truncate(text: string, width: number, font: string, measure: SvgOptions['measure']): string {
  if (measure(text, font) <= width) return text
  let kept = text
  while (kept.length > 0 && measure(`${kept.trimEnd()}…`, font) > width) kept = kept.slice(0, -1)
  return `${kept.trimEnd()}…`
}

/**
 * A text broken into lines of at most a width, at spaces where it can, at most `most` lines; the
 * last one ends in "…" when the text goes on (as CSS `line-clamp` does).
 */
export function wrap(text: string, width: number, most: number, font: string, measure: SvgOptions['measure']): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const tried = line ? `${line} ${word}` : word
    if (measure(tried, font) <= width) {
      line = tried
      continue
    }
    if (line) lines.push(line)
    line = word
    // A word too long for a line of its own is broken where the line ends.
    while (measure(line, font) > width && line.length > 1) {
      let cut = line.length - 1
      while (cut > 1 && measure(line.slice(0, cut), font) > width) cut--
      lines.push(line.slice(0, cut))
      line = line.slice(cut)
    }
  }
  if (line) lines.push(line)
  if (lines.length <= most) return lines
  const kept = lines.slice(0, most)
  kept[most - 1] = truncate(`${kept[most - 1]} ${lines[most]}`, width, font, measure)
  return kept
}

interface Text {
  x: number
  y: number
  text: string
  font: string
  size: number
  weight: number
  fill: string
  anchor?: 'start' | 'middle' | 'end'
  family?: string
  extra?: string
}

/** One line of text, its middle at `y`. */
function text({ x, y, text, size, weight, fill, anchor = 'middle', family = SANS, extra = '' }: Text): string {
  return `<text x="${n(x)}" y="${n(y)}" font-family="${escapeXml(family)}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" dominant-baseline="central"${extra}>${escapeXml(text)}</text>`
}

/** A kind's icon, `size` px wide, its top-left corner at x, y. */
function kindIcon(kind: ElementKind, x: number, y: number, size: number, colour: string): string {
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(size / 24)})" fill="none" stroke="${colour}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${KIND_SHAPES[kind]}</g>`
}

interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

function grow(bounds: Bounds, x: number, y: number, width = 0, height = 0): void {
  bounds.left = Math.min(bounds.left, x)
  bounds.top = Math.min(bounds.top, y)
  bounds.right = Math.max(bounds.right, x + width)
  bounds.bottom = Math.max(bounds.bottom, y + height)
}

/** Card layout: canvas/ObjectNode.vue in pixels. */
const CARD = {
  radius: 14,
  padX: 12,
  padTop: 16,
  padBottom: 8,
  nameLine: 18.75,
  descriptionGap: 4,
  descriptionLine: 15.125,
  typeLine: 12.5,
  icon: 26,
  iconStep: 18,
  figure: 28,
}

/** Class-box layout of a code element: `.object-card.is-code` in assets/main.css, in pixels. */
const CODE = { radius: 4, typeTop: 8, typeLine: 12.5, nameTop: 3, nameLine: 18.75, nameBottom: 8, sign: 18, gap: 6, padY: 6, memberLine: 14.4375, rule: 8 }

/** A line of Markdown that is a rule: it parts the members of a class box. */
const RULE = /^ {0,3}([-*_])(?: *\1){2,} *$/

/**
 * A code element, drawn as the canvas draws it: a class box. What it is in guillemets, its badge,
 * the language's icon and its name, a line, and its members from the left; a rule in the text is
 * a line from border to border.
 */
function codeCard(card: SceneCard, options: SvgOptions): string {
  const { measure } = options
  const left = card.x + CARD.padX
  const inner = card.width - 2 * CARD.padX
  const bottom = card.y + card.height
  const parts: string[] = [
    `<rect x="${n(card.x + 0.5)}" y="${n(card.y + 0.5)}" width="${n(card.width - 1)}" height="${n(card.height - 1)}" rx="${CODE.radius}" fill="${card.fill ? FILL_COLOUR_HEX[card.fill] : COLOURS.card}" stroke="${COLOURS.border}"/>`,
  ]
  const rule = (y: number) => `<line x1="${n(card.x)}" y1="${n(y)}" x2="${n(card.x + card.width)}" y2="${n(y)}" stroke="${COLOURS.border}"/>`
  const type = cardType(card)
  if (type) parts.push(
    text({ x: card.x + card.width / 2, y: card.y + CODE.typeTop + CODE.typeLine / 2, text: truncate(`«${type}»`, inner, FONT.type, measure), font: FONT.type, size: 10, weight: 400, family: MONO, fill: COLOURS['muted-foreground'] }),
  )
  // The badge, the icons and the name stand together in the middle.
  const icons = card.icons.filter((icon) => options.icons?.has(icon))
  const signs = (1 + icons.length) * (CODE.sign + CODE.gap)
  const name = truncate(card.name, inner - signs, FONT.name, measure)
  const row = card.y + CODE.typeTop + CODE.typeLine + CODE.nameTop + CODE.nameLine / 2
  let x = card.x + (card.width - signs - measure(name, FONT.name)) / 2
  const kind = COLOURS['kind-code']
  parts.push(
    `<circle cx="${n(x + CODE.sign / 2)}" cy="${n(row)}" r="${CODE.sign / 2 - 0.5}" fill="${kind}" fill-opacity="0.14" stroke="${kind}" stroke-opacity="0.55"/>`,
    text({ x: x + CODE.sign / 2, y: row, text: codeBadge(card.technology), font: FONT.badge, size: 10, weight: 600, family: MONO, fill: COLOURS['card-foreground'] }),
  )
  x += CODE.sign + CODE.gap
  for (const icon of icons) {
    parts.push(`<image x="${n(x)}" y="${n(row - CODE.sign / 2)}" width="${CODE.sign}" height="${CODE.sign}" preserveAspectRatio="xMidYMid meet" href="${options.icons!.get(icon)!}"/>`)
    x += CODE.sign + CODE.gap
  }
  const slanted = isAbstractCode(card.technology) ? ' font-style="italic"' : ''
  parts.push(text({ x, y: row, text: name, font: FONT.name, size: 15, weight: 600, fill: COLOURS['card-foreground'], anchor: 'start', extra: slanted }))
  let y = row + CODE.nameLine / 2 + CODE.nameBottom
  parts.push(rule(y))

  // The members, top to bottom, a rule of the text as a line between them; what the box has no
  // room for is left out, and an ellipsis in the last line says so.
  const items: (string | undefined)[] = []
  let part: string[] = []
  const close = () => items.push(...plainLines(part.join('\n')))
  for (const line of (card.description ?? '').split('\n')) {
    if (!RULE.test(line)) part.push(line)
    else {
      close()
      items.push(undefined)
      part = []
    }
  }
  close()
  y += CODE.padY
  const members: { line: string; y: number }[] = []
  let cut = false
  for (const item of items) {
    const height = item === undefined ? CODE.rule : CODE.memberLine
    if (y + height > bottom - 2) {
      cut = true
      break
    }
    if (item === undefined) parts.push(rule(y + CODE.rule / 2))
    else members.push({ line: item, y: y + CODE.memberLine / 2 })
    y += height
  }
  if (cut && members.length > 0) members[members.length - 1]!.line = '…'
  for (const member of members) {
    parts.push(
      text({ x: left, y: member.y, text: truncate(member.line, inner, FONT.member, measure), font: FONT.member, size: 10.5, weight: 400, family: MONO, fill: COLOURS['muted-foreground'], anchor: 'start' }),
    )
  }
  return `<g>${parts.join('')}</g>`
}

const TABLE = { radius: 6, head: 36, row: 20, key: 16, padLeft: 6, padRight: 10, gap: 5, type: 96 }

/**
 * A table, drawn as the canvas draws it: its name over a line on a tinted ground, then a row per
 * column with its key, its name and, at the right, its type. Rows the card has no room for are
 * left out.
 */
function tableCard(card: SceneCard, options: SvgOptions): string {
  const { measure } = options
  const kind = COLOURS[`kind-${card.kind}`]
  const [left, right] = [card.x, card.x + card.width]
  const parts: string[] = [
    `<rect x="${n(card.x + 0.5)}" y="${n(card.y + 0.5)}" width="${n(card.width - 1)}" height="${n(card.height - 1)}" rx="${TABLE.radius}" fill="${card.fill ? FILL_COLOUR_HEX[card.fill] : COLOURS.card}" stroke="${COLOURS.border}"/>`,
    `<path d="M${n(left + 0.5)} ${n(card.y + TABLE.head)}V${n(card.y + TABLE.radius)}Q${n(left + 0.5)} ${n(card.y + 0.5)} ${n(left + TABLE.radius)} ${n(card.y + 0.5)}H${n(right - TABLE.radius)}Q${n(right - 0.5)} ${n(card.y + 0.5)} ${n(right - 0.5)} ${n(card.y + TABLE.radius)}V${n(card.y + TABLE.head)}Z" fill="${kind}" fill-opacity="0.09"/>`,
    `<line x1="${n(left)}" y1="${n(card.y + TABLE.head)}" x2="${n(right)}" y2="${n(card.y + TABLE.head)}" stroke="${COLOURS.border}"/>`,
    text({ x: card.x + card.width / 2, y: card.y + TABLE.head / 2, text: truncate(card.name, card.width - 2 * CARD.padX, FONT.name, measure), font: FONT.name, size: 15, weight: 600, fill: COLOURS['card-foreground'] }),
  ]
  const room = Math.max(0, Math.floor((card.height - TABLE.head - 2) / TABLE.row))
  for (const [at, column] of (card.columns ?? []).slice(0, room).entries()) {
    const y = card.y + TABLE.head + at * TABLE.row + TABLE.row / 2
    const nameLeft = left + TABLE.padLeft + TABLE.key + TABLE.gap
    const type = column.type ? truncate(column.type, TABLE.type, FONT.type, measure) : ''
    const typeRoom = type ? measure(type, FONT.type) + TABLE.gap : 0
    if (column.key) {
      const sign = { primary: 'PK', foreign: 'FK', unique: 'UQ' }[column.key]
      const colour = column.key === 'primary' ? LINE_COLOUR_HEX.yellow : column.key === 'foreign' ? LINE_COLOUR_HEX.blue : COLOURS['muted-foreground']
      parts.push(text({ x: left + TABLE.padLeft + TABLE.key / 2, y, text: sign, font: FONT.badge, size: 8.5, weight: 600, family: MONO, fill: colour }))
    }
    parts.push(
      text({
        x: nameLeft,
        y,
        text: truncate(column.name, right - TABLE.padRight - typeRoom - nameLeft, FONT.description, measure),
        font: FONT.description,
        size: 11,
        weight: column.key === 'primary' ? 600 : 400,
        fill: COLOURS['card-foreground'],
        anchor: 'start',
      }),
    )
    if (type) parts.push(text({ x: right - TABLE.padRight, y, text: type, font: FONT.type, size: 10, weight: 400, family: MONO, fill: COLOURS['muted-foreground'], anchor: 'end' }))
  }
  return parts.join('')
}

function card(card: SceneCard, options: SvgOptions): string {
  if (card.kind === 'code') return codeCard(card, options)
  if (card.shape === 'table') return tableCard(card, options)
  const { measure } = options
  const outlined = card.shape ? boxShape(card.shape, card.width - 1, card.height - 1) : undefined
  const isNote = outlined?.look === 'note'
  const fill = card.fill ? FILL_COLOUR_HEX[card.fill] : isNote ? COLOURS.note : card.external ? COLOURS.muted : COLOURS.card
  // A box with a shape is drawn as its outline, and its text keeps clear of where that comes in,
  // as on the canvas (ObjectNode.vue).
  const outline = outlined
  const pad = {
    left: Math.max(CARD.padX, outline ? outline.inset.left + 8 : 0),
    right: Math.max(CARD.padX, outline ? outline.inset.right + 8 : 0),
    top: Math.max(CARD.padTop, outline ? outline.inset.top + 6 : 0),
    bottom: Math.max(CARD.padBottom, outline ? outline.inset.bottom + 4 : 0),
  }
  const inner = card.width - pad.left - pad.right
  const middle = card.x + pad.left + inner / 2
  const icons = card.icons.filter((icon) => options.icons?.has(icon))
  const iconsRoom = icons.length > 0 ? icons.length * CARD.iconStep + 14 : 0
  const parts: string[] = [
    outline
      ? `<g transform="translate(${n(card.x + 0.5)} ${n(card.y + 0.5)})">${outline.look === 'none' ? '' : `<path d="${outline.outline}" fill="${outline.look === 'solid' ? COLOURS.border : fill}" stroke="${outline.look === 'ground' || isNote ? 'none' : COLOURS.border}"/>`}${outline.lines.map((line) => `<path d="${line}" fill="none" stroke="${COLOURS.border}"/>`).join('')}</g>`
      : `<rect x="${n(card.x + 0.5)}" y="${n(card.y + 0.5)}" width="${n(card.width - 1)}" height="${n(card.height - 1)}" rx="${CARD.radius}" fill="${fill}" stroke="${COLOURS.border}"/>`,
  ]
  if (card.stuckOn !== undefined) parts.push(`<circle data-pin="" cx="${n(card.x + card.width / 2)}" cy="${n(card.y + 2)}" r="8" fill="${COLOURS['note-pin']}"/>`)
  if (card.kind === 'person') {
    const x = middle - CARD.figure / 2
    const y = card.y - CARD.figure / 2 - 2
    parts.push(
      `<rect x="${n(x + 0.5)}" y="${n(y + 0.5)}" width="${CARD.figure - 1}" height="${CARD.figure - 1}" rx="10" fill="${fill}" stroke="${COLOURS.border}"/>`,
      kindIcon('person', x + 6, y + 6, 16, COLOURS['card-foreground']),
    )
  }

  const name = wrap(card.name, Math.max(inner - 2 * iconsRoom, 20), 2, FONT.name, measure)
  const nameHeight = Math.max(name.length, 1) * CARD.nameLine
  // The description is Markdown; a picture has nothing but text for it, so it is drawn as plain
  // lines, as many as the card has room for (a card grows with its text), at least two.
  const room = card.height - pad.top - pad.bottom - CARD.typeLine - nameHeight - CARD.descriptionGap
  const most = Math.max(2, Math.floor(room / CARD.descriptionLine))
  const lines = card.description ? plainLines(card.description).flatMap((line) => wrap(line, inner, Infinity, FONT.description, measure)) : []
  const description =
    lines.length <= most
      ? lines
      : // The last line takes what is left, as far as it goes.
        [...lines.slice(0, most - 1), truncate(lines.slice(most - 1).join(' '), inner, FONT.description, measure)]
  const content = nameHeight + (description.length > 0 ? CARD.descriptionGap + description.length * CARD.descriptionLine : 0)
  const top = card.y + pad.top
  const bottom = card.y + card.height - pad.bottom - CARD.typeLine
  const start = top + (bottom - top - content) / 2
  name.forEach((line, i) =>
    parts.push(
      text({ x: middle, y: start + CARD.nameLine * (i + 0.5), text: line, font: FONT.name, size: 15, weight: 600, fill: COLOURS['card-foreground'] }),
    ),
  )
  icons.forEach((icon, i) =>
    parts.push(
      `<image x="${n(card.x + pad.left + i * CARD.iconStep)}" y="${n(start + nameHeight / 2 - CARD.icon / 2)}" width="${CARD.icon}" height="${CARD.icon}" preserveAspectRatio="xMidYMid meet" href="${options.icons!.get(icon)!}"/>`,
    ),
  )
  const below = start + nameHeight + CARD.descriptionGap
  description.forEach((line, i) =>
    parts.push(
      text({ x: middle, y: below + CARD.descriptionLine * (i + 0.5), text: line, font: FONT.description, size: 11, weight: 400, fill: COLOURS['muted-foreground'] }),
    ),
  )
  const type = cardType(card)
  if (type) parts.push(
    text({
      x: middle,
      y: bottom + CARD.typeLine / 2,
      text: truncate(type, inner, FONT.type, measure),
      font: FONT.type,
      size: 10,
      weight: 400,
      family: MONO,
      fill: COLOURS['muted-foreground'],
    }),
  )
  return `<g>${parts.join('')}</g>`
}

/** Vue Flow's closed arrow, in the units of the line's stroke. */
function arrow(id: string, colour: string): string {
  return `<marker id="${id}" viewBox="-10 -10 20 20" markerWidth="16" markerHeight="16" markerUnits="strokeWidth" orient="auto-start-reverse" refX="0" refY="0"><polyline points="-5,-4 0,0 -5,4 -5,-4" fill="${colour}" stroke="${colour}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></marker>`
}

/** The label of a connector: on the canvas colour, as Vue Flow draws it. */
const LABEL = { padX: 6, height: 22, radius: 4 }

function labelBox(connector: SceneConnector, measure: SvgOptions['measure']) {
  if (!connector.label || !connector.labelAt) return undefined
  const width = measure(connector.label, FONT.label) + 2 * LABEL.padX
  return { x: connector.labelAt.x - width / 2, y: connector.labelAt.y - LABEL.height / 2, width, height: LABEL.height }
}

function connector(connector: SceneConnector, measure: SvgOptions['measure']): string {
  const colour = connector.toFrame ? COLOURS.destructive : connector.colour ? LINE_COLOUR_HEX[connector.colour] : COLOURS['muted-foreground']
  const marker = connector.toFrame ? 'arrow-to-frame' : connector.colour ? `arrow-${connector.colour}` : 'arrow'
  const line = `<path d="${connector.path}" fill="none" stroke="${colour}" stroke-width="1.5" marker-end="url(#${marker})"/>`
  const box = labelBox(connector, measure)
  if (!box) return line
  return `${line}<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.width)}" height="${box.height}" rx="${LABEL.radius}" fill="${COLOURS.canvas}"/>${text({
    x: connector.labelAt!.x,
    y: connector.labelAt!.y,
    text: connector.label!,
    font: FONT.label,
    size: 12,
    weight: 500,
    fill: connector.toFrame ? COLOURS.destructive : COLOURS.foreground,
  })}`
}

function boundary(frame: NonNullable<Scene['boundary']>, measure: SvgOptions['measure']): string {
  const colour = COLOURS[`kind-${frame.kind}`]
  const nameWidth = measure(frame.name, FONT.boundaryName)
  const at = { x: frame.x + 20, y: frame.y + 28 }
  return [
    `<rect x="${n(frame.x + 1)}" y="${n(frame.y + 1)}" width="${n(frame.width - 2)}" height="${n(frame.height - 2)}" rx="22" fill="${COLOURS.foreground}" fill-opacity="0.02" stroke="${COLOURS['muted-foreground']}" stroke-opacity="0.45" stroke-width="2" stroke-dasharray="6 4"/>`,
    `<rect x="${n(at.x)}" y="${n(at.y - 12)}" width="24" height="24" rx="8" fill="${colour}" fill-opacity="0.14"/>`,
    kindIcon(frame.kind, at.x + 5, at.y - 7, 14, colour),
    text({ x: at.x + 32, y: at.y, text: frame.name, font: FONT.boundaryName, size: 14, weight: 600, fill: COLOURS.foreground, anchor: 'start' }),
    text({
      x: at.x + 32 + nameWidth + 8,
      y: at.y,
      text: `[${KIND_LABEL[frame.kind]}]`,
      font: FONT.small,
      size: 12,
      weight: 400,
      fill: COLOURS['muted-foreground'],
      anchor: 'start',
    }),
  ].join('')
}

/** The key's lines, each with its sign and its words. */
function keyEntries(key: Scene['key']): { sign: (x: number, y: number) => string; words: string }[] {
  const entries = key.kinds.map((kind) => ({
    sign: (x: number, y: number) =>
      `<rect x="${n(x)}" y="${n(y)}" width="20" height="20" rx="6" fill="${COLOURS.muted}"/>${kindIcon(kind, x + 4, y + 4, 12, COLOURS['muted-foreground'])}`,
    words: KIND_LABEL[kind],
  }))
  if (key.external) {
    entries.push({
      sign: (x, y) =>
        `<rect x="${n(x + 0.5)}" y="${n(y + 0.5)}" width="19" height="19" rx="6" fill="${COLOURS.muted}" stroke="${COLOURS.border}"/>`,
      words: 'External: not ours',
    })
  }
  const line = (width: number, colour: string) => (x: number, y: number) =>
    `<g transform="translate(${n(x)} ${n(y + 6)})"><path d="M0 4h15" stroke="${colour}" stroke-width="${width}"/><path d="M14 1l6 3-6 3z" fill="${colour}"/></g>`
  if (key.relationships) entries.push({ sign: line(1.5, COLOURS['muted-foreground']), words: 'Relationship' })
  if (key.toFrame) entries.push({ sign: line(1.5, COLOURS.destructive), words: 'Not yet to a part' })
  return entries
}

const KEY = { padX: 12, padTop: 8, heading: 16, gap: 6, row: 20, padBottom: 10 }

function keySize(key: Scene['key'], measure: SvgOptions['measure']) {
  const entries = keyEntries(key)
  if (entries.length === 0) return undefined
  const words = Math.max(measure('KEY', FONT.keyHeading) + 1.5, ...entries.map((entry) => 28 + measure(entry.words, FONT.small)))
  const height = KEY.padTop + KEY.heading + entries.length * KEY.row + (entries.length - 1) * KEY.gap + KEY.padBottom + 6
  return { entries, width: Math.ceil(words + 2 * KEY.padX), height }
}

function keyBox(size: NonNullable<ReturnType<typeof keySize>>, x: number, y: number): string {
  const parts = [
    `<rect x="${n(x + 0.5)}" y="${n(y + 0.5)}" width="${size.width - 1}" height="${size.height - 1}" rx="14" fill="${COLOURS.popover}" stroke="${COLOURS.border}"/>`,
    text({
      x: x + KEY.padX,
      y: y + KEY.padTop + KEY.heading / 2,
      text: 'KEY',
      font: FONT.keyHeading,
      size: 12,
      weight: 500,
      fill: COLOURS['muted-foreground'],
      anchor: 'start',
      extra: ' letter-spacing="0.3"',
    }),
  ]
  size.entries.forEach((entry, i) => {
    const top = y + KEY.padTop + KEY.heading + 6 + i * (KEY.row + KEY.gap)
    parts.push(
      entry.sign(x + KEY.padX, top),
      text({ x: x + KEY.padX + 28, y: top + KEY.row / 2, text: entry.words, font: FONT.small, size: 12, weight: 400, fill: COLOURS.foreground, anchor: 'start' }),
    )
  })
  return `<g>${parts.join('')}</g>`
}

/** The diagram as a standalone SVG document. Its width and height are whole pixels. */
export function diagramSvg(scene: Scene, options: SvgOptions): string {
  const { measure } = options
  const bounds: Bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
  for (const c of scene.cards) {
    grow(bounds, c.x, c.y, c.width, c.height)
    if (c.kind === 'person') grow(bounds, c.x, c.y - CARD.figure / 2 - 2)
  }
  for (const c of scene.connectors) {
    for (const point of c.points) grow(bounds, point.x, point.y)
    const box = labelBox(c, measure)
    if (box) grow(bounds, box.x, box.y, box.width, box.height)
  }
  if (scene.boundary) grow(bounds, scene.boundary.x, scene.boundary.y, scene.boundary.width, scene.boundary.height)
  if (bounds.left === Infinity) Object.assign(bounds, { left: 0, top: 0, right: 0, bottom: 0 })

  const key = keySize(scene.key, measure)
  const diagram = { width: bounds.right - bounds.left, height: bounds.bottom - bounds.top }
  const titleWidth = measure(scene.title, FONT.title)
  const width = Math.ceil(Math.max(diagram.width, titleWidth, key?.width ?? 0) + 2 * MARGIN)
  const diagramTop = MARGIN + TITLE_HEIGHT + GAP
  const keyTop = diagramTop + diagram.height + GAP
  const height = Math.ceil(key ? keyTop + key.height + MARGIN : diagramTop + diagram.height + MARGIN)

  const font = options.font
    ? `<style>@font-face{font-family:'Geist Variable';font-style:normal;font-weight:100 900;src:url(${options.font}) format('woff2')}</style>`
    : ''
  const shift = `translate(${n(MARGIN - bounds.left)} ${n(diagramTop - bounds.top)})`
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
    `<title>${escapeXml(scene.title)}</title>`,
    `<defs>${font}${arrow('arrow', COLOURS['muted-foreground'])}${scene.connectors.some((c) => c.toFrame) ? arrow('arrow-to-frame', COLOURS.destructive) : ''}${LINE_COLOURS.filter((colour) => scene.connectors.some((c) => !c.toFrame && c.colour === colour)).map((colour) => arrow(`arrow-${colour}`, LINE_COLOUR_HEX[colour])).join('')}</defs>`,
    `<rect width="${width}" height="${height}" fill="${COLOURS.canvas}"/>`,
    text({ x: MARGIN, y: MARGIN + TITLE_HEIGHT / 2, text: scene.title, font: FONT.title, size: 16, weight: 600, fill: COLOURS.foreground, anchor: 'start' }),
    `<g transform="${shift}">`,
    scene.boundary ? boundary(scene.boundary, measure) : '',
    // Connectors under the cards, their labels over the lines, as on the canvas.
    ...scene.connectors.map((c) => connector(c, measure)),
    ...(scene.tethers ?? []).map(
      ({ from, to }) =>
        `<path data-tether="" d="M${n(from.x)} ${n(from.y)}L${n(to.x)} ${n(to.y)}" fill="none" stroke="${COLOURS['note-pin']}" stroke-width="1.5" stroke-dasharray="4 4"/><circle cx="${n(to.x)}" cy="${n(to.y)}" r="3.5" fill="${COLOURS['note-pin']}"/>`,
    ),
    ...scene.cards.map((c) => card(c, options)),
    '</g>',
    key ? keyBox(key, MARGIN, keyTop) : '',
    '</svg>',
  ].join('\n')
}
