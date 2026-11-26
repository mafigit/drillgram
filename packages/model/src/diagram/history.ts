import { applyEvent } from './events'
import type { WorkspaceEvent } from './events'
import { DiagramFormatError } from './model'
import { parseWorkspace } from './workspace'
import type { Workspace } from './workspace'

export interface LoggedEvent {
  /** When it happened, as an ISO 8601 time. */
  at: string
  event: WorkspaceEvent
}

/**
 * The change log of a workspace, with a cursor for undo and redo. The log is one line: a new
 * change after an undo drops the undone changes.
 */
export interface History {
  /** The workspace before the first event of the log. */
  base: Workspace
  log: LoggedEvent[]
  /** How many events of the log are applied: 0 is the base, `log.length` the newest state. */
  cursor: number
  /** `states[i]` is the workspace after `i` events. Derived from base and log, never saved. */
  states: Workspace[]
}

/** The log keeps this many changes; older ones become part of the base. */
export const MAX_LOG = 1000

export function startHistory(base: Workspace): History {
  return { base, log: [], cursor: 0, states: [base] }
}

/** Apply a change and log it. A change that changes nothing is not logged. */
export function record(history: History, event: WorkspaceEvent, at: string): History {
  const before = history.states[history.cursor]!
  if (applyEvent(before, event) === before) return history

  // The label typed right after drawing a connection belongs to that change.
  const last = history.log[history.cursor - 1]
  const drawn =
    event.type === 'connectionLabelled' &&
    last?.event.type === 'connected' &&
    last.event.label === undefined &&
    last.event.technology === undefined &&
    before.model.connections.at(-1)?.id === event.connection
      ? { ...last.event, label: event.label, ...(event.technology !== undefined && { technology: event.technology }) }
      : undefined
  const kept = drawn ? history.cursor - 1 : history.cursor
  const entry = drawn ? { at: last!.at, event: drawn } : { at, event }

  let base = history.base
  let log = [...history.log.slice(0, kept), entry]
  let states = [...history.states.slice(0, kept + 1), applyEvent(history.states[kept]!, entry.event)]
  if (log.length > MAX_LOG) {
    log = log.slice(1)
    states = states.slice(1)
    base = states[0]!
  }
  return { base, log, cursor: log.length, states }
}

/** Show the workspace as it was after `position` events. The log stays: redo leads forward. */
export function goTo(history: History, position: number): History {
  const cursor = Math.min(Math.max(Math.round(position), 0), history.log.length)
  return cursor === history.cursor ? history : { ...history, cursor }
}

export function undo(history: History): History {
  return goTo(history, history.cursor - 1)
}

export function redo(history: History): History {
  return goTo(history, history.cursor + 1)
}

export function serializeHistory(history: History): string {
  const { base, log, cursor } = history
  return JSON.stringify({ base, log, cursor })
}

/** Read a saved history and replay its log. Throws `DiagramFormatError` on anything else. */
export function parseHistory(text: string): History {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new DiagramFormatError('Not a history: invalid JSON')
  }
  const { base, log, cursor } = (isObject(value) ? value : {}) as Partial<History>
  const isShaped =
    Array.isArray(log) &&
    log.every((e) => isObject(e) && typeof e.at === 'string' && isObject(e.event) && typeof e.event.type === 'string') &&
    Number.isInteger(cursor) &&
    cursor! >= 0 &&
    cursor! <= log.length
  if (!isShaped) throw new DiagramFormatError('Not a history')
  const states = [parseWorkspace(JSON.stringify(base))]
  try {
    for (const entry of log) states.push(applyEvent(states.at(-1)!, entry.event))
  } catch {
    throw new DiagramFormatError('Not a history: an event cannot be applied')
  }
  return { base: states[0]!, log, cursor: cursor!, states }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
