import type { BoxShape } from '@drillgram/model'

// The outlines a box can have instead of a plain rectangle, as paths for a box of any size.
// Drawn here from scratch, from what the shapes are in flowcharts and architecture drawings (a
// cylinder for a database, a lying one for a queue, a diamond for a decision): no file of anybody
// else was traced. The canvas (ObjectNode.vue) and the SVG export
// (export/svg.ts) draw the same paths.

export interface ShapeDrawing {
  /** The outline: one closed path, filled and stroked. */
  outline: string
  /** Lines on it, stroked only: the rim of a cylinder, the bars of a subroutine. */
  lines: string[]
  /** The room the outline takes from the box at each side, in px: the text keeps clear of it. */
  inset: { top: number; right: number; bottom: number; left: number }
  /**
   * How the outline shows, when not as a line around a ground: `ground` is the ground alone (a
   * data store has a line above and below, none at its sides), `none` is nothing (a text, a
   * comment beside a brace), `solid` is filled with the colour of the line (a junction). The
   * outline is then still the card's extent.
   */
  look?: 'ground' | 'none' | 'solid' | 'note'
}

/** What each shape is called and is for, for the picker and the form. */
export const SHAPE_ABOUT: Record<BoxShape, { label: string; about: string }> = {
  cylinder: { label: 'Database', about: 'A cylinder: a database or another store' },
  queue: { label: 'Queue', about: 'A lying cylinder: a queue, a topic, a stream' },
  document: { label: 'Document', about: 'A sheet with a wavy edge: a file, a report' },
  hexagon: { label: 'Hexagon', about: 'A six-sided box: a service, a step that prepares' },
  diamond: { label: 'Decision', about: 'A diamond: a question with more than one way on' },
  circle: { label: 'Circle', about: 'A round box: a start, an end, an event' },
  stadium: { label: 'Pill', about: 'A box with round ends: where a flow starts or stops' },
  parallelogram: { label: 'Input or output', about: 'A slanted box: what goes in or comes out' },
  cloud: { label: 'Cloud', about: 'A cloud: the internet, a network, something outside' },
  subroutine: { label: 'Subroutine', about: 'A box with a bar at each side: a step defined elsewhere' },
  page: { label: 'Page', about: 'A sheet with a folded corner: a page, a note' },
  folder: { label: 'Folder', about: 'A folder with its tab: a directory, a package' },
  step: { label: 'Step', about: 'An arrow of a box: one step of a chain' },
  callout: { label: 'Callout', about: 'A speech bubble: a remark on something' },
  storedData: { label: 'Stored data', about: 'A box bent at both sides: data that is kept' },
  text: { label: 'Text', about: 'Words alone, without an outline' },
  leanLeft: { label: 'Output or input', about: 'A box slanted to the left' },
  trapezoid: { label: 'Trapezoid', about: 'Wider at the bottom: a priority action' },
  invTrapezoid: { label: 'Manual operation', about: 'Wider at the top: a task done by hand' },
  odd: { label: 'Flag', about: 'A box with a notch at its left: a signal' },
  doubleCircle: { label: 'Double circle', about: 'A ring in a ring: where a flow stops' },
  card: { label: 'Card', about: 'A box with one corner cut: a punched card' },
  delay: { label: 'Delay', about: 'Round at one end: a wait' },
  disk: { label: 'Disk', about: 'A cylinder with two rims: disk storage' },
  display: { label: 'Display', about: 'Pointed at the left, round at the right: what is shown' },
  divided: { label: 'Divided process', about: 'A box with a line under its top' },
  triangle: { label: 'Triangle', about: 'Point up: an extract' },
  flippedTriangle: { label: 'Flipped triangle', about: 'Point down: a file kept by hand' },
  internalStorage: { label: 'Internal storage', about: 'A window pane: memory inside a system' },
  linedDocument: { label: 'Lined document', about: 'A document with a line down its left' },
  linedProcess: { label: 'Lined process', about: 'A box with a line down its left' },
  loopLimit: { label: 'Loop limit', about: 'A box with both top corners cut: where a loop turns' },
  manualInput: { label: 'Manual input', about: 'A box with a sloping top: typed in by hand' },
  documents: { label: 'Documents', about: 'A pile of documents' },
  processes: { label: 'Processes', about: 'A pile of boxes: the same step many times' },
  paperTape: { label: 'Paper tape', about: 'Wavy above and below: a tape' },
  taggedDocument: { label: 'Tagged document', about: 'A document with a marked corner' },
  taggedProcess: { label: 'Tagged process', about: 'A box with a marked corner' },
  brace: { label: 'Comment', about: 'Words beside a curly brace' },
  braceRight: { label: 'Comment, brace right', about: 'Words with a curly brace at their right' },
  braces: { label: 'Comment, two braces', about: 'Words between curly braces' },
  bang: { label: 'Bang', about: 'A burst: something sudden' },
  browser: { label: 'Browser', about: 'A window with its bar: a web page' },
  bucket: { label: 'Bucket', about: 'A bucket: object storage' },
  console: { label: 'Console', about: 'A window with a prompt: a terminal' },
  dataStore: { label: 'Data store', about: 'A line above and below: a store in a data flow' },
  star: { label: 'Star', about: 'A five-pointed star: something to stand out' },
  pentagon: { label: 'Pentagon', about: 'A five-sided box' },
  octagon: { label: 'Octagon', about: 'An eight-sided box: a stop' },
  cross: { label: 'Cross', about: 'A plus: something to add, a help' },
  arrowRight: { label: 'Arrow right', about: 'A block arrow to the right: a way on' },
  arrowLeft: { label: 'Arrow left', about: 'A block arrow to the left: a way back' },
  arrowBoth: { label: 'Arrow both ways', about: 'A block arrow to both sides: an exchange' },
  tag: { label: 'Tag', about: 'A box pointed at its right: a label, a milestone' },
  circlePlus: { label: 'Or', about: 'A circle with a plus: one way or the other' },
  circleCross: { label: 'Summing junction', about: 'A circle with a cross: flows that join' },
  filledCircle: { label: 'Junction', about: 'A filled circle: where lines meet' },
  offPage: { label: 'Off-page link', about: 'A box pointed at its bottom: goes on elsewhere' },
  hourglass: { label: 'Collate', about: 'An hourglass: what is put in order' },
  bolt: { label: 'Lightning bolt', about: 'A bolt: a link of communication' },
  magneticTape: { label: 'Magnetic tape', about: 'A reel with its tape: data on tape' },
  bracket: { label: 'Comment, bracket', about: 'Words beside a square bracket' },
  speechBubble: { label: 'Speech bubble', about: 'An oval bubble: something said' },
  table: { label: 'Table', about: 'A table with its columns: name, type and key of each' },
  stickyNote: { label: 'Sticky note', about: 'A post-it: dropped on a shape it sticks there and goes where the shape goes' },
}

