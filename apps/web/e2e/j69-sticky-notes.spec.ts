import { test, expect } from './fixtures.ts'
import type { Locator, Page } from '@playwright/test'

// J69 Stick a note on a shape: docs/journeys.md#j69-stick-a-note-on-a-shape

const boxOf = async (card: Locator) => (await card.boundingBox())!

/** Where a card stands against another, in screen pixels: left and top edge. */
const offset = async (card: Locator, from: Locator) => {
  const [a, b] = [await boxOf(card), await boxOf(from)]
  return { x: Math.round(a.x - b.x), y: Math.round(a.y - b.y) }
}

/** A sticky note has a button of its own in the toolbar, beside "Add shape"; it is its text alone. */
async function addNote(page: Page, text: string): Promise<void> {
  await page.getByRole('toolbar', { name: 'Diagram tools' }).getByRole('button', { name: 'Add sticky note' }).click()
  await page.getByRole('textbox', { name: 'Note' }).fill(text)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
}

/** Where a card stands against another in pixels of the diagram, whatever the zoom: a card is 220 wide. */
const diagramOffset = async (card: Locator, from: Locator) => {
  const [a, b] = [await boxOf(card), await boxOf(from)]
  const scale = b.width / 220
  return { x: Math.round((a.x - b.x) / scale), y: Math.round((a.y - b.y) / scale) }
}

/** Whether two boxes on the screen overlap. */
const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

test('J69 A sticky note dropped on a shape sticks there and goes where the shape goes', async ({ editor, page, consoleErrors }) => {
  await editor.open()
  const checkout = await editor.addElement('Box', 'Checkout')
  await addNote(page, 'Ask legal')
  const note = editor.element('Ask legal')
  await expect(note).toBeVisible()
  await editor.pan({ x: 120, y: 260 })

  // Loose, it is a card as any other: square, no pin, no line, and it moves by itself.
  const square = await boxOf(note)
  expect(Math.abs(square.width - square.height)).toBeLessThan(2)
  await expect(editor.pinOf('Ask legal')).toHaveCount(0)
  await expect(editor.tethers).toHaveCount(0)
  // A note has no inside to open, a box has.
  await expect(note.getByRole('button', { name: 'Open' })).toHaveCount(0)
  await expect(checkout.getByRole('button', { name: 'Open' })).toHaveCount(1)
  const looseBefore = await offset(note, checkout)
  await editor.move('Checkout', { x: 0, y: 200 })
  await expect.poll(async () => (await offset(note, checkout)).y).not.toBe(looseBefore.y)

  // Dropped on the shape, it sticks there, right where it was let go, on the shape, with a pin.
  await editor.dropOnto('Ask legal', 'Checkout')
  await expect(editor.pinOf('Ask legal')).toHaveAccessibleName('Stuck on Checkout')
  expect(overlap(await boxOf(note), await boxOf(checkout))).toBe(true)
  // A line runs to the shape only when the note lies off it.
  await expect(editor.tethers).toHaveCount(0)
  const stuck = await offset(note, checkout)

  // The shape moves: the note goes along, the same way. Held near its right edge: the note lies over the rest.
  await editor.move('Checkout', { x: 160, y: 120 }, { x: 0.94, y: 0.92 })
  await expect.poll(async () => offset(note, checkout)).toEqual(stuck)

  await editor.openHistory()
  await expect(editor.changes.nth(3)).toContainText('Stuck "Ask legal" on "Checkout"')
  await expect(editor.changes.nth(4)).toContainText('Moved "Checkout"')

  // It stays stuck after a reload.
  await page.reload()
  await expect(editor.pinOf('Ask legal')).toHaveAccessibleName('Stuck on Checkout')
  expect(consoleErrors).toEqual([])
})

