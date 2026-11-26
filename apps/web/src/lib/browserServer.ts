// The server, in the browser: for the app built to run without one (`build:browser`). It
// answers what the app asks of `/api` (lib/api.ts) from the browser's own database, in the
// server's words, so everything above it works as with a server: several workspaces, each with
// a change log that is the truth about it (apps/server, internal/store/workspaces.go). There
// is one user, who is whoever has the browser.

/** An answer as the server gives it: its HTTP status and what it says. */
export interface Answer {
  status: number
  data: unknown
}

/** A workspace as the browser keeps it. */
interface Kept {
  id: string
  name: string
  /** The number of the newest entry of its log. */
  head: number
  /** Workspaces are listed in the order they were made. */
  made: number
}

const DATABASE = 'drillgram'
const WORKSPACES = 'workspaces'
/** The entries of every log, under `[workspace, seq]`. */
const LOG = 'log'

/** A new browser starts with this workspace, as a new user of the server does. */
const FIRST_WORKSPACE = 'My workspace'
const MAX_NAME_LENGTH = 200

/** Who is signed in: always somebody, never an admin (there are no users to manage). */
const USER = { id: 'browser', email: '', name: 'This browser', role: 'user', disabled: false }

const NOT_THERE: Answer = { status: 404, data: { error: 'There is no such workspace.' } }
const NO_NAME: Answer = { status: 400, data: { error: 'A workspace has a name of 1 to 200 characters.' } }

const view = (kept: Kept) => ({ id: kept.id, name: kept.name, role: 'owner', head: kept.head })

function got<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function open(storage: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = storage.open(DATABASE, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      const first: Kept = { id: crypto.randomUUID(), name: FIRST_WORKSPACE, head: 0, made: 1 }
      database.createObjectStore(WORKSPACES, { keyPath: 'id' }).add(first)
      database.createObjectStore(LOG, { keyPath: ['workspace', 'seq'] })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Every entry of one workspace's log after the one numbered `after`. */
const entriesAfter = (workspace: string, after: number) => IDBKeyRange.bound([workspace, after], [workspace, Infinity], true)

function nameOf(body: unknown): string | undefined {
  const sent = (body as { name?: unknown } | undefined)?.name
  const name = typeof sent === 'string' ? sent.trim() : ''
  return name === '' || [...name].length > MAX_NAME_LENGTH ? undefined : name
}

/**
 * The server of one browser: what it is asked comes as a request to the server would, and it
 * answers as the server would. Tabs of the browser share the database; each asks through its own.
 * `keep` asks the browser not to throw the database away when its disk runs full.
 */
export function browserServer(
  storage: IDBFactory = indexedDB,
  keep: () => void = () => void navigator.storage?.persist?.(),
): (method: string, path: string, body?: unknown) => Promise<Answer> {
  let opening: Promise<IDBDatabase> | undefined
  let kept = false

  function database(): Promise<IDBDatabase> {
    opening ??= open(storage).then(
      (opened) => {
        // A later version of the app wants to change the database: this tab must let go of it.
        opened.onversionchange = () => {
          opened.close()
          opening = undefined
        }
        return opened
      },
      (failure) => {
        // Asked again, it is tried again.
        opening = undefined
        throw failure
      },
    )
    return opening
  }

  /**
   * One piece of work on the database, whole or not at all, and one after the other for all
   * tabs: what the row lock of a workspace is on the server.
   */
  async function within(mode: IDBTransactionMode, work: (workspaces: IDBObjectStore, log: IDBObjectStore) => Promise<Answer>): Promise<Answer> {
    const transaction = (await database()).transaction([WORKSPACES, LOG], mode)
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error ?? new Error('The browser did not keep the change.'))
    })
    const [answer] = await Promise.all([work(transaction.objectStore(WORKSPACES), transaction.objectStore(LOG)), done])
    return answer
  }

  /** Work on one workspace; for one that is not kept it is not there. */
  const withWorkspace = (mode: IDBTransactionMode, id: string, work: (workspace: Kept, workspaces: IDBObjectStore, log: IDBObjectStore) => Promise<Answer> | Answer) =>
    within(mode, async (workspaces, log) => {
      const workspace = (await got(workspaces.get(id))) as Kept | undefined
      return workspace ? work(workspace, workspaces, log) : NOT_THERE
    })

  const list = () =>
    within('readonly', async (workspaces) => {
      const all = (await got(workspaces.getAll())) as Kept[]
      return { status: 200, data: all.sort((a, b) => a.made - b.made).map(view) }
    })

  const create = (body: unknown) =>
    within('readwrite', async (workspaces) => {
      const name = nameOf(body)
      if (name === undefined) return NO_NAME
      const all = (await got(workspaces.getAll())) as Kept[]
      const made: Kept = { id: crypto.randomUUID(), name, head: 0, made: Math.max(0, ...all.map((known) => known.made)) + 1 }
      workspaces.add(made)
      return { status: 201, data: view(made) }
    })

  const rename = (id: string, body: unknown) =>
    withWorkspace('readwrite', id, (workspace, workspaces) => {
      const name = nameOf(body)
      if (name === undefined) return NO_NAME
      workspaces.put({ ...workspace, name })
      return { status: 200, data: view({ ...workspace, name }) }
    })

  const remove = (id: string) =>
    withWorkspace('readwrite', id, (_, workspaces, log) => {
      workspaces.delete(id)
      log.delete(entriesAfter(id, 0))
      return { status: 204, data: undefined }
    })

  const read = (id: string, after: number) =>
    withWorkspace('readonly', id, async (workspace, _, log) => {
      const entries = (await got(log.getAll(entriesAfter(id, after)))) as { seq: number; entry: unknown }[]
      return { status: 200, data: { head: workspace.head, entries: entries.map(({ seq, entry }) => ({ seq, entry })) } }
    })

  async function append(id: string, body: unknown): Promise<Answer> {
    const { after, entries } = body as { after: number; entries: unknown[] }
    const answer = await withWorkspace('readwrite', id, (workspace, workspaces, log) => {
      // The sender reads what it missed and decides what to do with its own.
      if (workspace.head !== after) return { status: 409, data: { error: 'The log has entries you have not seen.', head: workspace.head } }
      entries.forEach((entry, i) => log.add({ workspace: id, seq: after + i + 1, entry }))
      const head = after + entries.length
      workspaces.put({ ...workspace, head })
      return { status: 200, data: { head } }
    })
    if (answer.status === 200 && !kept) {
      kept = true
      keep()
    }
    return answer
  }

  /** Every entry goes and one in their place says so. The numbers go on: nobody appends after an entry that is gone. */
  const clear = (id: string) =>
    withWorkspace('readwrite', id, (workspace, workspaces, log) => {
      const head = workspace.head + 1
      log.delete(entriesAfter(id, 0))
      log.add({ workspace: id, seq: head, entry: { type: 'cleared' } })
      workspaces.put({ ...workspace, head })
      return { status: 200, data: { head } }
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
    // Sign-in, users, members: what only a server has.
    return { status: 404, data: { error: 'This app runs without a server: there is nothing here.' } }
  }
}
