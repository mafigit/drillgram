import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { CONTRACT_DIAGRAMS, runDiagramFormatContract } from '../contract'
import { d2Format } from '../d2'
import { getDiagramFormat } from '../format'
import { DiagramFormatError } from '../model'
import type { Diagram } from '../model'

runDiagramFormatContract(d2Format)

const J2_D2 = `# C4 context diagram
vars: {
  c4-level: context
}
direction: right
"customer": "Customer\\n[Person]" {
  shape: c4-person
  style: {fill: "#08427b"; stroke: "#073b6f"; font-color: "#ffffff"}
}
"shop": "Online Shop\\n[Software System]" {
  style: {fill: "#1168bd"; stroke: "#0b4884"; font-color: "#ffffff"}
}
"customer" -> "shop": "Places orders in"
`

function errorOf(fn: () => unknown): DiagramFormatError {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(DiagramFormatError)
    return error as DiagramFormatError
  }
  throw new Error('expected a throw')
}

describe('d2Format', () => {
  it('describes itself and is in the registry', () => {
    expect([d2Format.id, d2Format.name, d2Format.fileExtension]).toEqual(['d2', 'D2', '.d2'])
    expect(getDiagramFormat('d2')).toBe(d2Format)
  })

  it('writes the J2 diagram in canonical form', () => {
    expect(d2Format.serialize(CONTRACT_DIAGRAMS[0]!)).toBe(J2_D2)
    expect(d2Format.parse(J2_D2)).toEqual(CONTRACT_DIAGRAMS[0])
  })

  it('writes the boundary as a dashed box around its members, and paths to them', () => {
    const diagram = structuredClone(CONTRACT_DIAGRAMS[3]!)
    // D2, unlike Mermaid, draws a relationship to the boundary.
    diagram.relationships.push({ from: 'customer', to: 'shop', label: 'Buys from' })
    const text = d2Format.serialize(diagram)
    expect(text).toContain('diagram-title: "Container diagram for Online Shop" {\n  shape: text\n')
    expect(text).toContain(
      '"shop": "Online Shop\\n[Software System]" {\n  style: {fill: transparent; stroke: "#666666"; stroke-dash: 4; font-color: "#444444"}\n  "web": "Web App\\n[Container: Vue]" {\n',
    )
    expect(text).toContain('"shop"."web" -> "shop"."api": "Calls\\n[HTTPS]"\n')
    expect(text).toContain('"shop"."api" -> "mail": "Sends e-mail with"\n')
    expect(text).toContain('"customer" -> "shop": "Buys from"\n')
    expect(text).toContain('"mail": "Mail Service\\n[External Software System]" {\n  style: {fill: "#999999"')
    expect(d2Format.parse(text)).toEqual(diagram)
  })

  it('writes a description after an empty line, and a technology alone in brackets', () => {
    const diagram: Diagram = {
      level: 'container',
      elements: [
        { id: 'a', kind: 'container', name: 'API', technology: 'Go', description: 'Takes orders\nand more' },
        { id: 'b', kind: 'container', name: 'DB' },
      ],
      relationships: [{ from: 'a', to: 'b', technology: 'SQL' }, { from: 'b', to: 'a' }],
    }
    const text = d2Format.serialize(diagram)
    expect(text).toContain('"a": "API\\n[Container: Go]\\n\\nTakes orders\\nand more" {')
    expect(text).toContain('"a" -> "b": "[SQL]"\n"b" -> "a"\n')
    expect(d2Format.parse(text)).toEqual(diagram)
  })

  it('keeps any text in names, descriptions, technologies, labels and the title', () => {
    const line = fc.string({ minLength: 1 }).filter((s) => !/[\r\n]/.test(s))
    const optional = fc.option(fc.string({ minLength: 1 }), { nil: undefined })
    fc.assert(
      fc.property(line, optional, fc.option(line, { nil: undefined }), fc.option(line, { nil: undefined }), line, optional, (name, description, technology, label, relTech, title) => {
        const diagram: Diagram = {
          level: 'container',
          ...(title !== undefined && { title }),
          elements: [
            { id: 'a', kind: 'container', name, ...(description !== undefined && { description }), ...(technology !== undefined && { technology }) },
            { id: 'b', kind: 'person', name, external: true },
          ],
          relationships: [{ from: 'a', to: 'b', ...(label !== undefined && { label }), technology: relTech }],
        }
        expect(d2Format.parse(d2Format.serialize(structuredClone(diagram)))).toEqual(diagram)
      }),
    )
  })

  it('refuses what D2 cannot tell apart or the label cannot carry', () => {
    const twoCases: Diagram = {
      level: 'context',
      elements: [
        { id: 'Shop', kind: 'softwareSystem', name: 'A' },
        { id: 'shop', kind: 'softwareSystem', name: 'B' },
      ],
      relationships: [],
    }
    expect(() => d2Format.serialize(twoCases)).toThrow(/other case/)
    const broken = structuredClone(CONTRACT_DIAGRAMS[0]!)
    broken.elements[0]!.name = 'Two\nlines'
    expect(() => d2Format.serialize(broken)).toThrow(DiagramFormatError)
    const bracketed = structuredClone(CONTRACT_DIAGRAMS[0]!)
    bracketed.relationships[0]!.label = '[x]'
    expect(() => d2Format.serialize(bracketed)).toThrow(DiagramFormatError)
  })

  it('throws with the line on what it does not read', () => {
    expect(errorOf(() => d2Format.parse('"a": "A\\n[Person]" {\n}\n')).message).toMatch(/C4 level/)
    expect(errorOf(() => d2Format.parse(J2_D2.replace('[Person]', '[Robot]'))).line).toBe(6)
    expect(errorOf(() => d2Format.parse(J2_D2.replace('c4-level: context', 'c4-level: galaxy'))).line).toBe(3)
    expect(errorOf(() => d2Format.parse(`${J2_D2}"customer" -> "ghost"\n`)).message).toMatch(/unknown element/)
    expect(errorOf(() => d2Format.parse(`${J2_D2}x -> y\n`)).line).toBe(14)
    expect(errorOf(() => d2Format.parse(`${J2_D2}}\n`)).line).toBe(14)
    expect(errorOf(() => d2Format.parse(J2_D2.replace(/\}\n"shop"/, '"shop"'))).message).toMatch(/Unsupported|not closed/)
  })

  it('writes a plain box with its name alone, and its description after an empty line', () => {
    const diagram: Diagram = {
      level: 'context',
      elements: [
        { id: 'a', kind: 'box', name: 'Idea' },
        { id: 'b', kind: 'box', name: 'Plan', description: 'Two\nlines' },
        { id: 'c', kind: 'person', name: 'Ann' },
      ],
      relationships: [{ from: 'c', to: 'a', label: 'Has' }],
    }
    const text = d2Format.serialize(diagram)
    expect(text).toContain('"a": "Idea" {\n  style: {fill: "#ffffff"')
    expect(text).toContain('"b": "Plan\\n\\nTwo\\nlines" {')
    expect(d2Format.parse(text)).toEqual(diagram)
  })
})

