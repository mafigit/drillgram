import {
  ROOT_VIEW_ID,
  applyEvent,
  connectable,
  describeEvent,
  diagramOfView,
  drillDown,
  groupable,
  openView,
  placeableObjects,
  viewTitle,
} from '@drillgram/model'
import type { Diagram, ElementKind, ObjectDetails, Point, View, Workspace, WorkspaceEvent } from '@drillgram/model'
import type { WorkspaceStore } from '../composables/useWorkspaceStore'
import { fileName, pngOfSvg, svgOf, textOf, toBase64 } from '../export/download'
import type { Scene } from '../export/svg'
import type { AgentTool } from './agentProtocol'
import { parseDiagramText } from './pastedKind'

export interface AgentEditor {
  store: WorkspaceStore
  workspace: () => Workspace
  view: () => View
  navigate: (viewId: string) => Promise<void>
  addBox: (kind: ElementKind, name: string, details: ObjectDetails, at?: Point) => WorkspaceEvent
  editBox: (id: string, name: string, details: ObjectDetails) => WorkspaceEvent
  showAdded: (before: Set<string>) => string | undefined
  copies: (ids: string[]) => { object: string; at: Point }[]
  arrange: (signal: AbortSignal, boxIds?: string[]) => Promise<void>
  importDiagram: (diagram: Diagram, signal: AbortSignal) => Promise<void>
  exportScene: () => Scene
  travel: (position: number) => Promise<boolean>
}

