import { test, expect } from './fixtures.ts'
import type { Locator } from '@playwright/test'

type Box = { x: number; y: number; width: number; height: number }

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Not visible')
  return box
}

/** The space between two boxes: negative when they overlap. */
function gap(a: Box, b: Box): number {
  const horizontal = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width))
  const vertical = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height))
  return Math.max(horizontal, vertical)
}

// J23 Cards snap to a free place: docs/journeys.md#j23-cards-snap-to-a-free-place
test('J23 A card dropped on another one lands on the previewed free place', async ({ page, editor }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  await editor.addElement('Software System', 'Billing')
  const shop = editor.element('Online Shop')
  const billing = editor.element('Billing')
  const preview = editor.canvas.getByTestId('drop-preview')
  await expect(preview).toHaveCount(0)

  // Hold Billing right on top of Online Shop.
  const shopBox = await boxOf(shop)
  const from = await boxOf(billing)
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(shopBox.x + shopBox.width / 2 + 10, shopBox.y + shopBox.height / 2 + 6, { steps: 8 })

  await expect(preview).toBeVisible()
  const previewBox = await boxOf(preview)
  expect(gap(previewBox, shopBox)).toBeGreaterThanOrEqual(20)

  await page.mouse.up()
  await expect(preview).toHaveCount(0)
  await expect.poll(async () => boxOf(billing)).toEqual(previewBox)
  expect(gap(await boxOf(billing), await boxOf(shop))).toBeGreaterThanOrEqual(20)

  await page.reload()
  await expect.poll(async () => boxOf(editor.element('Billing'))).toEqual(previewBox)
})
