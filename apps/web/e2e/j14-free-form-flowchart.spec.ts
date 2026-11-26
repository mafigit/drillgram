import { test, expect } from './fixtures.ts'

// J14 Free-form flowchart: docs/journeys.md#j14-free-form-flowchart
test.fixme('J14 A free-form flowchart snaps shapes and survives a reload', async ({ page, editor }) => {
  await editor.open()
  await editor.newDiagram('Free-form', 'Checkout')

  await editor.addShape('Flowchart', 'Terminator', 'Start')
  await editor.addShape('Flowchart', 'Process', 'Validate cart')
  await editor.addShape('Flowchart', 'Decision', 'In stock?')
  await editor.connect('Start', 'Validate cart')
  await editor.connect('Validate cart', 'In stock?')

  // Drop it 4 px off level with "Start": close enough to snap.
  const start = await editor.element('Start').boundingBox()
  const process = await editor.element('Validate cart').boundingBox()
  if (!start || !process) throw new Error('Shapes are not visible')
  const startCentre = start.y + start.height / 2
  const processCentre = process.y + process.height / 2
  await editor.move('Validate cart', { x: 0, y: startCentre - processCentre + 4 })
  const snapped = await editor.element('Validate cart').boundingBox()
  expect((snapped?.y ?? 0) + (snapped?.height ?? 0) / 2).toBeCloseTo(startCentre, 0)

  await page.reload()

  for (const name of ['Start', 'Validate cart', 'In stock?']) {
    await expect(editor.element(name)).toBeVisible()
  }
  await expect(editor.relationships).toHaveCount(2)
})
