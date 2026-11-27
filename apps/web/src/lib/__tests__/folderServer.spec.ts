import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect } from 'vitest'
import { readWorkspaceFile } from '@drillgram/model'
import { folderServer, localLocks } from '../folderServer'
import type { FolderHandle } from '../folderServer'

// The folder stands in for the server as the browser's database does (browserServer.spec.ts),
// and its files are the truth: what another program writes there is what is answered.

type Kept = { id: string; name: string; role: string; head: number }
type Log = { head: number; entries: { seq: number; entry: unknown }[] }

/** A folder in memory, as the browser hands one out. */
function folder(name = 'diagrams') {
  const files = new Map<string, string>()
  /** Reads that find the file being written anew by another program. */
  const busy = { reads: 0 }
  const handle: FolderHandle = {
    name,
    async *keys() {
      yield* [...files.keys()]
    },
    async getFileHandle(file, options) {
      if (file.includes('/')) throw new TypeError('Name is not allowed.')
      if (!files.has(file)) {
        if (!options?.create) throw new DOMException('A requested file or directory could not be found.', 'NotFoundError')
        files.set(file, '')
      }
      return {
        getFile: async () => ({
          async text() {
            if (busy.reads > 0 && busy.reads--) throw new DOMException('The requested file could not be read.', 'NotReadableError')
            return files.get(file) ?? ''
          },
        }),
        async createWritable() {
          let text = ''
          return {
            write: async (data: string) => void (text += data),
            close: async () => void files.set(file, text),
          }
        },
      }
    },
    async removeEntry(file) {
      if (!files.delete(file)) throw new DOMException('A requested file or directory could not be found.', 'NotFoundError')
    },
  }
  return { handle, files, busy }
}

/** A folder, a browser with it, and a tab of that browser. */
function setUp() {
  const { handle, files, busy } = folder()
  const storage = new IDBFactory()
  // The tabs of a browser share its locks (navigator.locks).
  const locks = localLocks()
  const tab = () => folderServer(handle, storage, locks)
  return { files, busy, tab, ask: tab() }
}

const change = (name: string) => ({ id: name, type: 'change', at: '2026-01-01T09:00:00.000Z', event: { type: 'objectAdded', name } })

const fileOf = (name: string, entries: unknown[]) => JSON.stringify({ format: 'drillgram-workspace', version: 1, name, entries })

async function workspaces(ask: ReturnType<typeof folderServer>): Promise<Kept[]> {
  const answer = await ask('GET', '/workspaces')
  expect(answer.status).toBe(200)
  return answer.data as Kept[]
}

