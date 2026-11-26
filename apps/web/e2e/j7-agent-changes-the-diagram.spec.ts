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
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(['read_diagram', 'add_box'])
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
