import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { BOX_SHAPES, DiagramFormatError, validateDiagram } from '../model'
import type { ElementKind } from '../model'
import { d2Format } from '../d2'
import { bookshopExample } from '../examples'
import { mermaidFormat, writableAsMermaid } from '../mermaid'
import {
  ROOT_VIEW_ID,
  addObject,
  addView,
  arrangeView,
  CARD,
  CARD_GAP,
  cardSize,
  boxesAround,
  breadcrumb,
  connect,
  connectable,
  copyObject,
  diagramOfView,
  drillDown,
  editGroup,
  emptyWorkspace,
  ensureViewInside,
  FRAME,
  findViewInside,
  liftedConnections,
  fitsOnView,
  groupCards,
  GROUP_FRAME,
  groupFramesStayClear,
  importDiagram,
  groupable,
  moveObject,
  openView,
  parseWorkspace,
  placeObject,
  placeableObjects,
  removeObjects,
  removeView,
  renameView,
  renameObject,
  resizeCard,
  serializeWorkspace,
  setConnectionColour,
  setConnectionLabel,
  syncView,
  editObject,
  removeConnections,
  removeGroup,
  ungroupCards,
  setObjectIcons,
  validateWorkspace,
  viewTitle,
  viewsOf,
  viewToDiagram,
} from '../workspace'
import type { View, Workspace } from '../workspace'

function j2Workspace(): Workspace {
  let ws = emptyWorkspace()
  ws = addObject(ws, ROOT_VIEW_ID, 'person', 'Customer')
  ws = addObject(ws, ROOT_VIEW_ID, 'softwareSystem', 'Online Shop')
  return connect(ws, ROOT_VIEW_ID, 'Customer', 'OnlineShop', 'Places orders in')
}

const rootView = (ws: Workspace) => ws.views.find((v) => v.id === ROOT_VIEW_ID)!

describe('emptyWorkspace', () => {
  it('has an empty model and one empty view, the Overview', () => {
    expect(emptyWorkspace()).toEqual({
      model: { objects: [], connections: [] },
      views: [{ id: 'landscape', positions: {}, connections: [] }],
    })
    expect(ROOT_VIEW_ID).toBe('landscape')
  })
})

describe('addObject', () => {
  it('creates the object in the model and places it on the view', () => {
    const ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'softwareSystem', '  Online Shop ')
    expect(ws.model.objects).toEqual([
      { id: 'OnlineShop', kind: 'softwareSystem', name: 'Online Shop' },
    ])
    expect(rootView(ws).positions).toEqual({
      OnlineShop: { x: expect.any(Number), y: expect.any(Number) },
    })
  })

  it('puts the card at a wanted place that is free, and elsewhere when it is not', () => {
    let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'person', 'Customer', {}, { x: 500, y: 300 })
    expect(rootView(ws).positions.Customer).toEqual({ x: 500, y: 300 })
    // Too close to "Customer": the usual free place instead.
    ws = addObject(ws, ROOT_VIEW_ID, 'person', 'Clerk', {}, { x: 510, y: 310 })
    const usual = rootView(addObject(ws, ROOT_VIEW_ID, 'person', 'Other')).positions
    expect(rootView(ws).positions.Clerk).not.toEqual({ x: 510, y: 310 })
    validateWorkspace(ws)
    expect(usual.Other).toBeDefined()
    // Not a place at all.
    ws = addObject(ws, ROOT_VIEW_ID, 'person', 'Nobody', {}, { x: NaN, y: 0 })
    expect(Number.isFinite(rootView(ws).positions.Nobody!.x)).toBe(true)
  })

  it('keeps ids unique and valid', () => {
    let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'person', 'Shop')
    ws = addObject(ws, ROOT_VIEW_ID, 'person', 'Shop')
    ws = addObject(ws, ROOT_VIEW_ID, 'person', '2nd café!')
    expect(ws.model.objects.map((o) => o.id)).toEqual(['Shop', 'Shop2', '_2ndcaf'])
  })

  it('places new objects apart from each other', () => {
    let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'person', 'A')
    ws = addObject(ws, ROOT_VIEW_ID, 'person', 'B')
    expect(rootView(ws).positions.A).not.toEqual(rootView(ws).positions.B)
  })

  it('ignores an empty name and an unknown view, and never mutates its input', () => {
    const before = emptyWorkspace()
    expect(addObject(before, ROOT_VIEW_ID, 'person', '   ')).toBe(before)
    expect(addObject(before, 'nope', 'person', 'A')).toBe(before)
    addObject(before, ROOT_VIEW_ID, 'person', 'A')
    expect(before).toEqual(emptyWorkspace())
  })
})

describe('connect', () => {
  it('creates the connection in the model and shows it on the view', () => {
    const ws = j2Workspace()
    expect(ws.model.connections).toEqual([
      { id: 'c1', from: 'Customer', to: 'OnlineShop', label: 'Places orders in' },
    ])
    expect(rootView(ws).connections).toEqual(['c1'])
  })

  it('leaves out an empty label and gives every connection its own id', () => {
    let ws = connect(j2Workspace(), ROOT_VIEW_ID, 'OnlineShop', 'Customer', ' ')
    expect(ws.model.connections[1]).toEqual({ id: 'c2', from: 'OnlineShop', to: 'Customer' })
    ws = connect(ws, ROOT_VIEW_ID, 'Customer', 'OnlineShop')
    expect(ws.model.connections.map((c) => c.id)).toEqual(['c1', 'c2', 'c3'])
  })

  it('ignores self links and objects that are not on the view', () => {
    const ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'person', 'A')
    expect(connect(ws, ROOT_VIEW_ID, 'A', 'A')).toBe(ws)
    expect(connect(ws, ROOT_VIEW_ID, 'A', 'Nope')).toBe(ws)
    expect(connect(ws, 'nope', 'A', 'A')).toBe(ws)
  })
})

/** J18: two systems; inside Online Shop two containers that both call Payment Service. */
function j18Workspace(): Workspace {
  let ws = emptyWorkspace()
  ws = addObject(ws, ROOT_VIEW_ID, 'softwareSystem', 'Online Shop')
  ws = addObject(ws, ROOT_VIEW_ID, 'softwareSystem', 'Payment Service')
  ws = ensureViewInside(ws, 'OnlineShop')
  const inside = findViewInside(ws, 'OnlineShop')!.id
  ws = addObject(ws, inside, 'container', 'Web App')
  ws = addObject(ws, inside, 'container', 'API')
  ws = placeObject(ws, inside, 'PaymentService')
  ws = connect(ws, inside, 'WebApp', 'PaymentService', 'Starts payment')
  return connect(ws, inside, 'API', 'PaymentService', 'Confirms payment')
}

describe('ensureViewInside', () => {
  const shop = () => addObject(emptyWorkspace(), ROOT_VIEW_ID, 'softwareSystem', 'Online Shop')

  it('creates the view inside an object, once', () => {
    const ws = ensureViewInside(shop(), 'OnlineShop')
    expect(findViewInside(ws, 'OnlineShop')).toEqual({
      id: 'inside-OnlineShop',
      scope: 'OnlineShop',
      positions: {},
      connections: [],
    })
    expect(ensureViewInside(ws, 'OnlineShop')).toBe(ws)
  })

  it('opens a box of any kind, a person and a plain box too, but not an unknown object', () => {
    let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'person', 'Customer')
    ws = addObject(ws, ROOT_VIEW_ID, 'box', 'Notes')
    for (const id of ['Customer', 'Notes']) {
      expect(findViewInside(ensureViewInside(ws, id), id)).toMatchObject({ scope: id })
    }
    expect(ensureViewInside(ws, 'Nope')).toBe(ws)
  })
})

describe('addObject on a view inside an object', () => {
  it('makes the new object a part of that object and shows it only there', () => {
    let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'softwareSystem', 'Online Shop')
    ws = ensureViewInside(ws, 'OnlineShop')
    ws = addObject(ws, 'inside-OnlineShop', 'container', 'Web App')
    expect(ws.model.objects[1]).toEqual({
      id: 'WebApp',
      kind: 'container',
      name: 'Web App',
      parent: 'OnlineShop',
    })
    expect(Object.keys(findViewInside(ws, 'OnlineShop')!.positions)).toEqual(['WebApp'])
    expect(Object.keys(rootView(ws).positions)).toEqual(['OnlineShop'])
  })

  it('takes any kind of box anywhere: no kind says what lives in what', () => {
    // A container on the Overview, a software system inside a person, a person inside a plain box.
    let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'container', 'Web App')
    expect(ws.model.objects[0]).toEqual({ id: 'WebApp', kind: 'container', name: 'Web App' })
    ws = addObject(ws, ROOT_VIEW_ID, 'person', 'Customer')
    ws = ensureViewInside(ws, 'Customer')
    ws = addObject(ws, 'inside-Customer', 'softwareSystem', 'Phone')
    ws = addObject(ws, 'inside-Customer', 'box', 'Wallet')
    ws = ensureViewInside(ws, 'Wallet')
    ws = addObject(ws, 'inside-Wallet', 'person', 'Owner')
    expect(ws.model.objects.map((o) => [o.id, o.parent])).toEqual([
      ['WebApp', undefined],
      ['Customer', undefined],
      ['Phone', 'Customer'],
      ['Wallet', 'Customer'],
      ['Owner', 'Wallet'],
    ])
    validateWorkspace(ws)
    expect(addObject(ws, ROOT_VIEW_ID, 'nonsense' as ElementKind, 'X')).toBe(ws)
  })
})

/** Open an object from a view, as the editor's zoom button does. */
function open(ws: Workspace, fromViewId: string, objectId: string) {
  const opened = drillDown(ws, fromViewId, objectId)
  if (!opened) throw new Error(`${objectId} cannot be opened from ${fromViewId}`)
  return opened
}

describe('drillDown', () => {
  const overview = () => {
    let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'softwareSystem', 'Online Shop')
    ws = addObject(ws, ROOT_VIEW_ID, 'softwareSystem', 'Payment Service')
    ws = addObject(ws, ROOT_VIEW_ID, 'person', 'Customer')
    ws = addObject(ws, ROOT_VIEW_ID, 'softwareSystem', 'Mail Server')
    ws = connect(ws, ROOT_VIEW_ID, 'Customer', 'OnlineShop', 'Places orders in')
    return connect(ws, ROOT_VIEW_ID, 'OnlineShop', 'PaymentService', 'Takes payments through')
  }

  it('opens the view inside an object, straight away, with what the object is connected to around it', () => {
    const { workspace: ws, viewId } = open(overview(), ROOT_VIEW_ID, 'OnlineShop')
    expect(viewId).toBe('inside-OnlineShop')
    const view = findViewInside(ws, 'OnlineShop')!
    expect(view).toMatchObject({ id: 'inside-OnlineShop', scope: 'OnlineShop' })
    expect(view).not.toHaveProperty('level')
    // Not the object itself, and not the unrelated Mail Server.
    expect(Object.keys(view.positions).sort()).toEqual(['Customer', 'PaymentService'])
  })

  it('goes on down: the view inside a part of the object', () => {
    const shop = open(overview(), ROOT_VIEW_ID, 'OnlineShop')
    const ws = addObject(shop.workspace, shop.viewId, 'container', 'Web App')
    const opened = open(ws, shop.viewId, 'WebApp')
    expect(opened.viewId).toBe('inside-WebApp')
    expect(findViewInside(opened.workspace, 'WebApp')).toMatchObject({ scope: 'WebApp' })
  })

  it('opens a neighbour from the view it stands beside the frame on', () => {
    const shop = open(overview(), ROOT_VIEW_ID, 'OnlineShop')
    expect(open(shop.workspace, shop.viewId, 'PaymentService').viewId).toBe('inside-PaymentService')
    expect(open(shop.workspace, shop.viewId, 'Customer').viewId).toBe('inside-Customer')
  })

  it('has nothing to open for an unknown object or from an unknown view', () => {
    const ws = overview()
    expect(drillDown(ws, ROOT_VIEW_ID, 'Nope')).toBeUndefined()
    expect(drillDown(ws, 'nope', 'OnlineShop')).toBeUndefined()
  })
})

describe('syncView', () => {
  it('adds to the Overview every object that stands inside no other, and the connections between them', () => {
    let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'softwareSystem', 'Online Shop')
    // As a file or another program may leave it: in the model, on no view.
    ws = {
      ...ws,
      model: {
        objects: [...ws.model.objects, { id: 'Customer', kind: 'person', name: 'Customer' }],
        connections: [{ id: 'c1', from: 'Customer', to: 'OnlineShop', label: 'Places orders in' }],
      },
    }
    expect(Object.keys(rootView(ws).positions)).toEqual(['OnlineShop'])
    ws = syncView(ws, ROOT_VIEW_ID)
    expect(Object.keys(rootView(ws).positions)).toEqual(['OnlineShop', 'Customer'])
    expect(rootView(ws).connections).toEqual(['c1'])
    validateWorkspace(ws)
  })

  it('leaves what is inside an object to the view inside it', () => {
    const ws = syncView(j18Workspace(), ROOT_VIEW_ID)
    expect(Object.keys(rootView(ws).positions)).toEqual(['OnlineShop', 'PaymentService'])
    // The containers' connections are made inside Online Shop: the Overview lists none of its
    // own, and shows that the two systems are connected: one line for both, without a label.
    expect(rootView(ws).connections).toEqual([])
    expect(diagramOfView(ws, ROOT_VIEW_ID).relationships).toEqual([{ from: 'OnlineShop', to: 'PaymentService' }])
    expect(findViewInside(ws, 'OnlineShop')!.connections).toEqual(['c1', 'c2'])
  })

  it('adds to the view inside an object the connections of its parts, not those between two neighbours', () => {
    let ws = j18Workspace()
    ws = addObject(ws, ROOT_VIEW_ID, 'softwareSystem', 'Mail Server')
    ws = placeObject(ws, 'inside-OnlineShop', 'MailServer')
    ws = connect(ws, ROOT_VIEW_ID, 'PaymentService', 'MailServer', 'Sends receipts with')
    // As a file may leave it: a connection of a part that the view does not list yet.
    ws = { ...ws, model: { ...ws.model, connections: [...ws.model.connections, { id: 'c9', from: 'WebApp', to: 'MailServer' }] } }
    const view = findViewInside(syncView(ws, 'inside-OnlineShop'), 'OnlineShop')!
    expect(view.connections).toEqual(['c1', 'c2', 'c9'])
  })

  it('changes nothing when the view is up to date or unknown', () => {
    const ws = syncView(syncView(j18Workspace(), ROOT_VIEW_ID), 'inside-OnlineShop')
    expect(syncView(ws, ROOT_VIEW_ID)).toBe(ws)
    expect(syncView(ws, 'inside-OnlineShop')).toBe(ws)
    expect(syncView(ws, 'nope')).toBe(ws)
  })
})

