import type { C4Level } from '../index'
import { COLUMN_KEYS, DiagramFormatError, ELEMENT_ID, canHaveShape, columnsProblem, isBoxShape, isLineColour, validateDiagram } from './model'
import type { BoxShape, ColumnKey, Diagram, DiagramElement, ElementKind, LineColour, Relationship, TableColumn } from './model'

export interface Point {
  x: number
  y: number
}

/** An object of the architecture. It exists once in the model and can be placed on many views. */
export interface ModelObject extends DiagramElement {
  /** Id of the object this one lives inside, for example a container's software system. */
  parent?: string
  /**
   * Icons attached to the object, shown on a corner of its card on every diagram: what it is made
   * with or runs on. Each is the name of an icon in the editor's icon library.
   */
  icons?: string[]
}

/** How many icons one object can carry: one (owner's call, 2026-11-25; it was six before). */
export const MAX_ICONS = 1
/** The form of an icon's name: lower-case letters, digits and hyphens. */
const ICON_NAME = /^[a-z0-9][a-z0-9-]*$/

export interface Connection extends Relationship {
  id: string
}

export interface Model {
  objects: ModelObject[]
  connections: Connection[]
}

/** A diagram: a selection of model objects and connections, and where they sit on the canvas. */
/**
 * A frame on one view around some of its cards: a deployment node, a zone, a team. It belongs to
 * the view, not to the model: the same cards can stand in other frames on another view.
 */
export interface ViewGroup {
  id: string
  name: string
  /** What the frame is, in a few words: "Deployment Node: Azure App Service". */
  type?: string
  /** Ids of the objects whose cards it holds: one at least, each placed on the view. */
  members: string[]
}

export interface View {
  id: string
  /**
   * The name of a view that was added: a box, and the Overview, can have several views, each with
   * its own cards and layout. Absent on the first view, the one every box has.
   */
  name?: string
  /**
   * Id of the object the view looks inside: its parts stand in its frame there. Absent on the
   * Overview, the diagram every workspace starts with.
   */
  scope?: string
  /** Top-left corner of each object placed on this view, by object id, in canvas pixels. */
  positions: Record<string, Point>
  /** Ids of the connections shown on this view. Both ends are placed on it. */
  connections: string[]
  /**
   * Size of each card on this view whose size is not `CARD`, by object id. Absent when every card
   * is `CARD`. The layout engine makes a card with many connections larger (see `arrangeView`).
   */
  sizes?: Record<string, Size>
  /** The frames around cards of this view. A card stands in one of them at most. Absent when there are none. */
  groups?: ViewGroup[]
}

/** The size of a card, in canvas pixels. */
export interface Size {
  width: number
  height: number
}

/** Everything the editor holds: one model and the views that show parts of it. */
export interface Workspace {
  model: Model
  views: View[]
}

/** The size of every card, unless its view gives it another one (`cardSize`). In canvas pixels. */
export const CARD: Size = { width: 220, height: 120 }

/** The least space between two cards. Cards never overlap and never come closer than this. */
export const CARD_GAP = 20

/** The Overview: the view every workspace starts with. (Its id is from when it was C4's landscape.) */
export const ROOT_VIEW_ID = 'landscape'

// Boxes, and nothing but boxes: an object is a box of some kind (a plain one, or one of C4's
// elements, which are shapes like the others), it may stand inside another box, and any box can
// be opened to look inside. No kind says what may live in what.

/** Every kind of shape an object can have. */
const KINDS: readonly ElementKind[] = ['box', 'person', 'softwareSystem', 'container', 'component', 'code']
/** The kinds that say how they are made: C4's containers and components, and code (its language and what it is). */
const hasTechnology = (kind: ElementKind) => kind === 'container' || kind === 'component' || kind === 'code'
/** The kinds that can be marked as not ours (C4: people and software systems). */
const canBeExternal = (kind: ElementKind) => kind === 'person' || kind === 'softwareSystem'

/**
 * Whether a view may show an object: any object of the model, from any depth, but on the view
 * inside an object never that object itself nor what it is inside (they are around the view,
 * not on it).
 */
function canShow(ws: Workspace, view: View, object: ModelObject): boolean {
  return view.scope === undefined || !ancestors(ws, view.scope).includes(object)
}

/**
 * Whether an imported object goes on the view it is imported on: on the Overview what stands
 * inside no other; on the view inside an object that object's parts and anything from outside
 * it, but nothing deeper inside one of its parts (that is on the part's own diagram).
 */
function landsOn(ws: Workspace, view: View, object: ModelObject): boolean {
  if (view.scope === undefined) return object.parent === undefined
  if (!canShow(ws, view, object)) return false
  return !isWithin(ws, view, object.id) || object.parent === view.scope
}

/** Whether an object is somewhere inside the object a view is about, at any depth. */
function isWithin(ws: Workspace, view: View, objectId: string): boolean {
  return view.scope !== undefined && ancestors(ws, objectId).slice(1).some((above) => above.id === view.scope)
}

/** What C4 asks an element to say besides its name (c4model.com/diagrams/notation). */
export interface ObjectDetails {
  /** What it does, in a sentence. */
  description?: string
  /** Containers and components only. */
  technology?: string
  /** People and software systems only: outside what the team owns. */
  external?: boolean
  /** Its outline; `''` for the plain rectangle. Not for a person or a piece of code. */
  shape?: BoxShape | ''
  /** The columns of a table, as its form has them: a row without a name is none, `''` is nothing said. */
  columns?: { name: string; type?: string; key?: ColumnKey | '' }[]
}

/** The columns a form gives, tidied: no spaces around, no column without a name, nothing empty. */
function tidyColumns(columns: ObjectDetails['columns']): TableColumn[] {
  return (columns ?? []).flatMap((column) => {
    const name = typeof column.name === 'string' ? column.name.trim() : ''
    if (name === '') return []
    const type = typeof column.type === 'string' ? column.type.trim() : ''
    const key = (COLUMN_KEYS as readonly unknown[]).includes(column.key) ? (column.key as ColumnKey) : undefined
    return [{ name, ...(type !== '' && { type }), ...(key !== undefined && { key }) }]
  })
}

const sameColumns = (a: TableColumn[] | undefined, b: TableColumn[] | undefined) => JSON.stringify(a ?? []) === JSON.stringify(b ?? [])

// Editing functions never mutate their input: the editor keeps old workspaces for undo.
// An edit that cannot apply returns its input unchanged.

export function emptyWorkspace(): Workspace {
  return {
    model: { objects: [], connections: [] },
    views: [{ id: ROOT_VIEW_ID, positions: {}, connections: [] }],
  }
}

/**
 * Create an object in the model and place it on a view. Made on the view inside another object,
 * it is a part of that object.
 */
export function addObject(
  ws: Workspace,
  viewId: string,
  kind: ElementKind,
  name: string,
  details: ObjectDetails = {},
  /** Where the card is wanted. Taken when it is free there; otherwise the usual place. */
  at?: Point,
  /** The size of its card on this view, when its text needs more room than `CARD`. */
  size?: Size,
): Workspace {
  const view = findView(ws, viewId)
  const trimmed = name.trim()
  if (!view || trimmed === '' || !KINDS.includes(kind)) return ws
  const room = isSize(size) ? size : undefined
  const parent = view.scope
  const id = uniqueId(trimmed, new Set(ws.model.objects.map((o) => o.id)))
  const description = details.description?.trim()
  const technology = hasTechnology(kind) ? details.technology?.trim() : undefined
  const shape = canHaveShape(kind) && isBoxShape(details.shape) ? details.shape : undefined
  const columns = shape === 'table' ? tidyColumns(details.columns) : []
  const object: ModelObject = {
    id,
    kind,
    name: trimmed,
    ...(parent !== undefined && { parent }),
    ...(description && { description }),
    ...(technology && { technology }),
    ...(canBeExternal(kind) && details.external === true && { external: true }),
    ...(shape !== undefined && { shape }),
    ...(columns.length > 0 && { columns }),
  }
  // On the view inside an object, its parts fill the grid by themselves: the neighbours that
  // stand around the frame take no place in it.
  const own = Object.keys(view.positions).filter((placed) =>
    ancestors(ws, placed).some((above) => above.id === view.scope),
  ).length
  const usual = parent !== undefined ? firstFree(view, gridSlot, own, room) : undefined
  const position = wantedPlace(view, at, room) ?? usual
  return {
    model: { ...ws.model, objects: [...ws.model.objects, object] },
    views: replaceView(ws, place(view, id, position, room)),
  }
}

