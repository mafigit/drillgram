/** Ctrl on most keyboards, the command key on a Mac. */
const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

/**
 * What the keyboard and the mouse do on the canvas, for the legend. The keys themselves are
 * handled in DiagramEditor.vue, CanvasMarks.vue (camera marks) and by Vue Flow for the selection:
 * keep them in step.
 */
export const SHORTCUTS: { what: string; keys: string[] }[] = [
  { what: 'Search', keys: [MOD, 'K'] },
  { what: 'Arrange', keys: ['A'] },
  { what: 'Set a camera mark', keys: ['Hold M', '1–9'] },
  { what: 'Jump to a camera mark', keys: ['M', '1–9'] },
  { what: 'Comment: click where it goes', keys: ['C'] },
  { what: 'Undo', keys: [MOD, 'Z'] },
  { what: 'Redo', keys: [MOD, 'Shift', 'Z'] },
  { what: 'Copy the selection', keys: [MOD, 'D'] },
  { what: 'Group the selection', keys: [MOD, 'G'] },
  { what: 'Delete the selection', keys: ['Delete'] },
  { what: 'Add to the selection', keys: [MOD, 'Click'] },
  { what: 'Select with a frame', keys: ['Shift', 'Drag'] },
  { what: 'Write a name, a text or a connector label', keys: ['Double-click'] },
  { what: 'Quick menu', keys: ['Right-click'] },
]
