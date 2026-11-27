import type { Component } from 'vue'
import { AppWindowIcon, BoxIcon, BracesIcon, ComponentIcon, SquareIcon, UserIcon } from '@lucide/vue'
import { CODE_LANGUAGES, OTHER_LANGUAGE, codeTechnology } from './codeLanguages'
import { BOX_SHAPES } from '@drillgram/model'
import type { BoxShape, ElementKind } from '@drillgram/model'
import { BASIC_SHAPES, SHAPE_ABOUT } from './shapes'

export const KIND_LABEL: Record<ElementKind, string> = {
  box: 'Box',
  person: 'Person',
  softwareSystem: 'Software System',
  container: 'Container',
  component: 'Component',
  code: 'Code',
}

export const KIND_ICON: Record<ElementKind, Component> = {
  box: SquareIcon,
  person: UserIcon,
  softwareSystem: BoxIcon,
  container: AppWindowIcon,
  component: ComponentIcon,
  code: BracesIcon,
}

/**
 * The last line of a card: the kind, "external" for what is not ours, and the technology where
 * there is one ("Container: Vue").
 */
export function cardType(card: { kind: ElementKind; external: boolean; technology?: string }): string {
  // A plain box says nothing of its kind: it has none.
  if (card.kind === 'box') return ''
  // Code says what it is in the words of its language: "Go struct".
  if (card.kind === 'code') return card.technology ?? 'Code'
  const TYPE: Record<Exclude<ElementKind, 'box' | 'code'>, string> = {
    person: 'person',
    softwareSystem: 'system',
    container: 'container',
    component: 'component',
  }
  const kind = card.external ? `external ${TYPE[card.kind]}` : card.kind === 'softwareSystem' ? 'software system' : TYPE[card.kind]
  const said = kind.charAt(0).toUpperCase() + kind.slice(1)
  return card.technology ? `${said}: ${card.technology}` : said
}

/** One shape of a library: a kind, or a kind with something said about it already (a language). */
export interface Shape {
  kind: ElementKind
  label: string
  /** What it is for, in one line. */
  about: string
  /** The technology the new object starts with: for code, its language and its most usual construct. */
  technology?: string
  /** The name of an icon of the icon library to show for it; the kind's own icon without. */
  icon?: string
  /** The outline the new box starts with: a cylinder, a diamond. A plain rectangle without. */
  shape?: BoxShape
  /** More it can be found by in the search, each a technology of its own: a language's "trait", "struct". */
  variants?: { word: string; technology: string }[]
}

/** A library of shapes: what "Add shape" offers, on tabs. */
export interface ShapeLibrary {
  name: string
  /** What the library is, in a few words. */
  about: string
  shapes: Shape[]
}

/** What each shape is for, in one line, for the shape picker. */
export const KIND_ABOUT: Record<ElementKind, string> = {
  box: 'Anything, with a name and a description',
  person: 'A user, actor or role',
  softwareSystem: 'Something one team builds and owns; opens into its containers',
  container: 'An application or data store of a system; opens into its components',
  component: 'A part of a container behind an interface',
  code: 'A piece of code: a class, an interface, a function, a table',
}

const shapeOf = (kind: ElementKind): Shape => ({ kind, label: KIND_LABEL[kind], about: KIND_ABOUT[kind] })
const shaped = (shape: BoxShape): Shape => ({ kind: 'box', label: SHAPE_ABOUT[shape].label, about: SHAPE_ABOUT[shape].about, shape })

/**
 * The shape libraries. Basic has the plain box and the shapes most drawings use; Flowchart the
 * rest of a flowchart's; C4 has C4's elements (c4model.com); Code has a
 * shape per language, for C4's code level. They are all boxes: any of them stands anywhere, holds
 * any other and can be opened.
 */
export const SHAPE_LIBRARIES: ShapeLibrary[] = [
  {
    name: 'Basic',
    about: 'A box, plain or with a shape that says what it is',
    shapes: [
      shapeOf('box'),
      ...BASIC_SHAPES.map(shaped),
    ],
  },
  {
    name: 'Flowchart',
    about: 'The shapes of a flowchart: steps, stores, documents, comments',
    // A sticky note has a button of its own in the toolbar (J69).
    shapes: BOX_SHAPES.filter((shape) => !BASIC_SHAPES.includes(shape) && shape !== 'stickyNote').map(shaped),
  },
  {
    name: 'C4',
    about: 'Software architecture, as c4model.com draws it',
    shapes: (['person', 'softwareSystem', 'container', 'component'] as const).map(shapeOf),
  },
  {
    name: 'Code',
    about: 'Classes, interfaces, functions, tables: in the words of their language',
    shapes: [
      ...CODE_LANGUAGES.map((language) => ({
        kind: 'code' as const,
        label: language.name,
        about: language.constructs.slice(0, 4).join(', '),
        technology: codeTechnology(language.name, language.constructs[0]!),
        icon: language.icon,
        variants: language.constructs.map((construct) => ({ word: construct, technology: codeTechnology(language.name, construct) })),
      })),
      { kind: 'code', label: OTHER_LANGUAGE, about: 'Any other language: say what it is in your own words' },
    ],
  },
]

/** A shape the search found, with the library it is from. */
export interface FoundShape extends Shape {
  library: string
}

/**
 * The shapes of the libraries that a search finds: by a part of their name, of what they are
 * for, or of their library's name; every word of the search has to be found. Those found by
 * their name come first, then the others, each in the libraries' order. A shape found by one of its variants only ("trait") comes as that variant: "Rust trait",
 * which is then what the new object starts as.
 */
export function searchShapes(libraries: readonly ShapeLibrary[], query: string): FoundShape[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const has = (text: string) => words.every((word) => text.toLowerCase().includes(word))
  const all = libraries.flatMap((library) =>
    library.shapes.flatMap((shape): FoundShape[] => {
      const { variants, ...plain } = shape
      if (has(`${shape.label} ${library.name}`)) return [{ ...plain, library: library.name }]
      // What it has, before what is said about it: "trait" is a Rust trait, not Rust as it starts.
      const as = (variants ?? [])
        .filter((variant) => has(`${shape.label} ${variant.word} ${library.name}`))
        .map((variant) => ({ ...plain, label: variant.technology, technology: variant.technology, library: library.name }))
      if (as.length > 0) return as
      return has(`${shape.label} ${shape.about} ${library.name}`) ? [{ ...plain, library: library.name }] : []
    }),
  )
  return [...all.filter((shape) => has(shape.label)), ...all.filter((shape) => !has(shape.label))]
}
