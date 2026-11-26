<script setup lang="ts">
import { computed, markRaw, provide, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useEventListener } from '@vueuse/core'
import {
  CopyPlusIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  LoaderCircleIcon,
  Redo2Icon,
  Trash2Icon,
  GroupIcon,
  XIcon,
  UngroupIcon,
  Undo2Icon,
} from '@lucide/vue'
import { Background, EdgeLabelRenderer, MarkerType, MiniMap, Panel, VueFlow } from '@xyflow/vue'
import type { Connection, NodeDragEvent } from '@xyflow/vue'
import '@xyflow/vue/style.css'
import {
  CARD_GAP,
  FRAME,
  GROUP_FRAME,
  ROOT_VIEW_ID,
  boxesAround,
  connectable,
  groupable,
  breadcrumb,
  cardSize,
  describeEvent,
  diagramOfView,
  drillDown,
  eventView,
  fitsOnView,
  openView,
  liftedConnections,
  placeableObjects,
  viewTitle,
  viewsOf,
} from '@drillgram/model'
import type { BoxShape, Diagram, ElementKind, Point, Size, WorkspaceEvent } from '@drillgram/model'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import AddObjectForm from './AddObjectForm.vue'
import AppHeader from './AppHeader.vue'
import ExistingObjectPicker from './ExistingObjectPicker.vue'
import ClearWorkspace from './ClearWorkspace.vue'
import ExportMenu from './ExportMenu.vue'
import ImportMenu from './ImportMenu.vue'
import HistoryPanel from './HistoryPanel.vue'
import IconPicker from './IconPicker.vue'
import ObjectSearch from './ObjectSearch.vue'
import ShapePicker from './ShapePicker.vue'
import TourGuide from './TourGuide.vue'
import ViewTabs from './ViewTabs.vue'
import GroupForm from './GroupForm.vue'
import type { Found } from './ObjectSearch.vue'
import CanvasControls from './canvas/CanvasControls.vue'
import CanvasKey from './canvas/CanvasKey.vue'
import CanvasQuickMenu from './canvas/CanvasQuickMenu.vue'
import type { QuickMenuItem } from './canvas/CanvasQuickMenu.vue'
import ConnectionEdgeView from './canvas/ConnectionEdge.vue'
import ObjectNodeView from './canvas/ObjectNode.vue'
import { gapsFor, guidesFor } from './canvas/alignment'
import { besideTheirCards } from './canvas/besideFrame'
import type { ColumnRow } from './canvas/columns'
import type { Guide } from './canvas/alignment'
import { CARD, elbow } from './canvas/geometry'
import type { Box } from './canvas/geometry'
import { joins, routePath } from './canvas/routePath'
import { nearestPlace, placeBlock } from './canvas/blockPlace'
import { cardRoom } from './canvas/cardRoom'
import { languageIcon } from './canvas/codeLanguages'
import { clearErrors, showError } from '../composables/useErrors'
import { KIND_ICON, KIND_LABEL } from './canvas/kinds'
import { labelSize } from './canvas/labelSize'
import { CANVAS_ACTIONS, CANVAS_DRAG, CANVAS_FADED } from './canvas/types'
import type { ConnectionEdge, ObjectNode } from './canvas/types'
import { arrangeInBackground, useLayoutEngine } from '../composables/useLayoutEngine'
import type { Scene, SceneConnector } from '../export/svg'
import { useWorkspaceStore } from '../composables/useWorkspaceStore'
import { failureText } from '../lib/api'
import { BROUGHT_KEY, localHistory } from '../lib/localWorkspace'
import { viewPath } from '../router'
import { TOUR_BOX } from '../tour/steps'
import type { TourScene } from '../tour/steps'

/** The view to show, from the address; the Overview when absent or unknown. */
const props = defineProps<{ viewId?: string }>()

/**
 * The shapes "Add shape" offers, on every diagram alike: a box of any kind may stand anywhere, in
 * any other box. C4's elements are shapes like the plain box; no kind says what lives in what.
 */
const KINDS: ElementKind[] = ['box', 'person', 'softwareSystem', 'container', 'component', 'code']

// Every change goes through `dispatch`, which logs it: that is what undo, redo and the timeline
// step through.
const store = useWorkspaceStore()
const { dispatch, history } = store
const router = useRouter()

// What is on screen: the workspace with the view of the address opened, that is created the first
// time and filled from the model where C4 defines its content (the Overview, System Context).
// Opening is no change and is not saved; `applyEvent` opens the view of a change the same way.
const workspace = computed(() => openView(store.workspace.value, props.viewId ?? ROOT_VIEW_ID))

// The diagram on screen: one view of the model.
const view = computed(() => {
  const views = workspace.value.views
  return views.find((v) => v.id === props.viewId) ?? views.find((v) => v.id === ROOT_VIEW_ID)!
})
const viewId = computed(() => view.value.id)
const kinds = computed(() => KINDS)
const trail = computed(() => breadcrumb(workspace.value, viewId.value))
const title = computed(() => viewTitle(workspace.value, viewId.value))

// Views: the box that is open can have several, each with its own cards and layout. The tabs
// beside the title go from one to the other; every view has its own address.
const views = computed(() => viewsOf(workspace.value, viewId.value).map((v) => ({ ...v, to: viewPath(v.id, ROOT_VIEW_ID) })))
/** The box the views are of, as the first view is titled: the same on every view of it. */
const boxTitle = computed(() => viewTitle(workspace.value, views.value[0]?.id ?? viewId.value))

function addView(name: string, copy: boolean) {
  const before = new Set(workspace.value.views.map((v) => v.id))
  dispatch({ type: 'viewAdded', view: viewId.value, name, copy })
  const made = workspace.value.views.find((v) => !before.has(v.id))
  if (made) router.push(viewPath(made.id, ROOT_VIEW_ID))
}

function renameView(id: string, name: string) {
  dispatch({ type: 'viewRenamed', view: id, name })
}

/** A deleted view leaves for the first view of its box. One undo brings it back. */
function removeView(id: string) {
  // Asked before the change: afterwards the view on screen is no longer this one.
  const [first, open] = [views.value[0]?.id ?? ROOT_VIEW_ID, viewId.value]
  dispatch({ type: 'viewRemoved', view: id })
  if (id === open) router.replace(viewPath(first, ROOT_VIEW_ID))
}

/** Open an object: the diagram that looks inside it. Any box can be opened. */
function open(objectId: string) {
  const opened = drillDown(workspace.value, viewId.value, objectId)
  if (opened) router.push(viewPath(opened.viewId, ROOT_VIEW_ID))
}

// Adding a shape: pick it, then say what it is: its name, what it
// does, its technology (containers and components) and whether it is ours (people and systems).
const addingKind = ref<ElementKind | null>(null)
const newName = ref('')
const newDetails = ref<{ description: string; technology: string; external: boolean; shape: BoxShape | ''; columns: ColumnRow[] }>({ description: '', technology: '', external: false, shape: '', columns: [] })

/** Where the next card is wanted: the point the quick menu was opened at. The usual place without. */
const addingAt = ref<Point>()

function startAdding(kind: ElementKind, at?: Point, technology = '', shape: BoxShape | '' = '') {
  if (!at) floatAt.value = undefined
  addingKind.value = kind
  addingAt.value = at
  newName.value = ''
  // Code starts as Go's most usual thing unless a language was picked: the form says which.
  newDetails.value = { description: '', technology: technology || (kind === 'code' ? 'Go struct' : ''), external: false, shape, columns: [] }
}

/** The card that was just put on the diagram, so the canvas can bring it into view. */
const added = ref<{ id: string }>()
/** The cards to select when the cards are next rebuilt: the ones just added. */
let selectNext: string[] | undefined

/** Make a change that puts one more object on the view, and remember which one. */
function addToView(event: WorkspaceEvent) {
  const before = new Set(Object.keys(view.value.positions))
  dispatch(event)
  const id = Object.keys(view.value.positions).find((key) => !before.has(key))
  if (!id) return
  added.value = { id }
  // A new card is the selected one: what comes next (connect, move, delete) is about it.
  selectNext = [id]
}

/**
 * Copy cards of the diagram, all in one change: each copy beside its first, on the free place
 * nearest to its right, and the copies are the selection afterwards.
 */
function copyCards(ids: readonly string[]) {
  const taken: Box[] = []
  const copies = ids
    .filter((id) => Object.hasOwn(view.value.positions, id))
    .map((object) => {
      const size = cardSize(view.value, object)
      const from = view.value.positions[object]!
      const at = freePlaceNear({ x: from.x + size.width + 3 * SNAP_GRID, y: from.y }, size, taken)
      taken.push({ ...at, ...size })
      return { object, at }
    })
  if (copies.length === 0) return
  const before = new Set(Object.keys(view.value.positions))
  dispatch({ type: 'objectsCopied', view: viewId.value, copies })
  const made = Object.keys(view.value.positions).filter((key) => !before.has(key))
  if (made.length === 0) return
  selectNext = made
  added.value = { id: made.at(-1)! }
  rebuildNodes()
}

// Search: every object of the model, by a part of its name. Picking one opens a diagram it is on
// (the open one if it is there) and selects it, which also brings it into view.
const searching = ref(false)
/** The diagram to go to for an object: the open one if it is on it, else the first that has it. */
function viewShowing(objectId: string): string | undefined {
  if (Object.hasOwn(view.value.positions, objectId)) return viewId.value
  return workspace.value.views.find((v) => Object.hasOwn(v.positions, objectId))?.id
}
const searchable = computed<Found[]>(() =>
  workspace.value.model.objects.flatMap((object) => {
    const on = viewShowing(object.id)
    if (on === undefined) return []
    const where = on === viewId.value ? undefined : viewTitle(workspace.value, on)
    return [{ id: object.id, name: object.name, kind: object.kind, where }]
  }),
)

/** The card the search went to: the canvas brings it to its middle. */
const found = ref<{ id: string }>()

function goTo(objectId: string) {
  const on = viewShowing(objectId)
  if (on === undefined) return
  selectNext = [objectId]
  found.value = { id: objectId }
  if (on === viewId.value) rebuildNodes()
  else router.push(viewPath(on, ROOT_VIEW_ID))
}

// The quick menu: a right-click on the empty canvas offers what the toolbar adds, around the
// pointer, and the new card lands there, its middle on the point.
const quickMenuAt = ref<Point>()
const quickMenuItems = computed<QuickMenuItem[]>(() => [
  ...kinds.value.map((kind) => ({
    key: kind,
    label: `Add ${KIND_LABEL[kind]}`,
    icon: KIND_ICON[kind],
    tint: `var(--kind-${kind})`,
  })),
  { key: 'existing', label: 'Add existing object', icon: CopyPlusIcon, disabled: existing.value.length === 0 },
])

