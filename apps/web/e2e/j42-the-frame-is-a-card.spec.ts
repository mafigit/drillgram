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
const holds = (outer: Box, inner: Box) =>
  inner.x > outer.x && inner.y > outer.y && inner.x + inner.width < outer.x + outer.width && inner.y + inner.height < outer.y + outer.height

const NEIGHBOURS = ['Customer', 'Payments', 'Mail Service']
const LABELS = ['Buys from', 'Charges through', 'Sends e-mail with']

// J42 Around its frame, the opened object is a card of its own:
// docs/journeys.md#j42-around-its-frame-the-opened-object-is-a-card-of-its-own
test('J42 The connectors to the frame are laid by the engine, and Arrange lays out the cards around the frame', async ({ editor, consoleErrors }) => {
  await editor.open()
  await editor.addElement('Person', 'Customer')
  await editor.addElement('Software System', 'Online Shop')
  await editor.addElement('Software System', 'Payments')
  await editor.addElement('Software System', 'Mail Service')
  await editor.connect('Customer', 'Online Shop', 'Buys from')
  await editor.connect('Online Shop', 'Payments', 'Charges through')
  await editor.connect('Online Shop', 'Mail Service', 'Sends e-mail with')
  await editor.drillDown('Online Shop')
  const web = await editor.addElement('Container', 'Web App')
  const api = await editor.addElement('Container', 'API')
  await editor.connect('Web App', 'API', 'Calls')

  // Every connector to the frame: at right angles, from the card's border to the frame's, its
  // label beside the lines (the engine's place for it), on no card.
  const neighbours = NEIGHBOURS.map((name) => editor.element(name))
  const clear = async () => {
    const found: string[] = []
    const lines = await Promise.all((await editor.boundaryConnectors.all()).map((line) => editor.pointsOfPath(line)))
    const cards = await Promise.all([...neighbours, web, api].map(boxOf))
    for (const [i, label] of LABELS.entries()) {
      const box = await boxOf(editor.boundaryRelationships.nth(i))
      if (cards.some((card) => overlap(box, card))) found.push(`"${label}" lies on a card`)
      const hit = lines.some((line) =>
        line.some((p) => p.x > box.x + 1 && p.x < box.x + box.width - 1 && p.y > box.y + 1 && p.y < box.y + box.height - 1),
      )
      if (hit) found.push(`"${label}" lies on a connector`)
    }
    for (const [i, line] of lines.entries()) {
      const inside = cards.some((card) =>
        line.some((p) => p.x > card.x + 2 && p.x < card.x + card.width - 2 && p.y > card.y + 2 && p.y < card.y + card.height - 2),
      )
      if (inside) found.push(`connector ${i} runs through a card`)
    }
    // At right angles: every piece of the path upright or level.
    for (const [i, d] of (await editor.boundaryConnectors.evaluateAll((all) => all.map((p) => p.getAttribute('d') ?? ''))).entries()) {
      const numbers = (d.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number)
      for (let j = 2; j + 1 < numbers.length; j += 2) {
        const [x, y, nextX, nextY] = [numbers[j - 2]!, numbers[j - 1]!, numbers[j]!, numbers[j + 1]!]
        // A rounded bend runs from its start to the corner and on: each step upright or level.
        if (Math.abs(nextX - x) > 0.01 && Math.abs(nextY - y) > 0.01) found.push(`connector ${i} has a slanted piece`)
      }
    }
    return found
  }
  await expect(editor.boundaryRelationships).toHaveText(LABELS)
  await expect.poll(clear).toEqual([])

  // Arrange: the cards inside first, then the frame with them as one card among its neighbours.
  const busy = await editor.recordAttribute(editor.canvas, 'aria-busy')
  await editor.arrange()
  await expect.poll(busy).toEqual(['true', 'false'])
  await expect.poll(async () => {
    const frame = await boxOf(editor.boundary)
    const outside = await Promise.all(neighbours.map(boxOf))
    return {
      neighboursOnTheFrame: outside.filter((card) => overlap(card, frame)).length,
      partsInTheFrame: [holds(frame, await boxOf(web)), holds(frame, await boxOf(api))],
    }
  }).toEqual({ neighboursOnTheFrame: 0, partsInTheFrame: [true, true] })
  await expect(editor.boundaryRelationships).toHaveText(LABELS)
  await expect.poll(clear).toEqual([])

  // A neighbour dropped onto the frame lands beside it: the frame is a card it cannot take.
  const frame = await boxOf(editor.boundary)
  const customer = await boxOf(editor.element('Customer'))
  await editor.move('Customer', {
    x: frame.x + frame.width / 2 - (customer.x + customer.width / 2),
    y: frame.y + frame.height / 2 - (customer.y + customer.height / 2),
  })
  await expect.poll(async () => overlap(await boxOf(editor.element('Customer')), await boxOf(editor.boundary))).toBe(false)
  expect(consoleErrors).toEqual([])
})

