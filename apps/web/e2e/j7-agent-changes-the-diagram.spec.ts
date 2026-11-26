import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { test, expect } from './fixtures.ts'

test('J7 A paired MCP client reads and changes the open diagram', async ({ editor, page, request, consoleErrors }) => {
  await editor.open()
  const { url, token } = await editor.connectAgent()
  await editor.checkAgentSetup(url, token)

  const list = (headers: Record<string, string> = {}) => request.post(url, {
    headers: { Accept: 'application/json, text/event-stream', ...headers },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
  })
  expect((await list()).status()).toBe(401)
  expect((await list({ Authorization: `Bearer ${'0'.repeat(64)}` })).status()).toBe(401)
  const headers = { Authorization: `Bearer ${token}` }
  expect((await list({ ...headers, Origin: 'https://example.org' })).status()).toBe(403)

  const client = new Client({ name: 'drillgram-journey', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }))
  try {
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(['read_diagram', 'add_box', 'edit_box', 'read_workspace']))
    const invalid = await client.callTool({ name: 'add_box', arguments: { name: ' ' } })
    expect(invalid.isError).toBe(true)

    const added = await client.callTool({
      name: 'add_box', arguments: { kind: 'softwareSystem', name: 'Payment Service' },
    })
    expect(added).toMatchObject({ structuredContent: { name: 'Payment Service' } })
    await expect(editor.element('Payment Service')).toBeVisible()

    const read = await client.callTool({ name: 'read_diagram' })
    expect(read).toMatchObject({
      structuredContent: {
        elements: expect.arrayContaining([expect.objectContaining({ name: 'Payment Service', kind: 'softwareSystem' })]),
      },
    })

    await editor.disconnectAgent()
    await expect.poll(async () => (await list(headers)).status()).toBe(401)
  } finally {
    await client.close()
  }

  await page.reload()
  await expect(editor.element('Payment Service')).toBeVisible()
  expect(consoleErrors).toEqual([])
})

test('J7 An agent edits boxes, relationships, views and history', async ({ editor, page, consoleErrors }) => {
  await editor.open()
  const { url, token } = await editor.connectAgent()
  const client = new Client({ name: 'editor-tools-journey', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }))

  const call = toolCaller(client)

  try {
    const customer = await call('add_box', { name: 'Customer', kind: 'person', external: true })
    const shop = await call('add_box', { name: 'Shop', kind: 'softwareSystem' })
    await call('edit_box', { box_id: shop.id, name: 'Online Shop', description: 'Takes orders', shape: 'stadium' })
    await expect(editor.element('Online Shop')).toBeVisible()

    const edge = await call('add_relationship', { from: customer.id, to: shop.id, label: 'Orders' })
    await call('edit_relationship', { relationship_id: edge.id, label: 'Places orders', technology: 'HTTPS' })
    await call('set_relationship_color', { relationship_id: edge.id, color: 'teal' })
    await expect(editor.relationship('Places orders')).toBeVisible()

    await call('move_boxes', { moves: [{ box_id: shop.id, x: 800, y: 400 }] })
    const group = await call('group_boxes', { box_ids: [customer.id, shop.id], name: 'Commerce' })
    await call('edit_group', { group_id: group.id, name: 'Storefront' })
    await call('arrange_diagram', { box_ids: [customer.id, shop.id] })
    expect(await call('read_diagram')).toMatchObject({
      groups: [expect.objectContaining({ id: group.id, name: 'Storefront' })],
      connections: [expect.objectContaining({ id: edge.id, label: 'Places orders', colour: 'teal' })],
    })

    const view = await call('create_view', { name: 'Deployment', copy: true })
    await call('open_view', { view_id: view.id })
    await call('rename_view', { view_id: view.id, name: 'Runtime' })
    expect(await call('read_diagram')).toMatchObject({ view: { id: view.id, name: 'Runtime' } })

    await call('open_view', { inside_box_id: shop.id })
    const api = await call('add_box', { name: 'Orders API', kind: 'container', technology: 'Go' })
    await expect(editor.element('Orders API')).toBeVisible()
    await call('import_diagram', { format: 'mermaid', text: 'flowchart TD\n  queue["Order Queue"]' })
    await expect(editor.element('Order Queue')).toBeVisible()
    expect(await call('export_diagram', { format: 'd2' })).toMatchObject({ text: expect.stringContaining('Order Queue') })

    await call('move_history', { action: 'undo' })
    await expect(editor.element('Order Queue')).toHaveCount(0)
    await call('move_history', { action: 'redo' })
    await expect(editor.element('Order Queue')).toBeVisible()
    const history = await call('read_history')
    expect(history.entries).toEqual(expect.arrayContaining([expect.objectContaining({ text: 'Imported 1 object' })]))
    const workspace = await call('read_workspace')
    expect(workspace.boxes).toEqual(expect.arrayContaining([expect.objectContaining({ id: api.id, parent: shop.id })]))
    expect(consoleErrors).toEqual([])
  } finally {
    await client.close()
  }
  await page.reload()
  await expect(editor.element('Order Queue')).toBeVisible()
})

