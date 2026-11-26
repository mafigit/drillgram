import { test, expect } from './fixtures.ts'
import type { DiagramEditor } from './pages/editor.ts'

// J48 Add any existing object: docs/journeys.md#j48-add-any-existing-object

/** Open the list of existing objects and give what it offers: each place with the objects under it, name and kind. */
async function offered(editor: DiagramEditor): Promise<Record<string, string[]>> {
  await editor.page.getByRole('button', { name: 'Add existing object' }).click()
  const list = editor.page.getByRole('listbox', { name: 'Existing objects' })
  await expect(list.getByRole('option').first()).toBeVisible()
  const places: Record<string, string[]> = {}
  for (const group of await list.getByRole('group').all()) {
    const heading = await group.locator('[data-slot="command-group-heading"]').innerText()
    const options = await group.getByRole('option').allInnerTexts()
    places[heading] = options.map((text) => text.replace(/\s+/g, ' ').trim())
  }
  return places
}

test('J48 Every object can be added to a diagram, and the list says where each is from', async ({ editor, consoleErrors }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  await editor.addElement('Software System', 'Payments')
  await editor.drillDown('Online Shop')
  await editor.addElement('Container', 'Web App')
  await editor.drillDown('Web App')
  await editor.addElement('Component', 'Cart')
  await editor.backTo('Overview')

  // The Overview offers what stands inside its boxes, at any depth, under the box it is in.
  expect(await offered(editor)).toEqual({ 'Inside Online Shop': ['Web App Container'], 'Inside Online Shop › Web App': ['Cart Component'] })
  await editor.page.getByRole('option', { name: 'Cart' }).click()
  await expect(editor.element('Cart')).toBeVisible()
  await expect(editor.element('Online Shop')).toBeVisible()

  // Inside another box: what is on the Overview first, then the parts of the other boxes.
  await editor.drillDown('Payments')
  expect(await offered(editor)).toEqual({
    Overview: ['Online Shop Software System'],
    'Inside Online Shop': ['Web App Container'],
    'Inside Online Shop › Web App': ['Cart Component'],
  })
  await editor.page.keyboard.press('Escape')

  // Inside a box: not the box itself, but what is deeper inside one of its parts.
  await editor.backTo('Overview')
  await editor.drillDown('Online Shop')
  expect(await offered(editor)).toEqual({ Overview: ['Payments Software System'], 'Inside Online Shop › Web App': ['Cart Component'] })
  await editor.page.getByRole('option', { name: 'Cart' }).click()
  await expect(editor.element('Cart')).toBeVisible()
  await expect(editor.element('Web App')).toBeVisible()

  // It is the one object on all its diagrams: a new name here is its name on the Overview too.
  await editor.rename('Cart', 'Basket')
  await editor.backTo('Overview')
  await expect(editor.element('Basket')).toBeVisible()
  await expect(editor.element('Cart')).toHaveCount(0)

  // Reloaded, the diagram is as it was: nothing a view shows is refused.
  await editor.page.reload()
  await expect(editor.element('Basket')).toBeVisible()
  await expect(editor.element('Online Shop')).toBeVisible()
  expect(consoleErrors).toEqual([])
})
