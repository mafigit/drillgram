import { test, expect } from './fixtures.ts'
import type { DiagramEditor } from './pages/editor.ts'

async function drawShopAndBilling(editor: DiagramEditor): Promise<void> {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  await editor.addElement('Software System', 'Billing')
  await editor.connect('Online Shop', 'Billing', 'Pays')
  await expect(editor.relationship('Pays')).toBeVisible()
}

// J31 Go back along the timeline: docs/journeys.md#j31-go-back-along-the-timeline
test('J31 The timeline shows every change and leads back and forth', async ({ page, editor }) => {
  await drawShopAndBilling(editor)

  await editor.openHistory()
  await expect(editor.changes).toHaveText([
    /Added software system "Online Shop"/,
    /Added software system "Billing"/,
    /Connected "Online Shop" to "Billing": Pays/,
  ])
  for (const time of await editor.changes.getByRole('time').all()) {
    await expect(time).toHaveAttribute('datetime', /^2026-01-01T09:\d\d:\d\d/)
  }

  // Held on the first change: the diagram as it was then.
  await editor.holdTimelineAt(1)
  await expect(editor.element('Online Shop')).toBeVisible()
  await expect(editor.element('Billing')).toHaveCount(0)
  await expect(editor.relationships).toHaveCount(0)

  await page.mouse.up()
  await expect(editor.element('Billing')).toHaveCount(0)
  await expect(editor.changes).toHaveCount(3)

  await editor.redo()
  await expect(editor.element('Billing')).toBeVisible()
  await editor.redo()
  await expect(editor.relationship('Pays')).toBeVisible()

  // A new change after going back: the changes that were undone are dropped.
  await editor.holdTimelineAt(1)
  await page.mouse.up()
  await editor.addElement('Software System', 'Warehouse')
  await expect(editor.changes).toHaveText([
    /Added software system "Online Shop"/,
    /Added software system "Warehouse"/,
  ])
  await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled()
})

test('J31 The change log survives a reload', async ({ page, editor }) => {
  await drawShopAndBilling(editor)
  await editor.undo()
  await expect(editor.relationships).toHaveCount(0)

  await page.reload()

  await editor.openHistory()
  await expect(editor.changes).toHaveCount(3)
  await expect(editor.relationships).toHaveCount(0)
  await editor.redo()
  await expect(editor.relationship('Pays')).toBeVisible()
})

test('J31 The wheel steps along the timeline', async ({ page, editor, hasTouch }) => {
  test.skip(hasTouch, 'A tablet has no wheel')
  await drawShopAndBilling(editor)
  await editor.openHistory()

  await editor.timeline.hover()
  await page.mouse.wheel(0, -100)
  await expect(editor.relationships).toHaveCount(0)
  await expect(editor.element('Billing')).toBeVisible()
  await page.mouse.wheel(0, 100)
  await expect(editor.relationship('Pays')).toBeVisible()
})
