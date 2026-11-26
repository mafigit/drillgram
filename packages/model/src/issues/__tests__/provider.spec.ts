import { describe, it, expect } from 'vitest'
import { AuthError, IssueNotFound, ProviderError, RateLimited } from '../provider'

describe('IssueProvider errors', () => {
  it('every typed error is a ProviderError', () => {
    const ref = { provider: 'gitea', baseUrl: 'https://host', project: 'o/r', number: 1 } as const
    const notFound = new IssueNotFound(ref)
    expect(notFound).toBeInstanceOf(ProviderError)
    expect(notFound.ref).toEqual(ref)
    expect(notFound.status).toBe(404)
    expect(new AuthError()).toBeInstanceOf(ProviderError)
    expect(new AuthError().status).toBe(401)
    expect(new RateLimited('slow down')).toBeInstanceOf(ProviderError)
  })

  it('RateLimited carries an optional retryAfter', () => {
    expect(new RateLimited('slow down', 30).retryAfter).toBe(30)
    expect(new RateLimited('slow down').retryAfter).toBeUndefined()
    expect(new RateLimited('slow down').status).toBe(429)
  })
})
