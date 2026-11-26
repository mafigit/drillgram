import { nearestLineColour } from './model'
import type { BoxShape, Diagram, DiagramElement, Relationship } from './model'

// A Miro board, read as boxes through Miro's REST API (v2), the one documented way to its
// content: Miro's own exports are pictures, a CSV of text and a backup only Miro reads.
// developers.miro.com/reference/get-items-1 and /get-connectors-1. Read only.

/** An item of a board as `GET /v2/boards/{board}/items` gives it; only what is read here. */
export interface MiroItem {
  id: string
  type: string
  data?: { content?: unknown; title?: unknown; description?: unknown; shape?: unknown; url?: unknown }
  /** The frame it stands in. */
  parent?: { id?: unknown }
}

/** A connector as `GET /v2/boards/{board}/connectors` gives it; a loose end has no item. */
export interface MiroConnector {
  id: string
  startItem?: { id?: unknown }
  endItem?: { id?: unknown }
  captions?: { content?: unknown }[]
  style?: { strokeColor?: unknown }
}

/** Items that are boxes by themselves; anything else comes only where a connector ends at it. */
const BOXES = new Map([
  ['frame', 'Frame'],
  ['sticky_note', 'Sticky note'],
  ['shape', 'Shape'],
  ['text', 'Text'],
  ['card', 'Card'],
  ['app_card', 'Card'],
])
const OTHERS = new Map([
  ['image', 'Image'],
  ['document', 'Document'],
  ['embed', 'Embed'],
  ['preview', 'Link'],
])

/**
 * Miro's shapes and the outline of ours for each: by the name the API gives a shape (`data.shape`),
 * and the name of an element of Miro's newer libraries (`flowchart-delay`), which a copy and the
 * board give. Read off a board holding every shape of Miro's panel (2026-11-26). A name that is
 * not here, or a plain rectangle, is a plain box.
 */
const SHAPES = new Map<string, BoxShape>([
  // The basic shapes, as the API names them; `chevron` and `pentagon_arrow` are not in its
  // reference, but are the two shapes after the braces in the panel.
  ['circle', 'circle'],
  ['triangle', 'triangle'],
  ['rhombus', 'diamond'],
  ['wedge_round_rectangle_callout', 'callout'],
  ['parallelogram', 'parallelogram'],
  ['star', 'star'],
  ['right_arrow', 'arrowRight'],
  ['left_arrow', 'arrowLeft'],
  ['left_right_arrow', 'arrowBoth'],
  ['pentagon', 'pentagon'],
  ['octagon', 'octagon'],
  ['hexagon', 'hexagon'],
  ['flow_chart_predefined_process', 'subroutine'],
  ['trapezoid', 'trapezoid'],
  ['cloud', 'cloud'],
  ['cross', 'cross'],
  ['can', 'cylinder'],
  ['left_brace', 'brace'],
  ['right_brace', 'braceRight'],
  ['chevron', 'step'],
  ['pentagon_arrow', 'tag'],
  // The flowchart shapes of the API (`/v2-experimental`).
  ['flow_chart_predefined_process_2', 'subroutine'],
  ['flow_chart_connector', 'circle'],
  ['flow_chart_magnetic_disk', 'cylinder'],
  ['flow_chart_input_output', 'parallelogram'],
  ['flow_chart_decision', 'diamond'],
  ['flow_chart_delay', 'delay'],
  ['flow_chart_display', 'display'],
  ['flow_chart_document', 'document'],
  ['flow_chart_magnetic_drum', 'queue'],
  ['flow_chart_internal_storage', 'internalStorage'],
  ['flow_chart_manual_input', 'manualInput'],
  ['flow_chart_manual_operation', 'invTrapezoid'],
  ['flow_chart_merge', 'flippedTriangle'],
  ['flow_chart_multidocuments', 'documents'],
  ['flow_chart_note_curly_left', 'brace'],
  ['flow_chart_note_curly_right', 'braceRight'],
  ['flow_chart_note_square', 'bracket'],
  ['flow_chart_offpage_connector', 'offPage'],
  ['flow_chart_or', 'circlePlus'],
  ['flow_chart_preparation', 'hexagon'],
  ['flow_chart_online_storage', 'storedData'],
  ['flow_chart_summing_junction', 'circleCross'],
  ['flow_chart_terminator', 'stadium'],
  // The elements of the Flowchart and Callouts libraries, as a copy and the board name them.
  ['flowchart-decision', 'diamond'],
  ['flowchart-terminator', 'stadium'],
  ['flowchart-predefined-process', 'subroutine'],
  ['flowchart-document', 'document'],
  ['flowchart-multiple-documents', 'documents'],
  ['flowchart-manual-input', 'manualInput'],
  ['flowchart-preparation', 'hexagon'],
  ['flowchart-data', 'parallelogram'],
  ['flowchart-database', 'cylinder'],
  ['flowchart-hard-disk', 'queue'],
  ['flowchart-internal-storage', 'internalStorage'],
  ['flowchart-manual-operation', 'invTrapezoid'],
  ['flowchart-delay', 'delay'],
  ['flowchart-stored-data', 'storedData'],
  ['flowchart-merge', 'flippedTriangle'],
  ['flowchart-connector', 'circle'],
  ['flowchart-or', 'circlePlus'],
  ['flowchart-summing-junction', 'circleCross'],
  ['flowchart-display', 'display'],
  ['flowchart-off-page-link', 'offPage'],
  ['flowchart-note-curly-right', 'braceRight'],
  ['flowchart-note-curly-left', 'brace'],
  ['flowchart-note-square', 'bracket'],
  ['flowchart-magnetic-tape', 'magneticTape'],
  ['flowchart-multiproc', 'processes'],
  ['flowchart-lined-shaded', 'linedProcess'],
  ['flowchart-lined-document', 'linedDocument'],
  ['flowchart-divided', 'divided'],
  ['flowchart-trapezoid', 'trapezoid'],
  ['flowchart-asymmetric', 'odd'],
  ['flowchart-lean-left', 'leanLeft'],
  ['flowchart-double-circle', 'doubleCircle'],
  ['flowchart-start', 'circle'],
  ['flowchart-stop', 'doubleCircle'],
  ['flowchart-junction', 'filledCircle'],
  ['flowchart-card', 'card'],
  ['flowchart-tagged-process', 'taggedProcess'],
  ['flowchart-loop-limit', 'loopLimit'],
  ['flowchart-collate', 'hourglass'],
  ['flowchart-extract', 'triangle'],
  ['flowchart-tagged-document', 'taggedDocument'],
  ['flowchart-disk-storage', 'disk'],
  ['flowchart-lightning-bolt', 'bolt'],
  ['flowchart-text-block', 'text'],
  ['flowchart-note-curly-both', 'braces'],
  ['flowchart-cloud', 'cloud'],
  ['flowchart-bang', 'bang'],
  ['flowchart-folder', 'folder'],
  ['flowchart-bucket', 'bucket'],
  ['callouts-callout', 'callout'],
  ['callouts-speech-bubble', 'speechBubble'],
  ['callouts-bracket', 'brace'],
])

