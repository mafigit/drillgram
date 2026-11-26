import { beforeEach, describe, expect, it } from 'vitest'
import { keepName, keptName } from '../name'

describe('the name somebody goes by', () => {
  beforeEach(() => window.localStorage.clear())

  it('is none before the first session', () => {
    expect(keptName()).toBe('')
  })

  it('is kept as it is shown, for the next session, under the app\'s own name in the storage', () => {
    expect(keepName('  Ada   Lovelace ')).toBe('Ada Lovelace')
    expect(keptName()).toBe('Ada Lovelace')
    expect(window.localStorage.getItem('drillgram.name')).toBe('Ada Lovelace')
  })
})
