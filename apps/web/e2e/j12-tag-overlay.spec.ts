import { test, expect } from './fixtures.ts'

// J12 Tag overlay: docs/journeys.md#j12-tag-overlay
test.fixme('J12 Focus on a tag and hide a tag', async ({ editor }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  await editor.addElement('Software System', 'Payment Service')
  await editor.tag('Payment Service', 'Compliance', 'PCI')

  await editor.toggleTag('Focus', 'PCI')
  await expect(editor.element('Payment Service')).toBeVisible()
  await expect(editor.element('Online Shop')).toBeHidden()
  await editor.toggleTag('Focus', 'PCI')

  await editor.toggleTag('Hide', 'PCI')
  await expect(editor.element('Online Shop')).toBeVisible()
  await expect(editor.element('Payment Service')).toBeHidden()
})
