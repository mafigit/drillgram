import { test, expect } from './fixtures.ts'

// J9 Pan and zoom: docs/journeys.md#j9-pan-and-zoom
test('J9 Zoom, pan and fit the diagram to the screen', async ({ editor, hasTouch }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  const shop = editor.element('Online Shop')
  const box = async () => {
    const found = await shop.boundingBox()
    if (!found) throw new Error('"Online Shop" is not visible')
    return found
  }

  const before = await box()
  if (hasTouch) await editor.pinch(2)
  else await editor.zoomWithWheel(-300)
  await expect.poll(async () => (await box()).width).toBeGreaterThan(before.width)

  const zoomed = await box()
  if (hasTouch) await editor.touchPan({ x: -150, y: -100 })
  else await editor.pan({ x: -150, y: -100 })
  await expect.poll(async () => (await box()).x).toBeLessThan(zoomed.x)

  await editor.fitToScreen()
  await expect(shop).toBeInViewport({ ratio: 1 })
})
