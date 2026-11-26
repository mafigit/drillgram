import { test, expect } from './fixtures.ts'
import type { DiagramEditor } from './pages/editor.ts'

// J50 What went wrong is said on a card: docs/journeys.md#j50-what-went-wrong-is-said-on-a-card

const REFUSED = 'Cards outside the frame are connected on a diagram they are on, not here.'

/** Inside "Online Shop", with "Customer" and "Payments" outside its frame: they do not connect there. */
async function insideWithTwoOutside(editor: DiagramEditor) {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  await editor.addElement('Person', 'Customer')
  await editor.addElement('Software System', 'Payments')
  await editor.drillDown('Online Shop')
  await editor.addElement('Container', 'Web App')
  await editor.addExisting('Customer')
  await editor.addExisting('Payments')
}
const tryIt = (editor: DiagramEditor) => editor.element('Customer').getByTestId('connection-handle').dragTo(editor.element('Payments'))

test('J50 An error is a card in the top right corner, said once, with a button to close it', async ({ editor, page, consoleErrors }) => {
  await insideWithTwoOutside(editor)
  await tryIt(editor)

  // A card over the page, in the top right corner, under the bar.
  await expect(editor.errors).toHaveText([REFUSED])
  const card = (await editor.errors.boundingBox())!
  const window = page.viewportSize()!
  expect(window.width - (card.x + card.width)).toBeLessThan(40)
  expect(card.y).toBeLessThan(140)
  expect(card.y).toBeGreaterThan(40)

  // The same again is no second card.
  await tryIt(editor)
  await expect(editor.errors).toHaveCount(1)

  // Closed, it is gone; the diagram is as it was.
  await editor.errors.getByRole('button', { name: 'Close' }).click()
  await expect(editor.errors).toHaveCount(0)
  await expect(editor.relationships).toHaveCount(0)

  // It also goes with the next change: it was about the diagram as it was.
  await tryIt(editor)
  await expect(editor.errors).toHaveCount(1)
  await editor.connect('Customer', 'Web App', 'Shops in')
  await expect(editor.errors).toHaveCount(0)
  expect(consoleErrors).toEqual([])
})

test('J50 An error card goes by itself after a while', async ({ editor, page }) => {
  await insideWithTwoOutside(editor)
  await page.clock.install()
  await tryIt(editor)
  await expect(editor.errors).toHaveCount(1)
  await page.clock.fastForward(7000)
  await expect(editor.errors).toHaveCount(1)
  await page.clock.fastForward(2000)
  await expect(editor.errors).toHaveCount(0)
})
