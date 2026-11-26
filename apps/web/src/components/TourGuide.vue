<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
import { useRafFn, useWindowSize } from '@vueuse/core'
import { XIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { browserOnly } from '../lib/api'
import { placeCard } from '../tour/place'
import type { Box } from '../tour/place'
import { markTourSeen, tourSeen } from '../tour/seen'
import { tourSteps } from '../tour/steps'
import type { TourScene } from '../tour/steps'

// The tour (J63): a card that goes from one part of the editor to the next and says what it
// is for, with a light on that part. The page under it stays the app: a step that asks for
// something is done on the real thing, and the tour goes on when it was.
const props = defineProps<{
  /** Where the editor is and what was done in it. */
  scene: TourScene
  /** Nothing was ever done in the open workspace: there the tour starts by itself, once in a browser. */
  fresh: boolean
  /** Fills the empty workspace with the example the tour is told on. */
  load: () => void
  /** Opens the diagram a step is about. */
  go: (where: 'overview' | 'inside') => Promise<unknown>
  /** Opens the history for the step about it; closes it behind that step, with the diagram back at now. */
  history: (open: boolean) => void
}>()

const steps = tourSteps(browserOnly)
/** The steps between the welcome and the goodbye: those are counted. */
const COUNTED = steps.length - 2

/** The step that is shown; none while there is no tour. */
const index = ref<number>()
const step = computed(() => (index.value === undefined ? undefined : steps[index.value]))
/** The editor as it was when the step began: what was done since is the step's. */
let before: TourScene = props.scene
/** On the way to a step's diagram: what happens meanwhile is no answer to the step before. */
let moving = false

async function show(to: number) {
  const next = steps[to]
  if (moving || !next) return
  moving = true
  try {
    if ((next.history ?? false) !== (step.value?.history ?? false)) props.history(next.history ?? false)
    if (next.at && props.scene.at !== next.at) await props.go(next.at)
    // The editor says where it is, and what was just done in it, on its next turn.
    await nextTick()
  } finally {
    moving = false
  }
  before = props.scene
  index.value = to
}

/** Shows the welcome. The tour itself begins with its first button. */
function start() {
  index.value = 0
}
defineExpose({ start })

function end() {
  markTourSeen()
  index.value = undefined
}

function forward() {
  if (index.value === undefined) return
  if (index.value === 0) {
    // Said yes to: from here on the tour does not start by itself again.
    markTourSeen()
    if (props.scene.objects === 0) props.load()
  }
  if (index.value === steps.length - 1) end()
  else void show(index.value + 1)
}

const back = () => index.value !== undefined && void show(index.value - 1)

// What a step asks for was done: on to the next one. A label that is still being typed is
// part of what was asked for.
watch(
  () => [index.value, props.scene] as const,
  () => {
    const now = step.value
    if (moving || index.value === undefined || !now?.done || props.scene.typing) return
    if (now.done(props.scene, before)) void show(index.value + 1)
  },
)

onMounted(() => {
  if (props.fresh && !tourSeen()) start()
})

// Where the light and the card are. What a step points at moves (the canvas is panned, a menu
// opens, the window changes): it is looked up again for every frame, which is one measurement.
const card = ref<HTMLElement>()
const spot = shallowRef<Box>()
const cardSize = shallowRef({ width: 0, height: 0 })
const screen = useWindowSize()

/** The box around everything the selectors find on the page; nothing when nothing is shown. */
function boxAround(selectors: readonly string[]): Box | undefined {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const selector of selectors) {
    const found = document.querySelector(selector)?.getBoundingClientRect()
    if (!found || (found.width === 0 && found.height === 0)) continue
    left = Math.min(left, found.left)
    top = Math.min(top, found.top)
    right = Math.max(right, found.right)
    bottom = Math.max(bottom, found.bottom)
  }
  return right < left ? undefined : { x: left, y: top, width: right - left, height: bottom - top }
}

const same = (a: Box | undefined, b: Box | undefined) =>
  a === b || (a !== undefined && b !== undefined && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height)

useRafFn(() => {
  const now = step.value
  if (!now) return
  const found = now.target && boxAround(now.target)
  if (!same(found, spot.value)) spot.value = found
  const { offsetWidth: width = 0, offsetHeight: height = 0 } = card.value ?? {}
  if (width !== cardSize.value.width || height !== cardSize.value.height) cardSize.value = { width, height }
})