describe('breadcrumb', () => {
  it('leads from the Overview down to the open view, by the objects it is inside', () => {
    let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'softwareSystem', 'Online Shop')
    expect(breadcrumb(ws, ROOT_VIEW_ID)).toEqual([{ viewId: ROOT_VIEW_ID, label: 'Overview' }])

    ws = open(ws, ROOT_VIEW_ID, 'OnlineShop').workspace
    expect(breadcrumb(ws, 'inside-OnlineShop')).toEqual([
      { viewId: ROOT_VIEW_ID, label: 'Overview' },
      { viewId: 'inside-OnlineShop', label: 'Online Shop' },
    ])

    ws = addObject(ws, 'inside-OnlineShop', 'container', 'Web App')
    ws = open(ws, 'inside-OnlineShop', 'WebApp').workspace
    expect(breadcrumb(ws, 'inside-WebApp')).toEqual([
      { viewId: ROOT_VIEW_ID, label: 'Overview' },
      { viewId: 'inside-OnlineShop', label: 'Online Shop' },
      { viewId: 'inside-WebApp', label: 'Web App' },
    ])
  })
})

describe('placeObject', () => {
  it('shows an object of the model on another view without copying it', () => {
    const ws = j18Workspace()
    expect(ws.model.objects.filter((o) => o.name === 'Payment Service')).toHaveLength(1)
    expect(findViewInside(ws, 'OnlineShop')!.positions).toHaveProperty('PaymentService')
    expect(rootView(ws).positions).toHaveProperty('PaymentService')
  })

  it('offers the objects that are not on the view, except the one the view is inside', () => {
    let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'softwareSystem', 'Online Shop')
    ws = addObject(ws, ROOT_VIEW_ID, 'softwareSystem', 'Payment Service')
    ws = ensureViewInside(ws, 'OnlineShop')
    expect(placeableObjects(ws, 'inside-OnlineShop').map((o) => o.id)).toEqual(['PaymentService'])
    expect(placeableObjects(ws, ROOT_VIEW_ID)).toEqual([])
  })

  /** J18's workspace with a component "Cart" inside Web App, a diagram inside Payment Service and a person. */
  function deep(): Workspace {
    let ws = j18Workspace()
    ws = ensureViewInside(ws, 'WebApp')
    ws = addObject(ws, 'inside-WebApp', 'component', 'Cart')
    ws = ensureViewInside(ws, 'PaymentService')
    return addObject(ws, ROOT_VIEW_ID, 'person', 'Customer')
  }

  it('offers every object of the model, from any depth, but never the object the view is inside or what that is inside', () => {
    const ws = deep()
    const offered = (viewId: string) => placeableObjects(ws, viewId).map((o) => o.id)

    // The Overview: the parts of its boxes too, and their parts.
    expect(offered(ROOT_VIEW_ID)).toEqual(['WebApp', 'API', 'Cart'])
    expect(offered('inside-PaymentService')).toEqual(['OnlineShop', 'WebApp', 'API', 'Cart', 'Customer'])
    // What is deeper inside a part ("Cart"), but not what is there already.
    expect(offered('inside-OnlineShop')).toEqual(['Cart', 'Customer'])
    // Not what it stands inside (Online Shop), not itself, not its own part (that is there).
    expect(offered('inside-WebApp')).toEqual(['PaymentService', 'API', 'Customer'])
    expect(placeObject(ws, 'inside-WebApp', 'OnlineShop')).toBe(ws)
    expect(placeObject(ws, 'inside-WebApp', 'WebApp')).toBe(ws)
  })

  it('says which boxes an object stands inside, the outermost first', () => {
    const ws = deep()
    expect(boxesAround(ws, 'Cart').map((o) => o.name)).toEqual(['Online Shop', 'Web App'])
    expect(boxesAround(ws, 'WebApp').map((o) => o.name)).toEqual(['Online Shop'])
    expect(boxesAround(ws, 'Customer')).toEqual([])
    expect(boxesAround(ws, 'Nobody')).toEqual([])
  })

  it('shows a part of a box on the Overview, with its connections to the cards there', () => {
    const ws = syncView(placeObject(deep(), ROOT_VIEW_ID, 'WebApp'), ROOT_VIEW_ID)
    validateWorkspace(ws)
    expect(rootView(ws).positions).toHaveProperty('WebApp')
    // Web App starts a payment at Payment Service: both stand here now, so the line does too.
    expect(rootView(ws).connections).toEqual(['c1'])
    expect(parseWorkspace(serializeWorkspace(ws))).toEqual(ws)
  })

  it('shows a part of a part on the diagram of the outer box, among its parts, with its connections', () => {
    let ws = deep()
    ws = { ...ws, model: { ...ws.model, connections: [...ws.model.connections, { id: 'c9', from: 'Cart', to: 'PaymentService', label: 'Pays' }] } }
    ws = syncView(placeObject(ws, 'inside-OnlineShop', 'Cart'), 'inside-OnlineShop')
    validateWorkspace(ws)
    const view = findViewInside(ws, 'OnlineShop')!
    expect(view.connections).toContain('c9')
    // In the grid of the parts, not out among the neighbours.
    expect(fitsOnView(ws, view.id, 'Cart', view.positions.Cart!)).toBe(true)
    expect(view.positions.Cart!.y).toBeLessThanOrEqual(Math.max(view.positions.WebApp!.y, view.positions.API!.y) + 180)
  })

  it('ignores an object that is already there, is not placeable or does not exist', () => {
    const ws = j18Workspace()
    expect(placeObject(ws, 'inside-OnlineShop', 'PaymentService')).toBe(ws)
    expect(placeObject(ws, 'inside-OnlineShop', 'OnlineShop')).toBe(ws)
    expect(placeObject(ws, 'inside-OnlineShop', 'Nope')).toBe(ws)
    expect(placeObject(ws, 'nope', 'PaymentService')).toBe(ws)
  })
})

describe('moveObject', () => {
  it('moves an object on one view only', () => {
    const ws = moveObject(j18Workspace(), 'inside-OnlineShop', 'PaymentService', { x: 500, y: 300 })
    expect(findViewInside(ws, 'OnlineShop')!.positions.PaymentService).toEqual({ x: 500, y: 300 })
    expect(rootView(ws).positions.PaymentService).toEqual(rootView(j18Workspace()).positions.PaymentService)
  })

  it('ignores an object that is not on the view, and a move to where it already is', () => {
    const ws = j18Workspace()
    expect(moveObject(ws, ROOT_VIEW_ID, 'WebApp', { x: 1, y: 1 })).toBe(ws)
    expect(moveObject(ws, 'nope', 'OnlineShop', { x: 1, y: 1 })).toBe(ws)
    expect(moveObject(ws, ROOT_VIEW_ID, 'OnlineShop', rootView(ws).positions.OnlineShop!)).toBe(ws)
  })
})

// Two cards never overlap, and never come closer than CARD_GAP: a place that breaks this is not
// a place. The layout engine finds good places; the model only refuses bad ones.
describe('cards keep their distance', () => {
  const two = () => {
    let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'softwareSystem', 'A')
    return addObject(ws, ROOT_VIEW_ID, 'softwareSystem', 'B')
  }
  const at = (ws: Workspace, id: string) => rootView(ws).positions[id]!

  it('knows whether a place is free', () => {
    const ws = two()
    const a = at(ws, 'A')
    expect(fitsOnView(ws, ROOT_VIEW_ID, 'B', { x: a.x + CARD.width + CARD_GAP, y: a.y })).toBe(true)
    expect(fitsOnView(ws, ROOT_VIEW_ID, 'B', { x: a.x + CARD.width + CARD_GAP - 1, y: a.y })).toBe(false)
    expect(fitsOnView(ws, ROOT_VIEW_ID, 'B', { x: a.x, y: a.y + CARD.height + CARD_GAP })).toBe(true)
    expect(fitsOnView(ws, ROOT_VIEW_ID, 'B', { x: a.x + 10, y: a.y + 10 })).toBe(false)
    // A card does not get in its own way.
    expect(fitsOnView(ws, ROOT_VIEW_ID, 'A', { x: a.x + 5, y: a.y + 5 })).toBe(true)
  })

  it('refuses a move onto or too close to another card', () => {
    const ws = two()
    const a = at(ws, 'A')
    expect(moveObject(ws, ROOT_VIEW_ID, 'B', { x: a.x + 30, y: a.y + 30 })).toBe(ws)
    expect(moveObject(ws, ROOT_VIEW_ID, 'B', { x: a.x + CARD.width + CARD_GAP - 1, y: a.y })).toBe(ws)
    const moved = moveObject(ws, ROOT_VIEW_ID, 'B', { x: a.x + CARD.width + CARD_GAP, y: a.y })
    expect(at(moved, 'B')).toEqual({ x: a.x + CARD.width + CARD_GAP, y: a.y })
  })

  it('gives a new card a free place, also when a card was moved to where it would have gone', () => {
    let ws = two()
    // Where would a third card go? Put B there first.
    const third = at(addObject(ws, ROOT_VIEW_ID, 'softwareSystem', 'C'), 'C')
    ws = moveObject(ws, ROOT_VIEW_ID, 'B', third)
    expect(at(ws, 'B')).toEqual(third)
    ws = addObject(ws, ROOT_VIEW_ID, 'softwareSystem', 'C')
    for (const other of ['A', 'B']) {
      expect(fitsOnView(ws, ROOT_VIEW_ID, 'C', at(ws, 'C')), `C against ${other}`).toBe(true)
    }
    expect(at(ws, 'C')).not.toEqual(third)
  })
})

