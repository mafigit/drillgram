import { test, expect } from './fixtures.ts'
import type { Locator } from '@playwright/test'

// J52 Frames that hold cards: docs/journeys.md#j52-frames-that-hold-cards

const boxOf = async (locator: Locator) => (await locator.boundingBox())!
type Box = Awaited<ReturnType<typeof boxOf>>
const holds = (frame: Box, card: Box) =>
  frame.x <= card.x && frame.y <= card.y && frame.x + frame.width >= card.x + card.width && frame.y + frame.height >= card.y + card.height
const apart = (a: Box, b: Box) => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y

test('J52 Cards of a view stand in frames with a name, as the nodes of a deployment diagram', async ({ editor, page, consoleErrors }) => {
  await editor.open()
  await editor.addElement('Software System', 'Netbank')
  await editor.drillDown('Netbank')
  await editor.addElement('Container', 'Netbank BE')
  await editor.addElement('Container', 'Netbank DB')
  await editor.addElement('Container', 'Netbank Events')
  await editor.connect('Netbank BE', 'Netbank DB', 'Reads')
  await editor.addView('Deployment')

  // Nothing to group with nothing selected.
  await editor.canvas.click({ position: { x: 5, y: 300 } })
  await expect(page.getByRole('button', { name: 'Group', exact: true })).toHaveCount(0)

  // One card in a frame: its name and what it is stand on the frame, which is around the card only.
  await editor.groupCards(['Netbank BE'], 'prod-appsvc-netbankbe', 'Deployment Node: Azure App Service')
  await expect(editor.groups).toHaveCount(1)
  const node = editor.group('prod-appsvc-netbankbe')
  await expect(node).toContainText('prod-appsvc-netbankbe')
  await expect(node).toContainText('[Deployment Node: Azure App Service]')
  expect(holds(await boxOf(node), await boxOf(editor.element('Netbank BE')))).toBe(true)
  expect(apart(await boxOf(node), await boxOf(editor.element('Netbank DB')))).toBe(true)
  await expect(editor.key).toContainText('Group')

  // Two cards in a second frame; the frame goes with a card that is moved.
  await editor.groupCards(['Netbank DB', 'Netbank Events'], 'prod-data')
  await expect(editor.groups).toHaveCount(2)
  const data = editor.group('prod-data')
  await editor.move('Netbank Events', { x: 0, y: 220 })
  await expect.poll(async () => holds(await boxOf(data), await boxOf(editor.element('Netbank Events')))).toBe(true)
  expect(holds(await boxOf(data), await boxOf(editor.element('Netbank DB')))).toBe(true)

  // The frames are of this view: the first view of the box has none.
  await editor.views.nth(0).click()
  await expect(editor.groups).toHaveCount(0)
  await expect(editor.key).not.toContainText('Group')
  await editor.views.nth(1).click()
  await expect(editor.groups).toHaveCount(2)

  // A card joins a frame that is there: it leaves its own, which goes with its last card.
  await editor.element('Netbank BE').click()
  await page.getByRole('button', { name: 'Group', exact: true }).click()
  const form = page.getByRole('form', { name: 'Group the selection' })
  await form.getByRole('combobox', { name: 'Group' }).selectOption('prod-data')
  await form.getByRole('button', { name: 'Group', exact: true }).click()
  await expect(editor.groups).toHaveCount(1)
  expect(holds(await boxOf(data), await boxOf(editor.element('Netbank BE')))).toBe(true)

  // A press on the name of a frame selects its cards; "Ungroup" takes the selected ones out.
  await editor.canvas.click({ position: { x: 5, y: 300 } })
  await expect(page.getByRole('button', { name: 'Ungroup' })).toHaveCount(0)
  await editor.element('Netbank BE').click()
  await page.getByRole('button', { name: 'Ungroup' }).click()
  await expect(editor.groups).toHaveCount(1)
  expect(holds(await boxOf(data), await boxOf(editor.element('Netbank BE')))).toBe(false)
  await page.getByRole('button', { name: 'Group prod-data', exact: true }).click()
  await page.keyboard.press('ControlOrMeta+d')
  await expect(editor.element('Netbank DB copy')).toBeVisible()
  await expect(editor.element('Netbank Events copy')).toBeVisible()
  await expect(editor.element('Netbank BE copy')).toHaveCount(0)

  // A double-click on the name opens the frame: another name, what it is, or no frame at all.
  await page.getByRole('button', { name: 'Group prod-data', exact: true }).dblclick()
  const edit = page.getByRole('form', { name: 'Edit the group' })
  await edit.getByRole('textbox', { name: 'Title' }).fill('prod-mssql')
  await edit.getByRole('textbox', { name: 'What it is' }).fill('Deployment Node: Azure SQL Server')
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(editor.group('prod-mssql')).toContainText('[Deployment Node: Azure SQL Server]')
  await page.reload()
  await expect(editor.group('prod-mssql')).toBeVisible()
  await page.getByRole('button', { name: 'Group prod-mssql', exact: true }).dblclick()
  await edit.getByRole('button', { name: 'Delete the group' }).click()
  await expect(editor.groups).toHaveCount(0)
  await expect(editor.element('Netbank DB')).toBeVisible()
  await expect(editor.element('Netbank Events')).toBeVisible()
  await editor.undo()
  await expect(editor.group('prod-mssql')).toBeVisible()

  // The frame has a button of its own to delete it, in sight: the cards stay.
  await editor.fitToScreen()
  await page.getByRole('button', { name: 'Delete the group prod-mssql' }).click()
  await expect(editor.groups).toHaveCount(0)
  await expect(editor.element('Netbank DB')).toBeVisible()
  await editor.undo()
  await expect(editor.groups).toHaveCount(1)

  await editor.openHistory()
  await expect(editor.changes.filter({ hasText: 'Grouped "Netbank BE" as "prod-appsvc-netbankbe"' })).toHaveCount(1)
  expect(consoleErrors).toEqual([])
})

