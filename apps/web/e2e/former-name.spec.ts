import { test, expect } from './fixtures.ts'

// The app had other names before and saved under them (`ped.`, then `drillplan.`): a diagram
// saved then is still there under the name of today.
for (const former of ['ped.', 'drillplan.']) {
  test(`a diagram saved under an earlier name of the app (${former}) opens under its name of today`, async ({ editor, page }) => {
    await editor.open()
    await editor.addElement('Software System', 'Online Shop')
    // As a browser that last ran the app under that name has it.
    await page.evaluate((prefix) => {
      for (const key of Object.keys(localStorage)) {
        localStorage.setItem(key.replace(/^drillgram\./, prefix), localStorage.getItem(key)!)
        localStorage.removeItem(key)
      }
    }, former)
    const saved = await page.evaluate(() => Object.keys(localStorage).sort())
    expect(saved).toEqual(expect.arrayContaining([`${former}history.v1`, `${former}workspace.v1`]))
    expect(saved.every((key) => key.startsWith(former))).toBe(true)
    await page.reload()
    await expect(editor.element('Online Shop')).toBeVisible()
    expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => !key.startsWith('drillgram.')))).toEqual([])
    expect(await page.evaluate(() => localStorage.getItem('drillgram.workspace.v1'))).toContain('Online Shop')
  })
}
