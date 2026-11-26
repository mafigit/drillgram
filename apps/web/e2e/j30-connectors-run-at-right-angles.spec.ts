import { test, expect } from './fixtures.ts'
import type { Locator } from '@playwright/test'

type Box = { x: number; y: number; width: number; height: number }

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Not visible')
  return box
}

// J30 Connectors run at right angles: docs/journeys.md#j30-connectors-run-at-right-angles
test('J30 A connector between two cards out of line has bends, not a slant', async ({ page, editor }) => {
  await editor.open()
  const shop = await editor.addElement('Software System', 'Online Shop')
  const billing = await editor.addElement('Software System', 'Billing')
  await editor.connect('Billing', 'Online Shop', 'Charges for')
  const connector = editor.relationship('Charges for')
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

  // Below Online Shop (120 high) with 100 px between them, 60 px out of line to the left.
  await editor.hold('Billing', { x: -320 - 60, y: 120 + 100 }, scale)
  const shopBox = await boxOf(shop)
  const seenFromShop = async (card: Locator) => {
    const box = await boxOf(card)
    return { x: Math.round((box.x - shopBox.x) / scale), y: Math.round((box.y - shopBox.y) / scale) }
  }
  await expect.poll(() => seenFromShop(preview)).toEqual({ x: -60, y: 220 })
  // The line runs to where Billing will land. One piece would be a line from card to card.
  const pieces = async () => {
    const path = await connector.locator('path.vue-flow__edge-path').getAttribute('d')
    return path?.match(/[LQ]/g)?.length ?? 0
  }
  await expect.poll(pieces).toBeGreaterThan(1)
  expect(await editor.slantedPieces(connector)).toBe(0)

  await page.mouse.up()
  await expect(preview).toHaveCount(0)
  await expect.poll(() => seenFromShop(billing)).toEqual({ x: -60, y: 220 })
  await expect.poll(pieces).toBeGreaterThan(1)
  expect(await editor.slantedPieces(connector)).toBe(0)
})
