import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { applyEvent } from '../events'
import type { WorkspaceEvent } from '../events'
import {
  MAX_LOG,
  goTo,
  parseHistory,
  record,
  redo,
  serializeHistory,
  startHistory,
  undo,
} from '../history'
import type { History } from '../history'
import { DiagramFormatError } from '../model'
import type { ElementKind } from '../model'
import { ROOT_VIEW_ID, emptyWorkspace, validateWorkspace } from '../workspace'
import { CONTRACT_DIAGRAMS } from '../contract'

const AT = '2026-01-01T09:00:00.000Z'
const add = (name: string): WorkspaceEvent => ({ type: 'objectAdded', view: ROOT_VIEW_ID, kind: 'softwareSystem', name })
const recordAll = (events: WorkspaceEvent[], history = startHistory(emptyWorkspace())) =>
  events.reduce((h, event) => record(h, event, AT), history)
const now = (history: History) => history.states[history.cursor]!
const names = (history: History) => now(history).model.objects.map((o) => o.name)

describe('record', () => {
  it('appends the event with its time and moves on to the new workspace', () => {
    const history = record(startHistory(emptyWorkspace()), add('Shop'), AT)
    expect(history.log).toEqual([{ at: AT, event: add('Shop') }])
    expect(history.cursor).toBe(1)
    expect(names(history)).toEqual(['Shop'])
    expect(history.states[0]).toEqual(emptyWorkspace())
  })

  it('returns its input for an event that changes nothing', () => {
    const history = startHistory(emptyWorkspace())
    expect(record(history, add(' '), AT)).toBe(history)
  })

  it('drops the undone changes when a new one comes', () => {
    const back = undo(undo(recordAll([add('Shop'), add('Billing'), add('Warehouse')])))
    const history = record(back, add('Bank'), AT)
    expect(history.log.map((entry) => entry.event)).toEqual([add('Shop'), add('Bank')])
    expect(names(history)).toEqual(['Shop', 'Bank'])
    expect(redo(history)).toBe(history)
  })

  it('makes one change of a connection and the label typed right after it', () => {
    const drawn = recordAll([
      add('Shop'),
      add('Billing'),
      { type: 'connected', view: ROOT_VIEW_ID, from: 'Shop', to: 'Billing' },
    ])
    const labelled = record(drawn, { type: 'connectionLabelled', connection: 'c1', label: 'Pays', technology: 'HTTPS' }, 'later')
    expect(labelled.log).toHaveLength(3)
    expect(labelled.log[2]).toEqual({
      at: AT,
      event: { type: 'connected', view: ROOT_VIEW_ID, from: 'Shop', to: 'Billing', label: 'Pays', technology: 'HTTPS' },
    })
    expect(now(labelled).model.connections).toEqual([
      { id: 'c1', from: 'Shop', to: 'Billing', label: 'Pays', technology: 'HTTPS' },
    ])
    expect(now(undo(labelled)).model.connections).toEqual([])
    // A later label is a change of its own.
    const again = record(labelled, { type: 'connectionLabelled', connection: 'c1', label: 'Charges' }, AT)
    expect(again.log).toHaveLength(4)
  })

  it(`keeps the last ${MAX_LOG} changes: older ones become part of the start`, () => {
    const many = Array.from({ length: MAX_LOG + 2 }, (_, i) => add(`S${i}`))
    const history = recordAll(many)
    expect(history.log).toHaveLength(MAX_LOG)
    expect(history.cursor).toBe(MAX_LOG)
    expect(history.states).toHaveLength(MAX_LOG + 1)
    expect(history.base.model.objects.map((o) => o.name)).toEqual(['S0', 'S1'])
    expect(names(history)).toHaveLength(MAX_LOG + 2)
  })
})

describe('undo, redo and goTo', () => {
  const history = recordAll([add('Shop'), add('Billing'), add('Warehouse')])

  it('step back and forth through the log without changing it', () => {
    const back = undo(history)
    expect(names(back)).toEqual(['Shop', 'Billing'])
    expect(back.log).toBe(history.log)
    expect(names(redo(back))).toEqual(['Shop', 'Billing', 'Warehouse'])
    expect(names(goTo(history, 1))).toEqual(['Shop'])
    expect(names(redo(goTo(history, 1)))).toEqual(['Shop', 'Billing'])
    expect(names(goTo(history, 0))).toEqual([])
  })

  it('stop at both ends', () => {
    expect(redo(history)).toBe(history)
    expect(undo(goTo(history, 0)).cursor).toBe(0)
    expect(goTo(history, 99).cursor).toBe(3)
    expect(goTo(history, -1).cursor).toBe(0)
    expect(goTo(history, 1.4).cursor).toBe(1)
  })
})

describe('parseHistory', () => {
  it('reads back what serializeHistory wrote, with every state', () => {
    const history = undo(recordAll([add('Shop'), add('Billing')]))
    expect(parseHistory(serializeHistory(history))).toEqual(history)
    expect(JSON.parse(serializeHistory(history))).not.toHaveProperty('states')
  })

  it('refuses what is not a history', () => {
    const history = recordAll([add('Shop')])
    const broken = [
      '{',
      '[]',
      JSON.stringify({ base: {}, log: [], cursor: 0 }),
      JSON.stringify({ ...JSON.parse(serializeHistory(history)), cursor: 2 }),
      JSON.stringify({ ...JSON.parse(serializeHistory(history)), log: [{ event: add('Shop') }] }),
      JSON.stringify({ ...JSON.parse(serializeHistory(history)), log: [{ at: AT, event: {} }] }),
    ]
    for (const text of broken) expect(() => parseHistory(text), text).toThrow(DiagramFormatError)
  })
})

