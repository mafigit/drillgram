import { d2Format, DiagramFormatError, flowchartFormat, isFlowchart, mermaidFormat } from '@drillgram/model'
import type { Diagram } from '@drillgram/model'

// What a text pasted into the import is, when it is not what the chosen format reads: said in
// words, instead of the parser's complaint about its first line.

/** Mermaid diagram kinds the import does not read, by the word a diagram of that kind starts with. */
const MERMAID_KINDS: Record<string, string> = {
  sequenceDiagram: 'sequence diagram',
  classDiagram: 'class diagram',
  stateDiagram: 'state diagram',
  'stateDiagram-v2': 'state diagram',
  erDiagram: 'entity relationship diagram',
  gantt: 'Gantt chart',
  mindmap: 'mind map',
  'architecture-beta': 'architecture diagram',
}

/**
 * Why a pasted text is not read as the chosen format, when it plainly is something else: a
 * Mermaid diagram of a kind that is not read, or a Mermaid C4 diagram given as D2. (A flowchart
 * is read whatever was chosen: components/ImportMenu.vue.) `undefined` when the parser should try.
 */
export function notWhatWasChosen(format: string, text: string): string | undefined {
  // The first line that says something: not empty, not a comment, not a Markdown fence.
  const first = text.split('\n').map((line) => line.trim()).find((line) => line !== '' && !line.startsWith('%%') && !line.startsWith('```'))
  const word = first?.split(/[\s;]/)[0] ?? ''
  const kind = MERMAID_KINDS[word]
  if (kind) {
    return `This is a Mermaid ${kind}. The import reads Mermaid flowcharts and C4 diagrams (C4Context, C4Container, C4Component) and D2 as the export writes it; a ${kind} is not read yet.`
  }
  if (format === 'd2' && /^C4(Context|Container|Component|Dynamic|Deployment)$/.test(word)) {
    return 'This is a Mermaid C4 diagram, not D2: choose "Mermaid" in the import menu.'
  }
  return undefined
}

/** Read the same text and Markdown fences from the import dialog and MCP. */
export function parseDiagramText(format: string, source: string): Diagram {
  const problem = notWhatWasChosen(format, source)
  if (problem) throw new Error(problem)
  const unfenced = /```mermaid\s*\n([\s\S]*?)```/.exec(source)?.[1] ?? source
  try {
    if (isFlowchart(source)) return flowchartFormat.parse(unfenced)
    return format === 'mermaid' ? mermaidFormat.parse(unfenced) : d2Format.parse(source)
  } catch (error) {
    if (error instanceof DiagramFormatError && error.line !== undefined) {
      throw new Error(`Line ${error.line}: ${error.message}`)
    }
    throw error
  }
}
