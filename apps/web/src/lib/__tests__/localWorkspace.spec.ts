import { describe, it, expect, beforeEach } from 'vitest'
import { ROOT_VIEW_ID, emptyWorkspace, goTo, record, serializeHistory, serializeWorkspace, startHistory } from '@drillgram/model'
import type { History, WorkspaceEvent } from '@drillgram/model'
import { HISTORY_KEY, STORAGE_KEY, localHistory } from '../localWorkspace'

const AT = '2026-01-01T09:00:00.000Z'
const add = (name: string): WorkspaceEvent => ({ type: 'objectAdded', view: ROOT_VIEW_ID, kind: 'softwareSystem', name })
const names = (history: History | undefined) => history?.states[history.cursor]!.model.objects.map((o) => o.name)

/** As the app kept a workspace in the browser before it had a server. */
function keep(history: History) {
  window.localStorage.setItem(STORAGE_KEY, serializeWorkspace(history.states[history.cursor]!))
  window.localStorage.setItem(HISTORY_KEY, serializeHistory(history))
}

describe('localHistory', () => {
  beforeEach(() => window.localStorage.clear())

  it('finds nothing in a browser that kept nothing', () => {
    expect(localHistory()).toBeUndefined()
  })

  it('finds nothing worth bringing in a workspace that is empty and never was changed', () => {
    keep(startHistory(emptyWorkspace()))
    expect(localHistory()).toBeUndefined()
  })

  it('gives the workspace with its change log and the place the editor was at', () => {
    const history = goTo(record(record(startHistory(emptyWorkspace()), add('Shop'), AT), add('Bank'), AT), 1)
    keep(history)
    const found = localHistory()
    expect(names(found)).toEqual(['Shop'])
    expect(found?.log).toEqual(history.log)
    expect(found?.cursor).toBe(1)
  })

  it('gives the workspace alone when its change log is gone, broken or leads elsewhere', () => {
    const history = record(startHistory(emptyWorkspace()), add('Shop'), AT)
    for (const log of [null, 'not JSON', serializeHistory(record(history, add('Bank'), AT))]) {
      keep(history)
      if (log === null) window.localStorage.removeItem(HISTORY_KEY)
      else window.localStorage.setItem(HISTORY_KEY, log)
      const found = localHistory()
      expect(names(found), String(log)).toEqual(['Shop'])
      expect(found?.log).toEqual([])
    }
  })

  it('finds nothing in a workspace that cannot be read', () => {
    window.localStorage.setItem(STORAGE_KEY, '{"model":')
    expect(localHistory()).toBeUndefined()
  })
})
