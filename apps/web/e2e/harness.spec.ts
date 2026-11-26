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

  // Signed in, each test as a user of its own: the session cookie is the only thing a browser
  // starts with. The first run leaves something behind; the second must not find it.
  for (const run of [1, 2]) {
    test(`browser storage starts without what another test left (${run})`, async ({ page, editor }) => {
      await editor.open()

      expect(await page.evaluate(() => localStorage.getItem('leak'))).toBeNull()
      expect(await page.evaluate(() => sessionStorage.length)).toBe(0)
      expect((await page.context().cookies()).map((cookie) => cookie.name)).toEqual(['drillgram_session'])

      await page.evaluate(() => localStorage.setItem('leak', 'yes'))
      await page.context().addCookies([{ name: 'leak', value: 'yes', url: page.url() }])
    })
  }

  test('every test starts as a user of its own, with an empty workspace', async ({ page, editor, account }) => {
    await editor.open()
    await page.getByRole('button', { name: 'Account' }).click()
    await expect(page.getByRole('menu')).toContainText(account.email)
    await expect(editor.canvas.getByRole('group')).toHaveCount(0)
  })
})
