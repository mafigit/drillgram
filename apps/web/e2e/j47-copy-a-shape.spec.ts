import { test, expect } from './fixtures.ts'
import type { Locator } from '@playwright/test'
import type { DiagramEditor as Editor } from './pages/editor.ts'

// J47 Copy a shape: docs/journeys.md#j47-copy-a-shape

const cards = (editor: Editor) => editor.canvas.getByRole('group')
const boxOf = async (card: Locator) => (await card.boundingBox())!
const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

test('J47 A copy of a card stands beside it, with its kind and text', async ({ editor }) => {
  await editor.open()
  const api = await editor.addElement('Container', 'API', { technology: 'Go', description: 'Answers the **shop**.' })

  await api.click()
  await api.getByRole('button', { name: 'Copy' }).click()

  // A card of its own beside the first, the same but for its name.
  const copy = editor.element('API copy')
  await expect(copy).toBeVisible()
  await expect(copy).toContainText('Answers the shop.')
  await expect(copy).toContainText('Go')
  await expect(copy.locator('.card-text strong')).toHaveText('shop')
  await expect(cards(editor)).toHaveCount(2)
  expect(overlap(await boxOf(api), await boxOf(copy))).toBe(false)

  // It is another object: renaming it leaves the first alone.
  await editor.rename('API copy', 'Search API')
  await expect(editor.element('Search API')).toBeVisible()
  await expect(api).toBeVisible()

  await editor.openHistory()
  await expect(editor.changes.nth(1)).toContainText('Copied "API"')
})

test('J47 Ctrl or Cmd with D copies every selected card, as one change', async ({ editor }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  await editor.addElement('Person', 'Customer')
  await editor.element('Online Shop').click()
  await editor.selectAlso('Customer')

  await editor.page.keyboard.press('ControlOrMeta+d')

  await expect(cards(editor)).toHaveCount(4)
  await expect(editor.element('Online Shop copy')).toBeVisible()
  await expect(editor.element('Customer copy')).toBeVisible()
  const boxes = await Promise.all((await cards(editor).all()).map(boxOf))
  for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) expect(overlap(a, b)).toBe(false)

  // The copies are the selection now: Delete takes them, and only them.
  await editor.page.keyboard.press('Delete')
  await expect(cards(editor)).toHaveCount(2)
  await expect(editor.element('Online Shop')).toBeVisible()
  await expect(editor.element('Customer')).toBeVisible()

  // Copying was one change: the first undo brings both copies back, the second takes both away.
  await editor.undo()
  await expect(cards(editor)).toHaveCount(4)
  await editor.undo()
  await expect(cards(editor)).toHaveCount(2)
})
