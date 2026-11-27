import type { Page } from '@playwright/test'
import { test, expect } from './fixtures.ts'

// J71 Keep the workspaces in a folder: docs/journeys.md#j71-keep-the-workspaces-in-a-folder
//
// The browser's folder picker is a window of the operating system, which no test can press:
// it is stood in for by a folder of the browser's own file system (OPFS), whose handle is the
// same kind of thing. Files are put in and read from there as another program would.

const FOLDER = 'diagrams'

/** The picker chooses the folder "diagrams". */
async function pickerChooses(page: Page): Promise<void> {
  await page.addInitScript((name) => {
    Object.assign(window, {
      showDirectoryPicker: async () => (await navigator.storage.getDirectory()).getDirectoryHandle(name, { create: true }),
    })
  }, FOLDER)
}

/** The files in the folder, by name. */
const fileNames = (page: Page) =>
  page.evaluate(async (name) => {
    const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle(name)
    const names: string[] = []
    for await (const key of (folder as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(key)
    return names.sort()
  }, FOLDER)

type File = { format: string; name: string; entries: { id: string; type: string; event?: { type: string; name?: string } }[] }

const readFile = async (page: Page, file: string): Promise<File> =>
  JSON.parse(
    await page.evaluate(
      async ([name, file]) => {
        const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle(name!)
        // Read while the app writes it anew: read again.
        for (;;) {
          try {
            return await (await (await folder.getFileHandle(file!)).getFile()).text()
          } catch (failure) {
            if (!(failure instanceof DOMException && failure.name === 'NotReadableError')) throw failure
          }
        }
      },
      [FOLDER, file],
    ),
  ) as File

/** Writes a file into the folder, as another program would. */
const writeFile = (page: Page, file: string, content: unknown) =>
  page.evaluate(
    async ([name, file, text]) => {
      const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle(name!)
      const writing = await (await folder.getFileHandle(file!, { create: true })).createWritable()
      await writing.write(text!)
      await writing.close()
    },
    [FOLDER, file, JSON.stringify(content)],
  )

const added = (id: string, name: string) => ({
  id,
  type: 'change',
  at: '2026-11-27T09:00:00.000Z',
  event: { type: 'objectAdded', view: 'landscape', kind: 'softwareSystem', name },
})

const aboutThisSite = (page: Page) => page.getByRole('dialog', { name: 'About this site' })

/** Chooses the folder; the app opens the workspace that was open, now the folder's. */
async function keepInFolder(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'About this site' }).click()
  await aboutThisSite(page).getByRole('button', { name: 'Keep in a folder' }).click()
  await expect(page).toHaveURL(/\/w\/my-workspace$/)
  await page.getByRole('button', { name: 'About this site' }).click()
  await expect(aboutThisSite(page)).toContainText(`Kept in the folder ${FOLDER}`)
  await page.keyboard.press('Escape')
}

test('J71 The workspaces are files in a folder, and what changes there shows in the app', async ({ page, editor, consoleErrors }) => {
  await pickerChooses(page)
  await editor.open()
  await editor.addElement('Person', 'Customer')

  // What the browser kept goes into the folder.
  await keepInFolder(page)
  await expect(editor.element('Customer')).toBeVisible()
  await expect.poll(() => fileNames(page)).toEqual(['my-workspace.drillgram.json'])

  // Every change is in the file at once; a reload reads the folder.
  await editor.addElement('Software System', 'Online Shop')
  await expect.poll(async () => (await readFile(page, 'my-workspace.drillgram.json')).entries.map((entry) => entry.event?.name)).toEqual(['Customer', 'Online Shop'])
  await page.reload()
  await expect(editor.element('Customer')).toBeVisible()
  await expect(editor.element('Online Shop')).toBeVisible()

  // A file put into the folder is a workspace.
  await writeFile(page, 'billing.drillgram.json', { format: 'drillgram-workspace', version: 1, name: 'Billing', entries: [added('b1', 'Invoices')] })
  await editor.workspace.click()
  await expect(page.getByRole('menuitemradio')).toHaveText(['Billing', 'My workspace'])
  await page.keyboard.press('Escape')

  // A change from outside shows without a reload.
  const mine = await readFile(page, 'my-workspace.drillgram.json')
  await writeFile(page, 'my-workspace.drillgram.json', { ...mine, entries: [...mine.entries, added('m1', 'Mail')] })
  await expect(editor.element('Mail')).toBeVisible()
  // Written anew, shorter: the file is the workspace.
  await writeFile(page, 'my-workspace.drillgram.json', { ...mine, entries: mine.entries.slice(0, 1) })
  await expect(editor.element('Online Shop')).toHaveCount(0)
  await expect(editor.element('Mail')).toHaveCount(0)
  await expect(editor.element('Customer')).toBeVisible()
  // And changes go on from there.
  await editor.addElement('Software System', 'Payments')
  await expect.poll(async () => (await readFile(page, 'my-workspace.drillgram.json')).entries.map((entry) => entry.event?.name)).toEqual(['Customer', 'Payments'])

  await editor.workspace.click()
  await page.getByRole('menuitemradio', { name: 'Billing' }).click()
  await expect(editor.element('Invoices')).toBeVisible()
  expect(consoleErrors).toEqual([])
})

test('J71 A browser that asks again for the folder opens it after a press', async ({ page, editor }) => {
  await pickerChooses(page)
  await editor.open()
  await keepInFolder(page)
  await editor.addElement('Person', 'Customer')
  await expect.poll(() => fileNames(page)).toEqual(['my-workspace.drillgram.json'])

  // From now on the browser has forgotten that it may open the folder.
  await page.addInitScript(() => {
    let allowed = false
    const handle = FileSystemHandle.prototype as unknown as Record<string, unknown>
    handle.queryPermission = async () => (allowed ? 'granted' : 'prompt')
    handle.requestPermission = async () => {
      allowed = true
      return 'granted'
    }
  })
  await page.reload()
  const asking = page.getByRole('dialog', { name: 'Open your folder' })
  await expect(asking).toContainText(`Your diagrams are in the folder ${FOLDER}`)
  await asking.getByRole('button', { name: 'Open the folder' }).click()
  await expect(asking).toHaveCount(0)
  await expect(editor.element('Customer')).toBeVisible()
})

test('J71 Back to the browser: what it kept is there as it was, and the files stay', async ({ page, editor }) => {
  await pickerChooses(page)
  await editor.open()
  await editor.addElement('Person', 'Customer')
  await keepInFolder(page)
  await editor.addElement('Software System', 'Online Shop')
  await expect.poll(async () => (await readFile(page, 'my-workspace.drillgram.json')).entries.length).toBe(2)

  await page.getByRole('button', { name: 'About this site' }).click()
  await aboutThisSite(page).getByRole('button', { name: 'Keep in this browser instead' }).click()
  await expect(editor.element('Customer')).toBeVisible()
  await expect(editor.element('Online Shop')).toHaveCount(0)
  await page.getByRole('button', { name: 'About this site' }).click()
  await expect(aboutThisSite(page)).toContainText('Kept in this browser')
  expect(await fileNames(page)).toEqual(['my-workspace.drillgram.json'])
})

test('J71 A browser that cannot open folders does not offer one', async ({ page, editor }) => {
  await page.addInitScript(() => delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker)
  await editor.open()
  await page.getByRole('button', { name: 'About this site' }).click()
  await expect(aboutThisSite(page)).toContainText('Kept in this browser')
  await expect(aboutThisSite(page).getByRole('button', { name: 'Keep in a folder' })).toHaveCount(0)
})
