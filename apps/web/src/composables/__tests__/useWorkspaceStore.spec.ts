import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  ROOT_VIEW_ID,
  addObject,
  emptyWorkspace,
  record,
  serializeHistory,
  serializeWorkspace,
  startHistory,
} from '@drillgram/model'
import type { WorkspaceEvent } from '@drillgram/model'
import { HISTORY_KEY, STORAGE_KEY, useWorkspaceStore } from '../useWorkspaceStore'

const add = (name: string): WorkspaceEvent => ({ type: 'objectAdded', view: ROOT_VIEW_ID, kind: 'softwareSystem', name })
const saved = (key: string) => JSON.parse(window.localStorage.getItem(key) ?? 'null')

describe('useWorkspaceStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.useFakeTimers({ now: new Date('2026-01-01T09:00:00Z') })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('starts empty when nothing is saved', () => {
    const { workspace, history } = useWorkspaceStore()
    expect(workspace.value).toEqual(emptyWorkspace())
    expect(history.value.log).toEqual([])
  })

  it('loads the saved workspace', () => {
    const ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'person', 'Customer')
    window.localStorage.setItem(STORAGE_KEY, serializeWorkspace(ws))
    expect(useWorkspaceStore().workspace.value).toEqual(ws)
  })

  it('starts empty when the saved workspace is broken', () => {
    window.localStorage.setItem(STORAGE_KEY, '{')
    expect(useWorkspaceStore().workspace.value).toEqual(emptyWorkspace())
  })

  it('saves every change, and logs it with its time', () => {
    const { workspace, history, dispatch } = useWorkspaceStore()
    dispatch(add('Online Shop'))
    expect(workspace.value.model.objects.map((o) => o.name)).toEqual(['Online Shop'])
    expect(saved(STORAGE_KEY)).toEqual(workspace.value)
    expect(history.value.log).toEqual([{ at: '2026-01-01T09:00:00.000Z', event: add('Online Shop') }])
    expect(saved(HISTORY_KEY).log).toEqual(history.value.log)
  })

  it('undoes, redoes and goes to any point of the log, saving where it is', () => {
    const { workspace, dispatch, undo, redo, goTo, canUndo, canRedo } = useWorkspaceStore()
    const names = () => workspace.value.model.objects.map((o) => o.name)
    expect([canUndo.value, canRedo.value]).toEqual([false, false])
    dispatch(add('Shop'))
    dispatch(add('Billing'))
    dispatch(add('Warehouse'))

    undo()
    expect(names()).toEqual(['Shop', 'Billing'])
    expect(saved(STORAGE_KEY)).toEqual(workspace.value)
    expect([canUndo.value, canRedo.value]).toEqual([true, true])
    goTo(0)
    expect(names()).toEqual([])
    expect(canUndo.value).toBe(false)
    redo()
    expect(names()).toEqual(['Shop'])
    goTo(3)
    expect(names()).toEqual(['Shop', 'Billing', 'Warehouse'])
    expect(canRedo.value).toBe(false)
  })

  it('loads the saved log and is where it was left', () => {
    const first = useWorkspaceStore()
    first.dispatch(add('Shop'))
    first.dispatch(add('Billing'))
    first.undo()

    const { workspace, history, redo } = useWorkspaceStore()
    expect(history.value).toEqual(first.history.value)
    expect(workspace.value.model.objects.map((o) => o.name)).toEqual(['Shop'])
    redo()
    expect(workspace.value.model.objects.map((o) => o.name)).toEqual(['Shop', 'Billing'])
  })

  it('starts a new log from the saved workspace when the saved log does not lead to it', () => {
    const ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'person', 'Customer')
    window.localStorage.setItem(STORAGE_KEY, serializeWorkspace(ws))
    const other = record(startHistory(emptyWorkspace()), add('Shop'), 'then')
    window.localStorage.setItem(HISTORY_KEY, serializeHistory(other))

    const { workspace, history } = useWorkspaceStore()
    expect(workspace.value).toEqual(ws)
    expect(history.value).toEqual(startHistory(ws))
  })

  it('starts a new log when the saved one is broken', () => {
    const ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'person', 'Customer')
    window.localStorage.setItem(STORAGE_KEY, serializeWorkspace(ws))
    window.localStorage.setItem(HISTORY_KEY, '{')
    expect(useWorkspaceStore().history.value).toEqual(startHistory(ws))
  })

  it('still saves the workspace when the log no longer fits into the storage', () => {
    const setItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === HISTORY_KEY) throw new DOMException('full', 'QuotaExceededError')
      setItem.call(this, key, value)
    })
    const { workspace, dispatch } = useWorkspaceStore()
    dispatch(add('Shop'))
    expect(saved(STORAGE_KEY)).toEqual(workspace.value)
    expect(window.localStorage.getItem(HISTORY_KEY)).toBeNull()
  })

  it('clears the workspace and its log, in the storage too, for good', () => {
    const store = useWorkspaceStore()
    store.dispatch(add('Online Shop'))
    store.dispatch(add('Billing'))
    store.undo()
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull()

    store.clear()
    expect(store.workspace.value).toEqual(emptyWorkspace())
    expect(store.history.value.log).toEqual([])
    expect(store.canUndo.value).toBe(false)
    expect(store.canRedo.value).toBe(false)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem(HISTORY_KEY)).toBeNull()
    // A new session finds nothing, and the cleared one goes on as a fresh one.
    expect(useWorkspaceStore().workspace.value).toEqual(emptyWorkspace())
    store.dispatch(add('Fresh Start'))
    expect(store.workspace.value.model.objects.map((o) => o.name)).toEqual(['Fresh Start'])
    expect(saved(HISTORY_KEY).log).toHaveLength(1)
  })
})
