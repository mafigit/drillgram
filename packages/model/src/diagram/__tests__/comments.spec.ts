import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { MAX_AUTHOR, MAX_COMMENT, applyComment, threadPlace } from '../comments'
import type { CommentEvent, CommentThread } from '../comments'
import type { WorkspaceEvent } from '../events'
import { startHistory } from '../history'
import { changeEntry, commentEntry, moveEntry, replay } from '../log'
import type { LogEntry } from '../log'
import { ROOT_VIEW_ID, addObject, emptyWorkspace, moveObjects } from '../workspace'
import { readWorkspaceFile, writeWorkspaceFile } from '../workspaceFile'

const AT = '2026-01-01T09:00:00.000Z'
const LATER = '2026-01-01T10:00:00.000Z'
const start = (thread: string, text = 'Who owns this?', extra: Partial<Extract<CommentEvent, { type: 'started' }>> = {}): CommentEvent => ({
  type: 'started',
  thread,
  comment: `${thread}-1`,
  view: ROOT_VIEW_ID,
  at: { x: 10, y: 20 },
  author: 'Ada',
  text,
  ...extra,
})
const reply = (thread: string, comment: string, text = 'The shop team.', author = 'Ben'): CommentEvent => ({ type: 'replied', thread, comment, author, text })
const add = (name: string): WorkspaceEvent => ({ type: 'objectAdded', view: ROOT_VIEW_ID, kind: 'softwareSystem', name })

describe('applyComment', () => {
  it('starts a thread with its first comment, where it was placed', () => {
    const threads = applyComment([], start('t1'), AT)
    expect(threads).toEqual([
      { id: 't1', view: ROOT_VIEW_ID, at: { x: 10, y: 20 }, comments: [{ id: 't1-1', author: 'Ada', text: 'Who owns this?', at: AT }] },
    ])
  })

  it('keeps the card a thread was placed on, and where on it', () => {
    const [thread] = applyComment([], start('t1', 'Who owns this?', { card: { object: 'shop', offset: { x: 4, y: 5 } } }), AT)
    expect(thread!.card).toEqual({ object: 'shop', offset: { x: 4, y: 5 } })
  })

  it('takes replies in order, each with its author and time', () => {
    const one = applyComment([], start('t1'), AT)
    const two = applyComment(one, reply('t1', 'c2'), LATER)
    expect(two[0]!.comments.map((c) => [c.author, c.text, c.at])).toEqual([
      ['Ada', 'Who owns this?', AT],
      ['Ben', 'The shop team.', LATER],
    ])
  })

  it('resolves a thread, and reopens it', () => {
    const one = applyComment([], start('t1'), AT)
    const resolved = applyComment(one, { type: 'resolved', thread: 't1', author: 'Ben' }, LATER)
    expect(resolved[0]!.resolved).toEqual({ by: 'Ben', at: LATER })
    const reopened = applyComment(resolved, { type: 'reopened', thread: 't1' }, LATER)
    expect(reopened[0]!.resolved).toBeUndefined()
  })

  it('deletes a thread with all its comments', () => {
    const two = applyComment(applyComment([], start('t1'), AT), start('t2'), AT)
    expect(applyComment(two, { type: 'deleted', thread: 't1' }, AT).map((t) => t.id)).toEqual(['t2'])
  })

  it('tidies what was typed: no blanks at the edges, not endless, a name for nobody', () => {
    const [thread] = applyComment([], start('t1', '  Who owns this?\n', { author: '   ' }), AT)
    expect(thread!.comments[0]).toMatchObject({ author: 'Guest', text: 'Who owns this?' })
    const [long] = applyComment([], start('t2', 'x'.repeat(MAX_COMMENT + 10), { author: 'A'.repeat(MAX_AUTHOR + 10) }), AT)
    expect(long!.comments[0]!.text).toHaveLength(MAX_COMMENT)
    expect(long!.comments[0]!.author).toHaveLength(MAX_AUTHOR)
  })

  it('changes nothing for what makes no sense: the same list back', () => {
    const one = applyComment([], start('t1'), AT)
    const nothing: CommentEvent[] = [
      start('t2', '   '),
      start('t1'),
      reply('t1', 'c2', ' '),
      reply('nope', 'c2'),
      reply('t1', 't1-1'),
      { type: 'resolved', thread: 'nope', author: 'Ada' },
      { type: 'reopened', thread: 't1' },
      { type: 'deleted', thread: 'nope' },
      { type: 'started', thread: 't3', comment: 'c', view: ROOT_VIEW_ID, at: { x: Number.NaN, y: 0 }, author: 'Ada', text: 'Hi' },
      { type: 'what' } as unknown as CommentEvent,
    ]
    for (const event of nothing) expect(applyComment(one, event, AT)).toBe(one)
    const resolved = applyComment(one, { type: 'resolved', thread: 't1', author: 'Ada' }, AT)
    expect(applyComment(resolved, { type: 'resolved', thread: 't1', author: 'Ben' }, LATER)).toBe(resolved)
  })
})

