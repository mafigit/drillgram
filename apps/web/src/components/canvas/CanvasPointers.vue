<script setup lang="ts">
import { computed } from 'vue'
import { useEventListener } from '@vueuse/core'
import { storeToRefs, useVueFlowStore } from '@xyflow/vue'
import type { Sharing } from '../../collab/sharing'
import type { Pointer } from '../../collab/session'
import { pointerReporter } from './pointerReporter'

// The pointers of the others in a shared session (J19): each where its owner's mouse is on
// this diagram, with their name, in their colour. And this browser's own pointer, said to
// the others. A place is in the diagram's own measures, so it is the same card for everybody
// whatever part of the diagram each has on screen, at whatever zoom.
const props = defineProps<{
  sharing: Sharing
  /** The diagram that is open here: a pointer on another one is not shown. */
  view: string
}>()

const { transform, vueFlowRef } = storeToRefs(useVueFlowStore())

/** Often enough to follow a hand, seldom enough to be no burden: 20 times a second. */
const report = pointerReporter<Pointer>((at) => props.sharing.state.value === 'on' && props.sharing.point(at), 50)
useEventListener(vueFlowRef, 'pointermove', (event: PointerEvent) => {
  const canvas = vueFlowRef.value?.getBoundingClientRect()
  if (!canvas || props.sharing.state.value !== 'on') return
  const [x, y, zoom] = transform.value
  report.move({ view: props.view, x: (event.clientX - canvas.left - x) / zoom, y: (event.clientY - canvas.top - y) / zoom })
})
useEventListener(vueFlowRef, 'pointerleave', () => report.leave())

const shown = computed(() => {
  const [x, y, zoom] = transform.value
  return props.sharing.people.value.flatMap((person) => {
    const at = props.sharing.pointers.value[person.id]
    return at && at.view === props.view && person.id !== props.sharing.you.value ? [{ ...person, left: at.x * zoom + x, top: at.y * zoom + y }] : []
  })
})
</script>

<template>
  <!-- Over the cards and under the panels of the canvas; it takes no click. -->
  <div class="pointer-events-none absolute inset-0 z-4 overflow-hidden">
    <div
      v-for="person in shown"
      :key="person.id"
      role="img"
      :aria-label="`${person.name}'s pointer`"
      class="peer-pointer absolute top-0 left-0 flex items-start"
      :style="{ transform: `translate(${person.left}px, ${person.top}px)`, '--colour': `var(--line-${person.colour})` }"
    >
      <svg viewBox="0 0 16 16" class="size-4 shrink-0" aria-hidden="true">
        <path d="M1 1 L6.2 14.5 L8.3 8.3 L14.5 6.2 Z" fill="var(--colour)" stroke="var(--background)" stroke-width="1.2" stroke-linejoin="round" />
      </svg>
      <span class="peer-name mt-3 -ml-0.5 max-w-40 truncate rounded-md px-1.5 py-0.5 text-[11px] leading-tight font-medium whitespace-nowrap">{{ person.name }}</span>
    </div>
  </div>
</template>

<style scoped>
/* A pointer glides from one place said to the next. */
.peer-pointer {
  transition: transform 80ms linear;
}

.peer-name {
  background: var(--colour);
  color: var(--background);
}

@media (prefers-reduced-motion: reduce) {
  .peer-pointer {
    transition: none;
  }
}
</style>
