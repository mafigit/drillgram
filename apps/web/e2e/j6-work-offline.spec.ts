import { test, expect } from './fixtures.ts'

// J6 Work offline: docs/journeys.md#j6-work-offline
// Service-worker inspection is reliable only in Chromium (spike #1).
test.skip(({ browserName }) => browserName !== 'chromium', 'Offline journey runs in Chromium only')

test.fixme('J6 Reload and keep editing while offline', async ({ page, context, editor }) => {
  await editor.open()
  await page.evaluate(() => navigator.serviceWorker.ready)

  await context.setOffline(true)
  await page.reload()

  await editor.addElement('Software System', 'Online Shop')
  await expect(editor.element('Online Shop')).toBeVisible()
})
