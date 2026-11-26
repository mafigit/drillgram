import type { Issue, IssueRef, ProjectRef } from './model'
import { AuthError, IssueNotFound, ProviderError, RateLimited } from './provider'
import type { IssueProvider, ListIssuesOptions, ProviderConfig } from './provider'

export const GITHUB_API_VERSION = '2022-11-28'

interface GitHubIssue {
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  state_reason?: string | null
  labels: { name: string; color?: string }[]
  assignees: { login: string }[]
  milestone: { title: string } | null
  html_url: string
  updated_at: string
  pull_request?: unknown
}

/** A read-only `IssueProvider` over the GitHub REST v3 API (github.com or GitHub Enterprise Server). */
export class GitHubProvider implements IssueProvider {
  private readonly apiBase: string
  private readonly doFetch: typeof fetch
  private readonly getToken: () => Promise<string | undefined>

  constructor(config: ProviderConfig) {
    const baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.apiBase = baseUrl === 'https://github.com' ? 'https://api.github.com' : `${baseUrl}/api/v3`
    this.doFetch = config.fetch
    this.getToken = config.getToken
  }

  async getIssue(ref: IssueRef): Promise<Issue> {
    const notFound = (): never => {
      throw new IssueNotFound(ref)
    }
    const response = await this.request(`${this.repoUrl(ref)}/issues/${ref.number}`, notFound)
    const raw = (await response.json()) as GitHubIssue
    if (raw.pull_request) notFound()
    const { number: _number, ...project } = ref
    return toIssue(raw, project)
  }

  async listIssues(project: ProjectRef, options: ListIssuesOptions = {}): Promise<Issue[]> {
    const { state = 'open', labels = [] } = options
    const params = new URLSearchParams({ state })
    if (labels.length > 0) params.set('labels', labels.join(','))
    params.set('per_page', '100')

    const items: GitHubIssue[] = []
    let url: string | undefined = `${this.repoUrl(project)}/issues?${params}`
    while (url) {
      const response = await this.request(url)
      items.push(...((await response.json()) as GitHubIssue[]))
      url = parseNextLink(response.headers.get('link'))
    }
    return items.filter((raw) => !raw.pull_request).map((raw) => toIssue(raw, project))
  }

  private repoUrl(project: ProjectRef): string {
    const [owner = '', repo = ''] = project.project.split('/')
    return `${this.apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  }

  private async request(url: string, onNotFound?: () => never): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    }
    const token = await this.getToken()
    if (token) headers.Authorization = `Bearer ${token}`

    const doFetch = this.doFetch
    const response = await doFetch(url, { headers })
    if (response.ok) return response

    const { status } = response
    if (status === 404 && onNotFound) onNotFound()
    const message = await errorMessage(response)
    if (status === 404) throw new ProviderError(message, 404)

    const remaining = response.headers.get('x-ratelimit-remaining')
    const retryAfterHeader = response.headers.get('retry-after')
    if (status === 429 || (status === 403 && (remaining === '0' || retryAfterHeader !== null))) {
      throw new RateLimited(message, retryAfter(response.headers))
    }
    if (status === 401 || status === 403) throw new AuthError(message, status)
    throw new ProviderError(message, status)
  }
}

async function errorMessage(response: Response): Promise<string> {
  let detail: string | undefined
  try {
    const body = (await response.json()) as { message?: unknown }
    if (typeof body?.message === 'string') detail = body.message
  } catch {
    // Not JSON: fall back to the status text.
  }
  return `GitHub ${response.status}: ${detail ?? response.statusText}`
}

function retryAfter(headers: Headers): number | undefined {
  const header = headers.get('retry-after')
  if (header !== null) return Number(header)
  const reset = headers.get('x-ratelimit-reset')
  if (reset === null) return undefined
  return Math.max(0, Number(reset) - Math.floor(Date.now() / 1000))
}

function parseNextLink(header: string | null): string | undefined {
  if (!header) return undefined
  for (const part of header.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="?([^";]+)"?/)
    if (match && match[2]?.split(/\s+/).includes('next')) return match[1]
  }
  return undefined
}

function toIssue(raw: GitHubIssue, project: ProjectRef): Issue {
  const milestone = raw.milestone?.title
  return {
    ref: { ...project, number: raw.number },
    title: raw.title,
    body: raw.body ?? '',
    state: raw.state,
    labels: raw.labels.map((label) =>
      label.color ? { name: label.name, color: label.color } : { name: label.name },
    ),
    assignees: raw.assignees.map((assignee) => assignee.login),
    ...(milestone === undefined ? {} : { milestone }),
    url: raw.html_url,
    updatedAt: new Date(raw.updated_at).toISOString(),
    extras: { state_reason: raw.state_reason ?? null },
  }
}
