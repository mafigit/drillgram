import { describe, it, expect, expectTypeOf } from 'vitest'
import type { C4Level } from '../index'

describe('C4Level', () => {
  it('is the union of the four C4 levels', () => {
    expectTypeOf<C4Level>().toEqualTypeOf<'context' | 'container' | 'component' | 'code'>()
  })

  it('accepts a C4 level', () => {
    const level: C4Level = 'container'
    expect(level).toBe('container')
  })
})