describe('folderServer', () => {
  it('has somebody signed in, who is no admin', async () => {
    const { ask } = setUp()
    expect(((await ask('GET', '/session')).data as { user: { role: string } }).user.role).toBe('user')
  })

  it('makes a workspace a file named after it, and lists the files by name', async () => {
    const { ask, files } = setUp()
    expect(await workspaces(ask)).toEqual([])
    const made = await ask('POST', '/workspaces', { name: ' My workspace ' })
    expect(made).toEqual({ status: 201, data: { id: 'my-workspace', name: 'My workspace', role: 'owner', head: 0 } })
    expect(readWorkspaceFile(files.get('my-workspace.drillgram.json')!)).toEqual({ name: 'My workspace', entries: [] })

    // A name taken: the next file.
    expect(((await ask('POST', '/workspaces', { name: 'My Workspace' })).data as Kept).id).toBe('my-workspace-2')
    files.set('billing.drillgram.json', fileOf('Billing', [change('Invoices')]))
    files.set('notes.txt', 'not a workspace')
    files.set('broken.drillgram.json', '{')
    expect((await workspaces(ask)).map(({ id, name, head }) => [id, name, head])).toEqual([
      ['billing', 'Billing', 1],
      ['my-workspace', 'My workspace', 0],
      ['my-workspace-2', 'My Workspace', 0],
    ])
  })

  it('refuses a workspace without a name, in the server\'s words', async () => {
    const { ask } = setUp()
    expect(await ask('POST', '/workspaces', { name: '  ' })).toEqual({ status: 400, data: { error: 'A workspace has a name of 1 to 200 characters.' } })
  })

  it('renames a workspace in its file, and the file keeps its name and its log', async () => {
    const { ask, files } = setUp()
    await ask('POST', '/workspaces', { name: 'Shop' })
    await ask('POST', '/workspaces/shop/log', { after: 0, entries: [change('Customer')] })
    expect(await ask('PATCH', '/workspaces/shop', { name: 'Bookshop' })).toEqual({ status: 200, data: { id: 'shop', name: 'Bookshop', role: 'owner', head: 1 } })
    expect(readWorkspaceFile(files.get('shop.drillgram.json')!)).toEqual({ name: 'Bookshop', entries: [change('Customer')] })
  })

  it('deletes a workspace with its file', async () => {
    const { ask, files } = setUp()
    await ask('POST', '/workspaces', { name: 'Shop' })
    expect(await ask('DELETE', '/workspaces/shop')).toEqual({ status: 204, data: undefined })
    expect([...files.keys()]).toEqual([])
    expect((await ask('GET', '/workspaces/shop/log?after=0')).status).toBe(404)
  })

  it('says that a workspace without a file is not there', async () => {
    const { ask } = setUp()
    for (const [method, at, body] of [
      ['PATCH', '/workspaces/none', { name: 'Other' }],
      ['DELETE', '/workspaces/none', undefined],
      ['GET', '/workspaces/none/log?after=0', undefined],
      ['POST', '/workspaces/none/log', { after: 0, entries: [change('Shop')] }],
      ['DELETE', '/workspaces/none/log', undefined],
      ['GET', '/workspaces/a%2Fb/log?after=0', undefined],
    ] as const) {
      expect((await ask(method, at, body)).status, `${method} ${at}`).toBe(404)
    }
  })

  it('appends to the file and reads the log in order', async () => {
    const { ask, tab, files } = setUp()
    await ask('POST', '/workspaces', { name: 'Shop' })
    const path = '/workspaces/shop/log'
    const back = { id: 'b', type: 'wentTo', position: 0 }
    expect(await ask('POST', path, { after: 0, entries: [change('Customer'), back] })).toEqual({ status: 200, data: { head: 2 } })
    expect(await ask('POST', path, { after: 2, entries: [change('Shop')] })).toEqual({ status: 200, data: { head: 3 } })

    expect((await tab()('GET', `${path}?after=0`)).data).toEqual({
      head: 3,
      entries: [
        { seq: 1, entry: change('Customer') },
        { seq: 2, entry: back },
        { seq: 3, entry: change('Shop') },
      ],
    })
    expect(((await ask('GET', `${path}?after=2`)).data as Log).entries).toEqual([{ seq: 3, entry: change('Shop') }])
    expect(readWorkspaceFile(files.get('shop.drillgram.json')!).entries).toHaveLength(3)
  })

  it('refuses an append that missed entries, also those written from outside', async () => {
    const { ask, files } = setUp()
    await ask('POST', '/workspaces', { name: 'Shop' })
    const path = '/workspaces/shop/log'
    await ask('POST', path, { after: 0, entries: [change('Customer')] })
    files.set('shop.drillgram.json', fileOf('Shop', [change('Customer'), change('Mail')]))

    expect(await ask('POST', path, { after: 1, entries: [change('Bank')] })).toEqual({ status: 409, data: { error: 'The log has entries you have not seen.', head: 2 } })
    expect((await ask('GET', `${path}?after=1`)).data).toEqual({ head: 2, entries: [{ seq: 2, entry: change('Mail') }] })
  })

  it('writes one of two appends that come at the same time from two tabs', async () => {
    const { ask, tab } = setUp()
    await ask('POST', '/workspaces', { name: 'Shop' })
    const path = '/workspaces/shop/log'
    const answers = await Promise.all([ask('POST', path, { after: 0, entries: [change('Shop')] }), tab()('POST', path, { after: 0, entries: [change('Bank')] })])
    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409])
    expect(((await ask('GET', `${path}?after=0`)).data as Log).head).toBe(1)
  })

  it('takes a file written anew from outside as a log that starts again, and the count goes on', async () => {
    const { ask, tab, files } = setUp()
    await ask('POST', '/workspaces', { name: 'Shop' })
    const path = '/workspaces/shop/log'
    await ask('POST', path, { after: 0, entries: [change('Customer'), change('Shop'), change('Mail')] })

    // Shorter: an older version of the file came back (git checkout).
    files.set('shop.drillgram.json', fileOf('Shop', [change('Customer')]))
    expect((await ask('GET', `${path}?after=3`)).data).toEqual({
      head: 5,
      entries: [
        { seq: 4, entry: { type: 'cleared' } },
        { seq: 5, entry: change('Customer') },
      ],
    })
    // Another tab of the same browser counts the same.
    expect(((await tab()('GET', `${path}?after=0`)).data as Log).entries.map((kept) => kept.seq)).toEqual([4, 5])
    expect(await ask('POST', path, { after: 3, entries: [change('Bank')] })).toMatchObject({ status: 409, data: { head: 5 } })
    expect(await ask('POST', path, { after: 5, entries: [change('Bank')] })).toEqual({ status: 200, data: { head: 6 } })
    expect(readWorkspaceFile(files.get('shop.drillgram.json')!).entries).toEqual([change('Customer'), change('Bank')])

    // Other changes in the place of the old ones, more of them.
    files.set('shop.drillgram.json', fileOf('Shop', [change('Other'), change('More'), change('Most')]))
    expect(((await ask('GET', `${path}?after=6`)).data as Log).entries).toEqual([
      { seq: 7, entry: { type: 'cleared' } },
      { seq: 8, entry: change('Other') },
      { seq: 9, entry: change('More') },
      { seq: 10, entry: change('Most') },
    ])
  })

  it('clears a log: the file has no entries, and the count goes on', async () => {
    const { ask, files } = setUp()
    await ask('POST', '/workspaces', { name: 'Shop' })
    const path = '/workspaces/shop/log'
    await ask('POST', path, { after: 0, entries: [change('Customer'), change('Shop')] })

    expect(await ask('DELETE', path)).toEqual({ status: 200, data: { head: 3 } })
    expect((await ask('GET', `${path}?after=0`)).data).toEqual({ head: 3, entries: [{ seq: 3, entry: { type: 'cleared' } }] })
    expect(readWorkspaceFile(files.get('shop.drillgram.json')!).entries).toEqual([])
    expect((await ask('POST', path, { after: 3, entries: [change('Mail')] })).data).toEqual({ head: 4 })
  })

  it('reads a file again that another program was writing at that moment', async () => {
    const { ask, files, busy } = setUp()
    files.set('shop.drillgram.json', fileOf('Shop', [change('Customer')]))
    busy.reads = 2
    expect(((await ask('GET', '/workspaces/shop/log?after=0')).data as Log).head).toBe(1)
  })

  it('answers for a file that is no workspace in words', async () => {
    const { ask, files } = setUp()
    files.set('broken.drillgram.json', '{')
    expect(await ask('GET', '/workspaces/broken/log?after=0')).toEqual({ status: 422, data: { error: 'This file is not a workspace of Drillgram: it cannot be read.' } })
  })
})