/**
 * Where on the screen the form or the list of what the quick menu started floats: at the point
 * the ring was opened. Without it they are in the toolbar.
 */
const floatAt = ref<Point>()
/** Room the floating panel needs, so it never leaves the window. */
const FLOAT = { width: 340, height: 300 }
const floatStyle = computed(() => {
  const at = floatAt.value
  if (!at) return undefined
  const within = (value: number, room: number) => Math.max(8, Math.min(value, room - 8))
  return {
    left: `${within(at.x - FLOAT.width / 2, window.innerWidth - FLOAT.width)}px`,
    top: `${within(at.y - 28, window.innerHeight - FLOAT.height)}px`,
  }
})

/** Leave the form or the list without adding anything. */
function stopAdding() {
  addingKind.value = null
  pickingExisting.value = false
  addingAt.value = undefined
  floatAt.value = undefined
}

function onQuickMenuPick(key: string, at: Point) {
  floatAt.value = quickMenuAt.value
  quickMenuAt.value = undefined
  const corner = freePlaceNear({ x: at.x - CARD.width / 2, y: at.y - CARD.height / 2 })
  if (key === 'existing') {
    addingAt.value = corner
    pickingExisting.value = true
  } else {
    startAdding(key as ElementKind, corner)
  }
}

/** Fill an empty workspace with the made-up bookshop, to have something to look at. */
function loadExample() {
  dispatch({ type: 'exampleLoaded' })
  // Far too big for the screen at full size: asking for its last card makes the canvas fit it all.
  const last = Object.keys(view.value.positions).at(-1)
  if (last) added.value = { id: last }
}

// What this browser kept from before the app had a server (lib/localWorkspace.ts): offered on a
// workspace nothing was done in yet, until it was brought once.
const kept = shallowRef(window.localStorage.getItem(BROUGHT_KEY) === null ? localHistory() : undefined)
function bringKept() {
  if (!kept.value) return
  store.bring(kept.value)
  window.localStorage.setItem(BROUGHT_KEY, new Date().toISOString())
  kept.value = undefined
}

function commitAdding() {
  const kind = addingKind.value
  if (kind) {
    const details = { ...newDetails.value }
    // The card is as tall as its text needs (Markdown): measured here, kept with the change.
    const room = cardRoom({ name: newName.value, kind, ...details, icons: 0 })
    const size = room === CARD ? undefined : room
    const at = addingAt.value && size ? freePlaceNear(addingAt.value, size) : addingAt.value
    addToView({ type: 'objectAdded', view: viewId.value, kind, name: newName.value, details, at, ...(size && { size }) })
  }
  stopAdding()
}

// Adding an object that is already in the model: pick it from a list.
const pickingExisting = ref(false)
// Every object of the model that is not here yet, from any depth, and where each is from: the
// Overview first, then box by box as they come.
const existing = computed(() => {
  const all = placeableObjects(workspace.value, viewId.value).map((object) => {
    const around = boxesAround(workspace.value, object.id).map((box) => box.name)
    return { ...object, where: around.length === 0 ? 'Overview' : `Inside ${around.join(' › ')}` }
  })
  return [...all.filter((object) => object.where === 'Overview'), ...all.filter((object) => object.where !== 'Overview')]
})

function placeExisting(objectId: string) {
  addToView({ type: 'objectPlaced', view: viewId.value, object: objectId, at: addingAt.value })
  stopAdding()
}

// Icons: the picker floats at the corner of the card it was opened from. Every press in it is
// one change: the object's icons, all of them.
const iconsOf = ref<{ id: string; at: Point }>()
const iconsAttached = computed(
  () => workspace.value.model.objects.find((object) => object.id === iconsOf.value?.id)?.icons ?? [],
)
const iconsStyle = computed(() => {
  const at = iconsOf.value?.at
  if (!at) return undefined
  const [width, height] = [360, 430]
  const within = (value: number, room: number) => Math.max(8, Math.min(value, room - 8))
  return {
    left: `${within(at.x + 8, window.innerWidth - width)}px`,
    top: `${within(at.y - 40, window.innerHeight - height)}px`,
  }
})
watch(viewId, () => {
  iconsOf.value = undefined
  editing.value = undefined
})

// Connecting: drag from an object's handle onto another object, then type the label on the line.
/** Id of the connection whose label is being typed. */
const labelling = ref<string | null>(null)
const newLabel = ref('')
const newTechnology = ref('')

function onConnect(connection: Connection) {
  // Refused: say why at once, a drag that ends in nothing looks like a fault.
  if (!connectable(workspace.value, viewId.value, connection.source, connection.target)) {
    if (framed.value && connection.source !== connection.target) {
      showError('Cards outside the frame are connected on a diagram they are on, not here.')
    }
    return
  }
  const before = view.value.connections.length
  dispatch({ type: 'connected', view: viewId.value, from: connection.source, to: connection.target })
  if (view.value.connections.length === before) return
  labelling.value = view.value.connections.at(-1) ?? null
  newLabel.value = ''
  newTechnology.value = ''
}

// A double-click on a connector opens its label as it is, to change it or to delete the
// connector. The first click makes Vue Flow draw the label again, so the second one can land
// on the canvas behind it: the double-click counts for the connector the first click was on.
let clickedEdge: { id: string; x: number; y: number; at: number } | undefined

function onCanvasClick(event: MouseEvent) {
  const id = (event.target as Element).closest?.('.vue-flow__edge')?.getAttribute('data-id')
  if (id) clickedEdge = { id, x: event.clientX, y: event.clientY, at: event.timeStamp }
}

function onCanvasDoubleClick(event: MouseEvent) {
  const first = clickedEdge
  clickedEdge = undefined
  if (!first || event.timeStamp - first.at > 600) return
  if (Math.hypot(event.clientX - first.x, event.clientY - first.y) > 8) return
  const connection = workspace.value.model.connections.find((c) => c.id === first.id)
  if (!connection) return
  newLabel.value = connection.label ?? ''
  newTechnology.value = connection.technology ?? ''
  labelling.value = connection.id
}

// Editing a card: the form it was made with, filled with what it says now, floating at its
// corner. Saving is one change.
const editing = ref<{ id: string; kind: ElementKind; at: Point }>()
const editName = ref('')
const editDetails = ref<{ description: string; technology: string; external: boolean; shape: BoxShape | ''; columns: ColumnRow[] }>({ description: '', technology: '', external: false, shape: '', columns: [] })

function startEditing(objectId: string, at: Point) {
  const object = workspace.value.model.objects.find((o) => o.id === objectId)
  if (!object) return
  editName.value = object.name
  editDetails.value = {
    description: object.description ?? '',
    technology: object.technology ?? '',
    external: object.external === true,
    shape: object.shape ?? '',
    columns: (object.columns ?? []).map((column) => ({ name: column.name, type: column.type ?? '', key: column.key ?? '' })),
  }
  editing.value = { id: objectId, kind: object.kind, at }
}

function commitEditing() {
  const now = editing.value
  editing.value = undefined
  if (now) saveEdit(now.id, editName.value, { ...editDetails.value })
}

/** Change what a card says, as one change, and with it the room the card has for its text. */
function saveEdit(objectId: string, name: string, details: { description: string; technology?: string; external?: boolean; shape?: BoxShape | ''; columns?: ColumnRow[] }) {
  const now = { id: objectId }
  const object = workspace.value.model.objects.find((o) => o.id === now.id)
  // Another text needs another room: the card grows or shrinks with it, on this diagram, and
  // moves to the nearest free place where it would otherwise reach into another card.
  let card: { view: string; size: Size; to?: Point } | undefined
  // A table's rows are text of the card too, and a card that becomes or stops being a table
  // is laid out another way.
  const shape = details.shape ?? object?.shape
  const rowsChanged = shape === 'table' || object?.shape === 'table'
  if (object && Object.hasOwn(view.value.positions, now.id) && ((object.description ?? '') !== details.description.trim() || rowsChanged)) {
    const size = cardRoom({
      columns: details.columns ?? object.columns,
      name,
      kind: object.kind,
      technology: details.technology ?? object.technology,
      external: details.external ?? object.external,
      description: details.description,
      icons: object.icons?.length ?? 0,
      shape: details.shape ?? object.shape,
    })
    const before = cardSize(view.value, now.id)
    if (size.width !== before.width || size.height !== before.height) {
      card = { view: viewId.value, size, to: placeForSize(now.id, size) }
    }
  }
  dispatch({ type: 'objectEdited', object: now.id, name, details, ...(card && { card }) })
}

/** Where a card stands with another size: where it is if it keeps its gap there, else the nearest free place. */
function placeForSize(objectId: string, size: Size): Point | undefined {
  const here = view.value.positions[objectId]
  if (!here || !engine.value) return undefined
  try {
    const { x, y } = engine.value.snap({
      cards: Object.entries(view.value.positions).map(([id, p]) => ({ id, ...p, ...(id === objectId ? size : cardSize(view.value, id)) })),
      connections: [],
      moving: objectId,
      wanted: here,
      cellSize: SNAP_GRID,
    })
    return { x, y }
  } catch (error) {
    console.warn('The layout engine could not place the larger card:', error)
    return undefined
  }
}
const editStyle = computed(() => {
  const at = editing.value?.at
  if (!at) return undefined
  const within = (value: number, room: number) => Math.max(8, Math.min(value, room - 8))
  return {
    left: `${within(at.x + 8, window.innerWidth - FLOAT.width)}px`,
    top: `${within(at.y - 60, window.innerHeight - FLOAT.height)}px`,
  }
})

function commitLabel() {
  if (labelling.value !== null) {
    dispatch({
      type: 'connectionLabelled',
      connection: labelling.value,
      label: newLabel.value,
      technology: newTechnology.value,
    })
  }
  labelling.value = null
}

provide(CANVAS_ACTIONS, {
  open,
  rename: (objectId, name) => dispatch({ type: 'objectRenamed', object: objectId, name }),
  pickIcons: (objectId, at) => (iconsOf.value = { id: objectId, at }),
  edit: startEditing,
  copy: (objectId) => copyCards([objectId]),
  describe: (objectId, text) => {
    const object = workspace.value.model.objects.find((o) => o.id === objectId)
    if (object) saveEdit(objectId, object.name, { description: text })
  },
  removeLabelled: () => {
    if (labelling.value !== null) dispatch({ type: 'connectionsRemoved', connections: [labelling.value] })
    labelling.value = null
  },
  newLabel,
  newTechnology,
  commitLabel,
  cancelLabel: () => (labelling.value = null),
  labelColour: computed(() => workspace.value.model.connections.find((c) => c.id === labelling.value)?.colour),
  // At once, as a change of its own: the form stays open for the label.
  setColour: (colour) => {
    if (labelling.value !== null) dispatch({ type: 'connectionColoured', connection: labelling.value, ...(colour && { colour }) })
  },
})

