import { test, expect } from './fixtures.ts'

// J72 The app opens after an update: docs/journeys.md#j72-the-app-opens-after-an-update

/** What the browser notes when a file the page asked for is not there. */
const notFound = (text: string) => text.includes('404')

test('J72 A file of an earlier build is not found, a page of the app is', async ({ request }) => {
  const gone = await request.get('/assets/index-gone.js')
  expect(gone.status()).toBe(404)
  expect(gone.headers()['content-type'] ?? '').not.toContain('text/html')

  const page = await request.get('/w/some-workspace')
  expect(page.status()).toBe(200)
  expect(page.headers()['content-type']).toContain('text/html')
})

test.describe('with the service worker', () => {
  // Service-worker inspection is reliable only in Chromium (spike #1).
  test.skip(({ browserName }) => browserName !== 'chromium', 'Service-worker tests run in Chromium only')

  test('J72 The app opens when the copy the browser keeps asks for files that are gone', async ({ page, editor, consoleErrors }) => {
    await editor.open()
    await expect(editor.title).toHaveText('Overview')
    await editor.waitForServiceWorker()
    await page.reload()
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)

    // The kept page is of an earlier build: every file it names has gone with a later deploy.
    const stale = await page.evaluate(async () => {
      for (const name of await caches.keys()) {
        const cache = await caches.open(name)
        for (const key of await cache.keys()) {
          if (new URL(key.url).pathname !== '/index.html') continue
          const kept = await cache.match(key)
          const html = (await kept!.text()).replaceAll('/assets/', '/assets/gone-')
          await cache.put(key, new Response(html, { headers: kept!.headers }))
          return true
        }
      }
      return false
    })
    expect(stale).toBe(true)

    await page.reload()
    await expect(editor.title).toHaveText('Overview')
    await expect(page.getByRole('heading', { name: 'Drillgram' })).toBeVisible()
    expect(consoleErrors.filter((text) => !notFound(text))).toEqual([])
  })

  test('J72 The app opens when a part it loads later is gone', async ({ page, context, editor, consoleErrors }) => {
    // While the first page is open, the part is not there: the deploy it was of was replaced.
    let pages = 0
    page.on('request', (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) pages++
    })
    await context.route(/\/assets\/WorkspacePage-[^/]+\.js$/, (route) =>
      pages === 1 ? route.fulfill({ status: 404, body: 'There is no such file.' }) : route.fallback(),
    )

    await editor.open()
    await expect(editor.title).toHaveText('Overview')
    expect(pages).toBe(2)
    expect(consoleErrors.filter((text) => !notFound(text))).toEqual([])
  })
})
