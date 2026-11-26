import { beforeEach, describe, expect, it } from 'vitest'
import { markTourSeen, tourSeen } from '../seen'

describe('tourSeen', () => {
  beforeEach(() => window.localStorage.clear())

  it('is not seen in a browser that never ran the app', () => {
    expect(tourSeen()).toBe(false)
  })

  it('is seen from then on, under the app\'s own name in the storage', () => {
    markTourSeen()
    expect(tourSeen()).toBe(true)
    expect(window.localStorage.getItem('drillgram.tour')).toBe('seen')
  })
})
