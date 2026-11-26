import type { C4Level } from '../index'
import type { DiagramFormat } from './format'
import { DiagramFormatError, ELEMENT_ID, LINE_COLOUR_HEX, canHaveShape, nearestLineColour, validateDiagram } from './model'
import type { Boundary, BoxShape, ColumnKey, Diagram, DiagramElement, ElementKind, LineColour, Relationship } from './model'

// D2 (d2lang.com), in the C4 notation: every element is a box whose label says its name, its
// kind and technology in brackets and its description, coloured as C4's own examples are; a
// person has D2's `c4-person` shape. The object the diagram is about is a dashed container around
// its parts. The C4 level rides in `vars`, which D2 keeps and does not draw.
// `parse` reads what `serialize` writes, not D2 in general.

const KIND_WORDS: Record<ElementKind, string> = {
  box: 'Box',
  person: 'Person',
  softwareSystem: 'Software System',
  container: 'Container',
  component: 'Component',
  code: 'Code',
}

/** Fill, border and text of each kind, as in C4's own examples; grey for what is not ours. */
const COLOURS: Record<ElementKind, { fill: string; stroke: string; font: string }> = {
  box: { fill: '#ffffff', stroke: '#666666', font: '#222222' },
  person: { fill: '#08427b', stroke: '#073b6f', font: '#ffffff' },
  softwareSystem: { fill: '#1168bd', stroke: '#0b4884', font: '#ffffff' },
  container: { fill: '#438dd5', stroke: '#3c7fc0', font: '#ffffff' },
  component: { fill: '#85bbf0', stroke: '#78a8d8', font: '#000000' },
  code: { fill: '#f4f4f5', stroke: '#52525b', font: '#18181b' },
}
const EXTERNAL = { fill: '#999999', stroke: '#8a8a8a', font: '#ffffff' }
const EXTERNAL_PERSON = { fill: '#686868', stroke: '#5c5c5c', font: '#ffffff' }

const LEVELS: readonly C4Level[] = ['context', 'container', 'component', 'code']

/** The key of the title: not an element id, which has no hyphen. */
const TITLE_KEY = 'diagram-title'

/** A D2 double-quoted string. */
function quote(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n').replace(/\t/g, '\\t')}"`
}

function noBreak(value: string | undefined, what: string): void {
  if (value !== undefined && /[\r\n]/.test(value)) {
    throw new DiagramFormatError(`D2 cannot write a line break in ${what}`)
  }
}

/** A C4 element says its kind in brackets under its name; a plain box only its name. */
function elementLabel(element: DiagramElement): string {
  if (element.kind === 'box') return [element.name, ...(element.description !== undefined ? ['', element.description] : [])].join('\n')
  const kind = `${element.external ? 'External ' : ''}${KIND_WORDS[element.kind]}`
  const said = `[${kind}${element.technology !== undefined ? `: ${element.technology}` : ''}]`
  return [element.name, said, ...(element.description !== undefined ? ['', element.description] : [])].join('\n')
}

/** D2's name for each of our shapes that it has. A subroutine it has not: written as a plain box. */
const D2_SHAPE: Partial<Record<BoxShape, string>> = {
  cylinder: 'cylinder',
  queue: 'queue',
  document: 'document',
  hexagon: 'hexagon',
  diamond: 'diamond',
  circle: 'circle',
  stadium: 'oval',
  parallelogram: 'parallelogram',
  cloud: 'cloud',
  page: 'page',
  folder: 'package',
  step: 'step',
  callout: 'callout',
  storedData: 'stored_data',
  text: 'text',
  table: 'sql_table',
}
/** A column's key as D2 says it, as the constraint of the column. */
const D2_KEY: Record<ColumnKey, string> = { primary: 'primary_key', foreign: 'foreign_key', unique: 'unique' }
const OUR_KEY = new Map(Object.entries(D2_KEY).map(([ours, d2]) => [d2, ours as ColumnKey]))
const OUR_SHAPE = new Map(Object.entries(D2_SHAPE).map(([ours, d2]) => [d2, ours as BoxShape]))

function elementBlock(element: DiagramElement, indent: string): string[] {
  const colour = element.external ? (element.kind === 'person' ? EXTERNAL_PERSON : EXTERNAL) : COLOURS[element.kind]
  return [
    `${indent}${quote(element.id)}: ${quote(elementLabel(element))} {`,
    ...(element.kind === 'person' ? [`${indent}  shape: c4-person`] : []),
    ...(element.shape !== undefined && D2_SHAPE[element.shape] ? [`${indent}  shape: ${D2_SHAPE[element.shape]}`] : []),
    // A table's columns: each a line, its type as its value, its key as its constraint.
    ...(element.columns ?? []).map(
      (column) => `${indent}  ${quote(column.name)}: ${quote(column.type ?? '')}${column.key ? ` {constraint: ${D2_KEY[column.key]}}` : ''}`,
    ),
    `${indent}  style: {fill: "${colour.fill}"; stroke: "${colour.stroke}"; font-color: "${colour.font}"}`,
    `${indent}}`,
  ]
}

