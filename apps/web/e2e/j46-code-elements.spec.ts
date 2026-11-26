import { test, expect } from './fixtures.ts'

// J46 Code elements: docs/journeys.md#j46-code-elements
test('J46 A shape for code says its language and what it is, and reads like a class box', async ({ editor, page, consoleErrors }) => {
  await editor.open()

  // The Code library: one shape per language.
  await page.getByRole('button', { name: 'Add shape' }).click()
  await expect(page.getByRole('tablist', { name: 'Shape libraries' }).getByRole('tab')).toHaveText(['Basic', 'Flowchart', 'C4', 'Code'])
  await page.getByRole('tab', { name: 'Code' }).click()
  const offered = () => page.getByRole('tabpanel').getByRole('button').evaluateAll((all) => all.map((b) => b.getAttribute('aria-label')))
  await expect.poll(offered).toEqual(expect.arrayContaining(['Add Go', 'Add Python', 'Add Rust', 'Add C++', 'Add TypeScript', 'Add Java', 'Add SQL', 'Add Other']))

  // A Go struct. The form knows what Go has: a struct, an interface, a func; no class.
  await page.getByRole('button', { name: 'Add Go', exact: true }).click()
  const form = page.getByRole('form', { name: 'New code' })
  await expect(form.getByRole('combobox', { name: 'Language' })).toHaveValue('Go')
  const what = form.getByRole('combobox', { name: 'What it is' })
  const options = await what.getByRole('option').allTextContents()
  expect(options).toEqual(expect.arrayContaining(['struct', 'interface', 'func', 'package']))
  expect(options).not.toContain('class')
  await what.selectOption('struct')
  await form.getByRole('textbox', { name: 'Description' }).fill('ID string\nTotal Money\n---\nPlace() error\nCancel()')
  await form.getByRole('textbox', { name: 'Name' }).fill('Order')
  await form.getByRole('button', { name: 'Add', exact: true }).click()

  const order = editor.element('Order')
  await expect(order.getByTestId('card-type')).toHaveText('Go struct')
  // The language's own icon comes by itself.
  await expect(order.getByRole('img', { name: 'Go' })).toBeVisible()
  // Its body reads like a class box: fixed-width, from the left, a line between fields and methods.
  const field = order.getByText('ID string')
  await expect(field).toHaveCSS('font-family', /mono/i)
  await expect(field).toHaveCSS('text-align', 'left')
  await expect(order.getByRole('separator')).toHaveCount(1)
  // And it looks like one (c4model.com/diagrams/code): square corners; over its name what it is,
  // in guillemets; beside its name a round badge with its letter; under a line its members.
  const look = await order.evaluate((node) => {
    const card = node.querySelector('.object-card')!
    const top = (el: Element | null) => el!.getBoundingClientRect().top
    const type = card.querySelector('[data-testid="card-type"]')!
    const name = card.querySelector('[data-card-name]')!
    const badge = card.querySelector('[data-testid="code-badge"]')!
    const head = name.closest('.card-name-row')!
    return {
      corner: parseFloat(getComputedStyle(card).borderTopLeftRadius),
      quotes: [getComputedStyle(type, '::before').content, getComputedStyle(type, '::after').content],
      order: [top(type), top(name), head.getBoundingClientRect().bottom, top(card.querySelector('.card-text'))],
      line: parseFloat(getComputedStyle(head).borderBottomWidth),
      lineWidth: head.getBoundingClientRect().width / card.getBoundingClientRect().width,
      badge: { letter: badge.textContent!.trim(), round: getComputedStyle(badge).borderTopLeftRadius, leftOfName: badge.getBoundingClientRect().right <= name.getBoundingClientRect().left },
      // The language's icon stands in the row of the name: under what it is, beside the badge.
      icon: (() => {
        const [icon, row] = [card.querySelector('.card-icon')!.getBoundingClientRect(), badge.getBoundingClientRect()]
        return { underType: icon.top >= type.getBoundingClientRect().bottom - 1, inRow: Math.abs((icon.top + icon.bottom) / 2 - (row.top + row.bottom) / 2) <= 1, afterBadge: icon.left >= row.right }
      })(),
      slanted: getComputedStyle(name).fontStyle,
    }
  })
  expect(look.corner).toBeLessThanOrEqual(4)
  expect(look.quotes).toEqual(['"«"', '"»"'])
  expect(look.order).toEqual([...look.order].sort((a, b) => a - b))
  expect(look.line).toBeGreaterThan(0)
  expect(look.lineWidth).toBeGreaterThan(0.98)
  expect(look.badge).toMatchObject({ letter: 'S', leftOfName: true })
  expect(parseFloat(look.badge.round)).toBeGreaterThanOrEqual(9)
  expect(look.slanted).toBe('normal')
  expect(look.icon).toEqual({ underType: true, inRow: true, afterBadge: true })
  await expect(editor.key).toContainText('Code')

  // Another language has other things: a Rust trait. (Rust's logo has no open licence: no icon.)
  await page.getByRole('button', { name: 'Add shape' }).click()
  await page.getByRole('button', { name: 'Add Rust', exact: true }).click()
  await expect(form.getByRole('combobox', { name: 'What it is' }).getByRole('option')).toContainText(['trait'])
  await form.getByRole('combobox', { name: 'What it is' }).selectOption('trait')
  await form.getByRole('textbox', { name: 'Name' }).fill('Repository')
  await page.keyboard.press('Enter')
  const repository = editor.element('Repository')
  await expect(repository.getByTestId('card-type')).toHaveText('Rust trait')
  await expect(repository.getByRole('img')).toHaveCount(0)
  // A trait only says what others have to do: "T", and its name slanted, as UML writes it.
  await expect(repository.getByTestId('code-badge')).toHaveText('T')
  await expect(repository.getByText('Repository', { exact: true })).toHaveCSS('font-style', 'italic')
  // A card that is no code keeps its round corners and has no badge.
  await editor.addElement('Software System', 'Billing')
  await expect(editor.element('Billing').getByTestId('code-badge')).toHaveCount(0)
  expect(await editor.element('Billing').evaluate((node) => parseFloat(getComputedStyle(node.querySelector('.object-card')!).borderTopLeftRadius))).toBeGreaterThan(8)

  // Changing the language in the form changes what there is to choose; "Other" takes any words.
  await editor.openEditForm('Order')
  const edit = page.getByRole('form', { name: 'Edit code' })
  await expect(edit.getByRole('combobox', { name: 'Language' })).toHaveValue('Go')
  await expect(edit.getByRole('combobox', { name: 'What it is' })).toHaveValue('struct')
  await edit.getByRole('combobox', { name: 'Language' }).selectOption('C++')
  await edit.getByRole('combobox', { name: 'What it is' }).selectOption('template')
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(order.getByTestId('card-type')).toHaveText('C++ template')
  await expect(order.getByRole('img', { name: 'C++' })).toBeVisible()
  await editor.openEditForm('Repository')
  await edit.getByRole('combobox', { name: 'Language' }).selectOption('Other')
  await edit.getByRole('textbox', { name: 'What it is' }).fill('Zig comptime fn')
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(repository.getByTestId('card-type')).toHaveText('Zig comptime fn')

  // A box like the others: it opens, and code goes inside code.
  await editor.drillDown('Order')
  await expect(editor.boundary).toContainText('Order')
  expect(consoleErrors).toEqual([])
})
