import { test, expect } from './fixtures.ts'

// J53 A box with a shape: docs/journeys.md#j53-a-box-with-a-shape

test('J53 A box takes a shape that says what it is: a database is a cylinder', async ({ editor, page, consoleErrors }) => {
  await editor.open()

  // The Basic library has the shapes; a search finds them by what they are.
  await page.getByRole('button', { name: 'Add shape' }).click()
  await page.getByRole('tab', { name: 'Basic' }).click()
  const offered = await page.getByRole('tabpanel').getByRole('button').evaluateAll((all) => all.map((b) => b.getAttribute('aria-label')))
  expect(offered).toEqual(expect.arrayContaining(['Add Box', 'Add Database', 'Add Queue', 'Add Document', 'Add Decision', 'Add Cloud']))
  await page.getByRole('searchbox', { name: 'Search shapes' }).fill('database')
  await page.getByRole('list', { name: 'Shapes found' }).getByRole('listitem', { name: 'Add Database', exact: true }).click()

  // The form starts with that shape; the card is drawn as it.
  const form = page.getByRole('form', { name: 'New box' })
  await expect(form.getByRole('combobox', { name: 'Shape' })).toHaveValue('cylinder')
  await form.getByRole('textbox', { name: 'Title' }).fill('Orders DB')
  await page.keyboard.press('Enter')
  const db = editor.element('Orders DB')
  const shape = db.getByTestId('card-shape')
  await expect(shape).toHaveAttribute('data-shape', 'cylinder')
  const look = await db.evaluate((node) => {
    const card = node.querySelector('.object-card')!
    const drawn = node.querySelector('[data-testid="card-shape"]')!.getBoundingClientRect()
    const box = card.getBoundingClientRect()
    const name = node.querySelector('[data-card-name]')!.getBoundingClientRect()
    const style = getComputedStyle(card)
    return {
      // The outline is the card's size; the card has no border or ground of its own.
      fits: Math.abs(drawn.width - box.width) <= 2 && Math.abs(drawn.height - box.height) <= 2,
      border: style.borderTopColor,
      ground: style.backgroundColor,
      paths: node.querySelectorAll('[data-testid="card-shape"] path').length,
      // The name keeps clear of the cylinder's top.
      clear: name.top - box.top,
    }
  })
  expect(look.fits).toBe(true)
  expect(look.border).toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
  expect(look.ground).toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
  expect(look.paths).toBe(2)
  expect(look.clear).toBeGreaterThan(24)

  // Any box says its shape in its form, a C4 container too; "Rectangle" is the plain card again.
  await editor.addElement('Container', 'Events')
  await editor.openEditForm('Events')
  const edit = page.getByRole('form', { name: 'Edit container' })
  await edit.getByRole('combobox', { name: 'Shape' }).selectOption({ label: 'Queue' })
  await edit.getByRole('button', { name: 'Save' }).click()
  const events = editor.element('Events')
  await expect(events.getByTestId('card-shape')).toHaveAttribute('data-shape', 'queue')
  await expect(events.getByTestId('card-type')).toHaveText('Container')
  await editor.openEditForm('Orders DB')
  await page.getByRole('form', { name: 'Edit box' }).getByRole('combobox', { name: 'Shape' }).selectOption({ label: 'Rectangle' })
  await page.getByRole('form', { name: 'Edit box' }).getByRole('button', { name: 'Save' }).click()
  await expect(db.getByTestId('card-shape')).toHaveCount(0)

  // A person and a piece of code are drawn their own way: no shape to choose.
  await editor.pickShape('Person')
  await expect(page.getByRole('form', { name: 'New person' }).getByRole('combobox', { name: 'Shape' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  // A box with a shape is a box like any other: it connects, is copied with its shape, and is kept.
  await editor.connect('Orders DB', 'Events', 'Publishes to')
  await events.click()
  await events.getByRole('button', { name: 'Copy' }).click()
  await expect(editor.element('Events copy').getByTestId('card-shape')).toHaveAttribute('data-shape', 'queue')
  await page.reload()
  await expect(editor.element('Events').getByTestId('card-shape')).toHaveAttribute('data-shape', 'queue')
  expect(consoleErrors).toEqual([])
})

test('J53 The Flowchart library has the rest of the shapes; a text has no outline, a comment a brace', async ({ editor, page, consoleErrors }) => {
  await editor.open()
  await page.getByRole('button', { name: 'Add shape' }).click()
  await page.getByRole('tab', { name: 'Flowchart' }).click()
  const offered = await page.getByRole('tabpanel').getByRole('button').evaluateAll((all) => all.map((b) => b.getAttribute('aria-label')))
  expect(offered).toEqual(
    expect.arrayContaining(['Add Trapezoid', 'Add Manual operation', 'Add Documents', 'Add Disk', 'Add Comment', 'Add Browser', 'Add Data store', 'Add Or', 'Add Junction', 'Add Speech bubble']),
  )
  expect(offered).toHaveLength(39)
  await page.getByRole('tab', { name: 'Basic' }).click()
  await expect(page.getByRole('tabpanel').getByRole('button')).toHaveCount(26)

  // A pile of documents: its outline and the edges of the two sheets behind.
  await page.getByRole('searchbox', { name: 'Search shapes' }).fill('pile of documents')
  await page.getByRole('list', { name: 'Shapes found' }).getByRole('listitem', { name: 'Add Documents', exact: true }).click()
  await page.getByRole('form', { name: 'New box' }).getByRole('textbox', { name: 'Title' }).fill('Reports')
  await page.keyboard.press('Enter')
  const reports = editor.element('Reports').getByTestId('card-shape')
  await expect(reports).toHaveAttribute('data-shape', 'documents')
  await expect(reports.locator('path')).toHaveCount(3)

  // A text: nothing is drawn around it until it is selected.
  await page.getByRole('button', { name: 'Add shape' }).click()
  await page.getByRole('tab', { name: 'Basic' }).click()
  await page.getByRole('button', { name: 'Add Text', exact: true }).click()
  await page.getByRole('form', { name: 'New box' }).getByRole('textbox', { name: 'Title' }).fill('Only words')
  await page.keyboard.press('Enter')
  const words = editor.element('Only words')
  await expect(words.getByTestId('card-shape')).toHaveAttribute('data-shape', 'text')
  const outline = words.locator('.card-shape-outline')
  await expect(outline).not.toHaveCSS('stroke', 'none')
  await editor.canvas.click({ position: { x: 5, y: 200 } })
  await expect(outline).toHaveCSS('stroke', 'none')
  await expect(outline).toHaveCSS('fill', 'none')

  // The form offers every shape, in the two groups; the shape is kept.
  await editor.openEditForm('Only words')
  const shape = page.getByRole('form', { name: 'Edit box' }).getByRole('combobox', { name: 'Shape' })
  await expect(shape.locator('optgroup')).toHaveCount(2)
  await expect(shape.locator('option')).toHaveCount(66)
  await shape.selectOption({ label: 'Comment' })
  await page.getByRole('form', { name: 'Edit box' }).getByRole('button', { name: 'Save' }).click()
  await expect(words.getByTestId('card-shape')).toHaveAttribute('data-shape', 'brace')
  await page.reload()
  await expect(editor.element('Only words').getByTestId('card-shape')).toHaveAttribute('data-shape', 'brace')
  await expect(editor.element('Reports').getByTestId('card-shape')).toHaveAttribute('data-shape', 'documents')

  // A flowchart that names its shapes brings them along, under any of Mermaid's names for them.
  await editor.importMermaid('flowchart TD\n  a@{ shape: lin-cyl, label: "Archive" } --> b@{ shape: manual-input, label: "Typed in" }\n  c[/Priority\\]')
  await expect(editor.element('Archive').getByTestId('card-shape')).toHaveAttribute('data-shape', 'disk')
  await expect(editor.element('Typed in').getByTestId('card-shape')).toHaveAttribute('data-shape', 'manualInput')
  await expect(editor.element('Priority').getByTestId('card-shape')).toHaveAttribute('data-shape', 'trapezoid')
  expect(consoleErrors).toEqual([])
})