/** A bracketed line, which the label of a relationship ends with when it has a technology. */
const BRACKETED = /^\[(.*)\]$/s

function relationshipLabel(relationship: Relationship): string | undefined {
  const lines = [
    ...(relationship.label !== undefined ? [relationship.label] : []),
    ...(relationship.technology !== undefined ? [`[${relationship.technology}]`] : []),
  ]
  return lines.length > 0 ? lines.join('\n') : undefined
}

function serialize(diagram: Diagram): string {
  validateDiagram(diagram)
  const boundary = diagram.boundary
  // D2 keys are the same in upper and lower case.
  const keys = new Set<string>()
  for (const id of [...diagram.elements.map((e) => e.id), ...(boundary ? [boundary.id] : [])]) {
    const key = id.toLowerCase()
    if (keys.has(key)) throw new DiagramFormatError(`D2 cannot tell ${id} from another id in other case`)
    keys.add(key)
  }
  for (const element of diagram.elements) {
    noBreak(element.name, `the name of ${element.id}`)
    noBreak(element.technology, `the technology of ${element.id}`)
  }
  if (boundary) noBreak(boundary.name, 'the name of the boundary')
  for (const relationship of diagram.relationships) {
    const what = `the relationship ${relationship.from} -> ${relationship.to}`
    noBreak(relationship.label, what)
    noBreak(relationship.technology, what)
    if (relationship.technology === undefined && relationship.label !== undefined && BRACKETED.test(relationship.label)) {
      throw new DiagramFormatError(`D2 cannot write a label in brackets without a technology: ${what}`)
    }
  }

  const members = new Set(boundary?.members)
  const path = (id: string) => (members.has(id) ? `${quote(boundary!.id)}.${quote(id)}` : quote(id))
  const lines = [
    `# C4 ${diagram.level} diagram`,
    'vars: {',
    `  c4-level: ${diagram.level}`,
    '}',
    'direction: right',
  ]
  if (diagram.title !== undefined) {
    lines.push(
      `${TITLE_KEY}: ${quote(diagram.title)} {`,
      '  shape: text',
      '  near: top-center',
      '  style: {font-size: 24; bold: true}',
      '}',
    )
  }
  const boundaryBlock = (b: Boundary) => [
    `${quote(b.id)}: ${quote(`${b.name}\n[${KIND_WORDS[b.kind]}]`)} {`,
    '  style: {fill: transparent; stroke: "#666666"; stroke-dash: 4; font-color: "#444444"}',
    ...diagram.elements.filter((e) => members.has(e.id)).flatMap((e) => elementBlock(e, '  ')),
    '}',
  ]
  // The members are written together, inside the boundary, where the first of them stands.
  for (const element of diagram.elements) {
    if (!members.has(element.id)) lines.push(...elementBlock(element, ''))
    else if (element.id === boundary!.members[0]) lines.push(...boundaryBlock(boundary!))
  }
  if (boundary && boundary.members.length === 0) lines.push(...boundaryBlock(boundary))
  for (const relationship of diagram.relationships) {
    const label = relationshipLabel(relationship)
    // A coloured line says so as its stroke, in a block after what it says.
    const said = [...(label !== undefined ? [quote(label)] : []), ...(relationship.colour ? [`{style.stroke: "${LINE_COLOUR_HEX[relationship.colour]}"}`] : [])]
    lines.push(`${path(relationship.from)} -> ${path(relationship.to)}${said.length > 0 ? `: ${said.join(' ')}` : ''}`)
  }
  return `${lines.join('\n')}\n`
}

/** Reads a D2 double-quoted string at the start of `text`: its value and what follows it. */
function readString(text: string, line: number): { value: string; rest: string } {
  if (!text.startsWith('"')) throw new DiagramFormatError('Expected a string in double quotes', line)
  let value = ''
  for (let i = 1; i < text.length; i++) {
    const c = text[i]!
    if (c === '"') return { value, rest: text.slice(i + 1) }
    if (c !== '\\') {
      value += c
      continue
    }
    const next = text[++i]
    const escapes: Record<string, string> = { n: '\n', t: '\t', '"': '"', '\\': '\\' }
    if (next === undefined || !(next in escapes)) throw new DiagramFormatError('Unknown escape in a string', line)
    value += escapes[next]
  }
  throw new DiagramFormatError('Unterminated string', line)
}

