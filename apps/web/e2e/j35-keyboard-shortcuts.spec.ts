import { test, expect } from './fixtures.ts'

// J35 Keyboard shortcuts: docs/journeys.md#j35-keyboard-shortcuts
test('J35 The canvas lists its keyboard shortcuts, and A arranges the diagram', async ({ editor, consoleErrors }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  await editor.addElement('Software System', 'Billing')
  await editor.connect('Online Shop', 'Billing', 'Pays')

  // The legend opens from the panel at the bottom right and says what each key does.
  await editor.page.getByRole('button', { name: 'Keyboard shortcuts' }).click()
  const legend = editor.page.getByRole('list', { name: 'Keyboard shortcuts' })
  for (const what of ['Search', 'Arrange', 'Undo', 'Redo', 'Delete the selection', 'Add to the selection', 'Select with a frame', 'Quick menu']) {
    await expect(legend.getByRole('listitem').filter({ hasText: what })).toHaveCount(1)
  }
  await expect(legend.getByRole('listitem').filter({ hasText: 'Arrange' })).toContainText('A')
  await editor.page.keyboard.press('Escape')
  await expect(legend).toHaveCount(0)

  // A arranges, as the button does: it is busy, then at rest.
  await editor.clickCanvas()
  await expect(editor.arrangeButton).toBeEnabled()
  const busy = await editor.recordAttribute(editor.arrangeButton, 'aria-busy')
  await editor.page.keyboard.press('a')
  await expect.poll(busy).toEqual(['true', 'false'])

  // Typing an "a" into a field arranges nothing.
  const typed = await editor.recordAttribute(editor.arrangeButton, 'aria-busy')
  await editor.pickShape('Software System')
  await editor.page.getByRole('textbox', { name: 'Name' }).fill('a')
  await editor.page.keyboard.press('a')
  await editor.page.keyboard.press('Enter')
  await expect(editor.element('aa')).toBeVisible()
  expect(await typed()).toEqual([])
  expect(consoleErrors).toEqual([])
})
