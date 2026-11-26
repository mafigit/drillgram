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
