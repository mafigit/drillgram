import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect } from 'vitest'
import { browserServer } from '../browserServer'

// What the server's own tests say of workspaces and their logs
// (apps/server/internal/api/workspaces_test.go), said of the browser that stands in for it.

type Kept = { id: string; name: string; role: string; head: number }
type Log = { head: number; entries: { seq: number; entry: unknown }[] }

/** A browser that never ran the app, and a tab of it. */
function browser() {
  const storage = new IDBFactory()
  const tab = () => browserServer(storage)
  return { tab, ask: tab(), storage }
}

/** How many log entries the browser keeps, of all workspaces. */
function entriesKept(storage: IDBFactory): Promise<number> {
  return new Promise((resolve, reject) => {
    const opening = storage.open('drillgram')
    opening.onerror = () => reject(opening.error)
    opening.onsuccess = () => {
      const counting = opening.result.transaction('log').objectStore('log').count()
      counting.onsuccess = () => resolve(counting.result)
    }
  })
}

async function workspaces(ask: ReturnType<typeof browserServer>): Promise<Kept[]> {
  const answer = await ask('GET', '/workspaces')
  expect(answer.status).toBe(200)
  return answer.data as Kept[]
}

const change = (name: string) => ({ id: name, type: 'change', at: '2026-01-01T09:00:00.000Z', event: { type: 'objectAdded', name } })

