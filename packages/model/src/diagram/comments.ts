import type { Point, Workspace } from './workspace'

// Comments (J17): what people say about a diagram, pinned to a place on it or to a card. They
// are kept in the workspace's log like its changes, but they are no change of the diagram: undo,
// redo and the timeline leave them alone (`History.comments`, `commentEntry` in log.ts).

/** One comment of a thread: who said it, when (ISO 8601), and what. */
export interface Comment {
  id: string
  author: string
  text: string
  at: string
}

/** Comments in one place: a pin on the diagram, the first comment first. */
export interface CommentThread {
  id: string
  /** The diagram the pin is on. */
  view: string
  /** Where on the diagram it was placed, in the diagram's own measures: the tip of the pin. */
  at: Point
  /** The card it was placed on, and where on that card: the pin goes where the card goes. */
  card?: { object: string; offset: Point }
  comments: Comment[]
  /** Who resolved it, and when: it is off the canvas, in the list of resolved comments. */
  resolved?: { by: string; at: string }
}

/** What happened to the comments. Ids are made by the browser that writes it. */
export type CommentEvent =
  | { type: 'started'; thread: string; comment: string; view: string; at: Point; card?: { object: string; offset: Point }; author: string; text: string }
  | { type: 'replied'; thread: string; comment: string; author: string; text: string }
  | { type: 'resolved'; thread: string; author: string }
  | { type: 'reopened'; thread: string }
  | { type: 'deleted'; thread: string }

export const MAX_COMMENT = 4000
export const MAX_AUTHOR = 40
const MAX_ID = 100

const clip = (text: string, max: number) => [...text].slice(0, max).join('')
/** A name fit to be shown: no edges of blanks, one blank between words, not endless, never empty. */
const authorOf = (said: unknown) => {
  const name = typeof said === 'string' ? clip(said.trim().replace(/\s+/g, ' '), MAX_AUTHOR) : ''
  return name === '' ? 'Guest' : name
}
/** What was typed, without the blank lines around it; empty: nothing was said. */
const textOf = (said: unknown) => (typeof said === 'string' ? clip(said.trim(), MAX_COMMENT) : '')
const isId = (said: unknown): said is string => typeof said === 'string' && said.length > 0 && said.length <= MAX_ID
const isPoint = (said: unknown): said is Point =>
  typeof said === 'object' && said !== null && Number.isFinite((said as Point).x) && Number.isFinite((said as Point).y)

/**
 * The threads after a comment event, made at `at`. Never mutates; an event that makes no sense
 * (an empty comment, a thread that is not there, one more with an id already taken) returns its
 * input. Deterministic: logs are replayed through it, and events may come from other browsers.
 */
export function applyComment(threads: readonly CommentThread[], event: CommentEvent, at: string): readonly CommentThread[] {
  const has = (id: string) => threads.some((thread) => thread.id === id)
  const change = (id: string, edit: (thread: CommentThread) => CommentThread | undefined) => {
    const thread = threads.find((t) => t.id === id)
    const edited = thread && edit(thread)
    return edited ? threads.map((t) => (t === thread ? edited : t)) : threads
  }
  switch (event?.type) {
    case 'started': {
      const text = textOf(event.text)
      if (!isId(event.thread) || !isId(event.comment) || typeof event.view !== 'string' || !isPoint(event.at) || text === '' || has(event.thread)) return threads
      const card = event.card && isId(event.card.object) && isPoint(event.card.offset) ? { object: event.card.object, offset: { x: event.card.offset.x, y: event.card.offset.y } } : undefined
      const comment: Comment = { id: event.comment, author: authorOf(event.author), text, at }
      return [...threads, { id: event.thread, view: event.view, at: { x: event.at.x, y: event.at.y }, ...(card && { card }), comments: [comment] }]
    }
    case 'replied': {
      const text = textOf(event.text)
      if (!isId(event.comment) || text === '') return threads
      return change(event.thread, (thread) =>
        thread.comments.some((c) => c.id === event.comment) ? undefined : { ...thread, comments: [...thread.comments, { id: event.comment, author: authorOf(event.author), text, at }] },
      )
    }
    case 'resolved':
      return change(event.thread, (thread) => (thread.resolved ? undefined : { ...thread, resolved: { by: authorOf(event.author), at } }))
    case 'reopened':
      return change(event.thread, ({ resolved, ...open }) => (resolved ? open : undefined))
    case 'deleted':
      return has(event.thread) ? threads.filter((thread) => thread.id !== event.thread) : threads
    default:
      return threads
  }
}

/** Where a thread's pin is on its diagram: on its card, where that card is now; else where it was placed. */
export function threadPlace(thread: CommentThread, ws: Workspace): Point {
  const card = thread.card
  const position = card && ws.views.find((view) => view.id === thread.view)?.positions[card.object]
  return position && card ? { x: position.x + card.offset.x, y: position.y + card.offset.y } : thread.at
}
