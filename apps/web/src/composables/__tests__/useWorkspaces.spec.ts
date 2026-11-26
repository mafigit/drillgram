import { describe, expect, it } from 'vitest'
import { ROOT_VIEW_ID } from '@drillgram/model'
import type { LogEntry } from '@drillgram/model'
import { batches } from '../useWorkspaces'

const entry = (id: number, name = 'Shop'): LogEntry => ({
  id: String(id),
  type: 'change',
  at: '2026-01-01T09:00:00.000Z',
  event: { type: 'objectAdded', view: ROOT_VIEW_ID, kind: 'softwareSystem', name },
})

describe('batches', () => {
  it('sends a log of a file in pieces of at most 500 entries, in their order', () => {
    const entries = Array.from({ length: 1201 }, (_, i) => entry(i))
    const made = batches(entries)
    expect(made.map((batch) => batch.length)).toEqual([500, 500, 201])
    expect(made.flat()).toEqual(entries)
  })

  it('sends large entries in pieces a request can carry', () => {
    // Three entries of 600,000 characters each: no two of them in one request.
    const entries = [1, 2, 3].map((id) => entry(id, 'x'.repeat(600_000)))
    expect(batches(entries).map((batch) => batch.length)).toEqual([1, 1, 1])
    // One entry larger than a request should be still goes, alone.
    expect(batches([entry(1, 'x'.repeat(3_000_000)), entry(2)]).map((batch) => batch.length)).toEqual([1, 1])
  })

  it('sends nothing for an empty workspace', () => {
    expect(batches([])).toEqual([])
  })
})
