import { beforeEach, describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { MARK_KEYS_IDLE, markKey, markList, readMarks, writeMark } from '../cameraMarks'
import type { MarkKeysState, MarkPress } from '../cameraMarks'

const down = (key: string, more: Partial<MarkPress> = {}): MarkPress => ({ type: 'down', key, ...more })
const up = (key: string): MarkPress => ({ type: 'up', key })
/** Runs the presses one after the other: the actions they ask for and the state at the end. */
function run(presses: MarkPress[], from: MarkKeysState = MARK_KEYS_IDLE) {
  let state = from
  const actions = presses.map((press) => {
    const step = markKey(state, press)
    state = step.state
    return step.action
  })
  return { state, actions: actions.filter((a) => a !== undefined) }
}

describe('the keys of camera marks', () => {
  it('sets a mark while M is held and a number pressed', () => {
    const { state, actions } = run([down('m'), down('m', { repeat: true }), down('3'), up('3'), up('m')])
    expect(actions).toEqual([{ do: 'open' }, { do: 'set', mark: 3 }, { do: 'close', eaten: true }])
    expect(state.open).toBe(false)
  })

  it('jumps to a mark with M, let go, then a number', () => {
    const { state, actions } = run([down('m'), up('m'), down('2')])
    expect(actions).toEqual([{ do: 'open' }, { do: 'jump', mark: 2 }])
    expect(state.open).toBe(false)
  })

  it('takes the number of the key, whatever the layout says', () => {
    expect(run([down('m'), up('m'), down('&', { code: 'Digit1' })]).actions).toContainEqual({ do: 'jump', mark: 1 })
    expect(run([down('m'), up('m'), down('4', { code: 'Numpad4' })]).actions).toContainEqual({ do: 'jump', mark: 4 })
  })

  it('closes on Escape, on another key and when the window loses the keys', () => {
    expect(run([down('m'), up('m'), down('Escape')])).toEqual({ state: MARK_KEYS_IDLE, actions: [{ do: 'open' }, { do: 'close', eaten: true }] })
    expect(run([down('m'), up('m'), down('a')]).actions.at(-1)).toEqual({ do: 'close', eaten: false })
    expect(run([down('m'), { type: 'blur' }]).state).toEqual(MARK_KEYS_IDLE)
  })

  it('leaves 0, numbers alone and keys with Ctrl or the command key to the rest of the app', () => {
    for (const press of [down('1'), down('0'), down('m', { mod: true })]) expect(run([press])).toEqual({ state: MARK_KEYS_IDLE, actions: [] })
    expect(run([down('m'), up('m'), down('0')]).actions.at(-1)).toEqual({ do: 'close', eaten: false })
  })

  it('never leaves M held after it was let go, whatever came before', () => {
    const press = fc.oneof(
      fc.constantFrom('m', 'M', '1', '5', '9', '0', 'a', 'Escape').map((key) => down(key)),
      fc.constantFrom('m', 'M', '1', 'a').map((key) => up(key)),
      fc.constant<MarkPress>({ type: 'blur' }),
    )
    fc.assert(
      fc.property(fc.array(press), (presses) => {
        const { state } = run([...presses, up('m')])
        expect(state.held).toBe(false)
      }),
    )
  })
})

describe('camera marks kept in the browser', () => {
  beforeEach(() => window.localStorage.clear())

  it('are kept per workspace and diagram', () => {
    writeMark('w1', 'view-a', 1, { x: 10, y: 20, zoom: 1.5 })
    writeMark('w1', 'view-b', 2, { x: 0, y: 0, zoom: 1 })
    writeMark('w2', 'view-a', 9, { x: 5, y: 5, zoom: 0.5 })
    expect(readMarks('w1', 'view-a')).toEqual({ 1: { x: 10, y: 20, zoom: 1.5 } })
    expect(readMarks('w1', 'view-b')).toEqual({ 2: { x: 0, y: 0, zoom: 1 } })
    expect(readMarks('w2', 'view-a')).toEqual({ 9: { x: 5, y: 5, zoom: 0.5 } })
    expect(readMarks('w1', 'view-c')).toEqual({})
  })

  it('a mark set again replaces the one before', () => {
    writeMark('w', 'v', 1, { x: 1, y: 1, zoom: 1 })
    writeMark('w', 'v', 1, { x: 2, y: 2, zoom: 2 })
    expect(readMarks('w', 'v')).toEqual({ 1: { x: 2, y: 2, zoom: 2 } })
  })

  it('drops what is not a mark', () => {
    window.localStorage.setItem('drillgram.marks.w', JSON.stringify({ v: { 1: { x: 1, y: 'a', zoom: 1 }, 2: { x: 1, y: 2, zoom: 1 }, 12: { x: 0, y: 0, zoom: 1 } } }))
    expect(readMarks('w', 'v')).toEqual({ 2: { x: 1, y: 2, zoom: 1 } })
    window.localStorage.setItem('drillgram.marks.w', 'not json')
    expect(readMarks('w', 'v')).toEqual({})
  })

  it('lists them by number', () => {
    expect(markList({ 4: { x: 0, y: 0, zoom: 1 }, 1: { x: 0, y: 0, zoom: 1 } }).map((m) => m.mark)).toEqual([1, 4])
  })
})
