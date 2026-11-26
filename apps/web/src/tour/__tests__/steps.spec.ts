import { describe, expect, it } from 'vitest'
import { tourSteps } from '../steps'
import type { TourScene } from '../steps'

const SCENE: TourScene = { at: 'overview', objects: 22, connections: 23, changes: 1, lastChange: 'exampleLoaded', historyOpen: false, typing: false }
const steps = tourSteps(false)
const step = (id: string) => {
  const found = steps.find((known) => known.id === id)
  if (!found) throw new Error(`The tour has no step "${id}"`)
  return found
}
const done = (id: string, now: Partial<TourScene>, before: Partial<TourScene> = {}) => step(id).done!({ ...SCENE, ...now }, { ...SCENE, ...before })

describe('tourSteps', () => {
  it('begins with a welcome and ends with a goodbye, both in the middle of the screen', () => {
    expect(steps[0]!.id).toBe('welcome')
    expect(steps.at(-1)!.id).toBe('done')
    expect(steps[0]!.target).toBeUndefined()
    expect(steps.at(-1)!.target).toBeUndefined()
  })

  it('points at something in every step between, and names each step once', () => {
    for (const between of steps.slice(1, -1)) expect(between.target?.length, between.id).toBeGreaterThan(0)
    expect(new Set(steps.map((known) => known.id)).size).toBe(steps.length)
  })

  it('says something in every step', () => {
    for (const known of steps) {
      expect(known.title, known.id).not.toBe('')
      expect(known.text.length, known.id).toBeGreaterThan(20)
    }
  })

  it('knows that the box was opened, and that the way back was taken', () => {
    expect(done('open', { at: 'overview' })).toBe(false)
    expect(done('open', { at: 'inside' })).toBe(true)
    expect(done('back', { at: 'inside' }, { at: 'inside' })).toBe(false)
    expect(done('back', { at: 'overview' }, { at: 'inside' })).toBe(true)
  })

  it('begins a step where the step before it led', () => {
    const after = (id: string) => steps[steps.indexOf(step(id)) + 1]!
    expect(step('open').at).toBe('overview')
    expect(after('open').at).toBe('inside')
    expect(step('back').at).toBe('inside')
    expect(after('back').at).toBe('overview')
  })

  it('knows that a shape was added and that two cards were connected', () => {
    expect(done('add', {})).toBe(false)
    expect(done('add', { objects: 23 })).toBe(true)
    expect(done('connect', { objects: 23 })).toBe(false)
    expect(done('connect', { connections: 24 })).toBe(true)
  })

  it('knows that a card was moved and that the diagram was arranged, by the change that was logged', () => {
    expect(done('move', { changes: 2, lastChange: 'objectAdded' })).toBe(false)
    expect(done('move', { changes: 2, lastChange: 'objectsMoved' })).toBe(true)
    // The change before the step was one too: not this step's.
    expect(done('move', { lastChange: 'objectsMoved' }, { lastChange: 'objectsMoved' })).toBe(false)
    expect(done('arrange', { changes: 2, lastChange: 'viewArranged' })).toBe(true)
    expect(done('arrange', { changes: 2, lastChange: 'objectsMoved' })).toBe(false)
  })

  it('stays out of the way where the canvas itself is worked on or looked at', () => {
    for (const id of ['connect', 'move', 'card']) expect(step(id).side, id).toBe('away')
  })

  it('shows the frame of the opened box before it goes on to its views', () => {
    expect(steps.map((known) => known.id).slice(1, 5)).toEqual(['open', 'inside', 'views', 'back'])
    expect(step('inside').at).toBe('inside')
  })

  it('opens the history for the step that is about it, and for no other', () => {
    expect(steps.filter((known) => known.history).map((known) => known.id)).toEqual(['timeline'])
    // Right after the step that asks to press "History".
    expect(steps[steps.indexOf(step('history')) + 1]!.id).toBe('timeline')
    // It is played with, not answered: the tour does not run off while the timeline is dragged.
    expect(step('timeline').done).toBeUndefined()
  })

  it('knows that the history was opened', () => {
    expect(done('history', {})).toBe(false)
    expect(done('history', { historyOpen: true })).toBe(true)
    // Open already: nothing was done.
    expect(done('history', { historyOpen: true }, { historyOpen: true })).toBe(false)
  })

  it('has a step on working together where the app can: without a server', () => {
    const ids = (browserOnly: boolean) => tourSteps(browserOnly).map((known) => known.id)
    expect(ids(false)).not.toContain('share')
    expect(ids(true).slice(-3)).toEqual(['share', 'keep', 'done'])
  })

  it('says where the diagrams are kept: on the server, or in the browser', () => {
    const keep = (browserOnly: boolean) => tourSteps(browserOnly).find((known) => known.id === 'keep')!.text
    expect(keep(false)).toContain('server')
    expect(keep(true)).toContain('this browser')
    expect(keep(true)).not.toContain('server')
  })

  it('speaks of fingers where the screen is worked with one: no keys, no mouse', () => {
    for (const known of [...tourSteps(false), ...tourSteps(true)]) {
      expect(known.touch ?? known.text, known.id).not.toMatch(/\b(Ctrl|Cmd|click|double-click|right-click|Shift|Scroll|hover)\b/i)
    }
  })

  it('brings near, on a phone, the cards a step asks to work on', () => {
    const near = (id: string) => steps.find((known) => known.id === id)!.near
    expect(near('open')).toEqual(['Web Shop'])
    expect(near('connect')).toEqual(['Customer', 'Web Shop'])
    expect(near('move')).toEqual(['Customer'])
  })
})
