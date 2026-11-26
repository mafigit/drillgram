import { describe, it, expect } from 'vitest'
import { DiagramFormatError, validateDiagram } from '../model'
import type { Diagram } from '../model'

function diagram(overrides: Partial<Diagram> = {}): Diagram {
  return {
    level: 'context',
    elements: [
      { id: 'customer', kind: 'person', name: 'Customer' },
      { id: 'shop', kind: 'softwareSystem', name: 'Online Shop' },
    ],
    relationships: [{ from: 'customer', to: 'shop', label: 'Places orders in' }],
    ...overrides,
  }
}

function errorOf(fn: () => void): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  throw new Error('expected a throw')
}

describe('DiagramFormatError', () => {
  it('carries a name and an optional line', () => {
    const error = new DiagramFormatError('bad', 3)
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('DiagramFormatError')
    expect(error.message).toBe('bad')
    expect(error.line).toBe(3)
    expect(new DiagramFormatError('bad').line).toBeUndefined()
  })
})

describe('validateDiagram', () => {
  it('accepts a valid diagram', () => {
    expect(() => validateDiagram(diagram())).not.toThrow()
  })

  it('rejects a duplicate id', () => {
    const d = diagram({
      elements: [
        { id: 'shop', kind: 'person', name: 'Customer' },
        { id: 'shop', kind: 'softwareSystem', name: 'Online Shop' },
      ],
      relationships: [],
    })
    expect(errorOf(() => validateDiagram(d))).toBeInstanceOf(DiagramFormatError)
  })

  it.each(['', '1shop', 'online-shop', 'a b', 'shop"'])('rejects the invalid id %j', (id) => {
    const d = diagram({ elements: [{ id, kind: 'person', name: 'Customer' }], relationships: [] })
    expect(errorOf(() => validateDiagram(d))).toBeInstanceOf(DiagramFormatError)
  })

  it('accepts ids with underscores and digits', () => {
    const d = diagram({
      elements: [{ id: '_shop_2', kind: 'person', name: 'Customer' }],
      relationships: [],
    })
    expect(() => validateDiagram(d)).not.toThrow()
  })

  it('rejects a relationship from an unknown id', () => {
    const d = diagram({ relationships: [{ from: 'ghost', to: 'shop' }] })
    expect(errorOf(() => validateDiagram(d))).toBeInstanceOf(DiagramFormatError)
  })

  it('rejects a relationship to an unknown id', () => {
    const d = diagram({ relationships: [{ from: 'customer', to: 'ghost' }] })
    expect(errorOf(() => validateDiagram(d))).toBeInstanceOf(DiagramFormatError)
  })

  it.each(['person', 'softwareSystem'] as const)('rejects technology on a %s', (kind) => {
    const d = diagram({
      elements: [{ id: 'x', kind, name: 'X', technology: 'Java' }],
      relationships: [],
    })
    expect(errorOf(() => validateDiagram(d))).toBeInstanceOf(DiagramFormatError)
  })

  it.each(['container', 'component'] as const)('accepts technology on a %s', (kind) => {
    const d = diagram({
      level: 'container',
      elements: [{ id: 'x', kind, name: 'X', technology: 'Java' }],
      relationships: [],
    })
    expect(() => validateDiagram(d)).not.toThrow()
  })
})
