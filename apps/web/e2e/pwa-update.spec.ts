import { test, expect } from './fixtures.ts'

// Updates are user-confirmed: the "New version available" prompt only appears when a new
// service worker is waiting. The waiting state itself is covered by ReloadPrompt.spec.ts.
// Service-worker inspection is reliable only in Chromium (spike #1).
test.skip(({ browserName }) => browserName !== 'chromium', 'Service-worker tests run in Chromium only')

test('no update prompt on first load', async ({ page, editor, consoleErrors }) => {
  await editor.open()
  await editor.waitForServiceWorker()

  await expect(page.getByRole('button', { name: 'Reload' })).toHaveCount(0)
  await expect(page.getByText('New version available')).toHaveCount(0)
  expect(consoleErrors).toEqual([])
})
