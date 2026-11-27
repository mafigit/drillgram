import { shallowRef } from 'vue'
import type { Point } from '@drillgram/model'

// Dragging a button of the toolbar ("Add shape", "Sticky note") onto the canvas: the new card
// lands where it is let go. A press without a move is still a press.

export type DragTool = 'box' | 'note'

/** The drag under way: what is dragged and where the pointer is on the screen. */
export const toolDrag = shallowRef<{ tool: DragTool; at: Point }>()

/** Pixels the pointer moves before a press becomes a drag. */
const MOVED = 5

type Drop = (tool: DragTool, at: Point) => void
let onDrop: Drop | undefined

/** Who takes a drag that is let go: the canvas. */
export function onToolDrop(drop: Drop): () => void {
  onDrop = drop
  return () => {
    if (onDrop === drop) onDrop = undefined
  }
}

export function startToolDrag(tool: DragTool, down: PointerEvent): void {
  if (down.button !== 0 || down.pointerType === 'touch') return
  const from = { x: down.clientX, y: down.clientY }
  const move = (event: PointerEvent) => {
    if (!toolDrag.value && Math.hypot(event.clientX - from.x, event.clientY - from.y) < MOVED) return
    if (!toolDrag.value) {
      window.getSelection()?.removeAllRanges()
      document.documentElement.classList.add('tool-dragging')
    }
    toolDrag.value = { tool, at: { x: event.clientX, y: event.clientY } }
  }
  const up = (event: PointerEvent) => {
    const dragged = toolDrag.value
    stop()
    if (!dragged) return
    // A drag let go on the button itself is followed by a click, which would open its form.
    const swallow = (click: MouseEvent) => (click.stopPropagation(), click.preventDefault())
    window.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }))
    onDrop?.(tool, { x: event.clientX, y: event.clientY })
  }
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape') stop()
  }
  const stop = () => {
    toolDrag.value = undefined
    document.documentElement.classList.remove('tool-dragging')
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', stop)
    window.removeEventListener('keydown', key)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', stop)
  window.addEventListener('keydown', key)
}