// Drawing: Vue Flow owns pan, zoom, selection and dragging. The workspace stays the truth: nodes
// are rebuilt from it, and a finished drag is written back to it.
const nodeTypes = { object: markRaw(ObjectNodeView) }
const edgeTypes = { connection: markRaw(ConnectionEdgeView) }

const nodes = ref<ObjectNode[]>([])
// Selecting several: a click with Ctrl or Cmd adds a card (either key, on any system), and a
// frame drawn on the canvas with Shift held takes the cards inside it (Vue Flow's default).
const ALSO_SELECT = ['Meta', 'Control']

function rebuildNodes() {
  const selected = new Set(selectNext ?? nodes.value.filter((n) => n.selected).map((n) => n.id))
  selectNext = undefined
  nodes.value = workspace.value.model.objects
    .filter((object) => Object.hasOwn(view.value.positions, object.id))
    .map((object) => ({
      id: object.id,
      type: 'object',
      position: { ...view.value.positions[object.id]! },
      // A known size: Vue Flow need not measure the card before it shows it. Most cards are
      // CARD; one that "Arrange" made larger for its connections has its own.
      ...cardSize(view.value, object.id),
      selected: selected.has(object.id),
      ariaLabel: object.name,
      data: {
        name: object.name,
        kind: object.kind,
        description: object.description,
        technology: object.technology,
        external: object.external === true,
        shape: object.shape,
        columns: object.columns,
        opens: true,
        // A code element without an icon of its own shows its language's.
        icons: object.icons ?? (object.kind === 'code' ? [languageIcon(object.technology)].filter((icon) => icon !== undefined) : []),
      },
    }))
}
watch([workspace, viewId], rebuildNodes, { immediate: true })

// The boundary: inside an object (a system's Container diagram, a container's Component diagram)
// the object itself is not a card but a frame around its parts, with its name on it, as C4 draws
// a boundary. It goes around the cards that belong to the object, where they are now, a dragged
// one included; a card from elsewhere that was added to the diagram stands outside or on it.
const BOUNDARY_ROOM = FRAME
/** The object the open diagram is about, when it is drawn as a frame, and what is inside it. */
const framed = computed(() => {
  const { scope } = view.value
  if (scope === undefined) return undefined
  const objects = new Map(workspace.value.model.objects.map((object) => [object.id, object]))
  const about = objects.get(scope)
  if (!about) return undefined
  const isInside = (id: string) => {
    for (let at = objects.get(id)?.parent; at !== undefined; at = objects.get(at)?.parent) {
      if (at === scope) return true
    }
    return false
  }
  return { about, isInside, parentOf: (id: string) => objects.get(id)?.parent }
})
const boundary = computed(() => {
  if (!framed.value) return undefined
  const { about, isInside } = framed.value
  const cards = nodes.value
    .filter((node) => isInside(node.id))
    .map((node) => ({
      ...node.position,
      width: typeof node.width === 'number' ? node.width : CARD.width,
      height: typeof node.height === 'number' ? node.height : CARD.height,
    }))
  // Nothing inside yet: the frame stands where the first card will.
  if (cards.length === 0) cards.push({ x: 40, y: 40, ...CARD })
  // What runs between two of its cards is inside too: the connector's line and its label.
  for (const link of links.value) {
    if (!isInside(link.from) || !isInside(link.to)) continue
    const drawn = routes.value.get(link.id)
    for (const point of drawn?.route ?? []) cards.push({ ...point, width: 0, height: 0 })
    if (drawn?.labelAt && link.label) cards.push({ ...drawn.labelAt, ...labelSize(link.label) })
  }
  const left = Math.min(...cards.map((card) => card.x)) - BOUNDARY_ROOM.side
  const top = Math.min(...cards.map((card) => card.y)) - BOUNDARY_ROOM.top
  const right = Math.max(...cards.map((card) => card.x + card.width)) + BOUNDARY_ROOM.side
  const bottom = Math.max(...cards.map((card) => card.y + card.height)) + BOUNDARY_ROOM.bottom
  return { name: about.name, kind: about.kind, x: left, y: top, width: right - left, height: bottom - top }
})

// Groups: frames of this view around some of its cards (a deployment node, a zone), with a
// name on them. A frame is drawn around its cards where they are now, a dragged one included,
// so it goes with them; it is no card itself. A press on its name selects its cards, a
// double-click opens it.
const groupFrames = computed(() =>
  (view.value.groups ?? []).flatMap((group) => {
    const cards = nodes.value
      .filter((node) => group.members.includes(node.id))
      .map((node) => ({
        ...node.position,
        width: typeof node.width === 'number' ? node.width : CARD.width,
        height: typeof node.height === 'number' ? node.height : CARD.height,
      }))
    if (cards.length === 0) return []
    const x = Math.min(...cards.map((card) => card.x)) - GROUP_FRAME.side
    const y = Math.min(...cards.map((card) => card.y)) - GROUP_FRAME.top
    const right = Math.max(...cards.map((card) => card.x + card.width)) + GROUP_FRAME.side
    const bottom = Math.max(...cards.map((card) => card.y + card.height)) + GROUP_FRAME.bottom
    return [{ id: group.id, name: group.name, type: group.type, members: group.members, x, y, width: right - x, height: bottom - y }]
  }),
)

/** The form that puts the selected cards in a frame is open (the toolbar's "Group"). */
const grouping = ref(false)
/** The selected cards that can stand in a frame here: inside a box, only its own (not what is outside its frame). */
const selectedGroupable = computed(() => groupable(workspace.value, viewId.value, selected.value))

function groupSelected(name: string, what: string) {
  dispatch({ type: 'cardsGrouped', view: viewId.value, objects: selectedGroupable.value, name, ...(what.trim() && { what }) })
  grouping.value = false
}

function deleteGroupFrame(groupId: string) {
  dispatch({ type: 'groupRemoved', view: viewId.value, group: groupId })
}

function ungroupSelected() {
  dispatch({ type: 'cardsUngrouped', view: viewId.value, objects: selected.value })
}

function selectGroup(groupId: string) {
  const members = view.value.groups?.find((group) => group.id === groupId)?.members
  if (!members) return
  selectNext = [...members]
  rebuildNodes()
}

/** The frame that is being changed, and where on the screen its form floats. */
const groupEditing = ref<{ id: string; at: Point }>()
const groupEdited = computed(() => view.value.groups?.find((group) => group.id === groupEditing.value?.id))
const groupEditStyle = computed(() => {
  const at = groupEditing.value?.at
  if (!at) return undefined
  const within = (value: number, room: number) => Math.max(8, Math.min(value, room - 8))
  return { left: `${within(at.x, window.innerWidth - 290)}px`, top: `${within(at.y + 12, window.innerHeight - 200)}px` }
})

function saveGroup(name: string, what: string) {
  if (groupEditing.value) dispatch({ type: 'groupEdited', view: viewId.value, group: groupEditing.value.id, name, what })
  groupEditing.value = undefined
}

function deleteGroup() {
  if (groupEditing.value) dispatch({ type: 'groupRemoved', view: viewId.value, group: groupEditing.value.id })
  groupEditing.value = undefined
}

// The connections of the framed object itself, made a level up ("Customer buys from Online
// Shop"): the other end stands on the diagram as a card outside the frame (the model puts it
// there), and the connector runs between that card and the frame. Once a connection between
// that card and a card inside says it more exactly, the one to the frame is left out.
// Around the frame, the frame is a card of its own: the layout engine routes these connectors
// between it and the cards outside, and "Arrange" lays those cards out around it.
/** The frame's id when it stands as a card among its neighbours: no object has it. */
const FRAME_CARD = '\u0000frame'
/** The frame's connections: one per card outside and direction, however many it stands for. */
const frameLinks = computed(() => {
  if (!framed.value) return []
  const { about, isInside, parentOf } = framed.value
  const outside = new Map(nodes.value.filter((node) => !isInside(node.id)).map((node) => [node.id, node.data.name]))
  const explicit = new Set<string>()
  for (const link of links.value) {
    if (isInside(link.from) && !isInside(link.to)) explicit.add(link.to)
    if (isInside(link.to) && !isInside(link.from)) explicit.add(link.from)
  }
  const found = new Map<string, { other: string; inwards: boolean; labels: string[] }>()
  for (const connection of workspace.value.model.connections) {
    const inwards = connection.to === about.id
    const end = inwards ? connection.from : connection.from === about.id ? connection.to : undefined
    // The other end as the diagram shows it: itself, or what it is a part of (a container of
    // another system stands here as that system).
    let other = end
    while (other !== undefined && !outside.has(other)) other = parentOf(other)
    if (other === undefined || explicit.has(other)) continue
    const key = `${other} ${inwards}`
    const text = [connection.label, connection.technology && `[${connection.technology}]`].filter(Boolean).join(' ')
    const entry = found.get(key) ?? { other, inwards, labels: [] }
    entry.labels.push(text)
    found.set(key, entry)
  }
  return [...found.entries()].map(([key, { other, inwards, labels }]) => {
    const label = labels.length === 1 ? labels[0]! : `${labels.length} connections`
    const [from, to] = inwards ? [outside.get(other)!, about.name] : [about.name, outside.get(other)!]
    return { key, other, inwards, label, says: `${from} to ${to}${label ? `: ${label}` : ''}` }
  })
})

/** The cards outside the frame, where they are (a dragged one where it would land). */
const outsideCards = computed(() => {
  if (!framed.value) return []
  return nodes.value
    .filter((node) => !framed.value!.isInside(node.id))
    .map((node) => ({
      id: node.id,
      ...(drag.value?.id === node.id ? drag.value.place : node.position),
      width: typeof node.width === 'number' ? node.width : CARD.width,
      height: typeof node.height === 'number' ? node.height : CARD.height,
    }))
})

const overlaps = (a: Box, b: Box) =>
  a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height

