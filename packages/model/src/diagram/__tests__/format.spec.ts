import { describe, it, expect } from 'vitest'
import { diagramFormats, getDiagramFormat } from '../format'
import { mermaidFormat } from '../mermaid'

describe('diagram format registry', () => {
  it('finds the Mermaid format by id', () => {
    expect(getDiagramFormat('mermaid')).toBe(mermaidFormat)
  })

  it('lists Mermaid', () => {
    expect(diagramFormats).toContain(mermaidFormat)
  })

  it('throws for an unknown id', () => {
    expect(() => getDiagramFormat('plantuml')).toThrow('Unknown diagram format: plantuml')
  })

  it('has unique ids', () => {
    const ids = diagramFormats.map((format) => format.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
