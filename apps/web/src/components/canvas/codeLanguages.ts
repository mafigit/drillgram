// Code elements (C4's level 4, c4model.com/diagrams/code): a card for a piece of code says the
// language it is written in and what it is there, in the language's own words: Go has structs
// and interfaces and no classes, Rust has traits, C++ has templates. Both together are the
// card's technology ("Go struct"); nothing else is stored.

export interface CodeLanguage {
  name: string
  /** The language's icon in the icon library, where one may be passed on (docs/icon-licences.md). */
  icon?: string
  /** What a piece of code can be in this language, the most usual first. */
  constructs: string[]
}

export const CODE_LANGUAGES: CodeLanguage[] = [
  { name: 'Go', icon: 'go', constructs: ['struct', 'interface', 'func', 'method', 'type', 'package', 'const'] },
  { name: 'Python', icon: 'python', constructs: ['class', 'function', 'module', 'dataclass', 'protocol', 'enum', 'package'] },
  { name: 'Rust', constructs: ['struct', 'enum', 'trait', 'impl', 'fn', 'module', 'macro', 'crate'] },
  { name: 'C++', icon: 'cplusplus', constructs: ['class', 'struct', 'template', 'function', 'enum', 'concept', 'namespace', 'header'] },
  { name: 'C', icon: 'c', constructs: ['struct', 'function', 'enum', 'union', 'typedef', 'macro', 'header'] },
  { name: 'Java', icon: 'java', constructs: ['class', 'interface', 'record', 'enum', 'method', 'annotation', 'package'] },
  { name: 'Kotlin', icon: 'kotlin', constructs: ['class', 'data class', 'interface', 'object', 'function', 'enum class', 'package'] },
  { name: 'TypeScript', icon: 'typescript', constructs: ['class', 'interface', 'type', 'function', 'enum', 'module', 'namespace'] },
  { name: 'JavaScript', icon: 'javascript', constructs: ['class', 'function', 'module', 'object'] },
  { name: 'C#', icon: 'csharp', constructs: ['class', 'interface', 'record', 'struct', 'enum', 'method', 'namespace'] },
  { name: 'Swift', icon: 'swift', constructs: ['struct', 'class', 'protocol', 'enum', 'actor', 'func', 'extension'] },
  { name: 'SQL', icon: 'postgresql', constructs: ['table', 'view', 'index', 'procedure', 'function', 'trigger', 'schema'] },
]

/** A language that is not in the list: what the code is, is then written out in full. */
export const OTHER_LANGUAGE = 'Other'

/** The technology of a code element: its language and what it is, "Go struct". */
export function codeTechnology(language: string, construct: string): string {
  return language === OTHER_LANGUAGE ? construct.trim() : `${language} ${construct}`.trim()
}

/**
 * A code element's technology taken apart again: the language it names and the rest. Text that
 * starts with no known language, or names something the language has not, is "Other" with the
 * whole text. (The longest name first: "C++" and "C#" before "C".)
 */
export function codeOf(technology: string | undefined): { language: string; construct: string } {
  const text = (technology ?? '').trim()
  const byLength = [...CODE_LANGUAGES].sort((a, b) => b.name.length - a.name.length)
  const language = byLength.find((candidate) => text === candidate.name || text.startsWith(`${candidate.name} `))
  const construct = language ? text.slice(language.name.length).trim() : text
  if (language && (construct === '' || language.constructs.includes(construct))) return { language: language.name, construct }
  return { language: OTHER_LANGUAGE, construct: text }
}

/** The icon of the language a code element is written in, if there is one. */
export function languageIcon(technology: string | undefined): string | undefined {
  const { language } = codeOf(technology)
  return CODE_LANGUAGES.find((candidate) => candidate.name === language)?.icon
}

/**
 * The letter in the badge of a code element's card, as a class box has it: what the code is, in
 * one letter ("S" for a struct, "I" for an interface). In a known language that is the first
 * word of it ("enum class": "E"); in other words the last one says it ("Zig comptime fn": "F").
 * With nothing said it is a class.
 */
export function codeBadge(technology: string | undefined): string {
  const { language, construct } = codeOf(technology)
  const words = construct.split(/\s+/).filter(Boolean)
  const word = language === OTHER_LANGUAGE ? words.at(-1) : words[0]
  return /^[a-z]/i.test(word ?? '') ? word![0]!.toUpperCase() : 'C'
}

/** What only says what others have to do, and does nothing itself. */
const ABSTRACT = ['interface', 'trait', 'protocol', 'concept']

/** Whether a code element is such a thing: UML writes its name slanted. */
export function isAbstractCode(technology: string | undefined): boolean {
  return ABSTRACT.includes(codeOf(technology).construct)
}
