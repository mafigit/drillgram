import { PEOPLE_COLOURS } from '../../collab/session'
import type { LineColour } from '@drillgram/model'

// Who a comment is from (J17), and how a pin shows it.

/**
 * The name a comment goes out under: in a shared session the name somebody shares or joined
 * with, with a server the user who is signed in, else the name this browser keeps. None: the
 * app asks for one with the first comment, and keeps it (collab/name.ts, which "Share" starts
 * with too).
 */
export function commentAuthor(known: { session?: string; user?: string; kept: string }): string | undefined {
  const name = [known.session, known.user, known.kept].map((said) => said?.trim()).find((said) => said)
  return name || undefined
}

const letters = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** The first letter of a name, as a capital: what a pin shows. */
export function initialOf(name: string): string {
  const first = letters.segment(name.trim())[Symbol.iterator]().next()
  return first.done ? '?' : first.value.segment.toLocaleUpperCase()
}

/** The colour of a name's pins: one of the people's colours, the same for a name everywhere. */
export function pinColour(name: string): LineColour {
  let hash = 0
  for (const unit of name) hash = (hash * 31 + unit.codePointAt(0)!) >>> 0
  return PEOPLE_COLOURS[hash % PEOPLE_COLOURS.length]!
}
