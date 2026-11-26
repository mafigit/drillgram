import { DurableObject } from 'cloudflare:workers'
import { onClose, onMessage } from '../src/collab/rooms'
import type { Effect, IceServer, Seat } from '../src/collab/rooms'

// The meeting point of shared sessions (J19): browsers meet in a room under `/signal/<room>`
// to find each other (src/collab/rooms.ts) and then talk directly. Nothing of a diagram comes
// here that the room could read: what two browsers without a direct way say to each other is
// passed on encrypted. A room is a Durable Object that sleeps between two messages (the
// WebSocket Hibernation API), so a session that is only open costs nothing: who sits where is
// kept on the sockets themselves.

export interface SignalEnv {
  ROOMS: DurableObjectNamespace<SignalRoom>
  /** The STUN server handed to browsers; none where the variable is empty (the journeys). */
  STUN_URL?: string
  /**
   * A TURN key of Cloudflare Realtime, as two secrets of the Worker (context/operations.md):
   * with them, browsers that find no direct way to each other are passed on through
   * Cloudflare's TURN before they fall back to the room. Off without them.
   */
  TURN_KEY_ID?: string
  TURN_KEY_API_TOKEN?: string
}

/** How long a TURN credential is good for: a session can be this long before it must connect anew. */
const TURN_TTL = 86_400

/** What a socket knows of itself, kept on it while the room sleeps. */
type Kept = Seat & { room: string }

export class SignalRoom extends DurableObject<SignalEnv> {
  constructor(ctx: DurableObjectState, env: SignalEnv) {
    super(ctx, env)
    // A browser says "ping" now and then to keep its connection: answered without waking the room.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  async fetch(request: Request): Promise<Response> {
    const room = new URL(request.url).pathname.split('/').pop() ?? ''
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket]
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ id: crypto.randomUUID(), room } satisfies Kept)
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const from = socket.deserializeAttachment() as Kept | null
    if (!from || typeof message !== 'string') return socket.close(1003, 'Text is expected here.')
    const { room, ...seat } = from
    this.apply(await onMessage(room, this.seats(), seat, message, () => this.ice()))
  }

  webSocketClose(socket: WebSocket): void {
    this.left(socket)
  }

  webSocketError(socket: WebSocket): void {
    this.left(socket)
  }

  private left(socket: WebSocket): void {
    const gone = socket.deserializeAttachment() as Kept | null
    if (!gone) return
    this.apply(onClose(this.seats().filter((seat) => seat.id !== gone.id), gone))
  }

  private seats(): Seat[] {
    return this.ctx.getWebSockets().flatMap((socket) => {
      const kept = socket.deserializeAttachment() as Kept | null
      return kept ? [{ id: kept.id, role: kept.role }] : []
    })
  }

  private apply(effects: Effect[]): void {
    const sockets = this.ctx.getWebSockets()
    for (const effect of effects) {
      const id = effect.do === 'send' ? effect.to : effect.id
      const socket = sockets.find((known) => (known.deserializeAttachment() as Kept | null)?.id === id)
      if (!socket) continue
      try {
        if (effect.do === 'send') socket.send(JSON.stringify(effect.message))
        else if (effect.do === 'seat') socket.serializeAttachment({ ...(socket.deserializeAttachment() as Kept), role: effect.role })
        else socket.close(1000, 'Goodbye.')
      } catch {
        // A socket that is gone already.
      }
    }
  }

  /** The servers a new connection goes through: STUN where one is named, TURN when the Worker has a key for it. */
  private async ice(): Promise<IceServer[]> {
    const stun: IceServer[] = this.env.STUN_URL ? [{ urls: this.env.STUN_URL }] : []
    const { TURN_KEY_ID: key, TURN_KEY_API_TOKEN: token } = this.env
    if (!key || !token) return stun
    try {
      const answer = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${key}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: TURN_TTL }),
      })
      if (!answer.ok) return stun
      const { iceServers } = (await answer.json()) as { iceServers?: IceServer | IceServer[] }
      const servers = (Array.isArray(iceServers) ? iceServers : iceServers ? [iceServers] : []).flatMap((server) => {
        // Browsers refuse port 53, and wait long before they give up on it.
        const urls = [server.urls].flat().filter((url) => typeof url === 'string' && !/:53(\?|$)/.test(url))
        return urls.length > 0 ? [{ ...server, urls }] : []
      })
      return servers.length > 0 ? servers : stun
    } catch {
      return stun
    }
  }
}
