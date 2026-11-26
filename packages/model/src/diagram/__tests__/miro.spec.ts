import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { fixtureFetch } from '../../issues/testing/fixture-fetch'
import { isMiroClipboard, miroBoardId, miroClipboardBoard, miroClipboardData, miroDiagram, miroPastedDiagram, readMiroBoard } from '../miro'
import type { MiroConnector, MiroItem } from '../miro'
import { validateDiagram } from '../model'
import { emptyWorkspace, findViewInside, importDiagram, ROOT_VIEW_ID, validateWorkspace } from '../workspace'

const ITEMS: MiroItem[] = [
  { id: '1001', type: 'frame', data: { title: 'Checkout' } },
  { id: '1002', type: 'sticky_note', data: { content: '<p>Cart &amp; basket</p><p>Holds what<br>is chosen</p>' }, parent: { id: '1001' } },
  { id: '1003', type: 'shape', data: { content: '<p>Orders DB</p>', shape: 'can' }, parent: { id: '1001' } },
  { id: '1004', type: 'shape', data: { content: '<p><strong>Payment</strong>&nbsp;Provider</p>', shape: 'rectangle' } },
  { id: '1005', type: 'image', data: { title: 'screenshot.png' } },
  { id: '1006', type: 'card', data: { title: 'Fraud check', description: '<p>Looks at every payment</p>' } },
  { id: '1007', type: 'text', data: { content: 'Remember the refunds' } },
  { id: '1008', type: 'document', data: { title: 'Contract.pdf' } },
  { id: '1009', type: 'shape', data: { content: '', shape: 'rhombus' } },
]
const CONNECTORS: MiroConnector[] = [
  { id: '2001', startItem: { id: '1002' }, endItem: { id: '1003' }, captions: [{ content: '<p>Stores</p>' }, { content: 'orders' }] },
  { id: '2002', startItem: { id: '1002' }, endItem: { id: '1004' }, style: { strokeColor: '#e6280f' } },
  { id: '2003', startItem: { id: '1004' } },
  { id: '2004', startItem: { id: '1006' }, endItem: { id: '1008' } },
]

describe('miroBoardId', () => {
  it('takes the board out of its link', () => {
    expect(miroBoardId('https://miro.com/app/board/uXjVMadeUp0=/')).toBe('uXjVMadeUp0=')
    expect(miroBoardId(' https://miro.com/app/board/uXjVMadeUp0=/?share_link_id=12&moveToWidget=3 ')).toBe('uXjVMadeUp0=')
    expect(miroBoardId('miro.com/app/board/o9J_kx1=')).toBe('o9J_kx1=')
  })

  it('takes no link of somewhere else', () => {
    expect(miroBoardId('https://example.org/app/board/uXjVMadeUp0=/')).toBeUndefined()
    expect(miroBoardId('https://miro.com/app/dashboard/')).toBeUndefined()
    expect(miroBoardId('')).toBeUndefined()
  })
})