test('J42 A card inside the frame cannot be dragged so that the frame runs over a card outside it', async ({ page, editor }) => {
  await editor.open()
  await editor.addElement('Person', 'Customer')
  await editor.addElement('Software System', 'Online Shop')
  await editor.connect('Customer', 'Online Shop', 'Buys from')
  await editor.drillDown('Online Shop')
  const web = await editor.addElement('Container', 'Web App')
  const customer = editor.element('Customer')
  // "Customer" stands above the frame. A card is 220 wide: that tells how large the diagram is shown.
  const scale = (await boxOf(web)).width / 220
  const gapNow = async () => ((await boxOf(web)).y - ((await boxOf(customer)).y + (await boxOf(customer)).height)) / scale
  const start = await gapNow()
  expect(start).toBeGreaterThan(100)

  // Dragged up to 30 px below "Customer": as cards the two would be far enough apart, but the
  // frame, which reaches 72 px above its cards, would lie on "Customer".
  await editor.hold('Web App', { x: 0, y: -(start - 30) }, scale)
  // The preview shows where it would land: not there.
  const preview = editor.canvas.getByTestId('drop-preview')
  await expect.poll(async () => overlapWithFrameRoom(await boxOf(preview), await boxOf(customer), scale)).toBe(false)
  await page.mouse.up()
  await expect.poll(async () => overlap(await boxOf(editor.boundary), await boxOf(customer))).toBe(false)
  await expect.poll(async () => holds(await boxOf(editor.boundary), await boxOf(web))).toBe(true)
  // It did move: as near as the frame allows.
  expect(await gapNow()).toBeLessThan(start)
})

/** Whether a card at `card`, with the frame's room around it (40 px beside and below, 72 above), would lie on `other`. */
function overlapWithFrameRoom(card: Box, other: Box, scale: number): boolean {
  const frame = { x: card.x - 40 * scale, y: card.y - 72 * scale, width: card.width + 80 * scale, height: card.height + 112 * scale }
  return overlap(frame, other)
}

test('J42 Arrange lays the cards around a frame that holds nothing yet, none on it', async ({ editor, consoleErrors }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  // Many neighbours: more than stand beside the frame as they come.
  const names = ['Customer', 'Payments', 'Mail Service', 'Stock', 'Search', 'Reports']
  for (const name of names) await editor.addElement('Software System', name)
  for (const name of names.slice(0, 3)) await editor.connect(name, 'Online Shop', `${name} calls`)
  for (const name of names.slice(3)) await editor.connect('Online Shop', name, `Uses ${name}`)
  await editor.drillDown('Online Shop')
  const neighbours = names.map((name) => editor.element(name))
  for (const neighbour of neighbours) await expect(neighbour).toBeVisible()
  const onTheFrame = async () => {
    const frame = await boxOf(editor.boundary)
    const outside = await Promise.all(neighbours.map(boxOf))
    return outside.filter((card) => overlap(card, frame)).length
  }
  const before = await boxOf(editor.boundary)

  const busy = await editor.recordAttribute(editor.canvas, 'aria-busy')
  await editor.arrange()
  await expect.poll(busy).toEqual(['true', 'false'])
  await expect.poll(onTheFrame).toBe(0)
  // The frame is as large as before: it still holds nothing, and its first card will fit.
  const after = await boxOf(editor.boundary)
  expect(Math.round(after.width / before.width * 100)).toBe(Math.round(after.height / before.height * 100))
  // The first part lands in the frame, on no neighbour.
  const api = await editor.addElement('Container', 'API')
  await expect.poll(async () => holds(await boxOf(editor.boundary), await boxOf(api))).toBe(true)
  await expect.poll(onTheFrame).toBe(0)
  expect(consoleErrors).toEqual([])
})

test('J42 Arrange puts a card outside the frame beside the card it connects to', async ({ editor, consoleErrors }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  await editor.addElement('Software System', 'Payments')
  await editor.addElement('Software System', 'Mail Service')
  await editor.drillDown('Online Shop')
  // A chain of parts: the first and the last stand far apart after Arrange.
  const parts = ['Web App', 'API', 'Orders', 'Billing', 'Outbox']
  for (const part of parts) await editor.addElement('Container', part)
  for (const [at, part] of parts.slice(1).entries()) await editor.connect(parts[at]!, part, `to ${part}`)
  // Each neighbour connects to one end of the chain.
  await editor.addExisting('Payments')
  await editor.addExisting('Mail Service')
  await editor.connect('Payments', 'Web App', 'Pays')
  await editor.connect('Outbox', 'Mail Service', 'Mails')

  const busy = await editor.recordAttribute(editor.canvas, 'aria-busy')
  await editor.arrange()
  await expect.poll(busy).toEqual(['true', 'false'])
  const middle = (box: Box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
  const beside = async (neighbour: string, part: string) => {
    const frame = await boxOf(editor.boundary)
    const [outside, inside] = [await boxOf(editor.element(neighbour)), await boxOf(editor.element(part))]
    const [a, b] = [middle(outside), middle(inside)]
    // Level with its card (above, below, left or right of it), and off the frame.
    return { level: Math.abs(a.x - b.x) < 12 || Math.abs(a.y - b.y) < 12, onTheFrame: overlap(outside, frame) }
  }
  await expect.poll(() => beside('Payments', 'Web App')).toEqual({ level: true, onTheFrame: false })
  await expect.poll(() => beside('Mail Service', 'Outbox')).toEqual({ level: true, onTheFrame: false })
  expect(overlap(await boxOf(editor.element('Payments')), await boxOf(editor.element('Mail Service')))).toBe(false)
  expect(consoleErrors).toEqual([])
})

