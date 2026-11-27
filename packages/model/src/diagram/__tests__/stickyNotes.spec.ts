import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { applyEvent, describeEvent } from '../events'
import type { WorkspaceEvent } from '../events'
import { DiagramFormatError, validateDiagram } from '../model'
import type { Diagram, FillColour } from '../model'
import {
  ROOT_VIEW_ID,
  STICKY_NOTE,
  addObject,
  addView,
  attachNote,
  cardSize,
  fillObject,
  copyObject,
  setObjectIcons,
  detachNote,
  editObject,
  emptyWorkspace,
  fitsOnView,
  importDiagram,
  moveObject,
  noteTitle,
  parseWorkspace,
  placeObject,
  removeCards,
  removeObjects,
  serializeWorkspace,
  validateWorkspace,
} from '../workspace'
import type { Workspace } from '../workspace'

const root = (ws: Workspace) => ws.views.find((view) => view.id === ROOT_VIEW_ID)!

/** A box "Shop" at 40, 40 and a sticky note "Todo" right of it, loose. */
function shopAndNote(): Workspace {
  let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'box', 'Shop', {}, { x: 40, y: 40 })
  ws = addObject(ws, ROOT_VIEW_ID, 'box', 'Todo', { shape: 'stickyNote' }, { x: 400, y: 40 })
  return ws
}

describe('a sticky note', () => {
  it('is a box with the shape stickyNote, square, and loose', () => {
    const ws = shopAndNote()
    expect(ws.model.objects[1]).toMatchObject({ kind: 'box', shape: 'stickyNote' })
    expect(cardSize(root(ws), 'Todo')).toEqual(STICKY_NOTE)
    expect(root(ws).attached).toBeUndefined()
  })

  it('is square on another view too', () => {
    const ws = placeObject(addView(shopAndNote(), ROOT_VIEW_ID, 'Flow', false), 'view-1', 'Todo')
    expect(cardSize(ws.views[1]!, 'Todo')).toEqual(STICKY_NOTE)
  })

  it('moves by itself while it is loose, as any card', () => {
    const ws = moveObject(shopAndNote(), ROOT_VIEW_ID, 'Shop', { x: 40, y: 300 })
    expect(root(ws).positions.Todo).toEqual({ x: 400, y: 40 })
  })
})

describe('attachNote', () => {
  it('sticks a note on a shape, at the place it is put', () => {
    const ws = attachNote(shopAndNote(), ROOT_VIEW_ID, 'Todo', 'Shop', { x: 280, y: 40 })
    expect(root(ws).attached).toEqual({ Todo: 'Shop' })
    expect(root(ws).positions.Todo).toEqual({ x: 280, y: 40 })
    validateWorkspace(ws)
  })

  it('takes it from one shape to another', () => {
    let ws = addObject(shopAndNote(), ROOT_VIEW_ID, 'box', 'Bank', {}, { x: 40, y: 400 })
    ws = attachNote(ws, ROOT_VIEW_ID, 'Todo', 'Shop')
    ws = attachNote(ws, ROOT_VIEW_ID, 'Todo', 'Bank')
    expect(root(ws).attached).toEqual({ Todo: 'Bank' })
  })

  it('sticks a note right on its shape: a note on a shape may lie over cards', () => {
    const ws = attachNote(shopAndNote(), ROOT_VIEW_ID, 'Todo', 'Shop', { x: 160, y: 0 })
    expect(root(ws).attached).toEqual({ Todo: 'Shop' })
    expect(root(ws).positions.Todo).toEqual({ x: 160, y: 0 })
    // Not in the way of other cards: one may come right under it.
    const bank = addObject(ws, ROOT_VIEW_ID, 'box', 'Bank', {}, { x: 300, y: 40 })
    expect(root(bank).positions.Bank).toEqual({ x: 300, y: 40 })
  })

  it('refuses what is no note, a note as the shape, itself and a card not here', () => {
    let ws = shopAndNote()
    ws = addObject(ws, ROOT_VIEW_ID, 'box', 'Other note', { shape: 'stickyNote' }, { x: 700, y: 40 })
    expect(attachNote(ws, ROOT_VIEW_ID, 'Shop', 'Todo')).toBe(ws)
    expect(attachNote(ws, ROOT_VIEW_ID, 'Todo', 'Othernote')).toBe(ws)
    expect(attachNote(ws, ROOT_VIEW_ID, 'Todo', 'Todo')).toBe(ws)
    expect(attachNote(ws, ROOT_VIEW_ID, 'Todo', 'Nobody')).toBe(ws)
    expect(attachNote(ws, 'no-view', 'Todo', 'Shop')).toBe(ws)
  })

  it('changes nothing for a note that is on that shape already, where it is', () => {
    const ws = attachNote(shopAndNote(), ROOT_VIEW_ID, 'Todo', 'Shop')
    expect(attachNote(ws, ROOT_VIEW_ID, 'Todo', 'Shop')).toBe(ws)
  })
})