// The layout engine may give a card with many connections more room (owner, 2026-11-24). Only
// that card grows; every other card keeps CARD.
describe('a card with its own size', () => {
  const TALL = { width: 220, height: 160 }
  const two = () => {
    let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'softwareSystem', 'A')
    return addObject(ws, ROOT_VIEW_ID, 'softwareSystem', 'B')
  }
  const at = (ws: Workspace, id: string) => rootView(ws).positions[id]!
  // A at (40, 40) with B right below it, exactly CARD_GAP under A's 120 px bottom.
  const stacked = () => moveObject(two(), ROOT_VIEW_ID, 'B', { x: 40, y: 40 + CARD.height + CARD_GAP })

  it('is CARD unless the view stores another size', () => {
    const ws = two()
    expect(cardSize(rootView(ws), 'A')).toEqual(CARD)
    expect(rootView(ws).sizes).toBeUndefined()
    const view = { ...rootView(ws), sizes: { A: TALL } }
    expect(cardSize(view, 'A')).toEqual(TALL)
    expect(cardSize(view, 'B')).toEqual(CARD)
    expect(cardSize(view, 'constructor')).toEqual(CARD)
  })

  it('arranges a view in one change: places and sizes, only sizes other than CARD are kept', () => {
    const ws = two()
    const arranged = arrangeView(ws, ROOT_VIEW_ID, [
      { object: 'A', to: { x: 40, y: 300 }, size: TALL },
      { object: 'B', to: { x: 400, y: 300 }, size: { ...CARD } },
    ])
    expect(rootView(arranged).positions).toEqual({ A: { x: 40, y: 300 }, B: { x: 400, y: 300 } })
    expect(rootView(arranged).sizes).toEqual({ A: TALL })
    validateWorkspace(arranged)
    // Back to CARD: the entry goes, and so does the empty record.
    const back = arrangeView(arranged, ROOT_VIEW_ID, [{ object: 'A', to: { x: 40, y: 300 }, size: CARD }])
    expect(rootView(back).sizes).toBeUndefined()
    expect(rootView(back).positions).toEqual(rootView(arranged).positions)
  })

  it('leaves the cards it does not list where they are, with their size', () => {
    let ws = arrangeView(two(), ROOT_VIEW_ID, [{ object: 'A', to: { x: 40, y: 40 }, size: TALL }])
    ws = arrangeView(ws, ROOT_VIEW_ID, [{ object: 'B', to: { x: 600, y: 40 }, size: CARD }])
    expect(at(ws, 'A')).toEqual({ x: 40, y: 40 })
    expect(cardSize(rootView(ws), 'A')).toEqual(TALL)
    expect(at(ws, 'B')).toEqual({ x: 600, y: 40 })
  })

  it('refuses an arrangement with an object that is not on the view, or one listed twice', () => {
    const ws = two()
    const fine = { object: 'A', to: { x: 40, y: 600 }, size: TALL }
    expect(arrangeView(ws, ROOT_VIEW_ID, [fine, { object: 'nope', to: { x: 900, y: 900 }, size: CARD }])).toBe(ws)
    expect(arrangeView(ws, ROOT_VIEW_ID, [fine, { ...fine, to: { x: 900, y: 900 } }])).toBe(ws)
    expect(arrangeView(ws, 'nope', [fine])).toBe(ws)
  })

  it('refuses sizes and places that are not numbers a card can have', () => {
    const ws = two()
    for (const size of [{ width: 0, height: 120 }, { width: 220, height: -1 }, { width: Infinity, height: 120 }, { width: 220, height: NaN }]) {
      expect(arrangeView(ws, ROOT_VIEW_ID, [{ object: 'A', to: { x: 40, y: 600 }, size }]), JSON.stringify(size)).toBe(ws)
    }
    expect(arrangeView(ws, ROOT_VIEW_ID, [{ object: 'A', to: { x: NaN, y: 600 }, size: CARD }])).toBe(ws)
  })

  it('refuses an arrangement that brings two cards closer than CARD_GAP, with their real sizes', () => {
    const ws = stacked()
    // A grows to 160 px where it stands: its bottom comes to 20 px past B's top.
    expect(arrangeView(ws, ROOT_VIEW_ID, [{ object: 'A', to: at(ws, 'A'), size: TALL }])).toBe(ws)
    // Two listed cards on top of each other.
    expect(
      arrangeView(ws, ROOT_VIEW_ID, [
        { object: 'A', to: { x: 500, y: 500 }, size: CARD },
        { object: 'B', to: { x: 510, y: 510 }, size: CARD },
      ]),
    ).toBe(ws)
    // Moving B along makes room.
    const roomy = arrangeView(ws, ROOT_VIEW_ID, [
      { object: 'A', to: at(ws, 'A'), size: TALL },
      { object: 'B', to: { x: 40, y: 40 + TALL.height + CARD_GAP }, size: CARD },
    ])
    expect(roomy).not.toBe(ws)
  })

  it('returns its input when nothing changes', () => {
    const ws = two()
    expect(arrangeView(ws, ROOT_VIEW_ID, [{ object: 'A', to: at(ws, 'A'), size: CARD }])).toBe(ws)
    expect(arrangeView(ws, ROOT_VIEW_ID, [])).toBe(ws)
  })

  it('keeps the gap to a taller card on an ordinary move, and a moved card keeps its size', () => {
    let ws = arrangeView(two(), ROOT_VIEW_ID, [{ object: 'A', to: { x: 40, y: 40 }, size: TALL }])
    expect(fitsOnView(ws, ROOT_VIEW_ID, 'B', { x: 40, y: 40 + TALL.height + CARD_GAP - 1 })).toBe(false)
    expect(moveObject(ws, ROOT_VIEW_ID, 'B', { x: 40, y: 40 + TALL.height + CARD_GAP - 1 })).toBe(ws)
    ws = moveObject(ws, ROOT_VIEW_ID, 'B', { x: 40, y: 40 + TALL.height + CARD_GAP })
    expect(at(ws, 'B')).toEqual({ x: 40, y: 220 })
    // The tall card itself brings its height along.
    expect(moveObject(ws, ROOT_VIEW_ID, 'A', { x: 40, y: 41 })).toBe(ws)
    ws = moveObject(ws, ROOT_VIEW_ID, 'A', { x: 300, y: 40 })
    expect(cardSize(rootView(ws), 'A')).toEqual(TALL)
  })

  it('gives a new card a place clear of a wider card', () => {
    const WIDE = { width: 400, height: 160 }
    const ws = arrangeView(two(), ROOT_VIEW_ID, [{ object: 'A', to: { x: 40, y: 40 }, size: WIDE }])
    const added = addObject(ws, ROOT_VIEW_ID, 'softwareSystem', 'C')
    expect(fitsOnView(added, ROOT_VIEW_ID, 'C', at(added, 'C'))).toBe(true)
    validateWorkspace(added)
  })

  it('goes with its card when the card is removed', () => {
    let ws = arrangeView(two(), ROOT_VIEW_ID, [
      { object: 'A', to: { x: 40, y: 40 }, size: TALL },
      { object: 'B', to: { x: 400, y: 40 }, size: TALL },
    ])
    ws = removeObjects(ws, ['A'])
    expect(rootView(ws).sizes).toEqual({ B: TALL })
    ws = removeObjects(ws, ['B'])
    expect(rootView(ws).sizes).toBeUndefined()
    validateWorkspace(ws)
  })

  it('survives a round trip, and a workspace saved before sizes still loads', () => {
    const ws = arrangeView(two(), ROOT_VIEW_ID, [{ object: 'A', to: { x: 40, y: 40 }, size: TALL }])
    expect(parseWorkspace(serializeWorkspace(ws))).toEqual(ws)
    const old = JSON.parse(serializeWorkspace(two()))
    expect('sizes' in old.views[0]).toBe(false)
    expect(parseWorkspace(JSON.stringify(old))).toEqual(two())
  })
})

describe('names that are also built-in object keys', () => {
  const names = ['constructor', '__proto__', 'toString']

  it('are objects like any other', () => {
    let ws = emptyWorkspace()
    for (const name of names) ws = addObject(ws, ROOT_VIEW_ID, 'person', name)
    expect(ws.model.objects.map((o) => o.name)).toEqual(names)
    expect(Object.keys(rootView(ws).positions)).toHaveLength(3)
    validateWorkspace(ws)
    expect(parseWorkspace(serializeWorkspace(ws))).toEqual(ws)
    expect(viewToDiagram(ws, ROOT_VIEW_ID).elements).toHaveLength(3)
  })

  it('are not mistaken for objects on the view', () => {
    const ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'person', 'A')
    for (const name of names) expect(connect(ws, ROOT_VIEW_ID, 'A', name)).toBe(ws)
  })
})

describe('setConnectionLabel', () => {
  it('sets and clears the label of one connection', () => {
    const labelled = setConnectionLabel(j2Workspace(), 'c1', 'Buys from')
    expect(labelled.model.connections[0]).toEqual({
      id: 'c1',
      from: 'Customer',
      to: 'OnlineShop',
      label: 'Buys from',
    })
    expect(setConnectionLabel(labelled, 'c1', '').model.connections[0]).toEqual({
      id: 'c1',
      from: 'Customer',
      to: 'OnlineShop',
    })
  })
})

describe('a table and its columns', () => {
  const COLUMNS = [
    { name: 'id', type: 'uuid', key: 'primary' as const },
    { name: 'customer_id', type: 'uuid', key: 'foreign' as const },
    { name: 'total', type: 'numeric' },
    { name: 'note' },
  ]
  const added = () => addObject(emptyWorkspace(), ROOT_VIEW_ID, 'box', 'orders', { shape: 'table', columns: COLUMNS })

  it('is a box with the shape of a table that keeps its columns in their order', () => {
    const ws = added()
    expect(ws.model.objects[0]).toEqual({ id: 'orders', kind: 'box', name: 'orders', shape: 'table', columns: COLUMNS })
    validateWorkspace(ws)
  })

  it('tidies what a form gives: no spaces around, no column without a name, nothing empty kept', () => {
    const ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'box', 'orders', {
      shape: 'table',
      columns: [
        { name: '  id ', type: ' uuid ', key: 'primary' },
        { name: '   ', type: 'text' },
        { name: 'note', type: '', key: '' },
      ],
    })
    expect(ws.model.objects[0]!.columns).toEqual([{ name: 'id', type: 'uuid', key: 'primary' }, { name: 'note' }])
  })

  it('has columns only as a table: another shape, a person or code keeps none', () => {
    expect(addObject(emptyWorkspace(), ROOT_VIEW_ID, 'box', 'orders', { shape: 'cylinder', columns: COLUMNS }).model.objects[0]).not.toHaveProperty('columns')
    expect(addObject(emptyWorkspace(), ROOT_VIEW_ID, 'person', 'Clerk', { columns: COLUMNS }).model.objects[0]).not.toHaveProperty('columns')
    // A table without columns yet is a table all the same.
    expect(addObject(emptyWorkspace(), ROOT_VIEW_ID, 'box', 'orders', { shape: 'table' }).model.objects[0]).toEqual({ id: 'orders', kind: 'box', name: 'orders', shape: 'table' })
  })

  it('changes its columns in its form, keeps them when the form does not say, and loses them with the shape', () => {
    const ws = added()
    const fewer = editObject(ws, 'orders', 'orders', { columns: [COLUMNS[0]!, { name: 'status', type: 'text' }] })
    expect(fewer.model.objects[0]!.columns).toEqual([COLUMNS[0], { name: 'status', type: 'text' }])
    expect(editObject(ws, 'orders', 'Orders').model.objects[0]).toMatchObject({ name: 'Orders', columns: COLUMNS })
    expect(editObject(ws, 'orders', 'orders', { columns: COLUMNS })).toBe(ws)
    expect(editObject(ws, 'orders', 'orders', { columns: [] }).model.objects[0]).not.toHaveProperty('columns')
    expect(editObject(ws, 'orders', 'orders', { shape: 'cylinder' }).model.objects[0]).not.toHaveProperty('columns')
    expect(editObject(ws, 'orders', 'orders', { shape: '' }).model.objects[0]).toEqual({ id: 'orders', kind: 'box', name: 'orders' })
  })

  it('is copied with its columns, and written into the diagram of the view and brought back', () => {
    const ws = added()
    const copied = copyObject(ws, ROOT_VIEW_ID, 'orders')
    expect(copied.model.objects[1]).toMatchObject({ name: 'orders copy', shape: 'table', columns: COLUMNS })
    expect(copied.model.objects[1]!.columns).not.toBe(ws.model.objects[0]!.columns)
    const diagram = viewToDiagram(ws, ROOT_VIEW_ID)
    expect(diagram.elements[0]).toMatchObject({ shape: 'table', columns: COLUMNS })
    expect(importDiagram(emptyWorkspace(), ROOT_VIEW_ID, diagram).model.objects[0]).toMatchObject({ shape: 'table', columns: COLUMNS })
  })

  it('is refused by the check of a saved workspace when its columns are no columns', () => {
    const broken = (change: (object: { columns?: unknown; shape?: string }) => void) => {
      const ws = structuredClone(added())
      change(ws.model.objects[0] as { columns?: unknown; shape?: string })
      return () => validateWorkspace(ws)
    }
    expect(broken((o) => (o.columns = [{ name: '' }]))).toThrow('column')
    expect(broken((o) => (o.columns = [{ name: 'id', key: 'main' }]))).toThrow('column')
    expect(broken((o) => (o.columns = 'id uuid'))).toThrow('column')
    expect(broken((o) => (o.shape = 'cylinder'))).toThrow('column')
  })
})

describe('setConnectionColour', () => {
  it('gives a connection one of the colours, another, and none again', () => {
    const labelled = setConnectionLabel(j2Workspace(), 'c1', 'Buys from')
    const red = setConnectionColour(labelled, 'c1', 'red')
    expect(red.model.connections[0]).toEqual({ id: 'c1', from: 'Customer', to: 'OnlineShop', label: 'Buys from', colour: 'red' })
    validateWorkspace(red)
    expect(setConnectionColour(red, 'c1', 'blue').model.connections[0]!.colour).toBe('blue')
    expect(setConnectionColour(red, 'c1', undefined).model.connections[0]).toEqual(labelled.model.connections[0])
  })

  it('returns its input when nothing changes, and for what is no colour or no connection', () => {
    const ws = setConnectionColour(j2Workspace(), 'c1', 'green')
    expect(setConnectionColour(ws, 'c1', 'green')).toBe(ws)
    expect(setConnectionColour(ws, 'nope', 'red')).toBe(ws)
    expect(setConnectionColour(ws, 'c1', 'mauve' as 'red')).toBe(ws)
    expect(setConnectionColour(j2Workspace(), 'c1', undefined)).toEqual(j2Workspace())
  })

  it('is kept by a new label, written into the diagram of the view, and brought back by an import', () => {
    const ws = setConnectionLabel(setConnectionColour(j2Workspace(), 'c1', 'teal'), 'c1', 'Buys from')
    expect(ws.model.connections[0]).toMatchObject({ label: 'Buys from', colour: 'teal' })
    const diagram = viewToDiagram(ws, ROOT_VIEW_ID)
    expect(diagram.relationships).toEqual([{ from: 'Customer', to: 'OnlineShop', label: 'Buys from', colour: 'teal' }])
    const again = importDiagram(emptyWorkspace(), ROOT_VIEW_ID, diagram)
    expect(again.model.connections[0]).toMatchObject({ label: 'Buys from', colour: 'teal' })
  })

  it('is refused by the check of a saved workspace when it is no colour of ours', () => {
    const ws = structuredClone(j2Workspace())
    ;(ws.model.connections[0] as { colour?: string }).colour = 'mauve'
    expect(() => validateWorkspace(ws)).toThrow('unknown colour')
  })
})

describe('setConnectionLabel (nothing to change)', () => {
  it('returns its input when label and technology stay as they are', () => {
    const ws = j2Workspace()
    expect(setConnectionLabel(ws, 'c1', ' Places orders in ')).toBe(ws)
    expect(setConnectionLabel(ws, 'c1', 'Places orders in', '')).toBe(ws)
    expect(setConnectionLabel(ws, 'nope', 'Buys from')).toBe(ws)
  })
})

describe('renameObject', () => {
  it('gives the object another name and keeps its id', () => {
    const ws = renameObject(j2Workspace(), 'OnlineShop', '  Web Shop ')
    expect(ws.model.objects[1]).toEqual({ id: 'OnlineShop', kind: 'softwareSystem', name: 'Web Shop' })
    validateWorkspace(ws)
  })

  it('returns its input for an empty name, the same name or an unknown object', () => {
    const ws = j2Workspace()
    expect(renameObject(ws, 'OnlineShop', '  ')).toBe(ws)
    expect(renameObject(ws, 'OnlineShop', 'Online Shop')).toBe(ws)
    expect(renameObject(ws, 'nope', 'Web Shop')).toBe(ws)
  })
})

describe('removeObjects', () => {
  it('takes an object out of the model, with its connections, from every view', () => {
    const ws = removeObjects(j2Workspace(), ['OnlineShop'])
    expect(ws.model.objects.map((o) => o.id)).toEqual(['Customer'])
    expect(ws.model.connections).toEqual([])
    expect(rootView(ws)).toMatchObject({ positions: { Customer: expect.anything() }, connections: [] })
    expect(Object.keys(rootView(ws).positions)).toEqual(['Customer'])
    validateWorkspace(ws)
  })

  it('takes everything inside the object along, and the views about them', () => {
    let ws = j2Workspace()
    ws = drillDown(ws, ROOT_VIEW_ID, 'OnlineShop')!.workspace
    ws = ensureViewInside(ws, 'OnlineShop')
    ws = addObject(ws, 'inside-OnlineShop', 'container', 'Web App')
    ws = ensureViewInside(ws, 'WebApp')
    ws = addObject(ws, 'inside-WebApp', 'component', 'Cart')
    ws = removeObjects(ws, ['OnlineShop'])
    expect(ws.model.objects.map((o) => o.id)).toEqual(['Customer'])
    expect(ws.views.map((v) => v.id)).toEqual([ROOT_VIEW_ID])
    validateWorkspace(ws)
  })

  it('returns its input when none of the objects is in the model', () => {
    const ws = j2Workspace()
    expect(removeObjects(ws, ['nope'])).toBe(ws)
    expect(removeObjects(ws, [])).toBe(ws)
  })
})

