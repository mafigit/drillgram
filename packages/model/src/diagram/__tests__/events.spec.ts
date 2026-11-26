import { describe, it, expect } from 'vitest'
import { applyEvent, describeEvent, eventView } from '../events'
import type { WorkspaceEvent } from '../events'
import { bookshopExample } from '../examples'
import {
  ROOT_VIEW_ID,
  addObject,
  arrangeView,
  connect,
  emptyWorkspace,
  openView,
  setConnectionColour,
  setConnectionLabel,
} from '../workspace'
import type { Workspace } from '../workspace'

const apply = (events: WorkspaceEvent[], ws = emptyWorkspace()) => events.reduce(applyEvent, ws)

const shop: WorkspaceEvent = { type: 'objectAdded', view: ROOT_VIEW_ID, kind: 'softwareSystem', name: 'Online Shop' }
const customer: WorkspaceEvent = { type: 'objectAdded', view: ROOT_VIEW_ID, kind: 'person', name: 'Customer' }
const connected: WorkspaceEvent = { type: 'connected', view: ROOT_VIEW_ID, from: 'Customer', to: 'OnlineShop' }

function j2(): Workspace {
  let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'softwareSystem', 'Online Shop')
  ws = addObject(ws, ROOT_VIEW_ID, 'person', 'Customer')
  return connect(ws, ROOT_VIEW_ID, 'Customer', 'OnlineShop')
}

describe('applyEvent', () => {
  it('gives what the editing functions give', () => {
    expect(apply([shop, customer, connected])).toEqual(j2())
    expect(
      apply([shop, customer, { ...connected, label: 'Places orders in', technology: 'HTTPS' }]),
    ).toEqual(setConnectionLabel(j2(), 'c1', 'Places orders in', 'HTTPS'))
    expect(apply([{ type: 'exampleLoaded' }])).toEqual(bookshopExample())
  })

  it('renames, moves, labels and removes', () => {
    const ws = apply([
      shop,
      customer,
      connected,
      { type: 'objectRenamed', object: 'OnlineShop', name: 'Web Shop' },
      { type: 'objectsMoved', view: ROOT_VIEW_ID, moves: [{ object: 'Customer', to: { x: 40, y: 400 } }] },
      { type: 'connectionLabelled', connection: 'c1', label: 'Buys from' },
    ])
    expect(ws.model.objects[0]).toMatchObject({ id: 'OnlineShop', name: 'Web Shop' })
    expect(ws.views[0]!.positions.Customer).toEqual({ x: 40, y: 400 })
    expect(ws.model.connections[0]).toMatchObject({ label: 'Buys from' })
    expect(applyEvent(ws, { type: 'objectsRemoved', objects: ['OnlineShop', 'Customer'] })).toEqual(
      emptyWorkspace(),
    )
  })

  it('opens the view of an event first, as the editor shows it', () => {
    // The view inside the shop was never opened before: the event opens it.
    const inside: WorkspaceEvent = { type: 'objectAdded', view: 'inside-OnlineShop', kind: 'person', name: 'Clerk' }
    const ws = apply([shop, inside])
    expect(ws).toEqual(
      addObject(openView(apply([shop]), 'inside-OnlineShop'), 'inside-OnlineShop', 'person', 'Clerk'),
    )
    expect(ws.model.objects.at(-1)).toMatchObject({ id: 'Clerk', parent: 'OnlineShop' })
  })

  it('returns its input when the event changes nothing', () => {
    const ws = j2()
    const nothing: WorkspaceEvent[] = [
      { type: 'objectAdded', view: ROOT_VIEW_ID, kind: 'person', name: ' ' },
      { type: 'objectAdded', view: 'context-OnlineShop', kind: 'container', name: 'Web App' },
      { type: 'objectPlaced', view: 'inside-OnlineShop', object: 'OnlineShop' },
      { type: 'objectsMoved', view: ROOT_VIEW_ID, moves: [{ object: 'nope', to: { x: 0, y: 0 } }] },
      { type: 'objectRenamed', object: 'OnlineShop', name: 'Online Shop' },
      { type: 'objectsRemoved', objects: ['nope'] },
      { type: 'connected', view: ROOT_VIEW_ID, from: 'Customer', to: 'Customer' },
      { type: 'connectionLabelled', connection: 'c1', label: '' },
      { type: 'exampleLoaded' },
      { type: 'viewArranged', view: ROOT_VIEW_ID, cards: [{ object: 'nope', to: { x: 0, y: 0 }, size: { width: 220, height: 120 } }] },
    ]
    for (const event of nothing) expect(applyEvent(ws, event), event.type).toBe(ws)
  })
})