/**
 * One more object like one that is on the view: its kind, text, icon and card size, named as
 * its copy, standing in the same box. The box alone: not its parts, its connections or the
 * diagram inside it. The copy goes where it is wanted when that is free, else on the next free
 * place to the right of the first.
 */
export function copyObject(ws: Workspace, viewId: string, objectId: string, at?: Point): Workspace {
  const view = findView(ws, viewId)
  const object = ws.model.objects.find((o) => o.id === objectId)
  if (!view || !object || !isPlaced(view, objectId)) return ws
  const name = `${object.name} copy`
  const id = uniqueId(name, new Set(ws.model.objects.map((o) => o.id)))
  const copy: ModelObject = {
    ...object,
    id,
    name,
    ...(object.icons && { icons: [...object.icons] }),
    ...(object.columns && { columns: object.columns.map((column) => ({ ...column })) }),
  }
  const size = cardSize(view, objectId)
  const from = view.positions[objectId]!
  const step = Math.max(320, size.width + 100)
  const position = wantedPlace(view, at, size) ?? firstFree(view, (index) => ({ x: from.x + (index + 1) * step, y: from.y }), 0, size)
  return {
    model: { ...ws.model, objects: [...ws.model.objects, copy] },
    views: replaceView(ws, place(view, id, position, size)),
  }
}

/** The objects of the model that can still be shown on a view. */
export function placeableObjects(ws: Workspace, viewId: string): ModelObject[] {
  const view = findView(ws, viewId)
  if (!view) return []
  return ws.model.objects.filter((o) => !isPlaced(view, o.id) && canShow(ws, view, o))
}

/** The boxes an object stands inside, the outermost first; none for an object of the Overview. */
export function boxesAround(ws: Workspace, objectId: string): ModelObject[] {
  return ancestors(ws, objectId).slice(1).reverse()
}

/**
 * Show an object that is already in the model on a view. What is somewhere inside the object
 * the view is about goes among its parts, as a new part does; anything else to the usual place.
 */
export function placeObject(ws: Workspace, viewId: string, objectId: string, at?: Point): Workspace {
  const view = findView(ws, viewId)
  if (!view || !placeableObjects(ws, viewId).some((o) => o.id === objectId)) return ws
  const own = Object.keys(view.positions).filter((placed) => isWithin(ws, view, placed)).length
  const usual = isWithin(ws, view, objectId) ? firstFree(view, gridSlot, own) : undefined
  return { ...ws, views: replaceView(ws, place(view, objectId, wantedPlace(view, at) ?? usual)) }
}

/**
 * Whether a card with its top-left corner at `position` keeps the gap to every other card on
 * the view. The layout engine finds good places; this only tells a bad one.
 */
export function fitsOnView(
  ws: Workspace,
  viewId: string,
  objectId: string,
  position: Point,
): boolean {
  const view = findView(ws, viewId)
  return view !== undefined && isFree(view, position, objectId)
}

/** The size of an object's card on a view: what the view stores for it, else `CARD`. */
export function cardSize(view: View, objectId: string): Size {
  return view.sizes !== undefined && Object.hasOwn(view.sizes, objectId) ? view.sizes[objectId]! : CARD
}

/**
 * Give one card of a view another size, for the room its text needs, and optionally another
 * place with it. Refused when the card would then overlap another one or come closer than
 * `CARD_GAP`: the card keeps the size it has.
 */
export function resizeCard(ws: Workspace, viewId: string, objectId: string, size: Size, to?: Point): Workspace {
  const view = findView(ws, viewId)
  if (!view || !isPlaced(view, objectId) || !isSize(size)) return ws
  const old = view.positions[objectId]!
  const position = to && Number.isFinite(to.x) && Number.isFinite(to.y) ? { x: to.x, y: to.y } : old
  const before = cardSize(view, objectId)
  const same = before.width === size.width && before.height === size.height && old.x === position.x && old.y === position.y
  if (same || !isFree(view, position, objectId, size)) return ws
  const moved = { ...view, positions: { ...view.positions, [objectId]: position } }
  return { ...ws, views: replaceView(ws, withSize(moved, objectId, size)) }
}

/** One card of an arrangement: where its top-left corner goes, and how large it is. */
export interface ArrangedCard {
  object: string
  to: Point
  size: Size
}

/**
 * Put cards of one view at new places with new sizes, all in one change. Cards not listed stay
 * where they are, with their size. The whole arrangement is refused when a listed object is not
 * on the view (or is listed twice), a place or size is not a finite number (sizes above zero), or
 * two cards of the view would overlap or come closer than `CARD_GAP`.
 */
export function arrangeView(ws: Workspace, viewId: string, cards: readonly ArrangedCard[]): Workspace {
  const view = findView(ws, viewId)
  if (!view) return ws
  const listed = new Set<string>()
  const positions = { ...view.positions }
  const sizes = { ...view.sizes }
  let changed = false
  for (const { object, to, size } of cards) {
    if (!isPlaced(view, object) || listed.has(object)) return ws
    if (!Number.isFinite(to.x) || !Number.isFinite(to.y) || !isSize(size)) return ws
    listed.add(object)
    const old = positions[object]!
    const oldSize = cardSize(view, object)
    if (old.x !== to.x || old.y !== to.y || oldSize.width !== size.width || oldSize.height !== size.height) {
      changed = true
    }
    positions[object] = { x: to.x, y: to.y }
    if (size.width === CARD.width && size.height === CARD.height) delete sizes[object]
    else sizes[object] = { width: size.width, height: size.height }
  }
  if (!changed) return ws
  const { sizes: _old, ...rest } = view
  const arranged: View = { ...rest, positions, ...(Object.keys(sizes).length > 0 && { sizes }) }
  const ids = Object.keys(positions)
  for (const [i, a] of ids.entries()) {
    for (const b of ids.slice(i + 1)) {
      if (!apart(positions[a]!, cardSize(arranged, a), positions[b]!, cardSize(arranged, b))) return ws
    }
  }
  return { ...ws, views: replaceView(ws, arranged) }
}

/** Put an object somewhere else on one view. A place too close to another card is refused. */
export function moveObject(
  ws: Workspace,
  viewId: string,
  objectId: string,
  position: Point,
): Workspace {
  const view = findView(ws, viewId)
  if (!view || !isPlaced(view, objectId)) return ws
  const old = view.positions[objectId]!
  if (old.x === position.x && old.y === position.y) return ws
  if (!isFree(view, position, objectId)) return ws
  const moved = { ...view, positions: { ...view.positions, [objectId]: { x: position.x, y: position.y } } }
  return { ...ws, views: replaceView(ws, moved) }
}

/** Give an object another name. Its id stays. */
export function renameObject(ws: Workspace, objectId: string, name: string): Workspace {
  const trimmed = name.trim()
  const object = ws.model.objects.find((o) => o.id === objectId)
  if (!object || trimmed === '' || trimmed === object.name) return ws
  const objects = ws.model.objects.map((o) => (o === object ? { ...o, name: trimmed } : o))
  return { ...ws, model: { ...ws.model, objects } }
}

/**
 * Change what an object says about itself, in one go: its name and what C4 asks besides
 * (`ObjectDetails`). A detail left out stays as it is; an empty text takes it away. Technology
 * is for containers and components, "external" for people and software systems: the other one
 * is ignored. An empty name is refused.
 */
