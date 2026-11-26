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
  await expect(editor.element('Card Processor')).toContainText('External')
  expect(await editor.relationships.count()).toBeGreaterThan(20)
  await expect(page.getByRole('button', { name: 'Load an example' })).toHaveCount(0)

  await editor.drillDown('Web Shop')
  await expect(editor.element('Shop API')).toBeVisible()
  expect(consoleErrors).toEqual([])
})
