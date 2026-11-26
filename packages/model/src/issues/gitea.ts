import type { Issue, IssueRef, Label, ProjectRef } from './model'
import { AuthError, IssueNotFound, ProviderError, RateLimited } from './provider'
import type { IssueProvider, ListIssuesOptions, ProviderConfig } from './provider'

interface GiteaUser {
  login?: string | null
  username?: string | null
}

/** A Gitea `/api/v1` issue, also covering the Gogs shape (single `assignee`, no `html_url`). */
interface GiteaIssue {
  number: number
  title: string
  body?: string | null
  state: 'open' | 'closed'
  labels?: { name: string; color?: string | null }[] | null
  assignees?: GiteaUser[] | null
  assignee?: GiteaUser | null
  milestone?: { title?: string | null } | null
  html_url?: string | null
  updated_at: string
  pull_request?: unknown
  [key: string]: unknown
}

const MAPPED_KEYS = new Set([
  'number',
  'title',
  'body',
  'state',
  'labels',
  'assignees',
  'assignee',
  'milestone',
  'html_url',
  'updated_at',
  'pull_request',
])

/** Returns the `rel="next"` target of a `Link` header, if any. */
export function parseLinkNext(header: string | null): string | undefined {
  if (!header) return undefined
  for (const part of header.split(',')) {
    const match = /<([^>]+)>\s*;.*rel="?next"?/.exec(part)
    if (match) return match[1]
  }
  return undefined
}

/** An `IssueProvider` for the Gitea (and Gogs) `/api/v1` REST API. */
export class GiteaProvider implements IssueProvider {
  constructor(private readonly config: ProviderConfig) {}

  async getIssue(ref: IssueRef): Promise<Issue> {
    if (!this.isOwn(ref)) throw new IssueNotFound(ref)
    const url = `${this.repoUrl(ref)}/issues/${ref.number}`
    const { body } = await this.request(url, () => new IssueNotFound(ref))
    const raw = body as GiteaIssue
    if (raw.pull_request != null) throw new IssueNotFound(ref)
    return toIssue(raw, ref)
  }

  async listIssues(project: ProjectRef, options: ListIssuesOptions = {}): Promise<Issue[]> {
    if (!this.isOwn(project)) return []
    const labels = options.labels ?? []
    const query = new URLSearchParams({ state: options.state ?? 'open' })
    if (labels.length > 0) query.set('labels', labels.join(','))
    query.set('type', 'issues')

    const items: GiteaIssue[] = []
    const visited = new Set<string>()
    let next: string | undefined = `${this.repoUrl(project)}/issues?${query}`
    while (next !== undefined && !visited.has(next)) {
      const url: string = next
      visited.add(url)
      const { body, res } = await this.request(url)
      items.push(...(body as GiteaIssue[]))
      const link = parseLinkNext(res.headers.get('Link'))
      next = link === undefined ? undefined : new URL(link, url).toString()
    }

    return items
      .filter((raw) => raw.pull_request == null)
      .filter((raw) =>
        labels.every((name) => (raw.labels ?? []).some((label) => label.name === name)),
      )
      .map((raw) => toIssue(raw, project))
  }

  private isOwn(project: ProjectRef): boolean {
    return project.provider === 'gitea' && project.baseUrl === this.config.baseUrl
  }

  private repoUrl(project: ProjectRef): string {
    const [owner = '', repo = ''] = project.project.split('/')
    return `${this.config.baseUrl}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  }

  private async request(
    url: string,
    onNotFound?: () => Error,
  ): Promise<{ res: Response; body: unknown }> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (token) headers.Authorization = `token ${token}`
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
        : `Gitea ${res.status} for ${url}`
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

function toIssue(raw: GiteaIssue, base: ProjectRef): Issue {
  const labels: Label[] = (raw.labels ?? []).map((label) => {
    const color = (label.color ?? '').replace(/^#/, '')
    return color === '' ? { name: label.name } : { name: label.name, color }
  })
  const login = (user: GiteaUser): string => user.login ?? user.username ?? ''
  const assignees = Array.isArray(raw.assignees)
    ? raw.assignees.map(login)
    : raw.assignee
      ? [login(raw.assignee)]
      : []
  const milestone = raw.milestone?.title ?? undefined
  const extras: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!MAPPED_KEYS.has(key)) extras[key] = value
  }
  return {
    ref: { ...base, number: raw.number },
    title: raw.title,
    body: raw.body ?? '',
    state: raw.state,
    labels,
    assignees,
    ...(milestone === undefined ? {} : { milestone }),
    url: raw.html_url ?? `${base.baseUrl}/${base.project}/issues/${raw.number}`,
    updatedAt: new Date(raw.updated_at).toISOString(),
    extras,
  }
}
