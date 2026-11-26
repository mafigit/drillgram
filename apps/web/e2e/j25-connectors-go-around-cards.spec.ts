import { test, expect } from './fixtures.ts'
import type { Locator } from '@playwright/test'

type Point = { x: number; y: number }

/** How many of the points lie inside the card, a little away from its border. */
async function inside(points: Point[], card: Locator): Promise<number> {
  const box = await card.boundingBox()
  if (!box) throw new Error('Not visible')
  const margin = 3
  return points.filter(
    (p) =>
      p.x > box.x + margin &&
      p.x < box.x + box.width - margin &&
      p.y > box.y + margin &&
      p.y < box.y + box.height - margin,
  ).length
}

// J25 Connectors go around cards: docs/journeys.md#j25-connectors-go-around-cards
test('J25 A connector goes around the card between its ends', async ({ page, editor }) => {
  await editor.open()
  const shop = await editor.addElement('Software System', 'Online Shop')
  const billing = await editor.addElement('Software System', 'Billing')
  const warehouse = await editor.addElement('Software System', 'Warehouse')
  await editor.connect('Online Shop', 'Warehouse', 'Sends parcels to')
  const connector = editor.relationship('Sends parcels to')

  const throughAnyCard = async () => {
    const points = await editor.pointsAlong(connector)
    const counts = await Promise.all([shop, billing, warehouse].map((card) => inside(points, card)))
    return counts.reduce((sum, count) => sum + count, 0)
  }
  const bends = async () => {
    const points = await editor.pointsAlong(connector)
    const ys = points.map((p) => Math.round(p.y))
    return Math.max(...ys) - Math.min(...ys) > 2
  }

  // Billing sits between the two: the connector has to bend around it.
  await expect.poll(throughAnyCard).toBe(0)
  expect(await bends()).toBe(true)

  // With Billing out of the way the connector is one straight, level line.
  await editor.move('Billing', { x: 0, y: 300 })
  await expect.poll(bends).toBe(false)
  expect(await throughAnyCard()).toBe(0)

  // Held back in the way, not yet dropped: the connector already makes room for where Billing
  // will land.
  const box = await billing.boundingBox()
  if (!box) throw new Error('Not visible')
  const grab = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  await page.mouse.move(grab.x, grab.y - 300, { steps: 6 })
  await expect.poll(bends).toBe(true)

  await page.mouse.up()
  await expect.poll(throughAnyCard).toBe(0)
  expect(await bends()).toBe(true)

  // Warehouse held on top of Billing cannot land there. The connector runs to the outlined place
  // where it will land, not to the card under the pointer.
  const [from, onto] = [await warehouse.boundingBox(), await billing.boundingBox()]
  if (!from || !onto) throw new Error('Not visible')
  await editor.hold('Warehouse', { x: onto.x - from.x + 10, y: onto.y - from.y + 6 })
  const preview = editor.canvas.getByTestId('drop-preview')
  await expect(preview).toBeVisible()
  const distanceToBorder = async (card: Locator) => {
    const box = await card.boundingBox()
    if (!box) throw new Error('Not visible')
    const end = (await editor.pointsAlong(connector)).at(-1)!
    const dx = Math.max(box.x - end.x, 0, end.x - (box.x + box.width))
    const dy = Math.max(box.y - end.y, 0, end.y - (box.y + box.height))
    const inside = Math.min(end.x - box.x, box.x + box.width - end.x, end.y - box.y, box.y + box.height - end.y)
    return dx > 0 || dy > 0 ? Math.hypot(dx, dy) : inside
  }
  // The last point taken along the line is at most 3 px before its end.
  await expect.poll(() => distanceToBorder(preview)).toBeLessThan(5)
  expect(await distanceToBorder(warehouse)).toBeGreaterThan(20)
  await page.mouse.up()
})
