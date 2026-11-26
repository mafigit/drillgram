import type { LogEntry } from './log'

// A workspace as a file: its change log, so that it opens elsewhere as it was left, with its
// history. To keep a copy, or to take a workspace to another browser or another server.

/** What a file says of itself, so that no other JSON file is taken for one. */
export const WORKSPACE_FILE = 'drillgram-workspace'
/** The version of the file this app writes. A file of a later one is refused, not guessed at. */
export const WORKSPACE_FILE_VERSION = 1
const MAX_NAME = 200

/** A file that is no workspace, in words fit to be shown. */
export class WorkspaceFileError extends Error {}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** An entry a log can hold again: a change, or a step along the timeline. */
function entryOf(found: unknown): LogEntry | undefined {
  if (!isObject(found) || typeof found.id !== 'string') return undefined
  if (found.type === 'change' && typeof found.at === 'string' && isObject(found.event) && typeof found.event.type === 'string') return found as unknown as LogEntry
  if (found.type === 'wentTo' && typeof found.position === 'number' && Number.isInteger(found.position) && found.position >= 0) return found as unknown as LogEntry
  return undefined
}

/**
 * The entries that make the workspace of today: what stands after the last "cleared", which
 * wiped everything before it.
 */
function sinceCleared(entries: readonly unknown[]): unknown[] {
  let from = 0
  entries.forEach((entry, at) => {
    if (isObject(entry) && entry.type === 'cleared') from = at + 1
  })
  return entries.slice(from)
}

/**
 * The file of a workspace: its name and its log, an entry a line. `at`: when it is written.
 * What a "cleared" wiped is left out.
 */
export function writeWorkspaceFile(name: string, entries: readonly unknown[], at: string): string {
  const kept = sinceCleared(entries).flatMap((entry) => entryOf(entry) ?? [])
  const head = JSON.stringify({ format: WORKSPACE_FILE, version: WORKSPACE_FILE_VERSION, name, exported: at })
  const lines = kept.map((entry) => JSON.stringify(entry)).join(',\n')
  return `${head.slice(0, -1)},"entries":[${kept.length > 0 ? `\n${lines}\n` : ''}]}\n`
}

/**
 * What a file holds: the workspace's name and the entries of its log. Entries this version
 * does not know are passed over, as when a log is replayed. Throws `WorkspaceFileError` for a
 * file that is no workspace.
 */
export function readWorkspaceFile(text: string): { name: string; entries: LogEntry[] } {
  let file: unknown
  try {
    file = JSON.parse(text)
  } catch {
    throw new WorkspaceFileError('This file is not a workspace of Drillgram: it cannot be read.')
  }
  if (!isObject(file) || file.format !== WORKSPACE_FILE || !Array.isArray(file.entries)) {
    throw new WorkspaceFileError('This file is not a workspace of Drillgram.')
  }
  if (typeof file.version !== 'number' || file.version > WORKSPACE_FILE_VERSION) {
    throw new WorkspaceFileError('This workspace was saved by a newer version of Drillgram. Reload the app to get the newest one, then try again.')
  }
  const typed = typeof file.name === 'string' ? [...file.name.trim()].slice(0, MAX_NAME).join('') : ''
  return { name: typed === '' ? 'Workspace' : typed, entries: sinceCleared(file.entries).flatMap((entry) => entryOf(entry) ?? []) }
}

/** The name of a workspace's file: its name as an address would write it, and what it is. */
export function workspaceFileName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug === '' ? 'workspace' : slug}.drillgram.json`
}
