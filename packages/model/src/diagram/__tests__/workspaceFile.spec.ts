import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { ROOT_VIEW_ID } from '../workspace'
import { replay } from '../log'
import type { LogEntry } from '../log'
import type { WorkspaceEvent } from '../events'
import { WorkspaceFileError, readWorkspaceFile, workspaceFileName, writeWorkspaceFile } from '../workspaceFile'

const AT = '2026-01-01T09:00:00.000Z'
const add = (name: string): WorkspaceEvent => ({ type: 'objectAdded', view: ROOT_VIEW_ID, kind: 'softwareSystem', name })
const change = (id: string, event: WorkspaceEvent): LogEntry => ({ id, type: 'change', at: AT, event })
const LOG: LogEntry[] = [change('a', add('Shop')), change('b', add('Bank')), { id: 'c', type: 'wentTo', position: 1 }]

describe('a workspace as a file', () => {
  it('holds the name and the log, and opens as the workspace was left, with its history', () => {
    const file = readWorkspaceFile(writeWorkspaceFile('Bookshop', LOG, AT))
    expect(file).toEqual({ name: 'Bookshop', entries: LOG })
    const history = replay(file.entries)
    expect(history.states[history.cursor]!.model.objects.map((o) => o.name)).toEqual(['Shop'])
    // The undone change is still there to redo.
    expect(history.log).toHaveLength(2)
  })

  it('says what it is, in a file a person can read: an entry a line', () => {
    const text = writeWorkspaceFile('Bookshop', LOG, AT)
    expect(JSON.parse(text)).toMatchObject({ format: 'drillgram-workspace', version: 1, name: 'Bookshop', exported: AT })
    expect(text.split('\n')).toHaveLength(LOG.length + 3)
    expect(text.endsWith('\n')).toBe(true)
  })

  it('is a file of an empty workspace too', () => {
    const text = writeWorkspaceFile('Empty', [], AT)
    expect(readWorkspaceFile(text)).toEqual({ name: 'Empty', entries: [] })
  })

  it('leaves out what was cleared, and the entry that says so', () => {
    const cleared = [change('old', add('Old')), { type: 'cleared' }, change('new', add('New'))]
    expect(readWorkspaceFile(writeWorkspaceFile('W', cleared, AT)).entries).toEqual([change('new', add('New'))])
    // A file from elsewhere that still has one.
    const text = JSON.stringify({ format: 'drillgram-workspace', version: 1, name: 'W', entries: cleared })
    expect(readWorkspaceFile(text).entries).toEqual([change('new', add('New'))])
  })

  it('passes over what is no entry of a log, as replaying a log does', () => {
    const entries = [change('a', add('Shop')), { id: 'x', type: 'somethingNew' }, 'text', null, { type: 'change' }, { id: 'w', type: 'wentTo', position: -1 }]
    const text = JSON.stringify({ format: 'drillgram-workspace', version: 1, name: 'W', entries })
    expect(readWorkspaceFile(text).entries).toEqual([change('a', add('Shop'))])
  })

  it('refuses a file that is no workspace, in words', () => {
    for (const text of ['', 'C4Context', '[]', '{}', '{"format":"drillgram-workspace"}', JSON.stringify({ format: 'other', version: 1, entries: [] })]) {
      expect(() => readWorkspaceFile(text), text).toThrow(WorkspaceFileError)
      expect(() => readWorkspaceFile(text), text).toThrow(/not a workspace of Drillgram/)
    }
  })

  it('refuses a file of a later version rather than guess at it', () => {
    const text = JSON.stringify({ format: 'drillgram-workspace', version: 2, name: 'W', entries: [] })
    expect(() => readWorkspaceFile(text)).toThrow(/newer version/)
  })

  it('gives a workspace without a name one, and cuts an endless one', () => {
    const file = (name: unknown) => readWorkspaceFile(JSON.stringify({ format: 'drillgram-workspace', version: 1, name, entries: [] })).name
    expect(file('  ')).toBe('Workspace')
    expect(file(7)).toBe('Workspace')
    expect(file('x'.repeat(500))).toHaveLength(200)
  })

  it('names its file after the workspace', () => {
    expect(workspaceFileName('My workspace')).toBe('my-workspace.drillgram.json')
    expect(workspaceFileName('Bücher & Café: Übersicht')).toBe('bucher-cafe-ubersicht.drillgram.json')
    expect(workspaceFileName('???')).toBe('workspace.drillgram.json')
  })

  it('gives back any log it was given (property)', () => {
    const entry = fc.oneof(
      fc.record({ id: fc.uuid(), type: fc.constant('change' as const), at: fc.constant(AT), event: fc.string().map((name) => add(name)) }),
      fc.record({ id: fc.uuid(), type: fc.constant('wentTo' as const), position: fc.nat(50) }),
    )
    fc.assert(
      fc.property(fc.string(), fc.array(entry, { maxLength: 30 }), (name, entries) => {
        const file = readWorkspaceFile(writeWorkspaceFile(name, entries, AT))
        expect(file.entries).toEqual(entries)
        // The same workspace, at the same place of the same history.
        expect(replay(file.entries)).toEqual(replay(entries))
        const tidy = [...name.trim()].slice(0, 200).join('')
        expect(file.name).toBe(tidy === '' ? 'Workspace' : tidy)
      }),
    )
  })
})