describe('detachNote', () => {
  it('takes a note off its shape, at the place it is put; then it moves by itself', () => {
    let ws = attachNote(shopAndNote(), ROOT_VIEW_ID, 'Todo', 'Shop')
    ws = detachNote(ws, ROOT_VIEW_ID, 'Todo', { x: 400, y: 400 })
    expect(root(ws).attached).toBeUndefined()
    expect(root(ws).positions.Todo).toEqual({ x: 400, y: 400 })
    ws = moveObject(ws, ROOT_VIEW_ID, 'Shop', { x: 40, y: 600 })
    expect(root(ws).positions.Todo).toEqual({ x: 400, y: 400 })
  })

  it('takes a note that lies on a card off to the free place nearest', () => {
    let ws = attachNote(shopAndNote(), ROOT_VIEW_ID, 'Todo', 'Shop', { x: 160, y: 0 })
    ws = detachNote(ws, ROOT_VIEW_ID, 'Todo')
    expect(root(ws).attached).toBeUndefined()
    expect(fitsOnView(ws, ROOT_VIEW_ID, 'Todo', root(ws).positions.Todo!)).toBe(true)
    expect(root(ws).positions.Todo).not.toEqual({ x: 160, y: 0 })
  })

  it('changes nothing for a loose note', () => {
    const ws = shopAndNote()
    expect(detachNote(ws, ROOT_VIEW_ID, 'Todo')).toBe(ws)
  })
})

describe('a note on a shape', () => {
  const stuck = () => attachNote(shopAndNote(), ROOT_VIEW_ID, 'Todo', 'Shop', { x: 280, y: 40 })

  it('goes where its shape goes, the same way', () => {
    const ws = moveObject(stuck(), ROOT_VIEW_ID, 'Shop', { x: 100, y: 300 })
    expect(root(ws).positions.Shop).toEqual({ x: 100, y: 300 })
    expect(root(ws).positions.Todo).toEqual({ x: 340, y: 300 })
    validateWorkspace(ws)
  })

  it('goes the same way also where a card lies: it may lie over it', () => {
    // Where the note goes, "Bank" stands.
    const ws = addObject(stuck(), ROOT_VIEW_ID, 'box', 'Bank', {}, { x: 340, y: 400 })
    const moved = moveObject(ws, ROOT_VIEW_ID, 'Shop', { x: 100, y: 400 })
    expect(root(moved).positions).toMatchObject({ Shop: { x: 100, y: 400 }, Todo: { x: 340, y: 400 } })
    validateWorkspace(moved)
  })

  it('moves by itself and stays stuck, also over other cards', () => {
    const ws = addObject(stuck(), ROOT_VIEW_ID, 'box', 'Bank', {}, { x: 340, y: 400 })
    const moved = moveObject(ws, ROOT_VIEW_ID, 'Todo', { x: 360, y: 400 })
    expect(root(moved).positions.Todo).toEqual({ x: 360, y: 400 })
    expect(root(moved).attached).toEqual({ Todo: 'Shop' })
  })

  it('moves once when it is dragged along with its shape', () => {
    const both = (order: string[]): WorkspaceEvent => ({
      type: 'objectsMoved',
      view: ROOT_VIEW_ID,
      moves: order.map((object) => ({ object, to: object === 'Shop' ? { x: 100, y: 300 } : { x: 340, y: 300 } })),
    })
    for (const order of [['Shop', 'Todo'], ['Todo', 'Shop']]) {
      const view = root(applyEvent(stuck(), both(order)))
      expect(view.positions).toEqual({ Shop: { x: 100, y: 300 }, Todo: { x: 340, y: 300 } })
    }
  })

  it('is loose once its shape is deleted, and gone from the shape once it is deleted itself', () => {
    expect(root(removeObjects(stuck(), ['Shop'])).attached).toBeUndefined()
    expect(root(removeObjects(stuck(), ['Shop'])).positions.Todo).toEqual({ x: 280, y: 40 })
    expect(root(removeObjects(stuck(), ['Todo'])).attached).toBeUndefined()
  })

  it('is loose on a view its shape is taken off, and stays stuck on the other views', () => {
    const ws = addView(stuck(), ROOT_VIEW_ID, 'Flow', true)
    for (const card of ['Shop', 'Todo']) {
      const off = removeCards(ws, 'view-1', [card])
      validateWorkspace(off)
      expect(off.views[1]!.attached).toBeUndefined()
      expect(root(off).attached).toEqual({ Todo: 'Shop' })
    }
  })

  it('is loose once it is no sticky note, or its shape becomes one', () => {
    expect(root(editObject(stuck(), 'Todo', 'Todo', { shape: '' })).attached).toBeUndefined()
    expect(root(editObject(stuck(), 'Shop', 'Shop', { shape: 'stickyNote' })).attached).toBeUndefined()
    expect(root(editObject(stuck(), 'Shop', 'Shop', { shape: 'cylinder' })).attached).toEqual({ Todo: 'Shop' })
  })

  it('stays on it in a view made as a copy, and is kept', () => {
    const ws = addView(stuck(), ROOT_VIEW_ID, 'Flow', true)
    expect(ws.views[1]!.attached).toEqual({ Todo: 'Shop' })
    expect(parseWorkspace(serializeWorkspace(ws))).toEqual(ws)
  })
})

