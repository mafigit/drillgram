import { test, expect } from './fixtures.ts'

// J28 Labels sit beside their connector: docs/journeys.md#j28-labels-sit-beside-their-connector
test('J28 Labels lie on no card, no connector and no other label', async ({ editor }) => {
  await editor.open()
  const cards = [
    await editor.addElement('Software System', 'Online Shop'),
    await editor.addElement('Software System', 'Billing'),
    await editor.addElement('Software System', 'Warehouse'),
  ]
  const labels = ['Pays', 'Ships parcels with']
  await editor.connect('Online Shop', 'Billing', labels[0])
  await editor.connect('Online Shop', 'Warehouse', labels[1])
  // The engine answers a moment after the connector is drawn.
  await expect.poll(() => editor.labelsInTheWay(labels, cards)).toEqual([])
})

test('J28 A long label stays clear when its cards are already close', async ({ editor }) => {
  await editor.open()
  const cards = [
    await editor.addElement('Software System', 'Online Shop'),
    await editor.addElement('Software System', 'Billing'),
  ]
  const label = 'Sends every paid order with its invoice lines to'
  await editor.connect('Online Shop', 'Billing', label)
  await expect.poll(() => editor.labelsInTheWay([label], cards)).toEqual([])
})
