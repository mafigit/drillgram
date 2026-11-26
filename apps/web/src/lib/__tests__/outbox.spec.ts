import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { LogEntry } from '@drillgram/model'
import { outboxKey, storedOutbox } from '../outbox'

const entry: LogEntry = { id: 'e1', type: 'wentTo', position: 1 }

describe('storedOutbox', () => {
  beforeEach(() => window.localStorage.clear())

  it('keeps what waits where a reload finds it, each workspace its own', () => {
    storedOutbox('one').save(3, [entry])
    expect(storedOutbox('one').load()).toEqual({ after: 3, entries: [entry] })
    expect(storedOutbox('two').load()).toBeUndefined()
  })

  it('keeps nothing once nothing waits', () => {
    const outbox = storedOutbox('one')
    outbox.save(3, [entry])
    outbox.save(4, [])
    expect(outbox.load()).toBeUndefined()
    expect(window.localStorage.getItem(outboxKey('one'))).toBeNull()
  })

  it('takes what it did not write for nothing', () => {
    for (const kept of ['not JSON', '{"after":"3","entries":[]}', '{"after":3}', 'null']) {
      window.localStorage.setItem(outboxKey('one'), kept)
      expect(storedOutbox('one').load(), kept).toBeUndefined()
    }
  })

  it('goes on when the storage is full', () => {
    const full = { ...window.localStorage, getItem: () => null, removeItem: () => {}, setItem: vi.fn(() => { throw new DOMException('full', 'QuotaExceededError') }) } as unknown as Storage
    expect(() => storedOutbox('one', full).save(1, [entry])).not.toThrow()
    expect(full.setItem).toHaveBeenCalled()
  })
})
