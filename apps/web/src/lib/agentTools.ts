import { BOX_SHAPES, COLUMN_KEYS, LINE_COLOURS, MAX_ICONS } from '@drillgram/model'
import { z } from 'zod'

const id = z.string().min(1).max(500)
const ids = z.array(id).min(1).max(100).refine((list) => new Set(list).size === list.length, 'Use each ID once.')
const name = z.string().trim().min(1).max(200)
const short = z.string().trim().max(200)
const text = z.string().trim().max(20_000)
const coordinate = z.number().min(-1_000_000).max(1_000_000)
const position = z.object({ x: coordinate, y: coordinate })
const details = {
  description: text.optional(),
  technology: short.optional(),
  external: z.boolean().optional(),
  shape: z.union([z.enum(BOX_SHAPES), z.literal('')]).optional(),
  columns: z.array(z.object({ name, type: short.optional(), key: z.enum(COLUMN_KEYS).optional() })).max(100).optional(),
}

type Effect = 'read' | 'add' | 'edit' | 'navigate'
function tool<S extends z.ZodType>(description: string, schema: S, effect: Effect = 'edit') {
  return { description, schema, effect }
}

/** The MCP input schemas also define the messages the Worker sends to the tab. */
export const agentTools = {
  read_diagram: tool('Read the visible diagram, including canonical box IDs, positions, groups and direct relationships.', z.object({}), 'read'),
  read_workspace: tool('List all boxes, relationships and views in this workspace. Use the returned IDs in editing tools.', z.object({}), 'read'),
  open_view: tool('Show a view by ID, or drill into a box by ID. The Overview ID is landscape. Supply exactly one ID.',
    z.object({ view_id: id.optional(), inside_box_id: id.optional() }).refine(
      (args) => Boolean(args.view_id) !== Boolean(args.inside_box_id), 'Supply either a view ID or a box ID.',
    ), 'navigate'),
  add_box: tool('Add a box to the visible diagram. Use an empty shape to select the default outline.',
    z.object({ name, kind: z.enum(['box', 'person', 'softwareSystem', 'container', 'component', 'code']).default('box'), ...details, at: position.optional() }), 'add'),
  edit_box: tool('Change a box by ID. Omit details to keep them. Empty text, an empty shape, or an empty column list clears that field.',
    z.object({ box_id: id, name: name.optional(), ...details })),
  delete_boxes: tool('Delete boxes from the workspace, including their contents and relationships. The change can be undone.',
    z.object({ box_ids: ids })),
  place_box: tool('Put an existing box on the visible view without duplicating it.',
    z.object({ box_id: id, at: position.optional() }), 'add'),
  duplicate_boxes: tool('Copy boxes on the current view, keeping their details but excluding their contents and relationships.',
    z.object({ box_ids: ids }), 'add'),
  move_boxes: tool('Move visible boxes to canvas coordinates in pixels. The move is refused if the requested positions do not fit.',
    z.object({ moves: z.array(z.object({ box_id: id, x: coordinate, y: coordinate })).min(1).max(100)
      .refine((moves) => new Set(moves.map(({ box_id }) => box_id)).size === moves.length, 'Use each box ID once.') })),
  search_icons: tool('Search the editor icon library by name or title. Use returned names in set_box_icons.',
    z.object({ query: name, limit: z.number().int().min(1).max(50).default(20) }), 'read'),
  set_box_icons: tool('Set the icon on a box using a name from search_icons. An empty list clears it.',
    z.object({ box_id: id, icons: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]*$/).max(200)).max(MAX_ICONS) })),
  add_relationship: tool('Connect two boxes shown on the current view. The relationship goes from the first box to the second.',
    z.object({ from: id, to: id, label: short.optional(), technology: short.optional() }), 'add'),
  edit_relationship: tool('Change a relationship label or technology. Omit a field to keep it; pass empty text to clear it.',
    z.object({ relationship_id: id, label: short.optional(), technology: short.optional() })),
  set_relationship_color: tool('Set the color of a relationship. Use null to restore the default color.',
    z.object({ relationship_id: id, color: z.enum(LINE_COLOURS).nullable() })),
  delete_relationships: tool('Delete relationships by ID from all views. The change can be undone.',
    z.object({ relationship_ids: ids })),
  group_boxes: tool('Put boxes in a named frame on the visible view. A matching name adds the boxes to that frame.',
    z.object({ box_ids: ids, name, description: short.optional() })),
  edit_group: tool('Rename a frame on the visible view or change its description.',
    z.object({ group_id: id, name: name.optional(), description: short.optional() })),
  ungroup_boxes: tool('Take visible boxes out of their group frames.',
    z.object({ box_ids: ids })),
  delete_group: tool('Remove a frame from the visible view and keep its boxes.',
    z.object({ group_id: id })),
  create_view: tool('Add and open a view of the current scope. Copy the current cards and layout when copy is true.',
    z.object({ name, copy: z.boolean().default(false) }), 'add'),
  rename_view: tool('Rename a view that was added to a box or to the Overview.',
    z.object({ view_id: id, name })),
  delete_view: tool('Delete an added view and keep its boxes in the workspace.',
    z.object({ view_id: id })),
  arrange_diagram: tool('Arrange the visible diagram or a selection of at least two boxes with the editor layout engine.',
    z.object({ box_ids: ids.optional() })),
  load_example: tool('Load the example bookshop into an empty workspace as one undoable edit.', z.object({}), 'add'),
  import_diagram: tool('Import Mermaid C4, Mermaid flowchart or D2 text into the visible diagram as one undoable edit.',
    z.object({ format: z.enum(['mermaid', 'd2']), text: z.string().min(1).max(200_000) }), 'add'),
  export_diagram: tool('Export the visible diagram as Mermaid, D2, SVG, or a PNG image.',
    z.object({ format: z.enum(['mermaid', 'd2', 'svg', 'png']) }), 'read'),
  read_history: tool('Read positions and descriptions from this workspace change history.',
    z.object({ after: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(50) }), 'read'),
  move_history: tool('Undo, redo, or move to a history position. Position 0 is the initial workspace.',
    z.object({
      action: z.enum(['undo', 'redo', 'go_to']),
      position: z.number().int().min(0).optional(),
    }).refine(
      ({ action, position }) => action === 'go_to' ? position !== undefined : position === undefined,
      'Supply a position only for go_to.',
    )),
} as const

export type AgentToolName = keyof typeof agentTools
export type AgentTool = {
  [Name in AgentToolName]: { name: Name; args: z.output<(typeof agentTools)[Name]['schema']> }
}[AgentToolName]
