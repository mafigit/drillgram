import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import type { WorkspaceEvent } from '../events'
import { MAX_LOG, goTo, record, startHistory } from '../history'
import type { History } from '../history'
import { changeEntry, moveEntry, replay } from '../log'
import type { LogEntry } from '../log'
import { ROOT_VIEW_ID, emptyWorkspace } from '../workspace'

const AT = '2026-01-01T09:00:00.000Z'
const add = (name: string): WorkspaceEvent => ({ type: 'objectAdded', view: ROOT_VIEW_ID, kind: 'softwareSystem', name })
const names = (history: History) => history.states[history.cursor]!.model.objects.map((o) => o.name)
/** What is saved of a history: its states follow from it. */
const saved = ({ base, log, cursor }: History) => ({ base, log, cursor })
let made = 0
const id = () => `entry-${++made}`

describe('changeEntry', () => {
  it('gives the history after a change and the entry that says it', () => {
    const { history, entry } = changeEntry(startHistory(emptyWorkspace()), add('Shop'), AT, 'e1')
    expect(names(history)).toEqual(['Shop'])
    expect(entry).toEqual({ id: 'e1', type: 'change', at: AT, event: add('Shop') })
  })

  it('gives no entry for a change that changes nothing', () => {
    const start = startHistory(emptyWorkspace())
    const { history, entry } = changeEntry(start, add(' '), AT, 'e1')
    expect(history).toBe(start)
    expect(entry).toBeUndefined()
  })
})

describe('moveEntry', () => {
  it('gives the history at another place of its log and the entry that says where', () => {
    const two = changeEntry(changeEntry(startHistory(emptyWorkspace()), add('Shop'), AT, 'e1').history, add('Bank'), AT, 'e2').history
    const { history, entry } = moveEntry(two, 1, 'e3')
    expect(names(history)).toEqual(['Shop'])
    expect(entry).toEqual({ id: 'e3', type: 'wentTo', position: 1 })
  })

  it('gives no entry when the history is there already, and never a place outside the log', () => {
    const one = changeEntry(startHistory(emptyWorkspace()), add('Shop'), AT, 'e1').history
    expect(moveEntry(one, 1, 'e2').entry).toBeUndefined()
    expect(moveEntry(one, 7, 'e2').entry).toBeUndefined()
    expect(moveEntry(one, -3, 'e2').entry).toEqual({ id: 'e2', type: 'wentTo', position: 0 })
  })
})

describe('replay', () => {
  it('starts with an empty workspace', () => {
    expect(saved(replay([]))).toEqual(saved(startHistory(emptyWorkspace())))
  })

  it('makes the history its entries say: changes, steps back, and a change that drops what was undone', () => {
    const entries: LogEntry[] = [
      { id: '1', type: 'change', at: AT, event: add('Shop') },
      { id: '2', type: 'change', at: AT, event: add('Billing') },
      { id: '3', type: 'wentTo', position: 1 },
      { id: '4', type: 'change', at: AT, event: add('Bank') },
    ]
    const history = replay(entries)
    expect(names(history)).toEqual(['Shop', 'Bank'])
    expect(history.log.map((logged) => logged.event)).toEqual([add('Shop'), add('Bank')])
    expect(history.cursor).toBe(2)
  })

  it('starts again at an entry that says the log was cleared', () => {
    const history = replay([
      { id: '1', type: 'change', at: AT, event: add('Shop') },
      { type: 'cleared' },
      { id: '2', type: 'change', at: AT, event: add('Bank') },
    ])
    expect(names(history)).toEqual(['Bank'])
    expect(history.log).toHaveLength(1)
    expect(history.base).toEqual(emptyWorkspace())
  })

  it('goes on from a history it is given', () => {
    const first = replay([{ id: '1', type: 'change', at: AT, event: add('Shop') }])
    expect(names(replay([{ id: '2', type: 'change', at: AT, event: add('Bank') }], first))).toEqual(['Shop', 'Bank'])
  })

  it('passes over what is no entry it knows, and an entry whose change cannot be applied', () => {
    const history = replay([
      { id: '1', type: 'change', at: AT, event: add('Shop') },
      null,
      'text',
      { id: '2', type: 'fromALaterVersion', what: 1 },
      { id: '3', type: 'change', at: AT },
      { id: '4', type: 'change', at: AT, event: { type: 'objectsCopied', view: ROOT_VIEW_ID } },
      { id: '5', type: 'wentTo', position: 'first' },
      { id: '6', type: 'change', at: AT, event: add('Bank') },
    ])
    expect(names(history)).toEqual(['Shop', 'Bank'])
  })

  it('keeps the newest changes of a log longer than a history holds, as the editor did', () => {
    let live = startHistory(emptyWorkspace())
    const entries: LogEntry[] = []
    for (let i = 0; i < MAX_LOG + 5; i++) {
      const added = changeEntry(live, add(`S${i}`), AT, id())
      live = added.history
      entries.push(added.entry!)
    }
    const history = replay(entries)
    expect(history.log).toHaveLength(MAX_LOG)
    expect(saved(history)).toEqual(saved(live))
  }, 60_000)

  it('gives the history the editor had, for any changes, steps back and steps forward', () => {
    const step = fc.oneof(
      { weight: 3, arbitrary: fc.record({ kind: fc.constant('add' as const), name: fc.constantFrom('Shop', 'Bank', 'Mail', ' ') }) },
      { weight: 1, arbitrary: fc.record({ kind: fc.constant('remove' as const) }) },
      { weight: 2, arbitrary: fc.record({ kind: fc.constant('go' as const), to: fc.integer({ min: -1, max: 12 }) }) },
    )
    fc.assert(
      fc.property(fc.array(step, { maxLength: 30 }), (steps) => {
        let live = startHistory(emptyWorkspace())
        const entries: LogEntry[] = []
        for (const taken of steps) {
          const first = live.states[live.cursor]!.model.objects[0]
          const event = taken.kind === 'add' ? add(taken.name) : { type: 'objectsRemoved' as const, objects: first ? [first.id] : [] }
          const made = taken.kind === 'go' ? moveEntry(live, taken.to, id()) : changeEntry(live, event, AT, id())
          // The editor without a log: the same history.
          expect(saved(made.history)).toEqual(saved(taken.kind === 'go' ? goTo(live, taken.to) : record(live, event, AT)))
          live = made.history
          if (made.entry) entries.push(made.entry)
        }
        // Through JSON, as the server gives the entries back.
        expect(saved(replay(JSON.parse(JSON.stringify(entries))))).toEqual(saved(live))
      }),
      { numRuns: 200 },
    )
  })
})
