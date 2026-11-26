import { test, expect } from './fixtures.ts'

// J49 No connection between two cards outside the frame: docs/journeys.md#j49-no-connection-between-two-cards-outside-the-frame
test('J49 Inside a box, cards connect inside the frame and across it, not outside it', async ({ editor, consoleErrors }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  await editor.addElement('Person', 'Customer')
  await editor.addElement('Software System', 'Payments')
  await editor.drillDown('Online Shop')
  await editor.addElement('Container', 'Web App')
  await editor.addElement('Container', 'API')
  await editor.addExisting('Customer')
  await editor.addExisting('Payments')

  // Two cards outside the frame: no line, and the editor says where such a line is drawn.
  await editor.element('Customer').getByTestId('connection-handle').dragTo(editor.element('Payments'))
  await expect(editor.errors).toHaveText(['Cards outside the frame are connected on a diagram they are on, not here.'])
  await expect(editor.relationships).toHaveCount(0)
  await expect(editor.page.getByRole('textbox', { name: 'Relationship label' })).toHaveCount(0)

  // Inside the frame and across it, either way round, as ever. The note goes with the next change.
  await editor.connect('Web App', 'API', 'Calls')
  await expect(editor.errors).toHaveCount(0)
  await editor.connect('Customer', 'Web App', 'Shops in')
  await editor.connect('API', 'Payments', 'Charges through')
  await expect(editor.relationships).toHaveCount(3)

  // On the Overview, where the two are at home, they connect.
  await editor.backTo('Overview')
  await editor.connect('Customer', 'Payments', 'Has an account at')
  await expect(editor.relationship('Has an account at')).toBeVisible()
  expect(consoleErrors).toEqual([])
})