export function editObject(ws: Workspace, objectId: string, name: string, details: ObjectDetails = {}): Workspace {
  const object = ws.model.objects.find((o) => o.id === objectId)
  const trimmed = name.trim()
  if (!object || trimmed === '') return ws
  const { description: _d, technology: _t, external: _e, shape: _s, columns: _c, ...rest } = object
  const description = details.description === undefined ? object.description : details.description.trim()
  const technology =
    details.technology === undefined || !hasTechnology(object.kind) ? object.technology : details.technology.trim()
  const external = details.external === undefined || !canBeExternal(object.kind) ? object.external : details.external
  // Said empty: the plain rectangle again. Not said, or no shape there is: as it was.
  const shape =
    details.shape === '' ? undefined : isBoxShape(details.shape) && canHaveShape(object.kind) ? details.shape : object.shape
  // Columns are a table's: said, they are the new ones; not said, they stay; no table, none.
  const columns = shape !== 'table' ? [] : details.columns === undefined ? (object.columns ?? []) : tidyColumns(details.columns)
  const changed: ModelObject = {
    ...rest,
    name: trimmed,
    ...(description && { description }),
    ...(technology && { technology }),
    ...(external === true && { external: true }),
    ...(shape !== undefined && { shape }),
    ...(columns.length > 0 && { columns }),
  }
  const same =
    sameColumns(changed.columns, object.columns) &&
    changed.shape === object.shape &&
    changed.name === object.name &&
    changed.description === object.description &&
    changed.technology === object.technology &&
    (changed.external === true) === (object.external === true)
  if (same) return ws
  return { ...ws, model: { ...ws.model, objects: ws.model.objects.map((o) => (o === object ? changed : o)) } }
}

/** Delete connections from the model, and with that from every diagram. */
export function removeConnections(ws: Workspace, connectionIds: readonly string[]): Workspace {
  const gone = new Set(ws.model.connections.filter((c) => connectionIds.includes(c.id)).map((c) => c.id))
  if (gone.size === 0) return ws
  return {
    model: { ...ws.model, connections: ws.model.connections.filter((c) => !gone.has(c.id)) },
    views: ws.views.map((v) =>
      v.connections.some((id) => gone.has(id)) ? { ...v, connections: v.connections.filter((id) => !gone.has(id)) } : v,
    ),
  }
}

/**
 * Give an object its icons, in the order they are shown. Refused when a name has not the form of
 * an icon's name, one is named twice or there are more than `MAX_ICONS`. No icons: the object
 * carries none.
 */
export function setObjectIcons(ws: Workspace, objectId: string, icons: readonly string[]): Workspace {
  const object = ws.model.objects.find((o) => o.id === objectId)
  if (!object || icons.length > MAX_ICONS || new Set(icons).size !== icons.length) return ws
  if (!icons.every((icon) => typeof icon === 'string' && ICON_NAME.test(icon))) return ws
  const before = object.icons ?? []
  if (before.length === icons.length && before.every((icon, i) => icon === icons[i])) return ws
  const { icons: _old, ...rest } = object
  const changed: ModelObject = icons.length > 0 ? { ...rest, icons: [...icons] } : rest
  return { ...ws, model: { ...ws.model, objects: ws.model.objects.map((o) => (o === object ? changed : o)) } }
}

/**
 * Delete objects from the model: with everything inside them, their connections and the views
 * about them, from every view.
 */
export function removeObjects(ws: Workspace, objectIds: readonly string[]): Workspace {
  const gone = new Set(
    ws.model.objects
      .filter((o) => ancestors(ws, o.id).some((a) => objectIds.includes(a.id)))
      .map((o) => o.id),
  )
  if (gone.size === 0) return ws
  const connections = ws.model.connections.filter((c) => !gone.has(c.from) && !gone.has(c.to))
  const kept = new Set(connections.map((c) => c.id))
  const views = ws.views
    .filter((v) => v.scope === undefined || !gone.has(v.scope))
    .map((v) => {
      const { sizes: oldSizes, ...rest } = v
      const sizes = Object.entries(oldSizes ?? {}).filter(([id]) => !gone.has(id))
      return withGroups(
        {
          ...rest,
          positions: Object.fromEntries(Object.entries(v.positions).filter(([id]) => !gone.has(id))),
          connections: v.connections.filter((id) => kept.has(id)),
          ...(sizes.length > 0 && { sizes: Object.fromEntries(sizes) }),
        },
        without(v.groups ?? [], gone),
      )
    })
  return { model: { objects: ws.model.objects.filter((o) => !gone.has(o.id)), connections }, views }
}

/** Room the frame of a group takes around its cards: at the sides, above them for its name, under them. */
export const GROUP_FRAME = { side: 14, top: 40, bottom: 14 }

/**
 * Whether no card comes into the frame of a group it is not in, nor closer to it than
 * `CARD_GAP`, when some cards of a view go to other places or sizes (`changed`: a drag, several
 * cards dragged together, a resize). A frame is drawn around its cards (`GROUP_FRAME`), so it
 * can run over a card outside it while every card keeps its gap to every other. Either way it
 * can come to: a card of the frame moves out, or a card outside moves in. A card that stood in a
 * frame before may stay there (frames can be made around cards that do not stand side by side),
 * so the cards of that frame still move.
 */
export function groupFramesStayClear(view: View, changed: Readonly<Record<string, Point & Partial<Size>>>): boolean {
  const before = framesInTheWay(view, {})
  return [...framesInTheWay(view, changed)].every((pair) => before.has(pair))
}

/** Each card in the way of a frame of a group it is not in, as `<group id> <card id>`. */
function framesInTheWay(view: View, changed: Readonly<Record<string, Point & Partial<Size>>>): Set<string> {
  const box = (id: string) => {
    const size = cardSize(view, id)
    const to = Object.hasOwn(changed, id) ? changed[id]! : undefined
    const at = to ?? view.positions[id]!
    return { x: at.x, y: at.y, width: to?.width ?? size.width, height: to?.height ?? size.height }
  }
  const cards = Object.keys(view.positions).map((id) => ({ id, ...box(id) }))
  const found = new Set<string>()
  for (const group of view.groups ?? []) {
    const own = cards.filter((card) => group.members.includes(card.id))
    if (own.length === 0) continue
    const x = Math.min(...own.map((card) => card.x)) - GROUP_FRAME.side
    const y = Math.min(...own.map((card) => card.y)) - GROUP_FRAME.top
    const right = Math.max(...own.map((card) => card.x + card.width)) + GROUP_FRAME.side
    const bottom = Math.max(...own.map((card) => card.y + card.height)) + GROUP_FRAME.bottom
    const frame = { x, y }
    const frameSize = { width: right - x, height: bottom - y }
    for (const card of cards) {
      if (!group.members.includes(card.id) && !apart(card, card, frame, frameSize)) found.add(`${group.id} ${card.id}`)
    }
  }
  return found
}

/** A view with these groups; without the key when there are none. */
function withGroups(view: View, groups: ViewGroup[]): View {
  const { groups: _old, ...rest } = view
  return groups.length > 0 ? { ...rest, groups } : rest
}

/** Groups without some cards; a group left without a card is gone. */
function without(groups: readonly ViewGroup[], cards: ReadonlySet<string>): ViewGroup[] {
  return groups.flatMap((group) => {
    const members = group.members.filter((id) => !cards.has(id))
    return members.length === 0 ? [] : [members.length === group.members.length ? group : { ...group, members }]
  })
}

/**
 * The cards of a view that can stand in a frame there: on the view inside a box the cards inside
 * that box (what stands outside its frame is not this view's to group), else every card of it.
 */
export function groupable(ws: Workspace, viewId: string, objectIds: readonly string[]): string[] {
  const view = findView(ws, viewId)
  if (!view) return []
  return [...new Set(objectIds)].filter((id) => isPlaced(view, id) && (view.scope === undefined || isWithin(ws, view, id)))
}

/**
 * Put cards of a view in a frame with a name. With the name of a frame the view has, they join
 * it; else the frame is new. A card stands in one frame at most: it leaves the one it was in.
 * Only cards that can be grouped there (`groupable`).
 */
