import { test, expect } from './fixtures.ts'

// J37 Edit what is there: docs/journeys.md#j37-edit-what-is-there
test('J37 A card gets other details, a connector another label, and a connector is deleted', async ({ editor, consoleErrors }) => {
  await editor.open()
  const shop = await editor.addElement('Software System', 'Online Shop')
  await editor.addElement('Software System', 'Billing')
  await editor.connect('Online Shop', 'Billing', 'Pays')

  // The card's form opens with what the card says now.
  await editor.openEditForm('Online Shop')
  const form = editor.page.getByRole('form', { name: 'Edit software system' })
  await expect(form.getByRole('textbox', { name: 'Name' })).toHaveValue('Online Shop')
  await form.getByRole('textbox', { name: 'Name' }).fill('Web Shop')
  await form.getByRole('textbox', { name: 'Description' }).fill('Sells books to customers')
  await form.getByRole('checkbox', { name: 'External' }).check()
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(form).toHaveCount(0)
  const edited = editor.element('Web Shop')
  await expect(edited).toContainText('Sells books to customers')
  await expect(edited).toContainText('External')
  // One change: undo brings the old card back whole.
  await editor.undo()
  await expect(shop).toBeVisible()
  await expect(shop).not.toContainText('External')
  await editor.redo()
  await expect(edited).toBeVisible()

  // A double-click on a connector opens its label, as it is, to be changed.
  await editor.relabel('Pays', 'Charges', 'HTTPS')
  await expect(editor.relationship('Charges [HTTPS]')).toHaveCount(1)
  await expect(editor.relationship('Pays')).toHaveCount(0)

  // The same fields have the button that deletes it.
  await editor.deleteRelationship('Charges [HTTPS]')
  await expect(editor.relationships).toHaveCount(0)
  await expect(edited).toBeVisible()
  await editor.undo()
  await expect(editor.relationship('Charges [HTTPS]')).toHaveCount(1)
  expect(consoleErrors).toEqual([])
})