/** The routes of the frame's connections, from the engine, by their key. */
const frameRoutes = computed(() => {
  const found = new Map<string, { route: readonly Point[]; labelAt?: Point }>()
  const frame = boundary.value
  if (!engine.value || !frame || frameLinks.value.length === 0) return found
  // A card dragged onto the frame has no way to it, and the engine takes no cards that touch.
  const cards = outsideCards.value.filter((card) => !overlaps(card, frame))
  const standing = new Set(cards.map((card) => card.id))
  const routed = frameLinks.value.filter((link) => standing.has(link.other))
  if (routed.length === 0) return found
  try {
    const answer = engine.value.route({
      cards: [...cards, { id: FRAME_CARD, x: frame.x, y: frame.y, width: frame.width, height: frame.height }],
      connections: routed.map((link) => ({
        from: link.inwards ? link.other : FRAME_CARD,
        to: link.inwards ? FRAME_CARD : link.other,
        label: link.label ? labelSize(link.label) : undefined,
      })),
    })
    routed.forEach((link, i) => found.set(link.key, { route: answer.routes[i] ?? [], labelAt: answer.labels[i] ?? undefined }))
  } catch (error) {
    // The connectors then run from card to frame with one bend at most.
    console.warn('The layout engine could not route the connectors to the frame:', error)
  }
  return found
})

const boundaryLinks = computed(() => {
  const frame = boundary.value
  if (!frame || !framed.value) return []
  const outside = new Map(outsideCards.value.map((card) => [card.id, card]))
  return frameLinks.value.flatMap((link) => {
    const card = outside.get(link.other)
    if (!card || overlaps(card, frame)) return []
    const [from, to] = link.inwards ? [card, frame] : [frame, card]
    const drawn = frameRoutes.value.get(link.key)
    let line = routePath(elbow(from, to))
    if (drawn && joins(drawn.route, from, to)) {
      line = routePath(drawn.route)
      if (drawn.labelAt && link.label) {
        const size = labelSize(link.label)
        line = { ...line, labelX: drawn.labelAt.x + size.width / 2, labelY: drawn.labelAt.y + size.height / 2 }
      }
    }
    return [{ key: link.key, ...line, label: link.label, says: link.says }]
  })
})

/**
 * The connections around the frame, with the frame as one card: its own, and those of cards
 * inside with cards outside, which run to the frame at this level. For "Arrange" and for a card
 * dropped outside the frame.
 */
function aroundTheFrame() {
  if (!framed.value) return []
  const { isInside } = framed.value
  const end = (id: string) => (isInside(id) ? FRAME_CARD : id)
  const around = links.value
    .filter((link) => !(isInside(link.from) && isInside(link.to)))
    .map((link) => ({ from: end(link.from), to: end(link.to), label: link.label ? labelSize(link.label) : undefined }))
  for (const link of frameLinks.value) {
    around.push({
      from: link.inwards ? link.other : FRAME_CARD,
      to: link.inwards ? FRAME_CARD : link.other,
      label: link.label ? labelSize(link.label) : undefined,
    })
  }
  return around.filter((link) => link.from !== link.to)
}

// Dropping a card: it lands on the free place nearest to where it is let go, on a grid, keeping
// its gap to the other cards. The layout engine finds that place; while the card is dragged a
// preview shows it. Without the engine (not loaded yet) the model still refuses a bad place.
const SNAP_GRID = 20
const engine = useLayoutEngine()
/** The card being dragged and the place it would land on now. */
const drag = ref<{ id: string; place: Point }>()
provide(CANVAS_DRAG, drag)

// Lining up: a dragged card moves on the grid (Vue Flow snaps it), so it comes to lie exactly in
// the column or row of another card without aiming. A guide through the cards shows when it does.
// Equal distances are marked the same way: the gaps beside the card that are as wide as the next
// gap along its row or column.
// Several cards dragged together show them as well, each card of the group against the cards
// that stay.
/** The cards dragged together, where the hand has them now; one card alone is `drag`. */
const groupDrag = ref<{ id: string; place: Point }[]>()
const hints = computed(() => {
  const moving = drag.value ? [drag.value] : (groupDrag.value ?? [])
  if (moving.length === 0) return { guides: [], gaps: [] }
  const ids = new Set(moving.map((card) => card.id))
  const others = Object.entries(view.value.positions)
    .filter(([id]) => !ids.has(id))
    .map(([id, place]) => ({ ...place, ...cardSize(view.value, id) }))
  // The same line found for two cards of the group is drawn once.
  const once = (lines: Guide[]) => [
    ...new Map(lines.map((line) => [`${line.upright} ${line.at} ${line.from} ${line.to}`, line])).values(),
  ]
  const cards = moving.map((card) => ({ ...card.place, ...cardSize(view.value, card.id) }))
  return {
    guides: once(cards.flatMap((card) => guidesFor(card, others))),
    gaps: once(cards.flatMap((card) => gapsFor(card, others))),
  }
})
/** How long the end marks of a gap are, across it. */
const GAP_MARK = 12
/** How far a guide reaches past the outermost cards, so it reads as a line and not as an edge. */
const GUIDE_OVERSHOOT = 24

/**
 * Whether the frame keeps the gap to every card outside it with a card of its own at a place:
 * the frame reaches further than its cards (`FRAME`), so a card inside can be clear of a card
 * outside while the frame around it is not.
 */
function frameStaysClear(objectId: string, place: Point): boolean {
  if (!framed.value) return true
  const { isInside } = framed.value
  const all = Object.entries(view.value.positions).map(([id, p]) => ({
    id,
    ...(id === objectId ? place : p),
    ...cardSize(view.value, id),
  }))
  const own = all.filter((card) => isInside(card.id))
  if (own.length === 0) return true
  const left = Math.min(...own.map((card) => card.x)) - FRAME.side
  const top = Math.min(...own.map((card) => card.y)) - FRAME.top
  const right = Math.max(...own.map((card) => card.x + card.width)) + FRAME.side
  const bottom = Math.max(...own.map((card) => card.y + card.height)) + FRAME.bottom
  return all
    .filter((card) => !isInside(card.id))
    .every(
      (card) =>
        card.x >= right + CARD_GAP ||
        card.x + card.width + CARD_GAP <= left ||
        card.y >= bottom + CARD_GAP ||
        card.y + card.height + CARD_GAP <= top,
    )
}

/**
 * Where a dragged card lands: `nearTo` what the engine finds best, unless the frame would then
 * run over a card outside it. Then the nearest place where neither the card nor the frame is in
 * the way of another card; with none near, the card stays where it is.
 */
function landingPlace(objectId: string, wanted: Point): Point {
  const place = bestPlace(objectId, wanted)
  if (!framed.value?.isInside(objectId) || frameStaysClear(objectId, place)) return place
  const fits = (at: Point) => fitsOnView(workspace.value, viewId.value, objectId, at) && frameStaysClear(objectId, at)
  return nearestPlace(wanted, SNAP_GRID, fits) ?? { ...view.value.positions[objectId]! }
}

function bestPlace(objectId: string, wanted: Point): Point {
  const fallback = { x: Math.round(wanted.x), y: Math.round(wanted.y) }
  if (!engine.value) return fallback
  const cards = Object.entries(view.value.positions).map(([id, p]) => ({ id, ...p, ...cardSize(view.value, id) }))
  // A card outside the frame lands among the other cards outside and the frame, one card.
  const frame = boundary.value
  const outside = framed.value && frame && !framed.value.isInside(objectId)
  try {
    const { x, y } = engine.value.snap({
      cards: outside
        ? [
            ...cards.filter((card) => !framed.value!.isInside(card.id)),
            { id: FRAME_CARD, x: frame.x, y: frame.y, width: frame.width, height: frame.height },
          ]
        : cards,
      connections: outside
        ? aroundTheFrame()
        : links.value.map((link) => ({
            from: link.from,
            to: link.to,
            // A label gets room between its two cards.
            label: link.label ? labelSize(link.label) : undefined,
          })),
      moving: objectId,
      wanted,
      cellSize: SNAP_GRID,
    })
    return { x, y }
  } catch (error) {
    console.warn('The layout engine could not place the card:', error)
    return fallback
  }
}

/** The free place on the grid nearest to a wanted one, for a card that is not on the diagram yet. */
function freePlaceNear(wanted: Point, size: Size = CARD, alsoTaken: readonly Box[] = []): Point {
  const NEW = '\u0000new'
  const onGrid = { x: Math.round(wanted.x / SNAP_GRID) * SNAP_GRID, y: Math.round(wanted.y / SNAP_GRID) * SNAP_GRID }
  if (!engine.value) return onGrid
  try {
    const { x, y } = engine.value.snap({
      cards: [
        ...Object.entries(view.value.positions).map(([id, p]) => ({ id, ...p, ...cardSize(view.value, id) })),
        ...alsoTaken.map((box, index) => ({ id: `\u0000taken${index}`, ...box })),
        { id: NEW, ...onGrid, ...size },
      ],
      connections: [],
      moving: NEW,
      wanted: onGrid,
      cellSize: SNAP_GRID,
    })
    return { x, y }
  } catch (error) {
    // The model then puts the card at its usual free place if this one is taken.
    console.warn('The layout engine could not place the new card:', error)
    return onGrid
  }
}

function onNodeDrag({ node, nodes: moved }: NodeDragEvent) {
  // The preview is for one card; several dragged together each land on their own, and only
  // show where they are in line.
  if (moved.length !== 1) {
    drag.value = undefined
    groupDrag.value = moved.map((card) => ({ id: card.id, place: { ...card.position } }))
    return
  }
  groupDrag.value = undefined
  const place = landingPlace(node.id, node.position)
  // The same place as before changes nothing: the connectors need no new routes.
  const before = drag.value
  if (before?.id !== node.id || before.place.x !== place.x || before.place.y !== place.y) {
    drag.value = { id: node.id, place }
  }
}

function onNodeDragStop({ nodes: moved }: NodeDragEvent) {
  drag.value = undefined
  groupDrag.value = undefined
  // One drag is one change, however many cards went along.
  const moves = moved.map((node) => ({ object: node.id, to: landingPlace(node.id, node.position) }))
  dispatch({ type: 'objectsMoved', view: viewId.value, moves })
  // Also when nothing moved in the model (a refused place): the card goes back to where it is.
  rebuildNodes()
}

// Arrange: the layout engine lays the whole view out as TALA does (the best of its three seeds)
// and the cards move there in one change, which one undo takes back. A card with many
// connections may come back larger: TALA gives them room on its sides.
// The engine needs a moment, so it works in the background and the press shows at once
// (docs/agents/design.md): the button spins and the cards shuffle on the spot ("thinking"), then
// they glide to their new places ("gliding").
// With two or more cards selected only those are arranged, by the connections among them. They
// stay where they are as a group, and move aside as one when a card that stays is in the way.
const arrangeSome = computed(() => selected.value.length > 1)
const canArrange = computed(() => engine.value !== undefined && Object.keys(view.value.positions).length > 1)
const arranging = ref<'thinking' | 'gliding'>()
// Why a press changed nothing ("Arrange" found no layout, a connection is not drawn here) is said
// on an error card (composables/useErrors.ts). The cards are about the diagram as it was: they
// go with the next change.
watch([workspace, viewId], clearErrors)
/** The shuffle is shown at least this long, in ms: shorter, it would only flicker. */
const THINKING_AT_LEAST = 300
/** How long the cards take to their new places, in ms: the glide in main.css with its delays. */
const GLIDE = 750
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms))

