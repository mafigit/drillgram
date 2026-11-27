// Camera marks (J73): views of a diagram kept under the numbers 1 to 9. Hold M and press a
// number to keep the view; M alone, then a number, goes back there. Kept in this browser alone,
// per workspace and diagram: they are where one person looks, not part of the workspace.

/** Where a view looks: its middle, in the diagram's own measures, and how near. */
export interface CameraMark {
  x: number
  y: number
  zoom: number
}

export type CameraMarks = Partial<Record<number, CameraMark>>

const KEY = 'drillgram.marks.'

function isMark(value: unknown): value is CameraMark {
  const mark = value as CameraMark
  return typeof mark === 'object' && mark !== null && [mark.x, mark.y, mark.zoom].every((n) => typeof n === 'number' && Number.isFinite(n)) && mark.zoom > 0
}

function stored(workspace: string): Record<string, unknown> {
  try {
    const kept: unknown = JSON.parse(window.localStorage.getItem(KEY + workspace) ?? '{}')
    return typeof kept === 'object' && kept !== null && !Array.isArray(kept) ? (kept as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** The marks of a diagram (a view), as this browser keeps them. */
export function readMarks(workspace: string, view: string): CameraMarks {
  const kept = stored(workspace)[view]
  if (typeof kept !== 'object' || kept === null) return {}
  const marks: CameraMarks = {}
  for (const [n, mark] of Object.entries(kept)) {
    const number = Number(n)
    if (Number.isInteger(number) && number >= 1 && number <= 9 && isMark(mark)) marks[number] = { x: mark.x, y: mark.y, zoom: mark.zoom }
  }
  return marks
}

/** Keeps a mark of a diagram; one set again under its number replaces the one before. */
export function writeMark(workspace: string, view: string, mark: number, at: CameraMark): void {
  const all = stored(workspace)
  all[view] = { ...readMarks(workspace, view), [mark]: at }
  try {
    window.localStorage.setItem(KEY + workspace, JSON.stringify(all))
  } catch {
    // Private windows may refuse: the marks are then forgotten with the page.
  }
}

/** The marks by number. */
export function markList(marks: CameraMarks): ({ mark: number } & CameraMark)[] {
  return Object.entries(marks)
    .flatMap(([n, at]) => (at ? [{ mark: Number(n), ...at }] : []))
    .sort((a, b) => a.mark - b.mark)
}

/** A key going down or up, or the window losing the keys (another tab, a dialog of the browser). */
export type MarkPress =
  | { type: 'down'; key: string; code?: string; repeat?: boolean; mod?: boolean }
  | { type: 'up'; key: string; code?: string }
  | { type: 'blur' }

/** `held`: M is down. `open`: the marks are lit, waiting for a number. `set`: a mark was set while M was held. */
export interface MarkKeysState {
  held: boolean
  open: boolean
  set: boolean
}

export const MARK_KEYS_IDLE: MarkKeysState = { held: false, open: false, set: false }

/** `eaten`: the key was the marks' own, nothing else in the app should take it. */
export type MarkAction = { do: 'open' } | { do: 'set'; mark: number } | { do: 'jump'; mark: number } | { do: 'close'; eaten: boolean }

const isM = (press: { key: string; code?: string }) => press.key.toLowerCase() === 'm' || press.code === 'KeyM'

/** The number 1 to 9 of a key, by where it is on the keyboard, so that a layout with digits on Shift works too. */
function digit(press: { key: string; code?: string }): number | undefined {
  const found = /^(?:Digit|Numpad)([1-9])$/.exec(press.code ?? '') ?? /^([1-9])$/.exec(press.key)
  return found ? Number(found[1]) : undefined
}

/** What a key does to the camera marks. */
export function markKey(state: MarkKeysState, press: MarkPress): { state: MarkKeysState; action?: MarkAction } {
  if (press.type === 'blur') return { state: MARK_KEYS_IDLE, action: state.open ? { do: 'close', eaten: false } : undefined }
  if (press.type === 'up') {
    if (!isM(press) || !state.held) return { state }
    // Let go after a mark was set: done. Else the marks stay lit for a number.
    return state.set ? { state: MARK_KEYS_IDLE, action: { do: 'close', eaten: true } } : { state: { ...state, held: false } }
  }
  if (press.mod) return state.open ? { state: MARK_KEYS_IDLE, action: { do: 'close', eaten: false } } : { state }
  if (isM(press)) {
    if (press.repeat || state.held) return { state }
    return { state: { held: true, open: true, set: false }, action: { do: 'open' } }
  }
  if (!state.open) return { state }
  const number = digit(press)
  if (number !== undefined && state.held) return { state: { ...state, set: true }, action: { do: 'set', mark: number } }
  if (number !== undefined) return { state: MARK_KEYS_IDLE, action: { do: 'jump', mark: number } }
  return { state: MARK_KEYS_IDLE, action: { do: 'close', eaten: press.key === 'Escape' } }
}
