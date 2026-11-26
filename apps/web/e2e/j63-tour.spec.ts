import { test, expect } from './fixtures.ts'

// J63 A tour on the first visit: docs/journeys.md#j63-a-tour-on-the-first-visit
// A browser the tour was never shown to: every other journey starts after it.
test.use({ tour: true })

test('J63 The first visit starts a tour that leads through the app on the example', async ({ page, editor, consoleErrors }) => {
  await editor.open()
  await expect(editor.tourStep).toHaveText('Welcome to Drillgram')
  await expect(editor.tour).toContainText('about three minutes')
  await expect(editor.relationships).toHaveCount(0)

  // The tour is about the example: starting it loads the bookshop.
  await editor.tourPress('Start the tour')
  await expect(editor.tourStep).toHaveText('Boxes that open')
  await expect(editor.tour).toContainText('Step 1 of 15')
  await expect(editor.element('Web Shop')).toBeVisible()
  await editor.expectTourPointsAt(editor.element('Web Shop'))

  // Doing what a step asks for leads to the next one.
  await editor.drillDown('Web Shop')
  await expect(editor.tourStep).toHaveText('Several views of one box')
  await expect(editor.element('Shop API')).toBeVisible()
  await editor.expectTourPointsAt(page.getByRole('tablist', { name: 'Views' }), page.getByRole('button', { name: 'New view' }))

  await editor.tourPress('Next')
  await expect(editor.tourStep).toHaveText('The way back')
  await editor.expectTourPointsAt(editor.breadcrumb)
  await editor.backTo('Overview')

  await expect(editor.tourStep).toHaveText('Add a shape')
  await editor.expectTourPointsAt(page.getByRole('toolbar', { name: 'Diagram tools' }))
  await editor.addElement('Software System', 'Gift Cards')
  await expect(editor.element('Gift Cards')).toBeVisible()

  // The label of the new line is typed before the tour goes on.
  await expect(editor.tourStep).toHaveText('Connect two cards')
  await editor.expectTourPointsAt(editor.element('Customer'))
  await editor.element('Warehouse Worker').getByTestId('connection-handle').dragTo(editor.element('Shipping Carrier'))
  await expect(page.getByRole('textbox', { name: 'Relationship label' })).toBeVisible()
  await expect(editor.tourStep).toHaveText('Connect two cards')
  await page.getByRole('textbox', { name: 'Relationship label' }).fill('Hands parcels to')
  await page.keyboard.press('Enter')

  await expect(editor.tourStep).toHaveText('Move a card')
  await editor.expectTourPointsAt(editor.element('Customer'))
  await editor.tourPress('Next')

  await expect(editor.tourStep).toHaveText('Arrange')
  await editor.expectTourPointsAt(editor.arrangeButton)
  await editor.arrange()

  await expect(editor.tourStep).toHaveText('Undo and the timeline')
  await editor.expectTourPointsAt(page.getByRole('button', { name: 'Undo' }), page.getByRole('button', { name: 'History' }))
  await editor.openHistory()
  await expect(editor.timeline).toBeVisible()

  // The steps that only show something: each with its light on what it is about.
  await expect(editor.tourStep).toHaveText('Find anything')
  await editor.expectTourPointsAt(page.getByRole('button', { name: 'Search' }))
  await editor.tourPress('Next')
  await expect(editor.tourStep).toHaveText('Work on a card')
  await editor.expectTourPointsAt(editor.element('Web Shop'))
  await editor.tourPress('Next')
  await expect(editor.tourStep).toHaveText('Select several cards')
  await editor.expectTourPointsAt(page.getByRole('toolbar', { name: 'Diagram tools' }))
  await editor.tourPress('Next')
  await expect(editor.tourStep).toHaveText('The canvas')
  await editor.expectTourPointsAt(page.getByRole('button', { name: 'Zoom out' }), page.getByRole('button', { name: 'Keyboard shortcuts' }))
  await editor.tourPress('Next')
  await expect(editor.tourStep).toHaveText('Import and export')
  await editor.expectTourPointsAt(page.getByRole('button', { name: 'Import', exact: true }), editor.exportButton)
  await editor.tourPress('Next')
  await expect(editor.tourStep).toHaveText('Themes')
  await editor.expectTourPointsAt(page.getByRole('button', { name: 'Theme' }))
  await editor.tourPress('Next')
  await expect(editor.tourStep).toHaveText('Where your diagrams are')
  await expect(editor.tour).toContainText('Step 15 of 15')
  await editor.expectTourPointsAt(editor.workspace)
  await editor.tourPress('Next')

  await expect(editor.tourStep).toHaveText('That is the tour')
  await editor.tourPress('Done')
  await expect(editor.tour).toHaveCount(0)
  // What was done on the way stays.
  await expect(editor.element('Gift Cards')).toBeVisible()
  await expect(editor.relationship('Hands parcels to')).toBeVisible()

  // It was seen: it does not come again.
  await page.reload()
  await expect(editor.element('Gift Cards')).toBeVisible()
  await expect(editor.tour).toHaveCount(0)
  expect(consoleErrors).toEqual([])
})

