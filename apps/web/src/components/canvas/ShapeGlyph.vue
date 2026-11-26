<script setup lang="ts">
import { computed } from 'vue'
import type { BoxShape } from '@drillgram/model'
import { boxShape } from './shapes'

// A shape drawn small, for a list of shapes: the same paths as on a card (shapes.ts). A shape
// without an outline (a text, a comment) shows where it is as a faint dashed box.
const props = defineProps<{ shape: BoxShape }>()
const drawing = computed(() => boxShape(props.shape, 24, 16))
</script>

<template>
  <svg class="size-5" viewBox="-1 -1 26 18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
    <path v-if="drawing.look === 'none'" :d="drawing.outline" stroke-width="1" stroke-dasharray="2 2" opacity="0.5" />
    <path v-else :d="drawing.outline" :stroke="drawing.look === 'ground' ? 'none' : undefined" :fill="drawing.look === 'solid' ? 'currentColor' : undefined" />
    <path v-for="line in drawing.lines" :key="line" :d="line" />
  </svg>
</template>
