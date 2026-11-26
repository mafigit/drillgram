import type { Page, Request } from '@playwright/test'
import { test, expect } from './fixtures.ts'
import { madeUpBoardPdf } from './support/madeUpBoardPdf.ts'

// J67 Import a Miro board: docs/journeys.md#j67-import-a-miro-board

/** What Miro puts on the clipboard for a copy: the JSON, each byte moved up by 59, in base64. */
function clipboardOf(data: unknown): string {
  const bytes = [...new TextEncoder().encode(JSON.stringify(data))].map((byte) => (byte + 59) % 256)
  const meta = `&lt;--(miro-data-v1)${Buffer.from(bytes).toString('base64')}(/miro-data-v1)--&gt;`
  return `<meta charset='utf-8'><html><head></head><body><span data-meta="${meta}"></span></body></html>`
}

/** A frame with two sticky notes and a connector between them, copied on a made-up board. */
const COPIED = {
  boardId: 'uXjVMadeUp0=',
  data: {
    objects: [
      { id: 0, type: 14, widgetData: { type: 'frame', json: { type: 12, text: 'Checkout', _parent: null } } },
      { id: 1, type: 14, widgetData: { type: 'sticker', json: { _parent: { index: 0 }, text: '<p>Cart&nbsp;</p>' } } },
      { id: 2, type: 14, widgetData: { type: 'sticker', json: { _parent: { index: 0 }, text: '<p>Pay</p>' } } },
      {
        id: 3,
        type: 14,
        widgetData: {
          type: 'line',
          json: { primary: { widgetIndex: 1 }, secondary: { widgetIndex: 2 }, _parent: { index: 0 }, line: { captions: [{ text: '<p>Goes to</p>' }] } },
        },
      },
    ],
  },
  version: 2,
  host: 'miro.com',
}

/** Pastes into the focused field what a copy puts on the clipboard: HTML, and its text. */
async function paste(page: Page, html: string, text: string) {
  await page.evaluate(
    ([html, text]) => {
      const data = new DataTransfer()
      data.setData('text/html', html)
      data.setData('text/plain', text)
      document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    },
    [html, text],
  )
}