test('J63 The tour can be skipped, stays away and is offered on an empty workspace', async ({ page, editor, consoleErrors }) => {
  await editor.open()
  await expect(editor.tourStep).toHaveText('Welcome to Drillgram')

  // Not yet said yes or no to: it is there again.
  await page.reload()
  await expect(editor.tourStep).toHaveText('Welcome to Drillgram')

  await editor.tourPress('Skip the tour')
  await expect(editor.tour).toHaveCount(0)
  // Nothing was loaded: the workspace is as empty as it was.
  await expect(page.getByRole('button', { name: 'Load an example' })).toBeVisible()
  await editor.addElement('Person', 'Customer')
  await expect(editor.element('Customer')).toBeVisible()

  await page.reload()
  await expect(editor.element('Customer')).toBeVisible()
  await expect(editor.tour).toHaveCount(0)

  // An empty workspace offers it again.
  await editor.delete('Customer')
  await page.getByRole('button', { name: 'Take the tour' }).click()
  await expect(editor.tourStep).toHaveText('Welcome to Drillgram')
  await editor.tourPress('Start the tour')
  await expect(editor.tourStep).toHaveText('Boxes that open')
  await expect(editor.element('Web Shop')).toBeVisible()
  expect(consoleErrors).toEqual([])
})

test('J63 "Next" does what a step asks for, "Back" goes back, and the tour ends at any step', async ({ page, editor, consoleErrors }) => {
  await editor.open()
  await editor.tourPress('Start the tour')
  await expect(editor.tourStep).toHaveText('Boxes that open')
  // The first step has nothing before it but the welcome.
  await expect(editor.tour.getByRole('button', { name: 'Back' })).toHaveCount(0)

  // The box is opened for who does not open it.
  await editor.tourPress('Next')
  await expect(editor.tourStep).toHaveText('Several views of one box')
  await expect(editor.title).toHaveText('Web Shop')
  await expect(editor.element('Shop API')).toBeVisible()

  // Back: to the step before, on the diagram it is about.
  await editor.tourPress('Back')
  await expect(editor.tourStep).toHaveText('Boxes that open')
  await expect(editor.title).toHaveText('Overview')
  await editor.expectTourPointsAt(editor.element('Web Shop'))

  await editor.tourPress('Next')
  await editor.tourPress('Next')
  await expect(editor.tourStep).toHaveText('The way back')
  await editor.tourPress('Next')
  await expect(editor.tourStep).toHaveText('Add a shape')
  await expect(editor.title).toHaveText('Overview')

  // The page under the tour is the app: a card can be worked on while the tour is there.
  await editor.tourPress('End the tour')
  await expect(editor.tour).toHaveCount(0)
  await expect(page.getByTestId('tour-spotlight')).toHaveCount(0)
  await expect(editor.element('Web Shop')).toBeVisible()
  await page.reload()
  await expect(editor.tour).toHaveCount(0)
  expect(consoleErrors).toEqual([])
})

test('J63 A workspace that has something in it starts no tour', async ({ page, editor }) => {
  await editor.open()
  await editor.tourPress('Skip the tour')
  await editor.addElement('Software System', 'Online Shop')
  await expect(editor.element('Online Shop')).toBeVisible()

  // Another browser of the same user: the tour was never shown to it, the work is there.
  await page.evaluate(() => window.localStorage.removeItem('drillgram.tour'))
  await page.reload()
  await expect(editor.element('Online Shop')).toBeVisible()
  await expect(editor.tour).toHaveCount(0)
})
