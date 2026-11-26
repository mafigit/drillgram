import { describe, it, expect } from 'vitest'
import { CONTRACT_DIAGRAMS } from '../contract'
import { applyEvent, describeEvent } from '../events'
import { bookshopExample } from '../examples'
import { mermaidFormat } from '../mermaid'
import {
  ROOT_VIEW_ID,
  addObject,
  diagramOfView,
  drillDown,
  emptyWorkspace,
  findViewInside,
  importDiagram,
  openView,
  validateWorkspace,
} from '../workspace'
import type { Workspace } from '../workspace'

const J2 = CONTRACT_DIAGRAMS[0]!
const FRAMED = CONTRACT_DIAGRAMS[3]!
const view = (ws: Workspace, id: string) => ws.views.find((v) => v.id === id)!
const names = (ws: Workspace, id: string) =>
  Object.keys(view(ws, id).positions).map((o) => ws.model.objects.find((x) => x.id === o)!.name)

describe('importDiagram', () => {
  it('puts people and systems on the open diagram, where they are wanted, with their connections', () => {
    const ws = importDiagram(emptyWorkspace(), ROOT_VIEW_ID, J2, { customer: { x: 400, y: 300 } })
    validateWorkspace(ws)
    expect(names(ws, ROOT_VIEW_ID)).toEqual(['Customer', 'Online Shop'])
    expect(view(ws, ROOT_VIEW_ID).positions.Customer).toEqual({ x: 400, y: 300 })
    expect(ws.model.connections).toEqual([{ id: 'c1', from: 'Customer', to: 'OnlineShop', label: 'Places orders in' }])
    expect(view(ws, ROOT_VIEW_ID).connections).toEqual(['c1'])
  })

  it('names new objects after the file, beside what has the same name already', () => {
    const once = importDiagram(emptyWorkspace(), ROOT_VIEW_ID, J2)
    const twice = importDiagram(once, ROOT_VIEW_ID, J2)
    validateWorkspace(twice)
    expect(twice.model.objects.map((o) => o.id)).toEqual(['Customer', 'OnlineShop', 'Customer2', 'OnlineShop2'])
    expect(twice.model.connections.map((c) => [c.id, c.from, c.to])).toEqual([
      ['c1', 'Customer', 'OnlineShop'],
      ['c2', 'Customer2', 'OnlineShop2'],
    ])
  })

  it('makes a new system of the boundary, with its containers on its own diagram', () => {
    const ws = importDiagram(emptyWorkspace(), ROOT_VIEW_ID, FRAMED)
    validateWorkspace(ws)
    expect(names(ws, ROOT_VIEW_ID)).toEqual(['Online Shop', 'Customer', 'Mail Service'])
    const inside = findViewInside(ws, 'OnlineShop')!
    expect(names(ws, inside.id)).toEqual(['Web App', 'API'])
    expect(ws.model.objects.find((o) => o.name === 'API')).toMatchObject({ parent: 'OnlineShop', technology: 'Go', description: 'Takes orders' })
    // The connections of the containers are made inside the system, and show one level up too.
    const shown = diagramOfView(openView(ws, ROOT_VIEW_ID), ROOT_VIEW_ID)
    expect(shown.relationships).toContainEqual({ from: 'Customer', to: 'OnlineShop' })
    expect(diagramOfView(ws, inside.id).relationships).toContainEqual({ from: 'WebApp', to: 'API', label: 'Calls', technology: 'HTTPS' })
  })

  it("takes the open diagram's object as the boundary of the same kind", () => {
    let ws = addObject(emptyWorkspace(), ROOT_VIEW_ID, 'softwareSystem', 'Shop')
    const context = drillDown(ws, ROOT_VIEW_ID, 'Shop')!
    const inside = drillDown(context.workspace, context.viewId, 'Shop')!
    ws = importDiagram(inside.workspace, inside.viewId, FRAMED)
    validateWorkspace(ws)
    expect(ws.model.objects.filter((o) => o.parent === 'Shop').map((o) => o.name)).toEqual(['Web App', 'API'])
    expect(names(ws, inside.viewId)).toEqual(expect.arrayContaining(['Customer', 'Web App', 'API', 'Mail Service']))
    expect(ws.model.objects.some((o) => o.name === 'Online Shop')).toBe(false)
  })

  it('takes containers anywhere, on the Overview too: no kind needs something to live in', () => {
    const containers = CONTRACT_DIAGRAMS[1]!
    const ws = importDiagram(emptyWorkspace(), ROOT_VIEW_ID, containers)
    validateWorkspace(ws)
    expect(names(ws, ROOT_VIEW_ID)).toEqual(['Customer', 'API', 'Database', 'Payment Provider'])
    expect(ws.model.objects.every((o) => o.parent === undefined)).toBe(true)
  })

  it('takes back what diagramOfView gave: every diagram of the bookshop', () => {
    const shop = bookshopExample()
    const landscape = diagramOfView(openView(shop, ROOT_VIEW_ID), ROOT_VIEW_ID)
    const ws = importDiagram(emptyWorkspace(), ROOT_VIEW_ID, mermaidFormat.parse(mermaidFormat.serialize(landscape)))
    validateWorkspace(ws)
    const again = diagramOfView(openView(ws, ROOT_VIEW_ID), ROOT_VIEW_ID)
    expect(again.elements.map((e) => e.name).sort()).toEqual(landscape.elements.map((e) => e.name).sort())
    expect(again.relationships).toHaveLength(landscape.relationships.length)
  })

  it('is one change of the log, said in words', () => {
    const event = { type: 'diagramImported', view: ROOT_VIEW_ID, diagram: J2 } as const
    const after = applyEvent(emptyWorkspace(), event)
    expect(after.model.objects).toHaveLength(2)
    expect(describeEvent(emptyWorkspace(), event)).toBe('Imported 2 objects')
  })
})
