import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import {
  AGENT_KINDS,
  AGENT_NAME_LIMIT,
  AGENT_SOCKET_PATH,
  AGENT_SOCKET_PROTOCOL,
  CREDENTIAL,
  hashCredential,
  MCP_PATH,
} from '../src/lib/agentProtocol'
import type { AgentReply, AgentTool } from '../src/lib/agentProtocol'
import type { AgentSession, Env } from './agentSession'

export { AgentSession } from './agentSession'

async function serveMcp(request: Request, session: DurableObjectStub<AgentSession>): Promise<Response> {
  const server = new McpServer({ name: 'Drillgram', version: '1.0.0' })
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true })
  const call = async (tool: AgentTool): Promise<CallToolResult> => {
    const reply = await session.call(tool) as AgentReply
    if ('error' in reply) return { isError: true, content: [{ type: 'text', text: reply.error }] }
    return { content: [{ type: 'text', text: JSON.stringify(reply.value) }], structuredContent: reply.value }
  }

  server.registerTool('read_diagram', {
    description: 'Read the diagram currently visible in the paired Drillgram tab, including its boxes and relationships.',
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, () => call({ name: 'read_diagram' }))

  server.registerTool('add_box', {
    description: 'Add a box to the diagram currently visible in the paired Drillgram tab.',
    inputSchema: {
      name: z.string().trim().min(1).max(AGENT_NAME_LIMIT),
      kind: z.enum(AGENT_KINDS).default('box'),
    },
    annotations: { destructiveHint: false, openWorldHint: false },
  }, (args) => call({ name: 'add_box', args }))

  await server.connect(transport)
  return transport.handleRequest(request)
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin')
    if (url.pathname === AGENT_SOCKET_PATH) {
      if (origin !== url.origin) return new Response('Origin not allowed.', { status: 403 })
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required.', { status: 426 })
      const protocols = request.headers.get('Sec-WebSocket-Protocol')?.split(',').map((value) => value.trim())
      if (protocols?.length !== 2 || protocols[0] !== AGENT_SOCKET_PROTOCOL || !CREDENTIAL.test(protocols[1]!)) {
        return new Response('Invalid sharing credential.', { status: 401 })
      }
      const token = await hashCredential(protocols[1]!)
      const session = env.AGENT_SESSIONS.getByName(await hashCredential(token))
      return session.fetch(request)
    }
    if (url.pathname !== MCP_PATH) return env.ASSETS.fetch(request)
    if (origin !== null && origin !== url.origin) return new Response('Origin not allowed.', { status: 403 })

    const token = /^Bearer ([a-f0-9]{64})$/i.exec(request.headers.get('Authorization') ?? '')?.[1]
    if (token) {
      const session = env.AGENT_SESSIONS.getByName(await hashCredential(token))
      if (await session.connected()) return serveMcp(request, session)
    }
    return new Response('No active Drillgram tab matches this bearer token. Start sharing in Drillgram.', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer' },
    })
  },
} satisfies ExportedHandler<Env>