describe('noteTitle', () => {
  it('is the first line of a note, without its marks', () => {
    expect(noteTitle('**Ask** legal\n- one\n- two')).toBe('Ask legal')
    expect(noteTitle('\n\n## Plan _now_\n')).toBe('Plan now')
    expect(noteTitle('- [ ] check `pnpm test`')).toBe('check pnpm test')
    expect(noteTitle('   ')).toBe('Note')
    expect(noteTitle('x'.repeat(200))).toHaveLength(80)
  })
})

describe('validateWorkspace with notes on shapes', () => {
  const broken = (attached: unknown) => {
    const ws = shopAndNote()
    return { ...ws, views: [{ ...root(ws), attached }] } as Workspace
  }

  it('refuses a note that is no note, a shape that is a note or not here, and what is no map', () => {
    expect(() => validateWorkspace(broken({ Shop: 'Todo' }))).toThrow(DiagramFormatError)
    expect(() => validateWorkspace(broken({ Todo: 'Todo' }))).toThrow(DiagramFormatError)
    expect(() => validateWorkspace(broken({ Todo: 'Nobody' }))).toThrow(DiagramFormatError)
    expect(() => validateWorkspace(broken({ Nobody: 'Shop' }))).toThrow(DiagramFormatError)
    expect(() => validateWorkspace(broken({}))).toThrow(DiagramFormatError)
    expect(() => validateWorkspace(broken(['Todo']))).toThrow(DiagramFormatError)
    expect(() => validateWorkspace(broken({ Todo: 'Shop' }))).not.toThrow()
  })
})

describe('notes on shapes in an imported diagram', () => {
  const diagram: Diagram = {
    level: 'context',
    elements: [
      { id: 'shop', kind: 'box', name: 'Shop' },
      { id: 'todo', kind: 'box', name: 'Todo', shape: 'stickyNote', attachedTo: 'shop' },
      { id: 'idea', kind: 'box', name: 'Idea', shape: 'stickyNote' },
    ],
    relationships: [],
  }

  it('says which shape a note is on, and only a note on a shape that is no note', () => {
    validateDiagram(diagram)
    const bad = (attachedTo: string, shape?: 'stickyNote') => ({
      ...diagram,
      elements: diagram.elements.map((element) => (element.id === 'todo' ? { ...element, attachedTo, ...(shape ? {} : { shape: undefined }) } : element)),
    })
    expect(() => validateDiagram(bad('nobody', 'stickyNote'))).toThrow(DiagramFormatError)
    expect(() => validateDiagram(bad('idea', 'stickyNote'))).toThrow(DiagramFormatError)
    expect(() => validateDiagram(bad('todo', 'stickyNote'))).toThrow(DiagramFormatError)
    expect(() => validateDiagram(bad('shop'))).toThrow(DiagramFormatError)
  })

  it('come in stuck on their shape, square', () => {
    const ws = importDiagram(emptyWorkspace(), ROOT_VIEW_ID, diagram)
    validateWorkspace(ws)
    expect(root(ws).attached).toEqual({ Todo: 'Shop' })
    expect(cardSize(root(ws), 'Idea')).toEqual(STICKY_NOTE)
    // Over the top right corner of its card, as on a board.
    const shop = root(ws).positions.Shop!
    expect(root(ws).positions.Todo).toEqual({ x: shop.x + 220 - 80, y: shop.y - 80 })
    // Where it is wanted, also on its card.
    const placed = importDiagram(emptyWorkspace(), ROOT_VIEW_ID, diagram, { shop: { x: 0, y: 0 }, todo: { x: 20, y: 20 } })
    expect(root(placed).positions.Todo).toEqual({ x: 20, y: 20 })
  })
})