/** Air between what a step points at and the frame of light around it. */
const AIR = 6
const light = computed(() => {
  const box = step.value?.target ? spot.value : undefined
  return box && { left: `${box.x - AIR}px`, top: `${box.y - AIR}px`, width: `${box.width + 2 * AIR}px`, height: `${box.height + 2 * AIR}px` }
})

const place = computed(() => {
  const box = step.value?.target ? spot.value : undefined
  const lit = box && { x: box.x - AIR, y: box.y - AIR, width: box.width + 2 * AIR, height: box.height + 2 * AIR }
  const at = placeCard(lit, cardSize.value, { width: screen.width.value, height: screen.height.value }, step.value?.side)
  // Not shown before it was measured: it would jump.
  return { left: `${at.x}px`, top: `${at.y}px`, visibility: cardSize.value.width === 0 ? ('hidden' as const) : undefined }
})

// The welcome and the goodbye stand over a page that waits: the keyboard is with their button.
const primary = ref<InstanceType<typeof Button>>()
watch(step, async (now) => {
  if (!now || now.target) return
  await nextTick()
  ;(primary.value?.$el as HTMLElement | undefined)?.focus()
})
</script>

<template>
  <Teleport to="body">
    <template v-if="step && index !== undefined">
      <!-- The welcome and the goodbye point at nothing: the page waits behind them. -->
      <div v-if="!step.target" class="fixed inset-0 z-40 bg-black/10 supports-backdrop-filter:backdrop-blur-xs" />
      <!-- The light: a frame around what the step is about, the rest a little darker. It takes
           no click: what it shows is used as ever. -->
      <div v-else-if="light" data-testid="tour-spotlight" class="tour-light pointer-events-none fixed z-40 rounded-xl" :style="light" />
      <section
        ref="card"
        role="dialog"
        aria-label="Tour"
        class="tour-card bg-popover text-popover-foreground fixed z-40 flex w-88 max-w-[calc(100vw-1.5rem)] flex-col gap-2.5 rounded-2xl border p-4 text-sm shadow-xl"
        :style="place"
        @keydown.esc.stop="end"
      >
        <img v-if="index === 0" src="/logo.svg" alt="" class="size-9 rounded-lg" />
        <div class="flex items-start justify-between gap-3">
          <div class="flex min-w-0 flex-col gap-0.5">
            <p v-if="index > 0 && index <= COUNTED" class="text-muted-foreground text-xs font-medium">Step {{ index }} of {{ COUNTED }}</p>
            <h3 class="text-base leading-tight font-semibold tracking-tight">{{ step.title }}</h3>
          </div>
          <Button
            v-if="index > 0 && index < steps.length - 1"
            variant="ghost"
            size="icon-xs"
            class="text-muted-foreground -mt-1 -mr-1 shrink-0"
            aria-label="End the tour"
            title="End the tour"
            @click="end"
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
        <div aria-live="polite" class="flex flex-col gap-1.5">
          <p class="leading-snug">{{ step.text }}</p>
          <p v-if="step.done" class="text-muted-foreground text-xs leading-snug">Try it, or press "Next".</p>
        </div>
        <!-- How far the tour is: a line that fills. -->
        <div v-if="index > 0 && index <= COUNTED" class="bg-muted h-1 overflow-hidden rounded-full" aria-hidden="true">
          <div class="tour-progress bg-primary h-full rounded-full" :style="{ width: `${(index / COUNTED) * 100}%` }" />
        </div>
        <div class="flex items-center justify-end gap-2 pt-0.5">
          <Button v-if="index === 0" variant="ghost" @click="end">Skip the tour</Button>
          <Button v-else-if="index > 1" variant="ghost" @click="back">Back</Button>
          <Button ref="primary" @click="forward">
            {{ index === 0 ? 'Start the tour' : index === steps.length - 1 ? 'Done' : 'Next' }}
          </Button>
        </div>
      </section>
    </template>
  </Teleport>
</template>

<style scoped>
/* The frame, and around it the dark that makes the rest of the page step back. */
.tour-light {
  box-shadow:
    0 0 0 2px var(--primary),
    0 0 0 200vmax rgb(0 0 0 / 0.22);
}

.tour-progress {
  transition: width 200ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .tour-progress {
    transition: none;
  }
}
</style>