describe('connectionColoured', () => {
  it('colours a connection as the editing function does, and takes the colour off again', () => {
    const red = applyEvent(j2(), { type: 'connectionColoured', connection: 'c1', colour: 'red' })
    expect(red).toEqual(setConnectionColour(j2(), 'c1', 'red'))
    expect(applyEvent(red, { type: 'connectionColoured', connection: 'c1' })).toEqual(j2())
    expect(applyEvent(red, { type: 'connectionColoured', connection: 'c1', colour: 'red' })).toBe(red)
  })

  it('says what was done', () => {
    const ws = j2()
    expect(describeEvent(ws, { type: 'connectionColoured', connection: 'c1', colour: 'red' })).toBe('Coloured "Customer" to "Online Shop" red')
    expect(describeEvent(ws, { type: 'connectionColoured', connection: 'c1' })).toBe('Took the colour off "Customer" to "Online Shop"')
  })
})

describe('viewArranged', () => {
  const TALL = { width: 220, height: 160 }

  it('places and sizes every listed card in one change, as arrangeView does', () => {
    const event: WorkspaceEvent = {
      type: 'viewArranged',
      view: ROOT_VIEW_ID,
      cards: [
        { object: 'OnlineShop', to: { x: 40, y: 300 }, size: TALL },
        { object: 'Customer', to: { x: 40, y: 40 }, size: { width: 220, height: 120 } },
      ],
    }
    const ws = applyEvent(j2(), event)
    expect(ws).toEqual(arrangeView(j2(), ROOT_VIEW_ID, event.cards))
    expect(ws.views[0]!.positions).toEqual({ OnlineShop: { x: 40, y: 300 }, Customer: { x: 40, y: 40 } })
    expect(ws.views[0]!.sizes).toEqual({ OnlineShop: TALL })
  })

  it('is refused as a whole when one card does not fit', () => {
    const ws = j2()
    const event: WorkspaceEvent = {
      type: 'viewArranged',
      view: ROOT_VIEW_ID,
      cards: [
        { object: 'OnlineShop', to: { x: 40, y: 300 }, size: TALL },
        { object: 'Customer', to: { x: 50, y: 310 }, size: TALL },
      ],
    }
    expect(applyEvent(ws, event)).toBe(ws)
  })
})

describe('describeEvent', () => {
  it('says what changed, with the names the objects had then', () => {
    const ws = setConnectionLabel(j2(), 'c1', 'Places orders in')
    const said = (event: WorkspaceEvent) => describeEvent(ws, event)
    expect(said(shop)).toBe('Added software system "Online Shop"')
    expect(said({ type: 'objectPlaced', view: 'inside-OnlineShop', object: 'Customer' })).toBe(
      'Added existing object "Customer"',
    )
    expect(said({ type: 'objectsMoved', view: ROOT_VIEW_ID, moves: [{ object: 'Customer', to: { x: 0, y: 0 } }] })).toBe(
      'Moved "Customer"',
    )
    expect(
      said({
        type: 'objectsMoved',
        view: ROOT_VIEW_ID,
        moves: [
          { object: 'Customer', to: { x: 0, y: 0 } },
          { object: 'OnlineShop', to: { x: 0, y: 400 } },
        ],
      }),
    ).toBe('Moved 2 objects')
    expect(said({ type: 'objectRenamed', object: 'OnlineShop', name: 'Web Shop' })).toBe(
      'Renamed "Online Shop" to "Web Shop"',
    )
    expect(said({ type: 'objectsRemoved', objects: ['OnlineShop'] })).toBe('Deleted "Online Shop"')
    expect(said({ type: 'objectsRemoved', objects: ['OnlineShop', 'Customer'] })).toBe('Deleted 2 objects')
    expect(said(connected)).toBe('Connected "Customer" to "Online Shop"')
    expect(said({ ...connected, label: 'Pays', technology: 'HTTPS' })).toBe(
      'Connected "Customer" to "Online Shop": Pays [HTTPS]',
    )
    expect(said({ type: 'connectionLabelled', connection: 'c1', label: 'Buys from' })).toBe(
      'Labelled "Customer" to "Online Shop": Buys from',
    )
    expect(said({ type: 'exampleLoaded' })).toBe('Loaded the example')
    expect(said({ type: 'viewArranged', view: ROOT_VIEW_ID, cards: [] })).toBe('Arranged the diagram')
    // Some of the cards only: the change says how many.
    const some = { object: 'OnlineShop', to: { x: 0, y: 0 }, size: { width: 220, height: 120 } }
    expect(said({ type: 'viewArranged', view: ROOT_VIEW_ID, cards: [some] })).toBe('Arranged "Online Shop"')
  })
})