describe('openView', () => {
  it('creates the view inside an object the first time, as opening it from a diagram does', () => {
    const ws = openView(j2Workspace(), 'inside-OnlineShop')
    expect(ws).toEqual(drillDown(j2Workspace(), ROOT_VIEW_ID, 'OnlineShop')!.workspace)
    expect(breadcrumb(ws, 'inside-OnlineShop').map((entry) => entry.label)).toEqual(['Overview', 'Online Shop'])
  })

  it('brings the views on the way down to it along', () => {
    let ws = openView(j2Workspace(), 'inside-OnlineShop')
    ws = addObject(ws, 'inside-OnlineShop', 'container', 'Web App')
    // As after a reload on the address of the inner view, before anything was opened.
    const fresh = { ...ws, views: ws.views.filter((v) => v.id === ROOT_VIEW_ID) }
    const opened = openView(fresh, 'inside-WebApp')
    expect(opened.views.map((v) => v.id)).toEqual([ROOT_VIEW_ID, 'inside-OnlineShop', 'inside-WebApp'])
    validateWorkspace(opened)
  })

  it('brings a view up to date', () => {
    let ws = openView(j2Workspace(), 'inside-OnlineShop')
    ws = addObject(ws, ROOT_VIEW_ID, 'softwareSystem', 'Payments')
    ws = connect(ws, ROOT_VIEW_ID, 'OnlineShop', 'Payments', 'Charges through')
    expect(Object.keys(findViewInside(openView(ws, 'inside-OnlineShop'), 'OnlineShop')!.positions)).toContain('Payments')
  })

  it('returns its input when there is nothing to do or nothing to open', () => {
    const ws = j2Workspace()
    expect(openView(ws, ROOT_VIEW_ID)).toBe(ws)
    // An address from when a software system had a System Context diagram.
    expect(openView(ws, 'context-OnlineShop')).toBe(ws)
    expect(openView(ws, 'inside-nope')).toBe(ws)
    expect(openView(ws, 'nope')).toBe(ws)
  })
})

describe('viewToDiagram', () => {
  it('gives the objects and connections shown on the view as a Diagram', () => {
    expect(viewToDiagram(j2Workspace(), ROOT_VIEW_ID)).toEqual({
      level: 'context',
      elements: [
        { id: 'Customer', kind: 'person', name: 'Customer' },
        { id: 'OnlineShop', kind: 'softwareSystem', name: 'Online Shop' },
      ],
      relationships: [{ from: 'Customer', to: 'OnlineShop', label: 'Places orders in' }],
    })
  })

  it('throws for an unknown view', () => {
    expect(() => viewToDiagram(emptyWorkspace(), 'nope')).toThrow(DiagramFormatError)
  })
})

describe('serializeWorkspace and parseWorkspace', () => {
  const valid = () => j2Workspace()
  const broken = (change: (ws: Workspace) => void) => {
    const ws = structuredClone(valid())
    change(ws)
    return JSON.stringify(ws)
  }

  it('round trip', () => {
    expect(parseWorkspace(serializeWorkspace(valid()))).toEqual(valid())
  })

  it('reads a workspace saved before the start view became the System Landscape', () => {
    const old = JSON.parse(serializeWorkspace(j18Workspace()))
    old.views[0].id = 'context'
    old.views[0].level = 'context'
    expect(parseWorkspace(JSON.stringify(old))).toEqual(j18Workspace())
  })

  it('reads a workspace saved with C4 levels: without the levels and the System Context views', () => {
    const old = JSON.parse(serializeWorkspace(j18Workspace()))
    old.views[0].level = 'landscape'
    old.views[1].level = 'container'
    old.views.push({
      id: 'context-OnlineShop',
      level: 'context',
      scope: 'OnlineShop',
      positions: { OnlineShop: { x: 360, y: 260 }, PaymentService: { x: 40, y: 480 } },
      connections: [],
    })
    expect(parseWorkspace(JSON.stringify(old))).toEqual(j18Workspace())
  })

  it.each([
    ['not JSON', '{'],
    ['no model', '{"views":[]}'],
    ['no views', broken((ws) => (ws.views = []))],
    ['a duplicate object id', broken((ws) => ws.model.objects.push(ws.model.objects[0]!))],
    ['an invalid object id', broken((ws) => (ws.model.objects[0]!.id = '1 a'))],
    ['a parent that does not exist', broken((ws) => (ws.model.objects[0]!.parent = 'Nope'))],
    ['a connection to an unknown object', broken((ws) => (ws.model.connections[0]!.to = 'Nope'))],
    ['a duplicate connection id', broken((ws) => ws.model.connections.push(ws.model.connections[0]!))],
    ['a duplicate view id', broken((ws) => ws.views.push(ws.views[0]!))],
    ['a position for an unknown object', broken((ws) => (ws.views[0]!.positions.Nope = { x: 0, y: 0 }))],
    ['a position that is not a point', broken((ws) => (ws.views[0]!.positions.Customer = { x: '1' } as never))],
    ['a view showing an unknown connection', broken((ws) => ws.views[0]!.connections.push('c9'))],
    ['a view showing a connection without both ends', broken((ws) => delete ws.views[0]!.positions.Customer)],
    ['a scope that does not exist', broken((ws) => (ws.views[0]!.scope = 'Nope'))],
    ['an Overview that looks inside an object', broken((ws) => (ws.views[0]!.scope = 'OnlineShop'))],
    ['an object inside itself', broken((ws) => (ws.model.objects[0]!.parent = 'Customer'))],
    [
      'two objects inside each other',
      broken((ws) => {
        ws.model.objects[0]!.parent = 'OnlineShop'
        ws.model.objects[1]!.parent = 'Customer'
      }),
    ],
    ['an unknown kind', broken((ws) => (ws.model.objects[0]!.kind = 'robot' as never))],
    ['sizes that are not a record', broken((ws) => (ws.views[0]!.sizes = [] as never))],
    ['a size for an object not on the view', broken((ws) => (ws.views[0]!.sizes = { Nope: { width: 220, height: 160 } }))],
    ['a size that is not a size', broken((ws) => (ws.views[0]!.sizes = { Customer: { width: '220' } as never }))],
    ['a size of zero', broken((ws) => (ws.views[0]!.sizes = { Customer: { width: 0, height: 160 } }))],
    ['a negative size', broken((ws) => (ws.views[0]!.sizes = { Customer: { width: 220, height: -160 } }))],
    ['a size that is not finite', broken((ws) => (ws.views[0]!.sizes = { Customer: { width: 220, height: 1e999 } }))],
  ])('rejects %s', (_, text) => {
    expect(() => parseWorkspace(text)).toThrow(DiagramFormatError)
  })
})

describe('validateWorkspace', () => {
  it('takes an Overview that places an object from inside another, and a view with what is deeper in a part', () => {
    const ws = structuredClone(j18Workspace())
    ws.views[0]!.positions.WebApp = { x: 900, y: 900 }
    validateWorkspace(ws)
    let base = ensureViewInside(j18Workspace(), 'WebApp')
    base = addObject(base, 'inside-WebApp', 'component', 'Cart')
    const deeper = structuredClone(base)
    findViewInside(deeper, 'OnlineShop')!.positions.Cart = { x: 900, y: 900 }
    validateWorkspace(deeper)
  })

  it('rejects a view that places its own object or what that is inside', () => {
    let base = ensureViewInside(j18Workspace(), 'WebApp')
    base = addObject(base, 'inside-WebApp', 'component', 'Cart')
    const itself = structuredClone(base)
    findViewInside(itself, 'WebApp')!.positions.WebApp = { x: 900, y: 900 }
    expect(() => validateWorkspace(itself)).toThrow('must not show WebApp')
    const around = structuredClone(base)
    findViewInside(around, 'WebApp')!.positions.OnlineShop = { x: 900, y: 900 }
    expect(() => validateWorkspace(around)).toThrow('must not show OnlineShop')
  })

  it('takes any kind inside any kind, and a part of another object beside the frame', () => {
    let ws = ensureViewInside(j18Workspace(), 'PaymentService')
    ws = placeObject(ws, 'inside-PaymentService', 'WebApp')
    ws = addObject(ws, 'inside-PaymentService', 'person', 'Clerk')
    validateWorkspace(ws)
  })

  it('rejects a second view that looks inside nothing', () => {
    const ws = structuredClone(j2Workspace())
    ws.views.push({ id: 'other', positions: {}, connections: [] })
    expect(() => validateWorkspace(ws)).toThrow(DiagramFormatError)
  })

  it('rejects a technology on a person and an external container', () => {
    const withTechnology = structuredClone(j2Workspace())
    withTechnology.model.objects[0]!.technology = 'Human'
    expect(() => validateWorkspace(withTechnology)).toThrow(DiagramFormatError)

    const externalContainer = structuredClone(j18Workspace())
    externalContainer.model.objects.find((o) => o.id === 'WebApp')!.external = true
    expect(() => validateWorkspace(externalContainer)).toThrow(DiagramFormatError)
  })
})

describe('viewTitle', () => {
  it('is "Overview" for the start diagram and the name of the object for the view inside it', () => {
    let ws = j18Workspace()
    ws = ensureViewInside(ws, 'WebApp')
    expect(viewTitle(ws, ROOT_VIEW_ID)).toBe('Overview')
    expect(viewTitle(ws, 'inside-OnlineShop')).toBe('Online Shop')
    expect(viewTitle(ws, 'inside-WebApp')).toBe('Web App')
    expect(viewTitle(ws, 'nope')).toBe('')
  })
})

describe('what C4 asks every element and relationship to say', () => {
  it('keeps a description, a technology and whether the object is external', () => {
    let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'softwareSystem', 'Payment Provider', {
      description: ' Takes card payments. ',
      external: true,
    })
    ws = addObject(ws, ROOT_VIEW_ID, 'softwareSystem', 'Online Shop')
    ws = ensureViewInside(ws, 'OnlineShop')
    ws = addObject(ws, 'inside-OnlineShop', 'container', 'Web App', { technology: 'Vue 3', description: '' })
    expect(ws.model.objects).toEqual([
      {
        id: 'PaymentProvider',
        kind: 'softwareSystem',
        name: 'Payment Provider',
        description: 'Takes card payments.',
        external: true,
      },
      { id: 'OnlineShop', kind: 'softwareSystem', name: 'Online Shop' },
      { id: 'WebApp', kind: 'container', name: 'Web App', parent: 'OnlineShop', technology: 'Vue 3' },
    ])
  })

  it('drops what does not apply to the kind', () => {
    let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'softwareSystem', 'Online Shop', {
      technology: 'Java',
      external: false,
    })
    ws = ensureViewInside(ws, 'OnlineShop')
    ws = addObject(ws, 'inside-OnlineShop', 'container', 'Web App', { external: true })
    expect(ws.model.objects[0]).toEqual({ id: 'OnlineShop', kind: 'softwareSystem', name: 'Online Shop' })
    expect(ws.model.objects[1]).not.toHaveProperty('external')
  })

  it('keeps the technology of a relationship next to its label', () => {
    let ws = setConnectionLabel(j2Workspace(), 'c1', 'Places orders in', ' HTTPS ')
    expect(ws.model.connections[0]).toEqual({
      id: 'c1',
      from: 'Customer',
      to: 'OnlineShop',
      label: 'Places orders in',
      technology: 'HTTPS',
    })
    ws = setConnectionLabel(ws, 'c1', 'Buys from')
    expect(ws.model.connections[0]).toMatchObject({ label: 'Buys from', technology: 'HTTPS' })
    ws = setConnectionLabel(ws, 'c1', 'Buys from', '')
    expect(ws.model.connections[0]).not.toHaveProperty('technology')
  })

  it('exports them with the diagram', () => {
    let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'softwareSystem', 'Payment Provider', {
      description: 'Takes card payments.',
      external: true,
    })
    ws = addObject(ws, ROOT_VIEW_ID, 'person', 'Customer')
    ws = connect(ws, ROOT_VIEW_ID, 'Customer', 'PaymentProvider', 'Pays with')
    const diagram = viewToDiagram(ws, ROOT_VIEW_ID)
    expect(diagram.elements[0]).toEqual({
      id: 'PaymentProvider',
      kind: 'softwareSystem',
      name: 'Payment Provider',
      description: 'Takes card payments.',
      external: true,
    })
    expect(mermaidFormat.parse(mermaidFormat.serialize(diagram))).toEqual(diagram)
  })
})

