import { test, expect } from './fixtures.ts'

// J36 Icons on a card: docs/journeys.md#j36-icons-on-a-card
test('J36 Icons are attached to a card and stand beside its name', async ({ editor, consoleErrors }) => {
  await editor.open()
  const card = await editor.addElement('Software System', 'Orders')

  // The picker finds icons by a part of their name, in every set.
  await editor.openIconPicker('Orders')
  const picker = editor.iconPicker
  await picker.getByRole('combobox', { name: 'Find an icon' }).fill('postgres')
  // Every icon has its name under it; under the pointer, the whole name, its set and its licence.
  const postgres = picker.getByRole('option', { name: 'PostgreSQL', exact: true })
  await expect(postgres).toContainText('PostgreSQL')
  await postgres.hover()
  await expect(picker.getByTestId('icon-details')).toHaveText('PostgreSQL · Brands and tools · CC0-1.0')
  await postgres.click()
  // Where the icons come from and what their licences ask is said right there.
  await expect(picker.getByText(/trademarks of their owners/)).toBeVisible()
  await editor.page.keyboard.press('Escape')
  await expect(picker).toHaveCount(0)

  // It is on the card, drawn (the picture loaded), inside the card and left of its name.
  const icon = card.getByRole('img', { name: 'PostgreSQL' })
  await expect(icon).toBeVisible()
  await expect.poll(() => icon.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
  const box = (await card.boundingBox())!
  const at = (await icon.boundingBox())!
  const name = (await card.getByText('Orders', { exact: true }).boundingBox())!
  expect(at.x).toBeGreaterThan(box.x)
  expect(at.y).toBeGreaterThan(box.y)
  expect(at.x + at.width).toBeLessThanOrEqual(name.x + 1)
  expect(at.y + at.height).toBeLessThan(box.y + box.height)

  // A card carries one icon: another one takes its place.
  await editor.openIconPicker('Orders')
  await picker.getByRole('combobox', { name: 'Find an icon' }).fill('api gateway')
  await picker.getByRole('option', { name: 'Amazon API Gateway', exact: true }).click()
  await editor.page.keyboard.press('Escape')
  await expect(card.getByRole('img')).toHaveCount(1)
  await expect(card.getByRole('img', { name: 'Amazon API Gateway' })).toBeVisible()

  // That is a change like any other: undo brings the first icon back; pressing the attached
  // icon in the picker takes it off.
  await editor.undo()
  await expect(card.getByRole('img', { name: 'PostgreSQL' })).toBeVisible()
  await editor.openIconPicker('Orders')
  await picker.getByRole('option', { name: 'PostgreSQL', exact: true }).click()
  await editor.page.keyboard.press('Escape')
  await expect(card.getByRole('img')).toHaveCount(0)
  expect(consoleErrors).toEqual([])
})

test('J36 Cloudflare\'s products have their icons: R2, D1, Workers KV', async ({ editor, consoleErrors }) => {
  await editor.open()
  const card = await editor.addElement('Container', 'Uploads')
  await editor.openIconPicker('Uploads')
  const picker = editor.iconPicker

  // A set of its own, and found by the product's name.
  await picker.getByRole('group', { name: 'Icon set' }).getByRole('button', { name: 'Cloudflare' }).click()
  await picker.getByRole('combobox', { name: 'Find an icon' }).fill('r2')
  const r2 = picker.getByRole('option', { name: 'Cloudflare R2', exact: true })
  // In its own set the name under an icon is the product's alone: the room there is short.
  await expect(r2).toHaveText('R2')
  await r2.hover()
  // Its licence is Cloudflare's own for these drawings.
  await expect(picker.getByTestId('icon-details')).toHaveText('Cloudflare R2 · Cloudflare · CC-BY-4.0')
  await expect(picker.getByText(/Cloudflare/).last()).toBeVisible()
  await r2.click()
  await editor.page.keyboard.press('Escape')
  const icon = card.getByRole('img', { name: 'Cloudflare R2' })
  await expect(icon).toBeVisible()
  await expect.poll(() => icon.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)

  // The others are there too.
  await editor.openIconPicker('Uploads')
  for (const [words, title] of [['d1', 'Cloudflare D1'], ['durable', 'Cloudflare Durable Objects'], ['kv', 'Cloudflare KV'], ['queues', 'Cloudflare Queues']]) {
    await picker.getByRole('combobox', { name: 'Find an icon' }).fill(words!)
    await expect(picker.getByRole('option', { name: title!, exact: true })).toBeVisible()
  }
  expect(consoleErrors).toEqual([])
})

