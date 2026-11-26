import {
  AGENT_SOCKET_PATH,
  AGENT_SOCKET_PROTOCOL,
  CREDENTIAL,
  hashCredential,
  MCP_PATH,
} from '../src/lib/agentProtocol'
import { ROOM_NAME } from '../src/collab/rooms'
import type { Env } from './agentSession'
import { unpaired } from './mcp'

export { AgentSession } from './agentSession'
export { SignalRoom } from './signalRoom'

/** The room of a shared session (J19), by its name in the link. */
const SIGNAL_PATH = /^\/signal\/([^/]+)$/

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
    const room = SIGNAL_PATH.exec(url.pathname)?.[1]
    if (room !== undefined) {
      if (!ROOM_NAME.test(room)) return new Response('There is nothing here.', { status: 404 })
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required.', { status: 426 })
      // Pages of this site meet here, and no other site's.
      if (origin !== null && origin !== url.origin) return new Response('Origin not allowed.', { status: 403 })
      return env.ROOMS.getByName(room).fetch(request)
    }
    if (url.pathname !== MCP_PATH) return env.ASSETS.fetch(request)
    if (origin !== null && origin !== url.origin) return new Response('Origin not allowed.', { status: 403 })

    const token = /^Bearer ([a-f0-9]{64})$/i.exec(request.headers.get('Authorization') ?? '')?.[1]
    if (!token) return unpaired()
    const session = env.AGENT_SESSIONS.getByName(await hashCredential(token))
    return session.fetch(request)
  },
} satisfies ExportedHandler<Env>
