import { describe, it, expect } from 'vitest'
import { d2Format } from '../d2'
import { bookshopExample } from '../examples'
import { mermaidFormat, writableAsMermaid } from '../mermaid'
import { validateDiagram } from '../model'
import {
  ROOT_VIEW_ID,
  addObject,
  connect,
  diagramOfView,
  drillDown,
  emptyWorkspace,
  findViewInside,
  openView,
  viewTitle,
} from '../workspace'
import type { Workspace } from '../workspace'

/** The workspace as the editor shows a view: opened. */
const opened = (ws: Workspace, viewId: string) => openView(ws, viewId)

describe('diagramOfView', () => {
  const ws = bookshopExample()

  it('gives every diagram of the bookshop as a valid diagram that Mermaid and D2 write and read back', () => {
    for (const view of ws.views) {
      const shown = opened(ws, view.id)
      const diagram = diagramOfView(shown, view.id)
      validateDiagram(diagram)
      expect(diagram.title).toBe(viewTitle(shown, view.id))
      expect(d2Format.parse(d2Format.serialize(diagram))).toEqual(diagram)
      const mermaid = writableAsMermaid(diagram)
      expect(mermaidFormat.parse(mermaidFormat.serialize(mermaid))).toEqual(mermaid)
    }
  })

  it('writes what is connected inside the boxes of the diagram as connections between the boxes', () => {
    const diagram = diagramOfView(ws, ROOT_VIEW_ID)
    // The customer shops in two containers of the Web Shop: one line, and no label one level up.
    expect(diagram.relationships.filter((r) => r.from === 'Customer' && r.to === 'WebShop')).toEqual([{ from: 'Customer', to: 'WebShop' }])
    expect(diagram.elements.some((e) => 'icons' in e || 'parent' in e)).toBe(false)
  })

  it('draws the object of a Container diagram as the boundary around its containers', () => {
    const view = findViewInside(ws, 'WebShop')!
    const shown = opened(ws, view.id)
    const diagram = diagramOfView(shown, view.id)
    const containers = shown.model.objects.filter((o) => o.parent === 'WebShop').map((o) => o.id)
    expect(diagram.boundary).toMatchObject({ id: 'WebShop', kind: 'softwareSystem', name: 'Web Shop' })
    expect([...diagram.boundary!.members].sort()).toEqual([...containers].sort())
    // Its neighbours stand outside the frame.
    expect(diagram.elements.filter((e) => !diagram.boundary!.members.includes(e.id)).length).toBeGreaterThan(0)
  })

  it("runs the opened object's own connections to the boundary, unless a card inside has one", () => {
    let w = emptyWorkspace()
    w = addObject(w, ROOT_VIEW_ID, 'person', 'Customer')
    w = addObject(w, ROOT_VIEW_ID, 'softwareSystem', 'Shop')
    w = addObject(w, ROOT_VIEW_ID, 'softwareSystem', 'Mail')
    w = connect(w, ROOT_VIEW_ID, 'Customer', 'Shop', 'Buys from')
    w = connect(w, ROOT_VIEW_ID, 'Shop', 'Mail', 'Sends e-mail with')
    const inside = drillDown(drillDown(w, ROOT_VIEW_ID, 'Shop')!.workspace, drillDown(w, ROOT_VIEW_ID, 'Shop')!.viewId, 'Shop')!
    let shop = inside.workspace
    shop = addObject(shop, inside.viewId, 'container', 'Web')
    shop = addObject(shop, inside.viewId, 'container', 'Mailer')
    shop = connect(shop, inside.viewId, 'Mailer', 'Mail', 'Sends with')
    const diagram = diagramOfView(openView(shop, inside.viewId), inside.viewId)
    expect(diagram.boundary).toEqual({ id: 'Shop', kind: 'softwareSystem', name: 'Shop', members: ['Web', 'Mailer'] })
    expect(diagram.relationships).toContainEqual({ from: 'Customer', to: 'Shop', label: 'Buys from' })
    expect(diagram.relationships).toContainEqual({ from: 'Mailer', to: 'Mail', label: 'Sends with' })
    expect(diagram.relationships).not.toContainEqual({ from: 'Shop', to: 'Mail', label: 'Sends e-mail with' })
  })

  it('makes ids that differ only in case unique, as D2 reads them', () => {
    let w = emptyWorkspace()
    w = addObject(w, ROOT_VIEW_ID, 'softwareSystem', 'Shop')
    w = addObject(w, ROOT_VIEW_ID, 'softwareSystem', 'shop')
    w = connect(w, ROOT_VIEW_ID, 'Shop', 'shop', 'Copies')
    const diagram = diagramOfView(w, ROOT_VIEW_ID)
    expect(diagram.elements.map((e) => e.id)).toEqual(['Shop', 'shop2'])
    expect(diagram.relationships).toEqual([{ from: 'Shop', to: 'shop2', label: 'Copies' }])
    expect(d2Format.parse(d2Format.serialize(diagram))).toEqual(diagram)
  })
})
