import { test, expect } from './fixtures.ts'

// J17 Comment on an object: docs/journeys.md#j17-comment-on-an-object
test.fixme('J17 A question stays on the canvas until it is resolved', async ({ page, editor }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')

  await editor.comment('Online Shop', 'Question', 'Who owns this?')
  const onCanvas = editor.canvas.getByRole('note').filter({ hasText: 'Who owns this?' })
  await expect(onCanvas).toBeVisible()

  await onCanvas.getByRole('checkbox', { name: 'Resolved' }).check()
  await expect(onCanvas).toHaveCount(0)

  await page.getByRole('button', { name: 'Comments' }).click()
  await expect(page.getByRole('list', { name: 'Resolved comments' })).toContainText('Who owns this?')
})
