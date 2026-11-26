import { describe, it, expect } from 'vitest'
import { getDiagramFormat } from '../format'
import { DiagramFormatError } from '../model'
import type { Diagram } from '../model'

// Issue #21: conversion in both directions, Mermaid first, reached through the generic registry.
const format = getDiagramFormat('mermaid')

function roundTrip(diagram: Diagram): Diagram {
  return format.parse(format.serialize(structuredClone(diagram)))
}

describe('Mermaid round trip through the format registry', () => {
  it.each([
    'Shop, Inc.',
    'Orders (v2)',
    '$sprite lookalike',
    '%% not a comment',
    'Ünïcødé 店',
    '  padded  ',
    "It's",
  ])('keeps the text %j in names, descriptions, technologies and labels', (text) => {
    const diagram: Diagram = {
      level: 'container',
      elements: [
        { id: 'a', kind: 'person', name: text, description: text },
        { id: 'b', kind: 'container', name: text, technology: text, description: text },
      ],
      relationships: [{ from: 'a', to: 'b', label: text, technology: text }],
    }
    expect(roundTrip(diagram)).toEqual(diagram)
  })

  it.each(['Shop, Inc.', 'Orders (v2)', '%% not a comment', 'Ünïcødé 店', "It's", 'title'])(
    'keeps the title %j',
    (title) => {
      const diagram: Diagram = { level: 'context', title, elements: [], relationships: [] }
      expect(roundTrip(diagram)).toEqual(diagram)
    },
  )

  it('keeps a padded title or refuses to write it', () => {
    const diagram: Diagram = {
      level: 'context',
      title: '  padded  ',
      elements: [],
      relationships: [],
    }
    let text: string
    try {
      text = format.serialize(structuredClone(diagram))
    } catch (error) {
      expect(error).toBeInstanceOf(DiagramFormatError)
      return
    }
    expect(format.parse(text)).toEqual(diagram)
  })

  it('keeps element and relationship order, self relationships and parallel relationships', () => {
    const diagram: Diagram = {
      level: 'context',
      elements: [
        { id: 'z', kind: 'softwareSystem', name: 'Z' },
        { id: 'a', kind: 'person', name: 'A' },
      ],
      relationships: [
        { from: 'z', to: 'z', label: 'Calls itself' },
        { from: 'a', to: 'z', label: 'Uses' },
        { from: 'a', to: 'z', label: 'Pays' },
      ],
    }
    expect(roundTrip(diagram)).toEqual(diagram)
  })

  it('keeps an empty diagram', () => {
    const diagram: Diagram = { level: 'component', elements: [], relationships: [] }
    expect(roundTrip(diagram)).toEqual(diagram)
  })

  it('turns hand-written Mermaid into canonical Mermaid', () => {
    const handWritten =
      '%% shop\nC4Context\n\n   Person(customer,Customer)\nSystem( shop , "Online Shop" )\n' +
      'Rel(customer,shop,"Places orders in")'
    expect(format.serialize(format.parse(handWritten))).toBe(
      'C4Context\n' +
        '  Person(customer, "Customer")\n' +
        '  System(shop, "Online Shop")\n' +
        '  Rel(customer, shop, "Places orders in")\n',
    )
  })
})
