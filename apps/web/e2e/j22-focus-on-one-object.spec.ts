import { test, expect } from './fixtures.ts'

// J22 Focus on one object: docs/journeys.md#j22-focus-on-one-object
test('J22 Clicking an object fades everything it is not directly connected to', async ({ editor }) => {
  await editor.open()
  await editor.addElement('Person', 'Customer')
  await editor.addElement('Software System', 'Online Shop')
  await editor.addElement('Software System', 'Mail Server')
  await editor.addElement('Software System', 'Billing')
  await editor.connect('Customer', 'Online Shop', 'Buys in')
  await editor.connect('Mail Server', 'Billing', 'Sends invoices for')

  const clear = ['Customer', 'Online Shop']
  const faded = ['Mail Server', 'Billing']
  const expectAllClear = async () => {
    for (const name of [...clear, ...faded]) await expect(editor.element(name)).toHaveCSS('opacity', '1')
    await expect(editor.relationship('Buys in')).toHaveCSS('opacity', '1')
    await expect(editor.relationship('Sends invoices for')).toHaveCSS('opacity', '1')
  }
  await editor.clickCanvas()
  await expectAllClear()

  await editor.element('Online Shop').click()
  for (const name of clear) await expect(editor.element(name)).toHaveCSS('opacity', '1')
  for (const name of faded) await expect(editor.element(name)).not.toHaveCSS('opacity', '1')
  await expect(editor.relationship('Buys in')).toHaveCSS('opacity', '1')
  await expect(editor.relationship('Sends invoices for')).not.toHaveCSS('opacity', '1')

  await editor.clickCanvas()
  await expectAllClear()
})
