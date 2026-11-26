import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { agentTools } from '../src/lib/agentTools'
import type { AgentToolName } from '../src/lib/agentTools'
import type { AgentReply, AgentTool } from '../src/lib/agentProtocol'

export async function serveMcp(request: Request, forward: (tool: AgentTool) => Promise<AgentReply>): Promise<Response> {
  const server = new McpServer({ name: 'Drillgram', version: '1.0.0' })
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true })
  const call = async (tool: AgentTool): Promise<CallToolResult> => {
    const reply = await forward(tool)
    if ('error' in reply) return { isError: true, content: [{ type: 'text', text: reply.error }] }
    const { png_base64: png, ...metadata } = reply.value
    if (tool.name === 'export_diagram' && typeof png === 'string') {
      return { content: [{ type: 'image', data: png, mimeType: 'image/png' }], structuredContent: metadata }
    }
    return { content: [{ type: 'text', text: JSON.stringify(reply.value) }], structuredContent: reply.value }
  }

  for (const name of Object.keys(agentTools) as AgentToolName[]) {
    const { description, schema, effect } = agentTools[name]
    server.registerTool(name, {
      description,
      inputSchema: schema,
      annotations: {
        readOnlyHint: effect === 'read',
        destructiveHint: effect === 'edit',
        openWorldHint: false,
      },
    }, (args: unknown) => call({ name, args } as AgentTool))
  }

  await server.connect(transport)
  return transport.handleRequest(request)
}

export function unpaired(): Response {
  return new Response('No active Drillgram tab matches this bearer token. Start sharing in Drillgram.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Bearer' },
  })
}
