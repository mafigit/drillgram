import { test, expect } from './fixtures.ts'
import type { Locator } from '@playwright/test'

type Box = { x: number; y: number; width: number; height: number }

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Not visible')
  return box
}

const NAMES = ['Online Shop', 'Billing', 'Warehouse', 'Mail Service']

// J33 Select several cards and arrange only them:
// docs/journeys.md#j33-select-several-cards-and-arrange-only-them
test('J33 Arrange moves only the selected cards', async ({ editor, consoleErrors }) => {
  await editor.open()
  const cards: Locator[] = []
  for (const name of NAMES) cards.push(await editor.addElement('Software System', name))
  await editor.connect('Online Shop', 'Billing', 'Pays')
  await editor.connect('Online Shop', 'Billing', 'Asks for refunds')
  await editor.connect('Billing', 'Online Shop', 'Confirms payments')
  await editor.connect('Warehouse', 'Mail Service', 'Notifies through')

  // Every card in px of the diagram, from the corner of "Warehouse", which is never selected.
  // A card that keeps its size is 220 wide: that tells how large the diagram is shown.
  const layout = async () => {
    const boxes = await Promise.all(cards.map(boxOf))
    const scale = boxes[3]!.width / 220
    const from = boxes[2]!
    return boxes.map((box) => ({
      x: Math.round((box.x - from.x) / scale),
      y: Math.round((box.y - from.y) / scale),
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

  // Ctrl or Cmd with a click adds a card to the selection.
  await editor.element('Online Shop').click()
  await editor.selectAlso('Billing')
  await expect(editor.arrangeButton).toHaveAttribute('title', 'Arrange the 2 selected cards (A)')
  await editor.arrange()
  // The two selected cards share three connections: arranged, they are 160 high.
  await expect.poll(async () => (await layout()).map((card) => card.height)).toEqual([160, 160, 120, 120])
  const arranged = await settled()
  // The cards that were not selected stand where they stood.
  expect(arranged.slice(2)).toEqual(before.slice(2))
  // No two cards closer than 20 px, selected or not.
  for (const [i, a] of arranged.entries()) {
    for (const b of arranged.slice(i + 1)) {
      const apart = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), b.y - (a.y + a.height), a.y - (b.y + b.height))
      expect(apart).toBeGreaterThanOrEqual(19)
    }
  }
  // One change, named after what it did.
  await editor.openHistory()
  await expect(editor.changes.last()).toContainText('Arranged 2 objects')
  await editor.openHistory()
  await editor.undo()
  await expect.poll(layout).toEqual(before)

  // A frame drawn with Shift held selects the cards inside it.
  await editor.clickCanvas()
  await editor.selectFrame(['Warehouse', 'Mail Service'])
  await expect(editor.arrangeButton).toHaveAttribute('title', 'Arrange the 2 selected cards (A)')
  await editor.page.keyboard.press('Delete')
  await expect(editor.element('Warehouse')).toHaveCount(0)
  await expect(editor.element('Mail Service')).toHaveCount(0)
  await expect(editor.element('Online Shop')).toBeVisible()
  await expect(editor.element('Billing')).toBeVisible()
  expect(consoleErrors).toEqual([])
})
