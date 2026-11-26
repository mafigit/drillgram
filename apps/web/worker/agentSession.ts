import { DurableObject } from 'cloudflare:workers'
import { AGENT_SESSION_MS, AGENT_SOCKET_PROTOCOL } from '../src/lib/agentProtocol'
import type { AgentCall, AgentReply, AgentTool } from '../src/lib/agentProtocol'

const CALL_TIMEOUT_MS = 10_000

export interface Env {
  AGENT_SESSIONS: DurableObjectNamespace<AgentSession>
  ASSETS: Fetcher
}

export class AgentSession extends DurableObject<Env> {
  private pending = new Map<string, (reply: AgentReply) => void>()

  async fetch(): Promise<Response> {
    if (this.socket()) return new Response('A tab is already sharing this session.', { status: 409 })
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket]
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment(Date.now() + AGENT_SESSION_MS)
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { 'Sec-WebSocket-Protocol': AGENT_SOCKET_PROTOCOL },
    })
  }

  connected(): boolean {
    return this.socket() !== undefined
  }

  async call(tool: AgentTool): Promise<AgentReply> {
    const id = crypto.randomUUID()
    const socket = this.socket()
    if (!socket) return { id, error: 'The tab is offline. Open Drillgram and start sharing again.' }
    if (this.pending.size >= 16) return { id, error: 'The tab has too many tool calls in progress.' }

    return new Promise((resolve) => {
      const timer = setTimeout(() => finish({ id, error: 'The tab did not reply. Check the diagram before retrying.' }), CALL_TIMEOUT_MS)
      const finish = (reply: AgentReply) => {
        clearTimeout(timer)
        this.pending.delete(id)
        resolve(reply)
      }
      this.pending.set(id, finish)
      try {
        socket.send(JSON.stringify({ id, tool } satisfies AgentCall))
      } catch {
        finish({ id, error: 'The tab disconnected. Open Drillgram and start sharing again.' })
      }
    })
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (socket !== this.socket() || typeof message !== 'string') return
    try {
      const reply = JSON.parse(message) as AgentReply
      this.pending.get(reply.id)?.(reply)
    } catch {
      socket.close(1008, 'Invalid tool response')
    }
  }

  webSocketClose(): void {
    for (const [id, finish] of this.pending) {
      finish({ id, error: 'The tab disconnected. Check the diagram before retrying.' })
    }
  }

  webSocketError(socket: WebSocket): void {
    socket.close(1011, 'Connection lost')
    this.webSocketClose()
  }

  private socket(): WebSocket | undefined {
    const socket = this.ctx.getWebSockets().find((candidate) => candidate.readyState === WebSocket.OPEN)
    if (!socket) return
    if (Number(socket.deserializeAttachment()) > Date.now()) return socket
    socket.close(1000, 'Sharing expired')
  }
}
