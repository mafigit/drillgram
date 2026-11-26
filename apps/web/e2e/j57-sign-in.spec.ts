import { test, expect } from './fixtures.ts'

// Nobody is signed in when these start.
test.use({ signedIn: false })

// J57 Sign in and out: docs/journeys.md#j57-sign-in-and-out
test('J57 The app asks who you are, lets you in with your password and out again', async ({ page, editor, account, consoleErrors }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
  await expect(editor.canvas).toHaveCount(0)

  // A wrong password: said beside the form, and what was typed stays.
  await page.getByLabel('E-mail').fill(account.email)
  await page.getByLabel('Password').fill('not my password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toContainText('The e-mail address or the password is wrong.')
  await expect(page.getByLabel('E-mail')).toHaveValue(account.email)
  // The browser notes the refused request in its console; nothing else went wrong.
  expect(consoleErrors.filter((text) => !text.includes('401'))).toEqual([])
  consoleErrors.length = 0

  await page.getByLabel('Password').fill(account.password)
  await page.getByLabel('Password').press('Enter')
  await expect(editor.title).toHaveText('Overview')
  await expect(page.getByRole('button', { name: /^Workspace: / })).toContainText('My workspace')

  // Still signed in after a reload.
  await page.reload()
  await expect(editor.title).toHaveText('Overview')

  await page.getByRole('button', { name: 'Account' }).click()
  await expect(page.getByRole('menu')).toContainText(account.name)
  await expect(page.getByRole('menu')).toContainText(account.email)
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

  // Out is out: the app's address leads to the sign-in page again.
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  expect(consoleErrors).toEqual([])
})

test('J57 After signing in the browser is where it wanted to go', async ({ page, editor, account, browserOf }) => {
  // The address of a diagram inside a box, copied from a browser that is signed in.
  const other = await browserOf(account)
  await other.editor.open()
  await other.editor.addElement('Software System', 'Online Shop')
  await other.editor.drillDown('Online Shop')
  await expect(other.editor.title).toHaveText('Online Shop')
  const address = new URL(other.page.url()).pathname

  await page.goto(address)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.getByLabel('E-mail').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(editor.title).toHaveText('Online Shop')
  expect(new URL(page.url()).pathname).toBe(address)
})

test('J57 The sign-in page says why single sign-on let nobody in', async ({ page }) => {
  await page.goto('/login?error=' + encodeURIComponent('There is no account for you on this server. Ask an admin for one.'))
  await expect(page.getByRole('alert')).toContainText('There is no account for you on this server.')
  // No single sign-on on the server of the tests: only the password form.
  await expect(page.getByRole('link', { name: /Sign in with/ })).toHaveCount(0)
  await expect(page.getByLabel('Password')).toBeVisible()
})

test('J57 A user changes their own password', async ({ page, editor, account, consoleErrors }) => {
  const signInWith = async (password: string) => {
    await page.getByLabel('E-mail').fill(account.email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
  }
  await page.goto('/')
  await signInWith(account.password)
  await expect(editor.title).toHaveText('Overview')

  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitem', { name: 'Change password' }).click()
  const dialog = page.getByRole('dialog', { name: 'Change your password' })
  // What is wrong with what was typed is said at the form, and the form stays.
  await dialog.getByLabel('Current password').fill('not my password')
  await dialog.getByLabel('New password').fill('a much better password')
  await dialog.getByRole('button', { name: 'Change password' }).click()
  await expect(dialog.getByRole('alert')).toContainText('The current password is wrong.')
  await dialog.getByLabel('Current password').fill(account.password)
  await dialog.getByLabel('New password').fill('short')
  await dialog.getByRole('button', { name: 'Change password' }).click()
  await expect(dialog.getByRole('alert')).toContainText('A password has at least 10 characters.')
  await dialog.getByLabel('New password').fill('a much better password')
  await dialog.getByRole('button', { name: 'Change password' }).click()
  await expect(dialog).toHaveCount(0)

  // Still signed in here; from now on only the new password lets them in.
  await page.reload()
  await expect(editor.title).toHaveText('Overview')
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await signInWith(account.password)
  await expect(page.getByRole('alert')).toContainText('The e-mail address or the password is wrong.')
  await signInWith('a much better password')
  await expect(editor.title).toHaveText('Overview')
  // The refused requests are in the browser's console; nothing else is.
  expect(consoleErrors.filter((text) => !/40[013]/.test(text))).toEqual([])
})
