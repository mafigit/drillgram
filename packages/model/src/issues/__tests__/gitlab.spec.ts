import { describe, it, expect } from 'vitest'
import { CONTRACT_ITEMS, runIssueProviderContract } from '../contract'
import { GitLabProvider } from '../gitlab'
import { AuthError, ProviderError, RateLimited } from '../provider'
import { createFixtureFetch } from '../testing/fixture-fetch'
import type { FixtureInteraction } from '../testing/fixture-fetch'
import issueClosed from '../fixtures/gitlab/issue-closed.json'
import issueNestedGroup from '../fixtures/gitlab/issue-nested-group.json'
import issueOpen from '../fixtures/gitlab/issue-open.json'
import listAll from '../fixtures/gitlab/list-all.json'
import listClosed from '../fixtures/gitlab/list-closed.json'
import listLabels from '../fixtures/gitlab/list-labels.json'
import listOpen from '../fixtures/gitlab/list-open.json'
import listPaginated from '../fixtures/gitlab/list-paginated.json'
import notFound from '../fixtures/gitlab/not-found.json'
import unauthorized from '../fixtures/gitlab/unauthorized.json'

const baseUrl = 'https://gitlab.com'
const project = { provider: 'gitlab', baseUrl, project: 'acme/app' } as const

function provider(fetch: typeof globalThis.fetch, token?: string) {
  return new GitLabProvider({ baseUrl, fetch, getToken: async () => token })
}

runIssueProviderContract(
  'gitlab',
  ({ items, auth }) => {
    // The fixtures were recorded for this seed; a changed seed must fail until they are re-recorded.
    expect(items).toEqual(CONTRACT_ITEMS)
    const fetch =
      auth === 'valid'
        ? createFixtureFetch(
            issueOpen,
            issueClosed,
            notFound,
            listOpen,
            listClosed,
            listAll,
            listLabels,
          )
        : createFixtureFetch(unauthorized)
    return {
      project,
      provider: provider(fetch, auth === 'valid' ? 'valid-token' : 'expired-token'),
    }
  },
  { labelColors: false },
)

