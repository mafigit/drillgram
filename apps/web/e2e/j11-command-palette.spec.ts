import { test, expect } from './fixtures.ts'

// J11 Find anything with the command palette: docs/journeys.md#j11-find-anything-with-the-command-palette
test('J11 The search opens the diagram of a found object', async ({ editor }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  await editor.drillDown('Online Shop')
  await editor.addElement('Container', 'Web App')
  await editor.backTo('Overview')
  await expect(editor.element('Web App')).toHaveCount(0)

  // How far the middle of "Web App" is from the middle of the canvas, in px.
  const offCentre = async () => {
    const [card, canvas] = [await editor.element('Web App').boundingBox(), await editor.canvas.boundingBox()]
    if (!card || !canvas) return Infinity
    return Math.hypot(card.x + card.width / 2 - (canvas.x + canvas.width / 2), card.y + card.height / 2 - (canvas.y + canvas.height / 2))
  }

  await editor.searchAndOpen('Web')

  await expect(editor.breadcrumb).toContainText('Online Shop')
  await expect(editor.element('Web App')).toBeVisible()
  await expect.poll(offCentre).toBeLessThan(3)

  // An object of the diagram that is open: the search selects it. Delete then takes it away.
  await editor.addElement('Container', 'Database')
  await editor.clickCanvas()
  // Moved out of the middle, it is brought back there.
  await editor.pan({ x: -150, y: -100 })
  await expect.poll(offCentre).toBeGreaterThan(100)
  await editor.searchAndOpen('web a')
  await expect.poll(offCentre).toBeLessThan(3)
  await editor.page.keyboard.press('Delete')
  await expect(editor.element('Web App')).toHaveCount(0)
  await expect(editor.element('Database')).toBeVisible()
})

test('J11 The search field in the header finds by a part of the name', async ({ editor }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  await editor.addElement('Software System', 'Billing')
  await editor.page.getByRole('button', { name: 'Search' }).click()
  const field = editor.page.getByRole('combobox', { name: 'Search' })
  await expect(field).toBeFocused()
  const results = editor.page.getByRole('listbox', { name: 'Found objects' }).getByRole('option')
  await expect(results).toHaveCount(2)
  await field.fill('bill')
  await expect(results).toHaveText([/Billing/])
  await field.fill('nothing like it')
  await expect(editor.page.getByText('No object found.')).toBeVisible()
  await editor.page.keyboard.press('Escape')
  await expect(field).toHaveCount(0)
})
