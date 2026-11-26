import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Plugin } from 'vite'
import { WebSocketServer } from 'ws'
import type { WebSocket } from 'ws'
import { ROOM_NAME, onClose, onMessage } from './src/collab/rooms.ts'
import type { Effect, Seat } from './src/collab/rooms.ts'

// The meeting point of shared sessions in the dev server (`dev:browser`), which has no
// Worker: what `worker/signalRoom.ts` is on Cloudflare and in the journeys (wrangler's local
// runtime), with the same rooms (src/collab/rooms.ts), under the same address
// (`/signal/<room>`). It names no STUN or TURN server: browsers on one machine or one
// network find each other without.

type Seated = { seat: Seat; socket: WebSocket }

export function signalling(): Plugin {
  const rooms = new Map<string, Map<string, Seated>>()
  /** One thing at a time in a room, as a Durable Object works. */
  const turns = new Map<string, Promise<void>>()
  const sockets = new WebSocketServer({ noServer: true })
  let made = 0

  function sit(room: string, socket: WebSocket) {
    const seats = rooms.get(room) ?? new Map<string, Seated>()
    rooms.set(room, seats)
    const mine: Seated = { seat: { id: `seat-${++made}` }, socket }
    seats.set(mine.seat.id, mine)
    const others = () => [...seats.values()].map((seated) => seated.seat)

    function apply(effects: Effect[]) {
      for (const effect of effects) {
        const to = seats.get(effect.do === 'send' ? effect.to : effect.id)
        if (!to) continue
        if (effect.do === 'send') to.socket.send(JSON.stringify(effect.message))
        else if (effect.do === 'seat') to.seat = { ...to.seat, role: effect.role }
        else to.socket.close()
      }
    }
    const inTurn = (work: () => Promise<void> | void) => {
      const turn = (turns.get(room) ?? Promise.resolve()).then(work).catch(() => {})
      turns.set(room, turn)
    }

    socket.on('message', (data) => {
      const text = data.toString()
      if (text === 'ping') return socket.send('pong')
      inTurn(async () => apply(await onMessage(room, others(), mine.seat, text, async () => [])))
    })
    socket.on('close', () =>
      inTurn(() => {
        seats.delete(mine.seat.id)
        apply(onClose(others(), mine.seat))
        if (seats.size === 0) {
          rooms.delete(room)
          turns.delete(room)
        }
      }),
    )
  }

  function upgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
    const room = /^\/signal\/([^/?]+)$/.exec(request.url ?? '')?.[1]
    // Not a room: somebody else's WebSocket (the dev server's own).
    if (room === undefined) return
    if (!ROOM_NAME.test(room)) return socket.destroy()
    sockets.handleUpgrade(request, socket, head, (opened) => sit(room, opened))
  }

  return {
    name: 'drillgram-signalling',
    configureServer: (server) => void server.httpServer?.on('upgrade', upgrade),
    configurePreviewServer: (server) => void server.httpServer.on('upgrade', upgrade),
  }
}
