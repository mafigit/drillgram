import { test, expect } from './fixtures.ts'

// J7 Agent changes the diagram: docs/journeys.md#j7-agent-changes-the-diagram
test.fixme('J7 An element added over MCP shows up in the open editor', async ({ editor }) => {
  await editor.open()

  // Needs the MCP server (apps/mcp-server) and a test MCP client fixture, for example:
  //   const mcp = await connectTestMcpClient()
  //   await mcp.callTool('add_element', { kind: 'Software System', name: 'Payment Service' })

  await expect(editor.element('Payment Service')).toBeVisible()
})
