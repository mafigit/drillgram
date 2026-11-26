import { computed, inject, provide, shallowRef } from 'vue'
import type { ComputedRef, InjectionKey, ShallowRef } from 'vue'
import type { History, Workspace, WorkspaceEvent } from '@drillgram/model'
import { api, ApiError } from '../lib/api'
import { storedOutbox } from '../lib/outbox'
import { WorkspaceLog } from '../lib/workspaceLog'
import type { LogServer, Problem, ServerEntry } from '../lib/workspaceLog'

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
   * Start over: an empty workspace and an empty change log, on the server. This is no change
   * in the log and cannot be undone. Throws when the server does not do it.
   */
  clear: () => Promise<void>
  /** Bring a workspace that this browser kept from before the server, with its change log. */
  bring: (from: History) => void
}

const STORE: InjectionKey<WorkspaceStore> = Symbol('workspace store')

/** The log of a workspace on the server, as `WorkspaceLog` talks to it. */
export function serverLog(workspaceId: string): LogServer {
  const path = `/workspaces/${workspaceId}/log`
  return {
    read: (after) => api.get<{ head: number; entries: ServerEntry[] }>(`${path}?after=${after}`),
    async append(after, entries) {
      try {
        return { ok: true, head: (await api.post<{ head: number }>(path, { after, entries })).head }
      } catch (failure) {
        // The log has moved on: not an error, the answer says how far.
        if (failure instanceof ApiError && failure.status === 409 && typeof failure.data.head === 'number') return { ok: false, head: failure.data.head }
        throw failure
      }
    },
    clear: () => api.delete<{ head: number }>(path),
  }
}

/**
 * Opens a workspace: reads its change log from the server, which is the truth about it, and
 * writes every change of the editor to it. Throws when the workspace cannot be read.
 */
export async function openWorkspaceStore(workspaceId: string, onProblem: (problem: Problem) => void): Promise<WorkspaceStore> {
  // Made before the log calls back, filled when it is open.
  const history = shallowRef<History>()
  const log = await WorkspaceLog.open({
    server: serverLog(workspaceId),
    outbox: storedOutbox(workspaceId),
    onHistory: (next) => (history.value = next),
    onProblem,
    newId: () => crypto.randomUUID(),
    wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  })
  history.value = log.history
  const now = history as ShallowRef<History>
  return {
    workspace: computed(() => now.value.states[now.value.cursor]!),
    history: now,
    dispatch: (event) => log.dispatch(event, new Date().toISOString()),
    undo: () => log.goTo(now.value.cursor - 1),
    redo: () => log.goTo(now.value.cursor + 1),
    goTo: (position) => log.goTo(position),
    canUndo: computed(() => now.value.cursor > 0),
    canRedo: computed(() => now.value.cursor < now.value.log.length),
    clear: () => log.clear(),
    bring: (from) => log.bring(from),
  }
}

/** Gives the open workspace to the editor below (pages/WorkspacePage.vue). */
export function provideWorkspaceStore(store: WorkspaceStore): void {
  provide(STORE, store)
}

/** The open workspace and its change log. */
export function useWorkspaceStore(): WorkspaceStore {
  const store = inject(STORE)
  if (!store) throw new Error('No workspace is open: the editor stands inside pages/WorkspacePage.vue')
  return store
}
