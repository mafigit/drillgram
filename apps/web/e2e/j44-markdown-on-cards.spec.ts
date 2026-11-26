import { test, expect } from './fixtures.ts'
import type { Locator } from '@playwright/test'

type Box = { x: number; y: number; width: number; height: number }

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Not visible')
  return box
}

const holds = (outer: Box, inner: Box) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height

const PLAN = `# Plan

Ship **fast**, not *sloppy*.

- [x] Model
- [ ] Editor

Run \`pnpm test\`, see [the docs](https://example.com/docs).

| Step | Owner |
| ---- | ----- |
| Build | Ann |`

// J44 Markdown on a card: docs/journeys.md#j44-markdown-on-a-card
test('J44 The text of a card is Markdown, and the card grows to hold it', async ({ editor, consoleErrors }) => {
  await editor.open()
  const plain = await editor.addElement('Box', 'Plain', { description: 'Just a sentence.' })
  const notes = await editor.addElement('Box', 'Notes', { description: PLAN })
  // "Plain" keeps the usual size, 120 high: that tells how large the diagram is shown just now.
  const scaleNow = async () => (await boxOf(plain)).height / 120
  const height = async (card: Locator) => Math.round((await boxOf(card)).height / (await scaleNow()))

  // Rendered, not shown as marks.
  await expect(notes.getByRole('heading', { name: 'Plan' })).toBeVisible()
  await expect(notes.getByText('fast', { exact: true })).toHaveCSS('font-weight', '700')
  await expect(notes.getByText('sloppy', { exact: true })).toHaveCSS('font-style', 'italic')
  await expect(notes.getByRole('listitem')).toHaveText(['Model', 'Editor'])
  await expect(notes.getByRole('checkbox')).toHaveCount(2)
  await expect(notes.getByRole('checkbox').first()).toBeChecked()
  await expect(notes.getByRole('checkbox').last()).not.toBeChecked()
  await expect(notes.getByText('pnpm test', { exact: true })).toHaveCSS('font-family', /mono/i)
  const link = notes.getByRole('link', { name: 'the docs' })
  await expect(link).toHaveAttribute('href', 'https://example.com/docs')
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(notes.getByRole('cell')).toHaveText(['Build', 'Ann'])
  await expect(notes).not.toContainText('**')
  await expect(notes).not.toContainText('# Plan')

  // The card is as tall as its text needs: all of it is inside, down to the table.
  expect(await height(notes)).toBeGreaterThan(160)
  expect(await height(plain)).toBe(120)
  await expect.poll(async () => holds(await boxOf(notes), await boxOf(notes.getByRole('table')))).toBe(true)
  // The two cards keep their gap.
  const [a, b] = [await boxOf(plain), await boxOf(notes)]
  const apart = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), b.y - (a.y + a.height), a.y - (b.y + b.height)) / (await scaleNow())
  expect(apart).toBeGreaterThanOrEqual(19)

  // A double-click on the text of a card opens it right there, as it was written.
  await plain.getByText('Just a sentence.').dblclick()
  const field = plain.getByRole('textbox', { name: 'Description' })
  await expect(field).toBeFocused()
  await expect(field).toHaveValue('Just a sentence.')
  const fieldWidth = (await boxOf(field)).width
  // The buttons above it put the marks: the selection made bold, then a list started.
  await field.selectText()
  await plain.getByRole('button', { name: 'Bold' }).click()
  await expect(field).toHaveValue('**Just a sentence.**')
  await expect(field).toBeFocused()
  await plain.getByRole('button', { name: 'List', exact: true }).click()
  await expect(field).toHaveValue(/^- \*\*Just a sentence\.\*\*/)
  await field.fill('Now **bold**.')
  await editor.page.keyboard.press('ControlOrMeta+Enter')
  await expect(field).toHaveCount(0)
  await expect(plain.getByText('bold', { exact: true })).toHaveCSS('font-weight', '700')
  // Escape leaves the text as it was.
  await plain.getByText('bold', { exact: true }).dblclick()
  await field.fill('Thrown away')
  await editor.page.keyboard.press('Escape')
  await expect(field).toHaveCount(0)
  await expect(plain).toContainText('Now bold.')
  // On the name a double-click still renames; below it, on a card without text, it starts one.
  await plain.getByText('Plain', { exact: true }).dblclick()
  await expect(plain.getByRole('textbox', { name: 'Title' })).toBeFocused()
  await editor.page.keyboard.press('Escape')
  const bare = await editor.addElement('Box', 'Bare')
  // The field is as large on the screen however small the diagram is shown.
  const zoomBefore = await scaleNow()
  await editor.page.getByRole('button', { name: 'Zoom out' }).click()
  await editor.page.getByRole('button', { name: 'Zoom out' }).click()
  await expect.poll(scaleNow).toBeLessThan(zoomBefore * 0.8)
  const bareBox = await boxOf(bare)
  await bare.dblclick({ position: { x: bareBox.width / 2, y: bareBox.height - 12 } })
  expect(Math.abs((await boxOf(bare.getByRole('textbox', { name: 'Description' }))).width - fieldWidth)).toBeLessThan(2)
  await bare.getByRole('textbox', { name: 'Description' }).fill('- one\n- two')
  await editor.page.keyboard.press('ControlOrMeta+Enter')
  await expect(bare.getByRole('listitem')).toHaveText(['one', 'two'])
  await expect.poll(() => height(plain)).toBe(120)

  // HTML written in the text is shown as text, and runs nothing.
  const unsafe = await editor.addElement('Box', 'Unsafe', { description: '<img src=x onerror="window.hacked = true"> <b>bold</b>' })
  await expect(unsafe).toContainText('<b>bold</b>')
  expect(await editor.page.evaluate(() => (window as { hacked?: boolean }).hacked)).toBeUndefined()

  // Edited to a short text, the card is as small as the others again. One change: undo brings
  // the text and the size back together.
  await editor.openEditForm('Notes')
  const form = editor.page.getByRole('form', { name: 'Edit box' })
  await expect(form.getByRole('textbox', { name: 'Description' })).toHaveValue(PLAN)
  await form.getByRole('textbox', { name: 'Description' }).fill('Short *again*.')
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(notes.getByRole('heading')).toHaveCount(0)
  await expect.poll(() => height(notes)).toBe(120)
  await editor.undo()
  await expect(notes.getByRole('heading', { name: 'Plan' })).toBeVisible()
  await expect.poll(() => height(notes)).toBeGreaterThan(160)
  expect(consoleErrors).toEqual([])
})