/** The shapes of the Basic library; the others stand in the Flowchart library. */
export const BASIC_SHAPES: BoxShape[] = [
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
  'page',
  'folder',
  'step',
  'callout',
  'storedData',
  'text',
  'table',
  'star',
  'pentagon',
  'octagon',
  'cross',
  'arrowRight',
  'arrowLeft',
  'arrowBoth',
  'tag',
]

const n = (value: number) => Math.round(value * 100) / 100

/** The cloud, in a box one wide and one high. */
const CLOUD = [
  [0.25, 0.92],
  [0.04, 0.94, -0.02, 0.6, 0.13, 0.5],
  [0.03, 0.22, 0.3, 0.08, 0.42, 0.24],
  [0.5, 0.0, 0.84, 0.02, 0.83, 0.32],
  [1.0, 0.3, 1.04, 0.64, 0.88, 0.7],
  [0.95, 0.94, 0.7, 0.98, 0.62, 0.9],
  [0.52, 1.0, 0.34, 1.0, 0.25, 0.92],
] as const

/** An ellipse that keeps `gap` from the sides of the box. */
const ellipse = (gap: number, w: number, h: number) =>
  `M${n(gap)} ${n(h / 2)}A${n(w / 2 - gap)} ${n(h / 2 - gap)} 0 1 1 ${n(w - gap)} ${n(h / 2)}A${n(w / 2 - gap)} ${n(h / 2 - gap)} 0 1 1 ${n(gap)} ${n(h / 2)}Z`