describe('an arranged view', () => {
  it('is one entry of the log, undone and redone as one', () => {
    const TALL = { width: 220, height: 160 }
    const before = recordAll([add('Shop'), add('Billing')])
    const arranged = record(
      before,
      {
        type: 'viewArranged',
        view: ROOT_VIEW_ID,
        cards: [
          { object: 'Shop', to: { x: 40, y: 400 }, size: TALL },
          { object: 'Billing', to: { x: 400, y: 400 }, size: TALL },
        ],
      },
      AT,
    )
    expect(arranged.log).toHaveLength(3)
    const view = (h: History) => now(h).views[0]!
    expect(view(arranged).sizes).toEqual({ Shop: TALL, Billing: TALL })
    expect(now(undo(arranged))).toBe(now(before))
    expect(view(undo(arranged)).sizes).toBeUndefined()
    expect(now(redo(undo(arranged)))).toBe(now(arranged))
    expect(parseHistory(serializeHistory(arranged))).toEqual(arranged)
  })
})

// Property tests (docs/agents/verification.md).
describe('any sequence of changes, undos and redos', () => {
  type Step = (history: History) => History
  const object = (h: History, n: number) => {
    const objects = now(h).model.objects
    return objects[n % (objects.length || 1)]?.id ?? 'x'
  }
  const view = (h: History, n: number) => {
    const system = object(h, n)
    return [ROOT_VIEW_ID, `context-${system}`, `inside-${system}`][n % 3]!
  }
  const kind = fc.constantFrom('box', 'person', 'softwareSystem', 'container', 'component') satisfies fc.Arbitrary<ElementKind>
  const change = (make: (h: History) => WorkspaceEvent): Step => (h) => record(h, make(h), AT)

  const step: fc.Arbitrary<Step> = fc.oneof(
    { weight: 3, arbitrary: fc.tuple(fc.nat(), kind, fc.string({ minLength: 1 })).map(([v, k, name]) => change((h) => ({ type: 'objectAdded', view: view(h, v), kind: k, name }))) },
    fc.tuple(fc.nat(), fc.nat()).map(([v, n]) => change((h) => ({ type: 'objectPlaced', view: view(h, v), object: object(h, n) }))),
    fc
      .tuple(fc.nat(), fc.nat(), fc.integer({ min: -2000, max: 2000 }), fc.integer({ min: -2000, max: 2000 }))
      .map(([v, n, x, y]) => change((h) => ({ type: 'objectsMoved', view: view(h, v), moves: [{ object: object(h, n), to: { x, y } }] }))),
    fc
      .tuple(fc.nat(), fc.nat(), fc.integer({ min: -2000, max: 2000 }), fc.integer({ min: -2000, max: 2000 }), fc.constantFrom(120, 160, 200))
      .map(([v, n, x, y, height]) => change((h) => ({ type: 'viewArranged', view: view(h, v), cards: [{ object: object(h, n), to: { x, y }, size: { width: height > 160 ? 300 : 220, height } }] }))),
    fc.tuple(fc.nat(), fc.string()).map(([n, name]) => change((h) => ({ type: 'objectRenamed', object: object(h, n), name }))),
    fc.nat().map((n) => change((h) => ({ type: 'objectsRemoved', objects: [object(h, n)] }))),
    fc.tuple(fc.nat(), fc.nat(), fc.nat()).map(([v, a, b]) => change((h) => ({ type: 'connected', view: view(h, v), from: object(h, a), to: object(h, b) }))),
    fc.tuple(fc.nat(), fc.string()).map(([n, label]) => change((h) => ({ type: 'connectionLabelled', connection: `c${(n % 4) + 1}`, label }))),
    fc
      .tuple(fc.nat(), fc.constantFrom(...CONTRACT_DIAGRAMS), fc.integer({ min: -2000, max: 2000 }))
      .map(([v, diagram, x]) => change((h) => ({ type: 'diagramImported', view: view(h, v), diagram, places: { [diagram.elements[0]!.id]: { x, y: 40 } } }))),
    fc.constant<Step>(undo),
    fc.constant<Step>(redo),
    fc.nat().map((n): Step => (h) => goTo(h, n % (h.log.length + 1))),
  )
  const history = fc.array(step, { maxLength: 40 }).map((steps) => steps.reduce((h, s) => s(h), startHistory(emptyWorkspace())))

  it('keeps every state valid and equal to the events before it, applied in order', () => {
    fc.assert(
      fc.property(history, (h) => {
        expect(h.states).toHaveLength(h.log.length + 1)
        expect(h.states[0]).toBe(h.base)
        h.log.forEach((entry, i) => {
          expect(h.states[i + 1]).toEqual(applyEvent(h.states[i]!, entry.event))
          expect(h.states[i + 1]).not.toBe(h.states[i])
        })
        for (const state of h.states) validateWorkspace(state)
      }),
    )
  })

  it('undoes and redoes to exactly the same workspaces', () => {
    fc.assert(
      fc.property(history, (h) => {
        expect(now(redo(undo(h)))).toBe(h.cursor === 0 ? now(redo(h)) : now(h))
        expect(now(undo(redo(h)))).toBe(h.cursor === h.log.length ? now(undo(h)) : now(h))
      }),
    )
  })

  it('survives a round trip', () => {
    fc.assert(
      fc.property(history, (h) => {
        expect(parseHistory(serializeHistory(h))).toEqual(h)
      }),
    )
  })
})
