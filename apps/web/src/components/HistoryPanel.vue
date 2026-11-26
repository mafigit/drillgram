<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

// The change log as a timeline: drag the slider, turn the wheel over it or click a change to see
// the diagram as it was then. Changes after that point stay in the log until a new change comes.
const props = defineProps<{
  /** Every change, oldest first. */
  entries: { text: string; at: string }[]
  /** How many of them are applied. */
  cursor: number
}>()
const emit = defineEmits<{ go: [position: number] }>()

const time = (at: string) => new Date(at).toLocaleTimeString()
const date = (at: string) => new Date(at).toLocaleString()

// One step per notch of a wheel (100 px, or 3 lines); a touchpad adds up to that.
const NOTCH = 100
let turned = 0
function onWheel(event: WheelEvent) {
  turned += event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 34 : event.deltaY
  const steps = Math.trunc(turned / NOTCH)
  if (steps === 0) return
  turned -= steps * NOTCH
  emit('go', props.cursor + steps)
}

const list = ref<HTMLElement>()
watch(
  () => [props.cursor, props.entries.length],
  async () => {
    await nextTick()
    // jsdom has no scrollIntoView.
    list.value?.querySelector('[aria-current]')?.scrollIntoView?.({ block: 'nearest' })
  },
  { immediate: true },
)
</script>

<template>
  <aside
    aria-label="History"
    class="bg-popover/90 flex w-72 flex-col gap-2 rounded-2xl border p-3 text-sm shadow-lg backdrop-blur"
  >
    <h2 class="flex items-baseline justify-between font-semibold">
      History
      <span class="text-muted-foreground text-xs font-normal">{{ cursor }} of {{ entries.length }}</span>
    </h2>
    <input
      type="range"
      aria-label="Timeline"
      class="accent-primary w-full"
      min="0"
      :max="entries.length"
      step="1"
      :value="cursor"
      :disabled="entries.length === 0"
      :aria-valuetext="entries[cursor - 1]?.text ?? 'Start'"
      @input="emit('go', Number(($event.target as HTMLInputElement).value))"
      @wheel.prevent="onWheel"
    />
    <p v-if="entries.length === 0" class="text-muted-foreground">No changes yet.</p>
    <ol v-else ref="list" aria-label="Change log" class="-mx-1 flex min-h-0 flex-col overflow-y-auto">
      <li
        v-for="(entry, i) in entries"
        :key="i"
        :class="{ 'opacity-50': i >= cursor }"
      >
        <button
          type="button"
          class="hover:bg-accent flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left"
          :class="{ 'bg-accent font-medium': i === cursor - 1 }"
          :aria-current="i === cursor - 1 ? 'step' : undefined"
          @click="emit('go', i + 1)"
        >
          <span class="min-w-0 flex-1 break-words">{{ entry.text }}</span>
          <time :datetime="entry.at" :title="date(entry.at)" class="text-muted-foreground shrink-0 text-xs">
            {{ time(entry.at) }}
          </time>
        </button>
      </li>
    </ol>
  </aside>
</template>