/**
 * The basic shapes a copy names by a number (`shape: '4'`), in the API's words: those whose
 * number was matched with the same board's vector PDF (2026-11-26). Any other is a plain box.
 */
const SHAPE_CODES = new Map([
  ['3', 'rectangle'],
  ['4', 'circle'],
  ['8', 'rhombus'],
  // Known from atman-33/workhub (MIT), which wrote them from copies of its own.
  ['7', 'round_rectangle'],
  ['26', 'can'],
])

const ENTITIES = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', ' '],
])

/** The lines of a text Miro keeps as HTML (`<p>`, `<br>`, `<strong>`, entities), without empty ones. */
function lines(value: unknown): string[] {
  if (typeof value !== 'string') return []
  return value
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, name: string) => {
      const code = name[0] === '#' ? (name[1]?.toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)) : undefined
      if (code === undefined) return ENTITIES.get(name.toLowerCase()) ?? whole
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    })
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
}

const idOf = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value) : undefined)

/** The board's content as a diagram of boxes: frames hold what stands in them. */
export function miroDiagram(items: readonly MiroItem[], connectors: readonly MiroConnector[]): Diagram {
  const ends = new Set(connectors.flatMap((c) => [idOf(c.startItem?.id), idOf(c.endItem?.id)]).filter((id) => id !== undefined))
  const elements: DiagramElement[] = []
  /** Miro's id to the element's. */
  const ids = new Map<string, string>()
  const taken = new Set<string>()
  const parents = new Map<string, string>()
  for (const item of items) {
    const miroId = idOf(item.id)
    if (miroId === undefined || ids.has(miroId)) continue
    const fallback = BOXES.get(item.type) ?? (ends.has(miroId) ? (OTHERS.get(item.type) ?? 'Item') : undefined)
    if (fallback === undefined) continue
    const data = item.data ?? {}
    const text = [...lines(data.title), ...lines(data.content)]
    const [name = lines(data.url)[0] ?? fallback, ...rest] = text
    const description = [...rest, ...lines(data.description)].join('\n')
    const shape = item.type === 'text' ? 'text' : item.type === 'shape' && typeof data.shape === 'string' ? SHAPES.get(data.shape) : undefined
    let id = `m${miroId.replace(/[^A-Za-z0-9_]/g, '_')}`
    while (taken.has(id)) id += '_'
    taken.add(id)
    ids.set(miroId, id)
    const parent = idOf(item.parent?.id)
    if (parent !== undefined) parents.set(id, parent)
    elements.push({ id, kind: 'box', name, ...(description !== '' && { description }), ...(shape !== undefined && { shape }) })
  }
  // A frame holds what it says it holds, as long as that holds nothing round: a board never does.
  const inside = new Map<string, string>()
  for (const element of elements) {
    const parent = ids.get(parents.get(element.id) ?? '')
    if (parent === undefined || parent === element.id) continue
    let at: string | undefined = parent
    while (at !== undefined && at !== element.id) at = inside.get(at)
    if (at === undefined) inside.set(element.id, parent)
  }
  for (const element of elements) {
    const parent = inside.get(element.id)
    if (parent !== undefined) element.inside = parent
  }
  const relationships: Relationship[] = connectors.flatMap((connector) => {
    const from = ids.get(idOf(connector.startItem?.id) ?? '')
    const to = ids.get(idOf(connector.endItem?.id) ?? '')
    if (from === undefined || to === undefined) return []
    const label = (connector.captions ?? []).flatMap((caption) => lines(caption?.content)).join(' ')
    const stroke = connector.style?.strokeColor
    const colour = typeof stroke === 'string' ? nearestLineColour(stroke) : undefined
    return [{ from, to, ...(label !== '' && { label }), ...(colour !== undefined && { colour }) }]
  })
  return { level: 'context', elements, relationships }
}