describe('the shape of a box in D2', () => {
  const diagram = (shape: string, kind = 'container') => ({
    level: 'container' as const,
    elements: [{ id: 'db', kind: kind as 'container', name: 'Orders DB', shape: shape as 'cylinder' }],
    relationships: [],
  })

  it('is written as D2 has it, and read back', () => {
    const text = d2Format.serialize(diagram('cylinder'))
    expect(text).toContain('shape: cylinder')
    expect(d2Format.parse(text).elements[0]).toMatchObject({ kind: 'container', shape: 'cylinder' })
    for (const shape of ['queue', 'document', 'hexagon', 'diamond', 'circle', 'stadium', 'parallelogram', 'cloud']) {
      expect(d2Format.parse(d2Format.serialize(diagram(shape))).elements[0]!.shape, shape).toBe(shape)
    }
    expect(d2Format.serialize(diagram('stadium'))).toContain('shape: oval')
  })

  it('writes and reads the shapes D2 calls by another name: a folder is its package', () => {
    const theirs = { page: 'page', folder: 'package', step: 'step', callout: 'callout', storedData: 'stored_data', text: 'text' }
    for (const [ours, d2] of Object.entries(theirs)) {
      const text = d2Format.serialize(diagram(ours))
      expect(text, ours).toContain(`shape: ${d2}\n`)
      expect(d2Format.parse(text).elements[0]!.shape, ours).toBe(ours)
    }
  })

  it('reads a square or a rectangle as the plain box', () => {
    for (const d2 of ['square', 'rectangle']) {
      const text = d2Format.serialize(diagram('page')).replace('shape: page', `shape: ${d2}`)
      expect(d2Format.parse(text).elements[0], d2).not.toHaveProperty('shape')
    }
  })

  it('is left out where D2 has no such shape: the box comes back plain', () => {
    const text = d2Format.serialize(diagram('subroutine'))
    expect(text).not.toContain('shape:')
    expect(d2Format.parse(text).elements[0]).not.toHaveProperty('shape')
  })

  it('leaves a person its own shape', () => {
    const person = { level: 'context' as const, elements: [{ id: 'c', kind: 'person' as const, name: 'Customer' }], relationships: [] }
    expect(d2Format.parse(d2Format.serialize(person)).elements[0]).toEqual({ id: 'c', kind: 'person', name: 'Customer' })
  })
})

