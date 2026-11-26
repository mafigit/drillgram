// The room of a shared session, as the signalling server keeps it (the Worker's
// `worker/signalRoom.ts`, and `signal.vite.ts` in the dev server): who is in it, and who
// gets which message. Browsers meet here to find each other. What they say to each other
// afterwards goes from browser to browser (collab/peer.ts) and does not come this way, but
// for two browsers that find no direct way: theirs is passed on here (`relay`), encrypted
// by them with a key the server never sees (collab/relay.ts).
//
// No state of its own: a Worker's memory can go between two messages while its sockets stay,
// so the seats are given with every call and what is to be done comes back as a list.

/** Somebody connected to the room. No role: connected, and has not said yet what for. */
export type Seat = { id: string; role?: 'host' | 'guest' }

/** A server WebRTC asks on its way to a direct connection (STUN), or sends through (TURN). */
export type IceServer = { urls: string | string[]; username?: string; credential?: string }

/** What a browser says to the room. */
export type ToRoom =
  /** "I share this room": the secret the room's name was made from proves it. */
  | { type: 'host'; secret: string }
  | { type: 'join' }
  /** Passed on as it is: from a guest to the host, from the host to the guest named. */
  | { type: 'signal'; to?: string; data: unknown }
  /** As `signal`, for two browsers without a direct way: what they say to each other, encrypted. */
  | { type: 'relay'; to?: string; data: string }

/** What the room says to a browser. */
export type FromRoom =
  | { type: 'hosting'; ice: IceServer[] }
  /** To a guest: the host is there and was told. */
  | { type: 'joining'; ice: IceServer[] }
  /** To the host: a guest came (with servers as fresh as the guest's), or went. */
  | { type: 'joined'; peer: string; ice?: IceServer[] }
  | { type: 'left'; peer: string }
  | { type: 'signal'; from?: string; data: unknown }
  | { type: 'relay'; from?: string; data: string }
  /** No host in this room (yet, or any more). */
  | { type: 'nobody' }
  /** The host is gone: the session is over. */
  | { type: 'ended' }
  | { type: 'full' }
  /** Not the secret of this room, or the room has its host already. */
  | { type: 'refused' }

/** What the server is to do with its sockets. */
export type Effect =
  | { do: 'send'; to: string; message: FromRoom }
  | { do: 'seat'; id: string; role: 'host' | 'guest' }
  | { do: 'close'; id: string }

/** A host and this many guests: every guest is a connection of the host's browser. */
export const MAX_GUESTS = 12
/** A message of the handshake is a few thousand characters. */
export const MAX_MESSAGE = 32_000
/** A room's name: 128 bits of a hash, as 22 characters. */
export const ROOM_NAME = /^[A-Za-z0-9_-]{22}$/

const send = (to: string, message: FromRoom): Effect => ({ do: 'send', to, message })

function base64url(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

/** A secret for a new room: who has it is the room's host, and nobody else can be. */
export function newSecret(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(24)))
}

/** The name of the room a secret opens. It goes into the link; the secret stays with the host. */
export async function roomOf(secret: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return base64url(new Uint8Array(hash).slice(0, 16))
}

function parse(text: string): ToRoom | undefined {
  if (text.length > MAX_MESSAGE) return undefined
  try {
    const said = JSON.parse(text) as Record<string, unknown> | null
    if (typeof said !== 'object' || said === null) return undefined
    if (said.type === 'host' && typeof said.secret === 'string') return { type: 'host', secret: said.secret }
    if (said.type === 'join') return { type: 'join' }
    if (said.type === 'signal' && (said.to === undefined || typeof said.to === 'string')) return { type: 'signal', to: said.to, data: said.data }
    if (said.type === 'relay' && (said.to === undefined || typeof said.to === 'string') && typeof said.data === 'string') return { type: 'relay', to: said.to, data: said.data }
  } catch {
    // Not a message of ours.
  }
  return undefined
}

/**
 * Somebody in the room said something. `seats`: everybody connected, the speaker too. `ice`
 * gives the servers a new connection is to use; it is asked only for somebody who takes a seat.
 */
export async function onMessage(room: string, seats: readonly Seat[], from: Seat, text: string, ice: () => Promise<IceServer[]>): Promise<Effect[]> {
  const said = parse(text)
  // Nothing this room understands: whoever sends it has no business here.
  if (!said) return [{ do: 'close', id: from.id }]
  const host = seats.find((seat) => seat.role === 'host')

  if (said.type === 'host') {
    const refused = from.role !== undefined || host !== undefined || (await roomOf(said.secret)) !== room
    if (refused) return [send(from.id, { type: 'refused' }), { do: 'close', id: from.id }]
    return [{ do: 'seat', id: from.id, role: 'host' }, send(from.id, { type: 'hosting', ice: await ice() })]
  }

  if (said.type === 'join') {
    if (from.role !== undefined) return [{ do: 'close', id: from.id }]
    if (!host) return [send(from.id, { type: 'nobody' }), { do: 'close', id: from.id }]
    if (seats.filter((seat) => seat.role === 'guest').length >= MAX_GUESTS) return [send(from.id, { type: 'full' }), { do: 'close', id: from.id }]
    const servers = await ice()
    return [{ do: 'seat', id: from.id, role: 'guest' }, send(from.id, { type: 'joining', ice: servers }), send(host.id, { type: 'joined', peer: from.id, ice: servers })]
  }

  // The handshake of two browsers, and what two say that found no direct way: between a
  // guest and the host only, never guest to guest.
  const passed = (to: { from?: string }): FromRoom => (said.type === 'relay' ? { type: 'relay', ...to, data: said.data } : { type: 'signal', ...to, data: said.data })
  if (from.role === 'guest') return host ? [send(host.id, passed({ from: from.id }))] : []
  if (from.role === 'host') {
    const guest = seats.find((seat) => seat.id === said.to && seat.role === 'guest')
    return guest ? [send(guest.id, passed({}))] : []
  }
  return [{ do: 'close', id: from.id }]
}

/** Somebody's connection to the room is gone. `seats`: who is still there. */
export function onClose(seats: readonly Seat[], gone: Seat): Effect[] {
  if (gone.role === 'host') {
    // Without its host a session is over, and nobody waits in a room without one.
    return seats.filter((seat) => seat.id !== gone.id).flatMap((seat) => [send(seat.id, { type: 'ended' }), { do: 'close', id: seat.id } satisfies Effect])
  }
  const host = seats.find((seat) => seat.role === 'host')
  return gone.role === 'guest' && host ? [send(host.id, { type: 'left', peer: gone.id })] : []
}