/** Room around the frame's cards that its own connectors may take, in px. */
const FRAME_SLACK = 20
/** How far a card stands off the frame it was arranged around, beyond that room: space for a connector's label. */
const NEIGHBOUR_GAP = 60

/**
 * The cards outside the frame laid out around it, the frame being one card of its own around the
 * cards inside, which are already arranged and move along with it. Every card, inside and
 * outside; `undefined` when the engine finds no layout (the cards outside then stay).
 */
async function arrangeAroundFrame(inside: readonly (Box & { id: string })[], outside: (Box & { id: string })[]) {
  const box =
    inside.length > 0
      ? {
          x: Math.min(...inside.map((card) => card.x)) - BOUNDARY_ROOM.side - FRAME_SLACK,
          y: Math.min(...inside.map((card) => card.y)) - BOUNDARY_ROOM.top - FRAME_SLACK,
          right: Math.max(...inside.map((card) => card.x + card.width)) + BOUNDARY_ROOM.side + FRAME_SLACK,
          bottom: Math.max(...inside.map((card) => card.y + card.height)) + BOUNDARY_ROOM.bottom + FRAME_SLACK,
        }
      : boundary.value && {
          x: boundary.value.x - FRAME_SLACK,
          y: boundary.value.y - FRAME_SLACK,
          right: boundary.value.x + boundary.value.width + FRAME_SLACK,
          bottom: boundary.value.y + boundary.value.height + FRAME_SLACK,
        }
  if (!box) return undefined
  const frame = { id: FRAME_CARD, x: box.x, y: box.y, width: box.right - box.x, height: box.bottom - box.y }
  try {
    const answer = await arrangeInBackground({ cards: [...outside, frame], connections: aroundTheFrame() })
    const placed = answer.cards.find((card) => card.id === FRAME_CARD)
    if (!placed) return undefined
    const by = { x: placed.x - frame.x, y: placed.y - frame.y }
    const around = answer.cards.filter((card) => card.id !== FRAME_CARD)
    // A frame that holds nothing has no cards to take along: it is drawn where its first card
    // will stand, wherever the engine put it. So its neighbours come to it instead, in whole
    // steps of the grid.
    if (inside.length === 0) {
      const back = { x: Math.round(by.x / SNAP_GRID) * SNAP_GRID, y: Math.round(by.y / SNAP_GRID) * SNAP_GRID }
      return around.map((card) => ({ ...card, x: card.x - back.x, y: card.y - back.y }))
    }
    const moved = inside.map((card) => ({ ...card, x: card.x + by.x, y: card.y + by.y }))
    // The engine laid the frame out as one card: it cannot know where in the frame the card of
    // a neighbour stands. So each neighbour goes to the side nearest to the cards it connects
    // to, level with them, and its connectors are short.
    const beside = besideTheirCards({ ...frame, x: placed.x, y: placed.y }, moved, around, links.value, NEIGHBOUR_GAP, SNAP_GRID)
    return [...moved, ...(beside ?? around)]
  } catch (error) {
    console.warn('The layout engine could not lay out the cards around the frame:', error)
    return undefined
  }
}

/** The room a frame's block takes around its cards when it is arranged: the frame's own, up to the grid, so its cards stay on it. */
const GROUP_BLOCK = {
  side: Math.ceil(GROUP_FRAME.side / SNAP_GRID) * SNAP_GRID,
  top: Math.ceil(GROUP_FRAME.top / SNAP_GRID) * SNAP_GRID,
  bottom: Math.ceil(GROUP_FRAME.bottom / SNAP_GRID) * SNAP_GRID,
}

/**
 * Arrange cards, the frames around some of them (groups) kept whole: the cards of each frame are
 * laid out among themselves first, then every frame is one card among the others, as large as
 * its cards with the frame around them, and its cards move with it. A frame of which only some
 * cards are arranged is no block: those cards are arranged as any other.
 */
async function arrangeWithGroups(
  cards: (Box & { id: string })[],
  connections: { from: string; to: string; label?: Size }[],
): Promise<(Box & { id: string })[]> {
  const asked = new Set(cards.map((card) => card.id))
  const whole = (view.value.groups ?? []).filter((group) => group.members.every((id) => asked.has(id)))
  if (whole.length === 0) return (await arrangeInBackground({ cards, connections })).cards
  const blockOf = new Map<string, string>()
  const inside = new Map<string, (Box & { id: string })[]>()
  const blocks: (Box & { id: string })[] = []
  for (const group of whole) {
    const block = `\u0000group ${group.id}`
    const members = cards.filter((card) => group.members.includes(card.id))
    const among = connections.filter((link) => group.members.includes(link.from) && group.members.includes(link.to))
    const laid = members.length > 1 ? (await arrangeInBackground({ cards: members, connections: among })).cards : members
    const x = Math.min(...laid.map((card) => card.x)) - GROUP_BLOCK.side
    const y = Math.min(...laid.map((card) => card.y)) - GROUP_BLOCK.top
    const right = Math.max(...laid.map((card) => card.x + card.width)) + GROUP_BLOCK.side
    const bottom = Math.max(...laid.map((card) => card.y + card.height)) + GROUP_BLOCK.bottom
    blocks.push({ id: block, x, y, width: right - x, height: bottom - y })
    // Where each card stands in its block.
    inside.set(block, laid.map((card) => ({ ...card, x: card.x - x, y: card.y - y })))
    for (const member of members) blockOf.set(member.id, block)
  }
  const end = (id: string) => blockOf.get(id) ?? id
  const outer = [...cards.filter((card) => !blockOf.has(card.id)), ...blocks]
  const between = connections.map((link) => ({ ...link, from: end(link.from), to: end(link.to) })).filter((link) => link.from !== link.to)
  const placed = outer.length > 1 ? (await arrangeInBackground({ cards: outer, connections: between })).cards : outer
  return placed.flatMap((card) => inside.get(card.id)?.map((member) => ({ ...member, x: card.x + member.x, y: card.y + member.y })) ?? [card])
}

async function arrange() {
  if (!canArrange.value || arranging.value) return
  arranging.value = 'thinking'
  clearErrors()
  const asked = { workspace: workspace.value, view: viewId.value }
  const all = Object.entries(view.value.positions).map(([id, p]) => ({ id, ...p, ...cardSize(view.value, id) }))
  // On a diagram with a frame, the cards inside it: its neighbours stay around it.
  const own = framed.value ? all.filter((card) => framed.value!.isInside(card.id)) : all
  const chosen = new Set(arrangeSome.value ? selected.value : own.map((card) => card.id))
  const staying = all.filter((card) => !chosen.has(card.id))
  try {
    const [arranged] = await Promise.all([
      arrangeWithGroups(
        all.filter((card) => chosen.has(card.id)),
        links.value
          .filter((link) => chosen.has(link.from) && chosen.has(link.to))
          .map((link) => ({
            from: link.from,
            to: link.to,
            label: link.label ? labelSize(link.label) : undefined,
          })),
      ),
      wait(THINKING_AT_LEAST),
    ])
    const answer = { cards: arranged }
    // With a frame, the whole diagram: then the frame, a card of its own, among its neighbours.
    const whole = framed.value && !arrangeSome.value && staying.length > 0
    const around = whole ? await arrangeAroundFrame(answer.cards, staying) : undefined
    const cards = around ?? answer.cards
    const by = placeBlock(cards, around ? [] : staying, CARD_GAP, SNAP_GRID)
    if (!by) {
      showError('Arrange found no free place for the selected cards.')
      return
    }
    // The answer is for the diagram as it was when asked.
    if (workspace.value !== asked.workspace || viewId.value !== asked.view) {
      showError('The diagram changed while it was arranged. Press Arrange again.')
      return
    }
    arranging.value = 'gliding'
    dispatch({
      type: 'viewArranged',
      view: asked.view,
      cards: cards.map((card) => ({
        object: card.id,
        to: { x: card.x + by.x, y: card.y + by.y },
        size: { width: card.width, height: card.height },
      })),
    })
    await wait(GLIDE)
  } catch (error) {
    console.warn('The layout engine could not arrange the diagram:', error)
    showError('Arrange found no layout that keeps the cards apart.')
  } finally {
    arranging.value = undefined
  }
}

// Import: a diagram written as text comes onto the open one as one change. The layout engine lays
// it out on its own first (in the background, as "Arrange"), and the block goes right of the cards
// that are there, on the first free place.
async function bringDiagram(diagram: Diagram) {
  const asked = { workspace: workspace.value, view: viewId.value }
  // What comes onto this diagram: the elements that stand inside no other of the file (a
  // flowchart's subgraphs hold the rest, each on the diagram inside its box). A connection of
  // something inside counts for the box around it here, as it is drawn here.
  const within = new Map(diagram.elements.map((element) => [element.id, element.inside]))
  const outermost = (id: string) => {
    let at = id
    for (let above = within.get(at); above !== undefined; above = within.get(at)) at = above
    return at
  }
  const onDiagram = diagram.elements.filter((element) => element.inside === undefined)
  const inFile = new Set(onDiagram.map((element) => element.id))
  let laid = onDiagram.map((element, i) => ({
    id: element.id,
    x: (i % 4) * (CARD.width + 100),
    y: Math.floor(i / 4) * (CARD.height + 60),
    ...CARD,
  }))
  if (laid.length > 1 && engine.value) {
    try {
      const answer = await arrangeInBackground({
        cards: laid,
        connections: diagram.relationships
          .map((r) => ({ ...r, from: outermost(r.from), to: outermost(r.to), lifted: within.get(r.from) !== undefined || within.get(r.to) !== undefined }))
          .filter((r) => inFile.has(r.from) && inFile.has(r.to) && r.from !== r.to)
          .map((r) => {
            // One level up a connection has no label.
            const text = r.lifted ? '' : [r.label, r.technology && `[${r.technology}]`].filter(Boolean).join(' ')
            return { from: r.from, to: r.to, label: text ? labelSize(text) : undefined }
          }),
      })
      laid = answer.cards.map((card) => ({ ...card, ...CARD }))
    } catch (error) {
      // The grid then: the diagram still comes in.
      console.warn('The layout engine could not lay out the imported diagram:', error)
    }
  }
  const staying = Object.entries(view.value.positions).map(([id, p]) => ({ ...p, ...cardSize(view.value, id) }))
  const left = Math.min(...laid.map((card) => card.x))
  const top = Math.min(...laid.map((card) => card.y))
  const start =
    staying.length === 0
      ? { x: 40, y: 40 }
      : {
          x: Math.max(...staying.map((card) => card.x + card.width)) + 4 * CARD_GAP,
          y: Math.min(...staying.map((card) => card.y)),
        }
  const shifted = laid.map((card) => ({ ...card, x: card.x - left + start.x, y: card.y - top + start.y }))
  const by = placeBlock(shifted, staying, CARD_GAP, SNAP_GRID) ?? { x: 0, y: 0 }
  const places = Object.fromEntries(shifted.map((card) => [card.id, { x: card.x + by.x, y: card.y + by.y }]))
  if (workspace.value !== asked.workspace || viewId.value !== asked.view) {
    throw new Error('The diagram changed meanwhile. Import it again.')
  }
  const before = new Set(Object.keys(view.value.positions))
  const was = store.workspace.value
  dispatch({ type: 'diagramImported', view: viewId.value, diagram, places })
  if (store.workspace.value === was) {
    throw new Error(
      'Nothing of this diagram fits here: its containers or components need a system or container to live in. Open the diagram inside one, or frame them in the file.',
    )
  }
  const shown = Object.keys(view.value.positions).filter((id) => !before.has(id))
  if (shown.length > 0) added.value = { id: shown.at(-1)! }
}