/** A path of quoted keys, `"a"` or `"a"."b"`, at the start of `text`. */
function readPath(text: string, line: number): { keys: string[]; rest: string } {
  const keys: string[] = []
  let rest = text
  for (;;) {
    const read = readString(rest, line)
    keys.push(read.value)
    rest = read.rest
    if (!rest.startsWith('.')) return { keys, rest }
    rest = rest.slice(1)
  }
}

const ELEMENT_KIND = /^\[(External )?(Person|Software System|Container|Component|Code)(?:: (.*))?\]$/s
const BOUNDARY_KIND = /^\[(Software System|Container)\]$/

function parseId(value: string, line: number): string {
  if (!ELEMENT_ID.test(value)) throw new DiagramFormatError(`Invalid element id: ${JSON.stringify(value)}`, line)
  return value
}

function kindOf(words: string): ElementKind {
  return (Object.entries(KIND_WORDS) as [ElementKind, string][]).find(([, w]) => w === words)![0]
}

function parseElement(id: string, label: string, line: number): DiagramElement {
  const [name = '', said = '', gap, ...description] = label.split('\n')
  if (said === '') {
    // A plain box: its name, then after an empty line its description.
    const rest = label.split('\n').slice(2)
    if (name === '' || (label.includes('\n') && rest.length === 0)) {
      throw new DiagramFormatError(`Not the label of a box: ${JSON.stringify(label)}`, line)
    }
    return { id, kind: 'box', name, ...(rest.length > 0 && { description: rest.join('\n') }) }
  }
  const match = ELEMENT_KIND.exec(said)
  if (!match || name === '') throw new DiagramFormatError(`Not the label of a C4 element: ${JSON.stringify(label)}`, line)
  if (gap !== undefined && (gap !== '' || description.length === 0)) {
    throw new DiagramFormatError('The description follows an empty line', line)
  }
  const [, external, words = '', technology] = match
  return {
    id,
    kind: kindOf(words),
    name,
    ...(description.length > 0 && { description: description.join('\n') }),
    ...(technology !== undefined && { technology }),
    ...(external !== undefined && { external: true }),
  }
}

function parseRelationship(from: string, to: string, label: string | undefined): Relationship {
  if (label === undefined) return { from, to }
  const lines = label.split('\n')
  const technology = lines.length > 0 ? BRACKETED.exec(lines.at(-1)!)?.[1] : undefined
  const text = (technology !== undefined ? lines.slice(0, -1) : lines).join('\n')
  return {
    from,
    to,
    ...(text !== '' && { label: text }),
    ...(technology !== undefined && { technology }),
  }
}

/** Lines of a block that only style or shape what it opens, and say nothing of the model. */
const STYLE_LINE = /^(shape|near|style(\.[\w-]+)?|direction)\s*:/

