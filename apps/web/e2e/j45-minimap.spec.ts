import { test, expect } from './fixtures.ts'

// J45 Minimap: docs/journeys.md#j45-minimap
test('J45 A minimap at the top right shows the diagram and moves the view', async ({ editor, page, consoleErrors }) => {
  await editor.open()
  const minimap = editor.canvas.getByRole('img', { name: 'Minimap' })
  // Nothing to show yet.
  await expect(minimap).toHaveCount(0)

  const shop = await editor.addElement('Software System', 'Online Shop')
  await editor.addElement('Software System', 'Billing')
  await expect(minimap).toBeVisible()
  // In the top right corner of the canvas.
  const [map, canvas] = [(await minimap.boundingBox())!, (await editor.canvas.boundingBox())!]
  expect(map.x).toBeGreaterThan(canvas.x + canvas.width / 2)
  expect(map.x + map.width).toBeLessThanOrEqual(canvas.x + canvas.width)
  expect(map.y).toBeGreaterThanOrEqual(canvas.y)
  expect(map.y + map.height).toBeLessThan(canvas.y + canvas.height / 2)

  // Dragging in it moves the view: the cards go to another place on the screen.
  const before = (await shop.boundingBox())!
  const middle = { x: map.x + map.width / 2, y: map.y + map.height / 2 }
  await page.mouse.move(middle.x, middle.y)
  await page.mouse.down()
  await page.mouse.move(middle.x + 30, middle.y + 20, { steps: 6 })
  await page.mouse.up()
  await expect
    .poll(async () => {
      const now = (await shop.boundingBox())!
      return Math.hypot(now.x - before.x, now.y - before.y)
    })
    .toBeGreaterThan(20)

  // Inside a box, its frame is in the minimap too, around the cards that are its parts.
  await expect(minimap.getByTestId('minimap-frame')).toHaveCount(0)
  await editor.fitToScreen()
  await editor.connect('Online Shop', 'Billing', 'Pays')
  await editor.drillDown('Online Shop')
  await editor.addElement('Container', 'Web App')
  const frame = minimap.getByTestId('minimap-frame')
  await expect(frame).toBeVisible()
  // Two cards: "Web App" inside the frame, the neighbour "Billing" outside it.
  const cards = minimap.getByTestId('minimap-card')
  await expect(cards).toHaveCount(2)
  await expect
    .poll(async () => {
      const [outer, mapNow] = [(await frame.boundingBox())!, (await minimap.boundingBox())!]
      const boxes = await Promise.all((await cards.all()).map(async (card) => (await card.boundingBox())!))
      const inside = boxes.filter(
        (box) => box.x >= outer.x && box.y >= outer.y && box.x + box.width <= outer.x + outer.width && box.y + box.height <= outer.y + outer.height,
      ).length
      const shown = outer.x >= mapNow.x && outer.y >= mapNow.y && outer.x + outer.width <= mapNow.x + mapNow.width && outer.y + outer.height <= mapNow.y + mapNow.height
      return { inside, shown }
    })
    .toEqual({ inside: 1, shown: true })
  // The frame in the minimap goes with its cards: wider after a second part was added beside the first.
  const widthBefore = (await frame.boundingBox())!.width / (await minimap.boundingBox())!.width
  await editor.addElement('Container', 'API')
  await expect(cards).toHaveCount(3)
  await expect.poll(async () => (await frame.boundingBox())!.width / (await minimap.boundingBox())!.width).toBeGreaterThan(widthBefore)

  // It makes room for the history, which opens in the same corner.
  await editor.openHistory()
  await expect(minimap).toHaveCount(0)
  await editor.openHistory()
  await expect(minimap).toBeVisible()
  expect(consoleErrors).toEqual([])
})