describe('miroDiagram', () => {
  const diagram = miroDiagram(ITEMS, CONNECTORS)
  const named = (name: string) => diagram.elements.find((element) => element.name === name)

  it('makes a box of every frame, note, shape, text and card, with what stands in a frame inside', () => {
    validateDiagram(diagram)
    expect(named('Checkout')).toMatchObject({ kind: 'box' })
    expect(named('Checkout')?.inside).toBeUndefined()
    expect(named('Cart & basket')).toMatchObject({ kind: 'box', description: 'Holds what\nis chosen', inside: named('Checkout')!.id })
    expect(named('Orders DB')).toMatchObject({ shape: 'cylinder', inside: named('Checkout')!.id })
    expect(named('Payment Provider')?.shape).toBeUndefined()
    expect(named('Fraud check')).toMatchObject({ description: 'Looks at every payment' })
    expect(named('Remember the refunds')).toMatchObject({ shape: 'text' })
  })

  it('takes frames that hold each other as one inside the other', () => {
    const round = miroDiagram(
      [
        { id: '1', type: 'frame', data: { title: 'A' }, parent: { id: '2' } },
        { id: '2', type: 'frame', data: { title: 'B' }, parent: { id: '1' } },
        { id: '3', type: 'frame', data: { title: 'C' }, parent: { id: '3' } },
      ],
      [],
    )
    validateDiagram(round)
    expect(round.elements.map((element) => element.inside)).toEqual(['m2', undefined, undefined])
  })

  it('names a box without text by what it is', () => {
    expect(named('Shape')).toMatchObject({ shape: 'diamond' })
  })

  it('takes an image, a document or an embed only where a connector ends at it', () => {
    expect(named('screenshot.png')).toBeUndefined()
    expect(named('Contract.pdf')).toBeDefined()
  })

  it('makes a connection of every connector with both ends, its captions the label', () => {
    const id = (name: string) => named(name)!.id
    expect(diagram.relationships).toEqual([
      { from: id('Cart & basket'), to: id('Orders DB'), label: 'Stores orders' },
      { from: id('Cart & basket'), to: id('Payment Provider'), colour: 'red' },
      { from: id('Fraud check'), to: id('Contract.pdf') },
    ])
  })

  it('gives a workspace the check accepts, the frame with a diagram of its own', () => {
    const ws = importDiagram(emptyWorkspace(), ROOT_VIEW_ID, diagram)
    validateWorkspace(ws)
    const checkout = ws.model.objects.find((object) => object.name === 'Checkout')!
    expect(Object.keys(findViewInside(ws, checkout.id)!.positions)).toHaveLength(2)
  })

  it('gives a diagram the model takes for any board', () => {
    const item = fc.record({
      id: fc.stringMatching(/^[0-9]{1,4}$/),
      type: fc.constantFrom('frame', 'sticky_note', 'shape', 'text', 'card', 'app_card', 'image', 'embed', 'mindmap_node', 'unknown'),
      data: fc.record({ content: fc.string(), title: fc.string(), shape: fc.string(), description: fc.string() }, { requiredKeys: [] }),
      parent: fc.option(fc.record({ id: fc.stringMatching(/^[0-9]{1,4}$/) }), { nil: undefined }),
    })
    const end = fc.option(fc.record({ id: fc.stringMatching(/^[0-9]{1,4}$/) }), { nil: undefined })
    const connector = fc.record({ id: fc.string(), startItem: end, endItem: end, captions: fc.option(fc.array(fc.record({ content: fc.string() })), { nil: undefined }) })
    fc.assert(
      fc.property(fc.array(item, { maxLength: 30 }), fc.array(connector, { maxLength: 30 }), (items, connectors) => {
        const made = miroDiagram(items as MiroItem[], connectors as MiroConnector[])
        validateDiagram(made)
        validateWorkspace(importDiagram(emptyWorkspace(), ROOT_VIEW_ID, made))
      }),
    )
  })
})

