import { bookshopExample } from './examples'
import type { Diagram, ElementKind, LineColour } from './model'
import {
  addObject,
  addView,
  copyObject,
  editGroup,
  groupCards,
  arrangeView,
  connect,
  moveObject,
  openView,
  parseWorkspace,
  placeObject,
  removeObjects,
  editObject,
  importDiagram,
  removeConnections,
  removeGroup,
  removeView,
  renameObject,
  renameView,
  resizeCard,
  setObjectIcons,
  setConnectionColour,
  setConnectionLabel,
  ungroupCards,
} from './workspace'
import type { ArrangedCard, ObjectDetails, Point, Size, Workspace } from './workspace'

/**
 * A change to a workspace, as the change log keeps it. Every change the editor makes is one of
 * these, applied by `applyEvent`: a workspace is its start plus its events, in order.
 * `view` is the diagram the change was made on.
 */
export type WorkspaceEvent =
  /** `at`: where the card is wanted; it goes to the usual free place when that is taken. */
  | {
      type: 'objectAdded'
      view: string
      kind: ElementKind
      name: string
      details?: ObjectDetails
      at?: Point
      /** The size of the new card, when its text needs more room than a card has. */
      size?: Size
    }
  /** Cards of a diagram were copied, all in one go; `at` is where each copy is wanted. */
  | { type: 'objectsCopied'; view: string; copies: { object: string; at?: Point }[] }
  /** One more view of the box `view` is about, starting with that view's cards (`copy`) or empty. */
  | { type: 'viewAdded'; view: string; name: string; copy: boolean }
  | { type: 'viewRenamed'; view: string; name: string }
  | { type: 'viewRemoved'; view: string }
  /** Cards of a view were put in a frame; `name` of a frame that is there: they joined it. `what`: what the frame is. */
  | { type: 'cardsGrouped'; view: string; objects: string[]; name: string; what?: string }
  | { type: 'cardsUngrouped'; view: string; objects: string[] }
  | { type: 'groupEdited'; view: string; group: string; name: string; what: string }
  | { type: 'groupRemoved'; view: string; group: string }
  /** An object of the model was put on one more diagram. */
  | { type: 'objectPlaced'; view: string; object: string; at?: Point }
  /** One drag: every card that was dragged along. */
  | { type: 'objectsMoved'; view: string; moves: { object: string; to: Point }[] }
  /** A card was made larger or smaller at a corner or side; `to`: its new top-left corner. */
  | { type: 'cardResized'; view: string; object: string; size: Size; to?: Point }
  | { type: 'objectRenamed'; object: string; name: string }
  /** An object's name and details, changed together in its form. */
  | {
      type: 'objectEdited'
      object: string
      name: string
      details: ObjectDetails
      /** The room the card needs for its new text on the diagram it was edited on, and where it then stands. */
      card?: { view: string; size: Size; to?: Point }
    }
  /** The icons on the corner of an object's card, all of them, in their order. */
  | { type: 'objectIconsSet'; object: string; icons: string[] }
  | { type: 'objectsRemoved'; objects: string[] }
  | { type: 'connected'; view: string; from: string; to: string; label?: string; technology?: string }
  | { type: 'connectionLabelled'; connection: string; label: string; technology?: string }
  /** The colour of a connection's line; none takes it off. */
  | { type: 'connectionColoured'; connection: string; colour?: LineColour }
  | { type: 'connectionsRemoved'; connections: string[] }
  /** The made-up bookshop was loaded into an empty workspace. */
  | { type: 'exampleLoaded' }
  /**
   * A whole workspace was put into an empty one: what a browser had kept from before the app
   * had a server, as it stood when its own change log began.
   */
  | { type: 'workspaceBrought'; workspace: Workspace }
  /** The layout engine laid out a diagram: every card it placed, with its place and size. */
  | { type: 'viewArranged'; view: string; cards: ArrangedCard[] }
  /**
   * A diagram written as text (Mermaid, D2) was brought onto a diagram; `places` are where its
   * elements are wanted there, by their ids in the file.
   */
  | { type: 'diagramImported'; view: string; diagram: Diagram; places?: Record<string, Point> }

/**
 * The workspace after an event. Never mutates; an event that cannot apply or changes nothing
 * returns its input. Must stay deterministic: saved logs are replayed through it.
 */
