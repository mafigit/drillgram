import { computed, shallowRef } from 'vue'
import type { ComputedRef, ShallowRef } from 'vue'
import {
  emptyWorkspace,
  goTo,
  parseHistory,
  parseWorkspace,
  record,
  serializeHistory,
  serializeWorkspace,
  startHistory,
} from '@drillgram/model'
import type { History, Workspace, WorkspaceEvent } from '@drillgram/model'

export const STORAGE_KEY = 'drillgram.workspace.v1'
export const HISTORY_KEY = 'drillgram.history.v1'

export interface WorkspaceStore {
  /** The workspace at the point of the change log the editor is at. */
  workspace: ComputedRef<Workspace>
  /** The change log and where the editor is in it. */
  history: ShallowRef<History>
  /** The one way to change the workspace: the change is applied and logged with its time. */
  dispatch: (event: WorkspaceEvent) => void
  undo: () => void
  redo: () => void
  /** Go to the workspace as it was after this many changes. */
  goTo: (position: number) => void
  canUndo: ComputedRef<boolean>
  canRedo: ComputedRef<boolean>
  /**
   * Start over: an empty workspace and an empty change log, in the browser's storage too. This
   * is no change in the log and cannot be undone.
   */
  clear: () => void
}

/**
 * The open workspace and its change log, both kept in localStorage so they survive a reload.
 * The workspace is the truth: a saved log that does not lead to it is dropped.
 */
export function useWorkspaceStore(): WorkspaceStore {
  const history = shallowRef(load())
  const set = (next: History) => {
    if (next === history.value) return
    history.value = next
    save(next)
  }
  return {
    workspace: computed(() => history.value.states[history.value.cursor]!),
    history,
    dispatch: (event) => set(record(history.value, event, new Date().toISOString())),
    undo: () => set(goTo(history.value, history.value.cursor - 1)),
    redo: () => set(goTo(history.value, history.value.cursor + 1)),
    goTo: (position) => set(goTo(history.value, position)),
    canUndo: computed(() => history.value.cursor > 0),
    canRedo: computed(() => history.value.cursor < history.value.log.length),
    clear: () => {
      history.value = startHistory(emptyWorkspace())
      window.localStorage.removeItem(STORAGE_KEY)
      window.localStorage.removeItem(HISTORY_KEY)
    },
  }
}

function save(history: History): void {
  window.localStorage.setItem(STORAGE_KEY, serializeWorkspace(history.states[history.cursor]!))
  try {
    window.localStorage.setItem(HISTORY_KEY, serializeHistory(history))
  } catch {
    // The storage is full: the workspace matters more than its log.
    window.localStorage.removeItem(HISTORY_KEY)
  }
}

function load(): History {
  const workspace = loadWorkspace()
  const saved = window.localStorage.getItem(HISTORY_KEY)
  if (saved !== null) {
    try {
      const history = parseHistory(saved)
      // Another version of the app, or another tab, may have written a different workspace.
      const leadsHere =
        serializeWorkspace(history.states[history.cursor]!) === serializeWorkspace(workspace)
      if (leadsHere) return history
    } catch {
      // A broken log: start a new one.
    }
  }
  return startHistory(workspace)
}

function loadWorkspace(): Workspace {
  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (saved === null) return emptyWorkspace()
  try {
    return parseWorkspace(saved)
  } catch {
    return emptyWorkspace()
  }
}