describe('the colour of a connection in D2', () => {
  const diagram = (relationship: object) => ({
    level: 'context' as const,
    elements: [
      { id: 'a', kind: 'softwareSystem' as const, name: 'A' },
      { id: 'b', kind: 'softwareSystem' as const, name: 'B' },
    ],
    relationships: [{ from: 'a', to: 'b', ...relationship }],
  })

  it('is written as the stroke of the line, and read back', () => {
    const coloured = diagram({ label: 'Calls', technology: 'HTTPS', colour: 'orange' })
    const text = d2Format.serialize(coloured)
    expect(text).toContain('"a" -> "b": "Calls\\n[HTTPS]" {style.stroke: "#ea580c"}')
    expect(d2Format.parse(text)).toEqual(coloured)
  })

  it('goes with a connection that says nothing, too', () => {
    const bare = diagram({ colour: 'blue' })
    const text = d2Format.serialize(bare)
    expect(text).toContain('"a" -> "b": {style.stroke: "#2563eb"}')
    expect(d2Format.parse(text)).toEqual(bare)
  })

  it('reads any stroke as the nearest of our colours', () => {
    const text = d2Format.serialize(diagram({ colour: 'blue' })).replace('#2563eb', '#1d4ed8')
    expect(d2Format.parse(text).relationships[0]).toEqual({ from: 'a', to: 'b', colour: 'blue' })
  })
})

describe('a table in D2', () => {
  const table = {
    level: 'context' as const,
    elements: [
      {
        id: 'orders',
        kind: 'box' as const,
        name: 'orders',
        shape: 'table' as const,
        columns: [{ name: 'id', type: 'uuid', key: 'primary' as const }, { name: 'customer_id', type: 'uuid', key: 'foreign' as const }, { name: 'email', type: 'text', key: 'unique' as const }, { name: 'note' }],
      },
    ],
    relationships: [],
  }

  it('is written as an SQL table with its columns, their types and keys, and read back', () => {
    const text = d2Format.serialize(table)
    expect(text).toContain('  shape: sql_table\n')
    expect(text).toContain('  "id": "uuid" {constraint: primary_key}\n')
    expect(text).toContain('  "customer_id": "uuid" {constraint: foreign_key}\n')
    expect(text).toContain('  "email": "text" {constraint: unique}\n')
    expect(text).toContain('  "note": ""\n')
    expect(d2Format.parse(text)).toEqual(table)
  })

  it('reads a table without columns as a table', () => {
    const bare = { ...table, elements: [{ id: 'orders', kind: 'box' as const, name: 'orders', shape: 'table' as const }] }
    expect(d2Format.parse(d2Format.serialize(bare))).toEqual(bare)
  })
})

