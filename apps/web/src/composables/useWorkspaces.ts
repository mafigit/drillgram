import { shallowRef } from 'vue'
import { api } from '../lib/api'
import type { WorkspaceInfo } from '../lib/api'
import { onSignedOut } from './useSession'

// The workspaces of the signed-in user: one list for the whole app (the menu, the start page).
const workspaces = shallowRef<WorkspaceInfo[]>([])
// The next one to sign in in this browser has their own.
onSignedOut(() => (workspaces.value = []))

/** The workspace this browser had open last: where the app opens again. */
const LAST_KEY = 'drillgram.workspace.last'

async function load(): Promise<WorkspaceInfo[]> {
  workspaces.value = await api.get<WorkspaceInfo[]>('/workspaces')
  return workspaces.value
}

async function create(name: string): Promise<WorkspaceInfo> {
  const made = await api.post<WorkspaceInfo>('/workspaces', { name })
  workspaces.value = [...workspaces.value, made]
  return made
}

async function rename(id: string, name: string): Promise<void> {
  const renamed = await api.patch<WorkspaceInfo>(`/workspaces/${id}`, { name })
  workspaces.value = workspaces.value.map((known) => (known.id === id ? { ...known, name: renamed.name } : known))
}

async function remove(id: string): Promise<void> {
  await api.delete(`/workspaces/${id}`)
  workspaces.value = workspaces.value.filter((known) => known.id !== id)
}

function opened(id: string): void {
  window.localStorage.setItem(LAST_KEY, id)
}

/** Where the app opens: the workspace that was open last when it is still there, else the first. */
function first(): WorkspaceInfo | undefined {
  const last = window.localStorage.getItem(LAST_KEY)
  return workspaces.value.find((known) => known.id === last) ?? workspaces.value[0]
}

export function useWorkspaces() {
  return { workspaces, load, create, rename, remove, opened, first }
}