/**
 * What the view draws between its cards: the connections made on it, and, one level up, that
 * two cards are connected by what is inside them (`liftedConnections`): one line per pair and
 * direction, however many connections there are, and without a label. Such a line is no
 * connection of this diagram: it is changed where it was made (its id is none of the model's).
 */
const links = computed(() => {
  const shown = new Set(view.value.connections)
  const own = workspace.value.model.connections
    .filter((c) => shown.has(c.id))
    // A relationship says what it is for and, where it applies, how: "Sends orders to [HTTPS]".
    .map((c) => {
      const text = [c.label, c.technology && `[${c.technology}]`].filter(Boolean).join(' ')
      return { id: c.id, from: c.from, to: c.to, label: text || undefined, colour: c.colour }
    })
  const lifted = liftedConnections(workspace.value, viewId.value).map(({ from, to }) => ({ id: `lifted ${from} ${to}`, from, to, label: undefined, colour: undefined }))
  return [...own, ...lifted]
})

// Routes: the layout engine lays every connector around the cards, for the places the cards have
// in the workspace, and finds the place for every label. While one card is dragged it counts at
// the place it would land on: all connectors, its own too, already run as they will after the
// drop.
const routes = computed(() => {
  const found = new Map<string, { route: readonly Point[]; labelAt?: Point }>()
  if (!engine.value || links.value.length === 0) return found
  const places = { ...view.value.positions }
  if (drag.value && Object.hasOwn(places, drag.value.id)) places[drag.value.id] = drag.value.place
  try {
    const answer = engine.value.route({
      cards: Object.entries(places).map(([id, p]) => ({ id, ...p, ...cardSize(view.value, id) })),
      connections: links.value.map((link) => ({
        from: link.from,
        to: link.to,
        // A label gets a place on the route where it covers the least.
        label: link.label ? labelSize(link.label) : undefined,
      })),
    })
    links.value.forEach((link, i) =>
      found.set(link.id, { route: answer.routes[i] ?? [], labelAt: answer.labels[i] ?? undefined }),
    )
  } catch (error) {
    // The connectors then run from card to card with one bend at most, not around other cards.
    console.warn('The layout engine could not route the connectors:', error)
  }
  return found
})

// Focus: clicking a card keeps it, its connectors and the cards at their other ends clear, and
// fades the rest. Clicking the empty canvas takes the selection, and with it the focus, away.
const faded = computed(() => {
  const selected = new Set(nodes.value.filter((n) => n.selected).map((n) => n.id))
  const clear = new Set(selected)
  const edges = new Set<string>()
  if (selected.size > 0) {
    for (const link of links.value) {
      if (selected.has(link.from) || selected.has(link.to)) clear.add(link.from).add(link.to)
      else edges.add(link.id)
    }
  }
  const cards = selected.size === 0 ? [] : nodes.value.map((n) => n.id).filter((id) => !clear.has(id))
  return { cards: new Set(cards), edges }
})
provide(CANVAS_FADED, computed(() => faded.value.cards))

const edges = computed<ConnectionEdge[]>(() => {
  const name = new Map(workspace.value.model.objects.map((o) => [o.id, o.name]))
  return links.value.map(({ id, from, to, label, colour }) => ({
    id,
    source: from,
    target: to,
    type: 'connection',
    label,
    class: faded.value.edges.has(id) ? 'faded' : '',
    // The line and its arrowhead in the connection's colour, the usual grey without one.
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
      color: colour ? `var(--line-${colour})` : 'var(--muted-foreground)',
    },
    // Not focusable: a focusable edge is a `group` named after its ends, like the objects.
    focusable: false,
    ariaLabel: `${name.get(from)} to ${name.get(to)}${label ? `: ${label}` : ''}`,
    domAttributes: { 'data-testid': 'relationship', ...(colour && { 'data-colour': colour }) } as ConnectionEdge['domAttributes'],
    data: { labelling: labelling.value === id, colour, ...routes.value.get(id) },
  }))
})

// Deleting: the selected cards leave the model, with their connections, on every diagram.
const selected = computed(() => nodes.value.filter((n) => n.selected).map((n) => n.id))

/** Whether a selected card stands in a frame: then "Ungroup" has something to do. */
const selectedGrouped = computed(() => selected.value.some((id) => view.value.groups?.some((group) => group.members.includes(id))))

function removeSelected() {
  if (selected.value.length > 0) dispatch({ type: 'objectsRemoved', objects: selected.value })
}

// History: undo, redo and the timeline move along the change log. The diagram follows to where
// the change was made, so that it is seen to go or to come back.
const showHistory = ref(false)
const changes = computed(() =>
  history.value.log.map((entry, i) => ({
    text: describeEvent(history.value.states[i]!, entry.event),
    at: entry.at,
  })),
)

// Cards that a step in the history moves glide there, as after "Arrange"; the connectors step
// back for that moment, as their new routes would jump.
const travelling = ref(false)
let travelEnd: ReturnType<typeof setTimeout> | undefined

/** Whether a card stands on both views, at another place or with another size. */
function movesCards(before: typeof view.value, after: typeof view.value): boolean {
  return Object.entries(before.positions).some(([id, was]) => {
    const now = after.positions[id]
    if (!now) return false
    const [a, b] = [cardSize(before, id), cardSize(after, id)]
    return was.x !== now.x || was.y !== now.y || a.width !== b.width || a.height !== b.height
  })
}

// The minimap stands in the top right corner, over the canvas. A card that is added or comes
// into a newly opened diagram under it counts as out of sight: the view then fits itself.
const minimapShown = computed(() => nodes.value.length > 0 && !showHistory.value)
/** The minimap with the space around it, in px of the screen. */
const MINIMAP_ROOM = { width: 210, height: 150 }

// Starting over: everything in the workspace and its change log go, on the server, and the
// editor is back on the empty Overview. The workspace itself stays, with its name and members.
const canClear = computed(
  () =>
    history.value.log.length > 0 ||
    store.workspace.value.model.objects.length > 0 ||
    store.workspace.value.model.connections.length > 0,
)

async function clearWorkspace() {
  labelling.value = null
  stopAdding()
  editing.value = undefined
  iconsOf.value = undefined
  showHistory.value = false
  try {
    await store.clear()
  } catch (failure) {
    showError(`The workspace was not cleared. ${failureText(failure)}`)
    return
  }
  if (viewId.value !== ROOT_VIEW_ID || props.viewId !== undefined) router.replace(viewPath(ROOT_VIEW_ID, ROOT_VIEW_ID))
}

function travel(to: number) {
  const from = history.value.cursor
  const before = { view: view.value, id: viewId.value }
  store.goTo(to)
  const now = history.value.cursor
  if (now === from) return
  if (viewId.value === before.id && movesCards(before.view, view.value)) {
    travelling.value = true
    clearTimeout(travelEnd)
    travelEnd = setTimeout(() => (travelling.value = false), GLIDE)
  }
  labelling.value = null
  // Going back: the nearest change that was undone. Going forward: the last one applied.
  const entry = history.value.log[now < from ? now : now - 1]
  const target = entry && eventView(entry.event)
  if (target === undefined || target === viewId.value) return
  const exists = openView(store.workspace.value, target).views.some((v) => v.id === target)
  if (exists) router.replace(viewPath(target, ROOT_VIEW_ID))
}
const undo = () => travel(history.value.cursor - 1)
const redo = () => travel(history.value.cursor + 1)

// The tour (J63, TourGuide.vue): it is told on the example, which it loads into an empty
// workspace, and follows what is done here to know when a step was answered.
const tour = ref<InstanceType<typeof TourGuide>>()
/** Nothing was ever done in this workspace: the tour starts by itself there, once in a browser. */
const fresh = store.workspace.value.model.objects.length === 0 && history.value.log.length === 0
/** The view inside the box the tour opens, while the example is there. */
const tourView = computed(() => {
  const box = workspace.value.model.objects.find((object) => object.name === TOUR_BOX)
  return box && `inside-${box.id}`
})
const tourScene = computed<TourScene>(() => ({
  at: viewId.value === ROOT_VIEW_ID ? 'overview' : viewId.value === tourView.value ? 'inside' : 'elsewhere',
  objects: workspace.value.model.objects.length,
  connections: workspace.value.model.connections.length,
  changes: history.value.cursor,
  lastChange: history.value.log[history.value.cursor - 1]?.event.type,
  historyOpen: showHistory.value,
  typing: labelling.value !== null,
}))
/**
 * The history, for the tour's step about it. Closed behind that step, with the diagram back
 * at now: the steps that follow are about what is there today.
 */