export async function runAgentTool(tool: AgentTool, editor: AgentEditor, signal: AbortSignal): Promise<Record<string, unknown>> {
  signal.throwIfAborted()
  const { store } = editor
  const workspace = editor.workspace()
  const view = editor.view()
  const viewId = view.id
  const model = workspace.model

  const box = (id: string) => {
    const found = model.objects.find((object) => object.id === id)
    if (!found) throw new Error(`Unknown box: ${id}.`)
    return found
  }
  const visible = (id: string) => {
    if (!Object.hasOwn(view.positions, id)) throw new Error(`Box ${id} is not on this view.`)
  }
  const relationship = (id: string) => {
    const found = model.connections.find((connection) => connection.id === id)
    if (!found) throw new Error(`Unknown relationship: ${id}.`)
    return found
  }
  const group = (id: string) => {
    const found = view.groups?.find((item) => item.id === id)
    if (!found) throw new Error(`Unknown group on this view: ${id}.`)
    return found
  }

  /** Capture the result of this change before awaiting storage, in case a person edits meanwhile. */
  async function commit(event: WorkspaceEvent, result: () => Record<string, unknown> = () => ({ changed: true })) {
    signal.throwIfAborted()
    const before = store.workspace.value
    const saved = store.dispatchSaved(event)
    if (store.workspace.value === before) return { changed: false }
    const answer = result()
    if (!(await saved)) throw new Error('Drillgram could not save this change. Check the diagram before retrying.')
    return answer
  }

  function viewSummary({ id, name, scope }: View) {
    return { id, name, scope, title: viewTitle(editor.workspace(), id) }
  }

  switch (tool.name) {
    case 'read_diagram': {
      const placed = new Set(Object.keys(view.positions))
      const connections = new Set(view.connections)
      return {
        ...diagramOfView(workspace, viewId),
        view: viewSummary(view),
        boxes: model.objects.filter(({ id }) => placed.has(id)),
        positions: view.positions,
        sizes: view.sizes ?? {},
        groups: view.groups ?? [],
        connections: model.connections.filter(({ id }) => connections.has(id)),
      }
    }
    case 'read_workspace':
      return {
        active_view_id: viewId,
        boxes: model.objects,
        relationships: model.connections,
        views: workspace.views.map(viewSummary),
      }
    case 'open_view': {
      const id = tool.args.view_id ?? drillDown(workspace, viewId, tool.args.inside_box_id!)?.viewId
      if (id === undefined || !openView(workspace, id).views.some((item) => item.id === id)) {
        throw new Error('That view or box is not in this workspace.')
      }
      await editor.navigate(id)
      return { view: viewSummary(editor.view()) }
    }
    case 'add_box': {
      const { kind, name, at, ...details } = tool.args
      const before = new Set(Object.keys(view.positions))
      return commit(editor.addBox(kind, name, details, at), () => ({
        id: editor.showAdded(before), name, kind,
      }))
    }
    case 'edit_box': {
      const { box_id: id, name, ...details } = tool.args
      const old = box(id)
      return commit(editor.editBox(id, name ?? old.name, details))
    }
    case 'delete_boxes':
      tool.args.box_ids.forEach(box)
      return commit({ type: 'objectsRemoved', objects: tool.args.box_ids })
    case 'place_box': {
      const { box_id: id, at } = tool.args
      box(id)
      if (!placeableObjects(workspace, viewId).some((object) => object.id === id)) {
        throw new Error('That box is already on this view or cannot be placed here.')
      }
      const before = new Set(Object.keys(view.positions))
      return commit({ type: 'objectPlaced', view: viewId, object: id, at }, () => ({ id: editor.showAdded(before) }))
    }
    case 'duplicate_boxes': {
      tool.args.box_ids.forEach(visible)
      const existing = new Set(model.objects.map(({ id }) => id))
      return commit({ type: 'objectsCopied', view: viewId, copies: editor.copies(tool.args.box_ids) }, () => ({
        boxes: editor.workspace().model.objects.filter(({ id }) => !existing.has(id)),
      }))
    }
    case 'move_boxes': {
      const moves = tool.args.moves.map(({ box_id, x, y }) => {
        visible(box_id)
        return { object: box_id, to: { x, y } }
      })
      const event = { type: 'objectsMoved', view: viewId, moves } as const
      const planned = applyEvent(workspace, event).views.find(({ id }) => id === viewId)!
      if (moves.some(({ object, to }) => planned.positions[object]?.x !== to.x || planned.positions[object]?.y !== to.y)) {
        throw new Error('The requested positions do not fit on this view.')
      }
      return commit(event)
    }
    case 'search_icons': {
      const { default: icons } = await import('virtual:tech-icons')
      const query = tool.args.query.toLowerCase()
      return {
        icons: icons.filter((icon) => icon.name.includes(query) || icon.title.toLowerCase().includes(query)).slice(0, tool.args.limit),
      }
    }
    case 'set_box_icons': {
      const { box_id: id, icons } = tool.args
      box(id)
      if (icons.length) {
        const { default: library } = await import('virtual:tech-icons')
        if (icons.some((name) => !library.some((icon) => icon.name === name))) {
          throw new Error('Unknown icon. Use search_icons to find its name.')
        }
        if (editor.workspace() !== workspace) throw new Error('The diagram changed. Try again.')
      }
      return commit({ type: 'objectIconsSet', object: id, icons })
    }
    case 'add_relationship': {
      const { from, to, label, technology } = tool.args
      if (!connectable(workspace, viewId, from, to)) {
        throw new Error('These boxes cannot be connected on this view. Check the diagram and their IDs.')
      }
      return commit({ type: 'connected', view: viewId, from, to, label, technology }, () => ({
        ...editor.workspace().model.connections.at(-1)!,
      }))
    }
    case 'edit_relationship': {
      const { relationship_id: id, label, technology } = tool.args
      const old = relationship(id)
      return commit({ type: 'connectionLabelled', connection: id, label: label ?? old.label ?? '', technology })
    }
    case 'set_relationship_color': {
      const { relationship_id: id, color } = tool.args
      relationship(id)
      return commit({ type: 'connectionColoured', connection: id, colour: color ?? undefined })
    }
    case 'delete_relationships':
      tool.args.relationship_ids.forEach(relationship)
      return commit({ type: 'connectionsRemoved', connections: tool.args.relationship_ids })
    case 'group_boxes': {
      const { box_ids: objects, name, description } = tool.args
      if (groupable(workspace, viewId, objects).length !== objects.length) {
        throw new Error('These boxes cannot all be grouped on this view.')
      }
      return commit({ type: 'cardsGrouped', view: viewId, objects, name, what: description }, () => ({
        ...editor.view().groups?.find((item) => item.name === name),
      }))
    }
    case 'edit_group': {
      const { group_id: id, name, description } = tool.args
      const old = group(id)
      return commit({ type: 'groupEdited', view: viewId, group: id, name: name ?? old.name, what: description ?? old.type ?? '' })
    }
    case 'ungroup_boxes':
      tool.args.box_ids.forEach(visible)
      return commit({ type: 'cardsUngrouped', view: viewId, objects: tool.args.box_ids })
    case 'delete_group':
      group(tool.args.group_id)
      return commit({ type: 'groupRemoved', view: viewId, group: tool.args.group_id })
    case 'create_view': {
      const { name, copy } = tool.args
      const made = await commit({ type: 'viewAdded', view: viewId, name, copy }, () => ({
        ...viewSummary(editor.workspace().views.at(-1)!),
      }))
      if (typeof made.id === 'string' && editor.view().id === viewId && !signal.aborted) await editor.navigate(made.id)
      return made
    }
    case 'rename_view':
    case 'delete_view': {
      const id = tool.args.view_id
      const target = workspace.views.find((item) => item.id === id)
      if (!target?.name) throw new Error('Choose an added view. Its first view cannot be renamed or deleted.')
      if (tool.name === 'rename_view') return commit({ type: 'viewRenamed', view: id, name: tool.args.name })
      const fallback = workspace.views.find((item) => item.scope === target.scope && item.name === undefined)
      const result = await commit({ type: 'viewRemoved', view: id })
      if (viewId === id && editor.view().id === ROOT_VIEW_ID && fallback && !signal.aborted) await editor.navigate(fallback.id)
      return result
    }
    case 'arrange_diagram': {
      const { box_ids: ids } = tool.args
      ids?.forEach(visible)
      await editor.arrange(signal, ids)
      return { view_id: viewId }
    }
    case 'load_example': {
      if (model.objects.length) throw new Error('The example needs an empty workspace.')
      return commit({ type: 'exampleLoaded' }, () => {
        editor.showAdded(new Set())
        return { view_id: viewId }
      })
    }
    case 'import_diagram':
      await editor.importDiagram(parseDiagramText(tool.args.format, tool.args.text), signal)
      return { view_id: viewId }
    case 'export_diagram': {
      const { format } = tool.args
      const file_name = fileName(viewTitle(workspace, viewId), format)
      if (format === 'mermaid' || format === 'd2') {
        return { file_name, format, text: textOf(diagramOfView(workspace, viewId), format) }
      }
      const svg = await svgOf(editor.exportScene())
      if (format === 'svg') return { file_name, format, text: svg }
      const png = await pngOfSvg(svg)
      return { file_name, format, png_base64: toBase64(await png.arrayBuffer()) }
    }
    case 'read_history': {
      const { log, cursor, states } = store.history.value
      const { after, limit } = tool.args
      return {
        position: cursor,
        total: log.length,
        entries: log.slice(after, after + limit).map(({ at, event }, index) => {
          const before = after + index
          return { position: before + 1, at, text: describeEvent(states[before]!, event) }
        }),
      }
    }
    case 'move_history': {
      const { cursor, log } = store.history.value
      const { action, position } = tool.args
      const to = action === 'undo' ? cursor - 1 : action === 'redo' ? cursor + 1 : position
      if (to === undefined || to < 0 || to > log.length) throw new Error('No history entry at that position.')
      if (to !== cursor && !(await editor.travel(to))) throw new Error('Drillgram could not save the history position.')
      return { position: to, total: log.length }
    }
    default:
      throw new Error('This tab does not support that tool. Reload Drillgram and start sharing again.')
  }
}
