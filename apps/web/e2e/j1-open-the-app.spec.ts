import { test, expect } from './fixtures.ts'

// J1 Open the app: docs/journeys.md#j1-open-the-app
test('J1 Open the app: the empty editor loads without console errors', async ({
  page,
  editor,
  consoleErrors,
}) => {
  await editor.open()

  await expect(page.getByRole('heading', { name: 'Drillgram' })).toBeVisible()
  expect(consoleErrors).toEqual([])
})

// The imprint and the privacy notice are of who runs the app without a server (J62). Somebody
// who runs the server for others says their own: the build with a server carries nobody's.
test('J1 The app with a server carries nobody\'s imprint', async ({ page }) => {
  for (const address of ['/imprint.html', '/privacy.html']) {
    expect((await page.request.get(address)).status(), address).toBe(404)
  }
})
