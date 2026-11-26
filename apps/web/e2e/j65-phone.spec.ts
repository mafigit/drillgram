import { test, expect } from './fixtures.ts'
import type { Locator, Page } from '@playwright/test'

// J65 On a phone: docs/journeys.md#j65-on-a-phone
// A narrow screen and a finger: runs on the phone project only.
test.skip(({ viewport, hasTouch }) => !hasTouch || (viewport?.width ?? Infinity) > 500, 'Phone journey runs on the phone project only')

async function loadExample(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Load an example' }).tap()
  await expect(page.locator('.vue-flow__node[aria-label="Web Shop"]')).toBeVisible()
}

/** How many of the cards are on the screen, whole. */
async function cardsInSight(page: Page, cards: Locator): Promise<number> {
  const screen = page.viewportSize()!
  const boxes = await cards.evaluateAll((all) => all.map((card) => card.getBoundingClientRect().toJSON() as DOMRect))
  return boxes.filter((box) => box.x >= 0 && box.y >= 0 && box.right <= screen.width && box.bottom <= screen.height).length
}

test('J65 Every button of the top bar is on the screen, and the way back can be pressed', async ({ page, editor, consoleErrors }) => {
  await editor.open()
  await loadExample(page)
  for (const name of ['Search', 'Arrange', 'Undo', 'Redo', 'History', 'Import', 'Export', 'Theme', 'Account']) {
    const button = page.getByRole('button', { name, exact: true })
    expect(await editor.onScreen(button), name).toBe(true)
    // A button that cannot be pressed yet (Redo) lets a press through.
    if (await button.isEnabled()) expect(await editor.reachable(button), name).toBe(true)
  }
  // Nothing of the page lies beyond its right edge.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)

  await editor.drillDown('Web Shop')
  await expect(editor.element('Shop API')).toBeVisible()
  const back = editor.breadcrumb.getByRole('link', { name: 'Overview' })
  expect(await editor.onScreen(back)).toBe(true)
  expect((await back.boundingBox())!.width).toBeGreaterThan(40)
  await back.tap()
  await expect(editor.element('Customer')).toBeVisible()
  expect(consoleErrors).toEqual([])
})

test('J65 Nothing on the canvas lies under its toolbar', async ({ page, editor }) => {
  await editor.open()
  await loadExample(page)
  for (const name of ['Zoom out', 'Zoom in', 'Fit to screen', 'Keyboard shortcuts']) {
    const button = page.getByRole('button', { name, exact: true })
    expect(await editor.onScreen(button), name).toBe(true)
    expect(await editor.reachable(button), name).toBe(true)
  }
  // The key folds away on a phone; open, all of it can be read.
  await page.getByRole('button', { name: 'Key', exact: true }).tap()
  for (const entry of await editor.key.getByRole('listitem').all()) {
    expect(await editor.reachable(entry), await entry.innerText()).toBe(true)
  }
})

test('J65 A card follows the finger that drags it', async ({ page, editor }) => {
  await editor.open()
  await editor.tapToAdd('Person', 'Customer')
  const before = (await editor.element('Customer').boundingBox())!
  await editor.fingerDrag('Customer', { x: 0, y: 160 })
  const after = (await editor.element('Customer').boundingBox())!
  // It lands on the grid: within a step of it, at the zoom of the screen.
  expect(after.y - before.y).toBeGreaterThan(120)
  await page.reload()
  await expect(editor.element('Customer')).toBeVisible()
})

test('J65 The diagram is in sight when the app opens, and a card that is added comes into sight', async ({ page, editor }) => {
  await editor.open()
  await loadExample(page)
  await page.reload()
  await expect(editor.element('Web Shop')).toBeVisible()
  await expect.poll(() => cardsInSight(page, editor.cards)).toBeGreaterThan(3)

  await editor.addElement('Software System', 'Gift Cards')
  await expect.poll(() => editor.onScreen(editor.element('Gift Cards'))).toBe(true)
})

test('J65 What is typed on the canvas is as big as on any form, however small the diagram is', async ({ page, editor }) => {
  await editor.open()
  await loadExample(page)
  await editor.dragToConnect('Support Agent', 'Web Shop')
  const label = page.getByRole('textbox', { name: 'Relationship label' })
  await expect(label).toBeVisible()
  expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(24)
  expect(await editor.onScreen(label)).toBe(true)
  await label.fill('Looks up orders in')
  await page.keyboard.press('Enter')
  await expect(editor.relationship('Looks up orders in').first()).toBeAttached()
})

