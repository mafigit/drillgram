import { test, expect } from './fixtures.ts'

// J10 Reuse an object on a second diagram: docs/journeys.md#j10-reuse-an-object-on-a-second-diagram
test.fixme('J10 An object renamed on one diagram is renamed on the other', async ({ editor }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')

  await editor.newDiagram('System Landscape', 'Payments')
  await editor.addExisting('Online Shop')
  await editor.rename('Online Shop', 'Web Shop')

  await editor.openDiagram('System Landscape')
  await expect(editor.element('Web Shop')).toBeVisible()
  await expect(editor.element('Online Shop')).toHaveCount(0)
})