export function applyEvent(ws: Workspace, event: WorkspaceEvent): Workspace {
  switch (event.type) {
    case 'objectAdded':
      return onView(ws, event.view, (w) => addObject(w, event.view, event.kind, event.name, event.details, event.at, event.size))
    case 'viewAdded':
      return onView(ws, event.view, (w) => addView(w, event.view, event.name, event.copy))
    case 'viewRenamed':
      return renameView(ws, event.view, event.name)
    case 'viewRemoved':
      return removeView(ws, event.view)
    case 'cardsGrouped':
      return onView(ws, event.view, (w) => groupCards(w, event.view, event.objects, event.name, event.what))
    case 'cardsUngrouped':
      return onView(ws, event.view, (w) => ungroupCards(w, event.view, event.objects))
    case 'groupEdited':
      return onView(ws, event.view, (w) => editGroup(w, event.view, event.group, event.name, event.what))
    case 'groupRemoved':
      return onView(ws, event.view, (w) => removeGroup(w, event.view, event.group))
    case 'objectsCopied':
      return onView(ws, event.view, (w) => event.copies.reduce((made, { object, at }) => copyObject(made, event.view, object, at), w))
    case 'objectPlaced':
      return onView(ws, event.view, (w) => placeObject(w, event.view, event.object, event.at))
    case 'objectsMoved':
      return onView(ws, event.view, (w) =>
        event.moves.reduce((moved, { object, to }) => moveObject(moved, event.view, object, to), w),
      )
    case 'cardResized':
      return onView(ws, event.view, (w) => resizeCard(w, event.view, event.object, event.size, event.to))
    case 'objectEdited': {
      const edited = editObject(ws, event.object, event.name, event.details)
      const card = event.card
      return card ? onView(edited, card.view, (w) => resizeCard(w, card.view, event.object, card.size, card.to)) : edited
    }
    case 'connectionsRemoved':
      return removeConnections(ws, event.connections)
    case 'objectIconsSet':
      return setObjectIcons(ws, event.object, event.icons)
    case 'objectRenamed':
      return renameObject(ws, event.object, event.name)
    case 'objectsRemoved':
      return removeObjects(ws, event.objects)
    case 'connected':
      return onView(ws, event.view, (w) => {
        const drawn = connect(w, event.view, event.from, event.to, event.label)
        const id = drawn.model.connections.at(-1)?.id
        if (drawn === w || id === undefined || event.technology === undefined) return drawn
        return setConnectionLabel(drawn, id, event.label ?? '', event.technology)
      })
    case 'connectionLabelled':
      return setConnectionLabel(ws, event.connection, event.label, event.technology)
    case 'connectionColoured':
      return setConnectionColour(ws, event.connection, event.colour)
    case 'exampleLoaded':
      return ws.model.objects.length === 0 ? bookshopExample() : ws
    case 'workspaceBrought':
      return ws.model.objects.length === 0 ? (brought(event.workspace) ?? ws) : ws
    case 'viewArranged':
      return onView(ws, event.view, (w) => arrangeView(w, event.view, event.cards))
    case 'diagramImported':
      return onView(ws, event.view, (w) => importDiagram(w, event.view, event.diagram, event.places))
    default:
      return ws
  }
}

/** A workspace that came in an event, checked as one that was saved is; none when it is no workspace. */
function brought(workspace: unknown): Workspace | undefined {
  try {
    return parseWorkspace(JSON.stringify(workspace))
  } catch {
    return undefined
  }
}

/**
 * An edit on a view as the editor shows it: opened first (see `openView`). Opening alone is no
 * change: when the edit does nothing, the workspace stays as it was.
 */
function onView(ws: Workspace, viewId: string, edit: (opened: Workspace) => Workspace): Workspace {
  const opened = openView(ws, viewId)
  const edited = edit(opened)
  return edited === opened ? ws : edited
}

/** The diagram a change was made on; `undefined` for a change to the model as a whole. */
export function eventView(event: WorkspaceEvent): string | undefined {
  return 'view' in event ? event.view : undefined
}

const KIND: Record<ElementKind, string> = {
  box: 'box',
  person: 'person',
  softwareSystem: 'software system',
  container: 'container',
  component: 'component',
  code: 'code element',
}

