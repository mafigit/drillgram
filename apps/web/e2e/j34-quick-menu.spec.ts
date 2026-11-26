import { test, expect } from './fixtures.ts'

// J34 Quick menu on the canvas: docs/journeys.md#j34-quick-menu-on-the-canvas
test('J34 A right-click on the canvas opens a round menu that adds a card there', async ({ editor, consoleErrors }) => {
  await editor.open()
  const at = await editor.canvasPoint(0.3, 0.35)

  await editor.openQuickMenu(at)
  // No shape picked yet: the plain box only.
  await expect(editor.quickMenu.getByRole('menuitem')).toHaveText(['Add Box', 'Add existing object'])
  // Nothing in the model yet: there is no existing object to add.
  await expect(editor.quickMenu.getByRole('menuitem', { name: 'Add existing object' })).toBeDisabled()
  // The items stand around the point that was clicked.
  for (const item of await editor.quickMenu.getByRole('menuitem').all()) {
    const box = (await item.boundingBox())!
    const distance = Math.hypot(box.x + box.width / 2 - at.x, box.y + box.height / 2 - at.y)
    expect(distance).toBeGreaterThan(40)
    expect(distance).toBeLessThan(150)
  }

  // Escape closes it and adds nothing.
  await editor.page.keyboard.press('Escape')
  await expect(editor.quickMenu).toHaveCount(0)

  await editor.openQuickMenu(at)
  await editor.quickMenu.getByRole('menuitem', { name: 'Add Box' }).click()
  await expect(editor.quickMenu).toHaveCount(0)
  // The form floats where the ring was, not down in the toolbar.
  const form = (await editor.page.getByRole('form', { name: 'New box' }).boundingBox())!
  expect(at.x).toBeGreaterThan(form.x)
  expect(at.x).toBeLessThan(form.x + form.width)
  expect(at.y).toBeGreaterThan(form.y)
  expect(at.y).toBeLessThan(form.y + form.height)
  await editor.page.getByRole('textbox', { name: 'Title' }).fill('Online Shop')
  await editor.page.keyboard.press('Enter')
  // The card lands where the menu was opened.
  const shop = editor.element('Online Shop')
  await expect
    .poll(async () => {
      const box = await shop.boundingBox()
      return box !== null && at.x > box.x && at.x < box.x + box.width && at.y > box.y && at.y < box.y + box.height
    })
    .toBe(true)
  expect(consoleErrors).toEqual([])
})

test('J34 The menu offers the last six shapes picked, the latest first', async ({ editor, page, consoleErrors }) => {
  await editor.open()
  const at = await editor.canvasPoint(0.3, 0.35)
  // Away from where the cards land.
  const elsewhere = await editor.canvasPoint(0.7, 0.7)
  const offered = async () => {
    await editor.openQuickMenu(elsewhere)
    await expect(editor.quickMenu.getByRole('menuitem', { name: 'Add existing object' })).toBeVisible()
    const names = await editor.quickMenu.getByRole('menuitem').allTextContents()
    await page.keyboard.press('Escape')
    return names
  }

  for (const [library, shape] of [
    ['C4', 'Person'],
    ['C4', 'Software System'],
    ['C4', 'Container'],
    ['C4', 'Component'],
    ['Basic', 'Database'],
    ['Basic', 'Queue'],
    ['Basic', 'Cloud'],
  ]) {
    await page.getByRole('button', { name: 'Add shape' }).click()
    await page.getByRole('tab', { name: library }).click()
    await page.getByRole('button', { name: `Add ${shape}`, exact: true }).click()
    await page.keyboard.press('Escape')
  }
  // Seven picked: the first one is no longer offered.
  expect(await offered()).toEqual(['Add Cloud', 'Add Queue', 'Add Database', 'Add Component', 'Add Container', 'Add Software System', 'Add existing object'])

  // A shape picked in the ring comes first, and starts the form as itself.
  await editor.openQuickMenu(at)
  await editor.quickMenu.getByRole('menuitem', { name: 'Add Database' }).click()
  await expect(page.getByRole('form', { name: 'New box' }).getByRole('combobox', { name: 'Shape' })).toHaveValue('cylinder')
  await page.getByRole('textbox', { name: 'Title' }).fill('Orders DB')
  await page.keyboard.press('Enter')
  await expect(editor.element('Orders DB')).toBeVisible()
  const latest = ['Add Database', 'Add Cloud', 'Add Queue', 'Add Component', 'Add Container', 'Add Software System', 'Add existing object']
  expect(await offered()).toEqual(latest)

  // The browser keeps them.
  await page.reload()
  await expect(editor.element('Orders DB')).toBeVisible()
  expect(await offered()).toEqual(latest)
  expect(consoleErrors).toEqual([])
})

test('J34 A card that was just added is the selected one', async ({ editor }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  await editor.addElement('Software System', 'Billing')
  // Delete takes the selection away: that is "Billing", the card added last, and only it.
  await editor.page.keyboard.press('Delete')
  await expect(editor.element('Billing')).toHaveCount(0)
  await expect(editor.element('Online Shop')).toBeVisible()
})
