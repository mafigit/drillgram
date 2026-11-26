import { test, expect } from './fixtures.ts'

// J56 A database table with its columns: docs/journeys.md#j56-a-database-table-with-its-columns
test('J56 A table shows its columns, which are written in its form row by row', async ({ editor, page, consoleErrors }) => {
  await editor.open()
  await page.getByRole('button', { name: 'Add shape' }).click()
  await page.getByRole('searchbox', { name: 'Search shapes' }).fill('table')
  await page.getByRole('list', { name: 'Shapes found' }).getByRole('listitem', { name: 'Add Table', exact: true }).click()

  // The form of a table has its columns: a row is there to start with; Enter makes the next.
  const form = page.getByRole('form', { name: 'New box' })
  await form.getByRole('textbox', { name: 'Title', exact: true }).fill('orders')
  const columns = form.getByRole('group', { name: 'Columns' })
  await expect(columns.getByRole('textbox', { name: 'Column', exact: true })).toHaveCount(1)
  await columns.getByRole('textbox', { name: 'Column', exact: true }).fill('id')
  await columns.getByRole('combobox', { name: 'Type of id' }).fill('uuid')
  await columns.getByRole('combobox', { name: 'Key of id' }).selectOption('PK')
  await columns.getByRole('combobox', { name: 'Type of id' }).press('Enter')
  // The new row has the cursor: type on.
  await expect(columns.getByRole('textbox', { name: 'Column', exact: true })).toHaveCount(2)
  await page.keyboard.type('customer_id')
  await page.keyboard.press('Tab')
  await page.keyboard.type('uuid')
  await columns.getByRole('combobox', { name: 'Key of customer_id' }).selectOption('FK')
  await columns.getByRole('button', { name: 'Add column' }).click()
  await page.keyboard.type('total')
  await form.getByRole('button', { name: 'Add', exact: true }).click()

  // The card: the name over a line, then a row per column with its key, name and type.
  const orders = editor.element('orders')
  const rows = orders.getByRole('list', { name: 'Columns' }).getByRole('listitem')
  await expect(rows).toHaveText([/PK\s*id\s*uuid/, /FK\s*customer_id\s*uuid/, /^\s*total\s*$/])
  const look = await orders.evaluate((node) => {
    const card = node.querySelector('.object-card')!.getBoundingClientRect()
    const name = node.querySelector('[data-card-name]')!.getBoundingClientRect()
    const all = [...node.querySelectorAll('[aria-label="Columns"] li')].map((row) => row.getBoundingClientRect())
    return {
      // The name stands over the columns, the columns under each other, all inside the card.
      nameFirst: name.bottom <= all[0]!.top + 1,
      stacked: all.every((row, at) => at === 0 || row.top >= all[at - 1]!.bottom - 1),
      inside: all.every((row) => row.left >= card.left - 1 && row.right <= card.right + 1 && row.bottom <= card.bottom + 1),
    }
  })
  expect(look).toEqual({ nameFirst: true, stacked: true, inside: true })
  // Every field of a row is inside the form, the button that removes it too.
  const fits = async (form: import('@playwright/test').Locator) =>
    form.evaluate((el) => {
      const box = el.getBoundingClientRect()
      return [...el.querySelectorAll('fieldset input, fieldset select, fieldset button')].every((field) => {
        const at = field.getBoundingClientRect()
        return at.left >= box.left && at.right <= box.right
      })
    })

  // A double-click on the columns opens the form again. Pasted lines become columns at once.
  await rows.first().dblclick()
  const edit = page.getByRole('form', { name: 'Edit box' })
  const editColumns = edit.getByRole('group', { name: 'Columns' })
  await expect(editColumns.getByRole('textbox', { name: 'Column', exact: true })).toHaveCount(3)
  expect(await fits(edit)).toBe(true)
  await editColumns.getByRole('button', { name: 'Remove the column total' }).click()
  await editColumns.getByRole('button', { name: 'Add column' }).click()
  await page.evaluate(() => navigator.clipboard?.writeText?.('').catch(() => undefined))
  await editColumns.getByRole('textbox', { name: 'Column', exact: true }).last().evaluate((field) => {
    const data = new DataTransfer()
    data.setData('text/plain', 'status text NOT NULL,\ncreated_at timestamptz DEFAULT now(),\nemail varchar(120) UNIQUE,\nshop_id uuid REFERENCES shops(id)')
    field.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  })
  await expect(editColumns.getByRole('textbox', { name: 'Column', exact: true })).toHaveCount(6)
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(rows).toHaveText([/PK\s*id\s*uuid/, /FK\s*customer_id\s*uuid/, /status\s*text/, /created_at\s*timestamptz/, /UQ\s*email\s*varchar\(120\)/, /FK\s*shop_id\s*uuid/])
  // The card grew with its rows: every one is inside it, and no more than a row's height is left under the last.
  await expect
    .poll(() =>
      orders.evaluate((node) => {
        const card = node.querySelector('.object-card')!.getBoundingClientRect()
        const last = [...node.querySelectorAll('[aria-label="Columns"] li')].at(-1)!.getBoundingClientRect()
        return (card.bottom - last.bottom) / (last.height || 1)
      }),
    )
    .toBeLessThan(1)
  const inside = () =>
    orders.evaluate((node) => {
      const card = node.querySelector('.object-card')!.getBoundingClientRect()
      return [...node.querySelectorAll('[aria-label="Columns"] li')].every((row) => row.getBoundingClientRect().bottom <= card.bottom + 1)
    })
  await expect.poll(inside).toBe(true)

  // A table is a box like any other: it connects, is copied with its columns, and is kept.
  await editor.addElement('Software System', 'Shop')
  await editor.connect('Shop', 'orders', 'Writes')
  await orders.click()
  await orders.getByRole('button', { name: 'Copy' }).click()
  await expect(editor.element('orders copy').getByRole('list', { name: 'Columns' }).getByRole('listitem')).toHaveCount(6)
  await editor.undo()
  await page.reload()
  await expect(editor.element('orders').getByRole('list', { name: 'Columns' }).getByRole('listitem')).toHaveCount(6)
  // One undo per change: the pasted columns go with the edit that brought them.
  await editor.undo()
  await editor.undo()
  await editor.undo()
  await expect(editor.element('orders').getByRole('list', { name: 'Columns' }).getByRole('listitem')).toHaveCount(3)
  expect(consoleErrors).toEqual([])
})

