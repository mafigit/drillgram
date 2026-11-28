import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { PEOPLE_COLOURS } from '../../../collab/session'
import { commentAuthor, initialOf, pinColour } from '../author'

describe('commentAuthor (J17)', () => {
  it('is the name somebody shares or joined with, in a shared session', () => {
    expect(commentAuthor({ session: 'Ben', user: 'Test User', kept: 'Ada' })).toBe('Ben')
  })

  it('is the user who is signed in, with a server', () => {
    expect(commentAuthor({ user: 'Test User', kept: 'Ada' })).toBe('Test User')
  })

  it('is the name this browser keeps, alone; none to be asked for before the first comment', () => {
    expect(commentAuthor({ kept: 'Ada' })).toBe('Ada')
    expect(commentAuthor({ kept: '' })).toBeUndefined()
    expect(commentAuthor({ kept: '   ' })).toBeUndefined()
  })
})

describe('a pin', () => {
  it('shows the first letter of the name, as a capital', () => {
    expect(initialOf('ada')).toBe('A')
    expect(initialOf('  Ben ')).toBe('B')
    expect(initialOf('Émile')).toBe('É')
    expect(initialOf('👩‍💻 Ada')).toBe('👩‍💻')
  })

  it('has a colour of the people, the same one for a name wherever it is shown (property)', () => {
    fc.assert(
      fc.property(fc.string(), (name) => {
        expect(PEOPLE_COLOURS).toContain(pinColour(name))
        expect(pinColour(name)).toBe(pinColour(name))
      }),
    )
    expect(new Set(['Ada', 'Ben', 'Cleo', 'Dan', 'Eve'].map(pinColour)).size).toBeGreaterThan(1)
  })
})
