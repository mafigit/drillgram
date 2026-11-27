import { CARD, STICKY_NOTE } from '@drillgram/model'
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
  // A sticky note keeps its size; longer text scrolls in it (J69).
  if (card.shape === 'stickyNote') return STICKY_NOTE
  if (typeof document === 'undefined') return CARD
  if (card.shape !== 'table' && !card.description) return CARD
  const probe = probeFor(card, CARD)
  document.body.append(probe.box)
  const needed = probe.box.offsetHeight + probe.air
  probe.box.remove()
  return roomFor(needed)
}

/**
 * Whether all of a card's text shows at a size (J68): no word wider than the card, the name not
 * cut short, the last line whole and the text no taller than the card (than `MAX_CARD_HEIGHT`
 * at most: longer text scrolls). A sticky note's text scrolls in it, so a note fits any size.
 */
export function cardFits(card: CardText, size: Size): boolean {
  if (card.shape === 'stickyNote' || typeof document === 'undefined') return true
  const probe = probeFor(card, size)
  document.body.append(probe.box)
  const cut = (part: HTMLElement | undefined) =>
    part !== undefined && (part.scrollHeight > part.clientHeight + 1 || part.scrollWidth > part.clientWidth + 1)
  const fits =
    probe.box.scrollWidth <= probe.box.clientWidth + 1 &&
    !cut(probe.name) &&
    !cut(probe.type) &&
    size.height >= Math.min(probe.box.offsetHeight + probe.air, MAX_CARD_HEIGHT)
  probe.box.remove()
  return fits
}

/** A card's text laid out as the card lays it out, at a size, out of sight; to be put in the page. */
interface Probe {
  box: HTMLElement
  /** The room under the text the card keeps besides. */
  air: number
  name: HTMLElement
  /** The last line: the kind and technology. */
  type?: HTMLElement
}

function probeFor(card: CardText, size: Size): Probe {
  if (card.shape === 'table') return tableProbe(card, size)
  if (card.kind === 'code') return codeProbe(card, size)
  const type = cardType({ kind: card.kind, technology: card.technology, external: card.external === true })
  const iconsRoom = card.icons > 0 ? card.icons * 18 + 14 : 0
  const probe = document.createElement('div')
  probe.setAttribute('aria-hidden', 'true')
  // The card's own box: its width, its padding (px-3 pt-4 pb-2; more where a shape's outline
  // comes in, as ObjectNode.vue keeps it) and its border.
  const inset = card.shape ? boxShape(card.shape, size.width, size.height).inset : undefined
  const padding = inset
    ? `${Math.max(16, inset.top + 6)}px ${Math.max(12, inset.right + 8)}px ${Math.max(8, inset.bottom + 4)}px ${Math.max(12, inset.left + 8)}px`
    : '16px 12px 8px'
  probe.style.cssText = `position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;box-sizing:border-box;width:${size.width}px;padding:${padding};border:1px solid transparent;display:flex;flex-direction:column;align-items:center;text-align:center`
  const body = document.createElement('div')
  body.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;width:100%'
  const nameRow = document.createElement('div')
  nameRow.style.cssText = `width:100%;padding-inline:${iconsRoom}px`
  const name = document.createElement('strong')
  name.className = 'line-clamp-2 block text-[15px] leading-tight font-semibold'
  name.textContent = card.name
  nameRow.append(name)
  body.append(nameRow)
  if (card.description) {
    const text = document.createElement('div')
    text.className = 'card-text w-full text-[11px] leading-snug'
    text.innerHTML = renderMarkdown(card.description)
    body.append(text)
  }
  probe.append(body)
  let line: HTMLElement | undefined
  if (type) {
    line = document.createElement('span')
    line.className = 'w-full truncate font-mono text-[10px] leading-tight'
    line.textContent = type
    probe.append(line)
  }
  // A little air between the text and the last line, as the card has it.
  return { box: probe, air: 6, name, type: line }
}

/** A card of the usual width that is `needed` px high at least: on the grid, within the limits. */
function roomFor(needed: number): Size {
  const height = Math.min(MAX_CARD_HEIGHT, Math.max(CARD.height, Math.ceil(needed / STEP) * STEP))
  return height === CARD.height ? CARD : { width: CARD.width, height }
}

const el = (tag: string, className: string, text?: string) => {
  const made = document.createElement(tag)
  made.className = className
  if (text !== undefined) made.textContent = text
  return made
}

/**
 * The same for a code element, which is laid out as a class box: what it is over its name, the
 * badge and the icons beside the name, under a line its members (`.object-card.is-code` in
 * main.css lays out these classes).
 */
function codeProbe(card: CardText, size: Size): Probe {
  const probe = el('div', 'object-card is-code')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = `position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;box-sizing:border-box;width:${size.width}px;border:1px solid transparent;display:flex;flex-direction:column`
  const body = el('div', 'card-body flex w-full flex-col')
  const nameRow = el('div', 'card-name-row w-full')
  nameRow.append(el('span', 'code-badge', 'C'))
  // The language's own icon stands there when no other was picked.
  const icons = Math.max(card.icons, languageIcon(card.technology) ? 1 : 0)
  for (let i = 0; i < icons; i++) nameRow.append(el('span', 'card-icon'))
  const name = el('strong', 'card-name line-clamp-2 block text-[15px] leading-tight font-semibold', card.name)
  nameRow.append(name)
  const text = el('div', 'card-text is-code w-full text-[11px] leading-snug')
  text.innerHTML = renderMarkdown(card.description ?? '')
  body.append(nameRow, text)
  const type = cardType({ kind: card.kind, technology: card.technology, external: card.external === true })
  const line = el('span', 'card-type w-full truncate font-mono text-[10px] leading-tight', type ?? '')
  probe.append(body, line)
  return { box: probe, air: 2, name, type: line }
}

/**
 * The same for a table: its name over a line, a row per column that has a name, its text under
 * them (`.object-card.is-table` in main.css lays out these classes).
 */
function tableProbe(card: CardText, size: Size): Probe {
  const probe = el('div', 'object-card is-table')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = `position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;box-sizing:border-box;width:${size.width}px;border:1px solid transparent;display:flex;flex-direction:column`
  const body = el('div', 'card-body flex w-full flex-col')
  const nameRow = el('div', 'card-name-row relative w-full shrink-0')
  const name = el('strong', 'card-name line-clamp-2 block text-[15px] leading-tight font-semibold', card.name)
  nameRow.append(name)
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
  let line: HTMLElement | undefined
  if (type) {
    line = el('span', 'card-type w-full truncate font-mono text-[10px] leading-tight', type)
    probe.append(line)
  }
  // To the pixel: four rows fit the usual card, and no row's height is left empty under the last.
  return { box: probe, air: 0, name, type: line }
}
