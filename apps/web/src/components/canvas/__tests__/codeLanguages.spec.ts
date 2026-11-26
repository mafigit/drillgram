import { describe, expect, it } from 'vitest'
import { CODE_LANGUAGES, codeBadge, codeOf, codeTechnology, isAbstractCode, languageIcon } from '../codeLanguages'

describe('code languages', () => {
  it('say a piece of code in the words of its language', () => {
    expect(codeTechnology('Go', 'struct')).toBe('Go struct')
    expect(codeTechnology('Other', ' Zig comptime fn ')).toBe('Zig comptime fn')
  })

  it('take a technology apart again, the longest language name first', () => {
    expect(codeOf('Go struct')).toEqual({ language: 'Go', construct: 'struct' })
    expect(codeOf('C++ template')).toEqual({ language: 'C++', construct: 'template' })
    expect(codeOf('C# record')).toEqual({ language: 'C#', construct: 'record' })
    expect(codeOf('C struct')).toEqual({ language: 'C', construct: 'struct' })
    expect(codeOf('Kotlin data class')).toEqual({ language: 'Kotlin', construct: 'data class' })
    expect(codeOf('Rust')).toEqual({ language: 'Rust', construct: '' })
  })

  it('call everything else "Other", with the whole text', () => {
    expect(codeOf('Zig comptime fn')).toEqual({ language: 'Other', construct: 'Zig comptime fn' })
    expect(codeOf('Go class')).toEqual({ language: 'Other', construct: 'Go class' })
    expect(codeOf('Gopher')).toEqual({ language: 'Other', construct: 'Gopher' })
    expect(codeOf(undefined)).toEqual({ language: 'Other', construct: '' })
  })

  it('round-trip every construct of every language', () => {
    for (const language of CODE_LANGUAGES) {
      for (const construct of language.constructs) {
        expect(codeOf(codeTechnology(language.name, construct))).toEqual({ language: language.name, construct })
      }
    }
  })

  it('know the icon of a language that has one', () => {
    expect(languageIcon('Go struct')).toBe('go')
    expect(languageIcon('C++ class')).toBe('cplusplus')
    expect(languageIcon('Rust trait')).toBeUndefined()
    expect(languageIcon('Zig fn')).toBeUndefined()
  })

  it('give the letter for the badge of a class box: what the code is, in one letter', () => {
    expect(codeBadge('Go struct')).toBe('S')
    expect(codeBadge('Java interface')).toBe('I')
    expect(codeBadge('Kotlin enum class')).toBe('E')
    expect(codeBadge('Kotlin data class')).toBe('D')
    expect(codeBadge('SQL table')).toBe('T')
    // In other words: the last word says what it is.
    expect(codeBadge('Zig comptime fn')).toBe('F')
    // Nothing said: a class, as UML has it.
    expect(codeBadge('Rust')).toBe('C')
    expect(codeBadge(undefined)).toBe('C')
  })

  it('know what only says what others have to do: its name is slanted, as UML writes it', () => {
    for (const technology of ['Go interface', 'Rust trait', 'Swift protocol', 'Python protocol', 'C++ concept', 'TypeScript interface']) {
      expect(isAbstractCode(technology), technology).toBe(true)
    }
    for (const technology of ['Go struct', 'Java class', 'SQL table', 'Zig comptime fn', undefined]) {
      expect(isAbstractCode(technology), String(technology)).toBe(false)
    }
  })
})