/** What an event changed, in words, for the change log. `before` is the workspace it applied to. */
export function describeEvent(before: Workspace, event: WorkspaceEvent): string {
  const name = (id: string) => `"${before.model.objects.find((o) => o.id === id)?.name ?? id}"`
  const groupName = (view: string, id: string) => `"${before.views.find((v) => v.id === view)?.groups?.find((g) => g.id === id)?.name ?? id}"`
  const viewName = (id: string) => `"${before.views.find((v) => v.id === id)?.name ?? id}"`
  const some = (ids: string[]) => (ids.length === 1 ? name(ids[0]!) : `${ids.length} objects`)
  const says = (label?: string, technology?: string) => {
    const text = [label?.trim(), technology?.trim() && `[${technology.trim()}]`].filter(Boolean).join(' ')
    return text && `: ${text}`
  }
  switch (event.type) {
    case 'objectAdded':
      return `Added ${KIND[event.kind]} "${event.name.trim()}"`
    case 'viewAdded':
      return `Added the view "${event.name.trim()}"`
    case 'viewRenamed':
      return `Renamed the view ${viewName(event.view)} to "${event.name.trim()}"`
    case 'viewRemoved':
      return `Deleted the view ${viewName(event.view)}`
    case 'cardsGrouped':
      return `Grouped ${some(event.objects)} as "${event.name.trim()}"`
    case 'cardsUngrouped':
      return `Took ${some(event.objects)} out of ${event.objects.length === 1 ? 'its group' : 'their groups'}`
    case 'groupEdited':
      return `Changed the group ${groupName(event.view, event.group)}`
    case 'groupRemoved':
      return `Deleted the group ${groupName(event.view, event.group)}`
    case 'objectsCopied':
      return `Copied ${some(event.copies.map((copy) => copy.object))}`
    case 'objectPlaced':
      return `Added existing object ${name(event.object)}`
    case 'objectsMoved':
      return `Moved ${some(event.moves.map((move) => move.object))}`
    case 'cardResized':
      return `Resized ${name(event.object)}`
    case 'objectEdited':
      return `Edited ${name(event.object)}`
    case 'connectionsRemoved': {
      const ends = (id: string) => {
        const connection = before.model.connections.find((c) => c.id === id)
        return connection ? `${name(connection.from)} to ${name(connection.to)}` : id
      }
      return event.connections.length === 1
        ? `Deleted the connection ${ends(event.connections[0]!)}`
        : `Deleted ${event.connections.length} connections`
    }
    case 'objectIconsSet':
      return `Changed the icons of ${name(event.object)}`
    case 'objectRenamed':
      return `Renamed ${name(event.object)} to "${event.name.trim()}"`
    case 'objectsRemoved':
      return `Deleted ${some(event.objects)}`
    case 'connected':
      return `Connected ${name(event.from)} to ${name(event.to)}${says(event.label, event.technology)}`
    case 'connectionLabelled': {
      const connection = before.model.connections.find((c) => c.id === event.connection)
      const ends = connection ? `${name(connection.from)} to ${name(connection.to)}` : event.connection
      return `Labelled ${ends}${says(event.label, event.technology)}`
    }
    case 'connectionColoured': {
      const connection = before.model.connections.find((c) => c.id === event.connection)
      const ends = connection ? `${name(connection.from)} to ${name(connection.to)}` : event.connection
      return event.colour === undefined ? `Took the colour off ${ends}` : `Coloured ${ends} ${event.colour}`
    }
    case 'exampleLoaded':
      return 'Loaded the example'
    case 'workspaceBrought':
      return 'Brought the diagrams of this browser'
    case 'viewArranged': {
      // All cards of the diagram, or only some of them (the selected ones).
      const onView = Object.keys(openView(before, event.view).views.find((v) => v.id === event.view)?.positions ?? {})
      const part = event.cards.length > 0 && event.cards.length < onView.length
      return part ? `Arranged ${some(event.cards.map((card) => card.object))}` : 'Arranged the diagram'
    }
    case 'diagramImported': {
      const count = event.diagram.elements.length
      return `Imported ${count === 1 ? '1 object' : `${count} objects`}`
    }
    default:
      return 'Changed the workspace'
  }
}