function tourHistory(open: boolean) {
  showHistory.value = open
  if (!open && history.value.cursor < history.value.log.length) travel(history.value.log.length)
}
/** Opens the diagram a step of the tour is about; stays where it is when that is not there. */
async function tourGo(where: 'overview' | 'inside') {
  const to = where === 'overview' ? ROOT_VIEW_ID : tourView.value
  if (to) await router.push(viewPath(to, ROOT_VIEW_ID))
}

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  // Escape leaves the icons, wherever the cursor is.
  if (event.key === 'Escape' && iconsOf.value) {
    iconsOf.value = undefined
    return
  }
  // The search opens from anywhere, a field included.
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    searching.value = true
    return
  }
  // A field being typed in keeps its own undo and its own Delete.
  const field = 'input:not([type=range], [type=checkbox]), textarea, select, [contenteditable]'
  if (event.target instanceof Element && event.target.matches(field)) return
  const key = event.key.toLowerCase()
  if (event.ctrlKey || event.metaKey) {
    // Copy the selection: before the browser takes the key for a bookmark.
    const copy = key === 'd' && selected.value.length > 0 ? () => copyCards(selected.value) : undefined
    // Group the selection; with only cards from outside the frame selected, say why not.
    const group =
      key !== 'g' || selected.value.length === 0
        ? undefined
        : selectedGroupable.value.length > 0
          ? () => (grouping.value = true)
          : () => showError('Cards outside the frame are grouped on a diagram they are on, not here.')
    const step = key === 'z' ? (event.shiftKey ? redo : undo) : key === 'y' ? redo : (copy ?? group)
    if (!step) return
    event.preventDefault()
    step()
  } else if (event.altKey) {
    return
  } else if (key === 'delete' || key === 'backspace') {
    removeSelected()
  } else if (key === 'a') {
    // The same as the button: canvas/shortcuts.ts lists the keys for the legend.
    void arrange()
  }
})

// Export: the diagram as the canvas shows it, every card and connector, wherever the view is
// panned to. A connector runs along its route, as canvas/ConnectionEdge.vue draws it.
function exportScene(): Scene {
  const box = (id: string): Box => ({ ...view.value.positions[id]!, ...cardSize(view.value, id) })
  const connectors = links.value.flatMap((link): SceneConnector[] => {
    if (!Object.hasOwn(view.value.positions, link.from) || !Object.hasOwn(view.value.positions, link.to)) return []
    const [from, to] = [box(link.from), box(link.to)]
    const drawn = routes.value.get(link.id)
    const routed = drawn !== undefined && joins(drawn.route, from, to)
    const points = routed ? drawn.route : elbow(from, to)
    const line = routePath(points)
    const corner = routed ? drawn.labelAt : undefined
    const labelAt =
      corner && link.label
        ? { x: corner.x + labelSize(link.label).width / 2, y: corner.y + labelSize(link.label).height / 2 }
        : { x: line.labelX, y: line.labelY }
    return [{ path: line.path, points, label: link.label, labelAt, ...(link.colour && { colour: link.colour }) }]
  })
  for (const link of boundaryLinks.value) {
    connectors.push({ path: link.path, points: [], label: link.label || undefined, labelAt: { x: link.labelX, y: link.labelY }, toFrame: true })
  }
  return {
    title: title.value,
    cards: nodes.value.map((node) => ({ ...box(node.id), ...node.data })),
    connectors,
    boundary: boundary.value,
    key: {
      kinds: keyKinds.value,
      external: nodes.value.some((n) => n.data.external),
      relationships: links.value.length > 0,
      toFrame: boundaryLinks.value.length > 0,
    },
  }
}

// The key lists only what is on the diagram.
const keyKinds = computed(() =>
  KINDS.filter((kind) => nodes.value.some((n) => n.data.kind === kind)),
)
</script>

