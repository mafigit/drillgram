import { readFile, writeFile } from 'node:fs/promises'
import { test, expect } from './fixtures.ts'

// J64 A workspace as a file: docs/journeys.md#j64-a-workspace-as-a-file
test('J64 A workspace is saved as a file and opens in another browser as it was left, with its history', async ({ page, editor, browserOf, account, consoleErrors }, testInfo) => {
  await editor.open()
  await editor.addElement('Person', 'Customer')
  await editor.addElement('Software System', 'Online Shop')
  await editor.connect('Customer', 'Online Shop', 'Places orders in')
  await editor.drillDown('Online Shop')
  await editor.addElement('Container', 'Web App')
  // Undo takes the last change back, and the editor follows to where it was made.
  await editor.undo()
  await expect(editor.element('Web App')).toHaveCount(0)

  // The file: named after the workspace, a file of Drillgram, and readable as text.
  await editor.workspace.click()
  const saving = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Export workspace' }).click()
  const download = await saving
  expect(download.suggestedFilename()).toBe('my-workspace.drillgram.json')
  const file = testInfo.outputPath('my-workspace.drillgram.json')
  await download.saveAs(file)
  const saved = JSON.parse(await readFile(file, 'utf8')) as { format: string; name: string; entries: unknown[] }
  expect(saved).toMatchObject({ format: 'drillgram-workspace', name: 'My workspace' })
  expect(saved.entries.length).toBeGreaterThanOrEqual(5)

  // A browser that has none of it: the file brings the workspace, beside what is there.
  const other = await browserOf(account)
  await other.editor.open()
  await other.editor.workspace.click()
  const choosing = other.page.waitForEvent('filechooser')
  await other.page.getByRole('menuitem', { name: 'Import workspace' }).click()
  await (await choosing).setFiles(file)

  // It opens at once, as it was left: the cards, the connection, the box's inside, and the
  // undone change still there to redo.
  await expect(other.editor.element('Customer')).toBeVisible()
  await expect(other.editor.element('Online Shop')).toBeVisible()
  await expect(other.editor.relationship('Places orders in')).toBeVisible()
  await expect(other.page).toHaveURL(/\/w\/[\w-]+$/)
  await other.editor.drillDown('Online Shop')
  await expect(other.editor.element('Web App')).toHaveCount(0)
  await other.editor.redo()
  await expect(other.editor.element('Web App')).toBeVisible()
  await other.editor.openHistory()
  await expect(other.editor.changes).toHaveCount(4)

  // It is a workspace of its own, named as the one it came from; that name was taken here.
  await expect(other.editor.workspace).toContainText('My workspace (imported)')
  await other.editor.workspace.click()
  await expect(other.page.getByRole('menuitemradio')).toHaveText(['My workspace', 'My workspace (imported)'])
  await other.page.keyboard.press('Escape')

  // And it stays: a reload finds it.
  await other.page.reload()
  await expect(other.editor.element('Web App')).toBeVisible()
  expect(consoleErrors).toEqual([])
})

test('J64 A file that is no workspace is refused in words, and nothing is made of it', async ({ page, editor, consoleErrors }, testInfo) => {
  await editor.open()
  await editor.addElement('Person', 'Customer')
  const importing = async (name: string, text: string) => {
    const file = testInfo.outputPath(name)
    await writeFile(file, text)
    await editor.workspace.click()
    const choosing = page.waitForEvent('filechooser')
    await page.getByRole('menuitem', { name: 'Import workspace' }).click()
    await (await choosing).setFiles(file)
  }

  await importing('diagram.json', 'C4Context\n  Person(customer, "Customer")')
  await expect(editor.errors).toContainText('This file is not a workspace of Drillgram')
  await expect(editor.element('Customer')).toBeVisible()

  // The same file again is refused again: the browser does not keep it to itself.
  await editor.errors.getByRole('button', { name: 'Close' }).click()
  await importing('diagram.json', 'C4Context\n  Person(customer, "Customer")')
  await expect(editor.errors).toContainText('This file is not a workspace of Drillgram')

  await importing('later.drillgram.json', JSON.stringify({ format: 'drillgram-workspace', version: 99, name: 'Later', entries: [] }))
  await expect(editor.errors.filter({ hasText: 'newer version of Drillgram' })).toHaveCount(1)

  // Only the workspace that was there.
  await editor.workspace.click()
  await expect(page.getByRole('menuitemradio')).toHaveText(['My workspace'])
  expect(consoleErrors).toEqual([])
})
