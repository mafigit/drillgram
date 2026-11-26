import { test, expect } from './fixtures.ts'

// J55 A connection with a colour: docs/journeys.md#j55-a-connection-with-a-colour
test('J55 A connection takes a colour in its form, at once, and keeps it', async ({ editor, page, consoleErrors }) => {
  await editor.open()
  await editor.addElement('Software System', 'Shop')
  await editor.addElement('Software System', 'Billing')
  await editor.connect('Shop', 'Billing', 'Calls')
  const line = editor.relationship('Calls')
  const stroke = () => line.locator('path.vue-flow__edge-path').evaluate((path) => getComputedStyle(path).stroke)
  const usual = await stroke()
  await expect(line).not.toHaveAttribute('data-colour')

  // The form of a connection offers the colours; the one in use is ticked.
  await line.getByText('Calls').dblclick({ force: true })
  const colours = page.getByRole('radiogroup', { name: 'Colour' })
  await expect(colours.getByRole('radio')).toHaveCount(9)
  await expect(colours.getByRole('radio', { name: 'No colour' })).toBeChecked()

  // A press colours the line at once, and its arrowhead; the form stays open.
  await colours.getByRole('radio', { name: 'Orange' }).click()
  await expect(line).toHaveAttribute('data-colour', 'orange')
  await expect(colours.getByRole('radio', { name: 'Orange' })).toBeChecked()
  await expect.poll(stroke).not.toBe(usual)
  const orange = await stroke()
  await colours.getByRole('radio', { name: 'Blue' }).click()
  await expect(line).toHaveAttribute('data-colour', 'blue')
  await expect.poll(stroke).not.toBe(orange)
  await expect(page.getByRole('textbox', { name: 'Relationship label' })).toHaveValue('Calls')
  await page.keyboard.press('Escape')

  // One undo per colour; the colour is kept over a reload and through a new label.
  await editor.undo()
  await expect(line).toHaveAttribute('data-colour', 'orange')
  await editor.redo()
  await editor.relabel('Calls', 'Pays with')
  await page.reload()
  const kept = editor.relationship('Pays with')
  await expect(kept).toHaveAttribute('data-colour', 'blue')

  // "No colour" gives the usual line back.
  await kept.getByText('Pays with').dblclick({ force: true })
  await page.getByRole('radiogroup', { name: 'Colour' }).getByRole('radio', { name: 'No colour' }).click()
  await expect(kept).not.toHaveAttribute('data-colour')
  await page.keyboard.press('Escape')
  expect(consoleErrors).toEqual([])
})

test('J55 A flowchart brings the colours of its arrows along', async ({ editor }) => {
  await editor.open()
  await editor.importMermaid('flowchart LR\n  api[API] -->|rest| db[(Orders DB)]\n  api -->|events| mq[Broker]\n  linkStyle 0 stroke:#22c55e\n  linkStyle 1 stroke:#f97316')
  await expect(editor.relationship('rest')).toHaveAttribute('data-colour', 'green')
  await expect(editor.relationship('events')).toHaveAttribute('data-colour', 'orange')
})
