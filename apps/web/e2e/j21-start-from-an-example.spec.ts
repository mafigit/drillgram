import { test, expect } from './fixtures.ts'

// J21 Start from an example: docs/journeys.md#j21-start-from-an-example
test('J21 The example fills the landscape and can be drilled into', async ({ page, editor, consoleErrors }) => {
  await editor.open()
  await page.getByRole('button', { name: 'Load an example' }).click()

  await expect(editor.title).toHaveText('Overview')
  for (const name of ['Customer', 'Web Shop', 'Order Management', 'Card Processor']) {
    // Not 1: at a fractional zoom a card can be a hair off a whole pixel.
    await expect(editor.element(name)).toBeInViewport({ ratio: 0.99 })
  }
  // All of it: every card whole on the screen, with air to its edge, and none under what
  // stands over the canvas.
  const over = {
    toolbar: page.getByRole('toolbar', { name: 'Diagram tools' }),
    minimap: editor.canvas.getByRole('img', { name: 'Minimap' }),
    title: editor.title,
  }
  await expect(editor.cards).toHaveCount(22)
  await expect.poll(async () => editor.outOfSight(await editor.cards.all(), over)).toEqual([])
  const [canvas, left, right] = [(await editor.canvas.boundingBox())!, (await editor.element('Recommendations').boundingBox())!, (await editor.element('Warehouse').boundingBox())!]
  expect(left.x - canvas.x).toBeGreaterThanOrEqual(16)
  expect(canvas.x + canvas.width - (right.x + right.width)).toBeGreaterThanOrEqual(16)
  await expect(editor.element('Card Processor')).toContainText('External')
  expect(await editor.relationships.count()).toBeGreaterThan(20)
  await expect(page.getByRole('button', { name: 'Load an example' })).toHaveCount(0)

  await editor.drillDown('Web Shop')
  await expect(editor.element('Shop API')).toBeVisible()
  // Inside the box its frame is on the screen too, with its cards.
  await expect.poll(async () => editor.outOfSight([editor.boundary, ...(await editor.cards.all())], over)).toEqual([])
  expect(consoleErrors).toEqual([])
})
