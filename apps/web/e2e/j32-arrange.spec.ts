import { test, expect } from './fixtures.ts'
import type { Locator } from '@playwright/test'

type Box = { x: number; y: number; width: number; height: number }

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Not visible')
  return box
}

const NAMES = ['Online Shop', 'Billing', 'Warehouse', 'Mail Service']

// J32 Arrange lays the diagram out: docs/journeys.md#j32-arrange-lays-the-diagram-out
test('J32 Arrange lays the diagram out, and only cards with many connections grow', async ({ editor, consoleErrors }) => {
  await editor.open()
  const cards: Locator[] = []
  for (const name of NAMES) cards.push(await editor.addElement('Software System', name))
  await editor.connect('Online Shop', 'Billing', 'Pays')
  await editor.connect('Online Shop', 'Billing', 'Asks for refunds')
  await editor.connect('Billing', 'Online Shop', 'Confirms payments')
  await editor.connect('Online Shop', 'Warehouse', 'Ships with')
  await editor.connect('Warehouse', 'Mail Service', 'Notifies through')

  // Every card in px of the diagram, from the first card's corner. A card that keeps its size is
  // 220 wide: that tells how large the diagram is shown. Read until it no longer changes, as the
  // canvas may still be zooming.
  const layout = async () => {
    const boxes = await Promise.all(cards.map(boxOf))
    const scale = boxes[3]!.width / 220
    const [first] = boxes
    return boxes.map((box) => ({
      x: Math.round((box.x - first!.x) / scale),
      y: Math.round((box.y - first!.y) / scale),
      width: Math.round(box.width / scale),
      height: Math.round(box.height / scale),
    }))
  }
  const settled = async () => {
    let last = JSON.stringify(await layout())
    await expect
      .poll(async () => {
        const now = JSON.stringify(await layout())
        const same = now === last
        last = now
        return same
      })
      .toBe(true)
    return layout()
  }
  const before = await settled()
  expect(before.map((card) => card.height)).toEqual([120, 120, 120, 120])

  // Nothing stands still: the press shows at once on the button and on the diagram, while the
  // engine works, and both come to rest when the cards are in place.
  const buttonBusy = await editor.recordAttribute(editor.arrangeButton, 'aria-busy')
  const canvasBusy = await editor.recordAttribute(editor.canvas, 'aria-busy')
  // One press at a time: the button takes no second press until the cards are in place.
  const buttonOff = await editor.recordAttribute(editor.arrangeButton, 'disabled')
  await editor.arrange()
  await expect.poll(buttonOff).toEqual(['', null])
  await expect.poll(buttonBusy).toEqual(['true', 'false'])
  await expect.poll(canvasBusy).toEqual(['true', 'false'])
  // The two cards that share three connections grow; the others keep their size.
  await expect.poll(async () => (await layout()).map((card) => card.height)).toEqual([160, 160, 120, 120])
  const arranged = await settled()
  expect(arranged).not.toEqual(before)
  // No two cards closer than 20 px.
  for (const [i, a] of arranged.entries()) {
    for (const b of arranged.slice(i + 1)) {
      const apart = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), b.y - (a.y + a.height), a.y - (b.y + b.height))
      expect(apart).toBeGreaterThanOrEqual(19)
    }
  }
  // Every connector is drawn, at right angles.
  const connectors = editor.canvas.getByTestId('relationship')
  await expect(connectors).toHaveCount(5)
  for (const connector of await connectors.all()) {
    await expect.poll(() => editor.slantedPieces(connector)).toBe(0)
  }

  // Going back and forth in the history moves the cards too: the diagram is busy while they glide.
  const undoBusy = await editor.recordAttribute(editor.canvas, 'aria-busy')
  await editor.undo()
  await expect.poll(layout).toEqual(before)
  await expect.poll(undoBusy).toEqual(['true', 'false'])
  const redoBusy = await editor.recordAttribute(editor.canvas, 'aria-busy')
  await editor.redo()
  await expect.poll(layout).toEqual(arranged)
  await expect.poll(redoBusy).toEqual(['true', 'false'])
  expect(consoleErrors).toEqual([])
})

// A card that "Arrange" made larger: its connectors start at the border it has now.
test('J32 Connectors and labels go by the size a card has after Arrange', async ({ editor }) => {
  await editor.open()
  const cards: Locator[] = []
  for (const name of NAMES) cards.push(await editor.addElement('Software System', name))
  await editor.connect('Online Shop', 'Billing', 'Pays')
  await editor.connect('Online Shop', 'Billing', 'Asks for refunds')
  await editor.connect('Billing', 'Online Shop', 'Confirms payments')
  await editor.connect('Online Shop', 'Warehouse', 'Ships with')
  // This one leaves "Online Shop" below where a card of the usual size ends.
  await editor.connect('Online Shop', 'Mail Service', 'Notifies through')
  const labels = ['Pays', 'Asks for refunds', 'Confirms payments', 'Ships with', 'Notifies through']

  await editor.arrange()
  await expect.poll(async () => Math.round((await boxOf(cards[0]!)).height / ((await boxOf(cards[3]!)).height / 120))).toBe(160)
  await expect.poll(() => editor.labelsInTheWay(labels, cards)).toEqual([])
})