export function groupCards(ws: Workspace, viewId: string, objectIds: readonly string[], name: string, type?: string): Workspace {
  const view = findView(ws, viewId)
  const trimmed = name.trim()
  const cards = groupable(ws, viewId, objectIds)
  if (!view || trimmed === '' || cards.length === 0) return ws
  const old = view.groups ?? []
  const joined = old.find((group) => group.name === trimmed)
  const said = type?.trim()
  const rest = without(old.filter((group) => group !== joined), new Set(cards))
  const members = [...(joined?.members ?? []), ...cards.filter((id) => !joined?.members.includes(id))]
  if (joined && members.length === joined.members.length && rest.length === old.length - 1) return ws
  const numbers = old.map((group) => Number(/^g(\d+)$/.exec(group.id)?.[1] ?? 0))
  const group: ViewGroup = joined
    ? { ...joined, members }
    : { id: `g${Math.max(0, ...numbers) + 1}`, name: trimmed, ...(said && { type: said }), members }
  // In the order the view had them, a new one last.
  const groups = joined ? old.flatMap((g) => (g === joined ? [group] : rest.filter((r) => r.id === g.id))) : [...rest, group]
  return { ...ws, views: replaceView(ws, withGroups(view, groups)) }
}

/** Take cards out of the frames they stand in on a view. A frame goes with its last card. */
export function ungroupCards(ws: Workspace, viewId: string, objectIds: readonly string[]): Workspace {
  const view = findView(ws, viewId)
  const old = view?.groups ?? []
  const groups = without(old, new Set(objectIds))
  if (!view || groups.every((group, i) => group === old[i]) && groups.length === old.length) return ws
  return { ...ws, views: replaceView(ws, withGroups(view, groups)) }
}

/** Give a frame another name and say what it is; `type` empty: say it no longer. */
export function editGroup(ws: Workspace, viewId: string, groupId: string, name: string, type: string): Workspace {
  const view = findView(ws, viewId)
  const group = view?.groups?.find((g) => g.id === groupId)
  const trimmed = name.trim()
  const said = type.trim()
  if (!view || !group || trimmed === '') return ws
  if (trimmed === group.name && said === (group.type ?? '')) return ws
  const { type: _old, ...rest } = group
  const edited: ViewGroup = { ...rest, name: trimmed, ...(said && { type: said }) }
  return { ...ws, views: replaceView(ws, withGroups(view, view.groups!.map((g) => (g === group ? edited : g)))) }
}

/** Take a frame away. Its cards stay where they stand. */
export function removeGroup(ws: Workspace, viewId: string, groupId: string): Workspace {
  const view = findView(ws, viewId)
  if (!view?.groups?.some((g) => g.id === groupId)) return ws
  return { ...ws, views: replaceView(ws, withGroups(view, view.groups.filter((g) => g.id !== groupId))) }
}

/** Room the frame of a diagram's object takes around its cards, and the gap to a card outside it. */
export const FRAME = { side: 40, top: 72, bottom: 40, gap: 60 }

/**
 * The view inside an object also shows what that object itself and its parts, at any depth, are
 * connected to, outside the object's frame: who points at them in a row above its cards, what
 * they point at in a row below. A connection of a part needs its other end here to be drawn.
 * They are put there once; after that they stay where they are moved. A neighbour the view may
 * not show (what the object stands inside) is left out.
 */
function withNeighbours(ws: Workspace, view: View): Workspace {
  const scope = view.scope
  if (scope === undefined) return ws
  const inside = (id: string) => ancestors(ws, id).some((object) => object.id === scope)
  const here = (id: string) => id === scope || isWithin(ws, view, id)
  const above: string[] = []
  const below: string[] = []
  for (const connection of ws.model.connections) {
    const [other, row] = here(connection.to) ? [connection.from, above] : here(connection.from) ? [connection.to, below] : []
    if (other === undefined || row === undefined || inside(other)) continue
    const shown = ancestors(ws, other).find((object) => canShow(ws, view, object))?.id
    if (shown === undefined || isPlaced(view, shown)) continue
    if (!above.includes(shown) && !below.includes(shown)) row.push(shown)
  }
  if (above.length === 0 && below.length === 0) return ws
  // The cards of the object itself; with none yet, the place the first one will take.
  const own = Object.keys(view.positions).filter(inside)
  const boxes = own.length > 0 ? own.map((id) => ({ ...view.positions[id]!, ...cardSize(view, id) })) : [{ ...gridSlot(0), ...CARD }]
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y)) - FRAME.top - FRAME.gap - CARD.height
  const bottom = Math.max(...boxes.map((box) => box.y + box.height)) + FRAME.bottom + FRAME.gap
  let synced = view
  for (const [ids, y] of [[above, top], [below, bottom]] as const) {
    for (const id of ids) {
      synced = place(synced, id, firstFree(synced, (index) => ({ x: left + index * 320, y })))
    }
  }
  return { ...ws, views: replaceView(ws, synced) }
}

/** The view that looks inside an object, if it was opened before: its first view, not one that was added. */
export function findViewInside(ws: Workspace, objectId: string): View | undefined {
  return ws.views.find((v) => v.scope === objectId && v.name === undefined)
}

/** What the first view of a box is called among its views: it shows how the box is built. */
export const FIRST_VIEW_NAME = 'Structure'

/** The views of the same box as a view (of the Overview, for a view of that), the first one first. */
export function viewsOf(ws: Workspace, viewId: string): { id: string; name: string }[] {
  const view = findView(ws, viewId)
  if (!view) return []
  const same = ws.views.filter((v) => v.scope === view.scope)
  return [...same.filter((v) => v.name === undefined), ...same.filter((v) => v.name !== undefined)].map((v) => ({
    id: v.id,
    name: v.name ?? FIRST_VIEW_NAME,
  }))
}

/**
 * One more view of the box a view is about, under a name. It starts with what that view shows
 * (`copy`: its cards where they stand, their sizes, its connections) or empty. Nothing comes onto
 * an added view by itself (see `syncView`): it shows what is put on it.
 */
export function addView(ws: Workspace, likeViewId: string, name: string, copy: boolean): Workspace {
  const like = findView(ws, likeViewId)
  const trimmed = name.trim()
  if (!like || trimmed === '') return ws
  // Past every number a view has or had while a higher one is still there: ids are not reused.
  const numbers = ws.views.map((v) => Number(/^view-(\d+)$/.exec(v.id)?.[1] ?? 0))
  const view: View = {
    id: `view-${Math.max(0, ...numbers) + 1}`,
    name: trimmed,
    ...(like.scope !== undefined && { scope: like.scope }),
    positions: copy ? structuredClone(like.positions) : {},
    connections: copy ? [...like.connections] : [],
    ...(copy && like.sizes && { sizes: structuredClone(like.sizes) }),
    ...(copy && like.groups && { groups: structuredClone(like.groups) }),
  }
  return { ...ws, views: [...ws.views, view] }
}

/** Give a view that was added another name. The first view of a box has none to change. */
export function renameView(ws: Workspace, viewId: string, name: string): Workspace {
  const view = findView(ws, viewId)
  const trimmed = name.trim()
  if (!view || view.name === undefined || trimmed === '' || trimmed === view.name) return ws
  return { ...ws, views: replaceView(ws, { ...view, name: trimmed }) }
}

/** Take away a view that was added. The objects on it stay in the model and on the other views. */
export function removeView(ws: Workspace, viewId: string): Workspace {
  const view = findView(ws, viewId)
  if (!view || view.name === undefined) return ws
  return { ...ws, views: ws.views.filter((v) => v !== view) }
}

/** Make sure the view that looks inside an object exists. Any object can be opened. */
export function ensureViewInside(ws: Workspace, objectId: string): Workspace {
  const object = ws.model.objects.find((o) => o.id === objectId)
  if (!object || findViewInside(ws, objectId)) return ws
  const view: View = { id: `inside-${objectId}`, scope: objectId, positions: {}, connections: [] }
  return { ...ws, views: [...ws.views, view] }
}

/**
 * Open an object: the view that looks inside it, where it is the frame around its parts. Creates
 * the view the first time. `undefined` for an object that is not there.
 */
export function drillDown(
  ws: Workspace,
  fromViewId: string,
  objectId: string,
): { workspace: Workspace; viewId: string } | undefined {
  if (!findView(ws, fromViewId)) return undefined
  const withView = ensureViewInside(ws, objectId)
  const view = findViewInside(withView, objectId)
  return view && { workspace: syncView(withView, view.id), viewId: view.id }
}

/**
 * A view as it is when it is opened: created the first time (`inside-<object>`) and brought up to
 * date (`syncView`). A view inside an object brings the views on the way down to it along, for
 * the breadcrumb.
 */
