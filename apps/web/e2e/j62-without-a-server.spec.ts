import { test, expect } from './fixtures.ts'
import { DiagramEditor } from './pages/editor.ts'

// J62 The app without a server: docs/journeys.md#j62-the-app-without-a-server
test('J62 The app opens on a workspace this browser keeps, and nobody signs in', async ({ page, editor, consoleErrors }) => {
  const asked: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) asked.push(request.url())
  })

  await editor.open()
  await expect(editor.workspace).toContainText('My workspace')
  await expect(editor.title).toHaveText('Overview')
  await expect(page.getByRole('button', { name: 'Account' })).toHaveCount(0)
  // Where the account was: the diagrams are in this browser and nowhere else.
  await page.getByRole('button', { name: 'Kept in this browser' }).click()
  await expect(page.getByRole('dialog', { name: 'Kept in this browser' })).toContainText('Export what you want to keep')
  await page.keyboard.press('Escape')

  await editor.addElement('Person', 'Customer')
  await editor.addElement('Software System', 'Online Shop')
  await editor.connect('Customer', 'Online Shop', 'Places orders in')
  await editor.undo()
  await expect(editor.relationships).toHaveCount(0)

  // The cards, the change log and the place in it are still there.
  await page.reload()
  await expect(editor.element('Customer')).toBeVisible()
  await expect(editor.element('Online Shop')).toBeVisible()
  await expect(editor.relationships).toHaveCount(0)
  await editor.redo()
  await expect(editor.relationship('Places orders in')).toBeVisible()

  // There is nobody to sign in and there are no users: both addresses lead to the diagrams.
  await page.goto('/login')
  await expect(editor.element('Customer')).toBeVisible()
  await page.goto('/users')
  await expect(editor.element('Customer')).toBeVisible()

  expect(asked).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('J62 Without a connection the diagrams are there and can be changed', async ({ page, context, editor }) => {
  await editor.open()
  await editor.addElement('Person', 'Customer')
  await editor.waitForServiceWorker()

  await context.setOffline(true)
  await page.reload()
  await expect(editor.element('Customer')).toBeVisible()
  await editor.addElement('Software System', 'Billing')
  await page.reload()
  await expect(editor.element('Customer')).toBeVisible()
  await expect(editor.element('Billing')).toBeVisible()
})

test('J62 A change in a tab that has not seen what another tab did is not kept, and the app says so', async ({ page, context, editor }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')

  const tab = await context.newPage()
  const other = new DiagramEditor(tab)
  await other.open()
  await expect(other.element('Online Shop')).toBeVisible()
  await other.addElement('Software System', 'Billing')

  await page.bringToFront()
  await editor.addElement('Software System', 'Mail')
  await expect(editor.errors).toContainText('This workspace was changed somewhere else')
  await expect(editor.element('Billing')).toBeVisible()
  await expect(editor.element('Mail')).toHaveCount(0)

  // From there on it works as ever.
  await editor.addElement('Software System', 'Mail')
  await expect(editor.element('Mail')).toBeVisible()
})