describe('GitLabProvider', () => {
  it('gitlab encodes nested group project path', async () => {
    const fetch = createFixtureFetch(issueNestedGroup)
    const nested = { ...project, project: 'acme/platform/app' }
    const issue = await provider(fetch, 'valid-token').getIssue({ ...nested, number: 7 })
    expect(fetch.requests[0].url).toBe(
      'https://gitlab.com/api/v4/projects/acme%2Fplatform%2Fapp/issues/7',
    )
    expect(issue.ref.project).toBe('acme/platform/app')
    expect(issue.url).toBe('https://gitlab.com/acme/platform/app/-/issues/7')
  })

  it('gitlab maps opened state to open', async () => {
    const fetch = createFixtureFetch(issueOpen, issueClosed)
    const open = await provider(fetch, 'valid-token').getIssue({ ...project, number: 1 })
    expect(open.state).toBe('open')
    expect(open.labels).toEqual([{ name: 'bug' }, { name: 'ui' }])
    expect(open.labels[0]).not.toHaveProperty('color')

    const closed = await provider(fetch, 'valid-token').getIssue({ ...project, number: 2 })
    expect(closed.state).toBe('closed')
    expect(closed.milestone).toBeUndefined()
    expect(closed.assignees).toEqual([])
    expect(closed.extras).toHaveProperty('closed_at')
  })

  it('gitlab sends state=opened for open filter', async () => {
    const open = createFixtureFetch(listOpen)
    await provider(open, 'valid-token').listIssues(project)
    expect(new URL(open.requests[0].url).searchParams.get('state')).toBe('opened')

    const all = createFixtureFetch(listAll)
    await provider(all, 'valid-token').listIssues(project, { state: 'all' })
    expect(new URL(all.requests[0].url).searchParams.has('state')).toBe(false)
  })

  it('gitlab uses gitlab.com by default', async () => {
    const fetch = createFixtureFetch(issueOpen)
    const defaulted = new GitLabProvider({ fetch, getToken: async () => 'valid-token' })
    await defaulted.getIssue({ ...project, number: 1 })
    expect(fetch.requests[0].url.startsWith('https://gitlab.com/api/v4/')).toBe(true)
  })

  it('gitlab sends bearer auth header', async () => {
    const withToken = createFixtureFetch(issueOpen)
    await provider(withToken, 'abc123').getIssue({ ...project, number: 1 })
    expect(withToken.requests[0].headers.get('authorization')).toBe('Bearer abc123')

    const anonymous = createFixtureFetch(issueOpen)
    await provider(anonymous, undefined).getIssue({ ...project, number: 1 })
    expect(anonymous.requests[0].headers.get('authorization')).toBeNull()
  })

  it('gitlab follows x-next-page pagination', async () => {
    const fetch = createFixtureFetch(listPaginated)
    const issues = await provider(fetch, 'valid-token').listIssues(project)
    expect(issues.map((issue) => issue.ref.number)).toEqual([1, 3, 5])
    expect(fetch.requests.length).toBe(2)
  })

  it('gitlab follows Link pagination', async () => {
    const [page1, page2] = listPaginated as FixtureInteraction[]
    const url = 'https://gitlab.com/api/v4/projects/acme%2Fapp/issues'
    const linked: FixtureInteraction[] = [
      {
        request: { method: 'GET', url: `${url}?state=opened` },
        response: {
          status: 200,
          headers: { Link: `<${url}?state=opened&page=2>; rel="next"` },
          body: page1.response.body,
        },
      },
      {
        request: { method: 'GET', url: `${url}?state=opened&page=2` },
        response: { status: 200, body: page2.response.body },
      },
    ]
    const fetch = createFixtureFetch(linked)
    const issues = await provider(fetch, 'valid-token').listIssues(project)
    expect(issues.map((issue) => issue.ref.number)).toEqual([1, 3, 5])
    expect(fetch.requests.length).toBe(2)
  })

  it('gitlab refuses a Link next page on another origin', async () => {
    const [page1] = listPaginated as FixtureInteraction[]
    const url = 'https://gitlab.com/api/v4/projects/acme%2Fapp/issues'
    const linked: FixtureInteraction[] = [
      {
        request: { method: 'GET', url: `${url}?state=opened` },
        response: {
          status: 200,
          headers: { Link: '<https://other.host/steal?page=2>; rel="next"' },
          body: page1.response.body,
        },
      },
    ]
    const fetch = createFixtureFetch(linked)
    const error = await provider(fetch, 'valid-token')
      .listIssues(project)
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ProviderError)
    expect(fetch.requests.map((request) => new URL(request.url).origin)).toEqual([baseUrl])
  })

  it('gitlab maps 403 to AuthError and 429 to RateLimited', async () => {
    const url = `${baseUrl}/api/v4/projects/acme%2Fapp/issues/1`
    const forbidden: FixtureInteraction[] = [
      { request: { method: 'GET', url }, response: { status: 403, body: { message: '403 Forbidden' } } },
    ]
    const limited: FixtureInteraction[] = [
      {
        request: { method: 'GET', url },
        response: { status: 429, headers: { 'Retry-After': '30' }, body: {} },
      },
    ]

    const authError = await provider(createFixtureFetch(forbidden), 'valid-token')
      .getIssue({ ...project, number: 1 })
      .catch((error: unknown) => error)
    expect(authError).toBeInstanceOf(AuthError)
    expect(authError).toMatchObject({ status: 403, message: '403 Forbidden' })

    const rateLimited = await provider(createFixtureFetch(limited), 'valid-token')
      .getIssue({ ...project, number: 1 })
      .catch((error: unknown) => error)
    expect(rateLimited).toBeInstanceOf(RateLimited)
    expect(rateLimited).toMatchObject({ retryAfter: 30 })
  })
})