export function openView(ws: Workspace, viewId: string): Workspace {
  if (findView(ws, viewId)) return syncView(ws, viewId)
  const objectId = /^inside-(.*)$/.exec(viewId)?.[1]
  if (objectId === undefined) return ws
  const opened = ancestors(ws, objectId).reduceRight((made, object) => ensureViewInside(made, object.id), ws)
  return syncView(opened, viewId)
}

/**
 * Bring a view up to date with the model. Only adds; what is there keeps its place.
 * - The Overview shows every object that stands inside no other, and the connections between them.
 * - The view inside an object shows what that object and its parts are connected to, around its
 *   frame (`withNeighbours`), and every connection that has an end at one of its parts.
 * - A view that was added (it has a name) gets no cards by itself, only the connections between
 *   the cards somebody put on it.
 */
export function syncView(ws: Workspace, viewId: string): Workspace {
  const view = findView(ws, viewId)
  if (!view) return ws
  let synced = view
  if (view.name !== undefined) {
    // Nothing is put there.
  } else if (view.scope === undefined) {
    for (const object of ws.model.objects) {
      if (object.parent === undefined && !isPlaced(synced, object.id)) synced = place(synced, object.id)
    }
  } else {
    synced = findView(withNeighbours(ws, view), view.id) ?? view
  }
  const own = (id: string) => view.scope === undefined || isWithin(ws, view, id)
  const shown = new Set(synced.connections)
  const missing = ws.model.connections.filter(
    (c) => !shown.has(c.id) && isPlaced(synced, c.from) && isPlaced(synced, c.to) && (own(c.from) || own(c.to)),
  )
  if (synced === view && missing.length === 0) return ws
  const connections = [...synced.connections, ...missing.map((c) => c.id)]
  return { ...ws, views: replaceView(ws, { ...synced, connections }) }
}

/** What the Overview is called. */
const OVERVIEW = 'Overview'

/** The way from the Overview down to a view, for the breadcrumb: every object it is inside. */
export function breadcrumb(ws: Workspace, viewId: string): { viewId: string; label: string }[] {
  const view = findView(ws, viewId)
  const trail = ancestors(ws, view?.scope)
    .reverse()
    .flatMap((object) => {
      const inside = findViewInside(ws, object.id)
      return inside ? [{ viewId: inside.id, label: object.name }] : []
    })
  return [{ viewId: ROOT_VIEW_ID, label: OVERVIEW }, ...trail]
}

/**
 * What a diagram shows of the connections made inside its cards: that the two cards which hold
 * their ends are connected, this way round. `connections` are the ones it stands for, in the
 * order they were made.
 */
export interface LiftedConnection {
  from: string
  to: string
  connections: Connection[]
}

/**
 * The connections a view shows one level up from where they were made: at least one end is
 * inside a card of the view, not on the view itself. One entry per pair of cards and direction:
 * the first connection makes the line, the others add nothing. None where the view has a
 * connection of its own between the same two cards, the same way round: that one was drawn
 * there and says it already. Derived every time, never stored, so they cannot go stale.
 */
export function liftedConnections(ws: Workspace, viewId: string): LiftedConnection[] {
  const view = findView(ws, viewId)
  if (!view) return []
  const onView = (id: string) => ancestors(ws, id).find((o) => isPlaced(view, o.id))?.id
  const own = new Set(view.connections)
  const drawn = new Set(ws.model.connections.filter((c) => own.has(c.id)).map((c) => `${c.from} ${c.to}`))
  const lifted = new Map<string, LiftedConnection>()
  for (const connection of ws.model.connections) {
    if (own.has(connection.id)) continue
    const from = onView(connection.from)
    const to = onView(connection.to)
    if (from === undefined || to === undefined || from === to) continue
    if (from === connection.from && to === connection.to) continue
    const key = `${from} ${to}`
    if (drawn.has(key)) continue
    const entry = lifted.get(key) ?? { from, to, connections: [] }
    entry.connections.push(connection)
    lifted.set(key, entry)
  }
  return [...lifted.values()]
}

/** Create a connection in the model between two objects on a view, and show it there. */
/**
 * Whether a connection can be drawn between two cards of a view. On the view inside a box one
 * end at least has to be inside that box: its parts connect with each other and with what stands
 * outside its frame, but two objects outside it are connected on a diagram they are on.
 */
export function connectable(ws: Workspace, viewId: string, from: string, to: string): boolean {
  const view = findView(ws, viewId)
  if (!view || from === to || !isPlaced(view, from) || !isPlaced(view, to)) return false
  return view.scope === undefined || isWithin(ws, view, from) || isWithin(ws, view, to)
}

export function connect(
  ws: Workspace,
  viewId: string,
  from: string,
  to: string,
  label?: string,
): Workspace {
  const view = findView(ws, viewId)
  if (!view || !connectable(ws, viewId, from, to)) return ws
  const taken = new Set(ws.model.connections.map((c) => c.id))
  let n = taken.size + 1
  while (taken.has(`c${n}`)) n++
  const connection = withLabel({ id: `c${n}`, from, to }, label)
  return {
    model: { ...ws.model, connections: [...ws.model.connections, connection] },
    views: replaceView(ws, { ...view, connections: [...view.connections, connection.id] }),
  }
}

/**
 * Say what a connection is for and, optionally, how it is made (protocol or technology).
 * Leave `technology` out to keep the one it has; pass `''` to remove it.
 */
export function setConnectionLabel(
  ws: Workspace,
  connectionId: string,
  label: string,
  technology?: string,
): Workspace {
  const old = ws.model.connections.find((c) => c.id === connectionId)
  if (!old) return ws
  let changed = withLabel(old, label)
  if (technology !== undefined) {
    const { technology: _old, ...rest } = changed
    const trimmed = technology.trim()
    changed = trimmed ? { ...rest, technology: trimmed } : rest
  }
  if (changed.label === old.label && changed.technology === old.technology) return ws
  const connections = ws.model.connections.map((c) => (c === old ? changed : c))
  return { ...ws, model: { ...ws.model, connections } }
}

/** Give a connection one of the colours, or none (`undefined`): the line is then the usual grey. */
export function setConnectionColour(ws: Workspace, connectionId: string, colour: LineColour | undefined): Workspace {
  const old = ws.model.connections.find((c) => c.id === connectionId)
  if (!old || old.colour === colour) return ws
  if (colour !== undefined && !isLineColour(colour)) return ws
  const { colour: _old, ...rest } = old
  const changed: Connection = colour === undefined ? rest : { ...rest, colour }
  return { ...ws, model: { ...ws.model, connections: ws.model.connections.map((c) => (c === old ? changed : c)) } }
}

/** The title of a diagram: "Overview" for the start diagram, else the name of the object it is inside. */
export function viewTitle(ws: Workspace, viewId: string): string {
  const view = findView(ws, viewId)
  if (!view) return ''
  const about = view.scope === undefined ? OVERVIEW : (ws.model.objects.find((o) => o.id === view.scope)?.name ?? '')
  return view.name === undefined ? about : `${about}: ${view.name}`
}

/**
 * The C4 level a text format writes a view as: the formats are C4's (Mermaid's C4 diagrams, D2 as
 * the export writes it) and need one. The Overview is a context diagram; the view inside a
 * software system a container diagram; inside anything else a component diagram.
 */
function exchangeLevel(ws: Workspace, view: View): C4Level {
  const scope = ws.model.objects.find((o) => o.id === view.scope)
  if (!scope) return 'context'
  return scope.kind === 'softwareSystem' ? 'container' : 'component'
}

/** What a view shows, as the format-neutral `Diagram` that every `DiagramFormat` converts. */
export function viewToDiagram(ws: Workspace, viewId: string): Diagram {
  const view = findView(ws, viewId)
  if (!view) throw new DiagramFormatError(`Unknown view: ${viewId}`)
  const shown = new Set(view.connections)
  return {
    level: exchangeLevel(ws, view),
    elements: ws.model.objects
      .filter((o) => isPlaced(view, o.id))
      .map(({ parent: _parent, ...element }) => element),
    relationships: ws.model.connections
      .filter((c) => shown.has(c.id))
      .map(({ id: _id, ...relationship }) => relationship),
  }
}

