import type { Issue, IssueRef, ProjectRef } from './model'

export interface ListIssuesOptions {
  /** Defaults to `'open'`. */
  state?: 'open' | 'closed' | 'all'
  /** An issue must carry every listed label. */
  labels?: string[]
}

/** A read-only adapter to one issue tracker. Pull and merge requests are never returned. */
export interface IssueProvider {
  getIssue(ref: IssueRef): Promise<Issue>
  listIssues(project: ProjectRef, options?: ListIssuesOptions): Promise<Issue[]>
}

/** Adapters get `fetch` and `getToken` here and never read globals. */
export interface ProviderConfig {
  baseUrl: string
  getToken: () => Promise<string | undefined>
  fetch: typeof fetch
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

export class IssueNotFound extends ProviderError {
  constructor(readonly ref: IssueRef) {
    super(`Issue not found: ${ref.provider}:${ref.baseUrl}/${ref.project}#${ref.number}`, 404)
    this.name = 'IssueNotFound'
  }
}

export class AuthError extends ProviderError {
  constructor(message = 'Authentication failed', status = 401) {
    super(message, status)
    this.name = 'AuthError'
  }
}

export class RateLimited extends ProviderError {
  constructor(
    message: string,
    /** Seconds to wait before retrying, when the provider says. */
    readonly retryAfter?: number,
  ) {
    super(message, 429)
    this.name = 'RateLimited'
  }
}
