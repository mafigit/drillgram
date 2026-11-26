/** The font of connection labels: `.vue-flow__edge-text` in assets/main.css. */
const LABEL_FONT = '500 12px "Geist Variable", sans-serif'
const LINE_HEIGHT = 16
/** The background drawn around the text: `label-bg-padding` in ConnectionEdge.vue. */
const PADDING = { x: 6, y: 3 }

const sizes = new Map<string, { width: number; height: number }>()
let context: CanvasRenderingContext2D | null | undefined

/** The box a connection label takes on screen, so the layout engine can keep room for it. */
export function labelSize(text: string): { width: number; height: number } {
  let size = sizes.get(text)
  if (!size) {
    context ??= document.createElement('canvas').getContext('2d')
    if (context) context.font = LABEL_FONT
    // Without a canvas: a little more than the average letter of the font.
    const width = context ? context.measureText(text).width : text.length * 7
    size = { width: Math.ceil(width) + 2 * PADDING.x, height: LINE_HEIGHT + 2 * PADDING.y }
    sizes.set(text, size)
  }
  return size
}