/**
 * The open diagram as a text format writes it (export): what the canvas shows, not only the
 * view's own connections. It carries the diagram's title; inside an object (Container, Component
 * diagram) that object is the boundary around its parts; a connector that stands for connections
 * of objects inside its cards is written as those connections, between the cards; the object's
 * own connections run to the boundary, unless one to a card inside says it more exactly. Icons
 * and the places of the cards are left out. Ids are made unique also without regard to case, as
 * D2 reads them.
 */
export function diagramOfView(ws: Workspace, viewId: string): Diagram {
  const view = findView(ws, viewId)
  if (!view) throw new DiagramFormatError(`Unknown view: ${viewId}`)
  const placed = ws.model.objects.filter((o) => isPlaced(view, o.id))
  const scope = view.scope !== undefined ? ws.model.objects.find((o) => o.id === view.scope) : undefined
  // The formats know two frames: a software system's, and a container's for every other box.
  const boundaryKind = scope === undefined ? undefined : scope.kind === 'softwareSystem' ? 'softwareSystem' : 'container'
  const isInside = (id: string) => scope !== undefined && ancestors(ws, id).slice(1).some((o) => o.id === scope.id)

  // Ids that differ only in case get a number.
  const ids = new Map<string, string>()
  const taken = new Set<string>()
  for (const object of [...(boundaryKind ? [scope!] : []), ...placed]) {
    let id = object.id
    for (let n = 2; taken.has(id.toLowerCase()); n++) id = `${object.id}${n}`
    taken.add(id.toLowerCase())
    ids.set(object.id, id)
  }
  const idOf = (id: string) => ids.get(id) ?? id

  const element = ({ parent: _parent, icons: _icons, ...rest }: ModelObject): DiagramElement => ({ ...rest, id: idOf(rest.id) })
  const members = boundaryKind ? placed.filter((o) => isInside(o.id)) : []
  // The members stand together, where the first of them is.
  const elements = placed.flatMap((o) => {
    if (!members.includes(o)) return [element(o)]
    return o === members[0] ? members.map(element) : []
  })

  const relationships: Relationship[] = []
  const seen = new Set<string>()
  const add = (from: string, to: string, connection: { label?: string; technology?: string; colour?: LineColour }) => {
    const relationship: Relationship = {
      from,
      to,
      ...(connection.label !== undefined && { label: connection.label }),
      ...(connection.technology !== undefined && { technology: connection.technology }),
      ...(connection.colour !== undefined && { colour: connection.colour }),
    }
    const key = JSON.stringify(relationship)
    if (seen.has(key)) return
    seen.add(key)
    relationships.push(relationship)
  }
  const shown = new Set(view.connections)
  for (const c of ws.model.connections) if (shown.has(c.id)) add(c.from, c.to, c)
  // One level up a connection has no label: what it says is said where it was made.
  for (const lifted of liftedConnections(ws, viewId)) add(lifted.from, lifted.to, {})
  if (boundaryKind) {
    const outside = new Set(placed.filter((o) => !isInside(o.id)).map((o) => o.id))
    const explicit = new Set<string>()
    for (const r of relationships) {
      if (isInside(r.from) && outside.has(r.to)) explicit.add(r.to)
      if (isInside(r.to) && outside.has(r.from)) explicit.add(r.from)
    }
    for (const c of ws.model.connections) {
      const inwards = c.to === scope!.id
      if (!inwards && c.from !== scope!.id) continue
      const other = ancestors(ws, inwards ? c.from : c.to).find((o) => outside.has(o.id))?.id
      if (other === undefined || explicit.has(other)) continue
      if (inwards) add(other, scope!.id, c)
      else add(scope!.id, other, c)
    }
  }

  return {
    level: exchangeLevel(ws, view),
    title: viewTitle(ws, viewId),
    elements,
    relationships: relationships.map((r) => ({ ...r, from: idOf(r.from), to: idOf(r.to) })),
    ...(boundaryKind && {
      boundary: { id: idOf(scope!.id), kind: boundaryKind, name: scope!.name, members: members.map((o) => idOf(o.id)) },
    }),
  }
}

/**
 * Bring a diagram written as text (Mermaid, D2) into the model, onto an open diagram. Every
 * element becomes a new object, named as in the file, and every relationship a connection.
 * - What the file frames (its boundary) lives inside the frame. A frame of the same kind as the
 *   object the open diagram is inside is that object; another one becomes a new object on the
 *   open diagram, and its parts go on its own diagram.
 * - Everything else is added to the open diagram as if drawn there. Only when the file's frame is
 *   the open diagram's own object, what stands outside that frame stands outside the object too:
 *   beside it, one level up.
 * The open diagram gets the objects it can show, each at its place in `places` (by the file's id)
 * when that is free, and the connections between them.
 */
export function importDiagram(
  ws: Workspace,
  viewId: string,
  diagram: Diagram,
  places: Readonly<Record<string, Point>> = {},
): Workspace {
  const view = findView(ws, viewId)
  if (!view) return ws
  try {
    validateDiagram(diagram)
  } catch {
    return ws
  }
  const taken = new Set(ws.model.objects.map((o) => o.id))
  const fresh = (name: string) => {
    const id = uniqueId(name, taken)
    taken.add(id)
    return id
  }
  const scope = ws.model.objects.find((o) => o.id === view.scope)

  const objects: ModelObject[] = []
  const ids = new Map<string, string>()
  const boundary = diagram.boundary
  let frame: string | undefined
  /** Whether the boundary is a new object, with a diagram of its own. */
  let ownFrame = false
  if (boundary) {
    if (scope && scope.kind === boundary.kind) frame = scope.id
    else {
      frame = fresh(boundary.name)
      ownFrame = true
      objects.push({ id: frame, kind: boundary.kind, name: boundary.name, ...(scope && { parent: scope.id }) })
    }
    ids.set(boundary.id, frame)
  }
  const members = new Set(boundary?.members)
  /** Where what the file leaves outside its frame lives. */
  const outside = boundary && !ownFrame ? scope?.parent : scope?.id
  // Every element its id first: one may stand inside one that comes after it.
  for (const element of diagram.elements) ids.set(element.id, fresh(element.name.trim() || element.id))
  for (const element of diagram.elements) {
    const parent = element.inside !== undefined ? ids.get(element.inside) : members.has(element.id) ? frame : outside
    const id = ids.get(element.id)!
    objects.push({
      id,
      kind: element.kind,
      name: element.name,
      ...(parent !== undefined && { parent }),
      ...(element.description !== undefined && { description: element.description }),
      ...(hasTechnology(element.kind) && element.technology !== undefined && { technology: element.technology }),
      ...(canBeExternal(element.kind) && element.external === true && { external: true }),
      ...(element.shape !== undefined && { shape: element.shape }),
      ...(element.columns !== undefined && { columns: element.columns.map((column) => ({ ...column })) }),
    })
  }
  let next = ws.model.connections.length + 1
  const usedConnections = new Set(ws.model.connections.map((c) => c.id))
  const connections: Connection[] = diagram.relationships.flatMap((r) => {
    const [from, to] = [ids.get(r.from)!, ids.get(r.to)!]
    if (from === to) return []
    while (usedConnections.has(`c${next}`)) next++
    const id = `c${next++}`
    usedConnections.add(id)
    return [
      {
        id,
        from,
        to,
        ...(r.label !== undefined && { label: r.label }),
        ...(r.technology !== undefined && { technology: r.technology }),
        ...(r.colour !== undefined && { colour: r.colour }),
      },
    ]
  })

  let result: Workspace = {
    model: { objects: [...ws.model.objects, ...objects], connections: [...ws.model.connections, ...connections] },
    views: ws.views,
  }
  const byNew = new Map([...ids].map(([file, id]) => [id, file]))
  const show = (onView: View, wanted: (id: string) => Point | undefined, only?: string) => {
    let shown = onView
    for (const object of objects) {
      if ((only !== undefined && object.parent !== only) || !landsOn(result, shown, object)) continue
      const at = wanted(object.id)
      shown = place(shown, object.id, at && isFree(shown, at) ? at : undefined)
    }
    const added = connections
      .filter((c) => isPlaced(shown, c.from) && isPlaced(shown, c.to))
      .map((c) => c.id)
    return { ...shown, connections: [...shown.connections, ...added] }
  }
  result = { ...result, views: replaceView(result, show(view, (id) => places[byNew.get(id) ?? ''])) }
  // Every new box that has something inside gets its diagram, with those cards on it.
  const holders = [
    ...(ownFrame && frame !== undefined ? [frame] : []),
    ...diagram.elements.filter((element) => diagram.elements.some((other) => other.inside === element.id)).map((element) => ids.get(element.id)!),
  ]
  for (const holder of holders) {
    result = ensureViewInside(result, holder)
    const inside = findViewInside(result, holder)
    if (inside) result = { ...result, views: replaceView(result, show(inside, () => undefined, holder)) }
  }
  return result
}

