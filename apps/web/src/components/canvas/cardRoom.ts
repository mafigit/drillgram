import { CARD } from '@drillgram/model'
import type { BoxShape, ElementKind, Size, TableColumn } from '@drillgram/model'
import { renderMarkdown } from '@/lib/markdown'
import { languageIcon } from './codeLanguages'
import { cardType } from './kinds'
import { boxShape } from './shapes'

/** A card grows with its text up to this height, in canvas pixels; longer text scrolls inside it. */
export const MAX_CARD_HEIGHT = 480
/** Card heights are whole steps of the grid cards lie on. */
const STEP = 20

export interface CardText {
  name: string
  kind: ElementKind
  description?: string
  technology?: string
  external?: boolean
  /** How many icons stand beside the name. */
  icons: number
  /** Its outline, when it is not a plain rectangle: the text keeps clear of it. */
  shape?: BoxShape | ''
  /** The columns of a table: a row each. As its form has them or as the model does. */
  columns?: readonly Pick<TableColumn, 'name'>[]
}

/**
 * The size a card needs to show all of its text: `CARD` for a card without a description or with
 * a short one, taller for more Markdown, never wider. It is measured in the page, with the
 * classes of the card itself (ObjectNode.vue): keep the two in step. Where nothing can be
 * measured (no page, as in unit tests) it is `CARD`.
 */
export function cardRoom(card: CardText): Size {
  if (typeof document === 'undefined') return CARD
  if (card.shape === 'table') return tableCardRoom(card)
  if (!card.description) return CARD
  if (card.kind === 'code') return codeCardRoom(card)
  const type = cardType({ kind: card.kind, technology: card.technology, external: card.external === true })
  const iconsRoom = card.icons > 0 ? card.icons * 18 + 14 : 0
  const probe = document.createElement('div')
  probe.setAttribute('aria-hidden', 'true')
  // The card's own box: its width, its padding (px-3 pt-4 pb-2; more where a shape's outline
  // comes in, as ObjectNode.vue keeps it) and its border.
  const inset = card.shape ? boxShape(card.shape, CARD.width, CARD.height).inset : undefined
  const padding = inset
    ? `${Math.max(16, inset.top + 6)}px ${Math.max(12, inset.right + 8)}px ${Math.max(8, inset.bottom + 4)}px ${Math.max(12, inset.left + 8)}px`
    : '16px 12px 8px'
  probe.style.cssText = `position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;box-sizing:border-box;width:${CARD.width}px;padding:${padding};border:1px solid transparent;display:flex;flex-direction:column;align-items:center;text-align:center`
  const body = document.createElement('div')
  body.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;width:100%'
  const nameRow = document.createElement('div')
  nameRow.style.cssText = `width:100%;padding-inline:${iconsRoom}px`
  const name = document.createElement('strong')
  name.className = 'line-clamp-2 block text-[15px] leading-tight font-semibold'
  name.textContent = card.name
  nameRow.append(name)
  const text = document.createElement('div')
  text.className = 'card-text w-full text-[11px] leading-snug'
  text.innerHTML = renderMarkdown(card.description)
  body.append(nameRow, text)
  probe.append(body)
  if (type) {
    const line = document.createElement('span')
    line.className = 'w-full truncate font-mono text-[10px] leading-tight'
    line.textContent = type
    probe.append(line)
  }
  document.body.append(probe)
  // A little air between the text and the last line, as the card has it.
  const needed = probe.offsetHeight + 6
  probe.remove()
  return roomFor(needed)
}

/** A card of the usual width that is `needed` px high at least: on the grid, within the limits. */
function roomFor(needed: number): Size {
  const height = Math.min(MAX_CARD_HEIGHT, Math.max(CARD.height, Math.ceil(needed / STEP) * STEP))
  return height === CARD.height ? CARD : { width: CARD.width, height }
}

/**
 * The same for a code element, which is laid out as a class box: what it is over its name, the
 * badge and the icons beside the name, under a line its members (`.object-card.is-code` in
 * main.css lays out these classes).
 */
function codeCardRoom(card: CardText): Size {
  const el = (tag: string, className: string, text?: string) => {
    const made = document.createElement(tag)
    made.className = className
    if (text !== undefined) made.textContent = text
    return made
  }
  const probe = el('div', 'object-card is-code')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = `position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;box-sizing:border-box;width:${CARD.width}px;border:1px solid transparent;display:flex;flex-direction:column`
  const body = el('div', 'card-body flex w-full flex-col')
  const nameRow = el('div', 'card-name-row w-full')
  nameRow.append(el('span', 'code-badge', 'C'))
  // The language's own icon stands there when no other was picked.
  const icons = Math.max(card.icons, languageIcon(card.technology) ? 1 : 0)
  for (let i = 0; i < icons; i++) nameRow.append(el('span', 'card-icon'))
  nameRow.append(el('strong', 'card-name line-clamp-2 block text-[15px] leading-tight font-semibold', card.name))
  const text = el('div', 'card-text is-code w-full text-[11px] leading-snug')
  text.innerHTML = renderMarkdown(card.description ?? '')
  body.append(nameRow, text)
  const type = cardType({ kind: card.kind, technology: card.technology, external: card.external === true })
  probe.append(body, el('span', 'card-type w-full truncate font-mono text-[10px] leading-tight', type ?? ''))
  document.body.append(probe)
  const needed = probe.offsetHeight + 2
  probe.remove()
  return roomFor(needed)
}

/**
 * The same for a table: its name over a line, a row per column that has a name, its text under
 * them (`.object-card.is-table` in main.css lays out these classes).
 */
function tableCardRoom(card: CardText): Size {
  const el = (tag: string, className: string, text?: string) => {
    const made = document.createElement(tag)
    made.className = className
    if (text !== undefined) made.textContent = text
    return made
  }
  const probe = el('div', 'object-card is-table')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = `position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;box-sizing:border-box;width:${CARD.width}px;border:1px solid transparent;display:flex;flex-direction:column`
  const body = el('div', 'card-body flex w-full flex-col')
  const nameRow = el('div', 'card-name-row relative w-full shrink-0')
  nameRow.append(el('strong', 'card-name line-clamp-2 block text-[15px] leading-tight font-semibold', card.name))
  body.append(nameRow)
  const rows = (card.columns ?? []).filter((column) => column.name.trim() !== '')
  if (rows.length === 0) body.append(el('p', 'card-columns-none', 'No columns yet: double-click to add them'))
  else {
    const list = el('ul', 'card-columns')
    for (const row of rows) list.append(el('li', 'card-column', row.name))
    body.append(list)
  }
  if (card.description?.trim()) {
    const text = el('div', 'card-text w-full text-[11px] leading-snug')
    text.innerHTML = renderMarkdown(card.description)
    body.append(text)
  }
  probe.append(body)
  const type = cardType({ kind: card.kind, technology: card.technology, external: card.external === true })
  if (type) probe.append(el('span', 'card-type w-full truncate font-mono text-[10px] leading-tight', type))
  document.body.append(probe)
  // To the pixel: four rows fit the usual card, and no row's height is left empty under the last.
  const needed = probe.offsetHeight
  probe.remove()
  return roomFor(needed)
}

