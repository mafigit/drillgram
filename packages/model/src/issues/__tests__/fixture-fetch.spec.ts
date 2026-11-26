import { describe, it, expect } from 'vitest'
import { createFixtureFetch } from '../testing/fixture-fetch'
import type { FixtureInteraction } from '../testing/fixture-fetch'

const recorded: FixtureInteraction[] = [
  {
    request: { method: 'GET', url: 'https://git.example.org/api/v1/thing' },
    response: { status: 201, headers: { 'X-Total-Count': '1' }, body: { ok: true } },
  },
]

describe('createFixtureFetch', () => {
  it('fixture fetch serves a recorded response', async () => {
    const fetch = createFixtureFetch(recorded)
    const res = await fetch('https://git.example.org/api/v1/thing')
    expect(res.status).toBe(201)
    expect(res.headers.get('x-total-count')).toBe('1')
    expect(await res.json()).toEqual({ ok: true })
    expect(fetch.requests).toHaveLength(1)
    expect(fetch.requests[0].url).toBe('https://git.example.org/api/v1/thing')
  })

  it('fixture fetch throws on an unrecorded request', async () => {
    const fetch = createFixtureFetch(recorded)
    await expect(fetch('https://git.example.org/api/v1/other')).rejects.toThrow(
      'Unrecorded request',
    )
    await expect(
      fetch('https://git.example.org/api/v1/thing', { method: 'POST', body: '{}' }),
    ).rejects.toThrow('Unrecorded request')
  })
})