describe('readMiroBoard', () => {
  const page = (data: unknown[], cursor?: string) => ({ status: 200, body: { data, size: data.length, limit: 50, ...(cursor && { cursor }), links: {}, type: 'cursor-list' } })
  const board = 'https://api.miro.com/v2/boards/uXjVMadeUp0%3D'

  it('reads every page of items and connectors with the token', async () => {
    const { fetch, calls } = fixtureFetch(({ url }) => {
      const at = `${url.origin}${url.pathname}`
      const cursor = url.searchParams.get('cursor')
      if (at === `${board}/items`) return cursor === 'next' ? page(ITEMS.slice(3)) : page(ITEMS.slice(0, 3), 'next')
      if (at === `${board}/connectors`) return page(CONNECTORS)
      return undefined
    })
    const diagram = await readMiroBoard('https://miro.com/app/board/uXjVMadeUp0=/', 'tok', fetch)
    expect(diagram).toEqual(miroDiagram(ITEMS, CONNECTORS))
    expect(calls.map((call) => call.headers.get('authorization'))).toEqual(['Bearer tok', 'Bearer tok', 'Bearer tok'])
  })

  it('says in words what Miro refused', async () => {
    const refusing = (status: number) => fixtureFetch(() => ({ status, body: { status, message: 'no' } })).fetch
    await expect(readMiroBoard('https://miro.com/app/board/uXjVMadeUp0=/', 'tok', refusing(401))).rejects.toThrow(/refused the access token/)
    await expect(readMiroBoard('https://miro.com/app/board/uXjVMadeUp0=/', 'tok', refusing(403))).rejects.toThrow(/boards:read/)
    await expect(readMiroBoard('https://miro.com/app/board/uXjVMadeUp0=/', 'tok', refusing(404))).rejects.toThrow(/no board at this link/)
    await expect(readMiroBoard('https://miro.com/app/board/uXjVMadeUp0=/', 'tok', refusing(429))).rejects.toThrow(/too many/)
    await expect(readMiroBoard('https://example.org/', 'tok', refusing(200))).rejects.toThrow(/not a link to a Miro board/)
  })

  it('says so when Miro cannot be reached', async () => {
    const offline = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    await expect(readMiroBoard('https://miro.com/app/board/uXjVMadeUp0=/', 'tok', offline)).rejects.toThrow(/could not reach Miro/)
  })
})

/** What Miro puts on the clipboard for a copy: the JSON, each byte moved up by 59, in base64. */
function clipboardOf(data: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(data)).map((byte) => (byte + 59) % 256)
  const meta = `&lt;--(miro-data-v1)${btoa(String.fromCharCode(...bytes))}(/miro-data-v1)--&gt;`
  return `<meta charset='utf-8'><html><head></head><body><span data-meta="${meta}"></span></body></html>`
}

/** A copy of a made-up board, shaped as Miro's copies are (2026-11-26). */
const COPIED = {
  isProtected: false,
  boardId: 'uXjVMadeUp0=',
  data: {
    objects: [
      { id: 0, type: 14, widgetData: { type: 'sticker', json: { _parent: { index: 7 }, text: '<p>Cart&nbsp;</p><p>what is chosen</p>' } } },
      { id: 1, type: 14, widgetData: { type: 'shape', json: { _parent: null, text: '<p>Payment</p>', shape: '3' } } },
      {
        id: 2,
        type: 14,
        widgetData: {
          type: 'line',
          json: {
            primary: { positionType: 0, widgetIndex: 0 },
            secondary: { positionType: 0, widgetIndex: 1 },
            _parent: null,
            style: '{"lc":14821903,"ls":2}',
            line: { captions: [] },
          },
        },
      },
      {
        id: 3,
        type: 14,
        widgetData: {
          type: 'stencil',
          json: {
            'ns:diagrammingNotation': { element: 'flowchart-document', collection: 'flowchart' },
            schema: { id: 'flowchart-document', data: { texts: { name: { text: '<p><span style="color: rgb(26, 26, 26);">Invoice</span></p>' } } } },
          },
        },
      },
      {
        id: 4,
        type: 14,
        widgetData: {
          type: 'stencil',
          json: {
            'ns:diagrammingNotation': { element: 'flowchart-container', collection: 'flowchart' },
            schema: { id: 'flowchart-container', data: { texts: { title: { text: '<p>Billing</p>' } } } },
          },
        },
      },
      { id: 5, type: 14, widgetData: { type: 'stencil', json: { schema: { id: 'callouts-callout', data: { texts: { content: { text: '<p><br></p>' } } } } } } },
      { id: 6, type: 14, widgetData: { type: 'line', json: { primary: { widgetIndex: 3 }, secondary: {}, style: '{}' } } },
      { id: 7, type: 14, widgetData: { type: 'frame', json: { type: 12, text: 'Checkout', _parent: null } } },
      { id: 8, type: 14, widgetData: { type: 'sticker', json: { _parent: { index: 7 }, text: '<p>Pay</p>' } } },
      {
        id: 9,
        type: 14,
        widgetData: {
          type: 'line',
          json: { primary: { widgetIndex: 0 }, secondary: { widgetIndex: 8 }, _parent: { index: 7 }, style: '{"lc":3355443}', line: { captions: [{ text: '<p>Goes to</p>' }] } },
        },
      },
      { id: 10, type: 14, widgetData: { type: 'shape', json: { text: '<p>Orders DB</p>', shape: '4' } } },
      { id: 11, type: 14, widgetData: { type: 'shape', json: { text: '<p>Paid?</p>', shape: '8' } } },
      { id: 12, type: 14, widgetData: { type: 'shape', json: { text: '<p>Later</p>', shape: '99' } } },
    ],
    meta: {},
  },
  version: 2,
  host: 'miro.com',
  copierType: 'COPY',
}