function parse(text: string): Diagram {
  const lines = text.split('\n')
  let level: C4Level | undefined
  let title: string | undefined
  const elements: DiagramElement[] = []
  const relationships: Relationship[] = []
  let boundary: Boundary | undefined
  /** What the open braces belong to, outermost first. */
  const open: ('vars' | 'title' | 'boundary' | 'element')[] = []

  lines.forEach((raw, index) => {
    const line = index + 1
    const content = raw.trim()
    if (content === '' || content.startsWith('#')) return
    const within = open.at(-1)

    if (content === '}') {
      if (!within) throw new DiagramFormatError('Unexpected }', line)
      open.pop()
      return
    }
    if (within === 'vars') {
      const match = /^c4-level\s*:\s*(\w+)$/.exec(content)
      if (!match) throw new DiagramFormatError(`Unsupported variable: ${content}`, line)
      if (!LEVELS.includes(match[1] as C4Level)) throw new DiagramFormatError(`Unknown C4 level: ${match[1]}`, line)
      level = match[1] as C4Level
      return
    }
    // A column of the table whose block this is: `"id": "uuid" {constraint: primary_key}`.
    if (within === 'element' && content.startsWith('"') && elements.at(-1)?.shape === 'table') {
      const name = readString(content, line)
      const after = name.rest.trimStart()
      if (!after.startsWith(':')) throw new DiagramFormatError(`Unsupported line: ${content}`, line)
      const type = readString(after.slice(1).trimStart(), line)
      const said = type.rest.trim()
      const constraint = /^\{\s*constraint\s*:\s*([\w-]+)\s*\}$/.exec(said)
      if (said !== '' && !constraint) throw new DiagramFormatError(`Unsupported line: ${content}`, line)
      const key = constraint ? OUR_KEY.get(constraint[1]!) : undefined
      const table = elements.at(-1)!
      table.columns = [...(table.columns ?? []), { name: name.value, ...(type.value !== '' && { type: type.value }), ...(key !== undefined && { key }) }]
      return
    }
    if (within === 'title' || within === 'element' || (within === 'boundary' && STYLE_LINE.test(content))) {
      if (!STYLE_LINE.test(content)) throw new DiagramFormatError(`Unsupported line: ${content}`, line)
      // The shape of the element whose block this is, when it is one of ours.
      const shape = within === 'element' ? OUR_SHAPE.get(/^shape\s*:\s*([\w-]+)/.exec(content)?.[1] ?? '') : undefined
      const element = elements.at(-1)
      if (shape && element && canHaveShape(element.kind)) element.shape = shape
      return
    }
    if (within === undefined && content === 'vars: {') {
      open.push('vars')
      return
    }
    if (within === undefined && STYLE_LINE.test(content)) return
    if (within === undefined && content.startsWith(`${TITLE_KEY}:`)) {
      const read = readString(content.slice(TITLE_KEY.length + 1).trimStart(), line)
      if (title !== undefined) throw new DiagramFormatError('Duplicate title', line)
      title = read.value
      if (read.rest.trim() === '{') open.push('title')
      else if (read.rest.trim() !== '') throw new DiagramFormatError(`Unsupported line: ${content}`, line)
      return
    }

    const path = readPath(content, line)
    const rest = path.rest.trimStart()
    if (rest.startsWith('->')) {
      if (within) throw new DiagramFormatError('Relationships go at the top level', line)
      const to = readPath(rest.slice(2).trimStart(), line)
      const after = to.rest.trim()
      let label: string | undefined
      let colour: LineColour | undefined
      if (after !== '') {
        if (!after.startsWith(':')) throw new DiagramFormatError(`Unsupported line: ${content}`, line)
        let said = after.slice(1).trimStart()
        if (!said.startsWith('{')) {
          const read = readString(said, line)
          label = read.value
          said = read.rest.trim()
        }
        // The stroke of the line, as the export writes it: the nearest of our colours.
        const stroke = /^\{\s*style\.stroke\s*:\s*"?([^"}\s]+)"?\s*\}$/.exec(said)
        if (said !== '' && !stroke) throw new DiagramFormatError(`Unsupported line: ${content}`, line)
        if (stroke) colour = nearestLineColour(stroke[1]!)
      }
      const end = (keys: string[]) => {
        if (keys.length === 2 && boundary && keys[0] === boundary.id) return parseId(keys[1]!, line)
        if (keys.length !== 1) throw new DiagramFormatError(`Unknown path: ${keys.join('.')}`, line)
        return parseId(keys[0]!, line)
      }
      relationships.push({ ...parseRelationship(end(path.keys), end(to.keys), label), ...(colour !== undefined && { colour }) })
      return
    }

    // A box: an element, or the boundary when it holds elements or is dashed.
    if (path.keys.length !== 1 || !rest.startsWith(':')) throw new DiagramFormatError(`Unsupported line: ${content}`, line)
    const id = parseId(path.keys[0]!, line)
    const read = readString(rest.slice(1).trimStart(), line)
    if (read.rest.trim() !== '{') throw new DiagramFormatError(`Expected { after ${id}`, line)
    const label = read.value
    const isBoundary = within === undefined && isDashed(lines, index)
    if (isBoundary) {
      if (boundary) throw new DiagramFormatError('Only one boundary is supported', line)
      const [name = '', said = '', ...more] = label.split('\n')
      const match = BOUNDARY_KIND.exec(said)
      if (!match || name === '' || more.length > 0) {
        throw new DiagramFormatError(`Not the label of a boundary: ${JSON.stringify(label)}`, line)
      }
      boundary = { id, kind: kindOf(match[1]!) as Boundary['kind'], name, members: [] }
      open.push('boundary')
      return
    }
    if (within !== undefined && within !== 'boundary') throw new DiagramFormatError(`Unsupported line: ${content}`, line)
    elements.push(parseElement(id, label, line))
    if (within === 'boundary') boundary!.members.push(id)
    open.push('element')
  })

  if (open.length > 0) throw new DiagramFormatError('A block is not closed with }', lines.length)
  if (level === undefined) throw new DiagramFormatError('Missing the C4 level (vars: { c4-level: ... })', lines.length)
  const diagram: Diagram = {
    level,
    ...(title !== undefined && { title }),
    elements,
    relationships,
    ...(boundary && { boundary }),
  }
  validateDiagram(diagram)
  return diagram
}

/** Whether the block opened on line `index` is drawn dashed: the boundary's own style line. */
function isDashed(lines: readonly string[], index: number): boolean {
  const next = lines[index + 1]?.trim() ?? ''
  return /^style\s*:.*stroke-dash/.test(next)
}

export const d2Format: DiagramFormat = {
  id: 'd2',
  name: 'D2',
  fileExtension: '.d2',
  serialize,
  parse,
}