test('J7 An agent reuses boxes, exports images and removes diagram content', async ({ editor, consoleErrors }) => {
  await editor.open()
  const { url, token } = await editor.connectAgent()
  const client = new Client({ name: 'editor-tools-journey', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }))
  const call = toolCaller(client)

  try {
    await call('load_example')
    await expect(editor.element('Web Shop')).toBeVisible()
    await call('move_history', { action: 'go_to', position: 0 })
    expect(await call('read_diagram')).toMatchObject({ boxes: [] })

    const shop = await call('add_box', { name: 'Shop' })
    const bank = await call('add_box', { name: 'Bank' })
    expect(await call('search_icons', { query: 'postgres' })).toMatchObject({
      icons: expect.arrayContaining([expect.objectContaining({ name: 'postgresql' })]),
    })
    await call('set_box_icons', { box_id: bank.id, icons: ['postgresql'] })
    const edge = await call('add_relationship', { from: shop.id, to: bank.id, label: 'Pays' })
    await expect(editor.relationship('Pays')).toBeVisible()

    const overview = await call('read_diagram')
    expect((await client.callTool({ name: 'move_boxes', arguments: {
      moves: [{ box_id: shop.id, x: 800, y: 400 }, { box_id: bank.id, x: 800, y: 400 }],
    } })).isError).toBe(true)
    expect(await call('read_diagram')).toMatchObject({ positions: overview.positions })

    const copied = await call('duplicate_boxes', { box_ids: [bank.id] })
    expect(copied).toMatchObject({ boxes: [{ name: 'Bank copy', icons: ['postgresql'] }] })
    await expect(editor.element('Bank copy')).toBeVisible()
    const group = await call('group_boxes', { box_ids: [shop.id, bank.id], name: 'Payments' })
    await call('ungroup_boxes', { box_ids: [bank.id] })
    expect(await call('read_diagram')).toMatchObject({ groups: [{ id: group.id, members: [shop.id] }] })
    await call('delete_group', { group_id: group.id })
    await call('delete_relationships', { relationship_ids: [edge.id] })
    await expect(editor.relationship('Pays')).toHaveCount(0)

    const view = await call('create_view', { name: 'Payments' })
    expect(await call('read_diagram')).toMatchObject({ view: { id: view.id }, boxes: [] })
    await call('place_box', { box_id: bank.id })
    await expect(editor.element('Bank')).toBeVisible()
    expect(await call('export_diagram', { format: 'svg' })).toMatchObject({
      file_name: expect.stringMatching(/\.svg$/), text: expect.stringContaining('<svg'),
    })
    const png = await client.callTool({ name: 'export_diagram', arguments: { format: 'png' } })
    expect(png).toMatchObject({
      content: [{ type: 'image', mimeType: 'image/png', data: expect.stringMatching(/^iVBORw0KGgo/) }],
      structuredContent: { format: 'png', file_name: expect.stringMatching(/\.png$/) },
    })

    await call('delete_view', { view_id: view.id })
    expect(await call('read_diagram')).toMatchObject({ view: { id: 'landscape' }, groups: [] })
    await call('delete_boxes', { box_ids: [bank.id] })
    await expect(editor.element('Bank')).toHaveCount(0)
    await expect(editor.element('Bank copy')).toBeVisible()
    expect(consoleErrors).toEqual([])
  } finally {
    await client.close()
  }
})

function toolCaller(client: Client) {
  return async (name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> => {
    const response = await client.callTool({ name, arguments: args })
    expect(response.isError, JSON.stringify(response.content)).not.toBe(true)
    expect(response.structuredContent).toBeDefined()
    return response.structuredContent as Record<string, unknown>
  }
}
