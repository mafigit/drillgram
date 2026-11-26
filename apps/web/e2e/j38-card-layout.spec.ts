import { test, expect } from './fixtures.ts'
import type { Locator } from '@playwright/test'

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Not visible')
  return { ...box, middle: box.x + box.width / 2, right: box.x + box.width, bottom: box.y + box.height }
}

// J38 How a card is laid out: docs/journeys.md#j38-how-a-card-is-laid-out
test('J38 A card has its name in the middle, its icon beside it and its type at the bottom', async ({ editor }) => {
  await editor.open()
  const shop = await editor.addElement('Software System', 'Online Shop', { description: 'Sells books to customers' })
  const card = await boxOf(shop)

  // The name is in the middle of the card, the description under it, the type on the last line.
  const name = await boxOf(shop.getByText('Online Shop', { exact: true }))
  const description = await boxOf(shop.getByText('Sells books to customers'))
  const type = await boxOf(shop.getByTestId('card-type'))
  await expect(shop.getByTestId('card-type')).toHaveText('Software system')
  for (const line of [name, description, type]) expect(Math.abs(line.middle - card.middle)).toBeLessThan(3)
  expect(name.bottom).toBeLessThanOrEqual(description.y + 1)
  expect(description.bottom).toBeLessThanOrEqual(type.y + 1)
  expect(card.bottom - type.bottom).toBeLessThan(card.height / 4)
  // The kind is not written a second time at the top.
  await expect(shop).not.toContainText('Software System')

  // The button that opens the next diagram is in the top left corner.
  const open = await boxOf(shop.getByRole('button', { name: 'Open' }))
  expect(open.middle).toBeLessThan(card.x + card.width / 4)
  expect(open.y + open.height / 2).toBeLessThan(card.y + card.height / 3)

  // An icon stands left of the name, on its line.
  await editor.openIconPicker('Online Shop')
  await editor.iconPicker.getByRole('combobox', { name: 'Find an icon' }).fill('postgres')
  await editor.iconPicker.getByRole('option', { name: 'PostgreSQL', exact: true }).click()
  await editor.page.keyboard.press('Escape')
  const icon = await boxOf(shop.getByRole('img', { name: 'PostgreSQL' }))
  const named = await boxOf(shop.getByText('Online Shop', { exact: true }))
  expect(icon.right).toBeLessThanOrEqual(named.x + 1)
  expect(icon.y).toBeLessThan(named.bottom)
  expect(icon.bottom).toBeGreaterThan(named.y)
  expect(icon.x).toBeGreaterThan(card.x)

  // What is not ours says so in its type; a person has a figure on the top border.
  const provider = await editor.addElement('Software System', 'Payment Provider', { external: true })
  await expect(provider.getByTestId('card-type')).toHaveText('External system')
  const customer = await editor.addElement('Person', 'Customer')
  await expect(customer.getByTestId('card-type')).toHaveText('Person')
  const figure = await boxOf(customer.getByTestId('card-figure'))
  const person = await boxOf(customer)
  expect(Math.abs(figure.middle - person.middle)).toBeLessThan(3)
  expect(figure.y).toBeLessThan(person.y)
  expect(figure.bottom).toBeGreaterThan(person.y)
  await expect(shop.getByTestId('card-figure')).toHaveCount(0)
})

test('J38 A container says its technology in its type', async ({ editor }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  await editor.drillDown('Online Shop')
  const app = await editor.addElement('Container', 'Web App', { technology: 'Vue 3' })
  await expect(app.getByTestId('card-type')).toHaveText('Container: Vue 3')
})