/** The board's id in its link (`https://miro.com/app/board/uXjVO…=/`); nothing for another link. */
export function miroBoardId(link: string): string | undefined {
  const found = /^(?:https?:\/\/)?(?:www\.)?miro\.com\/app\/board\/([^/?#\s]+)/i.exec(link.trim())
  return found?.[1]
}

const API = 'https://api.miro.com/v2/boards/'

function refusal(status: number): string {
  if (status === 401) return 'Miro refused the access token. Make a new one in Miro and paste it here.'
  if (status === 403) return 'The access token may not read this board. Give its app the scope boards:read and install it to the team of the board.'
  if (status === 404) return 'Miro has no board at this link, or the team of the access token cannot see it.'
  if (status === 429) return 'Miro was asked too many times. Wait a minute and try again.'
  return `Miro answered with an error (${status}). Try again later.`
}

/**
 * Reads the board a link names, every item and connector, with an access token that may read it
 * (scope `boards:read`). Throws with what went wrong in words.
 */
export async function readMiroBoard(link: string, token: string, fetcher: typeof fetch = fetch): Promise<Diagram> {
  const board = miroBoardId(link)
  if (board === undefined) throw new Error('This is not a link to a Miro board. Copy it from the address bar of the board.')
  const all = async <T>(what: 'items' | 'connectors'): Promise<T[]> => {
    const found: T[] = []
    const seen = new Set<string>()
    for (let cursor: string | undefined = ''; cursor !== undefined; ) {
      const url = new URL(`${API}${encodeURIComponent(board)}/${what}`)
      url.searchParams.set('limit', '50')
      if (cursor !== '') url.searchParams.set('cursor', cursor)
      let response: Response
      try {
        response = await fetcher(url, { headers: { Authorization: `Bearer ${token.trim()}`, Accept: 'application/json' } })
      } catch {
        throw new Error('Drillgram could not reach Miro. Check the connection and try again.')
      }
      if (!response.ok) throw new Error(refusal(response.status))
      const page = (await response.json()) as { data?: unknown; cursor?: unknown }
      if (Array.isArray(page.data)) found.push(...(page.data as T[]))
      seen.add(cursor)
      cursor = typeof page.cursor === 'string' && page.cursor !== '' && !seen.has(page.cursor) ? page.cursor : undefined
    }
    return found
  }
  const [items, connectors] = await Promise.all([all<MiroItem>('items'), all<MiroConnector>('connectors')])
  return miroDiagram(items, connectors)
}

// What Miro puts on the clipboard when items are copied: in its `text/html`, a span's
// `data-meta` holds `<--(miro-data-v1)…(/miro-data-v1)-->`, base64 of JSON with every byte
// moved up by 59. Not documented and not supported by Miro (community.miro.com, 2025): read from
// copies of boards (2026-11-26), turned into the API's words, and read as a board is read.

const MARK = /\(miro-data-v1\)([A-Za-z0-9+/=\s]+)\(\/miro-data-v1\)/

/** Whether a pasted `text/html` is items copied from a Miro board. */
export function isMiroClipboard(html: string): boolean {
  return MARK.test(html)
}

/** The JSON a copy from Miro carries; nothing when the HTML is no copy from Miro or cannot be read. */
export function miroClipboardData(html: string): unknown {
  const found = MARK.exec(html)
  if (!found) return undefined
  try {
    const bytes = Uint8Array.from(atob(found[1]!.replace(/\s/g, '')), (char) => (char.charCodeAt(0) - 59 + 256) % 256)
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return undefined
  }
}

/** One copied item: its kind, and what it says of itself (`json`). */
interface Copied {
  id?: unknown
  widgetData?: { type?: unknown; json?: Record<string, unknown> }
}

const asRecord = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {})

/** A colour Miro keeps as a number (`0x333333`), as `#rrggbb`. */
function hexColour(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffff ? `#${value.toString(16).padStart(6, '0')}` : undefined
}

/** A style Miro keeps as JSON in a string. */
function styleOf(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return asRecord(value)
  try {
    return asRecord(JSON.parse(value))
  } catch {
    return {}
  }
}

/** The texts of a shape of Miro's newer libraries (`stencil`): its title or name first. */
function stencilText(json: Record<string, unknown>): string {
  const texts = asRecord(asRecord(asRecord(json.schema).data).texts)
  const order = ['title', 'name', 'content', ...Object.keys(texts)]
  return [...new Set(order)].map((key) => asRecord(texts[key]).text).filter((text): text is string => typeof text === 'string' && lines(text).length > 0).join('<br>')
}

/** The copied items in the words of Miro's API, so that a copy is read as a board is. */
export function miroClipboardBoard(data: unknown): { items: MiroItem[]; connectors: MiroConnector[] } {
  const objects = asRecord(asRecord(data).data).objects
  const copied: Copied[] = Array.isArray(objects) ? (objects as Copied[]) : []
  // A connector names its ends by their place in the list (`widgetIndex`).
  const idAt = (index: unknown) => (typeof index === 'number' ? idOf(copied[index]?.id) ?? String(index) : undefined)
  const items: MiroItem[] = []
  const connectors: MiroConnector[] = []
  copied.forEach((object, index) => {
    const id = idOf(object?.id) ?? String(index)
    const type = object?.widgetData?.type
    const json = asRecord(object?.widgetData?.json)
    // A frame names what stands in it by the place of the frame in the list (`_parent: { index }`).
    const parent = idAt(asRecord(json._parent).index)
    const within = parent !== undefined ? { parent: { id: parent } } : {}
    if (type === 'line') {
      const captions = asRecord(json.line).captions
      connectors.push({
        id,
        startItem: { id: idAt(asRecord(json.primary).widgetIndex) },
        endItem: { id: idAt(asRecord(json.secondary).widgetIndex) },
        captions: (Array.isArray(captions) ? captions : []).map((caption) => ({ content: asRecord(caption).text })),
        style: { strokeColor: hexColour(styleOf(json.style).lc) },
      })
    } else if (type === 'sticker') {
      items.push({ id, type: 'sticky_note', data: { content: json.text }, ...within })
    } else if (type === 'shape') {
      items.push({ id, type: 'shape', data: { content: json.text, shape: SHAPE_CODES.get(String(json.shape)) }, ...within })
    } else if (type === 'stencil') {
      // Named by its element (`flowchart-document`); a container holds what is put in it.
      const element = String(asRecord(json['ns:diagrammingNotation']).element ?? asRecord(json.schema).id ?? '')
      const container = element.endsWith('-container')
      items.push({ id, type: container ? 'frame' : 'shape', data: { [container ? 'title' : 'content']: stencilText(json), shape: element }, ...within })
    } else if (type === 'frame') {
      items.push({ id, type: 'frame', data: { title: json.title ?? json.text }, ...within })
    } else if (type === 'text') {
      items.push({ id, type: 'text', data: { content: json.text }, ...within })
    } else if (typeof type === 'string') {
      items.push({ id, type, data: { title: json.title ?? json.text }, ...within })
    }
  })
  return { items, connectors }
}

/** Items copied from a Miro board, as a diagram; throws with what is wrong in words. */
export function miroPastedDiagram(html: string): Diagram {
  if (!isMiroClipboard(html)) throw new Error('This is no copy from Miro. Select items on a board, copy them, and paste them here.')
  const data = miroClipboardData(html)
  if (data === undefined) throw new Error('Drillgram cannot read this copy from Miro. Copy the items again, or read the board by its link.')
  const { items, connectors } = miroClipboardBoard(data)
  const diagram = miroDiagram(items, connectors)
  if (diagram.elements.length === 0) throw new Error('This copy from Miro has nothing Drillgram takes: frames, sticky notes, shapes, texts or cards.')
  return diagram
}