describe('browserServer', () => {
  it('has somebody signed in from the start, who is no admin', async () => {
    const { ask } = browser()
    const { status, data } = await ask('GET', '/session')
    expect(status).toBe(200)
    expect((data as { user: { role: string; disabled: boolean } }).user).toMatchObject({ role: 'user', disabled: false })
  })

  it('starts a new browser with one workspace, which a reload finds again', async () => {
    const { ask, tab } = browser()
    const all = await workspaces(ask)
    expect(all).toEqual([{ id: expect.any(String), name: 'My workspace', role: 'owner', head: 0 }])
    expect(await workspaces(tab())).toEqual(all)
  })

  it('keeps several workspaces, in the order they were made', async () => {
    const { ask, tab } = browser()
    const [first] = await workspaces(ask)
    const made = await ask('POST', '/workspaces', { name: '  Bookshop ' })
    expect(made.status).toBe(201)
    expect(made.data).toEqual({ id: expect.any(String), name: 'Bookshop', role: 'owner', head: 0 })
    await ask('POST', '/workspaces', { name: 'Archive' })
    expect((await workspaces(tab())).map((kept) => kept.name)).toEqual(['My workspace', 'Bookshop', 'Archive'])

    const renamed = await ask('PATCH', `/workspaces/${first!.id}`, { name: 'Shop landscape' })
    expect(renamed).toEqual({ status: 200, data: { ...first, name: 'Shop landscape' } })
    expect((await workspaces(ask)).map((kept) => kept.name)).toEqual(['Shop landscape', 'Bookshop', 'Archive'])
  })

  it('refuses a workspace without a name, or with too long a one, in the server\'s words', async () => {
    const { ask } = browser()
    const [first] = await workspaces(ask)
    for (const name of ['', '   ', 'x'.repeat(201), undefined]) {
      const refusal = { status: 400, data: { error: 'A workspace has a name of 1 to 200 characters.' } }
      expect(await ask('POST', '/workspaces', { name })).toEqual(refusal)
      expect(await ask('PATCH', `/workspaces/${first!.id}`, { name })).toEqual(refusal)
    }
    expect(await workspaces(ask)).toEqual([first])
  })

  it('deletes a workspace with its log, and makes no new one when the last is gone', async () => {
    const { ask, tab, storage } = browser()
    const [first] = await workspaces(ask)
    const path = `/workspaces/${first!.id}`
    await ask('POST', `${path}/log`, { after: 0, entries: [change('Shop')] })
    expect(await entriesKept(storage)).toBe(1)

    expect(await ask('DELETE', path)).toEqual({ status: 204, data: undefined })
    expect(await workspaces(ask)).toEqual([])
    expect(await entriesKept(storage)).toBe(0)
    expect((await ask('GET', `${path}/log?after=0`)).status).toBe(404)
    // Not a new browser any more: it has no workspace until its user makes one.
    expect(await workspaces(tab())).toEqual([])
  })

  it('says that a workspace it does not keep is not there', async () => {
    const { ask } = browser()
    const path = '/workspaces/none-such'
    for (const [method, at, body] of [
      ['PATCH', path, { name: 'Other' }],
      ['DELETE', path, undefined],
      ['GET', `${path}/log?after=0`, undefined],
      ['POST', `${path}/log`, { after: 0, entries: [change('Shop')] }],
      ['DELETE', `${path}/log`, undefined],
    ] as const) {
      expect((await ask(method, at, body)).status, `${method} ${at}`).toBe(404)
    }
    expect((await ask('GET', '/users')).status).toBe(404)
  })

  it('appends to the log of a workspace and reads it in order, as it was sent', async () => {
    const { ask, tab } = browser()
    const [first] = await workspaces(ask)
    const path = `/workspaces/${first!.id}/log`
    expect(await ask('GET', `${path}?after=0`)).toEqual({ status: 200, data: { head: 0, entries: [] } })

    const shop = change('Zoë "Z" <b>')
    const back = { id: 'b', type: 'wentTo', position: 0 }
    const on = { id: 'c', type: 'wentTo', position: 1 }
    expect(await ask('POST', path, { after: 0, entries: [shop, back] })).toEqual({ status: 200, data: { head: 2 } })
    expect(await ask('POST', path, { after: 2, entries: [on] })).toEqual({ status: 200, data: { head: 3 } })

    const log = (await tab()('GET', `${path}?after=0`)).data as Log
    expect(log).toEqual({ head: 3, entries: [{ seq: 1, entry: shop }, { seq: 2, entry: back }, { seq: 3, entry: on }] })
    expect((await ask('GET', `${path}?after=2`)).data).toEqual({ head: 3, entries: [{ seq: 3, entry: on }] })
    expect((await workspaces(ask))[0]!.head).toBe(3)
  })

  it('keeps the logs of two workspaces apart', async () => {
    const { ask } = browser()
    const [first] = await workspaces(ask)
    const second = (await ask('POST', '/workspaces', { name: 'Bookshop' })).data as Kept
    await ask('POST', `/workspaces/${first!.id}/log`, { after: 0, entries: [change('Shop')] })
    await ask('POST', `/workspaces/${second.id}/log`, { after: 0, entries: [change('Reader'), change('Books')] })

    expect(((await ask('GET', `/workspaces/${first!.id}/log?after=0`)).data as Log).entries).toEqual([{ seq: 1, entry: change('Shop') }])
    expect(((await ask('GET', `/workspaces/${second.id}/log?after=1`)).data as Log).entries).toEqual([{ seq: 2, entry: change('Books') }])
  })

  it('refuses an append that missed entries, and says how far the log is', async () => {
    const { ask, tab } = browser()
    const [first] = await workspaces(ask)
    const path = `/workspaces/${first!.id}/log`
    await ask('POST', path, { after: 0, entries: [change('Shop')] })

    // Another tab still thinks the log is empty.
    const stale = await tab()('POST', path, { after: 0, entries: [change('Bank')] })
    expect(stale).toEqual({ status: 409, data: { error: 'The log has entries you have not seen.', head: 1 } })
    expect((await ask('POST', path, { after: 5, entries: [change('Bank')] })).status).toBe(409)
    expect((await ask('GET', `${path}?after=0`)).data).toEqual({ head: 1, entries: [{ seq: 1, entry: change('Shop') }] })
  })

  it('writes one of two appends that come at the same time from two tabs', async () => {
    const { ask, tab } = browser()
    const [first] = await workspaces(ask)
    const path = `/workspaces/${first!.id}/log`
    const answers = await Promise.all([ask('POST', path, { after: 0, entries: [change('Shop')] }), tab()('POST', path, { after: 0, entries: [change('Bank')] })])
    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409])
    expect(((await ask('GET', `${path}?after=0`)).data as Log).head).toBe(1)
  })

  it('clears a log for good: one entry says so, and the count goes on', async () => {
    const { ask } = browser()
    const [first] = await workspaces(ask)
    const path = `/workspaces/${first!.id}/log`
    await ask('POST', path, { after: 0, entries: [change('Shop'), change('Bank')] })

    expect(await ask('DELETE', path)).toEqual({ status: 200, data: { head: 3 } })
    expect((await ask('GET', `${path}?after=0`)).data).toEqual({ head: 3, entries: [{ seq: 3, entry: { type: 'cleared' } }] })
    // A tab that still has the old entries cannot append after them.
    expect((await ask('POST', path, { after: 2, entries: [change('Mail')] })).status).toBe(409)
    expect((await ask('POST', path, { after: 3, entries: [change('Mail')] })).data).toEqual({ head: 4 })
  })

  it('asks the browser to keep its storage once, when there is something to keep', async () => {
    const storage = new IDBFactory()
    let asked = 0
    const ask = browserServer(storage, () => asked++)
    const [first] = await workspaces(ask)
    const path = `/workspaces/${first!.id}/log`
    expect(asked).toBe(0)
    await ask('POST', path, { after: 0, entries: [change('Shop')] })
    await ask('POST', path, { after: 1, entries: [change('Bank')] })
    expect(asked).toBe(1)
  })
})
