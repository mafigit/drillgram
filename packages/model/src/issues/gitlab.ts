import type { Issue, IssueRef, Label, ProjectRef } from './model'
import { parseLinkNext } from './gitea'
import { AuthError, IssueNotFound, ProviderError, RateLimited } from './provider'
import type { IssueProvider, ListIssuesOptions, ProviderConfig } from './provider'

export const GITLAB_COM = 'https://gitlab.com'

/** A GitLab `/api/v4` project issue. */
interface GitLabIssue {
  iid: number
  title: string
  description?: string | null
  state: 'opened' | 'closed'
  labels?: string[] | null
  assignees?: { username: string }[] | null
  milestone?: { title: string } | null
  web_url?: string | null
  updated_at: string
  [key: string]: unknown
}

const MAPPED_KEYS = new Set([
  'iid',
  'title',
  'description',
  'state',
  'labels',
  'assignees',
  'assignee',
  'milestone',
  'web_url',
  'updated_at',
])

/** An `IssueProvider` for the GitLab `/api/v4` REST API; `IssueRef.number` is the issue `iid`. */
export class GitLabProvider implements IssueProvider {
  private readonly baseUrl: string

  constructor(private readonly config: Omit<ProviderConfig, 'baseUrl'> & { baseUrl?: string }) {
    this.baseUrl = config.baseUrl ?? GITLAB_COM
  }

  async getIssue(ref: IssueRef): Promise<Issue> {
    if (!this.isOwn(ref)) throw new IssueNotFound(ref)
    const url = `${this.projectUrl(ref)}/issues/${ref.number}`
    const { body } = await this.request(url, () => new IssueNotFound(ref))
    return toIssue(body as GitLabIssue, ref)
  }

  async listIssues(project: ProjectRef, options: ListIssuesOptions = {}): Promise<Issue[]> {
    if (!this.isOwn(project)) return []
    const state = options.state ?? 'open'
    const labels = options.labels ?? []
    const query = new URLSearchParams()
    if (state === 'open') query.set('state', 'opened')
    if (state === 'closed') query.set('state', 'closed')
    if (labels.length > 0) query.set('labels', labels.join(','))
    const search = query.toString()

    const items: GitLabIssue[] = []
    const visited = new Set<string>()
    let next: string | undefined = `${this.projectUrl(project)}/issues${search ? `?${search}` : ''}`
    while (next !== undefined && !visited.has(next)) {
      const url: string = next
      visited.add(url)
      const { body, res } = await this.request(url)
      items.push(...(body as GitLabIssue[]))
      const link = parseLinkNext(res.headers.get('Link'))
      const nextPage = res.headers.get('x-next-page')
      if (link !== undefined) {
        const target = new URL(link, url)
        // Every request carries the token, so never follow a next page off the configured host.
        if (target.origin !== new URL(this.baseUrl).origin) {
          throw new ProviderError(`GitLab pagination left ${this.baseUrl} for ${target.origin}`)
        }
        next = target.toString()
      } else if (nextPage) {
        const page = new URL(url)
        page.searchParams.set('page', nextPage)
        next = page.toString()
      } else {
        next = undefined
      }
    }

    return items
      .filter((raw) => labels.every((name) => (raw.labels ?? []).includes(name)))
      .map((raw) => toIssue(raw, project))
  }

  private isOwn(project: ProjectRef): boolean {
    return project.provider === 'gitlab' && project.baseUrl === this.baseUrl
  }

  private projectUrl(project: ProjectRef): string {
    return `${this.baseUrl}/api/v4/projects/${encodeURIComponent(project.project)}`
  }

  private async request(
    url: string,
    onNotFound?: () => Error,
  ): Promise<{ res: Response; body: unknown }> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await this.config.fetch(url, { headers })
    const text = await res.text()
    let body: unknown
    try {
      body = text === '' ? undefined : JSON.parse(text)
    } catch {
      body = undefined
    }
    if (res.ok) return { res, body }

    const message =
      typeof body === 'object' &&
      body !== null &&
      typeof (body as { message?: unknown }).message === 'string'
        ? (body as { message: string }).message
        : `GitLab ${res.status} for ${url}`
    if (res.status === 404 && onNotFound) throw onNotFound()
    if (res.status === 401 || res.status === 403) throw new AuthError(message, res.status)
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After'))
      const hasRetry = res.headers.has('Retry-After') && Number.isInteger(retryAfter)
      throw new RateLimited(message, hasRetry ? retryAfter : undefined)
    }
    throw new ProviderError(message, res.status)
  }
}

function toIssue(raw: GitLabIssue, base: ProjectRef): Issue {
  const labels: Label[] = (raw.labels ?? []).map((name) => ({ name }))
  const assignees = (raw.assignees ?? []).map((assignee) => assignee.username)
  const milestone = raw.milestone?.title ?? undefined
  const extras: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!MAPPED_KEYS.has(key)) extras[key] = value
  }
  return {
    ref: { ...base, number: raw.iid },
    title: raw.title,
    body: raw.description ?? '',
    state: raw.state === 'opened' ? 'open' : 'closed',
    labels,
    assignees,
    ...(milestone === undefined ? {} : { milestone }),
    url: raw.web_url ?? `${base.baseUrl}/${base.project}/-/issues/${raw.iid}`,
    updatedAt: new Date(raw.updated_at).toISOString(),
    extras,
  }
}
