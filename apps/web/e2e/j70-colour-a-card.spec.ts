import { test, expect } from './fixtures.ts'

// J70 Colour a card: docs/journeys.md#j70-colour-a-card

test('J70 Any card is filled with a colour, and with none again', async ({ editor, page, consoleErrors }) => {
  await editor.open()
  const checkout = await editor.addElement('Box', 'Checkout')
  const db = await editor.addShape('Basic', 'Database', 'Orders DB')
  await expect(checkout.locator('[data-fill]')).toHaveCount(0)

  await checkout.click()
  await checkout.getByRole('button', { name: 'Colour' }).click()
  await expect(checkout.getByRole('button', { name: 'No colour' })).toHaveAttribute('aria-pressed', 'true')
  await checkout.getByRole('button', { name: 'Blue' }).click()
  await expect(checkout.locator('[data-fill="blue"]')).toHaveCount(1)
  await expect(checkout.locator('.object-card')).toHaveCSS('background-color', 'rgb(191, 219, 254)')

  // A shape's outline is filled.
  await db.click()
  await db.getByRole('button', { name: 'Colour' }).click()
  await db.getByRole('button', { name: 'Green' }).click()
  await expect(db.getByTestId('card-shape').locator('path').first()).toHaveCSS('fill', 'rgb(187, 247, 208)')

  await page.reload()
  await expect(editor.element('Checkout').locator('[data-fill="blue"]')).toHaveCount(1)
  await editor.element('Checkout').click()
  await editor.element('Checkout').getByRole('button', { name: 'Colour' }).click()
  await editor.element('Checkout').getByRole('button', { name: 'No colour' }).click()
  await expect(editor.element('Checkout').locator('[data-fill]')).toHaveCount(0)

  await editor.openHistory()
  await expect(editor.changes.nth(2)).toContainText('Coloured "Checkout" blue')
  await expect(editor.changes.nth(3)).toContainText('Coloured "Orders DB" green')
  await expect(editor.changes.nth(4)).toContainText('Took the colour off "Checkout"')
  expect(consoleErrors).toEqual([])
})

test('J70 The text of a filled card is dark ink in the dark theme too', async ({ editor, page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await editor.open()
  const checkout = await editor.addElement('Box', 'Checkout', { description: 'Takes **every** order' })
  await checkout.click()
  await checkout.getByRole('button', { name: 'Colour' }).click()
  await checkout.getByRole('button', { name: 'Yellow' }).click()
  await editor.clickCanvas()
  const ink = 'oklch(0.268 0.007 34.298)'
  await expect(checkout.getByText('Checkout', { exact: true })).toHaveCSS('color', ink)
  await expect(checkout.getByText('every', { exact: true })).toHaveCSS('color', ink)
})

test('J70 A locked workspace offers no colours', async ({ editor }) => {
  await editor.open()
  const checkout = await editor.addElement('Box', 'Checkout')
  await editor.lockButton.click()
  await checkout.click()
  await expect(checkout.getByRole('button', { name: 'Colour' })).toHaveCount(0)
})
