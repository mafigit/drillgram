<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Panel, storeToRefs, useVueFlow, useVueFlowStore } from '@xyflow/vue'
import { useEventListener } from '@vueuse/core'
import { showError } from '../../composables/useErrors'
import { MARK_KEYS_IDLE, markKey, markList, readMarks, writeMark } from './cameraMarks'
import type { CameraMarks } from './cameraMarks'

// Camera marks (J73): hold M and press 1 to 9 to keep the view, M then a number to go back.
// The keys, the jump and what is said; the minimap draws the marks (MinimapMarks.vue).
const props = defineProps<{
  /** The workspace and the diagram the marks belong to. */
  workspace: string
  view: string
}>()

/** The marks of the open diagram, and whether they are lit (M pressed): for the minimap. */
const marks = defineModel<CameraMarks>('marks', { required: true })
const lit = defineModel<boolean>('lit', { required: true })

const { viewport, setCenter } = useVueFlow()
const { dimensions } = storeToRefs(useVueFlowStore())

watch(
  () => [props.workspace, props.view] as const,
  ([workspace, view]) => (marks.value = readMarks(workspace, view)),
  { immediate: true },
)

const said = ref('')
let quiet: ReturnType<typeof setTimeout> | undefined
function say(words: string, forMs?: number) {
  clearTimeout(quiet)
  said.value = words
  if (forMs !== undefined) quiet = setTimeout(() => (said.value = ''), forMs)
}
onBeforeUnmount(() => clearTimeout(quiet))

const numbers = computed(() => markList(marks.value).map((m) => m.mark))
const choices = (all: number[]) => (all.length === 1 ? `${all[0]}` : `${all.slice(0, -1).join(', ')} or ${all.at(-1)}`)
/** While lit: the marks of the diagram open now, also when M came just before another diagram opened. */
const prompt = computed(() =>
  numbers.value.length > 0 ? `Jump to a mark: press ${choices(numbers.value)}` : 'No marks here yet. Hold M and press 1 to 9 to set one.',
)
const shown = computed(() => said.value || (lit.value ? prompt.value : ''))

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

function setMark(mark: number) {
  const { x, y, zoom } = viewport.value
  const { width, height } = dimensions.value
  const at = { x: (width / 2 - x) / zoom, y: (height / 2 - y) / zoom, zoom }
  writeMark(props.workspace, props.view, mark, at)
  marks.value = { ...marks.value, [mark]: at }
  say(`Mark ${mark} set`, 2000)
}

function jump(mark: number) {
  const at = marks.value[mark]
  if (!at) {
    say('')
    showError(`Mark ${mark} is not set. Hold M and press ${mark} to set it here.`)
    return
  }
  say('')
  void setCenter(at.x, at.y, { zoom: at.zoom, duration: reducedMotion() ? 0 : 300 })
}

let state = MARK_KEYS_IDLE
const FIELD = 'input:not([type=range], [type=checkbox]), textarea, select, [contenteditable]'

function onKey(event: KeyboardEvent, type: 'down' | 'up') {
  // A field being typed in keeps its letters and numbers.
  if (type === 'down' && event.target instanceof Element && event.target.matches(FIELD)) return
  const step = markKey(state, { type, key: event.key, code: event.code, repeat: event.repeat, mod: event.ctrlKey || event.metaKey || event.altKey })
  state = step.state
  const action = step.action
  if (!action) {
    if (state.open || state.held) event.preventDefault()
    return
  }
  if (action.do !== 'close' || action.eaten) {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  if (action.do === 'open') {
    lit.value = true
    say('')
  } else if (action.do === 'set') setMark(action.mark)
  else {
    lit.value = false
    if (action.do === 'jump') jump(action.mark)
  }
}

// Capture: before the editor's own keys (Escape, A), so that a key the marks take goes nowhere else.
useEventListener(window, 'keydown', (event: KeyboardEvent) => onKey(event, 'down'), { capture: true })
useEventListener(window, 'keyup', (event: KeyboardEvent) => onKey(event, 'up'), { capture: true })
useEventListener(window, 'blur', () => {
  const step = markKey(state, { type: 'blur' })
  state = step.state
  if (step.action) lit.value = false
})
// A press anywhere puts the marks back to small.
useEventListener(window, 'pointerdown', () => {
  if (!state.open || state.held) return
  state = MARK_KEYS_IDLE
  lit.value = false
})
</script>

<template>
  <Panel position="top-center" class="pointer-events-none">
    <!-- Only while there is something to say: the editor has other status lines (the shape search). -->
    <p
      v-if="shown"
      role="status"
      aria-label="Camera marks"
      class="rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-sm"
    >{{ shown }}</p>
  </Panel>
</template>
