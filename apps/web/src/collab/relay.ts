import { frames, joiner } from './frames'
import type { Link } from './session'

// The way between two browsers that find no direct one (a strict firewall, some mobile
// networks, WebRTC switched off): what they say to each other is passed on by the room of the
// signalling server (rooms.ts, `relay`). The two encrypt it with a key that is in the share
// link after the "#", the part of an address a browser never sends to a server: the server
// passes on what it cannot read.

const base64url = (bytes: Uint8Array) => {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}
const bytesOf = (text: string) => Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (char) => char.charCodeAt(0))

/** A key for a new session, as it goes into the link: 128 bits, 22 characters. */
export function newKey(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(16)))
}

/** The key of a link, to encrypt with. Throws when it is none. */
export function importKey(text: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bytesOf(text), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

/** Bytes that are never the same twice, said with every piece: the same words never look the same. */
const NONCE = 12

async function seal(key: CryptoKey, text: string): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE))
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, new TextEncoder().encode(text)))
  const both = new Uint8Array(NONCE + sealed.length)
  both.set(nonce)
  both.set(sealed, NONCE)
  return base64url(both)
}

/** Throws for what was not sealed with this key, or was changed on its way. */
async function unseal(key: CryptoKey, data: string): Promise<string> {
  const both = bytesOf(data)
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: both.slice(0, NONCE) }, key, both.slice(NONCE)))
}

export interface Relay {
  /** The connection, as the session uses any. */
  link: Link
  /** What the server passed on from the other side. */
  received(data: unknown): void
  /** The server says the other side is gone, or the server is. */
  closed(): void
  /** Resolves when everything said so far was given to the server. */
  flushed(): Promise<void>
}

/** A connection through the server. `send` gives the server a piece to pass on. */
export function relayLink(deps: { key: CryptoKey; send: (data: string) => void }): Relay {
  const join = joiner()
  /** One after the other, there and back: encrypting takes a moment, the order must hold. */
  let sending = Promise.resolve()
  let receiving = Promise.resolve()
  /** No more to say: closed here. Gone: the other side is, nothing arrives or leaves any more. */
  let closed = false
  let gone = false

  const link: Link = {
    send(message) {
      if (closed || gone) return
      for (const frame of frames(JSON.stringify(message))) {
        sending = sending.then(async () => {
          if (!gone) deps.send(await seal(deps.key, frame))
        })
      }
    },
    close() {
      closed = true
    },
  }

  return {
    link,
    received(data) {
      if (typeof data !== 'string') return
      receiving = receiving.then(async () => {
        if (closed || gone) return
        try {
          const text = join(await unseal(deps.key, data))
          if (text !== undefined) link.onMessage?.(JSON.parse(text))
        } catch {
          // Not sealed with the key of this session: somebody without the whole link.
        }
      })
    },
    closed() {
      if (gone) return
      gone = true
      if (!closed) link.onClose?.()
    },
    flushed: () => sending,
  }
}

const isPointer = (message: unknown): message is { t: 'pointer'; from?: string } =>
  typeof message === 'object' && message !== null && (message as { t?: unknown }).t === 'pointer'

/**
 * A connection that says where pointers are only a few times a second: through the server
 * every message counts against what a day gives for nothing. Of the places a pointer was at
 * in between, the last one is said, so it always comes to rest where its owner's did.
 */
export function sparing(inner: Link, every = 200): Link {
  const last = new Map<string, number>()
  const held = new Map<string, { message: unknown; timer: ReturnType<typeof setTimeout> }>()
  const outer: Link = {
    send(message) {
      if (!isPointer(message)) return inner.send(message)
      const who = message.from ?? ''
      const waiting = held.get(who)
      if (waiting) {
        waiting.message = message
        return
      }
      const since = Date.now() - (last.get(who) ?? -Infinity)
      if (since >= every) {
        last.set(who, Date.now())
        return inner.send(message)
      }
      const entry = {
        message: message as unknown,
        timer: setTimeout(() => {
          held.delete(who)
          last.set(who, Date.now())
          inner.send(entry.message)
        }, every - since),
      }
      held.set(who, entry)
    },
    close() {
      for (const { timer } of held.values()) clearTimeout(timer)
      held.clear()
      inner.close()
    },
  }
  inner.onMessage = (message) => outer.onMessage?.(message)
  inner.onClose = () => outer.onClose?.()
  return outer
}