// Property tests (docs/agents/verification.md): inputs are not biased by what the code expects.
describe('any sequence of edits', () => {
  type Edit = (ws: Workspace) => Workspace
  const object = (ws: Workspace, n: number) => ws.model.objects[n % (ws.model.objects.length || 1)]?.id ?? 'x'
  const view = (ws: Workspace, n: number) => ws.views[n % ws.views.length]!.id
  const kind = fc.constantFrom('person', 'softwareSystem', 'container', 'component') satisfies fc.Arbitrary<ElementKind>

  const edit: fc.Arbitrary<Edit> = fc.oneof(
    fc
      .tuple(fc.nat(), kind, fc.string(), fc.record({ description: fc.string(), technology: fc.string(), external: fc.boolean() }, { requiredKeys: [] }))
      .map(([v, k, name, details]): Edit => (ws) => addObject(ws, view(ws, v), k, name, details)),
    fc
      .tuple(fc.nat(), fc.nat(), fc.nat(), fc.option(fc.string(), { nil: undefined }))
      .map(([v, a, b, label]): Edit => (ws) => connect(ws, view(ws, v), object(ws, a), object(ws, b), label)),
    fc
      .tuple(fc.nat(), fc.string(), fc.option(fc.string(), { nil: undefined }))
      .map(([n, label, technology]): Edit => (ws) => setConnectionLabel(ws, `c${(n % 5) + 1}`, label, technology)),
    fc.nat().map((n): Edit => (ws) => ensureViewInside(ws, object(ws, n))),
    fc.tuple(fc.nat(), fc.string()).map(([n, name]): Edit => (ws) => renameObject(ws, object(ws, n), name)),
    fc.array(fc.nat(), { maxLength: 2 }).map((ns): Edit => (ws) => removeObjects(ws, ns.map((n) => object(ws, n)))),
    fc.tuple(fc.constantFrom('context', 'inside'), fc.nat()).map(([p, n]): Edit => (ws) => openView(ws, `${p}-${object(ws, n)}`)),
    fc.tuple(fc.nat(), fc.nat()).map(([v, n]): Edit => (ws) => drillDown(ws, view(ws, v), object(ws, n))?.workspace ?? ws),
    fc.nat().map((v): Edit => (ws) => syncView(ws, view(ws, v))),
    fc.tuple(fc.nat(), fc.nat()).map(([v, n]): Edit => (ws) => placeObject(ws, view(ws, v), object(ws, n))),
    fc
      .tuple(fc.nat(), fc.nat(), fc.integer({ min: -5000, max: 5000 }), fc.integer({ min: -5000, max: 5000 }))
      .map(([v, n, x, y]): Edit => (ws) => moveObject(ws, view(ws, v), object(ws, n), { x, y })),
  )
  const workspace = fc.array(edit, { maxLength: 40 }).map((edits) => edits.reduce((ws, e) => e(ws), emptyWorkspace()))

  it('gives a valid workspace that survives a round trip', () => {
    fc.assert(
      fc.property(workspace, (ws) => {
        validateWorkspace(ws)
        expect(parseWorkspace(serializeWorkspace(ws))).toEqual(ws)
      }),
    )
  })

  it('gives a valid Diagram for every view', () => {
    fc.assert(
      fc.property(workspace, (ws) => {
        for (const v of ws.views) validateDiagram(viewToDiagram(ws, v.id))
      }),
    )
  })

  it('never leaves two cards closer than the gap', () => {
    fc.assert(
      fc.property(workspace, (ws) => {
        for (const v of ws.views) {
          for (const id of Object.keys(v.positions)) {
            expect(fitsOnView(ws, v.id, id, v.positions[id]!), `${id} on ${v.id}`).toBe(true)
          }
        }
      }),
    )
  })
})

describe('viewToDiagram and Mermaid', () => {
  it('a view can be written as Mermaid and read back', () => {
    const diagram = viewToDiagram(j2Workspace(), ROOT_VIEW_ID)
    expect(mermaidFormat.parse(mermaidFormat.serialize(diagram))).toEqual(diagram)
  })
})

describe('setObjectIcons', () => {
  const shop = (ws: Workspace) => ws.model.objects.find((o) => o.id === 'OnlineShop')!

  it('gives an object its icon, another one in its place, and takes it away again', () => {
    let ws = setObjectIcons(j2Workspace(), 'OnlineShop', ['postgresql'])
    expect(shop(ws).icons).toEqual(['postgresql'])
    ws = setObjectIcons(ws, 'OnlineShop', ['aws-amazon-s3'])
    expect(shop(ws).icons).toEqual(['aws-amazon-s3'])
    validateWorkspace(ws)
    ws = setObjectIcons(ws, 'OnlineShop', [])
    expect(shop(ws)).not.toHaveProperty('icons')
    validateWorkspace(ws)
  })

  it('changes nothing when the icons are the same, the object is unknown or a name is none', () => {
    const ws = setObjectIcons(j2Workspace(), 'OnlineShop', ['postgresql'])
    expect(setObjectIcons(ws, 'OnlineShop', ['postgresql'])).toBe(ws)
    expect(setObjectIcons(ws, 'nope', ['redis'])).toBe(ws)
    expect(setObjectIcons(ws, 'OnlineShop', ['Not A Name'])).toBe(ws)
    expect(setObjectIcons(ws, 'OnlineShop', ['../secret'])).toBe(ws)
    // A card carries one icon.
    expect(setObjectIcons(ws, 'OnlineShop', ['redis', 'kafka'])).toBe(ws)
  })

  it('keeps the first icon of an object saved when a card carried several', () => {
    const saved = JSON.parse(serializeWorkspace(setObjectIcons(j2Workspace(), 'OnlineShop', ['postgresql'])))
    saved.model.objects.find((o: { id: string }) => o.id === 'OnlineShop').icons = ['postgresql', 'kafka', 'redis']
    expect(shop(parseWorkspace(JSON.stringify(saved))).icons).toEqual(['postgresql'])
  })

  it('is refused by the check of a workspace when the icons are no icon names', () => {
    const ws = setObjectIcons(j2Workspace(), 'OnlineShop', ['postgresql'])
    const broken = { ...ws, model: { ...ws.model, objects: ws.model.objects.map((o) => (o.icons ? { ...o, icons: ['<svg>'] } : o)) } }
    expect(() => validateWorkspace(broken)).toThrow('icons')
  })
})

describe('editObject', () => {
  const shop = (ws: Workspace) => ws.model.objects.find((o) => o.id === 'OnlineShop')!

  it('changes the name and the details together, and keeps what is not named', () => {
    let ws = editObject(j2Workspace(), 'OnlineShop', ' Web Shop ', { description: ' Sells books ', external: true })
    expect(shop(ws)).toEqual({ id: 'OnlineShop', kind: 'softwareSystem', name: 'Web Shop', description: 'Sells books', external: true })
    validateWorkspace(ws)
    // Only the name: the rest stays. An empty text takes a detail away.
    ws = editObject(ws, 'OnlineShop', 'Shop')
    expect(shop(ws).description).toBe('Sells books')
    ws = editObject(ws, 'OnlineShop', 'Shop', { description: '', external: false })
    expect(shop(ws)).toEqual({ id: 'OnlineShop', kind: 'softwareSystem', name: 'Shop' })
  })

  it('takes a technology only for containers and components', () => {
    const ws = editObject(j2Workspace(), 'OnlineShop', 'Online Shop', { technology: 'Vue 3' })
    expect(ws.model.objects.find((o) => o.id === 'OnlineShop')).not.toHaveProperty('technology')
  })

  it('changes nothing for the same values, an empty name or an unknown object', () => {
    const ws = j2Workspace()
    expect(editObject(ws, 'OnlineShop', 'Online Shop', { description: '' })).toBe(ws)
    expect(editObject(ws, 'OnlineShop', '  ')).toBe(ws)
    expect(editObject(ws, 'nope', 'Name')).toBe(ws)
  })
})

describe('removeConnections', () => {
  it('takes a connection out of the model and off every diagram', () => {
    const before = j2Workspace()
    const id = before.model.connections[0]!.id
    const ws = removeConnections(before, [id])
    expect(ws.model.connections).toEqual([])
    expect(ws.views.every((v) => !v.connections.includes(id))).toBe(true)
    expect(ws.model.objects).toEqual(before.model.objects)
    validateWorkspace(ws)
  })

  it('changes nothing for a connection that is not there', () => {
    const ws = j2Workspace()
    expect(removeConnections(ws, ['nope'])).toBe(ws)
  })
})

describe('the neighbours of an opened object', () => {
  /** A customer buys from the shop, the shop charges through payments; the shop has one container. */
  function shop(): Workspace {
    let ws = emptyWorkspace()
    ws = addObject(ws, ROOT_VIEW_ID, 'person', 'Customer')
    ws = addObject(ws, ROOT_VIEW_ID, 'softwareSystem', 'Online Shop')
    ws = addObject(ws, ROOT_VIEW_ID, 'softwareSystem', 'Payments')
    ws = addObject(ws, ROOT_VIEW_ID, 'softwareSystem', 'Unrelated')
    ws = connect(ws, ROOT_VIEW_ID, 'Customer', 'OnlineShop', 'Buys from')
    ws = connect(ws, ROOT_VIEW_ID, 'OnlineShop', 'Payments', 'Charges through')
    ws = openView(ws, 'inside-OnlineShop')
    return addObject(ws, 'inside-OnlineShop', 'container', 'Web App')
  }
  const inner = (ws: Workspace) => ws.views.find((v) => v.id === 'inside-OnlineShop')!

  it('puts what the object is connected to on its inner diagram, outside the frame of its cards', () => {
    const view = inner(openView(shop(), 'inside-OnlineShop'))
    expect(Object.keys(view.positions).sort()).toEqual(['Customer', 'Payments', 'WebApp'])
    const web = view.positions.WebApp!
    // Who points at the object stands above its cards, what it points at below: clear of the
    // frame, which takes 72 above the cards and 40 below.
    expect(view.positions.Customer!.y + 120).toBeLessThanOrEqual(web.y - 72)
    expect(view.positions.Payments!.y).toBeGreaterThanOrEqual(web.y + 120 + 40)
    validateWorkspace(openView(shop(), 'inside-OnlineShop'))
  })

  it('gives the first part of the object the first place of the grid, whatever stands around', () => {
    const alone = addObject(openView(addObject(emptyWorkspace(), ROOT_VIEW_ID, 'softwareSystem', 'Online Shop'), 'inside-OnlineShop'), 'inside-OnlineShop', 'container', 'Web App')
    expect(inner(shop()).positions.WebApp).toEqual(inner(alone).positions.WebApp)
  })

  it('does it on the first opening too, and leaves a neighbour where it was moved', () => {
    let ws = emptyWorkspace()
    ws = addObject(ws, ROOT_VIEW_ID, 'person', 'Customer')
    ws = addObject(ws, ROOT_VIEW_ID, 'softwareSystem', 'Online Shop')
    ws = connect(ws, ROOT_VIEW_ID, 'Customer', 'OnlineShop', 'Buys from')
    const opened = openView(ws, 'inside-OnlineShop')
    expect(Object.keys(inner(opened).positions)).toEqual(['Customer'])
    const moved = moveObject(opened, 'inside-OnlineShop', 'Customer', { x: 900, y: 900 })
    expect(inner(openView(moved, 'inside-OnlineShop')).positions.Customer).toEqual({ x: 900, y: 900 })
    // Opening twice changes nothing more.
    expect(openView(moved, 'inside-OnlineShop')).toBe(moved)
  })

  it('shows a neighbour that is a part of another object as it is, and stays valid', () => {
    let ws = shop()
    // A container of Payments calls the shop directly.
    ws = openView(ws, 'inside-Payments')
    ws = addObject(ws, 'inside-Payments', 'container', 'Ledger')
    ws = { ...ws, model: { ...ws.model, connections: [...ws.model.connections, { id: 'c9', from: 'Ledger', to: 'OnlineShop', label: 'Reports to' }] } }
    validateWorkspace(ws)
    const opened = openView(ws, 'inside-OnlineShop')
    expect(Object.keys(inner(opened).positions).sort()).toEqual(['Customer', 'Ledger', 'Payments', 'WebApp'])
    validateWorkspace(opened)
    expect(parseWorkspace(serializeWorkspace(opened))).toEqual(opened)
  })

  it('takes a saved workspace that shows a card where it may not, without that card', () => {
    const good = openView(shop(), 'inside-OnlineShop')
    // As a faulty version may have saved it: the shop as a card on the view inside the shop.
    const broken = {
      ...good,
      views: good.views.map((v) =>
        v.id === 'inside-OnlineShop' ? { ...v, positions: { ...v.positions, OnlineShop: { x: 2000, y: 2000 } } } : v,
      ),
    }
    expect(() => validateWorkspace(broken)).toThrow('must not show OnlineShop')
    expect(parseWorkspace(JSON.stringify(broken))).toEqual(good)
  })

  it('takes only what is connected to the object itself', () => {
    let ws = shop()
    ws = connect(ws, ROOT_VIEW_ID, 'Unrelated', 'Payments', 'Asks')
    expect(Object.keys(inner(openView(ws, 'inside-OnlineShop')).positions)).not.toContain('Unrelated')
  })
})

// The Basic library's plain box: a box like the others.
describe('a plain box', () => {
  it('belongs to the object whose frame it is added in, and stands only there', () => {
    let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'softwareSystem', 'Shop')
    const inside = drillDown(ws, ROOT_VIEW_ID, 'Shop')!
    ws = addObject(inside.workspace, inside.viewId, 'box', 'Notes')
    expect(ws.model.objects[1]).toEqual({ id: 'Notes', kind: 'box', name: 'Notes', parent: 'Shop' })
    expect(Object.keys(ws.views.find((v) => v.id === ROOT_VIEW_ID)!.positions)).toEqual(['Shop'])
    // Its connections count for the object it is in, a level up.
    ws = addObject(ws, inside.viewId, 'container', 'Web')
    ws = connect(ws, inside.viewId, 'Notes', 'Web', 'Describes')
    validateWorkspace(ws)
  })

  it('stands alone on the Overview, and may go beside any frame from there', () => {
    let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'box', 'Idea')
    ws = addObject(ws, ROOT_VIEW_ID, 'softwareSystem', 'Shop')
    expect(ws.model.objects[0]).toEqual({ id: 'Idea', kind: 'box', name: 'Idea' })
    const inside = drillDown(ws, ROOT_VIEW_ID, 'Shop')!
    expect(placeableObjects(inside.workspace, inside.viewId).map((o) => o.id)).toContain('Idea')
  })

  it('can be opened and hold boxes of its own, like any other', () => {
    let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'box', 'Idea')
    const inside = drillDown(ws, ROOT_VIEW_ID, 'Idea')!
    ws = addObject(inside.workspace, inside.viewId, 'softwareSystem', 'Sketch')
    expect(ws.model.objects[1]).toMatchObject({ id: 'Sketch', parent: 'Idea' })
    validateWorkspace(ws)
  })

  it('cannot be made external', () => {
    let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'box', 'Idea')
    ws = editObject(ws, 'Idea', 'Idea', { external: true })
    expect(ws.model.objects[0]).toEqual({ id: 'Idea', kind: 'box', name: 'Idea' })
  })

})

