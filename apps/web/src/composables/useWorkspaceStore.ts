import { computed, inject, provide, shallowRef } from 'vue'
import type { ComputedRef, InjectionKey, ShallowRef } from 'vue'
import type { History, Workspace, WorkspaceEvent } from '@drillgram/model'
import { hostSharing, joinSharing } from '../collab/sharing'
import type { HostSharing, Sharing } from '../collab/sharing'
import { api, ApiError, browserOnly } from '../lib/api'
import { storedOutbox } from '../lib/outbox'
import { WorkspaceLog } from '../lib/workspaceLog'
import type { LogServer, Outbox, Problem, ServerEntry } from '../lib/workspaceLog'
import { useWorkspaces } from './useWorkspaces'

export interface WorkspaceStore {
  /** The workspace at the point of the change log the editor is at. */
  workspace: ComputedRef<Workspace>
  /** The change log and where the editor is in it. */
  history: ShallowRef<History>
  /** The one way to change the workspace: the change is applied and logged with its time. */
  dispatch: (event: WorkspaceEvent) => void
  dispatchSaved: (event: WorkspaceEvent) => Promise<boolean>
  undo: () => void
  redo: () => void
  /** Go to the workspace as it was after this many changes. */
  goTo: (position: number) => void
  goToSaved: (position: number) => Promise<boolean>
  canUndo: ComputedRef<boolean>
  canRedo: ComputedRef<boolean>
  /**
   * Start over: an empty workspace and an empty change log, on the server. This is no change
   * in the log and cannot be undone. Throws when the server does not do it.
   */
  clear: () => Promise<void>
  /** Bring a workspace that this browser kept from before the server, with its change log. */
  bring: (from: History) => void
  /** Takes what was written to the log elsewhere (a folder changed from outside, J71). */
  pull: () => Promise<void>
  /**
   * Working on the workspace with others (collab/): to share it, or the session this browser
   * is a guest of. Only the app without a server has it so far.
   */
  sharing?: Sharing
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
  const own = serverLog(workspaceId)
  if (!browserOnly) return storeOf(await openLog(own, storedOutbox(workspaceId), onProblem))

  // Without a server the browser can share the workspace: it is then the server of its log
  // for its guests. What the host writes itself, the guests are told; what a guest writes,
  // the host's own editor takes.
  let sharing: HostSharing | undefined
  const told: LogServer = {
    read: own.read,
    async append(after, entries) {
      const answer = await own.append(after, entries)
      if (answer.ok) sharing?.moved(answer.head)
      return answer
    },
    async clear() {
      const answer = await own.clear()
      sharing?.moved(answer.head)
      return answer
    },
  }
  const opened = await openLog(told, storedOutbox(workspaceId), onProblem)
  const { workspaces } = useWorkspaces()
  sharing = hostSharing({
    server: own,
    workspace: () => workspaces.value.find((known) => known.id === workspaceId)?.name ?? 'Workspace',
    pull: () => void opened.log.pull(),
  })
  return storeOf(opened, sharing)
}

/**
 * Opens the workspace somebody else shares under a link, as their guest. Its log is the
 * host's: read and written through the connection to the host's browser, and nothing of it is
 * kept in this one. `key`: what the link has after its "#". `ended`: the session is over.
 * Throws `JoinFailed`.
 */
export async function openSharedStore(
  room: string,
  key: string,
  name: string,
  onProblem: (problem: Problem) => void,
  ended: (why: 'bye' | 'lost') => void,
): Promise<WorkspaceStore & { sharing: Sharing; workspaceName: string }> {
  const sharing = await joinSharing(room, key, name, ended)
  try {
    // What is not written yet waits nowhere: a guest who reloads joins again, and reads again.
    const opened = await openLog(sharing.server, { load: () => undefined, save: () => {} }, onProblem)
    sharing.onMoved(() => void opened.log.pull())
    return { ...storeOf(opened, sharing), sharing, workspaceName: sharing.workspace }
  } catch (failure) {
    sharing.stop()
    throw failure
  }
}

type Opened = { log: WorkspaceLog; history: ShallowRef<History> }

/** Reads a log and keeps the editor's history of it up to date. */
async function openLog(server: LogServer, outbox: Outbox, onProblem: (problem: Problem) => void): Promise<Opened> {
  // Made before the log calls back, filled when it is open.
  const history = shallowRef<History>()
  const log = await WorkspaceLog.open({
    server,
    outbox,
    onHistory: (next) => (history.value = next),
    onProblem,
    newId: () => crypto.randomUUID(),
    wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  })
  history.value = log.history
  return { log, history: history as ShallowRef<History> }
}

function storeOf({ log, history: now }: Opened, sharing?: Sharing): WorkspaceStore {
  return {
    workspace: computed(() => now.value.states[now.value.cursor]!),
    history: now,
    dispatch: (event) => log.dispatch(event, new Date().toISOString()),
    dispatchSaved: (event) => log.dispatchSaved(event, new Date().toISOString()),
    undo: () => log.goTo(now.value.cursor - 1),
    redo: () => log.goTo(now.value.cursor + 1),
    goTo: (position) => log.goTo(position),
    goToSaved: (position) => log.goToSaved(position),
    canUndo: computed(() => now.value.cursor > 0),
    canRedo: computed(() => now.value.cursor < now.value.log.length),
    clear: () => log.clear(),
    bring: (from) => log.bring(from),
    pull: () => log.pull(),
    sharing,
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
