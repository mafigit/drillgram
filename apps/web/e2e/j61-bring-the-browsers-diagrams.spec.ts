import { test, expect } from './fixtures.ts'

// What the app kept in a browser before it had a server: one card, "Online Shop", and the
// change that made it.
const KEPT = {
  'workspace.v1':
    '{"model":{"objects":[{"id":"OnlineShop","kind":"softwareSystem","name":"Online Shop"}],"connections":[]},"views":[{"id":"landscape","positions":{"OnlineShop":{"x":40,"y":40}},"connections":[]}]}',
  'history.v1':
    '{"base":{"model":{"objects":[],"connections":[]},"views":[{"id":"landscape","positions":{},"connections":[]}]},"log":[{"at":"2025-12-24T18:00:00.000Z","event":{"type":"objectAdded","view":"landscape","kind":"softwareSystem","name":"Online Shop"}}],"cursor":1}',
}

// J61 Bring the diagrams of this browser: docs/journeys.md#j61-bring-the-diagrams-of-this-browser
// The app saved under other names before (`ped.`, then `drillplan.`): what a browser kept under
// those is found as well.
for (const prefix of ['drillgram.', 'ped.', 'drillplan.']) {
  test(`J61 The diagrams a browser kept (as ${prefix}) come into a workspace, with their change log`, async ({ editor, page, account, browserOf, consoleErrors }) => {
    await editor.open()
    const bring = page.getByRole('button', { name: 'Bring the diagrams of this browser' })
    // A browser that kept nothing is not offered anything.
    await expect(page.getByRole('button', { name: 'Load an example' })).toBeVisible()
    await expect(bring).toHaveCount(0)

    await page.evaluate(
      ([kept, name]) => {
        for (const [key, value] of Object.entries(kept)) localStorage.setItem(name + key, value)
      },
      [KEPT, prefix] as const,
    )
    await page.reload()
    await bring.click()
    await expect(editor.element('Online Shop')).toBeVisible()
    await expect(bring).toHaveCount(0)

    // With the change that made it, at the time it was made.
    await editor.openHistory()
    await expect(editor.changes.filter({ hasText: 'Added software system "Online Shop"' })).toHaveCount(1)
    await editor.undo()
    await expect(editor.element('Online Shop')).toHaveCount(0)
    await editor.redo()
    await expect(editor.element('Online Shop')).toBeVisible()

    // It is on the server now: another browser of the user has it.
    const other = await browserOf(account)
    await other.editor.open()
    await expect(other.editor.element('Online Shop')).toBeVisible()

    // Brought once: a new, empty workspace is not offered it again. What the browser kept is
    // still there, under the app's name of today.
    await editor.delete('Online Shop')
    await page.reload()
    await expect(page.getByRole('button', { name: 'Load an example' })).toBeVisible()
    await expect(bring).toHaveCount(0)
    const keys = await page.evaluate(() => Object.keys(localStorage))
    expect(keys).toEqual(expect.arrayContaining(['drillgram.workspace.v1', 'drillgram.history.v1']))
    expect(keys.filter((key) => !key.startsWith('drillgram.'))).toEqual([])
    expect(consoleErrors).toEqual([])
  })
}
