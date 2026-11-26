import { test, expect } from './fixtures.ts'

// J4 Edit safely: docs/journeys.md#j4-edit-safely
test('J4 Rename, move and delete can each be undone and redone', async ({ editor }) => {
  await editor.open()
  await editor.addElement('Software System', 'Shop')

  await editor.rename('Shop', 'Online Shop')
  await expect(editor.element('Online Shop')).toBeVisible()
  await editor.undo()
  await expect(editor.element('Shop')).toBeVisible()
  await editor.redo()
  await expect(editor.element('Online Shop')).toBeVisible()

  const place = () => editor.element('Online Shop').boundingBox()
  const before = await place()
  await editor.move('Online Shop', { x: 120, y: 80 })
  await expect.poll(place).not.toEqual(before)
  const moved = await place()
  await editor.undo()
  await expect.poll(place).toEqual(before)
  await editor.redo()
  await expect.poll(place).toEqual(moved)

  await editor.delete('Online Shop')
  await expect(editor.element('Online Shop')).toHaveCount(0)
  await editor.undo()
  await expect(editor.element('Online Shop')).toBeVisible()
  await editor.redo()
  await expect(editor.element('Online Shop')).toHaveCount(0)
})

test('J4 Undo and redo by keyboard', async ({ page, editor }) => {
  await editor.open()
  await editor.addElement('Software System', 'Shop')

  await page.keyboard.press('ControlOrMeta+z')
  await expect(editor.element('Shop')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(editor.element('Shop')).toBeVisible()
})