export function serializeWorkspace(ws: Workspace): string {
  return JSON.stringify(ws)
}

/**
 * A saved workspace with cards on a diagram that may not show them (a version of the editor put
 * containers of another system on a Container diagram, 2026-11-25) is taken without them, and
 * without the connectors that then have an end missing, instead of being refused as a whole.
 */
function mended(ws: Workspace): Workspace {
  const objects = new Map(ws.model.objects.map((object) => [object.id, object]))
  const views = ws.views.map((view) => {
    const scopeKnown = view.scope === undefined || objects.has(view.scope)
    const wrong = Object.keys(view.positions).filter((id) => {
      const object = objects.get(id)
      return object !== undefined && scopeKnown && !canShow(ws, view, object)
    })
    // Frames made before 2026-11-25 could hold cards from outside the box: taken without them.
    const outside = (view.groups ?? []).flatMap((group) => (Array.isArray(group?.members) ? group.members : [])).filter(
      (id) => scopeKnown && view.scope !== undefined && objects.has(id) && !isWithin(ws, view, id),
    )
    if (wrong.length === 0 && outside.length === 0) return view
    if (wrong.length === 0) return withGroups(view, without(view.groups ?? [], new Set(outside)))
    const positions = Object.fromEntries(Object.entries(view.positions).filter(([id]) => !wrong.includes(id)))
    const { sizes: oldSizes, ...rest } = view
    const sizes = Object.entries(oldSizes ?? {}).filter(([id]) => !wrong.includes(id))
    const connections = view.connections.filter((id) => {
      const connection = ws.model.connections.find((c) => c.id === id)
      return !connection || (!wrong.includes(connection.from) && !wrong.includes(connection.to))
    })
    const kept = { ...rest, positions, connections, ...(sizes.length > 0 && { sizes: Object.fromEntries(sizes) }) }
    return withGroups(kept, without(view.groups ?? [], new Set([...wrong, ...outside])))
  })
  return views.every((view, i) => view === ws.views[i]) ? ws : { ...ws, views }
}

export function parseWorkspace(text: string): Workspace {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new DiagramFormatError('Not a workspace: invalid JSON')
  }
  const isShaped =
    isObject(value) &&
    isObject(value.model) &&
    Array.isArray(value.model.objects) &&
    Array.isArray(value.model.connections) &&
    Array.isArray(value.views) &&
    value.views.every(
      (view) =>
        isObject(view) &&
        isObject(view.positions) &&
        Array.isArray(view.connections) &&
        (view.sizes === undefined || isObject(view.sizes)),
    )
  if (!isShaped) throw new DiagramFormatError('Not a workspace')
  const ws = mended(upgrade(value as unknown as Workspace))
  validateWorkspace(ws)
  return ws
}

/**
 * A workspace saved by an earlier version:
 * - until 2026-11-21 the start view was saved with the id `context`;
 * - until 2026-11-25 a card carried up to six icons: the first is kept;
 * - until 2026-11-25 a view had a C4 level, and a software system had a System Context view
 *   besides the view inside it. Levels are dropped, and so are those views: an object has one
 *   view, the one that looks inside it.
 */
function upgrade(ws: Workspace): Workspace {
  const views = (ws.views as (View & { level?: string })[])
    .filter((view) => !(view.level === 'context' && view.scope !== undefined))
    .map(({ level, ...view }) =>
      view.id === 'context' && level === 'context' && view.scope === undefined ? { ...view, id: ROOT_VIEW_ID } : view,
    )
  const objects = ws.model.objects.map((object) =>
    Array.isArray(object.icons) && object.icons.length > MAX_ICONS ? { ...object, icons: object.icons.slice(0, MAX_ICONS) } : object,
  )
  return { model: { ...ws.model, objects }, views }
}

