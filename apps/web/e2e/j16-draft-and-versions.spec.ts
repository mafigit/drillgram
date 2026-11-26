import { test, expect } from './fixtures.ts'

// J16 Draft a future state: docs/journeys.md#j16-draft-a-future-state
test.fixme('J16 A draft changes nothing until it is merged, and a merge can be reverted', async ({
  page,
  editor,
}) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  await editor.saveVersion('Shop only')

  await editor.startDraft('Add payments')
  await editor.addElement('Software System', 'Payment Service')
  await page.getByRole('button', { name: 'Leave draft' }).click()
  await expect(editor.element('Payment Service')).toHaveCount(0)

  await editor.mergeDraft('Add payments')
  await expect(editor.element('Payment Service')).toBeVisible()

  await editor.revertTo('Shop only')
  await expect(editor.element('Online Shop')).toBeVisible()
  await expect(editor.element('Payment Service')).toHaveCount(0)
})
