import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ERROR_STAYS, clearErrors, dismissError, showError, useErrors } from '../useErrors'

describe('error cards', () => {
  const { errors } = useErrors()
  const texts = () => errors.value.map((card) => card.text)

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    clearErrors()
    vi.useRealTimers()
  })

  it('show what went wrong, the newest last, each until it is closed', () => {
    showError('No free place.')
    showError('The file could not be made.')
    expect(texts()).toEqual(['No free place.', 'The file could not be made.'])
    dismissError(errors.value[0]!.id)
    expect(texts()).toEqual(['The file could not be made.'])
  })

  it('go away by themselves after a while', () => {
    showError('No free place.')
    vi.advanceTimersByTime(ERROR_STAYS - 1)
    expect(texts()).toEqual(['No free place.'])
    vi.advanceTimersByTime(1)
    expect(texts()).toEqual([])
  })

  it('say the same thing once: said again, the card stays that much longer', () => {
    showError('No free place.')
    vi.advanceTimersByTime(ERROR_STAYS - 1000)
    showError('No free place.')
    expect(texts()).toEqual(['No free place.'])
    vi.advanceTimersByTime(ERROR_STAYS - 1)
    expect(texts()).toEqual(['No free place.'])
    vi.advanceTimersByTime(1)
    expect(texts()).toEqual([])
  })

  it('all go when what they were about has changed', () => {
    showError('No free place.')
    showError('The file could not be made.')
    clearErrors()
    expect(texts()).toEqual([])
    // No timer of a card that is gone takes a later one with it.
    showError('Again.')
    vi.advanceTimersByTime(ERROR_STAYS - 1)
    expect(texts()).toEqual(['Again.'])
  })

  it('show at most a few at a time: the oldest makes room', () => {
    for (let i = 1; i <= 6; i++) showError(`Problem ${i}`)
    expect(texts()).toEqual(['Problem 3', 'Problem 4', 'Problem 5', 'Problem 6'])
  })
})