test('J67 Items copied on a Miro board are pasted in: no token', async ({ editor, page, consoleErrors }) => {
  await editor.open()
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Miro' }).click()
  const field = page.getByRole('textbox', { name: 'Miro items' })
  await field.focus()
  await paste(page, '<p>Cart</p>', 'Cart')
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('no copy from Miro')

  await paste(page, clipboardOf(COPIED), 'Checkout\nCart\nPay\nGoes to')
  await expect(field).toHaveValue('3 boxes and 1 connection from Miro')
  await page.getByRole('button', { name: 'Import from Miro' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await expect(editor.element('Checkout')).toBeVisible()
  await editor.drillDown('Checkout')
  await expect(editor.element('Cart')).toBeVisible()
  await expect(editor.element('Pay')).toBeVisible()
  await expect(editor.relationship('Goes to')).toBeVisible()
  expect(consoleErrors).toEqual([])
})

test('J67 A board exported as a vector PDF comes in', async ({ editor, page, consoleErrors }) => {
  await editor.open()
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Miro' }).click()
  const pdf = page.getByLabel('Vector PDF')
  await pdf.setInputFiles({ name: 'notes.txt', mimeType: 'application/pdf', buffer: Buffer.from('no PDF at all') })
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('no PDF Drillgram can read')

  await pdf.setInputFiles({ name: 'board.pdf', mimeType: 'application/pdf', buffer: Buffer.from(madeUpBoardPdf()) })
  await expect(page.getByRole('textbox', { name: 'Miro items' })).toHaveValue('6 boxes and 2 connections from board.pdf')
  await page.getByRole('button', { name: 'Import from Miro' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Miro leaves the frame's title out of the PDF.
  await expect(editor.element('Frame')).toBeVisible()
  await expect(editor.element('Orders DB')).toBeVisible()
  await expect(editor.element('Decide')).toBeVisible()
  await expect(editor.element('Notes for later')).toBeVisible()
  await editor.drillDown('Frame')
  await expect(editor.element('Cart')).toBeVisible()
  await expect(editor.element('Pay')).toBeVisible()
  await expect(editor.relationship('Goes to')).toBeVisible()
  expect(consoleErrors).toEqual([])
})

const LINK = 'https://miro.com/app/board/uXjVMadeUp0=/?share_link_id=1'
const TOKEN = 'made-up-token'

/** A made-up board, as Miro's REST API (v2) gives it: a page of items and one of connectors. */
const ITEMS = [
  { id: '1001', type: 'frame', data: { title: 'Checkout', format: 'custom', type: 'freeform' } },
  { id: '1002', type: 'sticky_note', data: { content: '<p>Cart</p><p>Holds what is chosen</p>', shape: 'square' }, parent: { id: '1001' } },
  { id: '1003', type: 'shape', data: { content: '<p>Orders DB</p>', shape: 'can' }, parent: { id: '1001' } },
  { id: '1004', type: 'shape', data: { content: '<p><strong>Payment</strong> Provider</p>', shape: 'rectangle' } },
  { id: '1005', type: 'image', data: { title: 'screenshot.png' } },
  { id: '1006', type: 'card', data: { title: 'Fraud check', description: '<p>Looks at every payment</p>' } },
]
const CONNECTORS = [
  { id: '2001', startItem: { id: '1002' }, endItem: { id: '1003' }, captions: [{ content: '<p>Stores orders</p>' }] },
  { id: '2002', startItem: { id: '1002' }, endItem: { id: '1004' }, captions: [{ content: 'Pays with' }], style: { strokeColor: '#e6280f' } },
  { id: '2003', startItem: { id: '1004' } },
]

/** Answers Miro's API for the board, or refuses as Miro does; notes every request. */
async function serveBoard(page: Page, status = 200): Promise<Request[]> {
  const asked: Request[] = []
  await page.route('https://api.miro.com/**', async (route) => {
    const request = route.request()
    asked.push(request)
    const url = new URL(request.url())
    if (status !== 200) return route.fulfill({ status, json: { status, code: 'tokenNotProvided', message: 'Unauthorized', type: 'error' } })
    const data = url.pathname.endsWith('/items') ? ITEMS : url.pathname.endsWith('/connectors') ? CONNECTORS : undefined
    if (decodeURIComponent(url.pathname.split('/')[3] ?? '') !== 'uXjVMadeUp0=' || !data) {
      return route.fulfill({ status: 404, json: { status: 404, code: 'notFound', message: 'Board not found', type: 'error' } })
    }
    return route.fulfill({ json: { data, total: data.length, size: data.length, limit: 50, links: {}, type: 'cursor-list' } })
  })
  return asked
}

async function importBoard(page: Page, link = LINK, token = TOKEN) {
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Miro' }).click()
  await page.getByText('Or read a whole board, with an access token').click()
  await page.getByRole('textbox', { name: 'Board link' }).fill(link)
  await page.getByLabel('Access token').fill(token)
  await page.getByRole('button', { name: 'Import from Miro' }).click()
}

test('J67 A Miro board comes in: frames are boxes, connectors connections', async ({ editor, page, consoleErrors }) => {
  const asked = await serveBoard(page)
  await editor.open()
  await importBoard(page)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await expect(editor.element('Checkout')).toBeVisible()
  await expect(editor.element('Payment Provider')).toBeVisible()
  await expect(editor.element('Fraud check')).toBeVisible()
  // An image no connector ends at stays behind.
  await expect(editor.element('screenshot.png')).toHaveCount(0)
  // A sticky note inside the frame is connected to a shape outside: drawn one level up.
  await expect(editor.relationships).toHaveAccessibleName('Checkout to Payment Provider')
  expect(asked.every((request) => request.headers()['authorization'] === `Bearer ${TOKEN}`)).toBe(true)

  await editor.drillDown('Checkout')
  await expect(editor.element('Cart')).toBeVisible()
  await expect(editor.element('Orders DB')).toBeVisible()
  await expect(editor.relationship('Stores orders')).toBeVisible()
  await expect(editor.relationship('Pays with')).toBeVisible()

  await editor.backTo('Overview')
  await editor.undo()
  await expect(editor.element('Checkout')).toHaveCount(0)
  expect(consoleErrors).toEqual([])
})

test('J67 A token Miro refuses is said at the field; nothing comes in', async ({ editor, page, consoleErrors }) => {
  await serveBoard(page, 401)
  await editor.open()
  await importBoard(page)
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Miro refused the access token')
  await expect(page.getByRole('button', { name: 'Import from Miro' })).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(editor.element('Checkout')).toHaveCount(0)
  // The browser notes the refused request; that is all.
  expect(consoleErrors.filter((error) => !error.includes('401'))).toEqual([])
})

test('J67 A link that is no board is said at the field', async ({ editor, page, consoleErrors }) => {
  const asked = await serveBoard(page)
  await editor.open()
  await importBoard(page, 'https://example.org/somewhere')
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('not a link to a Miro board')
  expect(asked).toEqual([])

  await page.getByRole('textbox', { name: 'Board link' }).fill('https://miro.com/app/board/uXjVGone00=/')
  await page.getByRole('button', { name: 'Import from Miro' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Miro has no board at this link')
  expect(consoleErrors.filter((error) => !error.includes('404'))).toEqual([])
})
