<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useElementSize } from '@vueuse/core'
import { BaseEdge, EdgeLabelRenderer, storeToRefs, useInternalNode, useVueFlowStore } from '@xyflow/vue'
import type { EdgeProps, InternalNode } from '@xyflow/vue'
import { Trash2Icon } from '@lucide/vue'
import { LINE_COLOURS } from '@drillgram/model'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CARD, elbow } from './geometry'
import type { Box } from './geometry'
import { labelSize } from './labelSize'
import { toOutlines } from './outlineEnds'
import { joins, routePath } from './routePath'
import { CANVAS_ACTIONS, CANVAS_DRAG } from './types'
import type { ConnectionEdge, ObjectNode } from './types'

// A connector runs along the route the layout engine laid for it, around the cards. While one of
// its cards is dragged, that is the route to the place the card would land on: the connector
// shows how it will run after the drop, not where the card is under the hand. Without a route
// that fits (the engine has not answered yet, or several cards are dragged together) it runs from
// border to border with one bend at most, with the label in its middle. Never slanted. At a card
// drawn as a shape (a diamond, a speech bubble) it runs on to the outline (outlineEnds.ts).
const props = defineProps<EdgeProps<ConnectionEdge>>()

const actions = inject(CANVAS_ACTIONS)
const drag = inject(CANVAS_DRAG, undefined)
const source = useInternalNode(() => props.source)
const target = useInternalNode(() => props.target)

const shapeOf = (node: InternalNode) => (node.data as ObjectNode['data'] | undefined)?.shape

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
  const [fromShape, toShape] = [shapeOf(source.value), shapeOf(target.value)]
  const route = props.data?.route
  const cards = [placed(source.value), placed(target.value)] as const
  if (route && joins(route, ...cards)) {
    const line = routePath(toOutlines(route, { ...cards[0], shape: fromShape }, { ...cards[1], shape: toShape }))
    const corner = props.data?.labelAt
    if (typeof props.label !== 'string' || !corner) return line
    // The engine found the place for the label's box: where it covers the least.
    const size = labelSize(props.label)
    return { path: line.path, labelX: corner.x + size.width / 2, labelY: corner.y + size.height / 2 }
  }
  return routePath(toOutlines(elbow(from, to), { ...from, shape: fromShape }, { ...to, shape: toShape }))
})

const vFocus = { mounted: (el: HTMLInputElement) => (el.focus(), el.select()) }

// The form for the label is drawn on the canvas, by the line. Where the diagram is shown small
// (a big one on a phone) it keeps its own size, and it stays on the screen: what is typed is as
// big as on any form, and the form is never half outside.
const { transform, dimensions } = storeToRefs(useVueFlowStore())
const form = ref<HTMLElement>()
const formSize = useElementSize(form, undefined, { box: 'border-box' })
/** Between the form and the edge of the canvas, in px of the screen. */
const EDGE = 8
const formStyle = computed(() => {
  if (!line.value) return undefined
  const [x, y, zoom] = transform.value
  const scale = Math.max(1, 1 / zoom)
  const [width, height] = [formSize.width.value * scale * zoom, formSize.height.value * scale * zoom]
  const within = (at: number, half: number, size: number) => (size < 2 * (half + EDGE) ? size / 2 : Math.min(Math.max(at, half + EDGE), size - half - EDGE))
  const centreX = within(line.value.labelX * zoom + x, width / 2, dimensions.value.width)
  const centreY = within(line.value.labelY * zoom + y, height / 2, dimensions.value.height)
  return {
    transform: `translate(${(centreX - x) / zoom}px, ${(centreY - y) / zoom}px) scale(${scale}) translate(-50%, -50%)`,
    transformOrigin: '0 0',
  }
})
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
        ref="form"
        class="nodrag nopan bg-popover pointer-events-auto absolute flex flex-col max-sm:max-w-[22rem] gap-1.5 rounded-lg border p-1 shadow-md"
        :style="formStyle"
        @submit.prevent="actions.commitLabel()"
        @keydown.esc="actions.cancelLabel()"
      >
        <!-- On a narrow screen the technology goes to a line of its own. -->
        <div class="flex flex-wrap gap-1">
        <Input
          v-model="actions.newLabel.value"
          v-focus
          aria-label="Relationship label"
          placeholder="What for? e.g. Sends orders to"
          class="h-8 w-56 grow"
        />
        <Input
          v-model="actions.newTechnology.value"
          aria-label="Relationship technology"
          placeholder="How? e.g. HTTPS"
          class="h-8 w-32 grow"
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