test('J69 A sticky note is its Markdown alone, without a title', async ({ editor, page }) => {
  await editor.open()
  await page.getByRole('toolbar', { name: 'Diagram tools' }).getByRole('button', { name: 'Add sticky note' }).click()
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Note' }).fill('**Ask** legal\n- call them')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  // Named by its first line, without the marks.
  const note = editor.element('Ask legal')
  await expect(note.getByText('Ask', { exact: true })).toHaveCSS('font-weight', '700')
  await expect(note.getByRole('listitem')).toHaveText(['call them'])
  await expect(note.locator('[data-card-name]')).toHaveCount(0)

  // A double-click opens its text in place, with nothing of the card over the field.
  await note.getByRole('listitem').dblclick()
  const field = note.getByRole('textbox', { name: 'Description' })
  await expect(field).toBeFocused()
  await expect(note.getByTestId('resize-bottom-right')).toHaveCount(0)
  await expect(note.getByTestId('connection-handle')).toBeHidden()
  await field.fill('Ask legal **today**')
  await field.press('ControlOrMeta+Enter')
  await expect(editor.element('Ask legal today').getByText('today', { exact: true })).toHaveCSS('font-weight', '700')
})

test('J69 A sticky note on a shape changes no connector', async ({ editor, page }) => {
  await editor.open()
  // "Stock" stands between the two: the connector runs around it.
  await editor.addElement('Box', 'Checkout')
  await editor.addElement('Box', 'Stock')
  await editor.addElement('Box', 'Payment')
  await editor.connect('Checkout', 'Payment', 'Pays with')
  await editor.pan({ x: 120, y: 260 })
  // The points of the connector from the corner of "Checkout", in pixels of the diagram, whatever the zoom.
  const route = async () => {
    const card = await boxOf(editor.element('Checkout'))
    const scale = card.width / 220
    return (await editor.pointsAlong(editor.relationship('Pays with'))).map((p) => ({ x: Math.round((p.x - card.x) / scale), y: Math.round((p.y - card.y) / scale) }))
  }
  const before = await route()
  await addNote(page, 'Ask legal')
  await editor.dropOnto('Ask legal', 'Checkout')
  await expect(editor.pinOf('Ask legal')).toBeVisible()
  await expect.poll(route).toEqual(before)
})

test('J69 A sticky note stays stuck where it is moved; its pin takes it off; undo sticks it back', async ({ editor, page, consoleErrors }) => {
  await editor.open()
  const checkout = await editor.addElement('Box', 'Checkout')
  await addNote(page, 'Ask legal')
  const note = editor.element('Ask legal')
  // Away from the title, which lies over the top left corner: the note may land above the shape.
  await editor.pan({ x: 120, y: 260 })
  await editor.dropOnto('Ask legal', 'Checkout')
  await expect(editor.pinOf('Ask legal')).toBeVisible()

  // Away from the shape, onto the empty canvas: still stuck, with a line to the shape.
  await editor.move('Ask legal', { x: 0, y: 360 })
  await expect(editor.pinOf('Ask legal')).toHaveAccessibleName('Stuck on Checkout')
  await expect(editor.tethers).toHaveCount(1)
  const away = await offset(note, checkout)
  await editor.move('Checkout', { x: 160, y: 0 })
  await expect.poll(async () => offset(note, checkout)).toEqual(away)

  // A press on the pin takes it off: then it moves by itself.
  await editor.pinOf('Ask legal').click()
  await expect(editor.pinOf('Ask legal')).toHaveCount(0)
  await expect(editor.tethers).toHaveCount(0)
  await editor.move('Checkout', { x: 0, y: -160 })
  await expect.poll(async () => (await offset(note, checkout)).y).not.toBe(away.y)

  await editor.openHistory()
  await expect(editor.changes.nth(5)).toContainText('Took "Ask legal" off "Checkout"')
  await editor.undo()
  await editor.undo()
  await expect(editor.pinOf('Ask legal')).toHaveAccessibleName('Stuck on Checkout')
  expect(consoleErrors).toEqual([])
})

