import { test, expect } from './fixtures.ts'
import type { Locator } from '@playwright/test'

type Box = { x: number; y: number; width: number; height: number }

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Not visible')
  return box
}

// J29 A dropped card lands in line with its connection:
// docs/journeys.md#j29-a-dropped-card-lands-in-line-with-its-connection
test('J29 A card dropped on the card it is connected to lands straight below it', async ({ page, editor }) => {
  await editor.open()
  const shop = await editor.addElement('Software System', 'Online Shop')
  const billing = await editor.addElement('Software System', 'Billing')
  await editor.connect('Online Shop', 'Billing', 'Pays')
  const connector = editor.relationship('Pays')
  const preview = editor.canvas.getByTestId('drop-preview')

  // The two cards start 320 px apart, side by side: that tells how large the diagram is shown.
  // After a card is added the canvas may still be zooming to show it: wait until that has settled.
  const scaleNow = async () => ((await boxOf(billing)).x - (await boxOf(shop)).x) / 320
  let scale = await scaleNow()
  await expect
    .poll(async () => {
      const before = scale
      scale = await scaleNow()
      return scale === before
    })
    .toBe(true)
  expect((await boxOf(billing)).y).toBe((await boxOf(shop)).y)

  // Held on top of Online Shop, 40 px to the right of and 40 px below where that card lies.
  await editor.hold('Billing', { x: -320 + 40, y: 40 }, scale)
  await expect(preview).toBeVisible()
  const shopBox = await boxOf(shop)
  // Where Billing will land, seen from Online Shop, in px of the diagram.
  const landing = async (card: Locator) => {
    const box = await boxOf(card)
    return { x: Math.round((box.x - shopBox.x) / scale), y: Math.round((box.y - shopBox.y) / scale) }
  }
  // The same column, and below Online Shop (120 high) with the gap of a labelled connection.
  await expect.poll(() => landing(preview)).toMatchObject({ x: 0 })
  const place = await landing(preview)
  expect(place.y).toBeGreaterThanOrEqual(120 + 60)
  expect(place.y).toBeLessThanOrEqual(120 + 100)

  await page.mouse.up()
  await expect(preview).toHaveCount(0)
  await expect.poll(() => landing(billing)).toEqual(place)

  // One straight, upright line.
  await expect
    .poll(async () => {
      const xs = (await editor.pointsAlong(connector)).map((p) => Math.round(p.x))
      return Math.max(...xs) - Math.min(...xs)
    })
    .toBeLessThanOrEqual(1)
})
