import { describe, expect, it } from 'vitest'
import { MAX_GUESTS, MAX_MESSAGE, ROOM_NAME, newSecret, onClose, onMessage, roomOf } from '../rooms'
import type { Effect, Seat } from '../rooms'

const ICE = [{ urls: 'stun:stun.example.org' }]
const ice = async () => ICE
const say = (room: string, seats: Seat[], from: Seat, message: unknown) => onMessage(room, seats, from, JSON.stringify(message), ice)

/** A room with its host, and the guests named. */
async function hosted(...guests: string[]) {
  const secret = newSecret()
  const room = await roomOf(secret)
  const host: Seat = { id: 'h', role: 'host' }
  return { secret, room, host, seats: [host, ...guests.map((id): Seat => ({ id, role: 'guest' }))] }
}

describe('a room of the signalling server', () => {
  it('has a name made from its secret, which the name does not give away', async () => {
    const secret = newSecret()
    expect(await roomOf(secret)).toMatch(ROOM_NAME)
    expect(await roomOf(secret)).toBe(await roomOf(secret))
    expect(await roomOf(newSecret())).not.toBe(await roomOf(secret))
    expect(await roomOf(secret)).not.toContain(secret.slice(0, 8))
  })

  it('seats as its host who has its secret, and gives them the servers to connect through', async () => {
    const secret = newSecret()
    const from: Seat = { id: 'a' }
    expect(await say(await roomOf(secret), [from], from, { type: 'host', secret })).toEqual<Effect[]>([
      { do: 'seat', id: 'a', role: 'host' },
      { do: 'send', to: 'a', message: { type: 'hosting', ice: ICE } },
    ])
  })

  it('refuses a host without the secret, and a second host', async () => {
    const { secret, room, seats } = await hosted()
    const other: Seat = { id: 'x' }
    const refused: Effect[] = [{ do: 'send', to: 'x', message: { type: 'refused' } }, { do: 'close', id: 'x' }]
    expect(await say(room, [other], other, { type: 'host', secret: newSecret() })).toEqual(refused)
    // The right secret, but the room has its host: a second tab of the same browser, or a thief.
    expect(await say(room, [...seats, other], other, { type: 'host', secret })).toEqual(refused)
  })

  it('lets a guest in when the host is there, and tells the host', async () => {
    const { room, seats } = await hosted()
    const guest: Seat = { id: 'g' }
    expect(await say(room, [...seats, guest], guest, { type: 'join' })).toEqual<Effect[]>([
      { do: 'seat', id: 'g', role: 'guest' },
      { do: 'send', to: 'g', message: { type: 'joining', ice: ICE } },
      // The host connects through the same servers as the guest: its own may be hours old.
      { do: 'send', to: 'h', message: { type: 'joined', peer: 'g', ice: ICE } },
    ])
  })

  it('tells a guest that nobody shares, and gives nobody the servers who takes no seat', async () => {
    const guest: Seat = { id: 'g' }
    let asked = 0
    const counted = async () => (asked++, ICE)
    expect(await onMessage('r'.repeat(22), [guest], guest, JSON.stringify({ type: 'join' }), counted)).toEqual<Effect[]>([
      { do: 'send', to: 'g', message: { type: 'nobody' } },
      { do: 'close', id: 'g' },
    ])
    expect(asked).toBe(0)
  })

  it('takes no more guests than a host can serve', async () => {
    const { room, seats } = await hosted(...Array.from({ length: MAX_GUESTS }, (_, i) => `g${i}`))
    const late: Seat = { id: 'late' }
    expect(await say(room, [...seats, late], late, { type: 'join' })).toEqual<Effect[]>([
      { do: 'send', to: 'late', message: { type: 'full' } },
      { do: 'close', id: 'late' },
    ])
  })

  it('passes the handshake between a guest and the host, and never from guest to guest', async () => {
    const { room, seats, host } = await hosted('g1', 'g2')
    const [, g1] = seats
    expect(await say(room, seats, g1!, { type: 'signal', data: { sdp: 'offer' } })).toEqual<Effect[]>([
      { do: 'send', to: 'h', message: { type: 'signal', from: 'g1', data: { sdp: 'offer' } } },
    ])
    expect(await say(room, seats, host, { type: 'signal', to: 'g2', data: { sdp: 'answer' } })).toEqual<Effect[]>([
      { do: 'send', to: 'g2', message: { type: 'signal', data: { sdp: 'answer' } } },
    ])
    // A guest names another guest: it goes to the host all the same.
    expect(await say(room, seats, g1!, { type: 'signal', to: 'g2', data: 1 })).toEqual<Effect[]>([
      { do: 'send', to: 'h', message: { type: 'signal', from: 'g1', data: 1 } },
    ])
    // The host names nobody who is there.
    expect(await say(room, seats, host, { type: 'signal', to: 'gone', data: 1 })).toEqual([])
  })

  it('passes on what two browsers say to each other that found no direct way, as it does the handshake', async () => {
    const { room, seats, host } = await hosted('g1', 'g2')
    expect(await say(room, seats, seats[1]!, { type: 'relay', data: 'c2VjcmV0' })).toEqual<Effect[]>([
      { do: 'send', to: 'h', message: { type: 'relay', from: 'g1', data: 'c2VjcmV0' } },
    ])
    expect(await say(room, seats, host, { type: 'relay', to: 'g2', data: 'c2VjcmV0' })).toEqual<Effect[]>([
      { do: 'send', to: 'g2', message: { type: 'relay', data: 'c2VjcmV0' } },
    ])
    // Only text: what is passed on is encrypted, and so a string.
    expect(await say(room, seats, seats[1]!, { type: 'relay', data: { plain: 'text' } })).toEqual<Effect[]>([{ do: 'close', id: 'g1' }])
  })

  it('shows the door to who says what it does not understand, or too much', async () => {
    const { room, seats } = await hosted('g')
    const guest = seats[1]!
    const out: Effect[] = [{ do: 'close', id: 'g' }]
    expect(await onMessage(room, seats, guest, 'not json', ice)).toEqual(out)
    expect(await say(room, seats, guest, { type: 'delete everything' })).toEqual(out)
    expect(await say(room, seats, guest, { type: 'signal', data: 'x'.repeat(MAX_MESSAGE) })).toEqual(out)
    // Seated already: no second seat.
    expect(await say(room, seats, guest, { type: 'join' })).toEqual(out)
    // No seat: nothing to pass on.
    const stranger: Seat = { id: 's' }
    expect(await say(room, [...seats, stranger], stranger, { type: 'signal', data: 1 })).toEqual<Effect[]>([{ do: 'close', id: 's' }])
  })

  it('tells the host when a guest goes, and ends the session for everybody when the host goes', async () => {
    const { seats, host } = await hosted('g1', 'g2')
    expect(onClose([host, seats[2]!], seats[1]!)).toEqual<Effect[]>([{ do: 'send', to: 'h', message: { type: 'left', peer: 'g1' } }])
    expect(onClose(seats.slice(1), host)).toEqual<Effect[]>([
      { do: 'send', to: 'g1', message: { type: 'ended' } },
      { do: 'close', id: 'g1' },
      { do: 'send', to: 'g2', message: { type: 'ended' } },
      { do: 'close', id: 'g2' },
    ])
    // Somebody who never took a seat: nobody needs to know.
    expect(onClose(seats, { id: 'x' })).toEqual([])
  })
})
