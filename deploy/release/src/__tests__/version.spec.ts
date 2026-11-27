import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { nextVersion } from '../version.ts'

describe('nextVersion', () => {
  it('releases a fix as a patch and a feature as a minor version', () => {
    expect(nextVersion('0.1.0', ['fix: Keep the frame clear'])).toBe('0.1.1')
    expect(nextVersion('0.1.0', ['perf(web): Draw fewer lines'])).toBe('0.1.1')
    expect(nextVersion('0.1.3', ['feat(helm): Package the chart', 'fix: A typo'])).toBe('0.2.0')
    expect(nextVersion('1.4.2', ['feat: Export to PDF'])).toBe('1.5.0')
  })

  it('releases nothing for commits no user notices: tests, docs, CI, chores, refactoring', () => {
    expect(nextVersion('0.1.0', ['test: Say what a frame does', 'docs: Explain it', 'ci: Run it', 'chore(web): Tidy', 'refactor: Split', 'build: Bump'])).toBeUndefined()
    expect(nextVersion('0.1.0', [])).toBeUndefined()
    // A message without a type is no release either.
    expect(nextVersion('0.1.0', ['Merge branch main', 'fixed it'])).toBeUndefined()
  })

  it('releases a breaking change as a major version, before 1.0 as a minor one', () => {
    expect(nextVersion('1.4.2', ['feat!: Drop the old API'])).toBe('2.0.0')
    expect(nextVersion('1.4.2', ['fix(server)!: Sign in again'])).toBe('2.0.0')
    expect(nextVersion('1.4.2', ['fix: Sign in\n\nBREAKING CHANGE: tokens are new'])).toBe('2.0.0')
    expect(nextVersion('1.4.2', ['refactor: Rename\n\nBREAKING-CHANGE: the key moved'])).toBe('2.0.0')
    expect(nextVersion('0.3.1', ['feat!: Drop the old API'])).toBe('0.4.0')
  })

  it('reads the type of a commit in any case, and only from its first line', () => {
    expect(nextVersion('0.1.0', ['Fix: Keep the frame clear'])).toBe('0.1.1')
    expect(nextVersion('0.1.0', ['docs: Say how\n\nfeat: this is no subject'])).toBeUndefined()
  })

  it('refuses a version that is not major.minor.patch', () => {
    expect(() => nextVersion('v0.1', ['fix: x'])).toThrow('0.1')
  })

  it('always gives a newer version than the last one, or none (property)', () => {
    const version = fc.tuple(fc.nat(30), fc.nat(30), fc.nat(30)).map((parts) => parts.join('.'))
    const message = fc.tuple(fc.constantFrom('feat', 'fix', 'perf', 'docs', 'test', 'chore', 'nonsense'), fc.boolean(), fc.string()).map(
      ([type, breaking, text]) => `${type}${breaking ? '!' : ''}: ${text}`,
    )
    fc.assert(
      fc.property(version, fc.array(message), (last, messages) => {
        const next = nextVersion(last, messages)
        if (next === undefined) return
        const [a, b] = [last, next].map((v) => v.split('.').map(Number))
        const newer = a![0]! < b![0]! || (a![0] === b![0] && (a![1]! < b![1]! || (a![1] === b![1] && a![2]! < b![2]!)))
        expect(newer).toBe(true)
      }),
    )
  })
})