describe('notes on shapes as changes', () => {
  const stuck: WorkspaceEvent = { type: 'noteAttached', view: ROOT_VIEW_ID, note: 'Todo', object: 'Shop', to: { x: 280, y: 40 } }
  const loose: WorkspaceEvent = { type: 'noteDetached', view: ROOT_VIEW_ID, note: 'Todo', to: { x: 400, y: 400 } }

  it('sticks and takes off, and says each in words', () => {
    const ws = applyEvent(shopAndNote(), stuck)
    expect(ws).toEqual(attachNote(shopAndNote(), ROOT_VIEW_ID, 'Todo', 'Shop', { x: 280, y: 40 }))
    expect(describeEvent(shopAndNote(), stuck)).toBe('Stuck "Todo" on "Shop"')
    expect(applyEvent(ws, loose)).toEqual(detachNote(ws, ROOT_VIEW_ID, 'Todo', { x: 400, y: 400 }))
    expect(describeEvent(ws, loose)).toBe('Took "Todo" off "Shop"')
  })

  it('says an arrangement of every box is of the diagram, a note moved out of the way or not', () => {
    let ws = addObject(shopAndNote(), ROOT_VIEW_ID, 'box', 'Bank', {}, { x: 40, y: 400 })
    const card = (object: string, x: number, y: number, size = { width: 220, height: 120 }) => ({ object, to: { x, y }, size })
    const all: WorkspaceEvent = { type: 'viewArranged', view: ROOT_VIEW_ID, cards: [card('Shop', 40, 40), card('Bank', 340, 40), card('Todo', 640, 40, STICKY_NOTE)] }
    expect(describeEvent(ws, all)).toBe('Arranged the diagram')
    expect(describeEvent(ws, { ...all, cards: all.cards.slice(0, 2) })).toBe('Arranged the diagram')
    expect(describeEvent(ws, { ...all, cards: [all.cards[0]!, all.cards[2]!] })).toBe('Arranged "Shop"')
    ws = applyEvent(ws, all)
    expect(root(ws).positions.Todo).toEqual({ x: 640, y: 40 })
  })

  it('keeps every workspace valid, whatever is moved, stuck, taken off or deleted', () => {
    const names = ['Shop', 'Bank', 'Todo', 'Idea']
    const at = fc.record({ x: fc.integer({ min: 0, max: 30 }).map((n) => n * 20), y: fc.integer({ min: 0, max: 30 }).map((n) => n * 20) })
    const step: fc.Arbitrary<WorkspaceEvent> = fc.oneof(
      fc.record({ type: fc.constant('noteAttached' as const), view: fc.constant(ROOT_VIEW_ID), note: fc.constantFrom(...names), object: fc.constantFrom(...names), to: fc.option(at, { nil: undefined }) }),
      fc.record({ type: fc.constant('noteDetached' as const), view: fc.constant(ROOT_VIEW_ID), note: fc.constantFrom(...names), to: fc.option(at, { nil: undefined }) }),
      fc.record({
        type: fc.constant('objectsMoved' as const),
        view: fc.constant(ROOT_VIEW_ID),
        moves: fc.array(fc.record({ object: fc.constantFrom(...names), to: at }), { minLength: 1, maxLength: 3 }),
      }),
      fc.record({ type: fc.constant('objectsRemoved' as const), objects: fc.array(fc.constantFrom(...names), { maxLength: 1 }) }),
      fc.record({ type: fc.constant('objectEdited' as const), object: fc.constantFrom(...names), name: fc.constantFrom(...names), details: fc.record({ shape: fc.constantFrom('stickyNote' as const, '' as const) }) }),
    )
    let start = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'box', 'Shop', {}, { x: 0, y: 0 })
    start = addObject(start, ROOT_VIEW_ID, 'box', 'Bank', {}, { x: 300, y: 0 })
    start = addObject(start, ROOT_VIEW_ID, 'box', 'Todo', { shape: 'stickyNote' }, { x: 0, y: 300 })
    start = addObject(start, ROOT_VIEW_ID, 'box', 'Idea', { shape: 'stickyNote' }, { x: 300, y: 300 })
    fc.assert(
      fc.property(fc.array(step, { maxLength: 20 }), (steps) => {
        const ws = steps.reduce(applyEvent, start)
        validateWorkspace(ws)
        // No card comes into another one, a note taken off included; a note on a card may.
        const loose = Object.entries(root(ws).positions).filter(([id]) => root(ws).attached?.[id] === undefined)
        for (const [id, at] of loose) expect(fitsOnView(ws, ROOT_VIEW_ID, id, at)).toBe(true)
      }),
      { numRuns: 400 },
    )
  })
})

