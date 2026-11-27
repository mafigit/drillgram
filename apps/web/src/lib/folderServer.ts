import { readWorkspaceFile, WorkspaceFileError, workspaceFileName, writeWorkspaceFile } from '@drillgram/model'
import type { LogEntry } from '@drillgram/model'
import type { Answer } from './browserServer'

// The server, in a folder of the device (J71): the app built without a server keeps its
// workspaces there instead of the browser's database. Each workspace is a file of J64's
// format, `<id>.drillgram.json`, and the files are the truth: what another program writes
// there (git, a sync tool) is what is answered.
//
// The app counts entries by number and only goes forward. A file that grows is its log going
// on. A file written anew from outside (shorter, or with other entries) is a log that starts
// again, as after "Start over": a "cleared" entry, then the file's entries, numbered after
// what was there. The browser remembers how far each file was counted (`logs`), so every tab
// and every reload counts the same.

/** The part of a file the server needs, as the browser's file system gives it. */
export interface FileHandle {
  getFile(): Promise<{ text(): Promise<string> }>
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
}

/** The part of a folder the server needs, as `showDirectoryPicker` gives it. */
export interface FolderHandle {
  readonly name: string
  keys(): AsyncIterable<string>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>
  removeEntry(name: string): Promise<void>
}

/** Work that one tab does at a time, of all tabs: `navigator.locks`. */
export type Locks = <T>(work: () => Promise<T>) => Promise<T>

/** How far a file was counted: the number of its "cleared" entry (0: none) and the ids after it. */
interface Counted {
  id: string
  start: number
  ids: string[]
}

export const FOLDER_DATABASE = 'drillgram-folder'
/** The chosen folder, under the key `folder`. */
export const PLACE = 'place'
const LOGS = 'logs'
const SUFFIX = '.drillgram.json'
const MAX_NAME_LENGTH = 200

const USER = { id: 'browser', email: '', name: 'This browser', role: 'user', disabled: false }
const NOT_THERE: Answer = { status: 404, data: { error: 'There is no such workspace.' } }
const NO_NAME: Answer = { status: 400, data: { error: 'A workspace has a name of 1 to 200 characters.' } }