test('J56 Another shape has no columns, and a table without any says how to add them', async ({ editor, page }) => {
  await editor.open()
  await page.getByRole('button', { name: 'Add shape' }).click()
  await page.getByRole('tab', { name: 'Basic' }).click()
  await page.getByRole('button', { name: 'Add Table', exact: true }).click()
  const form = page.getByRole('form', { name: 'New box' })
  await form.getByRole('textbox', { name: 'Title', exact: true }).fill('events')
  await form.getByRole('button', { name: 'Add', exact: true }).click()
  const events = editor.element('events')
  await expect(events.getByRole('list', { name: 'Columns' }).getByRole('listitem')).toHaveCount(0)
  await expect(events).toContainText('No columns yet')

  // As a database it has none to give: the columns go from the form.
  await editor.openEditForm('events')
  const edit = page.getByRole('form', { name: 'Edit box' })
  await expect(edit.getByRole('group', { name: 'Columns' })).toBeVisible()
  await edit.getByRole('combobox', { name: 'Shape' }).selectOption({ label: 'Database' })
  await expect(edit.getByRole('group', { name: 'Columns' })).toHaveCount(0)
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(events.getByTestId('card-shape')).toHaveAttribute('data-shape', 'cylinder')
  await expect(events).not.toContainText('No columns yet')
})
