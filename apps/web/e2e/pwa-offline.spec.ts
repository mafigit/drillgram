import { test, expect } from './fixtures.ts'

// The app shell is precached by the service worker, so it starts without a network connection.
// Service-worker inspection is reliable only in Chromium (spike #1).
test.skip(({ browserName }) => browserName !== 'chromium', 'Service-worker tests run in Chromium only')

test('the app shell loads offline after the service worker is ready', async ({
  page,
  context,
  editor,
}) => {
  await editor.open()
  await editor.waitForServiceWorker()

  await context.setOffline(true)
  await page.reload()

  await expect(page.getByRole('heading', { name: 'Drillgram' })).toBeVisible()
})

test('a deep link renders offline through the navigation fallback', async ({
  page,
  context,
  editor,
}) => {
  await editor.open()
  await editor.waitForServiceWorker()

  await context.setOffline(true)
  await page.goto('/some/route')

  await expect(page.getByRole('heading', { name: 'Drillgram' })).toBeVisible()
})
