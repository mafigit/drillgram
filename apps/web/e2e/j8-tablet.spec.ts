import { test, expect } from './fixtures.ts'

// J8 Tablet: docs/journeys.md#j8-tablet
// Touch gestures need a touch device: runs on the tablet project only.
test.skip(({ hasTouch }) => !hasTouch, 'Touch journey runs on the tablet project only')

test.fixme('J8 First System Context diagram with touch gestures', async ({ page, editor }) => {
  await editor.open()

  await editor.tapToAdd('Person', 'Customer')
  await editor.tapToAdd('Software System', 'Online Shop')
  await editor.dragToConnect('Customer', 'Online Shop')
  await page.getByRole('textbox', { name: 'Relationship label' }).fill('Places orders in')
  await page.keyboard.press('Enter')

  const before = await editor.element('Online Shop').boundingBox()
  await editor.pinch(2)
  const after = await editor.element('Online Shop').boundingBox()
  expect(after?.width).toBeGreaterThan(before?.width ?? Infinity)

  await page.reload()

  await expect(editor.element('Customer')).toBeVisible()
  await expect(editor.element('Online Shop')).toBeVisible()
  await expect(editor.relationship('Places orders in')).toBeVisible()
})
