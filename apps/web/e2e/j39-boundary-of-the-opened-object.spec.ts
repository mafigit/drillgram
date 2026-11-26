import { test, expect } from './fixtures.ts'
import type { Locator } from '@playwright/test'

type Box = { x: number; y: number; width: number; height: number }

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Not visible')
  return box
}

const holds = (outer: Box, inner: Box) =>
  inner.x > outer.x && inner.y > outer.y && inner.x + inner.width < outer.x + outer.width && inner.y + inner.height < outer.y + outer.height

// J39 The opened object is a frame around what is inside it:
// docs/journeys.md#j39-the-opened-object-is-a-frame-around-what-is-inside-it
test('J39 Inside an object its parts stand in a frame that carries its name', async ({ editor, consoleErrors }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  // The Overview shows the system as a card: no frame.
  await expect(editor.boundary).toHaveCount(0)
  await editor.drillDown('Online Shop')
  await expect(editor.boundary).toBeVisible()
  await expect(editor.boundary).toContainText('Online Shop')
  await expect(editor.boundary).toContainText('Software System')
  const web = await editor.addElement('Container', 'Web App')
  const database = await editor.addElement('Container', 'Database')
  await expect.poll(async () => holds(await boxOf(editor.boundary), await boxOf(web))).toBe(true)
  await expect.poll(async () => holds(await boxOf(editor.boundary), await boxOf(database))).toBe(true)

  // The frame goes with its cards: moved to below the other card, it is still inside.
  await editor.connect('Database', 'Web App', 'Sends every single change of an order back to')
  const scale = (await boxOf(web)).width / 220
  await editor.move('Database', { x: -320 * scale, y: 260 * scale })
  await expect.poll(async () => (await boxOf(database)).y).toBeGreaterThan((await boxOf(web)).y + 100)
  // The connector now runs upright between the two, and its long label lies beside it, further
  // out than the cards: the frame goes around the label as well.
  const label = editor.relationship('Sends every single change').getByText('Sends every single change')
  await expect.poll(async () => holds(await boxOf(editor.boundary), await boxOf(label))).toBe(true)
  await expect.poll(async () => holds(await boxOf(editor.boundary), await boxOf(database))).toBe(true)
  await expect.poll(async () => holds(await boxOf(editor.boundary), await boxOf(web))).toBe(true)

  // One level further: the container is the frame of its Component diagram.
  await editor.drillDown('Web App')
  await expect(editor.boundary).toContainText('Web App')
  await expect(editor.boundary).toContainText('Container')
  expect(consoleErrors).toEqual([])
})
