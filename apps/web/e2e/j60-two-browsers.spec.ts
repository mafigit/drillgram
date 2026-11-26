import { test, expect } from './fixtures.ts'

// J60 The same workspace in two browsers: docs/journeys.md#j60-the-same-workspace-in-two-browsers
test('J60 What is drawn in one browser is there in another, with its change log', async ({ editor, page, account, browserOf }) => {
  await editor.open()
  await editor.addElement('Person', 'Customer')
  await editor.addElement('Software System', 'Online Shop')
  await editor.connect('Customer', 'Online Shop', 'Places orders in')
  await editor.undo()
  await expect(editor.relationships).toHaveCount(0)

  // Another device of the same user: the diagram as it is here, the undone step still to redo.
  const other = await browserOf(account)
  await other.editor.open()
  await expect(other.editor.element('Customer')).toBeVisible()
  await expect(other.editor.element('Online Shop')).toBeVisible()
  await expect(other.editor.relationships).toHaveCount(0)
  await other.editor.redo()
  await expect(other.editor.relationship('Places orders in')).toBeVisible()

  // And back in the first one, after a reload.
  await page.reload()
  await expect(editor.relationship('Places orders in')).toBeVisible()
})

test('J60 A change made on a workspace that has moved on elsewhere is not kept, and the app says so', async ({ editor, account, browserOf, consoleErrors }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')

  const other = await browserOf(account)
  await other.editor.open()
  await expect(other.editor.element('Online Shop')).toBeVisible()
  await other.editor.addElement('Software System', 'Billing')

  // This browser has not seen "Billing". Its next change comes too late: the workspace is
  // shown as it is on the server, and a card says what happened.
  await editor.addElement('Software System', 'Mail')
  await expect(editor.errors).toContainText('This workspace was changed somewhere else')
  await expect(editor.element('Billing')).toBeVisible()
  await expect(editor.element('Mail')).toHaveCount(0)

  // From there on it works as ever.
  await editor.addElement('Software System', 'Mail')
  await expect(editor.element('Mail')).toBeVisible()
  await other.page.reload()
  await expect(other.editor.element('Mail')).toBeVisible()
  await expect(other.editor.element('Billing')).toBeVisible()
  // The refused request is in the browser's console; nothing else is.
  expect(consoleErrors.filter((text) => !text.includes('409'))).toEqual([])
})
