import { test, expect } from './fixtures.ts'

// J43 Clear the workspace: docs/journeys.md#j43-clear-the-workspace
test('J43 Clearing the workspace asks first, then leaves an empty app that stays empty', async ({ editor, page, consoleErrors }) => {
  await editor.open()
  // What the first diagram of an untouched app is called.
  const fresh = (await editor.title.textContent()) ?? ''
  expect(fresh).not.toBe('')
  const clear = page.getByRole('button', { name: 'Clear workspace' })
  // Nothing to clear yet.
  await expect(clear).toBeDisabled()

  await editor.addElement('Software System', 'Online Shop')
  await editor.addElement('Software System', 'Billing')
  await editor.connect('Online Shop', 'Billing', 'Pays')
  await editor.drillDown('Online Shop')
  await expect(editor.title).toHaveText('Online Shop')

  // It asks first, and says what goes. "Cancel" changes nothing.
  await clear.click()
  const dialog = page.getByRole('dialog', { name: 'Clear the workspace?' })
  await expect(dialog).toContainText('cannot be undone')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(editor.boundary).toContainText('Online Shop')
  await expect(editor.element('Billing')).toBeVisible()

  // "Clear everything": the app is as on the first day, on its first diagram.
  await clear.click()
  await dialog.getByRole('button', { name: 'Clear everything' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(editor.title).toHaveText(fresh)
  await expect(editor.breadcrumb).not.toContainText('Online Shop')
  await expect(editor.canvas.getByRole('group')).toHaveCount(0)
  await expect(editor.relationships).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Load an example' })).toBeVisible()
  // The change log went with it: there is nothing to undo.
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
  await expect(clear).toBeDisabled()

  // It stays so after a reload, and the app works on: a new card can be added.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Load an example' })).toBeVisible()
  await editor.addElement('Software System', 'Fresh Start')
  await expect(editor.element('Fresh Start')).toBeVisible()
  expect(consoleErrors).toEqual([])
})
