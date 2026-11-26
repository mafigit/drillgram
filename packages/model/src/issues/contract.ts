import { describe, it, expect } from 'vitest'
import type { Issue, Label, ProjectRef } from './model'
import { AuthError, IssueNotFound } from './provider'
import type { IssueProvider } from './provider'

export interface SeedItem {
  number: number
  title: string
  body: string
  state: 'open' | 'closed'
  labels: Label[]
  assignees: string[]
  milestone?: string
  updatedAt: string
  kind: 'issue' | 'pull'
}

export interface ContractSeed {
  items: SeedItem[]
  auth: 'valid' | 'invalid'
}

export interface ProviderUnderTest {
  provider: IssueProvider
  project: ProjectRef
}

export const CONTRACT_ITEMS: SeedItem[] = [
  {
    number: 1,
    title: 'Diagram does not render',
    body: 'The canvas stays blank.',
    state: 'open',
    labels: [{ name: 'bug', color: 'd73a4a' }, { name: 'ui' }],
    assignees: ['alice'],
    milestone: 'v1',
    updatedAt: '2026-01-02T03:04:05.000Z',
    kind: 'issue',
  },
  {
    number: 2,
    title: 'Crash on export',
    body: 'Fixed in the last release.',
    state: 'closed',
    labels: [{ name: 'bug' }],
    assignees: [],
    updatedAt: '2026-01-03T00:00:00.000Z',
    kind: 'issue',
  },
  {
    number: 3,
    title: 'Support dark mode',
    body: '',
    state: 'open',
    labels: [{ name: 'enhancement' }],
    assignees: [],
    updatedAt: '2026-01-04T00:00:00.000Z',
    kind: 'issue',
  },
  {
    number: 4,
    title: 'Fix the render bug',
    body: 'Pull request for #1.',
    state: 'open',
    labels: [{ name: 'bug' }],
    assignees: [],
    updatedAt: '2026-01-05T00:00:00.000Z',
    kind: 'pull',
  },
  {
    number: 5,
    title: 'Undo loses connections',
    body: 'Steps to reproduce follow.',
    state: 'open',
    labels: [{ name: 'bug' }],
    assignees: [],
    updatedAt: '2026-01-06T00:00:00.000Z',
    kind: 'issue',
  },
]

function numbers(issues: Issue[]): number[] {
  return issues.map((issue) => issue.ref.number).sort((a, b) => a - b)
}

export function runIssueProviderContract(
  name: string,
  makeProvider: (seed: ContractSeed) => ProviderUnderTest | Promise<ProviderUnderTest>,
  capabilities: { labelColors?: boolean } = {},
): void {
  const { labelColors = true } = capabilities
  describe(`IssueProvider contract: ${name}`, () => {
    const make = (auth: ContractSeed['auth'] = 'valid') =>
      Promise.resolve(makeProvider({ items: structuredClone(CONTRACT_ITEMS), auth }))

    it('getIssue returns the mapped issue', async () => {
      const { provider, project } = await make()
      const seed = CONTRACT_ITEMS[0]
      const issue = await provider.getIssue({ ...project, number: 1 })
      expect(issue.ref).toEqual({ ...project, number: 1 })
      expect(issue.title).toBe(seed.title)
      expect(issue.body).toBe(seed.body)
      expect(issue.state).toBe(seed.state)
      expect(issue.labels).toEqual(
        labelColors ? seed.labels : seed.labels.map(({ name }) => ({ name })),
      )
      expect(issue.assignees).toEqual(seed.assignees)
      expect(issue.milestone).toBe(seed.milestone)
      expect(issue.updatedAt).toBe(seed.updatedAt)
      expect(typeof issue.url).toBe('string')
      expect(issue.url.length).toBeGreaterThan(0)
      expect(issue.extras).toBeTypeOf('object')
      expect(issue.extras).not.toBeNull()
      expect(Array.isArray(issue.extras)).toBe(false)
    })

    it('getIssue throws IssueNotFound for a missing issue', async () => {
      const { provider, project } = await make()
      await expect(provider.getIssue({ ...project, number: 999 })).rejects.toBeInstanceOf(
        IssueNotFound,
      )
    })

    it('getIssue throws IssueNotFound for a pull request', async () => {
      const { provider, project } = await make()
      await expect(provider.getIssue({ ...project, number: 4 })).rejects.toBeInstanceOf(
        IssueNotFound,
      )
    })

    it('listIssues returns open issues by default', async () => {
      const { provider, project } = await make()
      expect(numbers(await provider.listIssues(project))).toEqual([1, 3, 5])
    })

    it('listIssues filters by state', async () => {
      const { provider, project } = await make()
      expect(numbers(await provider.listIssues(project, { state: 'closed' }))).toEqual([2])
      expect(numbers(await provider.listIssues(project, { state: 'all' }))).toEqual([1, 2, 3, 5])
    })

    it('listIssues filters by labels', async () => {
      const { provider, project } = await make()
      expect(
        numbers(await provider.listIssues(project, { state: 'all', labels: ['bug'] })),
      ).toEqual([1, 2, 5])
      expect(numbers(await provider.listIssues(project, { labels: ['bug', 'ui'] }))).toEqual([1])
    })

    it('listIssues never returns pull requests', async () => {
      const { provider, project } = await make()
      const issues = await provider.listIssues(project, { state: 'all' })
      expect(issues.some((issue) => issue.ref.number === 4)).toBe(false)
    })

    it('a 401 throws AuthError', async () => {
      const { provider, project } = await make('invalid')
      await expect(provider.getIssue({ ...project, number: 1 })).rejects.toBeInstanceOf(AuthError)
      await expect(provider.listIssues(project)).rejects.toBeInstanceOf(AuthError)
    })
  })
}
