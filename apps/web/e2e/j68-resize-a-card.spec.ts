import { test, expect } from './fixtures.ts'
import type { Locator } from '@playwright/test'

// J68 Resize a card: docs/journeys.md#j68-resize-a-card

const boxOf = async (card: Locator) => (await card.boundingBox())!

test('J68 A card is made larger or smaller at its corners, as one change', async ({ editor, page, consoleErrors }) => {
  await editor.open()
  const notes = await editor.addElement('Box', 'Notes')
  await editor.addShape('Basic', 'Database', 'Orders DB')
  const db = editor.element('Orders DB')
  // Away from the title, which lies over the top left corner.
  await editor.pan({ x: 120, y: 160 })

  // Unselected, a card offers nothing to resize.
  await editor.clickCanvas()
  await expect(notes.getByTestId('resize-bottom-right')).toHaveCount(0)

  // The bottom right corner: the card grows that way, its top left corner stays.
  const before = await boxOf(notes)
  const scale = before.width / 220
  await editor.resize('Notes', 'bottom-right', { x: 60, y: 80 }, scale)
  await expect.poll(async () => Math.round((await boxOf(notes)).width / scale)).toBe(280)
  await expect.poll(async () => Math.round((await boxOf(notes)).height / scale)).toBe(200)
  const grown = await boxOf(notes)
  expect(Math.abs(grown.x - before.x)).toBeLessThan(2)
  expect(Math.abs(grown.y - before.y)).toBeLessThan(2)

  // A shape is drawn at the new size.
  const dbBefore = await boxOf(db)
  await editor.resize('Orders DB', 'bottom-right', { x: 0, y: 60 }, scale)
  await expect.poll(async () => Math.round((await boxOf(db)).height / scale)).toBe(180)
  await expect.poll(async () => (await db.getByTestId('card-shape').boundingBox())!.height / scale).toBeCloseTo(180, -1)
  expect(Math.abs((await boxOf(db)).width - dbBefore.width)).toBeLessThan(2)

  // The top left corner: the card grows up and left, its bottom right corner stays.
  await editor.resize('Notes', 'top-left', { x: -40, y: -40 }, scale)
  await expect.poll(async () => Math.round((await boxOf(notes)).width / scale)).toBe(320)
  const fromTop = await boxOf(notes)
  expect(Math.abs(fromTop.x + fromTop.width - (grown.x + grown.width))).toBeLessThan(2)
  expect(Math.abs(fromTop.y + fromTop.height - (grown.y + grown.height))).toBeLessThan(2)

  // Each resize is one change, and one undo takes it back.
  await editor.openHistory()
  await expect(editor.changes).toHaveCount(5)
  await expect(editor.changes.nth(2)).toContainText('Resized "Notes"')
  await expect(editor.changes.nth(3)).toContainText('Resized "Orders DB"')
  await expect(editor.changes.nth(4)).toContainText('Resized "Notes"')
  await editor.undo()
  await expect.poll(async () => Math.round((await boxOf(notes)).width / scale)).toBe(280)

  // The size is kept.
  await page.reload()
  await expect.poll(async () => Math.round((await boxOf(editor.element('Notes'))).width / scale)).toBe(280)
  expect(consoleErrors).toEqual([])
})

test('J68 A card cannot be made to reach into another one', async ({ editor, page }) => {
  await editor.open()
  const notes = await editor.addElement('Box', 'Notes')
  const other = await editor.addElement('Box', 'Neighbour')
  const before = await boxOf(notes)
  const scale = before.width / 220
  const gap = ((await boxOf(other)).x - (before.x + before.width)) / scale

  await editor.resize('Notes', 'bottom-right', { x: gap + 60, y: 0 }, scale)

  // It goes back to its size and says why.
  await expect(page.getByRole('alert')).toContainText('"Notes" would reach into another card')
  await expect.poll(async () => Math.round((await boxOf(notes)).width / scale)).toBe(220)
  await editor.openHistory()
  await expect(editor.changes).toHaveCount(2)
})

test('J68 A locked workspace offers no resizing', async ({ editor }) => {
  await editor.open()
  const notes = await editor.addElement('Box', 'Notes')
  await editor.lockButton.click()
  await notes.click()
  await expect(notes.getByTestId('resize-bottom-right')).toHaveCount(0)
})

test('J68 A selected card still connects from its right side', async ({ editor }) => {
  await editor.open()
  const notes = await editor.addElement('Box', 'Notes')
  await editor.addElement('Box', 'Neighbour')
  await notes.getByText('Notes', { exact: true }).click()
  await expect(notes.getByTestId('resize-bottom-right')).toBeVisible()
  await editor.connect('Notes', 'Neighbour', 'Reads')
  await expect(editor.relationship('Reads')).toBeVisible()
})

/** Whether all of an element's content shows: nothing cut off, clamped or scrolled away. */
const showsAll = (part: Locator) =>
  part.evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1)

test('J68 A card cannot be made smaller than its text', async ({ editor }) => {
  await editor.open()
  const notes = await editor.addElement('Box', 'Notes', {
    description: 'Keeps what the team agreed in the weekly meeting, who said it and when it was said.',
  })
  const service = await editor.addElement('Box', 'Customer Accounts Service')
  await editor.pan({ x: 120, y: 160 })
  const scale = (await boxOf(notes)).width / 220

  // Narrower: it stops where the text would no longer fit.
  await editor.resize('Notes', 'bottom-right', { x: -160, y: 0 }, scale)
  await expect.poll(async () => Math.round((await boxOf(notes)).width / scale)).toBeLessThan(220)
  expect(await showsAll(notes.locator('.card-text'))).toBe(true)
  expect(await showsAll(notes.locator('[data-card-name]'))).toBe(true)

  // Smaller both ways: the name still shows whole.
  await editor.resize('Customer Accounts Service', 'bottom-right', { x: -160, y: -100 }, scale)
  await expect.poll(async () => Math.round((await boxOf(service)).height / scale)).toBeLessThan(120)
  expect(await showsAll(service.locator('[data-card-name]'))).toBe(true)
})

test('J68 A size the same as a card nearby shows while resizing', async ({ editor, page }) => {
  await editor.open()
  const notes = await editor.addElement('Box', 'Notes')
  await editor.addElement('Box', 'Neighbour')
  const scale = (await boxOf(notes)).width / 220
  const marks = editor.canvas.getByTestId('size-guide')

  // Wider than "Neighbour": no mark; as wide again: a mark across each card.
  const grab = await editor.holdCorner('Notes', 'bottom-right', { x: 40, y: 0 }, scale)
  await expect.poll(async () => Math.round((await boxOf(notes)).width / scale)).toBe(260)
  await expect(marks).toHaveCount(0)
  await page.mouse.move(grab.x, grab.y, { steps: 4 })
  await expect.poll(async () => Math.round((await boxOf(notes)).width / scale)).toBe(220)
  await expect(marks).toHaveCount(2)
  await page.mouse.up()
  await expect(marks).toHaveCount(0)

  // The same for the height.
  const bottom = await editor.holdCorner('Notes', 'bottom-right', { x: 0, y: 40 }, scale)
  await expect(marks).toHaveCount(0)
  await page.mouse.move(bottom.x, bottom.y, { steps: 4 })
  await expect(marks).toHaveCount(2)
  await page.mouse.up()
  await expect(marks).toHaveCount(0)
})