test('J52 Only the cards inside the opened box are grouped, not what stands outside its frame', async ({ editor, page }) => {
  await editor.open()
  await editor.addElement('Software System', 'Netbank')
  await editor.addElement('Software System', 'IDP')
  await editor.drillDown('Netbank')
  await editor.addElement('Container', 'Netbank BE')
  await editor.addExisting('IDP')

  // A card from outside alone: nothing to group, and the key for it says why.
  await editor.element('IDP').click()
  await expect(page.getByRole('button', { name: 'Group', exact: true })).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+g')
  await expect(editor.errors).toHaveText(['Cards outside the frame are grouped on a diagram they are on, not here.'])

  // Selected with a card of the box, it is left out of the frame.
  await editor.groupCards(['Netbank BE', 'IDP'], 'prod')
  await expect(editor.groups).toHaveCount(1)
  const [frame, inside, outside] = await Promise.all([editor.group('prod'), editor.element('Netbank BE'), editor.element('IDP')].map(boxOf))
  expect(holds(frame!, inside!)).toBe(true)
  expect(apart(frame!, outside!)).toBe(true)
})

test('J52 Arrange keeps the cards of a frame together and the frames apart from each other and from other cards', async ({ editor, consoleErrors }) => {
  await editor.open()
  for (const name of ['BE', 'DB', 'Events', 'Files', 'Cache', 'Gateway']) await editor.addElement('Software System', name)
  await editor.connect('Gateway', 'BE', 'Calls')
  await editor.connect('BE', 'DB', 'Reads')
  await editor.connect('BE', 'Events', 'Publishes')
  await editor.connect('BE', 'Files', 'Stores')
  await editor.connect('Cache', 'DB', 'Fills from')
  // Frames whose cards do not stand side by side: each is around a card of another frame.
  await editor.groupCards(['BE', 'Events'], 'app', 'Deployment Node')
  await editor.groupCards(['DB', 'Cache'], 'data', 'Deployment Node')
  await editor.groupCards(['Files'], 'blob')

  const frames = { app: ['BE', 'Events'], data: ['DB', 'Cache'], blob: ['Files'] }
  const check = async () => {
    const boxes = Object.fromEntries(await Promise.all(Object.keys(frames).map(async (name) => [name, await boxOf(editor.group(name))] as const)))
    const cards = Object.fromEntries(await Promise.all(['BE', 'DB', 'Events', 'Files', 'Cache', 'Gateway'].map(async (name) => [name, await boxOf(editor.element(name))] as const)))
    const wrong: string[] = []
    for (const [name, members] of Object.entries(frames)) {
      for (const [card, box] of Object.entries(cards)) {
        // Its own cards inside, every other card clear of it.
        if (members.includes(card) ? !holds(boxes[name]!, box) : !apart(boxes[name]!, box)) wrong.push(`${name}/${card}`)
      }
      for (const other of Object.keys(frames)) if (other > name && !apart(boxes[name]!, boxes[other]!)) wrong.push(`${name}/${other}`)
    }
    return wrong
  }
  expect(await check()).not.toEqual([])

  await editor.arrange()
  await expect.poll(check, { timeout: 10_000 }).toEqual([])
  await expect(editor.arrangeButton).toBeEnabled()

  // One change: one undo puts every card back.
  await editor.undo()
  await expect(editor.groups).toHaveCount(3)
  expect(consoleErrors).toEqual([])
})
