import { test, expect } from './fixtures.ts'

// J18 A connection made inside a box shows one level up: docs/journeys.md#j18-a-connection-made-inside-a-box-shows-one-level-up
test('J18 Connections of the parts of a box show as one line without a label between the boxes above', async ({ editor }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  await editor.addElement('Software System', 'Payment Service')

  await editor.drillDown('Online Shop')
  await editor.addElement('Container', 'Web App')
  await editor.addElement('Container', 'API')
  await editor.addExisting('Payment Service')
  await editor.connect('Web App', 'Payment Service', 'Starts payment')
  await editor.backTo('Overview')

  // The first connection of a part makes the line above: it says that the two are connected,
  // not what for.
  await expect(editor.relationships).toHaveCount(1)
  await expect(editor.relationships).toHaveAccessibleName('Online Shop to Payment Service')
  await expect(editor.relationships).toHaveText('')

  // A second one adds nothing above.
  await editor.drillDown('Online Shop')
  await editor.connect('API', 'Payment Service', 'Confirms payment')
  await expect(editor.relationships).toHaveCount(2)
  await editor.backTo('Overview')
  await expect(editor.relationships).toHaveCount(1)
  await expect(editor.relationships).toHaveAccessibleName('Online Shop to Payment Service')

  // The line stays while one of them is left, and goes with the last.
  await editor.drillDown('Online Shop')
  // Its line runs around the API and above the cards: bring all of it on screen first.
  await editor.fitToScreen()
  await editor.deleteRelationship('Starts payment')
  await editor.backTo('Overview')
  await expect(editor.relationships).toHaveCount(1)
  await editor.drillDown('Online Shop')
  await editor.deleteRelationship('Confirms payment')
  await editor.backTo('Overview')
  await expect(editor.relationships).toHaveCount(0)
})

test('J18 A connection drawn between two boxes is not doubled when a part takes it', async ({ editor }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  await editor.addElement('Software System', 'Payment Service')
  await editor.connect('Online Shop', 'Payment Service', 'Takes payments through')

  // Inside, the connection of the box runs to the frame until a part has it.
  await editor.drillDown('Online Shop')
  await editor.addElement('Container', 'Web App')
  await expect(editor.boundaryRelationships).toHaveText(['Takes payments through'])
  await editor.connect('Web App', 'Payment Service', 'Starts payment')
  await expect(editor.boundaryRelationships).toHaveCount(0)

  // Above there is still the one line that was drawn there, with its label.
  await editor.backTo('Overview')
  await expect(editor.relationships).toHaveCount(1)
  await expect(editor.relationship('Takes payments through')).toBeVisible()
})
