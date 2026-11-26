import { describe, it, expect } from 'vitest'
import { bookshopExample } from '../examples'
import { mermaidFormat } from '../mermaid'
import { validateDiagram } from '../model'
import {
  CARD,
  FRAME,
  ROOT_VIEW_ID,
  liftedConnections,
  drillDown,
  findViewInside,
  syncView,
  validateWorkspace,
  viewToDiagram,
} from '../workspace'
import type { Workspace } from '../workspace'

const kinds = (ws: Workspace) =>
  Object.fromEntries(
    (['person', 'softwareSystem', 'container', 'component'] as const).map((kind) => [
      kind,
      ws.model.objects.filter((o) => o.kind === kind).length,
    ]),
  )

describe('bookshopExample', () => {
  const ws = bookshopExample()

  it('is a valid workspace and the same every time', () => {
    validateWorkspace(ws)
    expect(bookshopExample()).toEqual(ws)
  })

  it('is big enough to be a real test of the editor', () => {
    expect(kinds(ws)).toEqual({ person: 5, softwareSystem: 17, container: 10, component: 4 })
    expect(ws.model.connections.length).toBeGreaterThanOrEqual(35)
    expect(ws.model.objects.filter((o) => o.external)).toHaveLength(7)
  })

  it('follows what c4model.com asks of elements and relationships', () => {
    for (const object of ws.model.objects) {
      expect(object.description, object.name).toBeTruthy()
      if (object.kind === 'container' || object.kind === 'component') {
        expect(object.technology, object.name).toBeTruthy()
      }
    }
    for (const connection of ws.model.connections) {
      expect(connection.label, connection.id).toBeTruthy()
      expect(connection.label).not.toBe('Uses')
    }
  })

  it('shows every person and software system on the landscape, each in its own place', () => {
    const landscape = ws.views.find((v) => v.id === ROOT_VIEW_ID)!
    expect(Object.keys(landscape.positions)).toHaveLength(22)
    expect(syncView(ws, ROOT_VIEW_ID)).toBe(ws)
    const places = Object.values(landscape.positions).map((p) => `${p.x},${p.y}`)
    expect(new Set(places).size).toBe(places.length)
  })

  it('has diagrams inside two systems and one container, and each exports as Mermaid', () => {
    expect(findViewInside(ws, 'WebShop')).toMatchObject({ scope: 'WebShop' })
    expect(findViewInside(ws, 'OrderManagement')).toMatchObject({ scope: 'OrderManagement' })
    expect(findViewInside(ws, 'ShopAPI')).toMatchObject({ scope: 'ShopAPI' })
    for (const view of ws.views) {
      const diagram = viewToDiagram(ws, view.id)
      validateDiagram(diagram)
      expect(mermaidFormat.parse(mermaidFormat.serialize(diagram))).toEqual(diagram)
    }
  })

  it('shows on the Overview what the Web Shop reaches through its parts', () => {
    const fromShop = liftedConnections(ws, ROOT_VIEW_ID).filter((l) => l.from === 'WebShop')
    expect([...new Set(fromShop.map((l) => l.to))].sort()).toEqual(['CustomerAccounts', 'OrderManagement', 'Payments'])
  })

  it('stays a valid workspace when every diagram is opened, and each then draws every connection of its parts', () => {
    const opened = ws.views.reduce((all, view) => syncView(all, view.id), ws)
    validateWorkspace(opened)
    for (const view of opened.views.filter((v) => v.scope !== undefined)) {
      const parts = new Set(opened.model.objects.filter((o) => o.parent === view.scope).map((o) => o.id))
      const inner = new Set(opened.model.objects.filter((o) => o.parent !== undefined && parts.has(o.parent)).map((o) => o.id))
      const theirs = opened.model.connections.filter((c) => (parts.has(c.from) && !inner.has(c.to)) || (parts.has(c.to) && !inner.has(c.from)))
      expect(view.connections, view.id).toEqual(expect.arrayContaining(theirs.map((c) => c.id)))
    }
  })

  it('stands every card from elsewhere clear of the frame inside a box', () => {
    const objects = new Map(ws.model.objects.map((o) => [o.id, o]))
    const within = (id: string, scope: string) => {
      for (let at = objects.get(id)?.parent; at !== undefined; at = objects.get(at)?.parent) if (at === scope) return true
      return false
    }
    for (const view of ws.views.filter((v) => v.scope !== undefined)) {
      const box = (id: string) => ({ ...view.positions[id]!, ...(view.sizes?.[id] ?? CARD) })
      const ids = Object.keys(view.positions)
      const inside = ids.filter((id) => within(id, view.scope!)).map(box)
      const frame = {
        left: Math.min(...inside.map((c) => c.x)) - FRAME.side,
        top: Math.min(...inside.map((c) => c.y)) - FRAME.top,
        right: Math.max(...inside.map((c) => c.x + c.width)) + FRAME.side,
        bottom: Math.max(...inside.map((c) => c.y + c.height)) + FRAME.bottom,
      }
      for (const id of ids.filter((id) => !within(id, view.scope!))) {
        const c = box(id)
        const clear = c.x + c.width <= frame.left || c.x >= frame.right || c.y + c.height <= frame.top || c.y >= frame.bottom
        expect(clear, `${objects.get(id)?.name} on the frame of ${objects.get(view.scope!)?.name}`).toBe(true)
      }
    }
  })
})
