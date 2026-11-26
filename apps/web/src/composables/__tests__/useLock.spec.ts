import { beforeEach, describe, expect, it } from 'vitest'
import { useLock } from '../useLock'

describe('useLock', () => {
  beforeEach(() => window.localStorage.clear())

  it('is off for a workspace never locked', () => {
    expect(useLock('one').value).toBe(false)
  })

  it('is kept in the browser for that workspace alone', () => {
    useLock('one').value = true
    expect(useLock('one').value).toBe(true)
    expect(useLock('two').value).toBe(false)
    useLock('one').value = false
    expect(useLock('one').value).toBe(false)
  })
})
