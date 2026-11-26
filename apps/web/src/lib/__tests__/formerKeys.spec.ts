import { beforeEach, describe, expect, it } from 'vitest'
import { adoptFormerKeys } from '../formerKeys'

describe('adoptFormerKeys', () => {
  beforeEach(() => window.localStorage.clear())
  const all = () => Object.fromEntries(Object.keys(window.localStorage).sort().map((key) => [key, window.localStorage.getItem(key)]))

  it('takes what the app saved under its first name over to its name of today', () => {
    window.localStorage.setItem('ped.workspace.v1', '{"model":1}')
    window.localStorage.setItem('ped.history.v1', '{"events":[]}')
    window.localStorage.setItem('ped.theme', 'solarized-dark')
    window.localStorage.setItem('ped.shapeLibrary', 'C4')
    adoptFormerKeys()
    expect(all()).toEqual({
      'drillgram.history.v1': '{"events":[]}',
      'drillgram.shapeLibrary': 'C4',
      'drillgram.theme': 'solarized-dark',
      'drillgram.workspace.v1': '{"model":1}',
    })
  })

  it('takes over what was saved under the name in between, too', () => {
    window.localStorage.setItem('drillplan.workspace.v1', '{"model":2}')
    window.localStorage.setItem('drillplan.theme', 'dark')
    adoptFormerKeys()
    expect(all()).toEqual({ 'drillgram.theme': 'dark', 'drillgram.workspace.v1': '{"model":2}' })
  })

  it('prefers the later of two earlier names where both saved something', () => {
    window.localStorage.setItem('ped.theme', 'light')
    window.localStorage.setItem('drillplan.theme', 'solarized-dark')
    adoptFormerKeys()
    expect(all()).toEqual({ 'drillgram.theme': 'solarized-dark' })
  })

  it('keeps what is saved under the new name, and takes the old away all the same', () => {
    window.localStorage.setItem('ped.theme', 'dark')
    window.localStorage.setItem('drillgram.theme', 'light')
    adoptFormerKeys()
    expect(all()).toEqual({ 'drillgram.theme': 'light' })
  })

  it('leaves everything else in the storage alone, and does nothing twice', () => {
    window.localStorage.setItem('other.thing', '1')
    window.localStorage.setItem('pedestal', '2')
    window.localStorage.setItem('ped.theme', 'dark')
    adoptFormerKeys()
    adoptFormerKeys()
    expect(all()).toEqual({ 'drillgram.theme': 'dark', 'other.thing': '1', pedestal: '2' })
  })

  it('does not stop the app where the storage cannot be read', () => {
    const broken = { get length(): number { throw new Error('denied') } } as unknown as Storage
    expect(() => adoptFormerKeys(broken)).not.toThrow()
  })
})
