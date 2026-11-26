import { test, expect } from './fixtures.ts'

type Box = { x: number; y: number; width: number; height: number }

// J41 Add a shape from a library: docs/journeys.md#j41-add-a-shape-from-a-library
test('J41 "Add shape" offers each library on a tab; C4 is one of them', async ({ editor, consoleErrors }) => {
  await editor.open()
  await expect(editor.title).toHaveText('Overview')

  // The libraries. Every shape goes on every diagram: no kind says what lives in what.
  await editor.page.getByRole('button', { name: 'Add shape' }).click()
  await expect(editor.page.getByRole('tablist', { name: 'Shape libraries' }).getByRole('tab')).toHaveText(['Basic', 'Flowchart', 'C4', 'Code'])
  await editor.page.getByRole('tab', { name: 'C4' }).click()
  const labels = () => editor.page.getByRole('tabpanel').getByRole('button').evaluateAll((all) => all.map((b) => b.getAttribute('aria-label')))
  const C4 = ['Add Person', 'Add Software System', 'Add Container', 'Add Component']
  await expect.poll(labels).toEqual(C4)
  await editor.page.keyboard.press('Escape')

  // A plain box: a name and a description, no kind on its card. It opens like any box.
  const idea = await editor.addElement('Box', 'Idea', { description: 'Something to try' })
  await expect(idea).toContainText('Something to try')
  await expect(idea.getByTestId('card-type')).toHaveCount(0)
  await expect(idea.getByRole('button', { name: 'Open' })).toHaveCount(1)
  await expect(editor.key).toContainText('Box')

  // A C4 element beside it, with its kind on the card; inside it the same shapes are offered.
  const shop = await editor.addElement('Software System', 'Online Shop')
  await expect(shop.getByTestId('card-type')).toHaveText('Software system')
  await editor.connect('Idea', 'Online Shop', 'Shapes')
  await expect(editor.relationship('Shapes')).toBeVisible()
  await editor.drillDown('Online Shop')
  await editor.page.getByRole('button', { name: 'Add shape' }).click()
  await editor.page.getByRole('tab', { name: 'C4' }).click()
  await expect.poll(labels).toEqual(C4)
  await editor.page.keyboard.press('Escape')

  // A box added here belongs to the opened object: it stands inside its frame.
  const notes = await editor.addElement('Box', 'Notes')
  const holds = (outer: Box, inner: Box) =>
    inner.x > outer.x && inner.y > outer.y && inner.x + inner.width < outer.x + outer.width && inner.y + inner.height < outer.y + outer.height
  await expect.poll(async () => holds((await editor.boundary.boundingBox())!, (await notes.boundingBox())!)).toBe(true)
  await editor.backTo('Overview')
  await expect(editor.element('Notes')).toHaveCount(0)
  expect(consoleErrors).toEqual([])
})

test('J41 The shapes of every library are found by a search', async ({ editor, page }) => {
  await editor.open()
  await page.getByRole('button', { name: 'Add shape' }).click()
  const search = page.getByRole('searchbox', { name: 'Search shapes' })
  const found = page.getByRole('list', { name: 'Shapes found' }).getByRole('listitem')

  // By a part of the name, in whatever library; the tabs give way to what was found.
  await search.fill('contain')
  await expect(found.first()).toHaveAccessibleName('Add Container')
  await expect(found.first()).toContainText('C4')
  await expect(page.getByRole('tablist', { name: 'Shape libraries' })).toHaveCount(0)

  // Nothing found is said; the search emptied, the libraries are back.
  await search.fill('unicorn')
  await expect(page.getByRole('status')).toHaveText('No shape found.')
  await search.fill('')
  await expect(page.getByRole('tablist', { name: 'Shape libraries' }).getByRole('tab')).toHaveText(['Basic', 'Flowchart', 'C4', 'Code'])

  // A language by what it has: the form opens for just that. Enter takes the first shape found.
  await search.fill('trait')
  await expect(found).toHaveCount(1)
  await expect(found).toHaveAccessibleName('Add Rust trait')
  await page.keyboard.press('Enter')
  const form = page.getByRole('form', { name: 'New code' })
  await expect(form.getByRole('combobox', { name: 'Language' })).toHaveValue('Rust')
  await expect(form.getByRole('combobox', { name: 'What it is' })).toHaveValue('trait')
  await form.getByRole('textbox', { name: 'Title' }).fill('Repository')
  await page.keyboard.press('Enter')
  await expect(editor.element('Repository').getByTestId('card-type')).toHaveText('Rust trait')

  // Opened again, the search starts empty.
  await page.getByRole('button', { name: 'Add shape' }).click()
  await expect(search).toHaveValue('')
})
