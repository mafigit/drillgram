import { test, expect } from './fixtures.ts'
import type { Locator } from '@playwright/test'

type Box = { x: number; y: number; width: number; height: number }

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Not visible')
  return box
}

// J26 Cards snap to the grid and line up: docs/journeys.md#j26-cards-snap-to-the-grid-and-line-up
test('J26 A dragged card moves on the grid and shows when it is in line with another', async ({ page, editor }) => {
  await editor.open()
  const shop = await editor.addElement('Software System', 'Online Shop')
  const billing = await editor.addElement('Software System', 'Billing')
  const warehouse = await editor.addElement('Software System', 'Warehouse')
  const guides = editor.canvas.getByTestId('alignment-guide')
  await expect(guides).toHaveCount(0)

  // Billing and Warehouse stay 320 px apart: that tells how large the diagram is shown. After a
  // card is added the canvas may still be zooming to show it: wait until that has settled.
  const scaleNow = async () => ((await boxOf(warehouse)).x - (await boxOf(billing)).x) / 320
  let scale = await scaleNow()
  await expect
    .poll(async () => {
      const before = scale
      scale = await scaleNow()
      return scale === before
    })
    .toBe(true)
  // How far Online Shop is from Billing, in steps of the grid (20 px of the diagram).
  const steps = async () => {
    const [a, b] = [await boxOf(billing), await boxOf(shop)]
    return { x: (b.x - a.x) / scale / 20, y: (b.y - a.y) / scale / 20 }
  }
  const onGrid = (offset: { x: number; y: number }) =>
    Math.abs(offset.x - Math.round(offset.x)) < 0.01 && Math.abs(offset.y - Math.round(offset.y)) < 0.01

  // Held below Billing, a few pixels beside its column: it sits in the column, and a guide through
  // both cards says so. (Billing is the middle card: near the edge of the screen the canvas
  // would start to scroll.)
  await editor.hold('Online Shop', { x: 320 + 7, y: 203 }, scale)
  await expect.poll(async () => Math.abs((await steps()).x)).toBeLessThan(0.01)
  expect(onGrid(await steps())).toBe(true)
  await expect(guides).toHaveCount(1)

  await page.mouse.up()
  await expect(guides).toHaveCount(0)
  expect(Math.abs((await steps()).x)).toBeLessThan(0.01)

  // Held 70 px to the right of that: on the grid, in line with no card, and no guide.
  await editor.hold('Online Shop', { x: 70, y: 0 }, scale)
  await expect.poll(async () => Math.abs((await steps()).x)).toBeGreaterThan(2)
  expect(onGrid(await steps())).toBe(true)
  await expect(guides).toHaveCount(0)

  // It can be dropped there.
  const held = await boxOf(shop)
  await page.mouse.up()
  await expect(guides).toHaveCount(0)
  expect(await boxOf(shop)).toEqual(held)
})

test('J26 A dragged group of cards shows the guides too', async ({ page, editor }) => {
  await editor.open()
  const shop = await editor.addElement('Software System', 'Online Shop')
  const billing = await editor.addElement('Software System', 'Billing')
  const warehouse = await editor.addElement('Software System', 'Warehouse')
  const guides = editor.canvas.getByTestId('alignment-guide')

  // Billing and Warehouse are 320 px apart: that tells how large the diagram is shown.
  const scaleNow = async () => ((await boxOf(warehouse)).x - (await boxOf(billing)).x) / 320
  let scale = await scaleNow()
  await expect
    .poll(async () => {
      const before = scale
      scale = await scaleNow()
      return scale === before
    })
    .toBe(true)

  // Online Shop and Billing, selected together and dragged as one: a column to the right and
  // below. Billing then hangs under Warehouse, which stays, and a guide through the two says so.
  await shop.click()
  await editor.selectAlso('Billing')
  await editor.hold('Online Shop', { x: 320 + 6, y: 203 }, scale)
  await expect.poll(async () => Math.abs((await boxOf(billing)).x - (await boxOf(warehouse)).x)).toBeLessThan(1)
  await expect(guides).toHaveCount(1)

  await page.mouse.up()
  await expect(guides).toHaveCount(0)
})
