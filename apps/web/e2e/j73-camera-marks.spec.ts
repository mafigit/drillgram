import { test, expect } from './fixtures.ts'

// J73 Jump to a camera mark: docs/journeys.md#j73-jump-to-a-camera-mark
test('J73 Hold M and a number to mark the view, M then the number to jump back', async ({ page, editor, hasTouch, consoleErrors }) => {
  test.skip(hasTouch, 'A tablet has no keyboard')
  await editor.open()
  const checkout = await editor.addElement('Box', 'Checkout')
  await editor.addElement('Box', 'Payment')
  const minimap = editor.canvas.getByRole('img', { name: 'Minimap' })
  const marks = minimap.getByTestId('minimap-mark')
  const status = page.getByRole('status', { name: 'Camera marks' })
  const at = async () => (await checkout.boundingBox())!
  const near = (a: { x: number; y: number; width: number }, b: { x: number; y: number; width: number }) =>
    Math.abs(a.x - b.x) <= 2 && Math.abs(a.y - b.y) <= 2 && Math.abs(a.width - b.width) <= 2

  // Hold M and press 1: this view is mark 1.
  await editor.pan({ x: -120, y: 60 })
  const one = await at()
  await editor.setMark(1)
  await expect(status).toHaveText('Mark 1 set')
  await expect(marks).toHaveText(['1'])

  // Elsewhere and nearer: mark 2.
  await editor.pan({ x: 200, y: -80 })
  await editor.zoomWithWheel(-200)
  await expect.poll(async () => (await at()).width).toBeGreaterThan(one.width + 10)
  const two = await at()
  await editor.setMark(2)
  await expect(marks).toHaveText(['1', '2'])

  // M alone lights the marks up and says which there are; a number then goes there.
  await editor.pan({ x: -300, y: 150 })
  await page.keyboard.press('m')
  await expect(status).toHaveText('Jump to a mark: press 1 or 2')
  await expect(marks.first()).toHaveAttribute('data-lit', 'true')
  await page.keyboard.press('1')
  await expect.poll(async () => near(await at(), one)).toBe(true)
  await expect(marks.first()).toHaveAttribute('data-lit', 'false')
  await editor.jumpToMark(2)
  await expect.poll(async () => near(await at(), two)).toBe(true)

  // Kept in the browser.
  await page.reload()
  await expect(checkout).toBeVisible()
  await expect(marks).toHaveText(['1', '2'])
  await editor.jumpToMark(1)
  await expect.poll(async () => near(await at(), one)).toBe(true)

  // A number without a mark says so; Escape leaves the marks.
  await editor.jumpToMark(5)
  await expect(editor.errors).toHaveText([/Mark 5 is not set/])
  await page.keyboard.press('m')
  await expect(marks.first()).toHaveAttribute('data-lit', 'true')
  await page.keyboard.press('Escape')
  await expect(marks.first()).toHaveAttribute('data-lit', 'false')

  // No change to the workspace, and it works when locked.
  await editor.openHistory()
  await expect(editor.changes).toHaveCount(2)
  await editor.openHistory()
  await editor.lockButton.click()
  await editor.jumpToMark(2)
  await expect.poll(async () => near(await at(), two)).toBe(true)

  // Each diagram has its own marks.
  await editor.fitToScreen()
  await editor.drillDown('Checkout')
  await page.keyboard.press('m')
  await expect(status).toHaveText('No marks here yet. Hold M and press 1 to 9 to set one.')
  await page.keyboard.press('Escape')

  // The keyboard shortcuts list them.
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click()
  const legend = page.getByRole('list', { name: 'Keyboard shortcuts' })
  await expect(legend.getByRole('listitem').filter({ hasText: 'Set a camera mark' })).toContainText('Hold M')
  await expect(legend.getByRole('listitem').filter({ hasText: 'Jump to a camera mark' })).toContainText('M')
  expect(consoleErrors).toEqual([])
})
