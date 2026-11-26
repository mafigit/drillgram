import type { C4Level } from '../index'

/**
 * The shape of an object. `box` is the plain shape of the Basic library; `person` to `component`
 * are the C4 library's elements (c4model.com); `code` is an element of code, as on C4's code
 * diagrams (a class, an interface, a function, a table): its `technology` says what it is and in
 * which language ("Go struct").
 */
export type ElementKind = 'box' | 'person' | 'softwareSystem' | 'container' | 'component' | 'code'

/**
 * The outlines a box can have instead of a plain rectangle: what flowcharts and architecture
 * drawings use to say what a thing is (a database is a cylinder, a queue a lying one, a decision
 * a diamond). The geometry is our own: no shape library was copied.
 */
export const BOX_SHAPES = [
  'cylinder',
  'queue',
  'document',
  'hexagon',
  'diamond',
  'circle',
  'stadium',
  'parallelogram',
  'cloud',
  'subroutine',
  // What D2 has beyond those.
  'page',
  'folder',
  'step',
  'callout',
  'storedData',
  'text',
  // What a Mermaid flowchart has beyond those.
  'leanLeft',
  'trapezoid',
  'invTrapezoid',
  'odd',
  'doubleCircle',
  'card',
  'delay',
  'disk',
  'display',
  'divided',
  'triangle',
  'flippedTriangle',
  'internalStorage',
  'linedDocument',
  'linedProcess',
  'loopLimit',
  'manualInput',
  'documents',
  'processes',
  'paperTape',
  'taggedDocument',
  'taggedProcess',
  'brace',
  'braceRight',
  'braces',
  'bang',
  'browser',
  'bucket',
  'console',
  'dataStore',
  // What Miro's shape panel has beyond those.
  'star',
  'pentagon',
  'octagon',
  'cross',
  'arrowRight',
  'arrowLeft',
  'arrowBoth',
  'tag',
  'circlePlus',
  'circleCross',
  'filledCircle',
  'offPage',
  'hourglass',
  'bolt',
  'magneticTape',
  'bracket',
  'speechBubble',
  // A table of a database: its columns stand in it, one to a row (`columns`).
  'table',
] as const
export type BoxShape = (typeof BOX_SHAPES)[number]

export function isBoxShape(value: unknown): value is BoxShape {
  return typeof value === 'string' && (BOX_SHAPES as readonly string[]).includes(value)
}

/**
 * The colours a connection can have. A name, not a value: each theme draws it in its own tone
 * (`--line-<name>` in the app's stylesheet), so a red line is readable on a light and a dark
 * ground alike.
 */
export const LINE_COLOURS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'] as const
export type LineColour = (typeof LINE_COLOURS)[number]

export function isLineColour(value: unknown): value is LineColour {
  return typeof value === 'string' && (LINE_COLOURS as readonly string[]).includes(value)
}

/** Each colour as a value, for what needs one: a file (D2, the SVG export). The light theme's. */
export const LINE_COLOUR_HEX: Record<LineColour, string> = {
  red: '#dc2626',
  orange: '#ea580c',
  yellow: '#ca8a04',
  green: '#16a34a',
  teal: '#0d9488',
  blue: '#2563eb',
  purple: '#9333ea',
  pink: '#db2777',
}

/** Hue (0 to 360) and how strong the colour is (0: a grey) of `#rgb` or `#rrggbb`. */
function hueOf(hex: string): { hue: number; strength: number } | undefined {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex)
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  const parts = short ? short.slice(1).map((c) => c + c) : long?.slice(1)
  if (!parts) return undefined
  const [r, g, b] = parts.map((part) => parseInt(part, 16) / 255) as [number, number, number]
  const [max, min] = [Math.max(r, g, b), Math.min(r, g, b)]
  if (max === min) return { hue: 0, strength: 0 }
  const hue = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4
  return { hue: (hue * 60 + 360) % 360, strength: max === 0 ? 0 : (max - min) / max }
}

/**
 * The colour of ours nearest to one a file gives: one of our names, or a value (`#rgb`,
 * `#rrggbb`), by its hue. A grey, black or white, or what is no colour, is none.
 */
export function nearestLineColour(colour: string): LineColour | undefined {
  const said = colour.trim().toLowerCase()
  if (isLineColour(said)) return said
  const found = hueOf(said)
  if (!found || found.strength < 0.25) return undefined
  const apart = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))
  return [...LINE_COLOURS].sort((a, b) => apart(hueOf(LINE_COLOUR_HEX[a])!.hue, found.hue) - apart(hueOf(LINE_COLOUR_HEX[b])!.hue, found.hue))[0]
}

/** What a column of a table is for its table: its key, a pointer to another table, or unique. */
export const COLUMN_KEYS = ['primary', 'foreign', 'unique'] as const
export type ColumnKey = (typeof COLUMN_KEYS)[number]

/** A column of a table (a box with the shape `table`): its name, and what it holds. */
export interface TableColumn {
  name: string
  /** As the database says it: `uuid`, `varchar(80)`. */
  type?: string
  key?: ColumnKey
}

/** What is wrong with the columns of a table, in words; nothing when they are columns. */
export function columnsProblem(columns: unknown): string | undefined {
  if (!Array.isArray(columns)) return 'its columns are no list'
  for (const column of columns as unknown[]) {
    if (typeof column !== 'object' || column === null) return 'a column is no column'
    const { name, type, key } = column as Record<string, unknown>
    if (typeof name !== 'string' || name.trim() === '') return 'a column has no name'
    if (type !== undefined && (typeof type !== 'string' || type.trim() === '')) return `the column ${name} has an empty type`
    if (key !== undefined && !(COLUMN_KEYS as readonly unknown[]).includes(key)) return `the column ${name} has an unknown key: ${String(key)}`
  }
  return undefined
}