/** A sheet with a wavy lower edge, the wave `a` high. */
const sheet = (w: number, h: number, a: number) => `M0 0H${n(w)}V${n(h - a)}Q${n(w * 0.75)} ${n(h - 3 * a)} ${n(w / 2)} ${n(h - a)}T0 ${n(h - a)}Z`

/** The room a curly brace takes. */
const BRACE = 12

/** A curly brace over the height of the box: its point at `x`, opening towards `way` (1: right). */
function brace(x: number, way: 1 | -1, h: number): string {
  const r = Math.min(10, h / 8)
  const [far, mid] = [x + way * BRACE, x + (way * BRACE) / 2]
  return `M${n(far)} 0Q${n(mid)} 0 ${n(mid)} ${n(r)}V${n(h / 2 - r)}Q${n(mid)} ${n(h / 2)} ${n(x)} ${n(h / 2)}Q${n(mid)} ${n(h / 2)} ${n(mid)} ${n(h / 2 + r)}V${n(h - r)}Q${n(mid)} ${n(h)} ${n(far)} ${n(h)}`
}

/** A closed path through points given in a box one wide and one high. */
const polygon = (w: number, h: number, points: readonly (readonly [number, number])[]) =>
  `M${points.map(([x, y]) => `${n(x * w)} ${n(y * h)}`).join('L')}Z`

/** A five-pointed star filling the box: its points and the corners between them. */
const STAR = Array.from({ length: 10 }, (_, at) => {
  const angle = -Math.PI / 2 + (at * Math.PI) / 5
  const reach = at % 2 === 0 ? 1 : 0.42
  // The star is 2 cos 18° wide and 1 + cos 36° high: scaled to fill the box.
  return [0.5 + (Math.cos(angle) * reach) / (2 * Math.cos(Math.PI / 10)), (1 + Math.sin(angle) * reach) / (1 + Math.cos(Math.PI / 5))] as const
})

