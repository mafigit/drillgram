import { test, expect } from './fixtures.ts'

// J2 First diagram: docs/journeys.md#j2-first-diagram
test('J2 First diagram survives a reload', async ({ page, editor }) => {
  await editor.open()

  await editor.addElement('Person', 'Customer')
  await editor.addElement('Software System', 'Online Shop')
  await editor.connect('Customer', 'Online Shop', 'Places orders in')

  await page.reload()

  await expect(editor.element('Customer')).toBeVisible()
  await expect(editor.element('Online Shop')).toBeVisible()
  await expect(editor.relationship('Places orders in')).toBeVisible()
})
