import { test, expect, FIXED_TIME } from './fixtures.ts'

// The deterministic defaults every journey relies on (docs/agents/testing.md).
test.describe('Harness', () => {
  test('the clock starts at the fixed time and runs', async ({ page, editor }) => {
    await editor.open()

    const now = () => page.evaluate(() => Date.now())
    const first = await now()
    expect(first).toBeGreaterThanOrEqual(FIXED_TIME.getTime())
    expect(first).toBeLessThan(FIXED_TIME.getTime() + 60_000)
    await expect.poll(now).toBeGreaterThan(first)
  })

  test('network outside localhost is blocked', async ({ page, editor }) => {
    await editor.open()

    const external = await page.evaluate(() =>
      fetch('https://example.com/').then(
        () => 'loaded',
        () => 'blocked',
      ),
    )
    const local = await page.evaluate(() => fetch('/').then((response) => response.status))

    expect(external).toBe('blocked')
    expect(local).toBe(200)
  })

  test('animations and transitions are off', async ({ page, editor }) => {
    await editor.open()

    const style = await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.transition = 'opacity 2s'
      probe.style.animation = 'spin 2s infinite'
      document.body.append(probe)
      const { transitionDuration, animationName } = getComputedStyle(probe)
      return { transitionDuration, animationName }
    })

    expect(style).toEqual({ transitionDuration: '0s', animationName: 'none' })
  })

  for (const run of [1, 2]) {
    test(`browser storage starts empty (${run})`, async ({ page, editor }) => {
      await editor.open()

      expect(await page.evaluate(() => localStorage.length)).toBe(0)
      expect(await page.evaluate(() => sessionStorage.length)).toBe(0)
      expect(await page.context().cookies()).toEqual([])

      await page.evaluate(() => localStorage.setItem('leak', 'yes'))
      await page.context().addCookies([{ name: 'leak', value: 'yes', url: page.url() }])
    })
  }
})
