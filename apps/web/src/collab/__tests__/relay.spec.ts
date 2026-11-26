import { afterEach, describe, expect, it, vi } from 'vitest'
import { importKey, newKey, relayLink, sparing } from '../relay'
import type { Link } from '../session'

/** Two ends that pass each other what the server would pass on; `wire` is what the server sees. */
async function pair(keys?: [string, string]) {
  const [a, b] = keys ?? (() => { const key = newKey(); return [key, key] as [string, string] })()
  const wire: string[] = []
  const got: { one: unknown[]; two: unknown[] } = { one: [], two: [] }
  const two = relayLink({ key: await importKey(b), send: (data) => (wire.push(data), one.received(data)) })
  const one = relayLink({ key: await importKey(a), send: (data) => (wire.push(data), two.received(data)) })
  one.link.onMessage = (message) => got.one.push(message)
  two.link.onMessage = (message) => got.two.push(message)
  const settled = async () => {
    await one.flushed()
    await two.flushed()
    await new Promise((resolve) => setTimeout(resolve, 5))
    await one.flushed()
    await two.flushed()
  }
  return { one, two, wire, got, settled }
}

describe('a connection through the server', () => {
  afterEach(() => vi.useRealTimers())

  it('has a key of its own for every session, short enough for a link', () => {
    expect(newKey()).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(newKey()).not.toBe(newKey())
  })

  it('carries messages there and back, and shows the server nothing of them', async () => {
    const { one, two, wire, got, settled } = await pair()
    one.link.send({ t: 'hello', name: 'Ben Unmistakable' })
    two.link.send({ t: 'welcome', workspace: 'Bookshop Unmistakable' })
    await settled()
    expect(got.two).toEqual([{ t: 'hello', name: 'Ben Unmistakable' }])
    expect(got.one).toEqual([{ t: 'welcome', workspace: 'Bookshop Unmistakable' }])
    expect(wire).toHaveLength(2)
    for (const seen of wire) {
      expect(seen).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(seen).not.toContain('Unmistakable')
      expect(atob(seen.replaceAll('-', '+').replaceAll('_', '/'))).not.toContain('Unmistakable')
    }
  })

  it('never says the same thing twice in the same way', async () => {
    const { one, wire, settled } = await pair()
    one.link.send({ t: 'pointer' })
    one.link.send({ t: 'pointer' })
    await settled()
    expect(wire[0]).not.toBe(wire[1])
  })

  it('keeps the order of what is said, and takes a message of megabytes in pieces the server passes', async () => {
    const { one, wire, got, settled } = await pair()
    const large = { t: 'answer', data: 'ä'.repeat(40_000) }
    one.link.send({ n: 1 })
    one.link.send(large)
    one.link.send({ n: 3 })
    await settled()
    expect(got.two).toEqual([{ n: 1 }, large, { n: 3 }])
    expect(wire.length).toBeGreaterThan(5)
    for (const seen of wire) expect(seen.length).toBeLessThan(30_000)
  })

  it('understands nothing from who has another key', async () => {
    const { one, got, settled } = await pair([newKey(), newKey()])
    one.link.send({ t: 'hello', name: 'Mallory' })
    await settled()
    expect(got.two).toEqual([])
  })

  it('ends for the other side when the server says that it is gone, and says no more', async () => {
    const { one, two, wire, settled } = await pair()
    let over = 0
    two.link.onClose = () => over++
    two.closed()
    two.closed()
    expect(over).toBe(1)
    two.link.send({ t: 'late' })
    await settled()
    expect(wire).toEqual([])
    // Who closes it themselves is not told that it closed.
    let told = 0
    one.link.onClose = () => told++
    one.link.close()
    expect(told).toBe(0)
  })

  it('sends what was said before it was closed', async () => {
    const { one, got } = await pair()
    one.link.send({ t: 'bye' })
    one.link.close()
    await one.flushed()
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(got.two).toEqual([{ t: 'bye' }])
  })
})

describe('sparing a connection that is counted', () => {
  afterEach(() => vi.useRealTimers())

  function spared() {
    const sent: unknown[] = []
    const inner: Link = { send: (message) => sent.push(message), close: () => {} }
    return { link: sparing(inner, 200), inner, sent }
  }

  it('says where a pointer is a few times a second, and always where it came to rest', () => {
    vi.useFakeTimers()
    const { link, sent } = spared()
    for (let x = 1; x <= 9; x++) {
      link.send({ t: 'pointer', at: { view: 'v', x, y: 0 } })
      vi.advanceTimersByTime(20)
    }
    // The first at once, the rest together: the last place, not every one on the way.
    expect(sent).toEqual([{ t: 'pointer', at: { view: 'v', x: 1, y: 0 } }])
    vi.advanceTimersByTime(200)
    expect(sent).toEqual([{ t: 'pointer', at: { view: 'v', x: 1, y: 0 } }, { t: 'pointer', at: { view: 'v', x: 9, y: 0 } }])
  })

  it('keeps apart the pointers of different people, and holds nothing else back', () => {
    vi.useFakeTimers()
    const { link, sent } = spared()
    link.send({ t: 'pointer', from: 'a', at: { view: 'v', x: 1, y: 0 } })
    link.send({ t: 'pointer', from: 'b', at: { view: 'v', x: 2, y: 0 } })
    link.send({ t: 'moved', head: 3 })
    link.send({ t: 'moved', head: 4 })
    expect(sent).toHaveLength(4)
  })

  it('passes on what arrives and that it ended, as the connection under it', () => {
    const { link, inner } = spared()
    const got: unknown[] = []
    let over = 0
    link.onMessage = (message) => got.push(message)
    link.onClose = () => over++
    inner.onMessage?.({ t: 'hello' })
    inner.onClose?.()
    expect(got).toEqual([{ t: 'hello' }])
    expect(over).toBe(1)
  })
})
