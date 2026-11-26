import { test, expect } from './fixtures.ts'

// J58 Several workspaces: docs/journeys.md#j58-several-workspaces
test('J58 A user has several workspaces, each with diagrams of its own', async ({ page, editor, consoleErrors }) => {
  await editor.open()
  const workspace = page.getByRole('button', { name: /^Workspace: / })
  await expect(workspace).toContainText('My workspace')
  await editor.addElement('Software System', 'Online Shop')

  // A new workspace is empty, and the editor is in it.
  await workspace.click()
  await page.getByRole('menuitem', { name: 'New workspace' }).click()
  const naming = page.getByRole('dialog', { name: 'New workspace' })
  await naming.getByLabel('Title').fill('Bookshop')
  await naming.getByRole('button', { name: 'Create' }).click()
  await expect(naming).toHaveCount(0)
  await expect(workspace).toContainText('Bookshop')
  await expect(editor.canvas.getByRole('group')).toHaveCount(0)
  await editor.addElement('Person', 'Reader')

  // The address names the workspace: a reload opens the same one.
  await page.reload()
  await expect(workspace).toContainText('Bookshop')
  await expect(editor.element('Reader')).toBeVisible()

  // Back to the first: its own cards, not the other's.
  await workspace.click()
  await page.getByRole('menuitemradio', { name: 'My workspace' }).click()
  await expect(workspace).toContainText('My workspace')
  await expect(editor.element('Online Shop')).toBeVisible()
  await expect(editor.element('Reader')).toHaveCount(0)

  // Opening the app again leads to the workspace that was open last.
  await page.goto('/')
  await expect(workspace).toContainText('My workspace')
  await expect(editor.element('Online Shop')).toBeVisible()

  await workspace.click()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  const renaming = page.getByRole('dialog', { name: 'Rename the workspace' })
  await expect(renaming.getByLabel('Title')).toHaveValue('My workspace')
  await renaming.getByLabel('Title').fill('Shop landscape')
  await renaming.getByRole('button', { name: 'Rename' }).click()
  await expect(workspace).toContainText('Shop landscape')
  await workspace.click()
  await expect(page.getByRole('menuitemradio', { name: 'Shop landscape' })).toBeVisible()
  await expect(page.getByRole('menuitemradio', { name: 'My workspace' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  expect(consoleErrors).toEqual([])
})

test('J58 Deleting a workspace asks first and leads to another one', async ({ page, editor, consoleErrors }) => {
  await editor.open()
  const workspace = page.getByRole('button', { name: /^Workspace: / })
  await workspace.click()
  await page.getByRole('menuitem', { name: 'New workspace' }).click()
  await page.getByRole('dialog', { name: 'New workspace' }).getByLabel('Title').fill('Bookshop')
  await page.getByRole('dialog', { name: 'New workspace' }).getByRole('button', { name: 'Create' }).click()
  await expect(workspace).toContainText('Bookshop')
  await editor.addElement('Person', 'Reader')

  await workspace.click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  const asking = page.getByRole('dialog', { name: 'Delete the workspace?' })
  await expect(asking).toContainText('Bookshop')
  await expect(asking).toContainText('cannot be undone')
  await asking.getByRole('button', { name: 'Cancel' }).click()
  await expect(asking).toHaveCount(0)
  await expect(editor.element('Reader')).toBeVisible()

  await workspace.click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await asking.getByRole('button', { name: 'Delete workspace' }).click()
  await expect(workspace).toContainText('My workspace')
  await expect(editor.element('Reader')).toHaveCount(0)
  await workspace.click()
  await expect(page.getByRole('menuitemradio')).toHaveCount(1)

  // The last one goes too: then the app offers to make one.
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await asking.getByRole('button', { name: 'Delete workspace' }).click()
  await expect(page.getByRole('heading', { name: 'No workspace yet' })).toBeVisible()
  await page.getByLabel('Title').fill('Fresh start')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(workspace).toContainText('Fresh start')
  await expect(editor.title).toHaveText('Overview')
  expect(consoleErrors).toEqual([])
})

test('J58 The address of a workspace that is not yours leads to your own', async ({ page, editor, newAccount, browserOf, server }) => {
  test.skip(!server, 'Without a server there is nobody else')
  const other = await browserOf(await newAccount('Somebody Else'))
  await other.editor.open()
  await other.editor.addElement('Software System', 'Theirs')
  const address = new URL(other.page.url()).pathname

  await page.goto(address)
  await expect(page.getByRole('button', { name: /^Workspace: / })).toContainText('My workspace')
  await expect(editor.element('Theirs')).toHaveCount(0)
  await expect(editor.errors).toContainText('There is no such workspace, or it is not shared with you.')
})
