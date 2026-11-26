import { test, expect } from './fixtures.ts'

// J20 A diagram that explains itself: docs/journeys.md#j20-a-diagram-that-explains-itself
test('J20 Title, key, descriptions and technologies are on the diagram', async ({ editor }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop', {
    description: 'Sells books to customers',
  })
  await editor.addElement('Software System', 'Payment Provider', { external: true })

  await expect(editor.title).toHaveText('Overview')
  await expect(editor.element('Online Shop')).toContainText('Sells books to customers')
  await expect(editor.element('Payment Provider')).toContainText('External')
  await expect(editor.element('Online Shop')).not.toContainText('External')

  await editor.drillDown('Online Shop')
  await editor.addElement('Container', 'Web App', { technology: 'Vue 3' })
  await editor.addExisting('Payment Provider')
  await editor.connect('Web App', 'Payment Provider', 'Starts payments with', 'HTTPS')

  await expect(editor.title).toHaveText('Online Shop')
  await expect(editor.element('Web App')).toContainText('Vue 3')
  await expect(editor.relationship('Starts payments with')).toContainText('HTTPS')
  await expect(editor.key).toContainText('Container')
  await expect(editor.key).toContainText('Software System')
  await expect(editor.key).toContainText('External')
  await expect(editor.key).toContainText('Relationship')
  await expect(editor.key).not.toContainText('Person')
})
