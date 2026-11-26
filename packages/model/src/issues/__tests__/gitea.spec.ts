import { describe, it, expect } from 'vitest'
import { CONTRACT_ITEMS, runIssueProviderContract } from '../contract'
import { GiteaProvider } from '../gitea'
import { AuthError, RateLimited } from '../provider'
import { createFixtureFetch } from '../testing/fixture-fetch'
import type { FixtureInteraction } from '../testing/fixture-fetch'
import gogsIssue from '../fixtures/gitea/gogs-issue.json'
import issueClosed from '../fixtures/gitea/issue-closed.json'
import issueMissing from '../fixtures/gitea/issue-missing.json'
import issueOpen from '../fixtures/gitea/issue-open.json'
import issuePull from '../fixtures/gitea/issue-pull.json'
import listAllWithPull from '../fixtures/gitea/list-all-with-pull.json'
import listClosed from '../fixtures/gitea/list-closed.json'
import listLabels from '../fixtures/gitea/list-labels.json'
import listOpen from '../fixtures/gitea/list-open.json'
import listPaginated from '../fixtures/gitea/list-paginated.json'
import unauthorized from '../fixtures/gitea/unauthorized.json'

const baseUrl = 'https://git.example.org'
const project = { provider: 'gitea', baseUrl, project: 'acme/app' } as const

function provider(fetch: typeof globalThis.fetch, token?: string) {
  return new GiteaProvider({ baseUrl, fetch, getToken: async () => token })
}

runIssueProviderContract('gitea', ({ items, auth }) => {
  // The fixtures were recorded for this seed; a changed seed must fail until they are re-recorded.
  expect(items).toEqual(CONTRACT_ITEMS)
  const fetch =
    auth === 'valid'
      ? createFixtureFetch(
          issueOpen,
          issueClosed,
          issuePull,
          issueMissing,
          listOpen,
          listClosed,
          listAllWithPull,
          listLabels,
        )
      : createFixtureFetch(unauthorized)
  return {
    project,
    provider: provider(fetch, auth === 'valid' ? 'valid-token' : 'expired-token'),
  }
})

describe('GiteaProvider', () => {
  it('gitea follows Link pagination', async () => {
    const fetch = createFixtureFetch(listPaginated)
    const issues = await provider(fetch, 'valid-token').listIssues(project)
    expect(issues.map((issue) => issue.ref.number)).toEqual([1, 3, 5])
    expect(fetch.requests.length).toBe(2)
  })

  it('gitea sends token auth header', async () => {
    const withToken = createFixtureFetch(issueOpen)
    await provider(withToken, 'abc123').getIssue({ ...project, number: 1 })
    expect(withToken.requests[0].headers.get('authorization')).toBe('token abc123')

    const anonymous = createFixtureFetch(issueOpen)
    await provider(anonymous, undefined).getIssue({ ...project, number: 1 })
    expect(anonymous.requests[0].headers.get('authorization')).toBeNull()
  })

  it('gitea maps Gogs issue payload', async () => {
    const issue = await provider(createFixtureFetch(gogsIssue), 'valid-token').getIssue({ ...project, number: 6 })
    expect(issue).toEqual({
      ref: { ...project, number: 6 },
      title: 'Import from Gogs',
      body: 'Created on a Gogs server.',
      state: 'open',
      labels: [
        { name: 'help wanted', color: '0e8a16' },
        { name: 'question', color: 'fbca04' },
      ],
      assignees: ['bob'],
      milestone: 'v2',
      url: 'https://git.example.org/acme/app/issues/6',
      updatedAt: '2026-02-01T09:00:00.000Z',
      extras: {
        id: 206,
        user: { id: 11, login: 'bob', username: 'bob' },
        comments: 3,
        created_at: '2026-01-31T10:00:00+01:00',
      },
    })
    expect(issue.extras).not.toHaveProperty('assignee')
  })

  it('gitea maps a closed issue', async () => {
    const issue = await provider(createFixtureFetch(issueClosed), 'valid-token').getIssue({
      ...project,
      number: 2,
    })
    expect(issue.state).toBe('closed')
    expect(issue.assignees).toEqual([])
    expect(issue.milestone).toBeUndefined()
    expect(issue.extras).toHaveProperty('closed_at', '2026-01-03T00:00:00Z')
  })

  it('gitea drops pull requests from a list', async () => {
    const issues = await provider(createFixtureFetch(listAllWithPull), 'valid-token').listIssues(project, {
      state: 'all',
    })
    expect(issues.map((issue) => issue.ref.number)).toEqual([1, 2, 3, 5])
  })

  it('gitea maps 403 to AuthError and 429 to RateLimited', async () => {
    const url = `${baseUrl}/api/v1/repos/acme/app/issues/1`
    const forbidden: FixtureInteraction[] = [
      { request: { method: 'GET', url }, response: { status: 403, body: { message: 'forbidden' } } },
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
    expect(authError).toMatchObject({ status: 403, message: 'forbidden' })

    const rateLimited = await provider(createFixtureFetch(limited), 'valid-token')
      .getIssue({ ...project, number: 1 })
      .catch((error: unknown) => error)
    expect(rateLimited).toBeInstanceOf(RateLimited)
    expect(rateLimited).toMatchObject({ retryAfter: 30 })
  })
})
