import { test, expect } from './fixtures.ts'
import type { Locator } from '@playwright/test'

type Box = { x: number; y: number; width: number; height: number }

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Not visible')
  return box
}

const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

// J24 Room for the label: docs/journeys.md#j24-room-for-the-label
test('J24 A card dropped near a connected one leaves the label clear', async ({ page, editor }) => {
  const label = 'Sends every paid order with its invoice lines to'
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  await editor.addElement('Software System', 'Billing')
  await editor.connect('Online Shop', 'Billing', label)
  const shop = editor.element('Online Shop')
  const billing = editor.element('Billing')

  // Billing sits 100 px beside Online Shop: too close for this label. Nudge it to the right.
  const from = await boxOf(billing)
  const grab = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  await page.mouse.move(grab.x + 20, grab.y, { steps: 4 })
  await page.mouse.up()

  const text = editor.relationship(label).getByText(label)
  await expect
    .poll(async () => {
      const labelBox = await boxOf(text)
      return overlap(labelBox, await boxOf(shop)) || overlap(labelBox, await boxOf(billing))
    })
    .toBe(false)
  // It moved, and not far: the nearest place with room for the label.
  const landed = await boxOf(billing)
  expect(landed).not.toEqual(from)
  expect(Math.abs(landed.x - from.x) + Math.abs(landed.y - from.y)).toBeLessThan(400)
})
