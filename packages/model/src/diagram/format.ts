import type { Diagram } from './model'
import { d2Format } from './d2'
import { mermaidFormat } from './mermaid'

/** Converts a `Diagram` to and from one text format, in both directions. */
export interface DiagramFormat {
  id: string
  name: string
  fileExtension: string
  /** Validates first; throws `DiagramFormatError`. */
  serialize(diagram: Diagram): string
  /** Throws `DiagramFormatError` with a 1-based `line`. */
  parse(text: string): Diagram
}

export const diagramFormats: readonly DiagramFormat[] = [mermaidFormat, d2Format]

export function getDiagramFormat(id: string): DiagramFormat {
  const format = diagramFormats.find((candidate) => candidate.id === id)
  if (!format) throw new Error(`Unknown diagram format: ${id}`)
  return format
}
