import { shallowRef } from 'vue'
import { readWorkspaceFile, workspaceFileName, writeWorkspaceFile } from '@drillgram/model'
import type { LogEntry } from '@drillgram/model'
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

/** The server takes this many entries in one request, and a request of a few megabytes. */
const MAX_BATCH = 500
const MAX_BATCH_SIZE = 1_000_000
const MAX_NAME = 200

/** Entries in the pieces the server takes, in their order. */
export function batches(entries: readonly LogEntry[]): LogEntry[][] {
  const made: LogEntry[][] = []
  let size = 0
  for (const entry of entries) {
    const length = JSON.stringify(entry).length
    const last = made.at(-1)
    if (!last || last.length >= MAX_BATCH || size + length > MAX_BATCH_SIZE) {
      made.push([entry])
      size = length
    } else {
      last.push(entry)
      size += length
    }
  }
  return made
}

/**
 * A workspace as a file (J64): its name and its change log as the server has it, to keep or
 * to take elsewhere. Gives the file's text and the name to save it under.
 */
async function fileOf(id: string): Promise<{ text: string; name: string }> {
  const { entries } = await api.get<{ entries: { entry: unknown }[] }>(`/workspaces/${id}/log?after=0`)
  const name = workspaces.value.find((known) => known.id === id)?.name ?? 'Workspace'
  return { text: writeWorkspaceFile(name, entries.map((kept) => kept.entry), new Date().toISOString()), name: workspaceFileName(name) }
}

/** A name for a workspace from a file that no workspace here has yet. */
function freeName(wanted: string): string {
  const taken = new Set(workspaces.value.map((known) => known.name))
  if (!taken.has(wanted)) return wanted
  for (let n = 1; ; n++) {
    const mark = n === 1 ? ' (imported)' : ` (imported ${n})`
    const name = [...wanted].slice(0, MAX_NAME - mark.length).join('') + mark
    if (!taken.has(name)) return name
  }
}

/**
 * Makes a workspace from a file: a new one beside those that are there, with the file's log,
 * so it opens as it was left and with its history. Throws `WorkspaceFileError` for a file
 * that is no workspace; nothing is made then, nor when the server does not take all of it.
 */
async function fromFile(text: string): Promise<WorkspaceInfo> {
  const file = readWorkspaceFile(text)
  // Entries of a log are told apart by their ids: in a log of their own they get their own.
  const entries = file.entries.map((entry) => ({ ...entry, id: crypto.randomUUID() }))
  const made = await create(freeName(file.name))
  try {
    let head = 0
    for (const batch of batches(entries)) head = (await api.post<{ head: number }>(`/workspaces/${made.id}/log`, { after: head, entries: batch })).head
  } catch (failure) {
    // Half a workspace is none.
    await remove(made.id).catch(() => {})
    throw failure
  }
  return made
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
  return { workspaces, load, create, rename, remove, opened, first, fileOf, fromFile }
}