describe('eventView', () => {
  it('names the diagram a change was made on, when it was made on one', () => {
    expect(eventView(shop)).toBe(ROOT_VIEW_ID)
    expect(eventView({ type: 'objectRenamed', object: 'OnlineShop', name: 'Web Shop' })).toBeUndefined()
  })
})

describe('the size of a card, with the change that asks for it', () => {
  const TALL = { width: 220, height: 260 }

  it('comes with a new object', () => {
    const ws = applyEvent(emptyWorkspace(), { type: 'objectAdded', view: ROOT_VIEW_ID, kind: 'box', name: 'Notes', size: TALL })
    expect(ws.views[0]!.sizes).toEqual({ Notes: TALL })
  })

  it('comes with an edit, on the diagram it was edited on; the text changes even when the room is refused', () => {
    let ws = applyEvent(emptyWorkspace(), { type: 'objectAdded', view: ROOT_VIEW_ID, kind: 'box', name: 'Notes' })
    ws = applyEvent(ws, { type: 'objectAdded', view: ROOT_VIEW_ID, kind: 'box', name: 'Below', at: { x: 40, y: 200 } })
    const grown = applyEvent(ws, {
      type: 'objectEdited',
      object: 'Notes',
      name: 'Notes',
      details: { description: '# Long\n\ntext' },
      card: { view: ROOT_VIEW_ID, size: TALL, to: { x: 900, y: 40 } },
    })
    expect(grown.model.objects[0]!.description).toBe('# Long\n\ntext')
    expect(grown.views[0]!.sizes).toEqual({ Notes: TALL })
    expect(grown.views[0]!.positions.Notes).toEqual({ x: 900, y: 40 })
    // No free place given: it would reach into "Below", so only the text changes.
    const kept = applyEvent(ws, {
      type: 'objectEdited',
      object: 'Notes',
      name: 'Notes',
      details: { description: 'More' },
      card: { view: ROOT_VIEW_ID, size: TALL },
    })
    expect(kept.model.objects[0]!.description).toBe('More')
    expect(kept.views[0]).not.toHaveProperty('sizes')
  })
})

describe('objectsCopied', () => {
  const two = () => apply([shop, customer])

  it('copies every card it names, in one change, and says so', () => {
    const before = two()
    const event: WorkspaceEvent = { type: 'objectsCopied', view: ROOT_VIEW_ID, copies: [{ object: 'OnlineShop' }, { object: 'Customer', at: { x: 40, y: 600 } }] }
    const ws = applyEvent(before, event)
    expect(ws.model.objects.map((o) => o.name)).toEqual(['Online Shop', 'Customer', 'Online Shop copy', 'Customer copy'])
    expect(ws.views[0]!.positions.Customercopy).toEqual({ x: 40, y: 600 })
    expect(describeEvent(before, event)).toBe('Copied 2 objects')
    expect(describeEvent(before, { ...event, copies: [{ object: 'OnlineShop' }] })).toBe('Copied "Online Shop"')
  })

  it('changes nothing when no card it names is on the diagram', () => {
    const before = two()
    expect(applyEvent(before, { type: 'objectsCopied', view: ROOT_VIEW_ID, copies: [{ object: 'Nobody' }] })).toBe(before)
  })
})

