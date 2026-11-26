<script setup lang="ts">
import { ref } from 'vue'
import { Panel } from '@xyflow/vue'
import { useNarrow } from '../../composables/useTouch'
import { ChevronUpIcon } from '@lucide/vue'
import type { ElementKind } from '@drillgram/model'
import { KIND_ICON, KIND_LABEL } from './kinds'

// C4 asks every diagram for a key that explains its notation (c4model.com/diagrams/notation).
// It lists only what is on the diagram.
defineProps<{
  kinds: ElementKind[]
  external: boolean
  relationships: boolean
  /** Connectors run to the frame: what the opened object is connected to, no part of it yet. */
  toFrame: boolean
  /** The view has frames around cards (groups). */
  groups?: boolean
}>()

// On a phone the key would cover a good part of the diagram: it folds into its name.
const narrow = useNarrow()
const unfolded = ref(false)
</script>

<template>
  <!-- Bottom left: new cards start top left and grow to the right, so this corner stays free longest. -->
  <!-- On a phone above the toolbar of the canvas, which takes the whole width there. -->
  <Panel v-if="kinds.length > 0" position="bottom-left" class="mb-6! max-sm:mb-20!">
    <div class="bg-popover/90 max-w-40 rounded-xl border px-3 py-2 text-xs shadow-sm backdrop-blur">
      <button
        v-if="narrow"
        type="button"
        class="text-muted-foreground flex w-full items-center justify-between gap-2 font-medium tracking-wide uppercase"
        :class="{ 'mb-1.5': unfolded }"
        :aria-expanded="unfolded"
        aria-label="Key"
        @click="unfolded = !unfolded"
      >
        Key
        <ChevronUpIcon class="size-3.5 transition-transform" :class="{ 'rotate-180': unfolded }" aria-hidden="true" />
      </button>
      <p v-else class="text-muted-foreground mb-1.5 font-medium tracking-wide uppercase">Key</p>
      <ul v-if="!narrow || unfolded" aria-label="Key" class="flex flex-col gap-1.5">
        <li v-for="kind in kinds" :key="kind" class="flex items-center gap-2">
          <!-- No colours: a card says its kind in words, on its last line. -->
          <span class="bg-muted text-muted-foreground grid size-5 place-items-center rounded-md">
            <component :is="KIND_ICON[kind]" class="size-3" aria-hidden="true" />
          </span>
          {{ KIND_LABEL[kind] }}
        </li>
        <li v-if="external" class="flex items-center gap-2">
          <span class="bg-muted size-5 shrink-0 rounded-md border" />
          External: not ours
        </li>
        <li v-if="groups" class="flex items-center gap-2">
          <span class="card-group size-5 shrink-0 rounded-md border border-dashed" />
          Group
        </li>
        <li v-if="relationships" class="flex items-center gap-2">
          <svg class="text-muted-foreground h-2 w-5 shrink-0" viewBox="0 0 20 8" aria-hidden="true">
            <path d="M0 4h15" stroke="currentColor" stroke-width="1.5" />
            <path d="M14 1l6 3-6 3z" fill="currentColor" />
          </svg>
          Relationship
        </li>
        <li v-if="toFrame" class="flex items-center gap-2">
          <svg class="text-destructive h-2 w-5 shrink-0" viewBox="0 0 20 8" aria-hidden="true">
            <path d="M0 4h15" stroke="currentColor" stroke-width="1.5" />
            <path d="M14 1l6 3-6 3z" fill="currentColor" />
          </svg>
          Not yet to a part
        </li>
      </ul>
    </div>
  </Panel>
</template>
