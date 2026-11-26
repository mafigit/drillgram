import { test, expect } from './fixtures.ts'

// J66 Lock a workspace to look at it: docs/journeys.md#j66-lock-a-workspace-to-look-at-it
test('J66 A locked workspace is looked at, not changed', async ({ page, editor, consoleErrors }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  await editor.addElement('Software System', 'Billing')
  await editor.connect('Online Shop', 'Billing', 'Pays')
  await expect(editor.relationship('Pays')).toBeVisible()

  await editor.lockButton.click()
  await expect(editor.lockButton).toHaveAttribute('aria-pressed', 'true')
  const tools = page.getByRole('toolbar', { name: 'Diagram tools' })
  await expect(tools).toContainText('Locked')
  await expect(tools.getByRole('button', { name: 'Add shape' })).toHaveCount(0)
  for (const name of ['Undo', 'Arrange', 'History', 'Import', 'Clear workspace']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeDisabled()
  }
  await expect(page.getByRole('button', { name: 'New view' })).toHaveCount(0)

  // Nothing changes the diagram, and nothing opens a field.
  const billing = editor.element('Billing')
  // A card that cannot be dragged moves the whole diagram: it stays where it was among the others.
  const apart = async () => {
    const [a, b] = [(await billing.boundingBox())!, (await editor.element('Online Shop').boundingBox())!]
    return { x: a.x - b.x, y: a.y - b.y }
  }
  const was = (await billing.boundingBox())!
  const before = await apart()
  await editor.move('Billing', { x: 160, y: 120 })
  expect(await apart()).toEqual(before)
  await billing.getByText('Billing', { exact: true }).dblclick()
  await billing.dblclick({ position: { x: 20, y: was.height - 12 } })
  await editor.relationship('Pays').getByText('Pays').dblclick({ force: true })
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await billing.click()
  for (const name of ['Edit', 'Icons', 'Copy']) await expect(billing.getByRole('button', { name })).toHaveCount(0)
  for (const handle of await editor.canvas.getByTestId('connection-handle').all()) await expect(handle).toBeHidden()
  await page.keyboard.press('Delete')
  await page.keyboard.press('ControlOrMeta+d')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(editor.cards).toHaveCount(2)
  await expect(editor.relationship('Pays')).toBeVisible()
  await editor.openQuickMenu(await editor.canvasPoint(0.8, 0.8))
  await expect(editor.quickMenu).toHaveCount(0)
  await expect(editor.errors).toHaveCount(0)

  // Looking around works as ever.
  await editor.drillDown('Online Shop')
  await expect(editor.title).toHaveText('Online Shop')
  await editor.backTo('Overview')
  await expect(editor.element('Billing')).toBeVisible()
  await expect(editor.exportButton).toBeEnabled()

  // The lock is kept for this workspace.
  await page.reload()
  await expect(editor.element('Billing')).toBeVisible()
  await expect(editor.lockButton).toHaveAttribute('aria-pressed', 'true')

  await tools.getByRole('button', { name: 'Unlock' }).click()
  await expect(editor.lockButton).toHaveAttribute('aria-pressed', 'false')
  await editor.openHistory()
  await expect(editor.changes).toHaveCount(3)
  await editor.openHistory()
  await editor.addElement('Person', 'Customer')
  await expect(editor.element('Customer')).toBeVisible()
  expect(consoleErrors).toEqual([])
})
