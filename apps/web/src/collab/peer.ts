import { frames, joiner } from './frames'
import type { IceServer } from './rooms'
import type { Link } from './session'

// A direct connection between two browsers (WebRTC, a data channel): what the people of a
// shared session say to each other goes this way, encrypted by the browsers, and through no
// server of ours. The two find each other with a handshake that the signalling server passes
// on (collab/signal.ts): an offer, an answer, and the addresses each can be reached at.

export interface PeerDeps {
  /** The servers that tell a browser its address (STUN) or pass its data on when no direct way works (TURN). */
  ice: IceServer[]
  /** Sends a piece of the handshake to the other browser. */
  signal: (data: unknown) => void
}

export interface Peer {
  /** The connection, once it is open. Rejected when the two browsers find no way to each other. */
  link: Promise<Link>
  /** A piece of the handshake from the other browser. */
  signalled(data: unknown): void
  close(): void
}

/**
 * Two browsers that find no direct way to each other in this time take the way through the
 * server (collab/relay.ts). A direct way is found in a second or two where there is one.
 */
const CONNECT_WITHIN = 8_000

/** Whether this browser can connect to another one at all: some have it switched off. */
export const canConnect = () => typeof RTCPeerConnection === 'function'
/** Not more than this waits in the channel to be sent: the rest waits here. */
const BUFFER = 1_000_000

/** `unable`: this side cannot connect directly at all, the other need not wait for it. */
type Handshake = { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit; unable?: true }

/** A peer of a browser that cannot connect directly: it says so, and its connection never opens. */
function unable(deps: PeerDeps): Peer {
  deps.signal({ unable: true } satisfies Handshake)
  const link = Promise.reject<Link>(new Error('This browser does not connect to others directly.'))
  link.catch(() => {})
  return { link, signalled: () => {}, close: () => {} }
}

function linkOf(connection: RTCPeerConnection, channel: RTCDataChannel): Link {
  const join = joiner()
  const queue: string[] = []
  let closed = false
  const link: Link = {
    send(message) {
      queue.push(...frames(JSON.stringify(message)))
      pump()
    },
    close() {
      closed = true
      channel.close()
      connection.close()
    },
  }
  function pump() {
    while (queue.length > 0 && channel.readyState === 'open' && channel.bufferedAmount < BUFFER) channel.send(queue.shift()!)
  }
  function gone() {
    if (closed) return
    closed = true
    connection.close()
    link.onClose?.()
  }
  channel.bufferedAmountLowThreshold = BUFFER / 4
  channel.onbufferedamountlow = pump
  channel.onmessage = (event) => {
    if (typeof event.data !== 'string') return
    const text = join(event.data)
    if (text === undefined) return
    try {
      link.onMessage?.(JSON.parse(text))
    } catch {
      // Not a message of a session.
    }
  }
  channel.onclose = gone
  connection.addEventListener('connectionstatechange', () => {
    if (connection.connectionState === 'failed' || connection.connectionState === 'closed') gone()
  })
  return link
}

function peer(deps: PeerDeps, offers: boolean): Peer {
  if (!canConnect()) return unable(deps)
  const connection = new RTCPeerConnection({ iceServers: deps.ice })
  /** Addresses that came before the other side's description: they are added after it. */
  const early: RTCIceCandidateInit[] = []
  let over = false
  let fail = () => {}

  const link = new Promise<Link>((resolve, reject) => {
    fail = () => {
      if (over) return
      over = true
      connection.close()
      reject(new Error('The two browsers found no direct way to each other.'))
    }
    const timeout = setTimeout(fail, CONNECT_WITHIN)
    const use = (channel: RTCDataChannel) => {
      const opened = () => {
        clearTimeout(timeout)
        if (over) return
        over = true
        resolve(linkOf(connection, channel))
      }
      if (channel.readyState === 'open') opened()
      else channel.onopen = opened
    }
    connection.addEventListener('connectionstatechange', () => {
      if (connection.connectionState === 'failed') {
        clearTimeout(timeout)
        fail()
      }
    })
    connection.onicecandidate = (event) => event.candidate && deps.signal({ candidate: event.candidate.toJSON() } satisfies Handshake)
    if (offers) {
      use(connection.createDataChannel('drillgram'))
      void connection
        .setLocalDescription()
        .then(() => deps.signal({ description: connection.localDescription!.toJSON() } satisfies Handshake))
        .catch(fail)
    } else {
      connection.ondatachannel = (event) => use(event.channel)
    }
  })
  // Whoever started the connection hears of its end; nobody may be listening yet.
  link.catch(() => {})

  async function signalled(data: unknown): Promise<void> {
    const { description, candidate, unable: cannot } = (typeof data === 'object' && data !== null ? data : {}) as Handshake
    if (cannot) return fail()
    try {
      if (description) {
        await connection.setRemoteDescription(description)
        for (const waiting of early.splice(0)) await connection.addIceCandidate(waiting)
        if (description.type === 'offer') {
          await connection.setLocalDescription()
          deps.signal({ description: connection.localDescription!.toJSON() } satisfies Handshake)
        }
      } else if (candidate) {
        if (connection.remoteDescription) await connection.addIceCandidate(candidate)
        else early.push(candidate)
      }
    } catch {
      // A piece of a handshake that does not fit: the connection fails or times out by itself.
    }
  }

  return {
    link,
    signalled: (data) => void signalled(data),
    close: () => connection.close(),
  }
}

/** The side that begins: a guest, towards the host. */
export const offerPeer = (deps: PeerDeps): Peer => peer(deps, true)
/** The side that is asked: the host, for each guest. */
export const answerPeer = (deps: PeerDeps): Peer => peer(deps, false)
