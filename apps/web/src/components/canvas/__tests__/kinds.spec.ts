import { describe, expect, it } from 'vitest'
import { SHAPE_LIBRARIES, searchShapes } from '../kinds'

const found = (query: string) => searchShapes(SHAPE_LIBRARIES, query).map((shape) => `${shape.library}: ${shape.label}`)

describe('the search for shapes', () => {
  it('finds a shape by a part of its name, in any library, whatever the case', () => {
    // By its name first, then what says so of itself.
    expect(found('contain')).toEqual(['C4: Container', 'C4: Software System', 'C4: Component'])
    expect(found('PYTH')).toEqual(['Code: Python'])
    expect(found('box')[0]).toBe('Basic: Box')
    expect(found('database')).toEqual(['Basic: Database'])
    expect(found('queue')).toEqual(['Basic: Queue'])
  })

  it('finds a shape by what it is for, and every shape of a library by the library', () => {
    expect(found('role')).toEqual(['C4: Person'])
    expect(found('actor')).toEqual(['Code: Swift actor', 'C4: Person'])
    expect(found('c4')).toEqual(['C4: Person', 'C4: Software System', 'C4: Container', 'C4: Component'])
  })

  it('finds a language by what it has, as that: a trait is a Rust trait', () => {
    expect(found('trait')).toEqual(['Code: Rust trait'])
    const [shape] = searchShapes(SHAPE_LIBRARIES, 'trait')
    expect(shape).toMatchObject({ kind: 'code', technology: 'Rust trait' })
    expect(found('protocol')).toEqual(['Code: Python protocol', 'Code: Swift protocol'])
    // Every word has to be found.
    expect(found('go struct')).toEqual(['Code: Go struct'])
    expect(found('swift actor')).toEqual(['Code: Swift actor'])
  })

  it('finds nothing for nothing, and nothing for what no shape is', () => {
    expect(found('')).toEqual([])
    expect(found('   ')).toEqual([])
    expect(found('unicorn')).toEqual([])
  })
})
