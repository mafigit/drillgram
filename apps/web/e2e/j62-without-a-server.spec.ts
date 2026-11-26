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
  await page.getByRole('button', { name: 'About this site' }).click()
  const about = page.getByRole('dialog', { name: 'About this site' })
  await expect(about).toContainText('Kept in this browser')
  await expect(about).toContainText('Export what you want to keep')
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

test('J62 The site says who runs it and what happens to data', async ({ page, context, editor, consoleErrors }) => {
  await editor.open()
  await editor.addElement('Person', 'Customer')

  await page.getByRole('button', { name: 'About this site' }).click()
  await page.getByRole('dialog', { name: 'About this site' }).getByRole('link', { name: 'Imprint' }).click()
  await expect(page).toHaveURL(/\/imprint\.html$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Imprint / Impressum')
  await expect(page.getByText('Angaben gemäß § 5 DDG')).toBeVisible()

  await page.getByRole('link', { name: 'Privacy Policy / Datenschutzerklärung' }).click()
  await expect(page).toHaveURL(/\/privacy\.html$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy Policy / Datenschutzerklärung')
  await expect(page.getByRole('heading', { name: 'Datenschutzerklärung', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Imprint / Impressum' }).click()
  await expect(page).toHaveURL(/\/imprint\.html$/)

  await page.getByRole('link', { name: 'Back to Drillgram' }).click()
  await expect(editor.element('Customer')).toBeVisible()
  // The way from the app is short: the same link is one press away again.
  await page.getByRole('button', { name: 'About this site' }).click()
  await expect(page.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy.html')
  expect(consoleErrors).toEqual([])

  // The service worker answers an address that is no file with the app. These two are files,
  // and they are there without a connection too.
  await editor.waitForServiceWorker()
  await context.setOffline(true)
  await page.goto('/imprint.html')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Imprint / Impressum')
  await page.goto('/privacy.html')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy Policy / Datenschutzerklärung')
})
