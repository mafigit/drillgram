import { readFile } from 'node:fs/promises'
import { test, expect } from './fixtures.ts'

const MERMAID = `C4Context
  Person(Customer, "Customer")
  System(OnlineShop, "Online Shop")
  Rel(Customer, OnlineShop, "Places orders in")
`

// J15 Diagram as code: docs/journeys.md#j15-diagram-as-code
test('J15 Import Mermaid, edit the diagram and export Mermaid', async ({ editor, consoleErrors }) => {
  await editor.open()
  await editor.importMermaid(MERMAID)

  await expect(editor.element('Customer')).toBeVisible()
  await expect(editor.element('Online Shop')).toBeVisible()
  await expect(editor.relationship('Places orders in')).toBeVisible()

  await editor.rename('Online Shop', 'Web Shop')

  const download = await editor.exportAs('Mermaid')
  expect(download.suggestedFilename()).toMatch(/\.mmd$/)
  expect(await readFile(await download.path(), 'utf8')).toContain('"Web Shop"')
  expect(consoleErrors).toEqual([])
})

// D2 as the export writes it, with a system framed around its containers.
const D2 = `vars: {
  c4-level: container
}
"customer": "Customer\\n[Person]" {
  shape: c4-person
}
"shop": "Online Shop\\n[Software System]" {
  style: {stroke-dash: 4}
  "web": "Web App\\n[Container: Vue]" {
  }
  "api": "API\\n[Container: Go]" {
  }
}
"customer" -> "shop"."web": "Shops in"
"shop"."web" -> "shop"."api": "Calls\\n[HTTPS]"
`

test('J15 Import D2: a framed system comes with its containers', async ({ editor }) => {
  await editor.open()
  await editor.addElement('Software System', 'Billing')
  await editor.importDiagram('D2', D2)

  // Beside what was there; that a container is connected shows one level up, without the label.
  await expect(editor.element('Billing')).toBeVisible()
  await expect(editor.element('Customer')).toBeVisible()
  await expect(editor.element('Online Shop')).toBeVisible()
  await expect(editor.relationships).toHaveAccessibleName('Customer to Online Shop')
  await editor.drillDown('Online Shop')
  await expect(editor.element('Web App')).toBeVisible()
  await expect(editor.element('API')).toBeVisible()
  await expect(editor.relationship('Calls [HTTPS]')).toBeVisible()
  await expect(editor.relationship('Shops in')).toBeVisible()

  // One change: undo takes it all back.
  await editor.backTo('Overview')
  await editor.undo()
  await expect(editor.element('Online Shop')).toHaveCount(0)
  await expect(editor.element('Billing')).toBeVisible()
})

test('J15 A file that cannot be read says where', async ({ editor }) => {
  await editor.open()
  await editor.page.getByRole('button', { name: 'Import' }).click()
  await editor.page.getByRole('menuitem', { name: 'Mermaid' }).click()
  await editor.page.getByRole('textbox', { name: 'Mermaid' }).fill('C4Context\n  Person(customer, "Customer")\n  Robot(r2, "R2")\n')
  await editor.page.getByRole('button', { name: 'Import diagram' }).click()
  await expect(editor.page.getByRole('alert')).toContainText('Line 3')
  await expect(editor.element('Customer')).toHaveCount(0)
})

test('J15 A long text scrolls in its box: the button to import it stays on screen', async ({ editor, page }) => {
  await editor.open()
  // Longer than the window is high.
  const many = Array.from({ length: 30 }, (_, i) => `"s${i}": "System ${i}\\n[Software System]" {\n}`).join('\n')
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await page.getByRole('menuitem', { name: 'D2' }).click()
  const box = page.getByRole('textbox', { name: 'D2', exact: true })
  await box.fill(`vars: {\n  c4-level: context\n}\n${many}\n`)

  const button = page.getByRole('button', { name: 'Import diagram' })
  await expect(button).toBeInViewport({ ratio: 1 })
  await expect(page.getByRole('heading', { name: 'Import D2' })).toBeInViewport({ ratio: 1 })
  // The text is all there, and scrolls inside its box.
  expect(await box.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  expect((await box.boundingBox())!.height).toBeLessThan(page.viewportSize()!.height * 0.7)

  await button.click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })
  await expect(editor.element('System 29')).toHaveCount(1)
})

test('J15 A text that is another kind of diagram is said to be that', async ({ editor, page }) => {
  await editor.open()
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await page.getByRole('menuitem', { name: 'D2' }).click()
  await page.getByRole('textbox', { name: 'D2', exact: true }).fill('sequenceDiagram\n    Customer->>Shop: Orders\n')
  await page.getByRole('button', { name: 'Import diagram' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('This is a Mermaid sequence diagram.')
  await expect(page.getByRole('dialog').getByRole('alert')).not.toContainText('Line 1')
  await expect(editor.canvas.getByRole('group')).toHaveCount(0)
})

// A flowchart as people keep them: stacks as subgraphs, one inside another, a column that only
// lays out, styles, and arrows across the stacks.
const FLOWCHART = `flowchart RL
    classDef app fill:#e0f2fe,stroke:#0284c7
    subgraph shop [Shop platform]
        subgraph left[" "]
            direction TB
            px[proxy]:::app
        end
        ord[orders]:::app
        orddb[(orders DB)]
        subgraph planned [Search (planned)]
            idx[indexer]:::app
        end
    end
    subgraph mailing [Mail service]
        mail[mailer]:::app
    end
    ord -->|writes| orddb
    idx --> ord
    mail --> ord
    orddb ~~~ left
  style shop fill:#e5e5e5
`

test('J15 Import a Mermaid flowchart: its subgraphs are boxes with their nodes inside', async ({ editor, page, consoleErrors }) => {
  await editor.open()
  // Whatever format is chosen: the text says that it is a flowchart.
  await editor.importDiagram('D2', FLOWCHART)

  // On the diagram the outermost subgraphs, and that they are connected by what is inside them.
  await expect(editor.canvas.getByRole('group')).toHaveCount(2)
  await expect(editor.element('Shop platform')).toBeVisible()
  await expect(editor.element('Mail service')).toBeVisible()
  await expect(editor.relationships).toHaveAccessibleName('Mail service to Shop platform')

  // Inside a subgraph its nodes, each a box, with the arrows between them and their text; the
  // subgraph inside it is a box of its own; the column without a name is none.
  await editor.drillDown('Shop platform')
  for (const name of ['proxy', 'orders', 'orders DB', 'Search (planned)']) await expect(editor.element(name)).toBeVisible()
  await expect(editor.relationship('writes')).toHaveAccessibleName('orders to orders DB: writes')
  await editor.drillDown('Search (planned)')
  await expect(editor.element('indexer')).toBeVisible()

  // One change: undo takes all of it back.
  await editor.backTo('Overview')
  await editor.undo()
  await expect(editor.canvas.getByRole('group')).toHaveCount(0)
  expect(consoleErrors).toEqual([])
})
