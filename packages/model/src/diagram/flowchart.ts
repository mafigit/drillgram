import { DiagramFormatError, ELEMENT_ID, nearestLineColour } from './model'
import type { BoxShape, Diagram, DiagramElement, LineColour, Relationship } from './model'

// A Mermaid flowchart, read as boxes: every node is a box, every subgraph a box with its nodes
// inside it, every arrow a connection. Read only: the app writes Mermaid as C4 diagrams.
// A node's shape is kept where we have it, written with brackets (`[(db)]`) or by name
// (`db@{ shape: cyl }`), and so is the colour of an arrow (`linkStyle 3 stroke:#f80`), as the
// nearest of our colours. What else a flowchart says about looks is left out (classes, styles of
// nodes, directions, dashes), and so is what only lays it out: links that are not drawn (`~~~`)
// and subgraphs without a name.

/** The first line of a text that says something: not empty, no comment, no Markdown fence. */
function firstLine(text: string): string {
  return text.split('\n').map((line) => line.trim()).find((line) => line !== '' && !line.startsWith('%%') && !line.startsWith('```')) ?? ''
}

/** Whether a text is a Mermaid flowchart: it starts with `flowchart` or `graph`. */
export function isFlowchart(text: string): boolean {
  return /^(flowchart|graph)(\s|;|$)/.test(firstLine(text))
}

/** Lines that say how the flowchart looks or behaves, not what is in it. */
const LOOKS = /^(classDef|class|style|click|direction|accTitle|accDescr)\b/

/**
 * How a node's label is wrapped, the longest opening first, and the shape each closing gives the
 * node: a database is a cylinder here too.
 */
const SHAPES: [open: string, close: [closing: string, shape?: BoxShape][]][] = [
  ['(((', [[')))', 'doubleCircle']]],
  ['([', [['])', 'stadium']]],
  ['[[', [[']]', 'subroutine']]],
  ['[(', [[')]', 'cylinder']]],
  ['((', [['))', 'circle']]],
  ['{{', [['}}', 'hexagon']]],
  ['[/', [['/]', 'parallelogram'], ['\\]', 'trapezoid']]],
  ['[\\', [['\\]', 'leanLeft'], ['/]', 'invTrapezoid']]],
  ['>', [[']', 'odd']]],
  ['[', [[']']]],
  ['(', [[')']]],
  ['{', [['}', 'diamond']]],
]

/**
 * The shapes a node is given by name (`a@{ shape: cyl }`, Mermaid 11.3 and later), under every
 * name Mermaid has for each (mermaid.js.org/syntax/flowchart.html). `plain`: a box without a
 * shape, which is what a rectangle is here, and what a sign without room for a name becomes (an
 * hourglass, a bolt, a bar).
 */
const NAMED: [shape: BoxShape | 'plain' | 'person', names: string][] = [
  ['plain', 'rect proc process rectangle rounded event hourglass collate bolt com-link lightning-bolt fork join'],
  ['person', 'person'],
  ['stadium', 'stadium pill terminal'],
  ['subroutine', 'fr-rect framed-rectangle subproc subprocess subroutine'],
  ['cylinder', 'cyl cylinder database db'],
  ['queue', 'h-cyl das horizontal-cylinder'],
  ['disk', 'lin-cyl disk lined-cylinder'],
  ['circle', 'circle circ sm-circ small-circle start f-circ filled-circle junction cross-circ crossed-circle summary'],
  ['doubleCircle', 'dbl-circ double-circle fr-circ framed-circle stop'],
  ['diamond', 'diam decision diamond question'],
  ['hexagon', 'hex hexagon prepare'],
  ['parallelogram', 'lean-r in-out lean-right'],
  ['leanLeft', 'lean-l lean-left out-in'],
  ['trapezoid', 'trap-b priority trapezoid trapezoid-bottom'],
  ['invTrapezoid', 'trap-t inv-trapezoid manual trapezoid-top'],
  ['odd', 'odd'],
  ['card', 'notch-rect card notched-rectangle'],
  ['delay', 'delay half-rounded-rectangle'],
  ['display', 'curv-trap curved-trapezoid display'],
  ['divided', 'div-rect div-proc divided-process divided-rectangle'],
  ['document', 'doc document'],
  ['linedDocument', 'lin-doc lined-document'],
  ['taggedDocument', 'tag-doc tagged-document'],
  ['documents', 'docs documents st-doc stacked-document'],
  ['processes', 'st-rect processes procs stacked-rectangle'],
  ['linedProcess', 'lin-rect lin-proc lined-process lined-rectangle shaded-process'],
  ['taggedProcess', 'tag-rect tag-proc tagged-process tagged-rectangle'],
  ['triangle', 'tri extract triangle'],
  ['flippedTriangle', 'flip-tri flipped-triangle manual-file'],
  ['internalStorage', 'win-pane internal-storage window-pane'],
  ['loopLimit', 'notch-pent loop-limit notched-pentagon'],
  ['manualInput', 'sl-rect manual-input sloped-rectangle'],
  ['paperTape', 'flag paper-tape'],
  ['storedData', 'bow-rect bow-tie-rectangle stored-data'],
  ['text', 'text'],
  ['brace', 'brace brace-l comment'],
  ['braceRight', 'brace-r'],
  ['braces', 'braces'],
  ['bang', 'bang'],
  ['browser', 'browser'],
  ['bucket', 'bucket'],
  ['console', 'console'],
  ['dataStore', 'datastore data-store'],
  ['folder', 'folder directory'],
  ['cloud', 'cloud'],
]
const BY_NAME = new Map(NAMED.flatMap(([shape, names]) => names.split(' ').map((name) => [name, shape] as const)))

