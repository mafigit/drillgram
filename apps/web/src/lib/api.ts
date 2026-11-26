// The server's API (apps/server), under /api of the address the app itself comes from.

/** The server refused a request: its status and what it says about it. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** What else the answer carried. */
    readonly data: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

/** What to tell somebody when a request failed: the server's words, or that it did not answer. */
export function failureText(failure: unknown): string {
  return failure instanceof ApiError ? failure.message : 'The server does not answer. Try again in a moment.'
}

/** A browser lets a request outlive its page only when it carries less than 64 KiB. */
const OUTLIVES_PAGE = 60_000

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const sent = body === undefined ? undefined : JSON.stringify(body)
  // A request that never arrives throws: fetch's own error, without a status.
  const answer = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: sent === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: sent,
    // What is sent still arrives when the page is reloaded or closed a moment later: a change
    // is not cut off on its way. Reading can stop with the page.
    keepalive: sent !== undefined && sent.length < OUTLIVES_PAGE,
  })
  const text = await answer.text()
  let data: unknown
  try {
    data = text === '' ? undefined : JSON.parse(text)
  } catch {
    data = undefined
  }
  if (!answer.ok) {
    const said = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
    throw new ApiError(answer.status, typeof said.error === 'string' ? said.error : `The server answered with ${answer.status}.`, said)
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => call<T>('GET', path),
  post: <T>(path: string, body?: unknown) => call<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown) => call<T>('PATCH', path, body),
  put: <T>(path: string, body: unknown) => call<T>('PUT', path, body),
  delete: <T>(path: string) => call<T>('DELETE', path),
}

export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
  disabled: boolean
}

export interface WorkspaceInfo {
  id: string
  name: string
  /** What the signed-in user may do in it. */
  role: 'owner' | 'editor' | 'viewer'
}

/** The ways to sign in that are on, on this server. */
export interface SignInWays {
  password: boolean
  oidc: { name: string } | null
}
