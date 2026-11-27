<script setup lang="ts">
import { computed } from 'vue'
import { getNodesBounds, storeToRefs, useVueFlow, useVueFlowStore } from '@xyflow/vue'
import { markList } from './cameraMarks'
import type { CameraMarks } from './cameraMarks'

// The camera marks (J73) on the minimap: a number where each one looks, big while M is pressed.
// Drawn inside the minimap's picture, which is in the diagram's own measures: sizes are scaled
// so that they stay the same on the screen however much of the diagram the minimap shows.
const props = defineProps<{
  marks: CameraMarks
  lit: boolean
  /** The minimap's size on the screen, in px. */
  width: number
  height: number
}>()

const { viewport, getNodes } = useVueFlow()
const store = useVueFlowStore()
const { nodeLookup } = store
const { dimensions } = storeToRefs(store)

/** Diagram units per px of the minimap, as Vue Flow's MiniMap works it out. */
const scale = computed(() => {
  const { x, y, zoom } = viewport.value
  const seen = { x: -x / zoom, y: -y / zoom, width: dimensions.value.width / zoom, height: dimensions.value.height / zoom }
  const cards = getNodesBounds(getNodes.value.filter((node) => !node.hidden), { nodeLookup })
  const left = Math.min(seen.x, cards.x)
  const top = Math.min(seen.y, cards.y)
  const right = Math.max(seen.x + seen.width, cards.x + cards.width)
  const bottom = Math.max(seen.y + seen.height, cards.y + cards.height)
  return Math.max((right - left) / props.width, (bottom - top) / props.height)
})

const shown = computed(() => markList(props.marks))
</script>

<template>
  <g
    v-for="mark in shown"
    :key="mark.mark"
    data-testid="minimap-mark"
    class="minimap-mark"
    :class="{ 'is-lit': lit }"
    :data-lit="String(lit)"
  >
    <circle :cx="mark.x" :cy="mark.y" :r="(lit ? 10 : 7) * scale" />
    <text :x="mark.x" :y="mark.y" :font-size="(lit ? 13 : 9) * scale" text-anchor="middle" dominant-baseline="central">{{ mark.mark }}</text>
  </g>
</template>
