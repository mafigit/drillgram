import { describe, expect, it } from 'vitest'
import { allows, goModules, judge } from '../licences.ts'
import type { Allowed } from '../licences.ts'

const ALLOWED = ['MIT', 'Apache-2.0', 'ISC', 'BSD-3-Clause', 'Unicode-3.0', 'Unlicense']

describe('allows', () => {
  it('takes a licence of the list and no other', () => {
    expect(allows('MIT', ALLOWED)).toBe(true)
    expect(allows('GPL-3.0-only', ALLOWED)).toBe(false)
    expect(allows('', ALLOWED)).toBe(false)
  })

  it('takes a choice when one of its licences is on the list, and a sum when all are', () => {
    expect(allows('MIT OR GPL-3.0-only', ALLOWED)).toBe(true)
    expect(allows('GPL-2.0-only OR GPL-3.0-only', ALLOWED)).toBe(false)
    expect(allows('MIT AND ISC', ALLOWED)).toBe(true)
    expect(allows('MIT AND GPL-3.0-only', ALLOWED)).toBe(false)
  })

  it('reads brackets, and AND before OR', () => {
    expect(allows('(MIT OR Apache-2.0) AND Unicode-3.0', ALLOWED)).toBe(true)
    expect(allows('(MIT OR Apache-2.0) AND GPL-3.0-only', ALLOWED)).toBe(false)
    expect(allows('GPL-3.0-only AND MIT OR ISC', ALLOWED)).toBe(true)
    expect(allows('GPL-3.0-only AND (MIT OR ISC)', ALLOWED)).toBe(false)
    expect(allows('(MIT)', ALLOWED)).toBe(true)
  })

  it('takes a licence with an exception as the licence: an exception only allows more', () => {
    expect(allows('Apache-2.0 WITH LLVM-exception', ALLOWED)).toBe(true)
    expect(allows('GPL-2.0-only WITH Classpath-exception-2.0', ALLOWED)).toBe(false)
  })

  it('takes the old way of writing a choice, and refuses what is no expression', () => {
    expect(allows('MIT/Apache-2.0', ALLOWED)).toBe(true)
    expect(allows('MIT OR', ALLOWED)).toBe(false)
    expect(allows('(MIT', ALLOWED)).toBe(false)
    expect(allows('SEE LICENSE IN readme', ALLOWED)).toBe(false)
    expect(allows('Unknown', ALLOWED)).toBe(false)
  })
})

describe('judge', () => {
  const allowed: Allowed = {
    licences: ALLOWED,
    exceptions: [
      { package: '@img/sharp-libvips-*', licence: 'LGPL-3.0-or-later', why: 'Only while building' },
      { package: 'tidy-layout', licence: 'MPL-2.0', why: 'The layout engine, its own repository' },
      { package: 'gone-by-now', licence: 'MPL-2.0', why: 'No longer used' },
    ],
  }

  it('finds nothing wrong with packages under allowed licences', () => {
    const found = judge([{ name: 'vue', version: '3.5.0', licence: 'MIT', from: 'npm' }], { ...allowed, exceptions: [] })
    expect(found).toEqual({ problems: [], unused: [] })
  })

  it('names every package under another licence, with where it is from', () => {
    const found = judge(
      [
        { name: 'vue', version: '3.5.0', licence: 'MIT', from: 'npm' },
        { name: 'left', version: '1.0.0', licence: 'GPL-3.0-only', from: 'npm' },
        { name: 'nameless', version: '0.1.0', licence: undefined, from: 'crates' },
      ],
      { ...allowed, exceptions: [] },
    )
    expect(found.problems).toEqual(['left 1.0.0 (npm): GPL-3.0-only is not an allowed licence', 'nameless 0.1.0 (crates): no licence is stated'])
  })

  it('lets a package through that is excepted by name, for the licence the exception names only', () => {
    const packages = [
      { name: '@img/sharp-libvips-linux-x64', version: '1.2.0', licence: 'LGPL-3.0-or-later', from: 'npm' as const },
      { name: 'tidy-layout', version: '0.1.0', licence: 'MPL-2.0', from: 'crates' as const },
    ]
    expect(judge(packages, allowed).problems).toEqual([])
    // Its licence changed: the exception was for the old one.
    const changed = [{ ...packages[0]!, licence: 'GPL-3.0-only' }]
    expect(judge(changed, allowed).problems).toEqual(['@img/sharp-libvips-linux-x64 1.2.0 (npm): GPL-3.0-only is not an allowed licence'])
    // Another package under that licence is not excepted.
    expect(judge([{ name: 'other', version: '1.0.0', licence: 'MPL-2.0', from: 'npm' }], allowed).problems).toHaveLength(1)
  })

  it('says which exceptions no package needs any more', () => {
    const found = judge([{ name: 'tidy-layout', version: '0.1.0', licence: 'MPL-2.0', from: 'crates' }], allowed)
    expect(found.unused).toEqual(['@img/sharp-libvips-*', 'gone-by-now'])
  })
})

describe('goModules', () => {
  it('reads the list of the server\'s modules: a line each, name, version and licence between tabs', () => {
    const listed = 'github.com/gofiber/fiber/v3\tv3.7.0\tMIT\ngolang.org/x/crypto\tv0.59.0\tBSD-3-Clause\n\n'
    expect(goModules(listed)).toEqual([
      { name: 'github.com/gofiber/fiber/v3', version: 'v3.7.0', licence: 'MIT', from: 'go' },
      { name: 'golang.org/x/crypto', version: 'v0.59.0', licence: 'BSD-3-Clause', from: 'go' },
    ])
  })

  it('takes a module whose licence was not found as one that states none', () => {
    expect(goModules('example.org/odd\tv1.0.0\tUnknown\nexample.org/bare\tv1.0.0\t\n')).toEqual([
      { name: 'example.org/odd', version: 'v1.0.0', licence: undefined, from: 'go' },
      { name: 'example.org/bare', version: 'v1.0.0', licence: undefined, from: 'go' },
    ])
    expect(judge(goModules('example.org/odd\tv1.0.0\tUnknown\n'), { licences: ALLOWED, exceptions: [] }).problems).toEqual(['example.org/odd v1.0.0 (go): no licence is stated'])
  })

  it('refuses a list that is no such list', () => {
    expect(() => goModules('go: downloading example.org/odd v1.0.0\n')).toThrow(/line 1/)
  })
})