/** What a `@{ ... }` after an id says, as its keys and values: `shape: cyl, label: "Orders DB"`. */
function said(block: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const [, key, quoted, bare] of block.matchAll(/([\w-]+)\s*:\s*(?:"((?:[^"\\]|\\.)*)"|([^,]*))/g)) {
    found.set(key!, (quoted ?? bare ?? '').trim())
  }
  return found
}

/** The `@{ ... }` at the start of `rest`, to its closing brace; a brace inside quotes is text. */
function block(rest: string): { inner: string; length: number } | undefined {
  if (!rest.startsWith('@{')) return undefined
  let quoted = false
  for (let at = 2; at < rest.length; at++) {
    const char = rest[at]
    if (char === '\\' && quoted) at++
    else if (char === '"') quoted = !quoted
    else if (char === '}' && !quoted) return { inner: rest.slice(2, at), length: at + 1 }
  }
  return undefined
}

/** The keys that make a `@{ ... }` a node's: without one of them it says how an arrow looks. */
const OF_A_NODE = ['shape', 'label', 'icon', 'img']

/** A label as plain words: without its quotes and marks, a line break as a space. */
function words(label: string): string {
  return label
    .trim()
    .replace(/^"([\s\S]*)"$/, '$1')
    .replace(/^`([\s\S]*)`$/, '$1')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface Node {
  /** The id in the file. */
  file: string
  name: string
  /** The subgraph it stands in, by its id in the file. */
  inside?: string
  /** A subgraph without a name: it only lays out, and is no box. */
  unseen?: boolean
  shape?: BoxShape
  person?: boolean
}

function parse(text: string): Diagram {
  const nodes = new Map<string, Node>()
  const order: string[] = []
  /** Every link of the file in its order, the ones not drawn too: `linkStyle` counts them all. */
  const links: { from: string; to: string; label?: string; drawn: boolean; colour?: LineColour }[] = []
  /** What `linkStyle` gives: a colour by the number of the link, and one for all the others. */
  const colours = new Map<number, LineColour>()
  let usual: LineColour | undefined
  /** The open subgraphs, the innermost last. */
  const open: string[] = []
  let made = 0
  let started = false

  const mention = (file: string, label?: string) => {
    let node = nodes.get(file)
    if (!node) {
      node = { file, name: file, ...(open.length > 0 && { inside: open.at(-1) }) }
      nodes.set(file, node)
      order.push(file)
    }
    const said = label === undefined ? '' : words(label)
    if (said !== '') node.name = said
    return node
  }

  /** A node at the start of `rest`: its id, its label in whatever shape, its class. */
  const readNode = (rest: string, line: number): { node: Node; rest: string } => {
    const id = /^[A-Za-z0-9_][\w.-]*/.exec(rest)?.[0]
    if (id === undefined) throw new DiagramFormatError(`Expected a node, found: ${rest.slice(0, 20)}`, line)
    let after = rest.slice(id.length)
    // By name: `a@{ shape: cyl, label: "Orders DB" }`.
    const named = block(after)
    if (after.startsWith('@{')) {
      if (!named) throw new DiagramFormatError(`What is said about ${id} is not closed: } is missing`, line)
      const keys = said(named.inner)
      const node = mention(id, keys.get('label'))
      const shape = BY_NAME.get((keys.get('shape') ?? '').toLowerCase())
      if (shape === 'person') node.person = true
      else if (shape !== undefined && shape !== 'plain') node.shape = shape
      return { node, rest: after.slice(named.length).replace(/^:::[\w-]+/, '') }
    }
    let label: string | undefined
    let shape: BoxShape | undefined
    const wrapped = SHAPES.find(([opening]) => after.startsWith(opening))
    if (wrapped) {
      const [opening, closings] = wrapped
      const body = after.slice(opening.length)
      // A label in quotes may hold any bracket: it ends at its closing quote.
      const quoted = /^\s*"((?:[^"\\]|\\.)*)"\s*/.exec(body)
      const from = quoted ? quoted[0].length : 0
      const ends = closings.map(([closing, gives]) => ({ closing, gives, at: body.indexOf(closing, from) })).filter((end) => end.at >= 0)
      const end = ends.sort((a, b) => a.at - b.at)[0]
      if (!end) throw new DiagramFormatError(`The label of ${id} is not closed`, line)
      label = quoted ? quoted[1] : body.slice(0, end.at)
      shape = end.gives
      after = body.slice(end.at + end.closing.length)
    }
    after = after.replace(/^:::[\w-]+/, '')
    const node = mention(id, label)
    if (shape) node.shape = shape
    return { node, rest: after }
  }

  /** A link at the start of `rest`: whether it is drawn, and the text on it. */
  const readLink = (from: string): { drawn: boolean; label?: string; rest: string } | undefined => {
    // An arrow may have an id before it (`a e1@--> b`): it says nothing here.
    const rest = from.replace(/^\s*[\w-]+@(?=[-=.~<ox])/, '')
    const text = (label: string | undefined) => {
      const said = label === undefined ? '' : words(label)
      return said === '' ? undefined : said
    }
    // --> |text|
    let found = /^\s*[<ox]?(-{2,}|={2,}|-\.+-?|~{3,})[>ox]?\s*\|([^|]*)\|\s*/.exec(rest)
    if (found) return { drawn: !found[1]!.startsWith('~'), label: text(found[2]), rest: rest.slice(found[0].length) }
    // -- text -->, -. text .->, == text ==>
    found = /^\s*<?(--|==|-\.)\s*((?:"[^"]*"|[^-=.|>\s][^|]*?))\s*(-{2,}|={2,}|\.+-)[>ox]?\s*/.exec(rest)
    if (found && found[2]!.trim() !== '') return { drawn: true, label: text(found[2]), rest: rest.slice(found[0].length) }
    found = /^\s*[<ox]?(-{2,}|={2,}|-\.+-|~{3,})[>ox]?\s*/.exec(rest)
    if (found) return { drawn: !found[1]!.startsWith('~'), rest: rest.slice(found[0].length) }
    return undefined
  }

  text.split('\n').forEach((raw, index) => {
    const line = index + 1
    const content = raw.replace(/%%.*$/, '').trim().replace(/;$/, '').trim()
    if (content === '' || content.startsWith('```')) return
    if (!started) {
      if (!/^(flowchart|graph)(\s|$)/.test(content)) throw new DiagramFormatError('A flowchart starts with "flowchart" or "graph"', line)
      started = true
      return
    }
    if (LOOKS.test(content)) return
    const styled = /^linkStyle\s+(default|[\d\s,]+?)\s+(.*)$/.exec(content)
    if (styled || /^linkStyle\b/.test(content)) {
      // Of what it says about the line, the colour is kept.
      const stroke = /(?:^|[,;\s])stroke\s*:\s*([^,;\s]+)/.exec(styled?.[2] ?? '')
      const colour = stroke ? nearestLineColour(stroke[1]!) : undefined
      if (!styled || colour === undefined) return
      if (styled[1] === 'default') usual = colour
      else for (const number of styled[1]!.split(',')) colours.set(Number(number.trim()), colour)
      return
    }
    if (content === 'end') {
      if (open.length === 0) throw new DiagramFormatError('"end" without a subgraph', line)
      open.pop()
      return
    }
    const subgraph = /^subgraph\s+(.*)$/.exec(content)
    if (subgraph) {
      const rest = subgraph[1]!.trim()
      const withLabel = /^([A-Za-z0-9_][\w.-]*)\s*\[([\s\S]*)\]$/.exec(rest)
      const [file, label] = withLabel ? [withLabel[1]!, withLabel[2]!] : /^[A-Za-z0-9_][\w.-]*$/.test(rest) ? [rest, rest] : [`subgraph_${++made}`, rest]
      const node = mention(file, label)
      // Without a name it is there for the layout only.
      if (words(label) === '') node.unseen = true
      open.push(file)
      return
    }
    // What is said about an arrow by its id (`e1@{ animate: true }`): looks, not a node.
    const about = /^([\w-]+)(@\{.*\})$/.exec(content)
    if (about && !nodes.has(about[1]!)) {
      const keys = said(block(about[2]!)?.inner ?? '')
      if (!OF_A_NODE.some((key) => keys.has(key))) return
    }
    // Nodes and the links between them: `a --> b --> c`, `a & b --> c`.
    let rest = content
    let before: Node[] = []
    let link: { drawn: boolean; label?: string } | undefined
    for (;;) {
      const group: Node[] = []
      for (;;) {
        const read = readNode(rest, line)
        group.push(read.node)
        rest = read.rest
        const more = /^\s*&\s*/.exec(rest)
        if (!more) break
        rest = rest.slice(more[0].length)
      }
      if (link) {
        for (const from of before) for (const to of group) links.push({ from: from.file, to: to.file, drawn: link.drawn, ...(link.label !== undefined && { label: link.label }) })
      }
      if (rest.trim() === '') break
      const next = readLink(rest)
      if (!next) throw new DiagramFormatError(`Expected an arrow, found: ${rest.trim().slice(0, 20)}`, line)
      before = group
      link = next
      rest = next.rest
    }
  })
  if (!started) throw new DiagramFormatError('A flowchart starts with "flowchart" or "graph"', 1)
  if (open.length > 0) throw new DiagramFormatError('A subgraph is not closed: "end" is missing')

  // Ids of ours: a file's id that is none gets one made from it.
  const ids = new Map<string, string>()
  const taken = new Set<string>()
  for (const file of order) {
    if (nodes.get(file)!.unseen) continue
    let base = file.replace(/[^A-Za-z0-9_]/g, '_')
    if (!ELEMENT_ID.test(base)) base = `n_${base}`
    let id = base
    for (let n = 2; taken.has(id.toLowerCase()); n++) id = `${base}_${n}`
    taken.add(id.toLowerCase())
    ids.set(file, id)
  }
  /** The box a node stands in: the nearest subgraph around it that has a name. */
  const boxAround = (node: Node): string | undefined => {
    for (let at = node.inside; at !== undefined; at = nodes.get(at)?.inside) {
      if (!nodes.get(at)?.unseen) return ids.get(at)
    }
    return undefined
  }
  const elements = order.flatMap((file): DiagramElement[] => {
    const node = nodes.get(file)!
    if (node.unseen) return []
    const inside = boxAround(node)
    if (node.person) return [{ id: ids.get(file)!, kind: 'person', name: node.name, ...(inside !== undefined && { inside }) }]
    return [{ id: ids.get(file)!, kind: 'box', name: node.name, ...(node.shape && { shape: node.shape }), ...(inside !== undefined && { inside }) }]
  })
  const relationships: Relationship[] = []
  /** The connections between two boxes with one text, by those three. */
  const alike = new Map<string, Relationship[]>()
  links.forEach((link, number) => {
    const [from, to] = [ids.get(link.from), ids.get(link.to)]
    if (!link.drawn || from === undefined || to === undefined || from === to) return
    const colour = colours.get(number) ?? usual
    // The same arrow twice is one connection; in two colours it is two (a call and a message).
    const key = JSON.stringify([from, to, link.label])
    const same = alike.get(key) ?? []
    if (same.some((r) => r.colour === colour) || (colour === undefined && same.length > 0)) return
    const plain = same.find((r) => r.colour === undefined)
    if (plain && colour !== undefined) {
      plain.colour = colour
      return
    }
    const relationship: Relationship = { from, to, ...(link.label !== undefined && { label: link.label }), ...(colour !== undefined && { colour }) }
    alike.set(key, [...same, relationship])
    relationships.push(relationship)
  })
  return { level: 'context', elements, relationships }
}

/** Reads a Mermaid flowchart. The app does not write one. */
export const flowchartFormat = {
  id: 'flowchart',
  name: 'Mermaid flowchart',
  /** Throws `DiagramFormatError` with a 1-based `line`. */
  parse,
}
