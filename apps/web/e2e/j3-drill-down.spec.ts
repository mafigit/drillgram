import { test, expect } from './fixtures.ts'

// J3 Open a box and go back: docs/journeys.md#j3-open-a-box-and-go-back
test('J3 Any box opens to the diagram inside it, and the breadcrumb leads back', async ({ editor }) => {
  await editor.open()
  await expect(editor.title).toHaveText('Overview')
  await editor.addElement('Software System', 'Online Shop')
  // The magnifier is grey while nothing is inside a box, green once something is.
  const GREEN = 'rgb(22, 163, 74)'
  await expect(editor.openButton('Online Shop')).not.toHaveCSS('color', GREEN)

  // Straight inside: the box is the frame there, not a card.
  await editor.drillDown('Online Shop')
  await expect(editor.title).toHaveText('Online Shop')
  await expect(editor.breadcrumb).toContainText('Online Shop')
  await expect(editor.boundary).toContainText('Online Shop')
  await expect(editor.element('Online Shop')).toHaveCount(0)
  await editor.addElement('Container', 'Web App')

  // Any kind inside any kind, as deep as wanted: a person in the container, a plain box in the person.
  await editor.drillDown('Web App')
  await expect(editor.title).toHaveText('Web App')
  await editor.addElement('Person', 'Operator')
  await editor.drillDown('Operator')
  await expect(editor.title).toHaveText('Operator')
  await editor.addElement('Box', 'Checklist')
  await expect(editor.breadcrumb).toHaveText(/Overview.*Online Shop.*Web App.*Operator/)

  await editor.backTo('Online Shop')
  await expect(editor.title).toHaveText('Online Shop')
  await expect(editor.element('Web App')).toBeVisible()
  await expect(editor.element('Operator')).toHaveCount(0)

  await editor.backTo('Overview')
  await expect(editor.title).toHaveText('Overview')
  await expect(editor.element('Online Shop')).toBeVisible()
  await expect(editor.openButton('Online Shop')).toHaveCSS('color', GREEN)
  await expect(editor.element('Web App')).toHaveCount(0)
})
