import { test, expect } from './fixtures.ts'

// J51 Several views of one box: docs/journeys.md#j51-several-views-of-one-box
test('J51 A box has several views, each with its own cards and layout', async ({ editor, page, consoleErrors }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  await editor.drillDown('Online Shop')
  await editor.addElement('Container', 'Web App')
  await editor.addElement('Container', 'API')
  await editor.connect('Web App', 'API', 'Calls')

  // Every box has one view to begin with.
  await expect(editor.views).toHaveText(['Structure'])
  await expect(editor.views).toHaveAttribute('aria-selected', 'true')

  // One more, starting with what this one shows: it opens, under its own address.
  await editor.addView('Deployment')
  await expect(editor.views).toHaveText(['Structure', 'Deployment'])
  await expect(editor.views.nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(editor.title).toHaveText('Online Shop: Deployment')
  await expect(page).toHaveURL(/\/view\/view-1$/)
  await expect(editor.element('Web App')).toBeVisible()
  await expect(editor.element('API')).toBeVisible()
  await expect(editor.relationship('Calls')).toBeVisible()
  await expect(editor.boundary).toContainText('Online Shop')

  // A card added here is a part of the box, but stands on this view only.
  await editor.addElement('Container', 'Queue')
  await expect(editor.element('Queue')).toBeVisible()
  // A card moved here stays where it was on the other view.
  const where = async (name: string) => {
    const [card, frame] = [await editor.element(name).boundingBox(), await editor.element('API').boundingBox()]
    return { x: Math.round(card!.x - frame!.x), y: Math.round(card!.y - frame!.y) }
  }
  await editor.views.nth(0).click()
  await expect(editor.title).toHaveText('Online Shop')
  await expect(editor.element('Queue')).toHaveCount(0)
  const before = await where('Web App')
  await editor.views.nth(1).click()
  await expect(editor.element('Queue')).toBeVisible()
  await editor.move('Web App', { x: 0, y: 260 })
  await expect.poll(() => where('Web App')).not.toEqual(before)
  await editor.views.nth(0).click()
  await expect(editor.element('Queue')).toHaveCount(0)
  await expect.poll(() => where('Web App')).toEqual(before)
  // The other view is offered the new part, as an object that exists.
  await page.getByRole('button', { name: 'Add existing object' }).click()
  await expect(page.getByRole('option', { name: 'Queue' })).toBeVisible()
  await page.keyboard.press('Escape')

  // An empty view: nothing on it but the frame of the box.
  await editor.addView('Flow', { empty: true })
  await expect(editor.views).toHaveText(['Structure', 'Deployment', 'Flow'])
  await expect(editor.canvas.getByRole('group')).toHaveCount(0)

  // A view that was added is renamed in its tab and deleted with the button in it; the first one is neither.
  await editor.views.nth(2).dblclick()
  await page.getByRole('textbox', { name: 'View name' }).fill('Checkout flow')
  await page.keyboard.press('Enter')
  await expect(editor.views).toHaveText(['Structure', 'Deployment', 'Checkout flow'])
  await page.getByRole('button', { name: 'Delete the view Checkout flow' }).click()
  await expect(editor.views).toHaveText(['Structure', 'Deployment'])
  await expect(editor.views.nth(0)).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('button', { name: 'Delete the view Deployment' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete the view Structure' })).toHaveCount(0)
  await editor.undo()
  await expect(editor.views).toHaveText(['Structure', 'Deployment', 'Checkout flow'])

  // Opening the box from above leads to its first view; the views are still there after a reload.
  await editor.backTo('Overview')
  await expect(editor.views).toHaveText(['Structure'])
  await editor.drillDown('Online Shop')
  await expect(editor.views.nth(0)).toHaveAttribute('aria-selected', 'true')
  await page.reload()
  await expect(editor.views).toHaveText(['Structure', 'Deployment', 'Checkout flow'])
  await editor.views.nth(1).click()
  await expect(editor.element('Queue')).toBeVisible()
  expect(consoleErrors).toEqual([])
})

test('J51 The Overview has views too, and nothing comes onto an added view by itself', async ({ editor }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  await editor.addView('Team map', { empty: true })
  await expect(editor.title).toHaveText('Overview: Team map')
  await expect(editor.canvas.getByRole('group')).toHaveCount(0)
  await editor.addExisting('Online Shop')
  await expect(editor.element('Online Shop')).toBeVisible()
  // A box added on the first view does not appear here.
  await editor.views.nth(0).click()
  await editor.addElement('Person', 'Customer')
  await editor.views.nth(1).click()
  await expect(editor.element('Online Shop')).toBeVisible()
  await expect(editor.element('Customer')).toHaveCount(0)
})

test('J51 The tabs stay where they are from one view to the next', async ({ editor, page }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  await editor.drillDown('Online Shop')
  await editor.addView('Deployment', { empty: true })
  await editor.addView('Flow', { empty: true })
  const add = page.getByRole('button', { name: 'New view' })
  const places = async () => {
    const boxes = [await editor.views.nth(0).boundingBox(), await editor.views.nth(1).boundingBox(), await editor.views.nth(2).boundingBox(), await add.boundingBox()]
    return boxes.map((box) => [Math.round(box!.x), Math.round(box!.width)])
  }
  await expect(editor.views.nth(2)).toHaveAttribute('aria-selected', 'true')
  const onFlow = await places()
  // The first view has a shorter title and no button to delete it: nothing moves all the same.
  for (const tab of [0, 1]) {
    await editor.views.nth(tab).click()
    await expect(editor.views.nth(tab)).toHaveAttribute('aria-selected', 'true')
    expect(await places()).toEqual(onFlow)
  }
  // Big enough to hit: the tabs and the button beside them.
  expect((await editor.views.nth(0).boundingBox())!.height).toBeGreaterThanOrEqual(28)
  expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(28)
})