describe('the fill of a card', () => {
  const object = (ws: Workspace, id = 'Todo') => ws.model.objects.find((o) => o.id === id)!

  it('makes a note of any paper colour, yellow by itself', () => {
    expect(object(shopAndNote()).fill).toBeUndefined()
    const green = fillObject(shopAndNote(), 'Todo', 'green')
    expect(object(green).fill).toBe('green')
    validateWorkspace(green)
    // Yellow is how a note is without one.
    expect(object(fillObject(green, 'Todo', 'yellow')).fill).toBeUndefined()
    expect(object(fillObject(green, 'Todo', undefined)).fill).toBeUndefined()
    expect(fillObject(green, 'Todo', 'green')).toBe(green)
  })

  it('fills any other card too, yellow included; none is the card of the theme again', () => {
    const yellow = fillObject(shopAndNote(), 'Shop', 'yellow')
    expect(object(yellow, 'Shop').fill).toBe('yellow')
    expect(object(fillObject(yellow, 'Shop', undefined), 'Shop').fill).toBeUndefined()
    validateWorkspace(yellow)
  })

  it('is one of the fill colours only', () => {
    const ws = shopAndNote()
    expect(fillObject(ws, 'Shop', 'gold' as FillColour)).toBe(ws)
    expect(fillObject(ws, 'Nobody', 'green')).toBe(ws)
    expect(() => validateWorkspace({ ...ws, model: { ...ws.model, objects: ws.model.objects.map((o) => ({ ...o, fill: 'gold' as FillColour })) } })).toThrow(
      DiagramFormatError,
    )
  })

  it('stays when the shape changes, a yellow note keeps its yellow, and comes along in a copy', () => {
    const green = fillObject(shopAndNote(), 'Todo', 'green')
    expect(object(editObject(green, 'Todo', 'Todo', { shape: '' })).fill).toBe('green')
    expect(object(editObject(shopAndNote(), 'Todo', 'Todo', { shape: '' })).fill).toBe('yellow')
    expect(copyObject(green, ROOT_VIEW_ID, 'Todo').model.objects.at(-1)!.fill).toBe('green')
  })

  it('is a change of its own, said in words', () => {
    const coloured: WorkspaceEvent = { type: 'objectFilled', object: 'Todo', colour: 'pink' }
    expect(applyEvent(shopAndNote(), coloured)).toEqual(fillObject(shopAndNote(), 'Todo', 'pink'))
    expect(describeEvent(shopAndNote(), coloured)).toBe('Coloured "Todo" pink')
    expect(describeEvent(shopAndNote(), { type: 'objectFilled', object: 'Todo' })).toBe('Made "Todo" yellow again')
    expect(describeEvent(shopAndNote(), { type: 'objectFilled', object: 'Shop' })).toBe('Took the colour off "Shop"')
  })

  it('comes in from a file', () => {
    const diagram: Diagram = {
      level: 'context',
      elements: [
        { id: 'todo', kind: 'box', name: 'Todo', shape: 'stickyNote', fill: 'blue' },
        { id: 'box', kind: 'box', name: 'Box', fill: 'yellow' },
      ],
      relationships: [],
    }
    const ws = importDiagram(emptyWorkspace(), ROOT_VIEW_ID, diagram)
    expect(ws.model.objects.map((o) => o.fill)).toEqual(['blue', 'yellow'])
    expect(() => validateDiagram({ ...diagram, elements: [{ id: 'box', kind: 'box', name: 'Box', fill: 'gold' as FillColour }] })).toThrow(DiagramFormatError)
  })

  it('takes no icons on a note: a note is its text alone', () => {
    const ws = shopAndNote()
    expect(setObjectIcons(ws, 'Todo', ['go'])).toBe(ws)
  })
})
