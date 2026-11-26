import { describe, it, expect } from 'vitest'
import * as model from '../../index'
import type { Diagram } from '../../index'

// Issue #21: the editor (apps/web, later apps/mcp-server) reaches the converters through
// `@drillgram/model` only, so the package entry must expose the registry and the Mermaid format.
describe('@drillgram/model diagram exports', () => {
  it('exposes the format registry, Mermaid format and error type', () => {
    expect(model.getDiagramFormat('mermaid')).toBe(model.mermaidFormat)
    expect(model.diagramFormats).toContain(model.mermaidFormat)
    expect(typeof model.validateDiagram).toBe('function')
    expect(new model.DiagramFormatError('x')).toBeInstanceOf(Error)
  })

  it('converts in both directions through every registered format', () => {
    const diagram: Diagram = {
      level: 'context',
      elements: [
        { id: 'customer', kind: 'person', name: 'Customer' },
        { id: 'shop', kind: 'softwareSystem', name: 'Online Shop' },
      ],
      relationships: [{ from: 'customer', to: 'shop', label: 'Places orders in' }],
    }
    for (const format of model.diagramFormats) {
      const text = format.serialize(structuredClone(diagram))
      expect(format.parse(text)).toEqual(diagram)
      expect(format.serialize(format.parse(text))).toBe(text)
    }
  })
})
