export type IssueProviderKind = 'gitea' | 'github' | 'gitlab'

export interface IssueRef {
  provider: IssueProviderKind
  baseUrl: string
  /** `owner/repo` (GitHub, Gitea) or `group/sub/project` (GitLab). */
  project: string
  number: number
}

/** The `project` argument of `IssueProvider.listIssues`. */
export type ProjectRef = Omit<IssueRef, 'number'>

export interface Label {
  name: string
  color?: string
}

export interface Issue {
  ref: IssueRef
  title: string
  body: string
  state: 'open' | 'closed'
  labels: Label[]
  assignees: string[]
  milestone?: string
  url: string
  /** ISO 8601 timestamp. */
  updatedAt: string
  /** Provider-specific data the common model does not flatten (sub-issues, issue type, state_reason). */
  extras: Record<string, unknown>
}

const PROVIDERS: readonly IssueProviderKind[] = ['gitea', 'github', 'gitlab']

function isProvider(value: string): value is IssueProviderKind {
  return (PROVIDERS as readonly string[]).includes(value)
}

/** Formats a ref as `provider:baseUrl/project#number`, for example `gitea:https://host/owner/repo#2`. */
export function formatRef(ref: IssueRef): string {
  const fail = (reason: string): never => {
    throw new Error(`Cannot format issue ref (${reason}): ${JSON.stringify(ref)}`)
  }
  if (!isProvider(ref.provider)) fail('unknown provider')
  if (!Number.isInteger(ref.number) || ref.number < 1) fail('number must be a positive integer')
  if (ref.baseUrl.endsWith('/')) fail('baseUrl has a trailing slash')
  let url: URL
  try {
    url = new URL(ref.baseUrl)
  } catch {
    return fail('baseUrl is not a URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') fail('baseUrl is not http(s)')
  const segments = ref.project.split('/')
  if (segments.some((segment) => segment === '')) fail('project has an empty segment')
  if (ref.provider === 'gitlab') {
    if (segments.length < 2) fail('GitLab project needs at least 2 segments')
    if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
      fail('GitLab baseUrl must be a bare origin')
    }
  } else if (segments.length !== 2) {
    fail('project must be owner/repo')
  }
  return `${ref.provider}:${ref.baseUrl}/${ref.project}#${ref.number}`
}

/** Parses a ref written by `formatRef`. Throws on malformed input. */
export function parseRef(input: string): IssueRef {
  const fail = (reason: string): never => {
    throw new Error(`Malformed issue ref (${reason}): ${JSON.stringify(input)}`)
  }
  const colon = input.indexOf(':')
  if (colon < 0) fail('missing provider')
  const provider = input.slice(0, colon)
  if (!isProvider(provider)) return fail('unknown provider')

  const rest = input.slice(colon + 1)
  const hash = rest.lastIndexOf('#')
  if (hash < 0) fail('missing #number')
  const numberText = rest.slice(hash + 1)
  if (!/^[1-9]\d*$/.test(numberText)) fail('number must be a positive integer')

  let url: URL
  try {
    url = new URL(rest.slice(0, hash))
  } catch {
    return fail('not a URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') fail('not http(s)')
  if (url.search !== '') fail('unexpected query')

  const segments = url.pathname.split('/').slice(1)
  if (segments.some((segment) => segment === '')) fail('empty path segment')

  let baseUrl: string
  let project: string
  if (provider === 'gitlab') {
    if (segments.length < 2) fail('GitLab project needs at least 2 segments')
    baseUrl = url.origin
    project = segments.join('/')
  } else {
    if (segments.length < 2) fail('project must be owner/repo')
    const base = segments.slice(0, -2)
    baseUrl = base.length > 0 ? `${url.origin}/${base.join('/')}` : url.origin
    project = segments.slice(-2).join('/')
  }
  return { provider, baseUrl, project, number: Number(numberText) }
}