<template>
  <div class="flex h-full flex-col">
    <AppHeader>
      <Breadcrumb aria-label="Breadcrumb">
        <BreadcrumbList class="flex items-center gap-1.5 text-sm">
          <template v-for="(entry, i) in trail" :key="entry.viewId">
            <BreadcrumbSeparator v-if="i > 0" class="text-muted-foreground" />
            <BreadcrumbItem class="min-w-0">
              <BreadcrumbPage v-if="entry.viewId === viewId" class="truncate font-medium">
                {{ entry.label }}
              </BreadcrumbPage>
              <BreadcrumbLink v-else as-child class="text-muted-foreground truncate">
                <RouterLink :to="viewPath(entry.viewId, ROOT_VIEW_ID)">{{ entry.label }}</RouterLink>
              </BreadcrumbLink>
            </BreadcrumbItem>
          </template>
        </BreadcrumbList>
      </Breadcrumb>
      <template #actions>
        <ObjectSearch v-model:open="searching" :objects="searchable" @pick="goTo" />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Arrange"
          :title="arrangeSome ? `Arrange the ${selected.length} selected cards (A)` : 'Arrange the diagram (A)'"
          :disabled="!canArrange || arranging !== undefined"
          :class="{ 'disabled:opacity-100': arranging }"
          :aria-busy="arranging !== undefined"
          @click="arrange"
        >
          <LoaderCircleIcon v-if="arranging" class="animate-spin" aria-hidden="true" />
          <LayoutDashboardIcon v-else aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          :disabled="!store.canUndo.value"
          @click="undo"
        >
          <Undo2Icon aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
          :disabled="!store.canRedo.value"
          @click="redo"
        >
          <Redo2Icon aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="History"
          title="History: the timeline and the change log"
          :aria-pressed="showHistory"
          :class="{ 'bg-accent': showHistory }"
          @click="showHistory = !showHistory"
        >
          <HistoryIcon aria-hidden="true" />
        </Button>
        <ImportMenu :bring="bringDiagram" />
        <ClearWorkspace :disabled="!canClear" @clear="clearWorkspace" />
        <ExportMenu :scene="exportScene" :diagram="() => diagramOfView(workspace, viewId)" :disabled="nodes.length === 0" />
      </template>
    </AppHeader>

    <div class="relative min-h-0 flex-1">
      <div
        class="absolute inset-0"
        :class="[
          arranging && [`is-${arranging}`, arrangeSome && 'is-partial'],
          travelling && !arranging && 'is-gliding is-travelling',
        ]"
        role="application"
        aria-label="Diagram canvas"
        :aria-busy="arranging !== undefined || travelling"
        @click.capture="onCanvasClick"
        @dblclick.capture="onCanvasDoubleClick"
      >
        <VueFlow
          v-model:nodes="nodes"
          :edges="edges"
          :node-types="nodeTypes"
          :edge-types="edgeTypes"
          :min-zoom="0.2"
          :max-zoom="2"
          pan-on-scroll
          :zoom-on-scroll="false"
          :zoom-on-double-click="false"
          :delete-key-code="null"
          :multi-selection-key-code="ALSO_SELECT"
          :edges-focusable="false"
          snap-to-grid
          :snap-grid="[SNAP_GRID, SNAP_GRID]"
          attribution-position="bottom-left"
          @connect="onConnect"
          @pane-context-menu="(event: MouseEvent) => (event.preventDefault(), (quickMenuAt = { x: event.clientX, y: event.clientY }))"
          @node-drag="onNodeDrag"
          @node-drag-stop="onNodeDragStop"
        >
          <Background variant="dots" :gap="24" :size="1.5" />
          <!-- The minimap: the whole diagram small, with the part on screen marked. Dragging in it
               moves the view, the wheel over it zooms. Not on an empty diagram, not on a phone
               (no room), and it makes room for the history, which opens in the same corner. -->
          <MiniMap
            v-if="minimapShown"
            position="top-right"
            aria-label="Minimap"
            class="canvas-minimap max-sm:hidden"
            :width="180"
            :height="120"
            :offset-scale="20"
            pannable
            zoomable
          >
            <!-- Every card, drawn here and not by Vue Flow, so that the frame of an opened box
                 can be drawn with them: under the cards, in the slot of the first one. The
                 minimap's picture is in the diagram's own measures, so the frame fits as it is. -->
            <template #node-object="card">
              <rect
                v-if="boundary && card.id === nodes[0]?.id"
                data-testid="minimap-frame"
                class="minimap-frame"
                :x="boundary.x"
                :y="boundary.y"
                :width="boundary.width"
                :height="boundary.height"
                rx="24"
              />
              <rect
                data-testid="minimap-card"
                class="vue-flow__minimap-node"
                :class="{ 'is-selected': card.selected }"
                :x="card.position.x"
                :y="card.position.y"
                :width="card.dimensions.width"
                :height="card.dimensions.height"
                rx="12"
              />
            </template>
          </MiniMap>
          <!-- The title and, beside it, the views of this box: in one row, so that the panel
               stays as low as the title and covers no card. The title shows the box only (the
               tab says which view): it is as wide on every view, and the tabs stay in place. -->
          <Panel position="top-left" class="flex items-center gap-2.5">
            <h2 class="text-base font-semibold">
              {{ boxTitle }}<span v-if="title !== boxTitle" class="sr-only">{{ title.slice(boxTitle.length) }}</span>
            </h2>
            <ViewTabs :views="views" :current="viewId" @add="addView" @rename="renameView" @remove="removeView" />
          </Panel>
          <CanvasKey
            :kinds="keyKinds"
            :external="nodes.some((n) => n.data.external)"
            :relationships="links.length > 0"
            :to-frame="boundaryLinks.length > 0"
            :groups="groupFrames.length > 0"
          />
          <CanvasControls :reveal="added" :centre="found" :diagram="viewId" :corner="minimapShown ? MINIMAP_ROOM : undefined" :framed="boundary !== undefined" />
          <CanvasQuickMenu
            :items="quickMenuItems"
            :open-at="quickMenuAt"
            @pick="onQuickMenuPick"
            @close="quickMenuAt = undefined"
          />
          <!-- The label layer moves and zooms with the diagram, which the preview must too. Its
               own wrapper is hidden: only the teleported outline shows. -->
          <div class="hidden">
            <EdgeLabelRenderer>
              <!-- The frames around cards (groups): under the cards, their names over the frame's top. -->
              <div
                v-for="frame in groupFrames"
                :key="frame.id"
                data-testid="card-group"
                class="card-group pointer-events-none absolute top-0 left-0 rounded-2xl border border-dashed"
                :style="{ transform: `translate(${frame.x}px, ${frame.y}px)`, width: `${frame.width}px`, height: `${frame.height}px` }"
              >
                <button
                  type="button"
                  :aria-label="`Group ${frame.name}`"
                  title="Press to select its cards, double-click to change it"
                  class="nodrag nopan hover:bg-accent/60 pointer-events-auto absolute top-1 left-1.5 flex max-w-[calc(100%-36px)] flex-col items-start rounded-md px-1.5 py-0.5 text-left"
                  @click.stop="selectGroup(frame.id)"
                  @dblclick.stop="(event: MouseEvent) => (groupEditing = { id: frame.id, at: { x: event.clientX, y: event.clientY } })"
                >
                  <strong class="max-w-full truncate text-xs leading-tight font-semibold">{{ frame.name }}</strong>
                  <span v-if="frame.type" class="text-muted-foreground max-w-full truncate text-[10px] leading-tight">[{{ frame.type }}]</span>
                </button>
                <!-- In sight on the frame itself: the cards stay, one undo brings the frame back. -->
                <button
                  type="button"
                  :aria-label="`Delete the group ${frame.name}`"
                  title="Delete this frame: its cards stay"
                  class="nodrag nopan text-muted-foreground hover:bg-accent hover:text-foreground pointer-events-auto absolute top-1 right-1 grid size-5 place-items-center rounded-md"
                  @click.stop="deleteGroupFrame(frame.id)"
                  @dblclick.stop
                >
                  <XIcon class="size-3.5" aria-hidden="true" />
                </button>
              </div>
              <div
                v-if="boundary"
                data-testid="boundary"
                class="boundary pointer-events-none absolute top-0 left-0 rounded-3xl border-2 border-dashed"
                :style="{
                  '--kind': `var(--kind-${boundary.kind})`,
                  transform: `translate(${boundary.x}px, ${boundary.y}px)`,
                  width: `${boundary.width}px`,
                  height: `${boundary.height}px`,
                }"
              >
                <p class="flex items-center gap-2 px-5 pt-4 text-sm">
                  <span class="kind-chip grid size-6 place-items-center rounded-md">
                    <component :is="KIND_ICON[boundary.kind]" class="size-3.5" aria-hidden="true" />
                  </span>
                  <strong class="font-semibold">{{ boundary.name }}</strong>
                  <span class="text-muted-foreground text-xs">[{{ KIND_LABEL[boundary.kind] }}]</span>
                </p>
              </div>
              <!-- The framed object's own connections: lines of our own between a card and the
                   frame, as the frame is no card for Vue Flow to connect. Red: no part of the
                   object has them yet. -->
              <svg v-if="boundaryLinks.length > 0" class="pointer-events-none absolute top-0 left-0 size-px overflow-visible">
                <defs>
                  <marker id="boundary-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--destructive)" />
                  </marker>
                </defs>
                <path
                  v-for="link in boundaryLinks"
                  :key="link.key"
                  data-testid="boundary-connector"
                  :d="link.path"
                  fill="none"
                  stroke="var(--destructive)"
                  stroke-width="1.5"
                  marker-end="url(#boundary-arrow)"
                />
              </svg>
              <div
                v-for="link in boundaryLinks"
                :key="link.key"
                data-testid="boundary-relationship"
                role="img"
                :aria-label="link.says"
                class="boundary-label text-destructive pointer-events-none absolute top-0 left-0 rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap"
                :style="{ transform: `translate(-50%, -50%) translate(${link.labelX}px, ${link.labelY}px)` }"
              >
                {{ link.label }}
              </div>
              <div
                v-for="guide in hints.guides"
                :key="`${guide.upright} ${guide.at} ${guide.from}`"
                data-testid="alignment-guide"
                class="pointer-events-none absolute top-0 left-0 bg-emerald-500"
                :style="
                  guide.upright
                    ? {
                        transform: `translate(${guide.at}px, ${guide.from - GUIDE_OVERSHOOT}px)`,
                        width: '1px',
                        height: `${guide.to - guide.from + 2 * GUIDE_OVERSHOOT}px`,
                      }
                    : {
                        transform: `translate(${guide.from - GUIDE_OVERSHOOT}px, ${guide.at}px)`,
                        width: `${guide.to - guide.from + 2 * GUIDE_OVERSHOOT}px`,
                        height: '1px',
                      }
                "
              />
              <div
                v-for="gap in hints.gaps"
                :key="`${gap.upright} ${gap.from}`"
                data-testid="spacing-guide"
                class="pointer-events-none absolute top-0 left-0 flex items-center justify-center border-emerald-500"
                :class="gap.upright ? 'border-y-2' : 'border-x-2'"
                :style="
                  gap.upright
                    ? {
                        transform: `translate(${gap.at - GAP_MARK / 2}px, ${gap.from}px)`,
                        width: `${GAP_MARK}px`,
                        height: `${gap.to - gap.from}px`,
                      }
                    : {
                        transform: `translate(${gap.from}px, ${gap.at - GAP_MARK / 2}px)`,
                        width: `${gap.to - gap.from}px`,
                        height: `${GAP_MARK}px`,
                      }
                "
              >
                <div class="bg-emerald-500" :class="gap.upright ? 'h-full w-0.5' : 'h-0.5 w-full'" />
              </div>
              <div
                v-if="drag"
                data-testid="drop-preview"
                class="border-primary/70 bg-primary/5 pointer-events-none absolute rounded-xl border-2 border-dashed"
                :style="{
                  transform: `translate(${drag.place.x}px, ${drag.place.y}px)`,
                  width: `${cardSize(view, drag.id).width}px`,
                  height: `${cardSize(view, drag.id).height}px`,
                }"
              />
            </EdgeLabelRenderer>
          </div>
        </VueFlow>
      </div>

      <HistoryPanel
        v-if="showHistory"
        class="absolute top-3 right-3 z-20 max-h-[calc(100%-7.5rem)]"
        :entries="changes"
        :cursor="history.cursor"
        @go="travel"
      />

      <div
        v-if="nodes.length === 0"
        class="text-muted-foreground pointer-events-none absolute inset-0 grid place-content-center justify-items-center gap-3 text-sm"
      >
        <p>Nothing here yet. Add something from the bar below.</p>
        <Button
          v-if="workspace.model.objects.length === 0"
          variant="outline"
          class="pointer-events-auto"
          @click="loadExample"
        >
          Load an example
        </Button>
        <Button v-if="workspace.model.objects.length === 0" variant="outline" class="pointer-events-auto" @click="tour?.start()">
          Take the tour
        </Button>
        <Button
          v-if="kept && workspace.model.objects.length === 0 && history.log.length === 0"
          variant="outline"
          class="pointer-events-auto"
          title="The diagrams this browser kept before the app had a server, with their change log"
          @click="bringKept"
        >
          Bring the diagrams of this browser
        </Button>
      </div>

      <!-- What the quick menu started floats where the ring was. The sheet under it takes the
           click that leaves it. -->
      <Teleport to="body">
        <div v-if="floatAt && (addingKind || pickingExisting)" class="fixed inset-0 z-50" @pointerdown.self="stopAdding">
          <div
            class="float-panel bg-popover text-popover-foreground absolute rounded-2xl border p-1.5 shadow-xl"
            :style="floatStyle"
            @keydown.esc="stopAdding"
          >
            <AddObjectForm
              v-if="addingKind"
              v-model:name="newName"
              v-model:details="newDetails"
              :kind="addingKind"
              @add="commitAdding"
              @cancel="stopAdding"
            />
            <ExistingObjectPicker v-else class="w-72" :objects="existing" @pick="placeExisting" />
          </div>
        </div>
      </Teleport>

      <Teleport to="body">
        <div v-if="groupEditing && groupEdited" class="fixed inset-0 z-50" @pointerdown.self="groupEditing = undefined">
          <div class="float-panel bg-popover text-popover-foreground absolute rounded-2xl border p-2.5 shadow-xl" :style="groupEditStyle">
            <GroupForm :key="groupEditing.id" :edit="groupEdited" @submit="saveGroup" @remove="deleteGroup" />
          </div>
        </div>
        <div v-if="editing" class="fixed inset-0 z-50" @pointerdown.self="editing = undefined">
          <div
            class="float-panel bg-popover text-popover-foreground absolute rounded-2xl border p-1.5 shadow-xl"
            :style="editStyle"
          >
            <AddObjectForm
              v-model:name="editName"
              v-model:details="editDetails"
              :kind="editing.kind"
              edit
              @add="commitEditing"
              @cancel="editing = undefined"
            />
          </div>
        </div>
      </Teleport>

      <Teleport to="body">
        <div v-if="iconsOf" class="fixed inset-0 z-50" @pointerdown.self="iconsOf = undefined">
          <div class="float-panel bg-popover text-popover-foreground absolute rounded-2xl border shadow-xl" :style="iconsStyle">
            <IconPicker
              :attached="iconsAttached"
              @change="(icons: string[]) => iconsOf && dispatch({ type: 'objectIconsSet', object: iconsOf.id, icons })"
              @close="iconsOf = undefined"
            />
          </div>
        </div>
      </Teleport>

      <TourGuide ref="tour" :scene="tourScene" :fresh="fresh" :load="loadExample" :go="tourGo" :history="tourHistory" />

      <div
        role="toolbar"
        aria-label="Diagram tools"
        class="bg-popover/90 absolute bottom-4 left-1/2 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-1 rounded-2xl border p-1.5 shadow-lg backdrop-blur"
      >
        <AddObjectForm
          v-if="addingKind && !floatAt"
          v-model:name="newName"
          v-model:details="newDetails"
          :kind="addingKind"
          @add="commitAdding"
          @cancel="stopAdding"
        />

        <template v-else>
          <ShapePicker :kinds="kinds" @pick="(kind: ElementKind, technology?: string, shape?: BoxShape) => startAdding(kind, undefined, technology, shape)" />

          <span class="bg-border mx-1 h-5 w-px" aria-hidden="true" />

          <Popover :open="pickingExisting && !floatAt" @update:open="(open: boolean) => (open ? (pickingExisting = true) : stopAdding())">
            <PopoverTrigger as-child>
              <Button variant="ghost" size="lg" :disabled="existing.length === 0">
                <CopyPlusIcon aria-hidden="true" />
                Add existing object
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" class="w-72 p-0">
              <ExistingObjectPicker :objects="existing" @pick="placeExisting" />
            </PopoverContent>
          </Popover>

          <Popover v-if="selectedGroupable.length > 0" v-model:open="grouping">
            <PopoverTrigger as-child>
              <Button variant="ghost" size="lg" title="Put the selected cards in a frame with a name (Ctrl or Cmd with G)">
                <GroupIcon aria-hidden="true" />
                <!-- On a narrow screen the toolbar keeps its width: the two buttons show their signs only. -->
                <span class="max-lg:sr-only">Group</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" align="center" class="w-auto">
              <GroupForm :existing="view.groups ?? []" @submit="groupSelected" />
            </PopoverContent>
          </Popover>
          <Button v-if="selectedGrouped" variant="ghost" size="lg" title="Take the selected cards out of their frames" @click="ungroupSelected">
            <UngroupIcon aria-hidden="true" />
            <span class="max-lg:sr-only">Ungroup</span>
          </Button>
          <Button v-if="selected.length > 0" variant="ghost" size="lg" @click="removeSelected">
            <Trash2Icon aria-hidden="true" />
            Delete
          </Button>
        </template>
      </div>
    </div>
  </div>
</template>
