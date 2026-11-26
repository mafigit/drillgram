import { test, expect } from './fixtures.ts'
import type { Locator } from '@playwright/test'

type Box = { x: number; y: number; width: number; height: number }

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Not visible')
  return box
}

// J27 Equal distances show while dragging: docs/journeys.md#j27-equal-distances-show-while-dragging
test('J27 Gaps of the same width are marked while a card is dragged', async ({ page, editor }) => {
  await editor.open()
  const shop = await editor.addElement('Software System', 'Online Shop')
  const billing = await editor.addElement('Software System', 'Billing')
  const warehouse = await editor.addElement('Software System', 'Warehouse')
  const marks = editor.canvas.getByTestId('spacing-guide')

  // Online Shop and Warehouse stay 640 px apart: that tells how large the diagram is shown. After
  // a card is added the canvas may still be zooming to show it: wait until that has settled.
  const scaleNow = async () => ((await boxOf(warehouse)).x - (await boxOf(shop)).x) / 640
  let scale = await scaleNow()
  await expect
    .poll(async () => {
      const before = scale
      scale = await scaleNow()
      return scale === before
    })
    .toBe(true)
  /** How far Billing is from the middle between the other two, in pixels of the diagram. */
  const offCentre = async () => {
    const [a, b, c] = [await boxOf(shop), await boxOf(billing), await boxOf(warehouse)]
    return { x: (b.x - (a.x + c.x) / 2) / scale, y: (b.y - a.y) / scale }
  }

  // Out of the row and dropped: nothing is marked while no card is dragged.
  await editor.hold('Billing', { x: 0, y: 200 }, scale)
  await page.mouse.up()
  await expect.poll(async () => (await offCentre()).y).toBeGreaterThan(150)
  await expect(marks).toHaveCount(0)

  // Held back in the row, halfway between the other two: both gaps are marked.
  const away = await offCentre()
  await editor.hold('Billing', { x: -away.x, y: -away.y }, scale)
  await expect.poll(async () => Math.abs((await offCentre()).y)).toBeLessThan(0.5)
  expect(Math.abs((await offCentre()).x)).toBeLessThan(0.5)
  await expect(marks).toHaveCount(2)
  // Each mark spans its gap: 100 px between the cards.
  for (const mark of await marks.all()) {
    expect(Math.round((await boxOf(mark)).width / scale)).toBe(100)
  }

  // One step to the right the gaps are 120 and 80: no mark.
  const grabbed = await boxOf(billing)
  const middle = { x: grabbed.x + grabbed.width / 2, y: grabbed.y + grabbed.height / 2 }
  await page.mouse.move(middle.x + 20 * scale, middle.y, { steps: 4 })
  await expect.poll(async () => Math.round((await offCentre()).x)).toBe(20)
  await expect(marks).toHaveCount(0)

  const held = await boxOf(billing)
  await page.mouse.up()
  await expect(marks).toHaveCount(0)
  expect(await boxOf(billing)).toEqual(held)
})
