import type { Page } from '@playwright/test'
import { test, expect } from './fixtures.ts'

type ManifestIcon = { src: string; sizes: string; type?: string; purpose?: string }
type Manifest = {
  name: string
  short_name: string
  start_url: string
  display: string
  theme_color: string
  icons: ManifestIcon[]
}

// The manifest and the iOS tags are <head> elements with no accessible role, so selecting them
// by attribute is the only option here (docs/agents/testing.md, Selectors).
async function loadManifest(page: Page): Promise<{ url: URL; manifest: Manifest }> {
  const link = page.locator('link[rel="manifest"]')
  await expect(link).toHaveAttribute('href', /.+/)
  const href = await link.getAttribute('href')
  const url = new URL(href!, page.url())
  const response = await page.request.get(url.href)
  expect(response.ok()).toBe(true)
  return { url, manifest: (await response.json()) as Manifest }
}

test.describe('PWA manifest', () => {
  test('the manifest meets the install criteria', async ({ page, editor }) => {
    await editor.open()

    const { manifest } = await loadManifest(page)

    expect(manifest).toMatchObject({
      name: 'Drillgram',
      short_name: 'Drillgram',
      start_url: '/',
      display: 'standalone',
      theme_color: '#1e293b',
    })
    expect(manifest.icons).toContainEqual(
      expect.objectContaining({ sizes: '192x192', type: 'image/png' }),
    )
    expect(manifest.icons).toContainEqual(
      expect.objectContaining({ sizes: '512x512', purpose: expect.stringContaining('maskable') }),
    )
  })

  test('every manifest icon is a PNG', async ({ page, editor }) => {
    await editor.open()

    const { url, manifest } = await loadManifest(page)

    expect(manifest.icons.length).toBeGreaterThan(0)
    for (const icon of manifest.icons) {
      const response = await page.request.get(new URL(icon.src, url).href)
      expect(response.status(), icon.src).toBe(200)
      expect(response.headers()['content-type'], icon.src).toContain('image/png')
    }
  })

  test('the iOS home screen tags are present', async ({ page, editor }) => {
    await editor.open()

    const touchIcon = page.locator('link[rel="apple-touch-icon"]')
    await expect(touchIcon).toHaveAttribute('href', /.+/)
    const href = await touchIcon.getAttribute('href')
    const response = await page.request.get(new URL(href!, page.url()).href)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('image/png')

    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
      'content',
      'yes',
    )
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1e293b')
  })
})
