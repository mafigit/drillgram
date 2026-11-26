<script setup lang="ts">
import { computed, inject } from 'vue'
import { BaseEdge, EdgeLabelRenderer, useInternalNode } from '@xyflow/vue'
import type { EdgeProps, InternalNode } from '@xyflow/vue'
import { Trash2Icon } from '@lucide/vue'
import { LINE_COLOURS } from '@drillgram/model'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CARD, elbow } from './geometry'
import type { Box } from './geometry'
import { labelSize } from './labelSize'
import { joins, routePath } from './routePath'
import { CANVAS_ACTIONS, CANVAS_DRAG } from './types'
import type { ConnectionEdge } from './types'

// A connector runs along the route the layout engine laid for it, around the cards. While one of
// its cards is dragged, that is the route to the place the card would land on: the connector
// shows how it will run after the drop, not where the card is under the hand. Without a route
// that fits (the engine has not answered yet, or several cards are dragged together) it runs from
// border to border with one bend at most, with the label in its middle. Never slanted.
const props = defineProps<EdgeProps<ConnectionEdge>>()

const actions = inject(CANVAS_ACTIONS)
const drag = inject(CANVAS_DRAG, undefined)
const source = useInternalNode(() => props.source)
const target = useInternalNode(() => props.target)

function box(node: InternalNode): Box {
  return {
    ...node.internals.positionAbsolute,
    width: node.measured.width ?? CARD.width,
    height: node.measured.height ?? CARD.height,
  }
}

const line = computed(() => {
  if (!source.value || !target.value) return undefined
  const from = box(source.value)
  const to = box(target.value)
  // The engine laid the route for the cards at their places, a dragged card at the place it would
  // land on, each with the size the diagram gives it ("Arrange" makes some cards larger).
  const placed = (node: InternalNode): Box => ({
    ...(drag?.value?.id === node.id ? drag.value.place : node.internals.positionAbsolute),
    width: node.width ?? CARD.width,
    height: node.height ?? CARD.height,
  })
  const route = props.data?.route
  const cards = [placed(source.value), placed(target.value)] as const
  if (route && joins(route, ...cards)) {
    const line = routePath(route)
    const corner = props.data?.labelAt
    if (typeof props.label !== 'string' || !corner) return line
    // The engine found the place for the label's box: where it covers the least.
    const size = labelSize(props.label)
    return { path: line.path, labelX: corner.x + size.width / 2, labelY: corner.y + size.height / 2 }
  }
  return routePath(elbow(from, to))
})

const vFocus = { mounted: (el: HTMLInputElement) => (el.focus(), el.select()) }
</script>

<template>
  <template v-if="line">
    <BaseEdge
      :id="id"
      :path="line.path"
      :label="label"
      :label-x="line.labelX"
      :label-y="line.labelY"
      label-show-bg
      :label-bg-padding="[6, 3]"
      :label-bg-border-radius="4"
      :marker-end="markerEnd"
      :style="data?.colour ? { stroke: `var(--line-${data.colour})` } : undefined"
    />
    <EdgeLabelRenderer v-if="data?.labelling && actions">
      <form
        class="nodrag nopan bg-popover pointer-events-auto absolute flex flex-col gap-1.5 rounded-lg border p-1 shadow-md"
        :style="{ transform: `translate(-50%, -50%) translate(${line.labelX}px, ${line.labelY}px)` }"
        @submit.prevent="actions.commitLabel()"
        @keydown.esc="actions.cancelLabel()"
      >
        <div class="flex gap-1">
        <Input
          v-model="actions.newLabel.value"
          v-focus
          aria-label="Relationship label"
          placeholder="What for? e.g. Sends orders to"
          class="h-8 w-56"
        />
        <Input
          v-model="actions.newTechnology.value"
          aria-label="Relationship technology"
          placeholder="How? e.g. HTTPS"
          class="h-8 w-32"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          class="text-muted-foreground"
          aria-label="Delete relationship"
          title="Delete this relationship"
          @click="actions.removeLabelled()"
        >
          <Trash2Icon aria-hidden="true" />
        </Button>
        </div>
        <!-- The colour of the line: a press colours it at once, the form stays open. -->
        <div role="radiogroup" aria-label="Colour" class="flex items-center gap-1.5 px-1 pb-0.5">
          <button
            v-for="colour in [undefined, ...LINE_COLOURS]"
            :key="colour ?? 'none'"
            type="button"
            role="radio"
            :aria-checked="actions.labelColour.value === colour"
            :aria-label="colour ? colour[0]!.toUpperCase() + colour.slice(1) : 'No colour'"
            :title="colour ? colour[0]!.toUpperCase() + colour.slice(1) : 'No colour'"
            class="line-swatch"
            :class="{ 'is-none': !colour }"
            :style="colour ? { background: `var(--line-${colour})` } : undefined"
            @click="actions.setColour(colour)"
          />
        </div>
        <button type="submit" class="sr-only">Save</button>
      </form>
    </EdgeLabelRenderer>
  </template>
</template>
