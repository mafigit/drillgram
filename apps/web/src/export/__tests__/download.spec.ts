import { describe, expect, it } from 'vitest'
import { fileName, pngScale, textOf } from '../download'
import type { Diagram } from '@drillgram/model'

describe('fileName', () => {
  it('is the title in lower case with hyphens, and the extension of the format', () => {
    expect(fileName('System Landscape diagram', 'svg')).toBe('system-landscape-diagram.svg')
    expect(fileName('Container diagram for Büro & Co.', 'mermaid')).toBe('container-diagram-for-buro-co.mmd')
    expect(fileName('Component diagram', 'd2')).toBe('component-diagram.d2')
    expect(fileName('???', 'png')).toBe('diagram.png')
  })
})

describe('pngScale', () => {
  it('is twice the size while every browser can paint it', () => {
    expect(pngScale(1000, 800)).toBe(2)
    expect(pngScale(10_000, 4_000)).toBeCloseTo(Math.sqrt(16_000_000 / 40_000_000))
    expect(pngScale(40_000, 100)).toBe(0.4)
  })
})

describe('textOf', () => {
  const diagram: Diagram = {
    level: 'context',
    title: 'The "best" shop',
    elements: [{ id: 'a', kind: 'person', name: 'Ann "A"' }],
    relationships: [],
  }

  it('writes Mermaid after making the diagram fit for it', () => {
    expect(textOf(diagram, 'mermaid')).toBe("C4Context\n  title The 'best' shop\n  Person(a, \"Ann 'A'\")\n")
  })

  it('writes D2 as it is', () => {
    expect(textOf(diagram, 'd2')).toContain('"a": "Ann \\"A\\"\\n[Person]" {')
  })
})
