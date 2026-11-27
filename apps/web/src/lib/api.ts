import type { Answer } from './browserServer'
import { storageServer } from './folder'

// The server's API (apps/server), under /api of the address the app itself comes from.

/**
 * The app was built to run without a server (`build:browser`): the browser keeps the
 * workspaces itself and answers in the server's place (lib/browserServer.ts).
 */
export const browserOnly = import.meta.env.VITE_BROWSER_ONLY === '1'

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
  return failure instanceof ApiError ? failure.message : `${NO_ANSWER.title}. Try again in a moment.`
}

/** What a page says when nothing answers: the server, or without one the browser's own storage. */
export const NO_ANSWER = browserOnly
  ? {
      title: 'This browser does not open its storage',
      text: 'Your diagrams are kept in this browser. It may refuse to keep data in a private window, or when its disk is full.',
      waiting: 'This browser could not write your last change to its storage. It is tried again.',
    }
  : {
      title: 'The server does not answer',
      text: 'Your diagrams are kept on the server. Check the connection, then try again.',
      waiting: 'The server does not answer. Your changes are kept in this browser and written as soon as it answers again.',
    }

/** A browser lets a request outlive its page only when it carries less than 64 KiB. */
const OUTLIVES_PAGE = 60_000

/** Asks the server. A request that never arrives throws: fetch's own error, without a status. */
async function askServer(method: string, path: string, sent?: string): Promise<Answer> {
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
  return { status: answer.status, data }
}

/**
 * Asks the browser in the server's place, with what would have gone over the wire: its own
 * database, or the folder it keeps the workspaces in (lib/folder.ts).
 */
const askBrowser = async (method: string, path: string, sent?: string) => (await storageServer())(method, path, sent === undefined ? undefined : JSON.parse(sent))

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const sent = body === undefined ? undefined : JSON.stringify(body)
  const { status, data } = await (browserOnly ? askBrowser : askServer)(method, path, sent)
  if (status >= 400) {
    const said = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
    throw new ApiError(status, typeof said.error === 'string' ? said.error : `The server answered with ${status}.`, said)
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
