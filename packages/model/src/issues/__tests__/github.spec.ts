import { afterEach, describe, expect, it, vi } from 'vitest'
import { runIssueProviderContract } from '../contract'
import type { ContractSeed } from '../contract'
import { GitHubProvider } from '../github'
import { AuthError, IssueNotFound, RateLimited } from '../provider'
import { fixtureFetch } from '../testing/fixture-fetch'
import type { FixtureHandler, RecordedResponse } from '../testing/fixture-fetch'
import issueOpen from '../fixtures/github/issue-open.json'
import issueClosed from '../fixtures/github/issue-closed.json'
import listMixed from '../fixtures/github/list-mixed.json'
import notFound from '../fixtures/github/not-found-404.json'
import unauthorized from '../fixtures/github/unauthorized-401.json'
import rateLimited from '../fixtures/github/rate-limited-403.json'

const project = { provider: 'github', baseUrl: 'https://github.com', project: 'acme/app' } as const

function githubStub(auth: ContractSeed['auth'] = 'valid'): FixtureHandler {
  return ({ url }) => {
    if (auth === 'invalid') return unauthorized
    const single = url.pathname.match(/^\/repos\/acme\/app\/issues\/(\d+)$/)
    if (single) {
      const n = Number(single[1])
      if (n === 1) return issueOpen
      if (n === 2) return issueClosed
      const item = listMixed.body.find((candidate) => candidate.number === n)
      return item ? { status: 200, body: item } : notFound
    }
    if (url.pathname === '/repos/acme/app/issues') {
      const state = url.searchParams.get('state') ?? 'open'
      const labels = url.searchParams.get('labels')?.split(',') ?? []
      const body = listMixed.body
        .filter((item) => state === 'all' || item.state === state)
        .filter((item) => labels.every((name) => item.labels.some((label) => label.name === name)))
      return { status: 200, body }
    }
    return undefined
  }
}

function makeProvider(
  handler: FixtureHandler,
  overrides: { baseUrl?: string; getToken?: () => Promise<string | undefined> } = {},
) {
  const stub = fixtureFetch(handler)
  const provider = new GitHubProvider({
    baseUrl: overrides.baseUrl ?? project.baseUrl,
    getToken: overrides.getToken ?? (async () => 'test-token'),
    fetch: stub.fetch,
  })
  return { provider, calls: stub.calls }
}

runIssueProviderContract('github', (seed) => ({
  project,
  provider: makeProvider(githubStub(seed.auth)).provider,
}))

describe('GitHubProvider', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('github treats a PR number as IssueNotFound', async () => {
    const { provider } = makeProvider(githubStub())
    await expect(provider.getIssue({ ...project, number: 4 })).rejects.toBeInstanceOf(
      IssueNotFound,
    )
  })

  it('github maps exhausted rate limit to RateLimited', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1767225570_000)
    const { provider } = makeProvider(() => rateLimited)
    const error = await provider.getIssue({ ...project, number: 1 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RateLimited)
    expect((error as RateLimited).retryAfter).toBe(30)
    await expect(provider.listIssues(project)).rejects.toBeInstanceOf(RateLimited)
  })

  it('github maps 429 with retry-after to RateLimited', async () => {
    const response: RecordedResponse = {
      status: 429,
      headers: { 'retry-after': '30' },
      body: { message: 'slow' },
    }
    const { provider } = makeProvider(() => response)
    const error = await provider.getIssue({ ...project, number: 1 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RateLimited)
    expect((error as RateLimited).retryAfter).toBe(30)
  })

  it('github maps a 403 without rate-limit headers to AuthError', async () => {
    const { provider } = makeProvider(() => ({
      status: 403,
      body: { message: 'Resource not accessible' },
    }))
    const error = await provider.getIssue({ ...project, number: 1 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AuthError)
    expect(error).not.toBeInstanceOf(RateLimited)
    expect((error as AuthError).status).toBe(403)
  })

  it('github uses /api/v3 for enterprise baseUrl', async () => {
    const enterprise = makeProvider(() => issueOpen, { baseUrl: 'https://ghe.example.com' })
    await enterprise.provider.getIssue({
      ...project,
      baseUrl: 'https://ghe.example.com',
      number: 1,
    })
    expect(enterprise.calls[0].url.href).toBe(
      'https://ghe.example.com/api/v3/repos/acme/app/issues/1',
    )

    const github = makeProvider(() => issueOpen)
    await github.provider.getIssue({ ...project, number: 1 })
    expect(github.calls[0].url.href.startsWith('https://api.github.com/repos/acme/app/issues/1')).toBe(
      true,
    )
  })

  it('github sends bearer token, accept and api-version headers', async () => {
    const withToken = makeProvider(githubStub())
    await withToken.provider.getIssue({ ...project, number: 1 })
    const headers = withToken.calls[0].headers
    expect(headers.get('authorization')).toBe('Bearer test-token')
    expect(headers.get('accept')).toBe('application/vnd.github+json')
    expect(headers.get('x-github-api-version')).toBe('2022-11-28')

    const anonymous = makeProvider(githubStub(), { getToken: async () => undefined })
    await anonymous.provider.getIssue({ ...project, number: 1 })
    expect(anonymous.calls[0].headers.has('authorization')).toBe(false)
  })

  it('github follows Link rel=next pagination', async () => {
    const byNumber = (n: number) => listMixed.body.find((item) => item.number === n)
    const { provider, calls } = makeProvider(({ url }) => {
      if (url.pathname !== '/repos/acme/app/issues') return undefined
      if (url.searchParams.get('page') === '2') {
        return { status: 200, body: [byNumber(3), byNumber(1)] }
      }
      return {
        status: 200,
        headers: {
          link:
            '<https://api.github.com/repos/acme/app/issues?state=open&page=2>; rel="next", ' +
            '<https://api.github.com/repos/acme/app/issues?state=open&page=3>; rel="last"',
        },
        body: [byNumber(5), byNumber(4)],
      }
    })
    const issues = await provider.listIssues(project)
    expect(issues.map((issue) => issue.ref.number)).toEqual([5, 3, 1])
    expect(calls).toHaveLength(2)
  })

  it('github puts state_reason into extras', async () => {
    const { provider } = makeProvider(githubStub())
    const issue = await provider.getIssue({ ...project, number: 2 })
    expect(issue.extras.state_reason).toBe('completed')
  })
})
