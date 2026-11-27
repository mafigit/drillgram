import { test, expect } from './fixtures.ts'

// J54 Choose a theme: docs/journeys.md#j54-choose-a-theme
test('J54 The theme is chosen from a menu, applies at once and is kept', async ({ editor, page, consoleErrors }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  const ground = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const canvas = () => page.evaluate(() => getComputedStyle(document.querySelector('.vue-flow')!).backgroundColor)
  const choose = async (name: string) => {
    await page.getByRole('button', { name: 'Theme' }).click()
    await page.getByRole('menuitemradio', { name, exact: true }).click()
  }

  const light = await ground()

  // Six themes, the one in use ticked.
  await page.getByRole('button', { name: 'Theme' }).click()
  await expect(page.getByRole('menuitemradio')).toHaveText([
    /^Light/,
    /^Dark/,
    /^Solarized Light/,
    /^Solarized Dark/,
    /^Catppuccin Latte/,
    /^Catppuccin Mocha/,
  ])
  await expect(page.getByRole('menuitemradio', { name: 'Light', exact: true })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')

  // Solarized Dark: its ground (base03) under the app, and a card on its lighter ground (base02).
  await choose('Solarized Dark')
  await expect.poll(ground).toBe('rgb(0, 43, 54)')
  const card = editor.element('Online Shop').locator('.object-card')
  await expect(card).toHaveCSS('background-color', 'rgb(7, 54, 66)')
  await expect(page.locator('html')).toHaveClass(/dark/)
  const darkCanvas = await canvas()

  // Kept over a reload.
  await page.reload()
  await expect.poll(ground).toBe('rgb(0, 43, 54)')
  await page.getByRole('button', { name: 'Theme' }).click()
  await expect(page.getByRole('menuitemradio', { name: 'Solarized Dark' })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')

  // Solarized Light: base3 under the app, no dark theme any more.
  await choose('Solarized Light')
  await expect.poll(ground).toBe('rgb(253, 246, 227)')
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  expect(await canvas()).not.toBe(darkCanvas)

  // Catppuccin Mocha: its base under the app, a card on surface0, a dark theme.
  await choose('Catppuccin Mocha')
  await expect.poll(ground).toBe('rgb(30, 30, 46)')
  await expect(card).toHaveCSS('background-color', 'rgb(49, 50, 68)')
  await expect(page.locator('html')).toHaveClass(/dark/)

  // Catppuccin Latte: its base under the app, no dark theme.
  await choose('Catppuccin Latte')
  await expect.poll(ground).toBe('rgb(239, 241, 245)')
  await expect(page.locator('html')).not.toHaveClass(/dark/)

  // Back to the plain ones.
  await choose('Dark')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect.poll(ground).not.toBe('rgb(0, 43, 54)')
  await choose('Light')
  await expect.poll(ground).toBe(light)
  expect(consoleErrors).toEqual([])
})