describe('a card with a size of its own', () => {
  const TALL = { width: 220, height: 260 }
  const at = (ws: Workspace, id: string) => rootView(ws).positions[id]!

  it('is added with it, where it keeps the gap to the other cards', () => {
    let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'box', 'One')
    ws = addObject(ws, ROOT_VIEW_ID, 'box', 'Notes', {}, undefined, TALL)
    expect(rootView(ws).sizes).toEqual({ Notes: TALL })
    // Wanted right below "One", where a card of the usual size would fit but the tall one would not
    // keep clear of a card further down: it goes to the usual free place instead.
    ws = addObject(ws, ROOT_VIEW_ID, 'box', 'Low', {}, { x: at(ws, 'One').x, y: at(ws, 'One').y + 400 })
    const wanted = { x: at(ws, 'One').x, y: at(ws, 'One').y + 140 }
    const usual = addObject(ws, ROOT_VIEW_ID, 'box', 'Mid', {}, wanted)
    expect(at(usual, 'Mid')).toEqual(wanted)
    const tall = addObject(ws, ROOT_VIEW_ID, 'box', 'Mid', {}, wanted, TALL)
    expect(at(tall, 'Mid')).not.toEqual(wanted)
    validateWorkspace(tall)
    // A size that is none is left out.
    expect(rootView(addObject(ws, ROOT_VIEW_ID, 'box', 'Odd', {}, undefined, { width: 0, height: 5 })).sizes).toEqual({ Notes: TALL })
  })

  it('gets another size, and place, when that keeps the gap; else it stays as it is', () => {
    let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'box', 'One')
    ws = addObject(ws, ROOT_VIEW_ID, 'box', 'Two')
    ws = moveObject(ws, ROOT_VIEW_ID, 'Two', { x: at(ws, 'One').x, y: at(ws, 'One').y + 200 })
    // 260 high, "One" would reach into "Two".
    expect(resizeCard(ws, ROOT_VIEW_ID, 'One', TALL)).toBe(ws)
    const smaller = resizeCard(ws, ROOT_VIEW_ID, 'One', { width: 220, height: 180 })
    expect(rootView(smaller).sizes).toEqual({ One: { width: 220, height: 180 } })
    // With a free place given, it moves there and grows.
    const moved = resizeCard(ws, ROOT_VIEW_ID, 'One', TALL, { x: 2000, y: 40 })
    expect(at(moved, 'One')).toEqual({ x: 2000, y: 40 })
    expect(rootView(moved).sizes).toEqual({ One: TALL })
    validateWorkspace(moved)
    // Back to the usual size: nothing is kept for it.
    expect(rootView(resizeCard(moved, ROOT_VIEW_ID, 'One', { width: 220, height: 120 }))).not.toHaveProperty('sizes')
    expect(resizeCard(moved, ROOT_VIEW_ID, 'One', TALL)).toBe(moved)
    expect(resizeCard(ws, ROOT_VIEW_ID, 'nope', TALL)).toBe(ws)
    expect(resizeCard(ws, ROOT_VIEW_ID, 'One', { width: NaN, height: 1 })).toBe(ws)
  })
})

// C4's level 4: an element of code. A box like the others; its technology says what it is and
// in which language.
describe('a code element', () => {
  it('stands anywhere, says its language and construct, and can hold others', () => {
    let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'code', 'Order', { technology: ' Go struct ', external: true, description: 'id\n---\nPlace()' })
    expect(ws.model.objects[0]).toEqual({ id: 'Order', kind: 'code', name: 'Order', technology: 'Go struct', description: 'id\n---\nPlace()' })
    const inside = drillDown(ws, ROOT_VIEW_ID, 'Order')!
    ws = addObject(inside.workspace, inside.viewId, 'code', 'Place', { technology: 'Go func' })
    expect(ws.model.objects[1]).toMatchObject({ kind: 'code', parent: 'Order', technology: 'Go func' })
    validateWorkspace(ws)
    expect(editObject(ws, 'Order', 'Order', { technology: 'Rust struct' }).model.objects[0]!.technology).toBe('Rust struct')
  })

  it('is written to D2 as it is and to Mermaid as a component, which has no code', () => {
    const ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'code', 'Order', { technology: 'Go struct' })
    const diagram = diagramOfView(ws, ROOT_VIEW_ID)
    expect(d2Format.parse(d2Format.serialize(diagram)).elements).toEqual([{ id: 'Order', kind: 'code', name: 'Order', technology: 'Go struct' }])
    expect(() => mermaidFormat.serialize(diagram)).toThrow('no code element')
    expect(mermaidFormat.serialize(writableAsMermaid(diagram))).toContain('Component(Order, "Order", "Go struct")')
  })
})

describe('a connection of a part', () => {
  /** Customer shops in the Web App of the Online Shop, and the API calls Billing; no diagram shows it yet. */
  function partsReachOut(): Workspace {
    let ws = emptyWorkspace()
    for (const name of ['Customer', 'Online Shop', 'Billing']) ws = addObject(ws, ROOT_VIEW_ID, 'softwareSystem', name)
    ws = ensureViewInside(ws, 'OnlineShop')
    ws = addObject(ws, 'inside-OnlineShop', 'container', 'Web App')
    ws = addObject(ws, 'inside-OnlineShop', 'container', 'API')
    const connections = [
      { id: 'c1', from: 'Customer', to: 'WebApp', label: 'Shops in' },
      { id: 'c2', from: 'API', to: 'Billing', label: 'Bills through' },
    ]
    return { ...ws, model: { ...ws.model, connections } }
  }

  /** What a view shows from inside its cards: from, to and the ids of the connections it stands for. */
  const lifted = (ws: Workspace, viewId: string) => liftedConnections(ws, viewId).map((l) => [l.from, l.to, l.connections.map((c) => c.id)])

  it('is drawn inside the box it is a part of, with its other end around the frame', () => {
    const ws = syncView(partsReachOut(), 'inside-OnlineShop')
    validateWorkspace(ws)
    const inside = findViewInside(ws, 'OnlineShop')!
    expect(inside.connections).toEqual(['c1', 'c2'])
    // Who points at a part stands above the frame, what a part points at below it.
    const { Customer, Billing, WebApp, API } = inside.positions
    expect(Customer!.y).toBeLessThan(Math.min(WebApp!.y, API!.y) - FRAME.top)
    expect(Billing!.y).toBeGreaterThan(Math.max(WebApp!.y, API!.y) + CARD.height + FRAME.bottom)
    expect(syncView(ws, 'inside-OnlineShop')).toBe(ws)
  })

  it('shows one level up as well, between the boxes that hold its ends', () => {
    const ws = syncView(syncView(partsReachOut(), 'inside-OnlineShop'), ROOT_VIEW_ID)
    expect(rootView(ws).connections).toEqual([])
    expect(lifted(ws, ROOT_VIEW_ID)).toEqual([
      ['Customer', 'OnlineShop', ['c1']],
      ['OnlineShop', 'Billing', ['c2']],
    ])
    // Without its label: what it says is said where it was made.
    expect(diagramOfView(ws, ROOT_VIEW_ID).relationships).toEqual([
      { from: 'Customer', to: 'OnlineShop' },
      { from: 'OnlineShop', to: 'Billing' },
    ])
  })

  it('shows once between two boxes, however many of their parts are connected, and once each way round', () => {
    let ws = syncView(partsReachOut(), 'inside-OnlineShop')
    ws = connect(ws, 'inside-OnlineShop', 'API', 'Billing', 'Asks for the tax rate')
    ws = connect(ws, 'inside-OnlineShop', 'WebApp', 'Billing', 'Shows invoices of')
    ws = connect(ws, 'inside-OnlineShop', 'Billing', 'API', 'Reports to')
    expect(lifted(ws, ROOT_VIEW_ID)).toEqual([
      ['Customer', 'OnlineShop', ['c1']],
      ['OnlineShop', 'Billing', ['c2', 'c3', 'c4']],
      ['Billing', 'OnlineShop', ['c5']],
    ])
    expect(diagramOfView(ws, ROOT_VIEW_ID).relationships).toEqual([
      { from: 'Customer', to: 'OnlineShop' },
      { from: 'OnlineShop', to: 'Billing' },
      { from: 'Billing', to: 'OnlineShop' },
    ])
    // The first one gone, the line is still there for the others.
    ws = removeConnections(ws, ['c2'])
    expect(lifted(ws, ROOT_VIEW_ID)[1]).toEqual(['OnlineShop', 'Billing', ['c3', 'c4']])
  })

  it('is not drawn a second time where the diagram above has a connection between the two boxes already', () => {
    // "Buys from" was drawn on the Overview first; "Shops in" then says inside which part it ends.
    let ws = connect(partsReachOut(), ROOT_VIEW_ID, 'Customer', 'OnlineShop', 'Buys from')
    ws = syncView(ws, ROOT_VIEW_ID)
    expect(lifted(ws, ROOT_VIEW_ID)).toEqual([['OnlineShop', 'Billing', ['c2']]])
    // The other way round is another connection.
    ws = connect(ws, ROOT_VIEW_ID, 'Billing', 'OnlineShop', 'Reports to')
    expect(lifted(ws, ROOT_VIEW_ID)).toEqual([['OnlineShop', 'Billing', ['c2']]])
  })

  it('of a part of a part shows on every diagram above, each time between the cards that hold its ends', () => {
    let ws = syncView(partsReachOut(), 'inside-OnlineShop')
    ws = ensureViewInside(ws, 'API')
    ws = addObject(ws, 'inside-API', 'component', 'Invoices')
    ws = { ...ws, model: { ...ws.model, connections: [...ws.model.connections, { id: 'c3', from: 'Invoices', to: 'Customer', label: 'Mails' }] } }
    ws = syncView(ws, 'inside-OnlineShop')
    expect(lifted(ws, 'inside-OnlineShop')).toEqual([['API', 'Customer', ['c3']]])
    expect(lifted(ws, ROOT_VIEW_ID)).toContainEqual(['OnlineShop', 'Customer', ['c3']])
    // The diagram inside the API has the connection itself, once "Customer" stands there.
    ws = syncView(ws, 'inside-API')
    expect(findViewInside(ws, 'API')!.connections).toContain('c3')
    expect(lifted(ws, 'inside-API')).toEqual([])
  })

  it('shows nowhere above when both its ends are inside the same card, or a card for an end is missing', () => {
    let ws = syncView(partsReachOut(), 'inside-OnlineShop')
    ws = connect(ws, 'inside-OnlineShop', 'WebApp', 'API', 'Calls')
    expect(lifted(ws, ROOT_VIEW_ID).flatMap(([, , ids]) => ids)).toEqual(['c1', 'c2'])
    expect(liftedConnections(ws, 'inside-OnlineShop')).toEqual([])
    expect(liftedConnections(ws, 'nope')).toEqual([])
  })

  it('lifted, runs once between two different cards of the diagram and stands for none of its own connections', () => {
    const ws = bookshopExample()
    const opened = ws.views.reduce((all, view) => syncView(all, view.id), ws)
    for (const view of opened.views) {
      const drawn = new Set(opened.model.connections.filter((c) => view.connections.includes(c.id)).map((c) => `${c.from} ${c.to}`))
      const all = liftedConnections(opened, view.id)
      expect(new Set(all.map((l) => `${l.from} ${l.to}`)).size).toBe(all.length)
      for (const { connections, from, to } of all) {
        expect(view.positions, view.id).toHaveProperty(from)
        expect(view.positions, view.id).toHaveProperty(to)
        expect(from).not.toBe(to)
        expect(connections.length).toBeGreaterThan(0)
        for (const connection of connections) expect(view.connections).not.toContain(connection.id)
        expect(drawn.has(`${from} ${to}`), `${view.id}: ${from} to ${to}`).toBe(false)
      }
    }
  })
})

describe('copyObject', () => {
  function shop(): Workspace {
    let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'softwareSystem', 'Online Shop', { description: 'Sells **books**.', external: true })
    ws = setObjectIcons(ws, 'OnlineShop', ['postgresql'])
    ws = ensureViewInside(ws, 'OnlineShop')
    ws = addObject(ws, 'inside-OnlineShop', 'container', 'API', { technology: 'Go' }, undefined, { width: 220, height: 200 })
    return addObject(ws, ROOT_VIEW_ID, 'person', 'Customer')
  }

  it('makes one more object with the kind, text, icon and card size of the first, named as its copy', () => {
    const ws = copyObject(shop(), ROOT_VIEW_ID, 'OnlineShop')
    validateWorkspace(ws)
    const [first, copy] = [ws.model.objects.find((o) => o.id === 'OnlineShop')!, ws.model.objects.at(-1)!]
    expect(copy).toEqual({ ...first, id: 'OnlineShopcopy', name: 'Online Shop copy' })
    const inside = copyObject(shop(), 'inside-OnlineShop', 'API')
    expect(inside.model.objects.at(-1)).toEqual({ id: 'APIcopy', kind: 'container', name: 'API copy', parent: 'OnlineShop', technology: 'Go' })
    expect(cardSize(findViewInside(inside, 'OnlineShop')!, 'APIcopy')).toEqual({ width: 220, height: 200 })
  })

  it('puts the copy where it is wanted when that is free, else on the next free place to the right', () => {
    const wanted = copyObject(shop(), ROOT_VIEW_ID, 'OnlineShop', { x: 40, y: 600 })
    expect(rootView(wanted).positions.OnlineShopcopy).toEqual({ x: 40, y: 600 })
    // "Customer" stands right of "Online Shop": the copy goes past it.
    const ws = copyObject(shop(), ROOT_VIEW_ID, 'OnlineShop', rootView(shop()).positions.Customer)
    const { OnlineShop, Customer, OnlineShopcopy } = rootView(ws).positions
    expect(OnlineShopcopy!.y).toBe(OnlineShop!.y)
    expect(OnlineShopcopy!.x).toBeGreaterThanOrEqual(Customer!.x + CARD.width + CARD_GAP)
    expect(fitsOnView(ws, ROOT_VIEW_ID, 'OnlineShopcopy', OnlineShopcopy!)).toBe(true)
  })

  it('copies the box alone: not its parts, its connections or the diagram inside it', () => {
    const before = connect(shop(), ROOT_VIEW_ID, 'Customer', 'OnlineShop', 'Buys from')
    const ws = copyObject(before, ROOT_VIEW_ID, 'OnlineShop')
    expect(ws.model.connections).toEqual(before.model.connections)
    expect(ws.model.objects.filter((o) => o.parent === 'OnlineShopcopy')).toEqual([])
    expect(findViewInside(ws, 'OnlineShopcopy')).toBeUndefined()
    expect(ws.views.find((v) => v.id === 'inside-OnlineShop')).toEqual(before.views.find((v) => v.id === 'inside-OnlineShop'))
  })

  it('leaves the workspace as it is for an object that is not on the view', () => {
    const ws = shop()
    expect(copyObject(ws, ROOT_VIEW_ID, 'API')).toBe(ws)
    expect(copyObject(ws, ROOT_VIEW_ID, 'Nobody')).toBe(ws)
    expect(copyObject(ws, 'nope', 'OnlineShop')).toBe(ws)
  })

  it('keeps every card apart from the others, however often a card is copied', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom('OnlineShop', 'Customer'), { minLength: 1, maxLength: 8 }), (picks) => {
        const ws = picks.reduce((made, id) => copyObject(made, ROOT_VIEW_ID, id), shop())
        validateWorkspace(ws)
        const view = rootView(ws)
        expect(Object.keys(view.positions)).toHaveLength(2 + picks.length)
        for (const id of Object.keys(view.positions)) expect(fitsOnView(ws, ROOT_VIEW_ID, id, view.positions[id]!)).toBe(true)
      }),
    )
  })
})

