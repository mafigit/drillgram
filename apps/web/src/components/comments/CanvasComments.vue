<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { useEventListener } from '@vueuse/core'
import { storeToRefs, useVueFlowStore } from '@xyflow/vue'
import type { Point } from '@drillgram/model'
import CommentCard from './CommentCard.vue'
import { initialOf, pinColour } from './author'
import type { Comments } from './useComments'

// Comments on the canvas (J17): a pin for each open thread of the diagram, a speech bubble
// whose tip is where it was placed, the same size at any zoom. While "Comment" is pressed, a
// click on the canvas or a card places a new one there (and does nothing else: no selection, no
// drag). The card of the open one floats beside its pin.
const props = defineProps<{ comments: Comments }>()

const { transform, vueFlowRef } = storeToRefs(useVueFlowStore())

/** A point of the diagram on the screen, from the canvas' top left corner. */
const onScreen = (at: Point): Point => {
  const [x, y, zoom] = transform.value
  return { x: at.x * zoom + x, y: at.y * zoom + y }
}

const pins = computed(() =>
  props.comments.pins.value.map((thread) => {
    const first = thread.comments[0]!
    return { id: thread.id, author: first.author, text: first.text, count: thread.comments.length, ...onScreen(thread.place) }
  }),
)
const draft = computed(() => {
  const opened = props.comments.opened.value
  return opened && 'draft' in opened ? onScreen(opened.draft.at) : undefined
})

// Placing: the click lands on a card or on the canvas, not on a panel over it.
watchEffect(() => vueFlowRef.value?.classList.toggle('is-commenting', props.comments.placing.value))
useEventListener(
  vueFlowRef,
  'click',
  (event: MouseEvent) => {
    if (!props.comments.placing.value) return
    const target = event.target as Element
    if (target.closest('.vue-flow__panel, .vue-flow__minimap, .comment-pin')) return
    event.stopPropagation()
    event.preventDefault()
    const canvas = vueFlowRef.value!.getBoundingClientRect()
    const [x, y, zoom] = transform.value
    const at = { x: (event.clientX - canvas.left - x) / zoom, y: (event.clientY - canvas.top - y) / zoom }
    const card = target.closest('.vue-flow__node')?.getAttribute('data-id') ?? undefined
    props.comments.place(at, { x: event.clientX, y: event.clientY }, card)
  },
  { capture: true },
)
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return
  if (props.comments.placing.value) props.comments.placing.value = false
  else if (props.comments.opened.value) props.comments.opened.value = undefined
})

function openPin(id: string, event: MouseEvent) {
  const pin = (event.currentTarget as Element).getBoundingClientRect()
  props.comments.opened.value = { thread: id, screen: { x: pin.right, y: pin.top } }
}

// The card beside the pin, on the screen whatever the pin's place.
const CARD_WIDTH = 336
const cardStyle = computed(() => {
  const at = props.comments.opened.value?.screen
  if (!at) return {}
  const left = Math.max(16, Math.min(at.x + 12, window.innerWidth - CARD_WIDTH - 16))
  const top = Math.max(16, Math.min(at.y - 8, window.innerHeight - 360))
  return { left: `${left}px`, top: `${top}px` }
})
const open = computed(() => {
  const opened = props.comments.opened.value
  if (!opened) return undefined
  if ('draft' in opened) return { thread: undefined }
  const thread = props.comments.openThread.value
  return thread && { thread }
})
const close = () => (props.comments.opened.value = undefined)
</script>

<template>
  <!-- Over the cards and under the panels of the canvas; only the pins take a click. -->
  <div class="pointer-events-none absolute inset-0 z-4 overflow-hidden">
    <button
      v-for="pin in pins"
      :key="pin.id"
      type="button"
      class="comment-pin nodrag nopan pointer-events-auto absolute top-0 left-0"
      :data-thread="pin.id"
      :aria-label="`Comment by ${pin.author}: ${pin.text}`"
      :title="`${pin.author}: ${pin.text}`"
      :style="{ transform: `translate(${pin.x}px, ${pin.y - 36}px)`, '--colour': `var(--line-${pinColour(pin.author)})` }"
      @click.stop="openPin(pin.id, $event)"
    >
      <span class="comment-bubble">{{ initialOf(pin.author) }}</span>
      <span v-if="pin.count > 1" class="comment-count">{{ pin.count }}</span>
    </button>
    <span
      v-if="draft"
      class="comment-pin is-draft absolute top-0 left-0"
      aria-hidden="true"
      :style="{ transform: `translate(${draft.x}px, ${draft.y - 36}px)`, '--colour': 'var(--primary)' }"
    >
      <span class="comment-bubble">{{ comments.author.value ? initialOf(comments.author.value) : '?' }}</span>
    </span>
  </div>

  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50" @pointerdown.self="close">
      <div class="float-panel bg-popover text-popover-foreground absolute rounded-2xl border p-3 shadow-xl" :style="cardStyle">
        <CommentCard
          :key="open.thread?.id ?? 'new'"
          :thread="open.thread"
          :author="comments.author.value"
          @post="(text: string, name?: string) => comments.post(text, name)"
          @reply="(text: string, name?: string) => open?.thread && comments.reply(open.thread.id, text, name)"
          @resolve="open?.thread && comments.resolve(open.thread.id)"
          @reopen="open?.thread && comments.reopen(open.thread.id)"
          @remove="open?.thread && comments.remove(open.thread.id)"
          @close="close"
        />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* A speech bubble whose lower left corner is its tip, as big as a fingertip. */
.comment-pin {
  width: 36px;
  height: 36px;
  border-radius: 50% 50% 50% 0;
  padding: 3px;
  background: var(--background);
  box-shadow:
    0 1px 2px rgb(0 0 0 / 0.2),
    0 4px 12px rgb(0 0 0 / 0.15);
  cursor: pointer;
}
.comment-pin:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
.comment-bubble {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  border-radius: 50% 50% 50% 0;
  background: var(--colour);
  color: var(--background);
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
}
.comment-pin.is-draft {
  opacity: 0.85;
}
.comment-count {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background: var(--foreground);
  color: var(--background);
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
}
</style>

<style>
/* "Comment" is pressed: a click places one, on the canvas or a card. */
.vue-flow.is-commenting .vue-flow__pane,
.vue-flow.is-commenting .vue-flow__node,
.vue-flow.is-commenting .vue-flow__node * {
  cursor: crosshair !important;
}
</style>
