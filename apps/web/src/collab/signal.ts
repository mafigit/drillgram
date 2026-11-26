import type { FromRoom, ToRoom } from './rooms'

// The way to the signalling server: a WebSocket to the room of a shared session, at the
// address the app itself comes from (`/signal/<room>`). Only the handshake of two browsers
// goes this way (collab/rooms.ts).

export interface Signal {
  send(message: ToRoom): void
  close(): void
  onMessage?: (message: FromRoom) => void
  /** The server is gone, or closed the connection. Not called after `close()`. */
  onClose?: () => void
}

/** A connection with nothing to say is closed on its way sooner or later: this often, a word. */
const PING_EVERY = 25_000

/** A server that does not take the connection in this time is not there. */
const OPEN_WITHIN = 10_000

/** Connects to a room. Throws when the server is not there. */
export function openSignal(room: string): Promise<Signal> {
  const address = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/signal/${room}`
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(address)
    let closed = false
    const late = setTimeout(() => socket.close(), OPEN_WITHIN)
    const ping = setInterval(() => socket.readyState === WebSocket.OPEN && socket.send('ping'), PING_EVERY)
    const signal: Signal = {
      send: (message) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify(message)),
      close() {
        closed = true
        clearInterval(ping)
        socket.close()
      },
    }
    socket.onopen = () => {
      clearTimeout(late)
      resolve(signal)
    }
    socket.onmessage = (event) => {
      if (event.data === 'pong' || typeof event.data !== 'string') return
      try {
        signal.onMessage?.(JSON.parse(event.data) as FromRoom)
      } catch {
        // Not a message of the room.
      }
    }
    socket.onclose = () => {
      clearTimeout(late)
      clearInterval(ping)
      reject(new Error('The signalling server does not answer.'))
      if (!closed) signal.onClose?.()
    }
  })
}