describe('connect, on the diagram inside a box', () => {
  /** Inside Online Shop: Web App and API; around its frame Payment Service and Customer. Cart is a part of Web App. */
  function opened(): Workspace {
    let ws = j18Workspace()
    ws = addObject(ws, ROOT_VIEW_ID, 'person', 'Customer')
    ws = placeObject(ws, 'inside-OnlineShop', 'Customer')
    ws = ensureViewInside(ws, 'WebApp')
    ws = addObject(ws, 'inside-WebApp', 'component', 'Cart')
    return placeObject(ws, 'inside-OnlineShop', 'Cart')
  }

  it('connects the parts of the box with each other and with what stands outside its frame, both ways', () => {
    for (const [from, to] of [['WebApp', 'API'], ['Customer', 'WebApp'], ['API', 'Customer'], ['Cart', 'Customer'], ['Customer', 'Cart']]) {
      const ws = connect(opened(), 'inside-OnlineShop', from!, to!)
      expect(ws.model.connections.at(-1), `${from} to ${to}`).toMatchObject({ from, to })
      expect(findViewInside(ws, 'OnlineShop')!.connections).toContain(ws.model.connections.at(-1)!.id)
    }
  })

  it('does not connect two objects that both stand outside the frame: that is said on a diagram they are on', () => {
    const ws = opened()
    expect(connect(ws, 'inside-OnlineShop', 'Customer', 'PaymentService', 'Pays')).toBe(ws)
    expect(connect(ws, 'inside-OnlineShop', 'PaymentService', 'Customer')).toBe(ws)
    expect(connectable(ws, 'inside-OnlineShop', 'Customer', 'PaymentService')).toBe(false)
    expect(connectable(ws, 'inside-OnlineShop', 'Customer', 'WebApp')).toBe(true)
    // On the Overview, where both are at home, they connect as ever.
    expect(connectable(ws, ROOT_VIEW_ID, 'Customer', 'PaymentService')).toBe(true)
    expect(connect(ws, ROOT_VIEW_ID, 'Customer', 'PaymentService', 'Pays').model.connections).toHaveLength(3)
  })

  it('says of a self link and of objects that are not on the view that they cannot be connected', () => {
    const ws = opened()
    expect(connectable(ws, ROOT_VIEW_ID, 'Customer', 'Customer')).toBe(false)
    expect(connectable(ws, ROOT_VIEW_ID, 'Customer', 'Nobody')).toBe(false)
    expect(connectable(ws, 'nope', 'Customer', 'OnlineShop')).toBe(false)
  })
})

describe('several views of one box', () => {
  /** J18's workspace: inside Online Shop "Web App" and "API", both to "Payment Service" outside. */
  const base = () => syncView(j18Workspace(), 'inside-OnlineShop')
  const names = (ws: Workspace, viewId: string) => viewsOf(ws, viewId).map((v) => [v.id, v.name])

  it('starts with the one view every box has, called "Structure"', () => {
    expect(names(base(), 'inside-OnlineShop')).toEqual([['inside-OnlineShop', 'Structure']])
    expect(names(base(), ROOT_VIEW_ID)).toEqual([[ROOT_VIEW_ID, 'Structure']])
    expect(viewsOf(base(), 'nope')).toEqual([])
  })

  it('adds a view of the same box that starts with the cards of the view it was made from', () => {
    const ws = addView(base(), 'inside-OnlineShop', ' Deployment ', true)
    validateWorkspace(ws)
    expect(names(ws, 'inside-OnlineShop')).toEqual([
      ['inside-OnlineShop', 'Structure'],
      ['view-1', 'Deployment'],
    ])
    // The same list, asked from either of them.
    expect(names(ws, 'view-1')).toEqual(names(ws, 'inside-OnlineShop'))
    const [first, added] = [findViewInside(ws, 'OnlineShop')!, ws.views.find((v) => v.id === 'view-1')!]
    expect(added).toEqual({ ...first, id: 'view-1', name: 'Deployment' })
    expect(added.positions).not.toBe(first.positions)
    expect(viewTitle(ws, 'view-1')).toBe('Online Shop: Deployment')
    expect(viewTitle(ws, 'inside-OnlineShop')).toBe('Online Shop')
    expect(parseWorkspace(serializeWorkspace(ws))).toEqual(ws)
  })

  it('adds an empty view, and nothing comes onto it by itself: not on the Overview either', () => {
    let ws = addView(base(), 'inside-OnlineShop', 'Sequence', false)
    ws = addView(ws, ROOT_VIEW_ID, 'Team map', false)
    validateWorkspace(ws)
    expect(names(ws, ROOT_VIEW_ID)).toEqual([[ROOT_VIEW_ID, 'Structure'], ['view-2', 'Team map']])
    for (const id of ['view-1', 'view-2']) {
      const opened = openView(ws, id)
      expect(opened).toBe(ws)
      expect(opened.views.find((v) => v.id === id)).toMatchObject({ positions: {}, connections: [] })
    }
    expect(viewTitle(ws, 'view-2')).toBe('Overview: Team map')
  })

  it('keeps the cards of each view where that view has them', () => {
    let ws = addView(base(), 'inside-OnlineShop', 'Deployment', true)
    ws = moveObject(ws, 'view-1', 'WebApp', { x: 900, y: 500 })
    expect(ws.views.find((v) => v.id === 'view-1')!.positions.WebApp).toEqual({ x: 900, y: 500 })
    expect(findViewInside(ws, 'OnlineShop')!.positions.WebApp).toEqual(findViewInside(base(), 'OnlineShop')!.positions.WebApp)
  })

  it('puts a new part on the view it is added on, and offers it to the other views of the box', () => {
    let ws = addView(base(), 'inside-OnlineShop', 'Deployment', true)
    ws = addObject(ws, 'view-1', 'container', 'Queue')
    expect(ws.model.objects.at(-1)).toMatchObject({ id: 'Queue', parent: 'OnlineShop' })
    expect(ws.views.find((v) => v.id === 'view-1')!.positions).toHaveProperty('Queue')
    expect(findViewInside(syncView(ws, 'inside-OnlineShop'), 'OnlineShop')!.positions).not.toHaveProperty('Queue')
    expect(placeableObjects(ws, 'inside-OnlineShop').map((o) => o.id)).toContain('Queue')
    // A connection made on one view shows on another as soon as both its ends stand there.
    ws = connect(ws, 'view-1', 'Queue', 'API', 'Feeds')
    ws = syncView(placeObject(ws, 'inside-OnlineShop', 'Queue'), 'inside-OnlineShop')
    expect(findViewInside(ws, 'OnlineShop')!.connections).toContain(ws.model.connections.at(-1)!.id)
  })

  it('opens the first view of a box when the box is opened, whatever other views it has', () => {
    const ws = addView(base(), 'inside-OnlineShop', 'Deployment', true)
    expect(drillDown(ws, ROOT_VIEW_ID, 'OnlineShop')!.viewId).toBe('inside-OnlineShop')
    expect(breadcrumb(ws, 'view-1').map((entry) => entry.viewId)).toEqual([ROOT_VIEW_ID, 'inside-OnlineShop'])
  })

  it('renames and removes a view that was added, never the first one', () => {
    let ws = addView(base(), 'inside-OnlineShop', 'Deployment', true)
    ws = renameView(ws, 'view-1', ' Production ')
    expect(names(ws, 'view-1')[1]).toEqual(['view-1', 'Production'])
    expect(renameView(ws, 'view-1', '  ')).toBe(ws)
    expect(renameView(ws, 'inside-OnlineShop', 'Main')).toBe(ws)
    expect(renameView(ws, ROOT_VIEW_ID, 'Main')).toBe(ws)
    expect(removeView(ws, 'inside-OnlineShop')).toBe(ws)
    expect(removeView(ws, ROOT_VIEW_ID)).toBe(ws)
    expect(removeView(ws, 'nope')).toBe(ws)
    const removed = removeView(ws, 'view-1')
    expect(removed).toEqual(base())
    // A later view never takes the id of one that is gone while another still has a higher one.
    const again = addView(addView(ws, 'inside-OnlineShop', 'A', false), 'inside-OnlineShop', 'B', false)
    expect(addView(removeView(again, 'view-2'), ROOT_VIEW_ID, 'C', false).views.at(-1)!.id).toBe('view-4')
  })

  it('refuses a view without a name, and one of an unknown view', () => {
    const ws = base()
    expect(addView(ws, 'inside-OnlineShop', '  ', true)).toBe(ws)
    expect(addView(ws, 'nope', 'Deployment', true)).toBe(ws)
  })

  it('goes with its box when the box is deleted', () => {
    const ws = removeObjects(addView(base(), 'inside-OnlineShop', 'Deployment', true), ['OnlineShop'])
    expect(ws.views.map((v) => v.id)).toEqual([ROOT_VIEW_ID])
    validateWorkspace(ws)
  })

  it('is refused when saved wrongly: a name that is no text, or two first views of one box', () => {
    const noName = structuredClone(addView(base(), 'inside-OnlineShop', 'Deployment', true))
    ;(noName.views[2] as { name?: unknown }).name = ''
    expect(() => validateWorkspace(noName)).toThrow('View view-1 has an invalid name')
    const twice = structuredClone(addView(base(), 'inside-OnlineShop', 'Deployment', true))
    delete twice.views[2]!.name
    expect(() => validateWorkspace(twice)).toThrow('has more than one first view')
  })
})

