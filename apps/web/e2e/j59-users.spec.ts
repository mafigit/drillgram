import { test, expect, ADMIN } from './fixtures.ts'

test.use({ signedIn: false })

// J59 An admin manages the users: docs/journeys.md#j59-an-admin-manages-the-users
test('J59 An admin makes a user, who signs in, and disables them again', async ({ page, browser, consoleErrors }, testInfo) => {
  await page.goto('/')
  await page.getByLabel('E-mail').fill(ADMIN.email)
  await page.getByLabel('Password').fill(ADMIN.password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitem', { name: 'Users' }).click()
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
  await expect(page).toHaveURL(/\/users$/)
  const row = (email: string) => page.getByRole('row').filter({ hasText: email })
  await expect(row(ADMIN.email)).toContainText('Admin')

  // The server of the tests is shared by all of them: an address nobody else has.
  const email = `made-${testInfo.workerIndex}-${Date.now()}@example.org`
  const form = page.getByRole('form', { name: 'New user' })
  await form.getByLabel('E-mail').fill(email)
  await form.getByLabel('Name').fill('Grace Hopper')
  await form.getByLabel('Password').fill('short')
  await form.getByRole('button', { name: 'Create user' }).click()
  await expect(form.getByRole('alert')).toContainText('A password has at least 10 characters.')
  await form.getByLabel('Password').fill('a password for grace')
  await form.getByRole('button', { name: 'Create user' }).click()
  await expect(row(email)).toContainText('Grace Hopper')
  await expect(row(email)).toContainText('User')
  // The form is ready for the next one.
  await expect(form.getByLabel('E-mail')).toHaveValue('')

  // Grace signs in, in a browser of her own, and has a workspace.
  const hers = await browser.newContext()
  const grace = await hers.newPage()
  await grace.goto('/')
  await grace.getByLabel('E-mail').fill(email)
  await grace.getByLabel('Password').fill('a password for grace')
  await grace.getByRole('button', { name: 'Sign in' }).click()
  await expect(grace.getByRole('button', { name: /^Workspace: / })).toContainText('My workspace')
  // She is no admin: no way to the users, and their address shows nothing of them.
  await grace.getByRole('button', { name: 'Account' }).click()
  await expect(grace.getByRole('menuitem', { name: 'Sign out' })).toBeVisible()
  await expect(grace.getByRole('menuitem', { name: 'Users' })).toHaveCount(0)
  await grace.keyboard.press('Escape')
  await grace.goto('/users')
  await expect(grace.getByRole('button', { name: /^Workspace: / })).toContainText('My workspace')
  await expect(grace.getByRole('heading', { name: 'Users' })).toHaveCount(0)

  // Disabled: she is out at her next step and cannot come back in.
  await row(email).getByRole('button', { name: 'Disable' }).click()
  await expect(row(email)).toContainText('Disabled')
  await grace.reload()
  await expect(grace.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await grace.getByLabel('E-mail').fill(email)
  await grace.getByLabel('Password').fill('a password for grace')
  await grace.getByRole('button', { name: 'Sign in' }).click()
  await expect(grace.getByRole('alert')).toContainText('The e-mail address or the password is wrong.')

  // And enabled again.
  await row(email).getByRole('button', { name: 'Enable' }).click()
  await expect(row(email)).not.toContainText('Disabled')
  await grace.getByRole('button', { name: 'Sign in' }).click()
  await expect(grace.getByRole('button', { name: /^Workspace: / })).toContainText('My workspace')
  await hers.close()

  // An admin cannot lock the server: the last admin stays one.
  await row(ADMIN.email).getByRole('button', { name: 'Disable' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'The server needs an admin' })).toBeVisible()
  await expect(row(ADMIN.email)).not.toContainText('Disabled')

  // Back to the diagrams.
  await page.getByRole('link', { name: 'Back to the diagrams' }).click()
  await expect(page.getByRole('button', { name: /^Workspace: / })).toContainText('My workspace')
  expect(consoleErrors.filter((text) => !text.includes('409') && !text.includes('400'))).toEqual([])
})