/** The drawing of a shape for a box `w` wide and `h` high, its top left corner at 0, 0. */
export function boxShape(shape: BoxShape, w: number, h: number): ShapeDrawing {
  const none = { top: 0, right: 0, bottom: 0, left: 0 }
  const box = `M0 0H${n(w)}V${n(h)}H0Z`
  switch (shape) {
    case 'cylinder': {
      const ry = Math.min(12, h / 6)
      return {
        outline: `M0 ${n(ry)}A${n(w / 2)} ${n(ry)} 0 0 1 ${n(w)} ${n(ry)}V${n(h - ry)}A${n(w / 2)} ${n(ry)} 0 0 1 0 ${n(h - ry)}Z`,
        lines: [`M0 ${n(ry)}A${n(w / 2)} ${n(ry)} 0 0 0 ${n(w)} ${n(ry)}`],
        inset: { ...none, top: 2 * ry, bottom: ry },
      }
    }
    case 'queue': {
      const rx = Math.min(12, w / 10)
      return {
        outline: `M${n(rx)} 0H${n(w - rx)}A${n(rx)} ${n(h / 2)} 0 0 1 ${n(w - rx)} ${n(h)}H${n(rx)}A${n(rx)} ${n(h / 2)} 0 0 1 ${n(rx)} 0Z`,
        lines: [`M${n(w - rx)} 0A${n(rx)} ${n(h / 2)} 0 0 0 ${n(w - rx)} ${n(h)}`],
        inset: { ...none, left: rx, right: 2 * rx },
      }
    }
    case 'document': {
      const a = Math.min(10, h / 8)
      return {
        outline: `M0 0H${n(w)}V${n(h - a)}Q${n(w * 0.75)} ${n(h - 3 * a)} ${n(w / 2)} ${n(h - a)}T0 ${n(h - a)}Z`,
        lines: [],
        inset: { ...none, bottom: 2 * a },
      }
    }
    case 'hexagon': {
      const d = Math.min(24, w / 6)
      return { outline: `M${n(d)} 0H${n(w - d)}L${n(w)} ${n(h / 2)}L${n(w - d)} ${n(h)}H${n(d)}L0 ${n(h / 2)}Z`, lines: [], inset: { ...none, left: d, right: d } }
    }
    case 'diamond':
      return {
        outline: `M${n(w / 2)} 0L${n(w)} ${n(h / 2)}L${n(w / 2)} ${n(h)}L0 ${n(h / 2)}Z`,
        lines: [],
        inset: { top: h / 5, bottom: h / 5, left: w / 5, right: w / 5 },
      }
    case 'circle':
      return {
        outline: `M0 ${n(h / 2)}A${n(w / 2)} ${n(h / 2)} 0 1 1 ${n(w)} ${n(h / 2)}A${n(w / 2)} ${n(h / 2)} 0 1 1 0 ${n(h / 2)}Z`,
        lines: [],
        inset: { top: h / 8, bottom: h / 8, left: w / 8, right: w / 8 },
      }
    case 'stadium': {
      // Round ends as far as the box allows: on a box higher than wide they meet in the middle.
      const r = Math.min(h, w) / 2
      return {
        outline: `M${n(r)} 0H${n(w - r)}A${n(r)} ${n(h / 2)} 0 0 1 ${n(w - r)} ${n(h)}H${n(r)}A${n(r)} ${n(h / 2)} 0 0 1 ${n(r)} 0Z`,
        lines: [],
        inset: { ...none, left: r / 3, right: r / 3 },
      }
    }
    case 'parallelogram': {
      const s = Math.min(20, w / 8)
      return { outline: `M${n(s)} 0H${n(w)}L${n(w - s)} ${n(h)}H0Z`, lines: [], inset: { ...none, left: s, right: s } }
    }
    case 'cloud': {
      const [start, ...curves] = CLOUD
      const at = (x: number, y: number) => `${n(x * w)} ${n(y * h)}`
      const path = curves.map(([x1, y1, x2, y2, x, y]) => `C${at(x1, y1)} ${at(x2, y2)} ${at(x, y)}`).join('')
      return { outline: `M${at(start[0], start[1])}${path}Z`, lines: [], inset: { top: h / 6, bottom: h / 8, left: w / 8, right: w / 8 } }
    }
    case 'subroutine': {
      const bar = 10
      return { outline: box, lines: [`M${bar} 0V${n(h)}`, `M${n(w - bar)} 0V${n(h)}`], inset: { ...none, left: bar, right: bar } }
    }
    case 'page': {
      const f = Math.min(18, w / 8, h / 4)
      return { outline: `M0 0H${n(w - f)}L${n(w)} ${n(f)}V${n(h)}H0Z`, lines: [`M${n(w - f)} 0V${n(f)}H${n(w)}`], inset: none }
    }
    case 'folder': {
      const t = Math.min(14, h / 7)
      const tab = Math.min(80, w * 0.4)
      return { outline: `M0 0H${n(tab)}L${n(tab + t / 2)} ${n(t)}H${n(w)}V${n(h)}H0Z`, lines: [`M0 ${n(t)}H${n(tab + t / 2)}`], inset: { ...none, top: t } }
    }
    case 'step': {
      const d = Math.min(22, w / 7)
      return { outline: `M0 0H${n(w - d)}L${n(w)} ${n(h / 2)}L${n(w - d)} ${n(h)}H0L${n(d)} ${n(h / 2)}Z`, lines: [], inset: { ...none, left: d, right: d } }
    }
    case 'callout': {
      const t = Math.min(16, h / 6)
      return { outline: `M0 0H${n(w)}V${n(h - t)}H${n(w * 0.34)}L${n(w * 0.2)} ${n(h)}V${n(h - t)}H0Z`, lines: [], inset: { ...none, bottom: t } }
    }
    case 'storedData': {
      const c = Math.min(14, w / 10)
      return {
        outline: `M${n(c)} 0H${n(w)}A${n(c)} ${n(h / 2)} 0 0 0 ${n(w)} ${n(h)}H${n(c)}A${n(c)} ${n(h / 2)} 0 0 1 ${n(c)} 0Z`,
        lines: [],
        inset: { ...none, left: c, right: 2 * c },
      }
    }
    case 'text':
      return { outline: box, lines: [], inset: none, look: 'none' }
    case 'leanLeft': {
      const s = Math.min(20, w / 8)
      return { outline: `M0 0H${n(w - s)}L${n(w)} ${n(h)}H${n(s)}Z`, lines: [], inset: { ...none, left: s, right: s } }
    }
    case 'trapezoid': {
      const s = Math.min(24, w / 7)
      return { outline: `M${n(s)} 0H${n(w - s)}L${n(w)} ${n(h)}H0Z`, lines: [], inset: { ...none, left: s, right: s } }
    }
    case 'invTrapezoid': {
      const s = Math.min(24, w / 7)
      return { outline: `M0 0H${n(w)}L${n(w - s)} ${n(h)}H${n(s)}Z`, lines: [], inset: { ...none, left: s, right: s } }
    }
    case 'odd': {
      const d = Math.min(20, w / 8)
      return { outline: `M0 0H${n(w)}V${n(h)}H0L${n(d)} ${n(h / 2)}Z`, lines: [], inset: { ...none, left: d } }
    }
    case 'doubleCircle': {
      const g = 5
      return {
        outline: ellipse(0, w, h),
        lines: [ellipse(g, w, h).slice(0, -1)],
        inset: { top: h / 8 + g, bottom: h / 8 + g, left: w / 8 + g, right: w / 8 + g },
      }
    }
    case 'card': {
      const d = Math.min(16, w / 8, h / 4)
      return { outline: `M${n(d)} 0H${n(w)}V${n(h)}H0V${n(d)}Z`, lines: [], inset: none }
    }
    case 'delay': {
      const r = Math.min(h, w) / 2
      return { outline: `M0 0H${n(w - r)}A${n(r)} ${n(h / 2)} 0 0 1 ${n(w - r)} ${n(h)}H0Z`, lines: [], inset: { ...none, right: r / 3 } }
    }
    case 'disk': {
      // Flatter than the database on a low box: the second rim takes room from the text too.
      const ry = Math.min(12, h / 7)
      const gap = Math.min(6, h / 16)
      const rim = (y: number) => `M0 ${n(y)}A${n(w / 2)} ${n(ry)} 0 0 0 ${n(w)} ${n(y)}`
      return {
        outline: `M0 ${n(ry)}A${n(w / 2)} ${n(ry)} 0 0 1 ${n(w)} ${n(ry)}V${n(h - ry)}A${n(w / 2)} ${n(ry)} 0 0 1 0 ${n(h - ry)}Z`,
        lines: [rim(ry), rim(ry + gap)],
        inset: { ...none, top: 2 * ry + gap, bottom: ry },
      }
    }
    case 'display': {
      const d = Math.min(20, w / 8)
      return {
        outline: `M${n(d)} 0H${n(w - d)}A${n(d)} ${n(h / 2)} 0 0 1 ${n(w - d)} ${n(h)}H${n(d)}L0 ${n(h / 2)}Z`,
        lines: [],
        inset: { ...none, left: d, right: d },
      }
    }
    case 'divided': {
      const t = Math.min(12, h / 7)
      return { outline: box, lines: [`M0 ${n(t)}H${n(w)}`], inset: { ...none, top: t } }
    }
    case 'triangle':
      return { outline: `M${n(w / 2)} 0L${n(w)} ${n(h)}H0Z`, lines: [], inset: { top: h * 0.35, bottom: 0, left: w * 0.2, right: w * 0.2 } }
    case 'flippedTriangle':
      return { outline: `M0 0H${n(w)}L${n(w / 2)} ${n(h)}Z`, lines: [], inset: { top: 0, bottom: h * 0.35, left: w * 0.2, right: w * 0.2 } }
    case 'internalStorage': {
      const g = 10
      return { outline: box, lines: [`M${g} 0V${n(h)}`, `M0 ${g}H${n(w)}`], inset: { ...none, left: g, top: g } }
    }
    case 'linedDocument': {
      const a = Math.min(10, h / 8)
      const g = 10
      return { outline: sheet(w, h, a), lines: [`M${g} 0V${n(h - a)}`], inset: { ...none, left: g, bottom: 2 * a } }
    }
    case 'linedProcess': {
      const g = 10
      return { outline: box, lines: [`M${g} 0V${n(h)}`], inset: { ...none, left: g } }
    }
    case 'loopLimit': {
      const d = Math.min(16, w / 8, h / 4)
      return { outline: `M${n(d)} 0H${n(w - d)}L${n(w)} ${n(d)}V${n(h)}H0V${n(d)}Z`, lines: [], inset: none }
    }
    case 'manualInput': {
      const s = Math.min(18, h / 5)
      return { outline: `M0 ${n(s)}L${n(w)} 0V${n(h)}H0Z`, lines: [], inset: { ...none, top: s } }
    }
    case 'documents': {
      // Three sheets, each a little up and to the right of the one before it; the front one is
      // where the text stands.
      const a = Math.min(10, h / 8)
      const g = 5
      const front = w - 2 * g
      return {
        outline: `M0 ${2 * g}H${g}V${g}H${2 * g}V0H${n(w)}V${n(h - a - 2 * g)}H${n(w - g)}V${n(h - a - g)}H${n(front)}V${n(h - a)}Q${n(front * 0.75)} ${n(h - 3 * a)} ${n(front / 2)} ${n(h - a)}T0 ${n(h - a)}Z`,
        lines: [`M${2 * g} ${g}H${n(w - g)}V${n(h - a - 2 * g)}`, `M${g} ${2 * g}H${n(front)}V${n(h - a - g)}`],
        inset: { ...none, top: 2 * g, right: 2 * g, bottom: 2 * a },
      }
    }
    case 'processes': {
      const g = 5
      return {
        outline: `M0 ${2 * g}H${g}V${g}H${2 * g}V0H${n(w)}V${n(h - 2 * g)}H${n(w - g)}V${n(h - g)}H${n(w - 2 * g)}V${n(h)}H0Z`,
        lines: [`M${2 * g} ${g}H${n(w - g)}V${n(h - 2 * g)}`, `M${g} ${2 * g}H${n(w - 2 * g)}V${n(h - g)}`],
        inset: { ...none, top: 2 * g, right: 2 * g },
      }
    }
    case 'paperTape': {
      const a = Math.min(6, h / 12)
      return {
        outline: `M0 ${n(2 * a)}Q${n(w / 4)} 0 ${n(w / 2)} ${n(2 * a)}T${n(w)} ${n(2 * a)}V${n(h - 2 * a)}Q${n(w * 0.75)} ${n(h - 4 * a)} ${n(w / 2)} ${n(h - 2 * a)}T0 ${n(h - 2 * a)}Z`,
        lines: [],
        inset: { ...none, top: 3 * a, bottom: 3 * a },
      }
    }
    case 'taggedDocument': {
      const a = Math.min(10, h / 8)
      const t = Math.min(16, w / 8)
      return { outline: sheet(w, h, a), lines: [`M${n(w - t)} ${n(h - a - 2)}L${n(w)} ${n(h - a - t)}`], inset: { ...none, bottom: 2 * a } }
    }
    case 'taggedProcess': {
      const t = Math.min(16, w / 8, h / 4)
      return { outline: box, lines: [`M${n(w - t)} ${n(h)}L${n(w)} ${n(h - t)}`], inset: none }
    }
    case 'brace':
      return { outline: box, lines: [brace(0, 1, h)], inset: { ...none, left: BRACE }, look: 'none' }
    case 'braceRight':
      return { outline: box, lines: [brace(w, -1, h)], inset: { ...none, right: BRACE }, look: 'none' }
    case 'braces':
      return { outline: box, lines: [brace(0, 1, h), brace(w, -1, h)], inset: { ...none, left: BRACE, right: BRACE }, look: 'none' }
    case 'bang': {
      // A burst: points on an ellipse, every other one drawn in.
      const points = Array.from({ length: 24 }, (_, at) => {
        const reach = at % 2 === 0 ? 1 : 0.82
        const angle = (at / 24) * 2 * Math.PI
        return `${n(w / 2 + (Math.cos(angle) * reach * w) / 2)} ${n(h / 2 + (Math.sin(angle) * reach * h) / 2)}`
      })
      return { outline: `M${points.join('L')}Z`, lines: [], inset: { top: h / 5, bottom: h / 5, left: w / 6, right: w / 6 } }
    }
    case 'browser': {
      const t = Math.min(16, h / 6)
      const dot = (x: number) => `M${n(x - 2)} ${n(t / 2)}A2 2 0 1 1 ${n(x + 2)} ${n(t / 2)}A2 2 0 1 1 ${n(x - 2)} ${n(t / 2)}`
      return { outline: box, lines: [`M0 ${n(t)}H${n(w)}`, dot(9), dot(17), dot(25)], inset: { ...none, top: t } }
    }
    case 'console': {
      const t = Math.min(16, h / 6)
      return {
        outline: box,
        lines: [`M0 ${n(t)}H${n(w)}`, `M7 ${n(t / 2 - 3)}L10 ${n(t / 2)}L7 ${n(t / 2 + 3)}`, `M13 ${n(t / 2 + 3)}H19`],
        inset: { ...none, top: t },
      }
    }
    case 'bucket': {
      const s = Math.min(16, w / 8)
      const ry = Math.min(8, h / 8)
      return {
        outline: `M0 ${n(ry)}A${n(w / 2)} ${n(ry)} 0 0 1 ${n(w)} ${n(ry)}L${n(w - s)} ${n(h - ry)}A${n(w / 2 - s)} ${n(ry)} 0 0 1 ${n(s)} ${n(h - ry)}Z`,
        lines: [`M0 ${n(ry)}A${n(w / 2)} ${n(ry)} 0 0 0 ${n(w)} ${n(ry)}`],
        inset: { top: 2 * ry, bottom: ry, left: s, right: s },
      }
    }
    case 'dataStore':
      return { outline: box, lines: [`M0 0H${n(w)}`, `M0 ${n(h)}H${n(w)}`], inset: none, look: 'ground' }
    case 'star':
      return { outline: polygon(w, h, STAR), lines: [], inset: { top: h * 0.3, bottom: h * 0.16, left: w * 0.24, right: w * 0.24 } }
    case 'pentagon':
      return {
        outline: polygon(w, h, [[0.5, 0], [1, 0.38], [0.81, 1], [0.19, 1], [0, 0.38]]),
        lines: [],
        inset: { top: h * 0.2, bottom: 0, left: w * 0.12, right: w * 0.12 },
      }
    case 'octagon': {
      const c = Math.min(w, h) * 0.29
      return {
        outline: `M${n(c)} 0H${n(w - c)}L${n(w)} ${n(c)}V${n(h - c)}L${n(w - c)} ${n(h)}H${n(c)}L0 ${n(h - c)}V${n(c)}Z`,
        lines: [],
        inset: { top: 0, bottom: 0, left: c / 2, right: c / 2 },
      }
    }
    case 'cross': {
      const [x1, x2, y1, y2] = [w / 3, (2 * w) / 3, h / 3, (2 * h) / 3]
      return {
        outline: `M${n(x1)} 0H${n(x2)}V${n(y1)}H${n(w)}V${n(y2)}H${n(x2)}V${n(h)}H${n(x1)}V${n(y2)}H0V${n(y1)}H${n(x1)}Z`,
        lines: [],
        inset: { top: h * 0.24, bottom: h * 0.24, left: w * 0.24, right: w * 0.24 },
      }
    }
    case 'arrowRight': {
      const d = Math.min(h * 0.6, w * 0.4)
      return {
        outline: `M0 ${n(h / 4)}H${n(w - d)}V0L${n(w)} ${n(h / 2)}L${n(w - d)} ${n(h)}V${n((3 * h) / 4)}H0Z`,
        lines: [],
        inset: { top: h / 5, bottom: h / 5, left: 0, right: d / 2 },
      }
    }
    case 'arrowLeft': {
      const d = Math.min(h * 0.6, w * 0.4)
      return {
        outline: `M${n(w)} ${n(h / 4)}H${n(d)}V0L0 ${n(h / 2)}L${n(d)} ${n(h)}V${n((3 * h) / 4)}H${n(w)}Z`,
        lines: [],
        inset: { top: h / 5, bottom: h / 5, left: d / 2, right: 0 },
      }
    }
    case 'arrowBoth': {
      const d = Math.min(h * 0.5, w * 0.3)
      return {
        outline: `M0 ${n(h / 2)}L${n(d)} 0V${n(h / 4)}H${n(w - d)}V0L${n(w)} ${n(h / 2)}L${n(w - d)} ${n(h)}V${n((3 * h) / 4)}H${n(d)}V${n(h)}Z`,
        lines: [],
        inset: { top: h / 5, bottom: h / 5, left: d / 2, right: d / 2 },
      }
    }
    case 'tag': {
      const d = Math.min(22, w / 7)
      return { outline: `M0 0H${n(w - d)}L${n(w)} ${n(h / 2)}L${n(w - d)} ${n(h)}H0Z`, lines: [], inset: { ...none, right: d } }
    }
    case 'circlePlus':
      return { outline: ellipse(0, w, h), lines: [`M${n(w / 2)} 0V${n(h)}`, `M0 ${n(h / 2)}H${n(w)}`], inset: { top: h / 8, bottom: h / 8, left: w / 8, right: w / 8 } }
    case 'circleCross': {
      const [dx, dy] = [(w / 2) * Math.SQRT1_2, (h / 2) * Math.SQRT1_2]
      const [l, r, t, b] = [w / 2 - dx, w / 2 + dx, h / 2 - dy, h / 2 + dy]
      return {
        outline: ellipse(0, w, h),
        lines: [`M${n(l)} ${n(t)}L${n(r)} ${n(b)}`, `M${n(r)} ${n(t)}L${n(l)} ${n(b)}`],
        inset: { top: h / 8, bottom: h / 8, left: w / 8, right: w / 8 },
      }
    }
    case 'filledCircle':
      return { outline: ellipse(0, w, h), lines: [], inset: { top: h / 8, bottom: h / 8, left: w / 8, right: w / 8 }, look: 'solid' }
    case 'offPage':
      return { outline: `M0 0H${n(w)}V${n(h * 0.65)}L${n(w / 2)} ${n(h)}L0 ${n(h * 0.65)}Z`, lines: [], inset: { ...none, bottom: h * 0.3 } }
    case 'hourglass':
      return { outline: `M0 0H${n(w)}L0 ${n(h)}H${n(w)}Z`, lines: [], inset: none }
    case 'bolt':
      return {
        outline: polygon(w, h, [[0.62, 0], [0.12, 0.56], [0.46, 0.56], [0.34, 1], [0.88, 0.4], [0.54, 0.4], [0.72, 0]]),
        lines: [],
        inset: none,
      }
    case 'magneticTape':
      return { outline: ellipse(0, w, h), lines: [`M${n(w / 2)} ${n(h)}H${n(w)}`], inset: { top: h / 8, bottom: h / 8, left: w / 8, right: w / 8 } }
    case 'bracket':
      return { outline: box, lines: [`M${BRACE} 0H0V${n(h)}H${BRACE}`], inset: { ...none, left: BRACE }, look: 'none' }
    case 'speechBubble': {
      const e = h * 0.85
      const [rx, ry] = [w / 2, e / 2]
      const at = (x: number) => ry + ry * Math.sqrt(1 - ((x - rx) / rx) ** 2)
      const [x1, x2] = [w * 0.28, w * 0.42]
      return {
        outline: `M${n(x2)} ${n(at(x2))}A${n(rx)} ${n(ry)} 0 1 0 ${n(x1)} ${n(at(x1))}L${n(w * 0.2)} ${n(h)}Z`,
        lines: [],
        inset: { top: e / 8, bottom: h - e + e / 8, left: w / 8, right: w / 8 },
      }
    }
    case 'stickyNote': {
      // A square of paper, its lower right corner a little lifted.
      const c = Math.min(18, w / 6, h / 6)
      return {
        outline: `M0 0H${n(w)}V${n(h - c)}Q${n(w - c / 3)} ${n(h - c / 3)} ${n(w - c)} ${n(h)}H0Z`,
        lines: [],
        inset: none,
        look: 'note',
      }
    }
    case 'table': {
      // For a list of shapes only: on the canvas a table is a card of its own make, with its
      // columns as rows (ObjectNode.vue).
      const head = Math.min(34, h * 0.3)
      const row = (h - head) / 3
      return { outline: box, lines: [`M0 ${n(head)}H${n(w)}`, `M0 ${n(head + row)}H${n(w)}`, `M0 ${n(head + 2 * row)}H${n(w)}`], inset: none }
    }
  }
}
