import { test, expect } from './fixtures.ts'
import { DiagramEditor } from './pages/editor.ts'

// J19 Work together on one diagram: docs/journeys.md#j19-work-together-on-one-diagram
// Needs the sync server. The second browser context must get the same deterministic setup as the
// first (fixed clock, no network outside localhost): move that into a shared helper in
// fixtures.ts when this becomes a real test.
test.fixme('J19 Two people see each other and each other\'s changes', async ({ editor, browser }) => {
  await editor.open()
  await editor.addElement('Software System', 'Online Shop')
  const link = await editor.shareLink()

  const bensContext = await browser.newContext()
  const ben = new DiagramEditor(await bensContext.newPage())
  await ben.page.goto(link)
  await expect(ben.element('Online Shop')).toBeVisible()

  await ben.addElement('Person', 'Customer')
  await editor.rename('Online Shop', 'Web Shop')

  await expect(editor.element('Customer')).toBeVisible()
  await expect(ben.element('Web Shop')).toBeVisible()
  await expect(editor.page.getByRole('list', { name: 'People here' }).getByRole('listitem')).toHaveCount(2)
  await expect(ben.page.getByRole('list', { name: 'People here' }).getByRole('listitem')).toHaveCount(2)

  await bensContext.close()
})
