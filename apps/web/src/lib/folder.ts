import { shallowRef } from 'vue'
import type { LogEntry } from '@drillgram/model'
import { browserServer } from './browserServer'
import type { Answer } from './browserServer'
import { folderServer, got, openFolderDatabase, PLACE } from './folderServer'
import type { FolderHandle } from './folderServer'

// Where the app without a server keeps its workspaces (J71): the browser's own database, or a
// folder of the device that its user chose. The browser remembers the folder; it may ask its
// user again before the app opens it.

type Server = (method: string, path: string, body?: unknown) => Promise<Answer>

/** A folder as `showDirectoryPicker` gives it, with what is asked before it is opened. */
type Folder = FolderHandle & {
  queryPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>
}

const READWRITE = { mode: 'readwrite' } as const
const KEY = 'folder'

/** The folder the workspaces are kept in; none while the browser keeps them. */
export const keptIn = shallowRef<{ name: string }>()
/** The folder the browser must be allowed to open again before anything is read. */
export const askingFor = shallowRef<{ name: string }>()

/** Only Chromium's browsers let a page keep files in a folder. */
export const canKeepInFolder = () => typeof window !== 'undefined' && typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'

async function stored(): Promise<Folder | undefined> {
  const database = await openFolderDatabase(indexedDB)
  return (await got(database.transaction(PLACE).objectStore(PLACE).get(KEY))) as Folder | undefined
}

async function store(folder: Folder | undefined): Promise<void> {
  const database = await openFolderDatabase(indexedDB)
  const place = database.transaction(PLACE, 'readwrite').objectStore(PLACE)
  if (folder) await got(place.put(folder, KEY))
  else await got(place.delete(KEY))
}

let inBrowser: Server | undefined
const browser = () => (inBrowser ??= browserServer())

let current: Promise<Server> | undefined
/** Waits for the answer to "Open the folder". */
let answered: ((allowed: boolean) => void) | undefined
let waitingFolder: Folder | undefined

async function start(): Promise<Server> {
  const folder = canKeepInFolder() ? await stored().catch(() => undefined) : undefined
  if (!folder) return browser()
  if ((await folder.queryPermission?.(READWRITE)) !== 'granted') {
    waitingFolder = folder
    askingFor.value = { name: folder.name }
    const allowed = await new Promise<boolean>((resolve) => (answered = resolve))
    askingFor.value = undefined
    waitingFolder = undefined
    if (!allowed) {
      await store(undefined)
      return browser()
    }
  }
  keptIn.value = { name: folder.name }
  return folderServer(folder)
}

/** Where requests of the app without a server go: the folder, or the browser's database. */
export function storageServer(): Promise<Server> {
  current ??= start()
  return current
}

/** "Open the folder": the browser asks its user. False when it was refused. */
export async function allowFolder(): Promise<boolean> {
  const state = (await waitingFolder?.requestPermission?.(READWRITE)) ?? 'granted'
  if (state !== 'granted') return false
  answered?.(true)
  return true
}

/** "Keep in this browser instead": the browser's workspaces, as they were. The folder's files stay. */
export async function keepInBrowser(): Promise<void> {
  if (answered && askingFor.value) {
    answered(false)
    return
  }
  await store(undefined)
  keptIn.value = undefined
  current = Promise.resolve(browser())
}

/** The entries that make a log today: after the last "cleared". */
function sinceCleared(entries: LogEntry[]): LogEntry[] {
  const from = entries.map((entry) => entry.type).lastIndexOf('cleared')
  return entries.slice(from + 1)
}

/**
 * "Keep in a folder": its user picks one, the browser's workspaces with changes are copied into
 * it, and the app keeps its workspaces there from now on. Gives the id the workspace `open` has there.
 * Throws an `AbortError` when the picker was closed without a folder.
 */
export async function chooseFolder(open?: string): Promise<string | undefined> {
  const folder = await (window as unknown as { showDirectoryPicker(options: object): Promise<Folder> }).showDirectoryPicker({ id: 'drillgram', mode: 'readwrite' })
  const into = folderServer(folder)
  const from = browser()
  let openThere: string | undefined
  const kept = (await from('GET', '/workspaces')).data as { id: string; name: string; head: number }[]
  for (const workspace of kept) {
    if (workspace.head === 0) continue
    const { entries } = (await from('GET', `/workspaces/${workspace.id}/log?after=0`)).data as { entries: { entry: LogEntry }[] }
    const made = await into('POST', '/workspaces', { name: workspace.name })
    if (made.status !== 201) throw new Error(`The folder did not take the workspace ${workspace.name}.`)
    const { id } = made.data as { id: string }
    const written = await into('POST', `/workspaces/${id}/log`, { after: 0, entries: sinceCleared(entries.map((kept) => kept.entry)) })
    if (written.status !== 200) throw new Error(`The folder did not take the workspace ${workspace.name}.`)
    if (workspace.id === open) openThere = id
  }
  // A folder with no workspace gets the open one, empty as it is: the editor stays open.
  const opened = kept.find((workspace) => workspace.id === open)
  if (!openThere && opened && ((await into('GET', '/workspaces')).data as unknown[]).length === 0) {
    const made = await into('POST', '/workspaces', { name: opened.name })
    if (made.status !== 201) throw new Error(`The folder did not take the workspace ${opened.name}.`)
    openThere = (made.data as { id: string }).id
  }
  await store(folder)
  keptIn.value = { name: folder.name }
  current = Promise.resolve(into)
  return openThere
}
