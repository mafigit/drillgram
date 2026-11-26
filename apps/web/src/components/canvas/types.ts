import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { Edge, Node } from '@xyflow/vue'
import type { BoxShape, ElementKind, LineColour, TableColumn } from '@drillgram/model'

/** A model object as Vue Flow draws it. */
export type ObjectNode = Node<
  {
    name: string
    kind: ElementKind
    description?: string
    technology?: string
    external: boolean
    /** Its outline, when it is not a plain rectangle. */
    shape?: BoxShape
    /** The columns of a table, in their order. */
    columns?: TableColumn[]
    /** Whether it has a next level to drill down into. */
    opens: boolean
    /** Names of the icons on the card's corner, in their order. */
    icons: string[]
  },
  'object'
>

/** A connection as Vue Flow draws it. */
export type ConnectionEdge = Edge<
  {
    labelling: boolean
    /** The colour of the line; the usual grey without. */
    colour?: LineColour
    /** The points the connector runs through, from the layout engine. */
    route?: readonly { x: number; y: number }[]
    /** The top-left corner of the label's box on that route, from the layout engine. */
    labelAt?: { x: number; y: number }
  },
  'connection'
>

/** What the canvas parts need from the editor around them. */
export interface CanvasActions {
  /** The workspace is looked at, not changed (J66): a card offers nothing that changes it. */
  locked: Readonly<Ref<boolean>>
  /** Drill down into an object. */
  open: (objectId: string) => void
  /** Give an object another name. */
  rename: (objectId: string, name: string) => void
  /** Give an object another text (its description, Markdown). */
  describe: (objectId: string, text: string) => void
  /** Open the form of an object, to change its name and details, at a point of the screen. */
  edit: (objectId: string, at: { x: number; y: number }) => void
  /** Make a copy of an object, beside it. */
  copy: (objectId: string) => void
  /** Delete the connection whose label is being typed. */
  removeLabelled: () => void
  /** Open the icons of an object, at a point of the screen. */
  pickIcons: (objectId: string, at: { x: number; y: number }) => void
  /** The label and technology being typed for the connection that was just drawn. */
  newLabel: Ref<string>
  newTechnology: Ref<string>
  commitLabel: () => void
  cancelLabel: () => void
  /** The colour of the connection whose label is being typed, and a way to give it another (none: the usual line). */
  labelColour: ComputedRef<LineColour | undefined>
  setColour: (colour: LineColour | undefined) => void
}

export const CANVAS_ACTIONS: InjectionKey<CanvasActions> = Symbol('canvas actions')

/** The card being dragged and the place it would land on now, while one card is dragged. */
export const CANVAS_DRAG: InjectionKey<Ref<{ id: string; place: { x: number; y: number } } | undefined>> =
  Symbol('canvas drag')

/** Ids of the cards that are faded because another card has the focus. */
export const CANVAS_FADED: InjectionKey<ComputedRef<ReadonlySet<string>>> = Symbol('canvas faded')
