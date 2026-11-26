import { readFile } from 'node:fs/promises'
import { test, expect } from './fixtures.ts'

// J13 Tell a flow: docs/journeys.md#j13-tell-a-flow
test.fixme('J13 Record a flow, play it and export it as Mermaid', async ({ page, editor }) => {
  await editor.open()
  await editor.addElement('Person', 'Customer')
  await editor.addElement('Software System', 'Online Shop')
  await editor.connect('Customer', 'Online Shop', 'Places orders in')

  await editor.newFlow('Place an order')
  await editor.addFlowStep('Places orders in', 'Submits the cart')

  await page.getByRole('button', { name: 'Play flow' }).click()
  await expect(page.getByRole('status', { name: 'Flow step' })).toContainText('1')
  await expect(page.getByRole('status', { name: 'Flow step' })).toContainText('Submits the cart')

  const download = await editor.exportFlowAs('Mermaid')
  expect(download.suggestedFilename()).toMatch(/\.mmd$/)
  const text = await readFile(await download.path(), 'utf8')
  expect(text).toContain('sequenceDiagram')
  expect(text).toContain('Submits the cart')
})