describe('threadPlace', () => {
  const ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'softwareSystem', 'Shop', undefined, { x: 100, y: 100 })
  const shop = ws.model.objects[0]!.id
  const placed = ws.views[0]!.positions[shop]!

  it('is where it was placed on the diagram', () => {
    const [thread] = applyComment([], start('t1'), AT)
    expect(threadPlace(thread!, ws)).toEqual({ x: 10, y: 20 })
  })

  it('goes where its card goes', () => {
    const [thread] = applyComment([], start('t1', 'Hi', { at: { x: placed.x + 4, y: placed.y + 5 }, card: { object: shop, offset: { x: 4, y: 5 } } }), AT)
    const moved = moveObjects(ws, ROOT_VIEW_ID, [{ object: shop, to: { x: placed.x + 300, y: placed.y + 40 } }])
    const now = moved.views[0]!.positions[shop]!
    expect(threadPlace(thread!, moved)).toEqual({ x: now.x + 4, y: now.y + 5 })
  })

  it('stays where it was placed when its card is not on the diagram any more', () => {
    const [thread] = applyComment([], start('t1', 'Hi', { card: { object: 'gone', offset: { x: 4, y: 5 } } }), AT)
    expect(threadPlace(thread!, ws)).toEqual({ x: 10, y: 20 })
  })
})

describe('comments in the log', () => {
  it('gives the history with the comment and the entry that says it: no change of the diagram', () => {
    const before = changeEntry(startHistory(emptyWorkspace()), add('Shop'), AT, 'e1').history
    const { history, entry } = commentEntry(before, start('t1'), LATER, 'e2')
    expect(entry).toEqual({ id: 'e2', type: 'comment', at: LATER, event: start('t1') })
    expect(history.comments.map((t) => t.id)).toEqual(['t1'])
    expect(history.log).toBe(before.log)
    expect(history.cursor).toBe(before.cursor)
    expect(history.states).toBe(before.states)
  })

  it('gives no entry for a comment that changes nothing', () => {
    const before = startHistory(emptyWorkspace())
    const { history, entry } = commentEntry(before, start('t1', ' '), AT, 'e1')
    expect(history).toBe(before)
    expect(entry).toBeUndefined()
  })

  it('keeps the comments through changes, undo and redo; "cleared" wipes them', () => {
    const entries: LogEntry[] = [
      { id: 'a', type: 'change', at: AT, event: add('Shop') },
      { id: 'b', type: 'comment', at: AT, event: start('t1') },
      { id: 'c', type: 'change', at: AT, event: add('Bank') },
      { id: 'd', type: 'wentTo', position: 0 },
    ]
    const history = replay(entries)
    expect(history.cursor).toBe(0)
    expect(history.comments.map((t) => t.id)).toEqual(['t1'])
    expect(replay([...entries, { type: 'cleared' }]).comments).toEqual([])
  })

  it('leaves the diagram and its history as they are, and is the same as the comments alone (property)', () => {
    const change = fc.constantFrom('Shop', 'Bank', 'Mail').map((name): LogEntry => ({ id: 'x', type: 'change', at: AT, event: add(name) }))
    const went = fc.nat({ max: 6 }).map((position): LogEntry => ({ id: 'x', type: 'wentTo', position }))
    const thread = fc.constantFrom('t1', 't2')
    const comment = fc
      .oneof(
        thread.map((t) => start(t)),
        fc.tuple(thread, fc.constantFrom('c1', 'c2', 'c3')).map(([t, c]) => reply(t, c)),
        thread.map((t): CommentEvent => ({ type: 'resolved', thread: t, author: 'Ada' })),
        thread.map((t): CommentEvent => ({ type: 'reopened', thread: t })),
        thread.map((t): CommentEvent => ({ type: 'deleted', thread: t })),
      )
      .map((event): LogEntry => ({ id: 'x', type: 'comment', at: AT, event }))
    fc.assert(
      fc.property(fc.array(fc.oneof(change, went, comment), { maxLength: 30 }), (entries) => {
        const all = replay(entries)
        const diagram = replay(entries.filter((e) => e.type !== 'comment'))
        const talk = replay(entries.filter((e) => e.type === 'comment'))
        expect(all.cursor).toBe(diagram.cursor)
        expect(all.log).toEqual(diagram.log)
        expect(all.states[all.cursor]).toEqual(diagram.states[diagram.cursor])
        expect(all.comments).toEqual(talk.comments)
      }),
    )
  })

  it('takes a step along the timeline without touching the comments', () => {
    const one = changeEntry(startHistory(emptyWorkspace()), add('Shop'), AT, 'e1').history
    const talked = commentEntry(one, start('t1'), AT, 'e2').history
    expect(moveEntry(talked, 0, 'e3').history.comments).toBe(talked.comments)
  })

  it('goes along in a workspace file', () => {
    const entries: LogEntry[] = [
      { id: 'a', type: 'change', at: AT, event: add('Shop') },
      { id: 'b', type: 'comment', at: AT, event: start('t1') },
    ]
    const file = readWorkspaceFile(writeWorkspaceFile('Bookshop', entries, AT))
    expect(file.entries).toEqual(entries)
    expect(replay(file.entries).comments.map((t: CommentThread) => t.id)).toEqual(['t1'])
  })
})