/** The kinds that take one of these shapes: a person and a piece of code are drawn their own way. */
export function canHaveShape(kind: ElementKind): boolean {
  return kind !== 'person' && kind !== 'code'
}

/** Optional strings are either absent or non-empty, never `''`. */
export interface DiagramElement {
  /** Matches `/^[A-Za-z_][A-Za-z0-9_]*$/`. */
  id: string
  kind: ElementKind
  name: string
  description?: string
  /** Containers, components and code elements only. */
  technology?: string
  /** `true` only when set; never `external: false`. */
  external?: boolean
  /** Its outline, when it is not a plain rectangle. Not for a person or a piece of code. */
  shape?: BoxShape
  /** The columns of a table, in their order. Only with the shape `table`. */
  columns?: TableColumn[]
  /**
   * The id of the element of the diagram this one stands inside, as a node in a subgraph of a
   * flowchart. Absent for one that stands on the diagram itself. The text formats the app writes
   * (Mermaid C4, D2) have one frame only, the `boundary`, and never set it.
   */
  inside?: string
}

export interface Relationship {
  from: string
  to: string
  label?: string
  technology?: string
  /** The colour of its line; the theme's usual grey without. */
  colour?: LineColour
}

/**
 * The object a Container or Component diagram is about, drawn as a frame around its parts (C4's
 * boundary). It is no element of the diagram, but a relationship may run to or from it.
 */
export interface Boundary {
  /** Matches `ELEMENT_ID` and is no element's id. */
  id: string
  kind: 'softwareSystem' | 'container'
  name: string
  /** Ids of the elements inside the frame, in the order of `elements`. */
  members: string[]
}

/** The format-neutral C4 diagram that every `DiagramFormat` converts to and from. */
export interface Diagram {
  level: C4Level
  title?: string
  elements: DiagramElement[]
  relationships: Relationship[]
  boundary?: Boundary
}

export class DiagramFormatError extends Error {
  constructor(
    message: string,
    /** 1-based line of the input that caused the error, when parsing. */
    readonly line?: number,
  ) {
    super(message)
    this.name = 'DiagramFormatError'
  }
}

export const ELEMENT_ID = /^[A-Za-z_][A-Za-z0-9_]*$/

export function validateDiagram(diagram: Diagram): void {
  const ids = new Set<string>()
  for (const element of diagram.elements) {
    if (!ELEMENT_ID.test(element.id)) {
      throw new DiagramFormatError(`Invalid element id: ${JSON.stringify(element.id)}`)
    }
    if (ids.has(element.id)) {
      throw new DiagramFormatError(`Duplicate element id: ${element.id}`)
    }
    ids.add(element.id)
    if (
      element.technology !== undefined &&
      (element.kind === 'person' || element.kind === 'softwareSystem' || element.kind === 'box')
    ) {
      throw new DiagramFormatError(`A ${element.kind} has no technology: ${element.id}`)
    }
  }
  for (const element of diagram.elements) {
    if (element.shape === undefined) continue
    if (!isBoxShape(element.shape)) throw new DiagramFormatError(`Element ${element.id} has an unknown shape: ${String(element.shape)}`)
    if (!canHaveShape(element.kind)) throw new DiagramFormatError(`A ${element.kind} has no shape of its own to choose: ${element.id}`)
  }
  for (const element of diagram.elements) {
    if (element.columns === undefined) continue
    if (element.shape !== 'table') throw new DiagramFormatError(`Element ${element.id} has columns but is no table`)
    const problem = columnsProblem(element.columns)
    if (problem) throw new DiagramFormatError(`Element ${element.id}: ${problem}`)
  }
  for (const element of diagram.elements) {
    if (element.inside === undefined) continue
    if (!ids.has(element.inside)) throw new DiagramFormatError(`Element ${element.id} stands inside an unknown element: ${String(element.inside)}`)
    // Inside itself by no way round.
    const above = new Set([element.id])
    for (let at: string | undefined = element.inside; at !== undefined; at = diagram.elements.find((e) => e.id === at)?.inside) {
      if (above.has(at)) throw new DiagramFormatError(`Element ${element.id} stands inside itself`)
      above.add(at)
    }
  }
  const boundary = diagram.boundary
  if (boundary) {
    if (!ELEMENT_ID.test(boundary.id)) {
      throw new DiagramFormatError(`Invalid boundary id: ${JSON.stringify(boundary.id)}`)
    }
    if (ids.has(boundary.id)) throw new DiagramFormatError(`The boundary has an element's id: ${boundary.id}`)
    if (boundary.kind !== 'softwareSystem' && boundary.kind !== 'container') {
      throw new DiagramFormatError(`A boundary is a software system or a container, not a ${boundary.kind}`)
    }
    const inOrder = diagram.elements.map((element) => element.id).filter((id) => boundary.members.includes(id))
    if (inOrder.length !== boundary.members.length || inOrder.some((id, i) => boundary.members[i] !== id)) {
      throw new DiagramFormatError('The members of the boundary are known elements, each once, in the order of the elements')
    }
  }
  const ends = new Set([...ids, ...(boundary ? [boundary.id] : [])])
  for (const relationship of diagram.relationships) {
    if (relationship.colour !== undefined && !isLineColour(relationship.colour)) {
      throw new DiagramFormatError(`Relationship ${relationship.from} -> ${relationship.to} has an unknown colour: ${String(relationship.colour)}`)
    }
    for (const end of [relationship.from, relationship.to]) {
      if (!ends.has(end)) {
        throw new DiagramFormatError(
          `Relationship ${relationship.from} -> ${relationship.to} refers to an unknown element: ${end}`,
        )
      }
    }
  }
}
