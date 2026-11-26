import { test, expect } from './fixtures.ts'
import type { Locator } from '@playwright/test'

type Box = { x: number; y: number; width: number; height: number }

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Not visible')
  return box
}

const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

// J40 What an object is connected to stands at its frame:
// docs/journeys.md#j40-what-an-object-is-connected-to-stands-at-its-frame
test('J40 Inside an object, its own connections run to its frame', async ({ editor, consoleErrors }) => {
  await editor.open()
  await editor.addElement('Person', 'Customer')
  await editor.addElement('Software System', 'Online Shop')
  await editor.addElement('Software System', 'Payments')
  await editor.connect('Customer', 'Online Shop', 'Buys from')
  await editor.connect('Online Shop', 'Payments', 'Charges through')

  await editor.drillDown('Online Shop')
  await expect(editor.title).toHaveText('Online Shop')
  const web = await editor.addElement('Container', 'Web App')

  // Who the system is connected to is here too, outside its frame.
  const customer = editor.element('Customer')
  const payments = editor.element('Payments')
  await expect(customer).toBeVisible()
  await expect(payments).toBeVisible()
  await expect.poll(async () => overlap(await boxOf(editor.boundary), await boxOf(customer))).toBe(false)
  await expect.poll(async () => overlap(await boxOf(editor.boundary), await boxOf(payments))).toBe(false)
  await expect.poll(async () => overlap(await boxOf(editor.boundary), await boxOf(web))).toBe(true)

  // Their connections are the system's own: they run to the frame, with their labels.
  await expect(editor.boundaryRelationships).toHaveText(['Buys from', 'Charges through'])
  await expect(editor.boundaryRelationships.first()).toHaveAccessibleName('Customer to Online Shop: Buys from')
  await expect(editor.boundaryRelationships.last()).toHaveAccessibleName('Online Shop to Payments: Charges through')

  // They are red, line and label, and the key says why: no part of the system has them yet.
  const colours = await editor.page.evaluate(() => {
    const probe = document.body.appendChild(document.createElement('span'))
    probe.style.color = 'var(--destructive)'
    const red = getComputedStyle(probe).color
    probe.remove()
    const of = (testId: string, property: 'stroke' | 'color') =>
      [...document.querySelectorAll(`[data-testid="${testId}"]`)].map((el) => getComputedStyle(el)[property])
    return { red, lines: of('boundary-connector', 'stroke'), labels: of('boundary-relationship', 'color') }
  })
  expect(colours.lines).toEqual([colours.red, colours.red])
  expect(colours.labels).toEqual([colours.red, colours.red])
  await expect(editor.key).toContainText('Not yet to a part')

  // Said for a card inside, a connection no longer runs to the frame as well.
  // Opened again, the diagram shows all of it, the neighbours above the frame too.
  await editor.backTo('Overview')
  await editor.drillDown('Online Shop')
  await expect(customer).toBeInViewport({ ratio: 1 })
  await expect(payments).toBeInViewport({ ratio: 1 })
  await editor.connect('Customer', 'Web App', 'Shops in')
  await expect(editor.relationship('Shops in')).toHaveCount(1)
  await expect(editor.boundaryRelationships).toHaveText(['Charges through'])

  // With the last one said for a part, nothing is red and the key drops the line.
  await editor.connect('Web App', 'Payments', 'Pays with')
  await expect(editor.boundaryRelationships).toHaveCount(0)
  await expect(editor.key).not.toContainText('Not yet to a part')
  expect(consoleErrors).toEqual([])
})
