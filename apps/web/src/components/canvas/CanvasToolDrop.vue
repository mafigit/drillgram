<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { useVueFlow } from '@xyflow/vue'
import { CARD, STICKY_NOTE } from '@drillgram/model'
import type { Point } from '@drillgram/model'
import { onToolDrop, toolDrag } from '../../composables/useToolDrag'
import type { DragTool } from '../../composables/useToolDrag'

// A button of the toolbar dragged onto the canvas: an outline of the card follows the pointer,
// as big as the card will be at this zoom. Let go on the canvas, the card is wanted there.
const emit = defineEmits<{
  /** Let go over the canvas: what was dragged, where on the screen, and that point of the diagram. */
  drop: [tool: DragTool, screen: Point, at: Point]
}>()

const { screenToFlowPosition, viewport } = useVueFlow()

/** Over the canvas itself or a card on it, not over a panel or the toolbar above it. */
const overCanvas = (at: Point) => document.elementFromPoint(at.x, at.y)?.closest('.vue-flow__pane, .vue-flow__node') != null

onBeforeUnmount(onToolDrop((tool, screen) => {
  if (overCanvas(screen)) emit('drop', tool, screen, screenToFlowPosition(screen))
}))

const ghost = computed(() => {
  const drag = toolDrag.value
  if (!drag) return undefined
  const size = drag.tool === 'note' ? STICKY_NOTE : CARD
  const [width, height] = [size.width * viewport.value.zoom, size.height * viewport.value.zoom]
  return { note: drag.tool === 'note', style: { left: `${drag.at.x - width / 2}px`, top: `${drag.at.y - height / 2}px`, width: `${width}px`, height: `${height}px` } }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="ghost" data-testid="tool-drag-ghost" class="tool-drag-ghost" :class="{ 'is-note': ghost.note }" :style="ghost.style" aria-hidden="true" />
  </Teleport>
</template>

<style scoped>
.tool-drag-ghost {
  position: fixed;
  z-index: 60;
  pointer-events: none;
  border: 2px dashed var(--primary);
  border-radius: 12px;
  background: color-mix(in oklab, var(--primary) 8%, transparent);
}
.tool-drag-ghost.is-note {
  border-radius: 4px;
  background: color-mix(in oklab, var(--note) 70%, transparent);
}
</style>