export function got<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** The browser's notes about the folder: which one it is, and how far its files were counted. */
export function openFolderDatabase(storage: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = storage.open(FOLDER_DATABASE, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(PLACE)
      request.result.createObjectStore(LOGS, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** One piece of work at a time, in this tab alone. */
export function localLocks(): Locks {
  let last: Promise<unknown> = Promise.resolve()
  return (work) => {
    const next = last.then(work, work)
    last = next.catch(() => {})
    return next
  }
}

/** One piece of work at a time, of all tabs of the browser: `navigator.locks` where there is one. */
export function browserLocks(): Locks {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  return locks ? (work) => locks.request(FOLDER_DATABASE, work) : localLocks()
}

function nameOf(body: unknown): string | undefined {
  const sent = (body as { name?: unknown } | undefined)?.name
  const name = typeof sent === 'string' ? sent.trim() : ''
  return name === '' || [...name].length > MAX_NAME_LENGTH ? undefined : name
}

const isMissing = (failure: unknown) => failure instanceof DOMException && (failure.name === 'NotFoundError' || failure.name === 'TypeMismatchError')

const READ_TRIES = 5

/** A file's text. Written anew by another program while it is read, it is read again. */
async function textOf(handle: FileHandle): Promise<string> {
  for (let tried = 1; ; tried++) {
    try {
      return await (await handle.getFile()).text()
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === 'NotReadableError') || tried === READ_TRIES) throw failure
    }
  }
}

/** The ids of `known` begin `found`: the file only grew. */
const grew = (known: readonly string[], found: readonly string[]) => known.length <= found.length && known.every((id, at) => found[at] === id)

/**
 * The server of one folder. `storage` holds the browser's notes about it; `locks` keeps two
 * tabs from writing a file at once.
 */
export function folderServer(folder: FolderHandle, storage: IDBFactory = indexedDB, locks: Locks = browserLocks()): (method: string, path: string, body?: unknown) => Promise<Answer> {
  let opening: Promise<IDBDatabase> | undefined
  const database = () => (opening ??= openFolderDatabase(storage).catch((failure) => {
    opening = undefined
    throw failure
  }))

  async function counted(id: string): Promise<Counted | undefined> {
    return (await got((await database()).transaction(LOGS).objectStore(LOGS).get(id))) as Counted | undefined
  }
  async function count(kept: Counted | undefined, id: string): Promise<void> {
    const store = (await database()).transaction(LOGS, 'readwrite').objectStore(LOGS)
    if (kept) await got(store.put(kept))
    else await got(store.delete(id))
  }

  /** The file of a workspace: undefined when there is none. Throws `WorkspaceFileError`. */
  async function readFile(id: string): Promise<{ name: string; entries: LogEntry[] } | undefined> {
    let handle: FileHandle
    try {
      handle = await folder.getFileHandle(`${id}${SUFFIX}`)
    } catch (failure) {
      if (isMissing(failure) || failure instanceof TypeError) return undefined
      throw failure
    }
    return readWorkspaceFile(await textOf(handle))
  }

  async function writeFile(id: string, name: string, entries: readonly LogEntry[], create = false): Promise<void> {
    const handle = await folder.getFileHandle(`${id}${SUFFIX}`, { create })
    // The time of the last change, not of the writing: the same log is the same file.
    const at = [...entries].reverse().find((entry) => entry.type === 'change')
    const writing = await handle.createWritable()
    await writing.write(writeWorkspaceFile(name, entries, at && 'at' in at ? at.at : '1970-01-01T00:00:00.000Z'))
    await writing.close()
  }

  /** How far the file is counted now: on from before, or again after a "cleared". */
  async function countFile(id: string, entries: readonly LogEntry[]): Promise<Counted> {
    const known = await counted(id)
    const ids = entries.map((entry) => entry.id ?? '')
    if (known && grew(known.ids, ids)) {
      if (known.ids.length === ids.length) return known
      const next = { ...known, ids }
      await count(next, id)
      return next
    }
    const next = known ? { id, start: known.start + known.ids.length + 1, ids } : { id, start: 0, ids }
    await count(next, id)
    return next
  }

  const head = (kept: Counted) => kept.start + kept.ids.length
  const view = (id: string, name: string, kept: Counted) => ({ id, name, role: 'owner', head: head(kept) })

  /** Work on the file of one workspace. */
  const withFile = (id: string, work: (file: { name: string; entries: LogEntry[] }, kept: Counted) => Promise<Answer>) =>
    locks(async () => {
      let file
      try {
        file = await readFile(id)
      } catch (failure) {
        if (failure instanceof WorkspaceFileError) return { status: 422, data: { error: failure.message } }
        throw failure
      }
      return file ? work(file, await countFile(id, file.entries)) : NOT_THERE
    })

  const list = () =>
    locks(async () => {
      const all: { id: string; name: string; role: string; head: number }[] = []
      for await (const key of folder.keys()) {
        if (!key.endsWith(SUFFIX)) continue
        const id = key.slice(0, -SUFFIX.length)
        try {
          const file = await readFile(id)
          if (file) all.push(view(id, file.name, await countFile(id, file.entries)))
        } catch (failure) {
          // Not a workspace: left out, as any other file of the folder.
          if (!(failure instanceof WorkspaceFileError)) throw failure
        }
      }
      return { status: 200, data: all.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) }
    })

  const create = (body: unknown) =>
    locks(async () => {
      const name = nameOf(body)
      if (name === undefined) return NO_NAME
      const stem = workspaceFileName(name).slice(0, -SUFFIX.length)
      let id = stem
      for (let n = 2; (await readFile(id).catch(() => ({}))) !== undefined; n++) id = `${stem}-${n}`
      await writeFile(id, name, [], true)
      const kept = { id, start: 0, ids: [] }
      await count(kept, id)
      return { status: 201, data: view(id, name, kept) }
    })

  const rename = (id: string, body: unknown) =>
    withFile(id, async (file, kept) => {
      const name = nameOf(body)
      if (name === undefined) return NO_NAME
      await writeFile(id, name, file.entries)
      return { status: 200, data: view(id, name, kept) }
    })

  const remove = (id: string) =>
    withFile(id, async () => {
      await folder.removeEntry(`${id}${SUFFIX}`)
      await count(undefined, id)
      return { status: 204, data: undefined }
    })

  const read = (id: string, after: number) =>
    withFile(id, async (file, kept) => {
      const entries: { seq: number; entry: unknown }[] = []
      if (kept.start > after) entries.push({ seq: kept.start, entry: { type: 'cleared' } })
      file.entries.forEach((entry, at) => {
        const seq = kept.start + 1 + at
        if (seq > after) entries.push({ seq, entry })
      })
      return { status: 200, data: { head: head(kept), entries } }
    })

  const append = (id: string, body: unknown) =>
    withFile(id, async (file, kept) => {
      const { after, entries } = body as { after: number; entries: LogEntry[] }
      if (head(kept) !== after) return { status: 409, data: { error: 'The log has entries you have not seen.', head: head(kept) } }
      const all = [...file.entries, ...entries]
      await writeFile(id, file.name, all)
      await count({ ...kept, ids: all.map((entry) => entry.id ?? '') }, id)
      return { status: 200, data: { head: after + entries.length } }
    })

  /** The file keeps its name and loses its entries; the count goes on after a "cleared". */
  const clear = (id: string) =>
    withFile(id, async (file, kept) => {
      await writeFile(id, file.name, [])
      const next = { id, start: head(kept) + 1, ids: [] }
      await count(next, id)
      return { status: 200, data: { head: next.start } }
    })

  return async (method, path, body) => {
    const [route = '', query = ''] = path.split('?')
    const [, top, id, part, ...more] = route.split('/')
    const asked = `${method} ${top}${id === undefined ? '' : '/:id'}${part === undefined ? '' : `/${part}`}`
    if (more.length === 0) {
      if (asked === 'GET session') return { status: 200, data: { user: USER } }
      if (asked === 'GET workspaces') return list()
      if (asked === 'POST workspaces') return create(body)
      if (asked === 'PATCH workspaces/:id') return rename(id!, body)
      if (asked === 'DELETE workspaces/:id') return remove(id!)
      if (asked === 'GET workspaces/:id/log') return read(id!, Number(new URLSearchParams(query).get('after') ?? 0))
      if (asked === 'POST workspaces/:id/log') return append(id!, body)
      if (asked === 'DELETE workspaces/:id/log') return clear(id!)
    }
    return { status: 404, data: { error: 'This app runs without a server: there is nothing here.' } }
  }
}