describe('views as changes', () => {
  const added: WorkspaceEvent = { type: 'viewAdded', view: ROOT_VIEW_ID, name: 'Deployment', copy: true }

  it('adds, renames and removes a view, and says each in words', () => {
    const before = apply([shop, customer])
    const ws = applyEvent(before, added)
    expect(ws.views.map((v) => [v.id, v.name])).toEqual([[ROOT_VIEW_ID, undefined], ['view-1', 'Deployment']])
    expect(Object.keys(ws.views[1]!.positions)).toEqual(['OnlineShop', 'Customer'])
    expect(describeEvent(before, added)).toBe('Added the view "Deployment"')

    const renamed: WorkspaceEvent = { type: 'viewRenamed', view: 'view-1', name: 'Production' }
    expect(applyEvent(ws, renamed).views[1]!.name).toBe('Production')
    expect(describeEvent(ws, renamed)).toBe('Renamed the view "Deployment" to "Production"')

    const removed: WorkspaceEvent = { type: 'viewRemoved', view: 'view-1' }
    expect(applyEvent(ws, removed)).toEqual(before)
    expect(describeEvent(ws, removed)).toBe('Deleted the view "Deployment"')
  })

  it('copies a view as it is when opened: what belongs on it is on the copy', () => {
    // Nobody opened the Overview since "Customer" came into the model by another way.
    const before = apply([shop])
    const unsynced = { ...before, model: { ...before.model, objects: [...before.model.objects, { id: 'Customer', kind: 'person' as const, name: 'Customer' }] } }
    expect(Object.keys(applyEvent(unsynced, added).views[1]!.positions)).toEqual(['OnlineShop', 'Customer'])
  })

  it('changes nothing for a view that is not there, or the first view of a box', () => {
    const ws = apply([shop])
    expect(applyEvent(ws, { type: 'viewRemoved', view: ROOT_VIEW_ID })).toBe(ws)
    expect(applyEvent(ws, { type: 'viewRenamed', view: 'nope', name: 'X' })).toBe(ws)
    expect(applyEvent(ws, { ...added, view: 'nope' })).toBe(ws)
  })

  it('is a change on the view it was made from, or on the view itself', () => {
    expect(eventView(added)).toBe(ROOT_VIEW_ID)
    expect(eventView({ type: 'viewRenamed', view: 'view-1', name: 'X' })).toBe('view-1')
  })
})

describe('groups as changes', () => {
  const before = () => apply([shop, customer])
  const grouped: WorkspaceEvent = { type: 'cardsGrouped', view: ROOT_VIEW_ID, objects: ['OnlineShop', 'Customer'], name: 'prod', what: 'Deployment Node' }

  it('groups cards, changes the group, takes cards out and deletes it, and says each in words', () => {
    const ws = applyEvent(before(), grouped)
    expect(ws.views[0]!.groups).toEqual([{ id: 'g1', name: 'prod', type: 'Deployment Node', members: ['OnlineShop', 'Customer'] }])
    expect(describeEvent(before(), grouped)).toBe('Grouped 2 objects as "prod"')
    expect(describeEvent(before(), { ...grouped, objects: ['Customer'] })).toBe('Grouped "Customer" as "prod"')

    const edited: WorkspaceEvent = { type: 'groupEdited', view: ROOT_VIEW_ID, group: 'g1', name: 'production', what: '' }
    expect(applyEvent(ws, edited).views[0]!.groups).toEqual([{ id: 'g1', name: 'production', members: ['OnlineShop', 'Customer'] }])
    expect(describeEvent(ws, edited)).toBe('Changed the group "prod"')

    const out: WorkspaceEvent = { type: 'cardsUngrouped', view: ROOT_VIEW_ID, objects: ['Customer'] }
    expect(applyEvent(ws, out).views[0]!.groups![0]!.members).toEqual(['OnlineShop'])
    expect(describeEvent(ws, out)).toBe('Took "Customer" out of its group')

    const removed: WorkspaceEvent = { type: 'groupRemoved', view: ROOT_VIEW_ID, group: 'g1' }
    expect(applyEvent(ws, removed)).toEqual(before())
    expect(describeEvent(ws, removed)).toBe('Deleted the group "prod"')
  })

  it('changes nothing for cards or a group that are not there', () => {
    const ws = before()
    expect(applyEvent(ws, { ...grouped, objects: ['Nobody'] })).toBe(ws)
    expect(applyEvent(ws, { type: 'groupRemoved', view: ROOT_VIEW_ID, group: 'g9' })).toBe(ws)
    expect(applyEvent(ws, { type: 'cardsUngrouped', view: ROOT_VIEW_ID, objects: ['Customer'] })).toBe(ws)
  })
})
