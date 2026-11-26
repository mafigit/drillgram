import { describe, expect, it } from 'vitest'
import { notWhatWasChosen } from '../pastedKind'

describe('a pasted text that is not what was chosen', () => {
  it('is said to be the Mermaid diagram it is, whatever format was chosen', () => {
    const sequence = '\n%% a comment\nsequenceDiagram\n A->>B: hi'
    for (const format of ['d2', 'mermaid'] as const) {
      expect(notWhatWasChosen(format, sequence)).toMatch(/^This is a Mermaid sequence diagram\. .* a sequence diagram is not read yet\.$/)
    }
    expect(notWhatWasChosen('mermaid', '```mermaid\nclassDiagram\n A <|-- B\n```')).toContain('Mermaid class diagram')
  })

  it('leaves a flowchart alone: that is read', () => {
    expect(notWhatWasChosen('d2', 'flowchart RL\n  a --> b')).toBeUndefined()
    expect(notWhatWasChosen('mermaid', 'graph TD;\n A-->B')).toBeUndefined()
  })

  it('is said to be Mermaid C4 when it was given as D2', () => {
    expect(notWhatWasChosen('d2', 'C4Context\n  Person(customer, "Customer")')).toBe('This is a Mermaid C4 diagram, not D2: choose "Mermaid" in the import menu.')
  })

  it('is left to the parser when it may be what was chosen', () => {
    expect(notWhatWasChosen('mermaid', 'C4Context\n  Person(customer, "Customer")')).toBeUndefined()
    expect(notWhatWasChosen('d2', 'vars: {\n  c4-level: context\n}\n"customer": "Customer" {\n}')).toBeUndefined()
    expect(notWhatWasChosen('d2', '"graph": "Graph database" {\n}')).toBeUndefined()
    expect(notWhatWasChosen('d2', '')).toBeUndefined()
  })
})