describe('groups of cards on a view', () => {
  /** A "Deployment" view of Online Shop with Web App, API and, outside its frame, Payment Service. */
  const deployment = () => addView(syncView(j18Workspace(), 'inside-OnlineShop'), 'inside-OnlineShop', 'Deployment', true)
  const groups = (ws: Workspace, viewId = 'view-1') => ws.views.find((v) => v.id === viewId)!.groups

  it('puts cards of a view in a frame with a name and, if said, what it is', () => {
    const ws = groupCards(deployment(), 'view-1', ['WebApp'], ' prod-appsvc-shop ', ' Deployment Node: Azure App Service ')
    validateWorkspace(ws)
    expect(groups(ws)).toEqual([{ id: 'g1', name: 'prod-appsvc-shop', type: 'Deployment Node: Azure App Service', members: ['WebApp'] }])
    // On this view only: the other views of the box know nothing of it.
    expect(groups(ws, 'inside-OnlineShop')).toBeUndefined()
    expect(parseWorkspace(serializeWorkspace(ws))).toEqual(ws)
    const second = groupCards(ws, 'view-1', ['API'], 'prod-vm')
    expect(groups(second)![1]).toEqual({ id: 'g2', name: 'prod-vm', members: ['API'] })
  })

  it('keeps a card in one group: grouped again it moves, and a group left empty is gone', () => {
    let ws = groupCards(deployment(), 'view-1', ['WebApp', 'API'], 'A')
    ws = groupCards(ws, 'view-1', ['API'], 'B')
    expect(groups(ws)).toEqual([
      { id: 'g1', name: 'A', members: ['WebApp'] },
      { id: 'g2', name: 'B', members: ['API'] },
    ])
    ws = groupCards(ws, 'view-1', ['WebApp'], 'B')
    expect(groups(ws)).toEqual([{ id: 'g2', name: 'B', members: ['API', 'WebApp'] }])
    validateWorkspace(ws)
  })

  it('adds cards to a group that is there when its name is given', () => {
    let ws = groupCards(deployment(), 'view-1', ['WebApp'], 'prod', 'Deployment Node')
    ws = groupCards(ws, 'view-1', ['API', 'WebApp'], 'prod')
    expect(groups(ws)).toEqual([{ id: 'g1', name: 'prod', type: 'Deployment Node', members: ['WebApp', 'API'] }])
  })

  it('takes cards out of their groups, and the frame with its last card', () => {
    let ws = groupCards(deployment(), 'view-1', ['WebApp', 'API'], 'prod')
    ws = ungroupCards(ws, 'view-1', ['API', 'PaymentService'])
    expect(groups(ws)).toEqual([{ id: 'g1', name: 'prod', members: ['WebApp'] }])
    ws = ungroupCards(ws, 'view-1', ['WebApp'])
    expect(ws).toEqual(deployment())
    expect(ungroupCards(ws, 'view-1', ['WebApp'])).toBe(ws)
  })

  it('renames a group, says what it is or no longer says it, and removes it with its cards left standing', () => {
    let ws = groupCards(deployment(), 'view-1', ['WebApp'], 'prod', 'Deployment Node')
    ws = editGroup(ws, 'view-1', 'g1', ' production ', '')
    expect(groups(ws)).toEqual([{ id: 'g1', name: 'production', members: ['WebApp'] }])
    expect(editGroup(ws, 'view-1', 'g1', 'production', '')).toBe(ws)
    expect(editGroup(ws, 'view-1', 'g1', '  ', 'x')).toBe(ws)
    expect(editGroup(ws, 'view-1', 'nope', 'x', '')).toBe(ws)
    const removed = removeGroup(ws, 'view-1', 'g1')
    expect(removed).toEqual(deployment())
    expect(removeGroup(removed, 'view-1', 'g1')).toBe(removed)
  })

  it('refuses a group without a name or without a card of the view', () => {
    const ws = deployment()
    expect(groupCards(ws, 'view-1', ['WebApp'], '  ')).toBe(ws)
    expect(groupCards(ws, 'view-1', ['Nobody'], 'prod')).toBe(ws)
    expect(groupCards(ws, 'view-1', [], 'prod')).toBe(ws)
    expect(groupCards(ws, 'nope', ['WebApp'], 'prod')).toBe(ws)
  })

  it('loses a card that is deleted, and comes along when its view is copied', () => {
    let ws = groupCards(deployment(), 'view-1', ['WebApp', 'API'], 'prod')
    const copied = addView(ws, 'view-1', 'Staging', true)
    expect(groups(copied, 'view-2')).toEqual(groups(copied))
    expect(groups(copied, 'view-2')).not.toBe(groups(copied))
    ws = removeObjects(ws, ['API'])
    expect(groups(ws)).toEqual([{ id: 'g1', name: 'prod', members: ['WebApp'] }])
    ws = removeObjects(ws, ['WebApp'])
    expect(groups(ws)).toBeUndefined()
    validateWorkspace(ws)
  })

  it('is refused when saved wrongly', () => {
    const wrong = (change: (group: { id: string; name: unknown; members: string[] }, all: unknown[]) => void) => {
      const ws = structuredClone(groupCards(groupCards(deployment(), 'view-1', ['WebApp'], 'A'), 'view-1', ['API'], 'B'))
      const all = ws.views.find((v) => v.id === 'view-1')!.groups!
      change(all[0]!, all)
      return () => validateWorkspace(ws)
    }
    expect(wrong((group) => (group.name = ''))).toThrow('has a group without a name')
    expect(wrong((group) => (group.members = []))).toThrow('has a group without cards')
    expect(wrong((group) => group.members.push('Nobody'))).toThrow('groups a card it does not show: Nobody')
    expect(wrong((group) => group.members.push('API'))).toThrow('has API in two groups')
    expect(wrong((group) => (group.id = 'g2'))).toThrow('has two groups with the id g2')
  })

  it('keeps every card in one group at most, whatever is grouped and ungrouped', () => {
    const cards = ['WebApp', 'API', 'PaymentService']
    const step = fc.oneof(
      fc.record({ group: fc.subarray(cards, { minLength: 1 }), name: fc.constantFrom('A', 'B', 'C') }),
      fc.record({ ungroup: fc.subarray(cards, { minLength: 1 }) }),
    )
    fc.assert(
      fc.property(fc.array(step, { maxLength: 12 }), (steps) => {
        let ws = deployment()
        for (const s of steps) ws = 'group' in s ? groupCards(ws, 'view-1', s.group, s.name) : ungroupCards(ws, 'view-1', s.ungroup)
        validateWorkspace(ws)
        const members = (groups(ws) ?? []).flatMap((group) => group.members)
        expect(new Set(members).size).toBe(members.length)
      }),
    )
  })
})

describe('the frame of a group and the cards that are not in it', () => {
  /** Shop, Stock and Mail in a row, a hundred apart; Shop and Stock in the frame "app". */
  const row = (): View => ({
    id: 'v',
    positions: { Shop: { x: 0, y: 0 }, Stock: { x: 320, y: 0 }, Mail: { x: 640, y: 0 } },
    connections: [],
    groups: [{ id: 'g1', name: 'app', members: ['Shop', 'Stock'] }],
  })

  it('refuses a card of the frame where the frame would run over a card outside it', () => {
    // Stock under Mail: Stock keeps its gap to Mail, the frame from Shop to Stock does not.
    expect(groupFramesStayClear(row(), { Stock: { x: 640, y: 200 } })).toBe(false)
    expect(groupFramesStayClear(row(), { Stock: { x: 320, y: 200 } })).toBe(true)
  })

  it('refuses a card outside the frame where it would stand in it or too near', () => {
    // Under Shop, with the frame reaching down to Stock: Mail would stand in it.
    const deep: View = { ...row(), positions: { ...row().positions, Stock: { x: 320, y: 300 } } }
    expect(groupFramesStayClear(deep, { Mail: { x: 0, y: 160 } })).toBe(false)
    // Beside the frame, but nearer than the gap between cards.
    const right = 320 + CARD.width + GROUP_FRAME.side
    expect(groupFramesStayClear(row(), { Mail: { x: right + CARD_GAP - 10, y: 0 } })).toBe(false)
    expect(groupFramesStayClear(row(), { Mail: { x: right + CARD_GAP, y: 0 } })).toBe(true)
  })

  it('refuses a card of the frame made so large that the frame runs over a card outside it', () => {
    expect(groupFramesStayClear(row(), { Stock: { x: 320, y: 0, width: 300, height: CARD.height } })).toBe(false)
    expect(groupFramesStayClear(row(), { Stock: { x: 320, y: 0, width: CARD.width, height: 300 } })).toBe(true)
  })

  it('takes cards that move together where they all are then: a whole frame moved over a card outside it is refused', () => {
    expect(groupFramesStayClear(row(), { Shop: { x: 0, y: 200 }, Stock: { x: 320, y: 200 } })).toBe(true)
    expect(groupFramesStayClear(row(), { Shop: { x: 320, y: 100 }, Stock: { x: 640, y: 100 } })).toBe(false)
    // The card outside goes along: nothing changes between them.
    expect(groupFramesStayClear(row(), { Shop: { x: 320, y: 100 }, Stock: { x: 640, y: 100 }, Mail: { x: 960, y: 100 } })).toBe(true)
  })

  it('lets a card that stood in a frame before stay there: the cards of that frame still move', () => {
    // A frame around Shop and Mail, with Stock between them.
    const wide: View = { ...row(), groups: [{ id: 'g1', name: 'app', members: ['Shop', 'Mail'] }] }
    expect(groupFramesStayClear(wide, {})).toBe(true)
    expect(groupFramesStayClear(wide, { Shop: { x: 0, y: 40 } })).toBe(true)
    // But no card comes in that was clear of it.
    const more: View = { ...wide, positions: { ...wide.positions, Files: { x: 0, y: 400 } } }
    expect(groupFramesStayClear(more, { Shop: { x: 0, y: 300 } })).toBe(false)
  })

  it('holds with no groups, and for cards the view does not have', () => {
    const { groups: _none, ...plain } = row()
    expect(groupFramesStayClear(plain, { Stock: { x: 640, y: 200 } })).toBe(true)
    expect(groupFramesStayClear(row(), { Nobody: { x: 640, y: 200 } })).toBe(true)
  })

  it('never lets a frame that was clear come near a card outside it (property)', () => {
    const onGrid = fc.integer({ min: -40, max: 60 }).map((n) => n * 20)
    fc.assert(
      fc.property(fc.constantFrom('Shop', 'Stock', 'Mail'), fc.record({ x: onGrid, y: onGrid }), (card, to) => {
        const view = row()
        if (!groupFramesStayClear(view, { [card]: to })) return
        const positions: Record<string, { x: number; y: number }> = { ...view.positions, [card]: to }
        const members = [positions.Shop!, positions.Stock!]
        const left = Math.min(...members.map((p) => p.x)) - GROUP_FRAME.side
        const top = Math.min(...members.map((p) => p.y)) - GROUP_FRAME.top
        const right = Math.max(...members.map((p) => p.x + CARD.width)) + GROUP_FRAME.side
        const bottom = Math.max(...members.map((p) => p.y + CARD.height)) + GROUP_FRAME.bottom
        const mail = positions.Mail!
        expect(
          mail.x >= right + CARD_GAP ||
            mail.x + CARD.width + CARD_GAP <= left ||
            mail.y >= bottom + CARD_GAP ||
            mail.y + CARD.height + CARD_GAP <= top,
        ).toBe(true)
      }),
    )
  })
})

describe('groups on the view inside a box', () => {
  /** The first view of Online Shop: Web App and API inside its frame, Payment Service outside. */
  const inside = () => syncView(j18Workspace(), 'inside-OnlineShop')
  const groups = (ws: Workspace) => findViewInside(ws, 'OnlineShop')!.groups

  it('take the cards inside the box only: what stands outside its frame is left out', () => {
    const ws = groupCards(inside(), 'inside-OnlineShop', ['WebApp', 'PaymentService'], 'prod')
    expect(groups(ws)).toEqual([{ id: 'g1', name: 'prod', members: ['WebApp'] }])
    const none = inside()
    expect(groupCards(none, 'inside-OnlineShop', ['PaymentService'], 'prod')).toBe(none)
    validateWorkspace(ws)
  })

  it('can be asked which cards of a view may be grouped', () => {
    expect(groupable(inside(), 'inside-OnlineShop', ['WebApp', 'PaymentService', 'Nobody'])).toEqual(['WebApp'])
    // On the Overview every card of it.
    expect(groupable(inside(), ROOT_VIEW_ID, ['OnlineShop', 'PaymentService'])).toEqual(['OnlineShop', 'PaymentService'])
    expect(groupable(inside(), 'nope', ['WebApp'])).toEqual([])
  })

  it('saved with a card from outside the box are taken without it, a frame of such cards only not at all', () => {
    const saved = JSON.parse(serializeWorkspace(groupCards(inside(), 'inside-OnlineShop', ['WebApp'], 'prod')))
    saved.views[1].groups[0].members.push('PaymentService')
    saved.views[1].groups.push({ id: 'g2', name: 'outside', members: ['PaymentService'] })
    expect(() => validateWorkspace(saved)).toThrow('groups a card from outside its box: PaymentService')
    // PaymentService in two groups is mended as well: it is in none afterwards.
    const loaded = parseWorkspace(JSON.stringify(saved))
    expect(groups(loaded)).toEqual([{ id: 'g1', name: 'prod', members: ['WebApp'] }])
  })
})

describe('the shape of a box', () => {
  const db = () => addObject(emptyWorkspace(), ROOT_VIEW_ID, 'container', 'Orders DB', { technology: 'PostgreSQL', shape: 'cylinder' })

  it('is said when the box is added, and kept with it: a container that is a database is a cylinder', () => {
    const ws = db()
    validateWorkspace(ws)
    expect(ws.model.objects[0]).toEqual({ id: 'OrdersDB', kind: 'container', name: 'Orders DB', technology: 'PostgreSQL', shape: 'cylinder' })
    expect(parseWorkspace(serializeWorkspace(ws))).toEqual(ws)
    // A plain box says nothing of its shape.
    expect(addObject(emptyWorkspace(), ROOT_VIEW_ID, 'box', 'Idea').model.objects[0]).not.toHaveProperty('shape')
    expect(addObject(emptyWorkspace(), ROOT_VIEW_ID, 'box', 'Idea', { shape: '' }).model.objects[0]).not.toHaveProperty('shape')
  })

  it('is changed in the form, left as it is when the form says nothing, and taken away with an empty one', () => {
    let ws = editObject(db(), 'OrdersDB', 'Orders DB', { shape: 'queue' })
    expect(ws.model.objects[0]!.shape).toBe('queue')
    expect(editObject(ws, 'OrdersDB', 'Orders DB', { shape: 'queue' })).toBe(ws)
    expect(editObject(ws, 'OrdersDB', 'Orders', { description: 'Holds orders.' }).model.objects[0]!.shape).toBe('queue')
    ws = editObject(ws, 'OrdersDB', 'Orders DB', { shape: '' })
    expect(ws.model.objects[0]).not.toHaveProperty('shape')
  })

  it('is one of the shapes there are, and not for a person or a piece of code, which have their own', () => {
    expect(BOX_SHAPES).toEqual(expect.arrayContaining(['cylinder', 'queue', 'document', 'hexagon', 'diamond', 'circle', 'stadium', 'parallelogram', 'cloud', 'subroutine']))
    const made = (kind: ElementKind, shape: string) => addObject(emptyWorkspace(), ROOT_VIEW_ID, kind, 'X', { shape: shape as never }).model.objects[0]!
    expect(made('box', 'heart')).not.toHaveProperty('shape')
    expect(made('person', 'cylinder')).not.toHaveProperty('shape')
    expect(made('code', 'cylinder')).not.toHaveProperty('shape')
    for (const kind of ['box', 'softwareSystem', 'container', 'component'] as const) expect(made(kind, 'hexagon').shape).toBe('hexagon')
    expect(editObject(db(), 'OrdersDB', 'Orders DB', { shape: 'heart' as never }).model.objects[0]!.shape).toBe('cylinder')
  })

  it('goes with a copy of the box, and with the box into a text format and back', () => {
    const ws = copyObject(db(), ROOT_VIEW_ID, 'OrdersDB')
    expect(ws.model.objects[1]!.shape).toBe('cylinder')
    const diagram = diagramOfView(db(), ROOT_VIEW_ID)
    expect(diagram.elements[0]).toMatchObject({ shape: 'cylinder' })
    const back = importDiagram(emptyWorkspace(), ROOT_VIEW_ID, diagram)
    expect(back.model.objects[0]).toMatchObject({ kind: 'container', shape: 'cylinder' })
  })

  it('is refused when saved wrongly', () => {
    const unknown = structuredClone(db())
    ;(unknown.model.objects[0] as { shape: string }).shape = 'heart'
    expect(() => validateWorkspace(unknown)).toThrow('has an unknown shape: heart')
    const person = structuredClone(addObject(emptyWorkspace(), ROOT_VIEW_ID, 'person', 'Customer'))
    ;(person.model.objects[0] as { shape?: string }).shape = 'cylinder'
    expect(() => validateWorkspace(person)).toThrow('A person has no shape of its own to choose')
  })
})
