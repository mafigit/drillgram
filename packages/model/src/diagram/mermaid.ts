import type { C4Level } from '../index'
import type { DiagramFormat } from './format'
import { DiagramFormatError, ELEMENT_ID, validateDiagram } from './model'
import type { Boundary, Diagram, DiagramElement, ElementKind, Relationship } from './model'

const HEADERS: Partial<Record<C4Level, string>> = {
  context: 'C4Context',
  container: 'C4Container',
  component: 'C4Component',
}

/** Mermaid's C4 diagram has no plain box: `writableAsMermaid` makes one a software system. */
const ELEMENT_MACROS: Record<Exclude<ElementKind, 'box' | 'code'>, string> = {
  person: 'Person',
  softwareSystem: 'System',
  container: 'Container',
  component: 'Component',
}

const BOUNDARY_MACROS: Record<Boundary['kind'], string> = {
  softwareSystem: 'System_Boundary',
  container: 'Container_Boundary',
}

/** Kinds whose third argument is the technology rather than the description. */
const HAS_TECHNOLOGY: ReadonlySet<ElementKind> = new Set(['container', 'component'])

function checkText(value: string | undefined, what: string): void {
  if (value !== undefined && /["\r\n]/.test(value)) {
    throw new DiagramFormatError(`Mermaid cannot write a double quote or newline in ${what}`)
  }
}

/** Quotes the arguments and drops trailing absent ones; absent middle ones become `""`. */
function call(macro: string, head: string[], optional: (string | undefined)[]): string {
  let last = optional.length
  while (last > 0 && optional[last - 1] === undefined) last--
  const args = [...head, ...optional.slice(0, last).map((value) => `"${value ?? ''}"`)]
  return `${macro}(${args.join(', ')})`
}

function serializeElement(element: DiagramElement): string {
  if (element.kind === 'box') throw new DiagramFormatError(`Mermaid's C4 diagram has no plain box: ${element.id}`)
  if (element.kind === 'code') throw new DiagramFormatError(`Mermaid's C4 diagram has no code element: ${element.id}`)
  const macro = ELEMENT_MACROS[element.kind] + (element.external ? '_Ext' : '')
  const optional = HAS_TECHNOLOGY.has(element.kind)
    ? [element.technology, element.description]
    : [element.description]
  return call(macro, [element.id, `"${element.name}"`], optional)
}

function serializeRelationship(relationship: Relationship): string {
  return call(
    'Rel',
    [relationship.from, relationship.to, `"${relationship.label ?? ''}"`],
    [relationship.technology],
  )
}

function serialize(diagram: Diagram): string {
  validateDiagram(diagram)
  const header = HEADERS[diagram.level]
  if (!header) throw new DiagramFormatError('Mermaid has no C4 code diagram')
  checkText(diagram.title, 'the title')
  // The title is written unquoted and parse trims it, so padding or emptiness would be lost.
  const title = diagram.title
  if (title !== undefined && (title.trim() === '' || title !== title.trim())) {
    throw new DiagramFormatError(
      'Mermaid cannot write an empty title or one with leading or trailing whitespace',
    )
  }
  for (const element of diagram.elements) {
    if (element.name === '') {
      throw new DiagramFormatError(`Mermaid cannot write an empty name for ${element.id}`)
    }
    checkText(element.name, `the name of ${element.id}`)
    checkText(element.description, `the description of ${element.id}`)
    checkText(element.technology, `the technology of ${element.id}`)
  }
  for (const relationship of diagram.relationships) {
    const what = `the relationship ${relationship.from} -> ${relationship.to}`
    checkText(relationship.label, what)
    checkText(relationship.technology, what)
  }
  const boundary = diagram.boundary
  if (boundary) {
    if (boundary.name === '') throw new DiagramFormatError('Mermaid cannot write an empty name for the boundary')
    checkText(boundary.name, 'the name of the boundary')
    // Mermaid draws no relationship to a boundary: it refuses the whole diagram.
    if (diagram.relationships.some((r) => r.from === boundary.id || r.to === boundary.id)) {
      throw new DiagramFormatError('Mermaid cannot write a relationship to or from a boundary')
    }
  }
  const members = new Set(boundary?.members)
  // The members are written together, inside the boundary, where the first of them stands.
  const elements = diagram.elements.flatMap((element) => {
    if (!members.has(element.id)) return [serializeElement(element)]
    if (element.id !== boundary!.members[0]) return []
    const inside = diagram.elements.filter((e) => members.has(e.id)).map((e) => `  ${serializeElement(e)}`)
    return [`${BOUNDARY_MACROS[boundary!.kind]}(${boundary!.id}, "${boundary!.name}") {`, ...inside, '}']
  })
  if (boundary && boundary.members.length === 0) {
    elements.push(`${BOUNDARY_MACROS[boundary.kind]}(${boundary.id}, "${boundary.name}") {`, '}')
  }
  const lines = [
    ...(diagram.title !== undefined ? [`title ${diagram.title}`] : []),
    ...elements,
    ...diagram.relationships.map(serializeRelationship),
  ]
  return [header, ...lines.map((line) => `  ${line}`)].join('\n') + '\n'
}

/**
 * The diagram made fit for Mermaid, for an export that must not fail: double quotes become single
 * ones, line breaks spaces, the title is trimmed, a plain box becomes a software system, and
 * relationships to or from the boundary are left out (Mermaid refuses them).
 */
export function writableAsMermaid(diagram: Diagram): Diagram {
  const text = (value: string) => value.replace(/"/g, "'").replace(/\s*[\r\n]+\s*/g, ' ')
  const optional = (value: string | undefined) => {
    const cleaned = value === undefined ? undefined : text(value).trim()
    return cleaned ? cleaned : undefined
  }
  const title = optional(diagram.title)
  const boundaryId = diagram.boundary?.id
  return {
    level: diagram.level,
    ...(title !== undefined && { title }),
    elements: diagram.elements.map(({ name, description, technology, ...rest }) => ({
      ...rest,
      // Mermaid's C4 diagrams have neither a plain box nor code: a system, and a component.
      kind: rest.kind === 'box' ? 'softwareSystem' : rest.kind === 'code' ? 'component' : rest.kind,
      name: text(name).trim() || rest.id,
      ...(optional(description) !== undefined && { description: optional(description) }),
      ...(optional(technology) !== undefined && { technology: optional(technology) }),
    })),
    relationships: diagram.relationships
      .filter((r) => r.from !== boundaryId && r.to !== boundaryId)
      .map(({ label, technology, ...rest }) => ({
        ...rest,
        ...(optional(label) !== undefined && { label: optional(label) }),
        ...(optional(technology) !== undefined && { technology: optional(technology) }),
      })),
    ...(diagram.boundary && {
      boundary: { ...diagram.boundary, name: text(diagram.boundary.name).trim() || diagram.boundary.id },
    }),
  }
}

const ELEMENT_STATEMENTS: Record<string, { kind: ElementKind; external: boolean }> = {}
for (const [kind, macro] of Object.entries(ELEMENT_MACROS) as [Exclude<ElementKind, 'box' | 'code'>, string][]) {
  ELEMENT_STATEMENTS[macro] = { kind, external: false }
  ELEMENT_STATEMENTS[`${macro}_Ext`] = { kind, external: true }
}

const STATEMENT = /^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/
const BOUNDARY_OPEN = /^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)\s*\{$/

/** Splits an argument list on commas outside quotes; `""` and empty become `undefined`. */
function parseArguments(text: string, line: number): (string | undefined)[] {
  const args: (string | undefined)[] = []
  let rest = text
  for (;;) {
    rest = rest.trimStart()
    let value: string
    if (rest.startsWith('"')) {
      const end = rest.indexOf('"', 1)
      if (end < 0) throw new DiagramFormatError('Unterminated string', line)
      value = rest.slice(1, end)
      rest = rest.slice(end + 1).trimStart()
    } else {
      const comma = rest.indexOf(',')
      value = (comma < 0 ? rest : rest.slice(0, comma)).trim()
      rest = comma < 0 ? '' : rest.slice(comma)
      if (value.includes('"')) throw new DiagramFormatError('Misplaced double quote', line)
      if (value.startsWith('$')) {
        throw new DiagramFormatError(`Named arguments are not supported: ${value}`, line)
      }
    }
    args.push(value === '' ? undefined : value)
    if (rest === '') return args
    if (!rest.startsWith(',')) throw new DiagramFormatError('Expected a comma', line)
    rest = rest.slice(1)
  }
}

function checkCount(
  macro: string,
  args: unknown[],
  min: number,
  max: number,
  line: number,
): void {
  if (args.length < min || args.length > max) {
    throw new DiagramFormatError(
      `${macro} takes ${min} to ${max} arguments, got ${args.length}`,
      line,
    )
  }
}

function parseId(value: string | undefined, line: number): string {
  if (value === undefined || !ELEMENT_ID.test(value)) {
    throw new DiagramFormatError(`Invalid element id: ${JSON.stringify(value ?? '')}`, line)
  }
  return value
}

function parse(text: string): Diagram {
  const lines = text.split('\n')
  let level: C4Level | undefined
  let title: string | undefined
  const elements: DiagramElement[] = []
  const relationships: Relationship[] = []
  let boundary: Boundary | undefined
  /** Whether the lines are inside the boundary's braces. */
  let inside = false

  lines.forEach((raw, index) => {
    const line = index + 1
    const content = raw.trim()
    if (content === '' || content.startsWith('%%')) return

    if (level === undefined) {
      const found = (Object.entries(HEADERS) as [C4Level, string][]).find(
        ([, header]) => header === content,
      )
      if (!found) {
        throw new DiagramFormatError(
          `Expected a C4Context, C4Container or C4Component header, got: ${content}`,
          line,
        )
      }
      level = found[0]
      return
    }

    const titleMatch = /^title(?:\s+(.*))?$/.exec(content)
    if (titleMatch) {
      if (title !== undefined) throw new DiagramFormatError('Duplicate title', line)
      const value = titleMatch[1]?.trim()
      if (!value) throw new DiagramFormatError('Empty title', line)
      title = value
      return
    }

    if (content === '}') {
      if (!inside) throw new DiagramFormatError('Unexpected }', line)
      inside = false
      return
    }

    const opening = BOUNDARY_OPEN.exec(content)
    if (opening) {
      const [, macro = '', argumentText = ''] = opening
      const kind = (Object.entries(BOUNDARY_MACROS) as [Boundary['kind'], string][]).find(([, m]) => m === macro)?.[0]
      if (!kind) throw new DiagramFormatError(`Unsupported boundary: ${macro}`, line)
      if (boundary) throw new DiagramFormatError('Only one boundary is supported', line)
      const args = parseArguments(argumentText, line)
      checkCount(macro, args, 2, 2, line)
      const name = args[1]
      if (name === undefined) throw new DiagramFormatError(`${macro} needs a name`, line)
      boundary = { id: parseId(args[0], line), kind, name, members: [] }
      inside = true
      return
    }

    const match = STATEMENT.exec(content)
    if (!match) throw new DiagramFormatError(`Unsupported statement: ${content}`, line)
    const [, macro = '', argumentText = ''] = match

    const elementStatement = ELEMENT_STATEMENTS[macro]
    if (elementStatement) {
      const { kind, external } = elementStatement
      const args = parseArguments(argumentText, line)
      const withTechnology = HAS_TECHNOLOGY.has(kind)
      checkCount(macro, args, 2, withTechnology ? 4 : 3, line)
      const id = parseId(args[0], line)
      const name = args[1]
      if (name === undefined) throw new DiagramFormatError(`${macro} needs a name`, line)
      const [technology, description] = withTechnology ? [args[2], args[3]] : [undefined, args[2]]
      elements.push({
        id,
        kind,
        name,
        ...(description !== undefined && { description }),
        ...(technology !== undefined && { technology }),
        ...(external && { external }),
      })
      if (inside) boundary!.members.push(id)
      return
    }

    if (inside) throw new DiagramFormatError(`Only elements go inside a boundary: ${macro}`, line)
    if (macro === 'Rel') {
      const args = parseArguments(argumentText, line)
      checkCount(macro, args, 3, 4, line)
      const [, , label, technology] = args
      relationships.push({
        from: parseId(args[0], line),
        to: parseId(args[1], line),
        ...(label !== undefined && { label }),
        ...(technology !== undefined && { technology }),
      })
      return
    }

    throw new DiagramFormatError(`Unsupported statement: ${macro}`, line)
  })

  if (level === undefined) throw new DiagramFormatError('Missing C4 diagram header', lines.length)
  if (inside) throw new DiagramFormatError('The boundary is not closed with }', lines.length)
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

export const mermaidFormat: DiagramFormat = {
  id: 'mermaid',
  name: 'Mermaid',
  fileExtension: '.mmd',
  serialize,
  parse,
}