test('J69 While a note is dragged over a shape, the shape shows that it takes it', async ({ editor, page }) => {
  await editor.open()
  const checkout = await editor.addElement('Box', 'Checkout')
  await addNote(page, 'Ask legal')
  const [from, to] = [await boxOf(editor.element('Ask legal')), await boxOf(checkout)]
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 3, from.y + from.height / 2)
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 })
  await expect(checkout.locator('[data-takes-note]')).toHaveCount(1)
  await page.mouse.up()
  await expect(checkout.locator('[data-takes-note]')).toHaveCount(0)
})

test('J69 A sticky note that lies on a shape of a Miro board comes in stuck on it', async ({ editor, page, consoleErrors }) => {
  // A made-up board, as Miro's REST API (v2) gives it: the middle of each item and its size.
  const at = (x: number, y: number) => ({ x, y, origin: 'center', relativeTo: 'canvas_center' })
  const items = [
    { id: '1', type: 'shape', data: { content: '<p>Orders DB</p>', shape: 'can' }, position: at(0, 0), geometry: { width: 200, height: 100 } },
    { id: '2', type: 'sticky_note', data: { content: '<p>Ask legal</p>' }, position: at(90, -40), geometry: { width: 100, height: 100 } },
    { id: '3', type: 'sticky_note', data: { content: '<p>Loose idea</p>' }, position: at(900, 900), geometry: { width: 100, height: 100 } },
  ]
  await page.route('https://api.miro.com/**', (route) => {
    const data = new URL(route.request().url()).pathname.endsWith('/items') ? items : []
    return route.fulfill({ json: { data, total: data.length, size: data.length, limit: 50, links: {}, type: 'cursor-list' } })
  })
  await editor.open()
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Miro' }).click()
  await page.getByText('Or read a whole board, with an access token').click()
  await page.getByRole('textbox', { name: 'Board link' }).fill('https://miro.com/app/board/uXjVMadeUp0=/')
  await page.getByLabel('Access token').fill('made-up-token')
  await page.getByRole('button', { name: 'Import from Miro' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await expect(editor.pinOf('Ask legal')).toHaveAccessibleName('Stuck on Orders DB')
  await expect(editor.pinOf('Loose idea')).toHaveCount(0)
  await expect(editor.element('Ask legal')).toContainText('Ask legal')
  // Square, as a note of paper is.
  const square = await boxOf(editor.element('Loose idea'))
  expect(Math.abs(square.width - square.height)).toBeLessThan(2)
  expect(consoleErrors).toEqual([])
})

test('J69 Sticky notes can be hidden and shown again; hidden they stay hidden after a reload', async ({ editor, page, consoleErrors }) => {
  await editor.open()
  await editor.addElement('Box', 'Checkout')
  await addNote(page, 'Ask legal')
  await editor.pan({ x: 120, y: 260 })
  await editor.dropOnto('Ask legal', 'Checkout')
  await editor.move('Ask legal', { x: 0, y: 300 })
  await expect(editor.tethers).toHaveCount(1)

  const hide = page.getByRole('button', { name: 'Hide sticky notes' })
  await hide.click()
  await expect(editor.element('Ask legal')).toHaveCount(0)
  await expect(editor.tethers).toHaveCount(0)
  await expect(editor.element('Checkout')).toBeVisible()
  await page.reload()
  await expect(editor.element('Checkout')).toBeVisible()
  await expect(editor.element('Ask legal')).toHaveCount(0)

  await page.getByRole('button', { name: 'Show sticky notes' }).click()
  await expect(editor.pinOf('Ask legal')).toHaveAccessibleName('Stuck on Checkout')
  await expect(editor.tethers).toHaveCount(1)
  expect(consoleErrors).toEqual([])
})

test('J69 Arrange lays the shapes out as if there were no notes, then only keeps the notes clear', async ({ editor, page, consoleErrors }) => {
  await editor.open()
  const checkout = await editor.addElement('Box', 'Checkout')
  const payment = await editor.addElement('Box', 'Payment')
  await editor.connect('Checkout', 'Payment', 'Pays with')
  await editor.pan({ x: 120, y: 260 })
  await editor.arrange()
  await expect(editor.arrangeButton).toBeEnabled()
  const arranged = await diagramOffset(payment, checkout)

  await addNote(page, 'Ask legal')
  await addNote(page, 'Loose idea')
  await editor.dropOnto('Ask legal', 'Checkout')
  await expect(editor.pinOf('Ask legal')).toBeVisible()
  await editor.move('Payment', { x: 0, y: 300 })
  await expect.poll(async () => diagramOffset(payment, checkout)).not.toEqual(arranged)

  await editor.arrange()
  // The shapes lie as they did without the notes.
  await expect.poll(async () => diagramOffset(payment, checkout)).toEqual(arranged)
  await expect(editor.arrangeButton).toBeEnabled()
  // The notes are still there, the one still stuck; the loose one lies on nothing.
  await expect(editor.pinOf('Ask legal')).toHaveAccessibleName('Stuck on Checkout')
  const cards = await Promise.all(['Checkout', 'Payment', 'Ask legal', 'Loose idea'].map((name) => boxOf(editor.element(name))))
  expect(overlap(cards[0]!, cards[1]!)).toBe(false)
  for (const other of cards.slice(0, 3)) expect(overlap(cards[3]!, other)).toBe(false)
  expect(consoleErrors).toEqual([])
})

test('J69 A sticky note takes no icons, and another colour of paper', async ({ editor, page, consoleErrors }) => {
  await editor.open()
  await addNote(page, 'Ask legal')
  const note = editor.element('Ask legal')
  await note.click()
  await expect(note.getByRole('button', { name: 'Icons' })).toHaveCount(0)
  await expect(note.locator('[data-fill="yellow"]')).toHaveCount(1)

  await note.getByRole('button', { name: 'Colour' }).click()
  await note.getByRole('button', { name: 'Green' }).click()
  await expect(note.locator('[data-fill="green"]')).toHaveCount(1)
  await expect(note.getByRole('button', { name: 'Green' })).toHaveCount(0)

  await editor.openHistory()
  await expect(editor.changes.nth(1)).toContainText('Coloured "Ask legal" green')
  await page.reload()
  await expect(editor.element('Ask legal').locator('[data-fill="green"]')).toHaveCount(1)
  expect(consoleErrors).toEqual([])
})

test('J69 A sticky note dragged from the toolbar lands where it is let go; on a shape it sticks there', async ({ editor, page, consoleErrors }) => {
  await editor.open()
  const checkout = await editor.addElement('Box', 'Checkout')
  await editor.pan({ x: 120, y: 260 })
  const canvas = (await editor.canvas.boundingBox())!

  // On the empty canvas: its middle on the point, loose.
  const to = { x: Math.round(canvas.x + canvas.width * 0.7), y: Math.round(canvas.y + canvas.height * 0.3) }
  await editor.dragFromToolbar('Add sticky note', to)
  await page.getByRole('textbox', { name: 'Note' }).fill('Loose idea')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const loose = (await boxOf(editor.element('Loose idea')))
  expect(Math.abs(loose.x + loose.width / 2 - to.x)).toBeLessThan(30)
  expect(Math.abs(loose.y + loose.height / 2 - to.y)).toBeLessThan(30)
  await expect(editor.pinOf('Loose idea')).toHaveCount(0)

  // On the shape: it stays on it, stuck.
  const on = await boxOf(checkout)
  await editor.dragFromToolbar('Add sticky note', { x: on.x + on.width * 0.7, y: on.y + on.height * 0.6 })
  await page.getByRole('textbox', { name: 'Note' }).fill('Ask legal')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(editor.pinOf('Ask legal')).toHaveAccessibleName('Stuck on Checkout')
  expect(overlap(await boxOf(editor.element('Ask legal')), await boxOf(checkout))).toBe(true)
  expect(consoleErrors).toEqual([])
})