describe('a copy from Miro', () => {
  it('is known by its mark', () => {
    expect(isMiroClipboard(clipboardOf(COPIED))).toBe(true)
    expect(isMiroClipboard('<p>Cart</p>')).toBe(false)
    expect(miroClipboardData(clipboardOf(COPIED))).toEqual(COPIED)
  })

  it('reads as the board it was copied from', () => {
    const diagram = miroPastedDiagram(clipboardOf(COPIED))
    validateDiagram(diagram)
    const named = (name: string) => diagram.elements.find((element) => element.name === name)
    expect(named('Cart')).toMatchObject({ kind: 'box', description: 'what is chosen', inside: named('Checkout')!.id })
    expect(named('Pay')).toMatchObject({ inside: named('Checkout')!.id })
    expect(named('Invoice')).toMatchObject({ shape: 'document' })
    expect(named('Payment')?.shape).toBeUndefined()
    expect(named('Orders DB')).toMatchObject({ shape: 'circle' })
    expect(named('Paid?')).toMatchObject({ shape: 'diamond' })
    expect(named('Later')?.shape).toBeUndefined()
    expect(named('Billing')?.shape).toBeUndefined()
    expect(named('Shape')).toMatchObject({ shape: 'callout' })
    expect(diagram.relationships).toEqual([
      { from: named('Cart')!.id, to: named('Payment')!.id, colour: 'red' },
      { from: named('Cart')!.id, to: named('Pay')!.id, label: 'Goes to' },
    ])
  })

  it('says what is wrong with what was pasted', () => {
    expect(() => miroPastedDiagram('<p>Cart</p>')).toThrow(/no copy from Miro/)
    expect(() => miroPastedDiagram('<span data-meta="(miro-data-v1)AAAA(/miro-data-v1)"></span>')).toThrow(/cannot read this copy/)
    expect(() => miroPastedDiagram(clipboardOf({ data: { objects: [] } }))).toThrow(/nothing Drillgram takes/)
  })

  it('gives a diagram the model takes for any copy', () => {
    const json = fc.record(
      {
        text: fc.string(),
        shape: fc.string(),
        _parent: fc.oneof(fc.constant(null), fc.record({ index: fc.nat(8) })),
        primary: fc.record({ widgetIndex: fc.nat(8) }),
        secondary: fc.record({ widgetIndex: fc.nat(8) }),
        style: fc.string(),
      },
      { requiredKeys: [] },
    )
    const object = fc.record({ id: fc.nat(8), widgetData: fc.record({ type: fc.constantFrom('sticker', 'shape', 'line', 'stencil', 'frame', 'text', 'image'), json }) })
    fc.assert(
      fc.property(fc.array(object, { maxLength: 9 }), (objects) => {
        const { items, connectors } = miroClipboardBoard({ data: { objects } })
        validateWorkspace(importDiagram(emptyWorkspace(), ROOT_VIEW_ID, miroDiagram(items, connectors)))
      }),
    )
  })
})