export function validateWorkspace(ws: Workspace): void {
  const objects = new Map<string, ModelObject>()
  for (const object of ws.model.objects) {
    if (typeof object.id !== 'string' || !ELEMENT_ID.test(object.id)) {
      throw new DiagramFormatError(`Invalid object id: ${JSON.stringify(object.id)}`)
    }
    if (objects.has(object.id)) throw new DiagramFormatError(`Duplicate object id: ${object.id}`)
    if (!KINDS.includes(object.kind)) {
      throw new DiagramFormatError(`Object ${object.id} has an unknown kind: ${object.kind}`)
    }
    objects.set(object.id, object)
  }
  for (const object of ws.model.objects) {
    const parent = object.parent === undefined ? undefined : objects.get(object.parent)
    if (object.parent !== undefined && !parent) {
      throw new DiagramFormatError(`Object ${object.id} has an unknown parent: ${object.parent}`)
    }
    // An object is inside itself by no way round.
    const above = new Set<string>()
    for (let at = object.parent; at !== undefined; at = objects.get(at)?.parent) {
      if (at === object.id || above.has(at)) throw new DiagramFormatError(`Object ${object.id} is inside itself`)
      above.add(at)
    }
    if (!hasTechnology(object.kind) && object.technology !== undefined) {
      throw new DiagramFormatError(`A ${object.kind} has no technology: ${object.id}`)
    }
    if (object.icons !== undefined) {
      const icons = object.icons
      const fine =
        Array.isArray(icons) &&
        icons.length > 0 &&
        icons.length <= MAX_ICONS &&
        new Set(icons).size === icons.length &&
        icons.every((icon) => typeof icon === 'string' && ICON_NAME.test(icon))
      if (!fine) throw new Error(`Object "${object.id}" has icons that are not icon names`)
    }
    if (!canBeExternal(object.kind) && object.external !== undefined) {
      throw new DiagramFormatError(`A ${object.kind} cannot be external: ${object.id}`)
    }
    if (object.shape !== undefined) {
      if (!isBoxShape(object.shape)) throw new DiagramFormatError(`Object ${object.id} has an unknown shape: ${String(object.shape)}`)
      if (!canHaveShape(object.kind)) throw new DiagramFormatError(`A ${object.kind} has no shape of its own to choose: ${object.id}`)
    }
    if (object.columns !== undefined) {
      if (object.shape !== 'table') throw new DiagramFormatError(`Object ${object.id} has columns but is no table`)
      const problem = columnsProblem(object.columns)
      if (problem) throw new DiagramFormatError(`Object ${object.id}: ${problem} (columns)`)
    }
  }

  const connections = new Map<string, Connection>()
  for (const connection of ws.model.connections) {
    if (connections.has(connection.id)) {
      throw new DiagramFormatError(`Duplicate connection id: ${connection.id}`)
    }
    if (!objects.has(connection.from) || !objects.has(connection.to)) {
      throw new DiagramFormatError(`Connection ${connection.id} refers to an unknown object`)
    }
    if (connection.colour !== undefined && !isLineColour(connection.colour)) {
      throw new DiagramFormatError(`Connection ${connection.id} has an unknown colour: ${String(connection.colour)}`)
    }
    connections.set(connection.id, connection)
  }

  if (ws.views.length === 0) throw new DiagramFormatError('A workspace needs at least one view')
  const views = new Set<string>()
  for (const view of ws.views) {
    if (views.has(view.id)) throw new DiagramFormatError(`Duplicate view id: ${view.id}`)
    views.add(view.id)
    const scope = view.scope === undefined ? undefined : objects.get(view.scope)
    if (view.scope !== undefined && !scope) {
      throw new DiagramFormatError(`View ${view.id} has an unknown scope: ${view.scope}`)
    }
    // The Overview looks inside nothing; every other view looks inside an object.
    if (view.id === ROOT_VIEW_ID && view.scope !== undefined) {
      throw new DiagramFormatError('The Overview looks inside an object')
    }
    if (view.id !== ROOT_VIEW_ID && view.scope === undefined && view.name === undefined && ws.views.length > 1) {
      throw new DiagramFormatError(`View ${view.id} looks inside nothing`)
    }
    if (view.name !== undefined && (typeof view.name !== 'string' || view.name.trim() === '')) {
      throw new DiagramFormatError(`View ${view.id} has an invalid name`)
    }
    if (view.id === ROOT_VIEW_ID && view.name !== undefined) throw new DiagramFormatError('The Overview has no name of its own')
    if (view.name === undefined && ws.views.some((v) => v !== view && v.scope === view.scope && v.name === undefined)) {
      throw new DiagramFormatError(`${view.scope ?? 'The Overview'} has more than one first view`)
    }
    for (const [id, point] of Object.entries(view.positions)) {
      const object = objects.get(id)
      if (!object) throw new DiagramFormatError(`View ${view.id} places an unknown object: ${id}`)
      if (!canShow(ws, view, object)) {
        throw new DiagramFormatError(`View ${view.id} must not show ${id}`)
      }
      if (!isObject(point) || typeof point.x !== 'number' || typeof point.y !== 'number') {
        throw new DiagramFormatError(`View ${view.id} has an invalid position for ${id}`)
      }
    }
    if (view.sizes !== undefined && !isObject(view.sizes)) {
      throw new DiagramFormatError(`View ${view.id} has invalid sizes`)
    }
    for (const [id, size] of Object.entries(view.sizes ?? {})) {
      if (!isPlaced(view, id)) {
        throw new DiagramFormatError(`View ${view.id} has a size for an object it does not show: ${id}`)
      }
      if (!isSize(size)) throw new DiagramFormatError(`View ${view.id} has an invalid size for ${id}`)
    }
    if (view.groups !== undefined && (!Array.isArray(view.groups) || view.groups.length === 0)) {
      throw new DiagramFormatError(`View ${view.id} has invalid groups`)
    }
    const grouped = new Set<string>()
    const groupIds = new Set<string>()
    for (const group of view.groups ?? []) {
      if (!isObject(group) || typeof group.id !== 'string' || !Array.isArray(group.members)) {
        throw new DiagramFormatError(`View ${view.id} has an invalid group`)
      }
      if (groupIds.has(group.id)) throw new DiagramFormatError(`View ${view.id} has two groups with the id ${group.id}`)
      groupIds.add(group.id)
      if (typeof group.name !== 'string' || group.name.trim() === '') {
        throw new DiagramFormatError(`View ${view.id} has a group without a name`)
      }
      if (group.type !== undefined && (typeof group.type !== 'string' || group.type.trim() === '')) {
        throw new DiagramFormatError(`View ${view.id} has a group with an invalid type`)
      }
      if (group.members.length === 0) throw new DiagramFormatError(`View ${view.id} has a group without cards`)
      for (const id of group.members) {
        if (typeof id !== 'string' || !isPlaced(view, id)) {
          throw new DiagramFormatError(`View ${view.id} groups a card it does not show: ${String(id)}`)
        }
        if (view.scope !== undefined && !isWithin(ws, view, id)) {
          throw new DiagramFormatError(`View ${view.id} groups a card from outside its box: ${id}`)
        }
        if (grouped.has(id)) throw new DiagramFormatError(`View ${view.id} has ${id} in two groups`)
        grouped.add(id)
      }
    }
    for (const id of view.connections) {
      const connection = connections.get(id)
      if (!connection) throw new DiagramFormatError(`View ${view.id} shows an unknown connection: ${id}`)
      if (!isPlaced(view, connection.from) || !isPlaced(view, connection.to)) {
        throw new DiagramFormatError(`View ${view.id} shows connection ${id} without both its ends`)
      }
    }
  }
}

function findView(ws: Workspace, viewId: string): View | undefined {
  return ws.views.find((v) => v.id === viewId)
}

/** An object and the objects it lives inside, nearest first. Empty for an unknown id. */
function ancestors(ws: Workspace, objectId: string | undefined): ModelObject[] {
  const chain: ModelObject[] = []
  for (let id = objectId; id !== undefined; ) {
    const object = ws.model.objects.find((o) => o.id === id)
    if (!object) break
    chain.push(object)
    id = object.parent
  }
  return chain
}

/**
 * Whether a card at `position` keeps the gap to every other card on the view. `except` is the
 * card being moved: it does not get in its own way, and brings its own size; a new card is `CARD`.
 */
function isFree(view: View, position: Point, except?: string, ofSize?: Size): boolean {
  const size = ofSize ?? (except === undefined ? CARD : cardSize(view, except))
  return Object.entries(view.positions).every(
    ([id, other]) => id === except || apart(position, size, other, cardSize(view, id)),
  )
}

/** Whether two cards neither overlap nor come closer than `CARD_GAP`. */
function apart(a: Point, aSize: Size, b: Point, bSize: Size): boolean {
  return (
    a.x >= b.x + bSize.width + CARD_GAP ||
    a.x + aSize.width + CARD_GAP <= b.x ||
    a.y >= b.y + bSize.height + CARD_GAP ||
    a.y + aSize.height + CARD_GAP <= b.y
  )
}

function isSize(value: unknown): value is Size {
  return (
    isObject(value) &&
    typeof value.width === 'number' &&
    typeof value.height === 'number' &&
    Number.isFinite(value.width) &&
    Number.isFinite(value.height) &&
    value.width > 0 &&
    value.height > 0
  )
}

/** The first of the wanted places, counting up from `start`, that is free on the view. */
function firstFree(view: View, wanted: (index: number) => Point, start = 0, size?: Size): Point {
  for (let index = start; ; index++) {
    const position = wanted(index)
    if (isFree(view, position, undefined, size)) return position
  }
}

/** The place a new card is wanted at, if it is a place and free. */
function wantedPlace(view: View, at: Point | undefined, size?: Size): Point | undefined {
  if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return undefined
  return isFree(view, at, undefined, size) ? { x: at.x, y: at.y } : undefined
}

/** Put an object on a view: at the wanted places in turn, by default the grid, until one is free. */
function place(view: View, objectId: string, position?: Point, size?: Size): View {
  const free = position ?? firstFree(view, gridSlot, Object.keys(view.positions).length, size)
  const placed = { ...view, positions: { ...view.positions, [objectId]: free } }
  return size ? withSize(placed, objectId, size) : placed
}

/** A view with the size of one card set: kept only when it is not `CARD`. */
function withSize(view: View, objectId: string, size: Size): View {
  const { sizes: old, ...rest } = view
  const sizes = { ...old }
  if (size.width === CARD.width && size.height === CARD.height) delete sizes[objectId]
  else sizes[objectId] = { width: size.width, height: size.height }
  return { ...rest, ...(Object.keys(sizes).length > 0 && { sizes }) }
}

function replaceView(ws: Workspace, view: View): View[] {
  return ws.views.map((v) => (v.id === view.id ? view : v))
}

// `hasOwn`, because an id such as `constructor` would otherwise be found on every object.
function isPlaced(view: View, objectId: string): boolean {
  return Object.hasOwn(view.positions, objectId)
}

function uniqueId(name: string, taken: Set<string>): string {
  let base = name.replace(/[^A-Za-z0-9_]/g, '') || 'element'
  if (/^[0-9]/.test(base)) base = `_${base}`
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}${n}`
  return id
}

const COLUMNS = 4

function gridSlot(index: number): Point {
  return { x: 40 + (index % COLUMNS) * 320, y: 40 + Math.floor(index / COLUMNS) * 180 }
}

function withLabel(connection: Connection, label: string | undefined): Connection {
  const { label: _old, ...rest } = connection
  const trimmed = label?.trim()
  return trimmed ? { ...rest, label: trimmed } : rest
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