test('J65 Adding a shape: its list stays on the screen, the keyboard stays down, its title is no contact to fill in', async ({ page, editor }) => {
  await editor.open()
  await page.getByRole('button', { name: 'Add shape' }).tap()
  const list = page.getByRole('dialog').filter({ has: page.getByRole('searchbox', { name: 'Search shapes' }) })
  const box = (await list.boundingBox())!
  const screen = page.viewportSize()!
  expect(box.x).toBeGreaterThanOrEqual(8)
  expect(box.x + box.width).toBeLessThanOrEqual(screen.width - 8)
  // A finger came: the keyboard would cover the shapes. It comes with a tap on the search.
  await expect(page.getByRole('searchbox', { name: 'Search shapes' })).not.toBeFocused()

  await page.getByRole('tab', { name: 'C4' }).tap()
  await page.getByRole('button', { name: 'Add Person', exact: true }).tap()
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveAttribute('autocomplete', 'off')
})

test('J65 Several cards are selected by tapping them one after the other', async ({ page, editor }) => {
  await editor.open()
  await editor.tapToAdd('Person', 'Customer')
  await editor.tapToAdd('Software System', 'Online Shop')
  // The card just added is the selected one: a tap on the canvas lets it go.
  await editor.canvas.tap({ position: { x: 200, y: 420 } })
  await expect(editor.element('Online Shop')).not.toHaveClass(/selected/)
  await page.getByRole('button', { name: 'Select several' }).tap()
  await expect(page.getByRole('button', { name: 'Select several' })).toHaveAttribute('aria-pressed', 'true')
  await editor.element('Customer').tap()
  await editor.element('Online Shop').tap()
  await expect(editor.element('Customer')).toHaveClass(/selected/)
  await expect(editor.element('Online Shop')).toHaveClass(/selected/)
  await expect(page.getByRole('button', { name: 'Group' })).toBeVisible()
  // With what the selection offers the toolbar still keeps to the screen.
  expect(await editor.onScreen(page.getByRole('toolbar', { name: 'Diagram tools' }))).toBe(true)
  // A second tap takes a card out again.
  await editor.element('Online Shop').tap()
  await expect(editor.element('Online Shop')).not.toHaveClass(/selected/)
  await expect(editor.element('Customer')).toHaveClass(/selected/)
})

test.describe('a browser the tour was never shown to', () => {
  test.use({ tour: true })

test('J65 The tour fits the phone and speaks of fingers', async ({ page, editor, consoleErrors }) => {
  await editor.open()
  await editor.tourPress('Start the tour')
  const screen = page.viewportSize()!
  const light = page.getByTestId('tour-spotlight')

  // The box it asks to open is near enough to press its magnifier.
  await expect(editor.tourStep).toHaveText('Boxes that open')
  const open = editor.element('Web Shop').getByRole('button', { name: 'Open' })
  await expect.poll(async () => (await open.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(16)
  await open.tap()
  await expect(editor.tourStep).toHaveText('Inside the box')

  for (let step = 2; step <= 17; step++) {
    const title = await editor.tourStep.innerText()
    const text = await editor.tour.innerText()
    expect(text, title).not.toMatch(/\b(Ctrl|Cmd|click|right-click|Shift|Scroll)\b/i)
    if (await light.count()) {
      const box = (await light.boundingBox())!
      expect(box.x, title).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, title).toBeLessThanOrEqual(screen.width)
    }
    if (title === 'The way back') {
      await editor.backTo('Overview')
      await expect(editor.tourStep).toHaveText('Add a shape')
      continue
    }
    if (title === 'The history') {
      // The diagram under the history stays in sight, to see it go back in time.
      expect(await editor.underTheTour([page.getByRole('complementary', { name: 'History' })])).toEqual([])
      const [card, history, canvas] = await Promise.all([editor.tour.boundingBox(), page.getByRole('complementary', { name: 'History' }).boundingBox(), editor.canvas.boundingBox()])
      const covered = (card!.height + history!.height) / canvas!.height
      expect(covered).toBeLessThan(0.8)
    }
    await editor.tourPress('Next')
  }
  await expect(editor.tourStep).toHaveText('That is the tour')
  expect(consoleErrors).toEqual([])
})
})
