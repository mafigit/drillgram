import type { SeedItem } from './contract'
import type { Issue, IssueRef, ProjectRef } from './model'
import { AuthError, IssueNotFound } from './provider'
import type { IssueProvider, ListIssuesOptions } from './provider'

export interface FakeIssueProviderOptions {
  project: ProjectRef
  items: SeedItem[]
  auth?: 'valid' | 'invalid'
}

/** An in-memory `IssueProvider` seeded with fixed items. */
export class FakeIssueProvider implements IssueProvider {
  private readonly project: ProjectRef
  private readonly items: SeedItem[]
  private readonly auth: 'valid' | 'invalid'

  constructor(options: FakeIssueProviderOptions) {
    this.project = { ...options.project }
    this.items = structuredClone(options.items)
    this.auth = options.auth ?? 'valid'
  }

  async getIssue(ref: IssueRef): Promise<Issue> {
    this.checkAuth()
    const item = this.isOwnProject(ref)
      ? this.items.find((candidate) => candidate.kind === 'issue' && candidate.number === ref.number)
      : undefined
    if (!item) throw new IssueNotFound(ref)
    return this.toIssue(item)
  }

  async listIssues(project: ProjectRef, options: ListIssuesOptions = {}): Promise<Issue[]> {
    this.checkAuth()
    if (!this.isOwnProject(project)) return []
    const state = options.state ?? 'open'
    const labels = options.labels ?? []
    return this.items
      .filter((item) => item.kind === 'issue')
      .filter((item) => state === 'all' || item.state === state)
      .filter((item) => labels.every((name) => item.labels.some((label) => label.name === name)))
      .map((item) => this.toIssue(item))
  }

  private checkAuth(): void {
    if (this.auth === 'invalid') throw new AuthError()
  }

  private isOwnProject(project: ProjectRef): boolean {
    return (
      project.provider === this.project.provider &&
      project.baseUrl === this.project.baseUrl &&
      project.project === this.project.project
    )
  }

  private toIssue(item: SeedItem): Issue {
    const { kind: _kind, number, milestone, ...fields } = structuredClone(item)
    const { baseUrl, project } = this.project
    return {
      ...fields,
      ...(milestone === undefined ? {} : { milestone }),
      ref: { ...this.project, number },
      url: `${baseUrl}/${project}/issues/${number}`,
      extras: {},
    }
  }
}
