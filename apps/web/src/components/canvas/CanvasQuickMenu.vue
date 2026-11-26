<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { Component } from 'vue'
import { useVueFlow } from '@xyflow/vue'
import type { BoxShape, Point } from '@drillgram/model'
import { iconUrl } from '../../composables/useTechIcons'
import ShapeGlyph from './ShapeGlyph.vue'

// The quick menu: a right-click on the empty canvas opens a ring of round buttons around the
// pointer. What is picked happens at that point of the diagram.
export interface QuickMenuItem {
  key: string
  label: string
  icon: Component
  /** An icon of the icon library to show instead (a language's). */
  image?: string
  /** An outline to show instead: a cylinder, a diamond. */
  shape?: BoxShape
  /** A colour for the button, as a CSS value; the plain one without. */
  tint?: string
  disabled?: boolean
}

const props = defineProps<{
  items: QuickMenuItem[]
  /** Where on the screen the menu opens; closed without. */
  openAt?: Point
}>()
const emit = defineEmits<{
  /** An item was picked: its key and the point of the diagram the menu was opened at. */
  pick: [key: string, at: Point]
  close: []
}>()

const { screenToFlowPosition } = useVueFlow()

/** From the middle of the ring to the middle of a button, in px: wider with more buttons, so their names stay apart. */
const radius = computed(() => Math.max(76, props.items.length * 17))
/** Room the ring needs around its middle, so it never leaves the window. */
const reach = computed(() => radius.value + 56)

/** The middle of the ring: the pointer, moved in from the window's edges where it must be. */
const centre = computed(() => {
  const at = props.openAt
  if (!at) return undefined
  const within = (value: number, size: number) => Math.min(Math.max(value, reach.value), Math.max(size - reach.value, reach.value))
  return { x: within(at.x, window.innerWidth), y: within(at.y, window.innerHeight) }
})

/** The buttons, evenly around the ring, the first one at the top. */
const placed = computed(() =>
  props.items.map((item, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / props.items.length
    return { ...item, x: Math.round(radius.value * Math.cos(angle)), y: Math.round(radius.value * Math.sin(angle)) }
  }),
)

const ring = ref<HTMLElement>()
const buttons = () => [...(ring.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]

// The keyboard works at once: the first item has the focus, the arrows go round.
watch(
  () => props.openAt,
  async (at) => {
    if (!at) return
    await nextTick()
    buttons()[0]?.focus()
  },
)

function step(by: number) {
  const all = buttons()
  const now = all.indexOf(document.activeElement as HTMLButtonElement)
  all[(now + by + all.length) % all.length]?.focus()
}

function pick(key: string) {
  if (props.openAt) emit('pick', key, screenToFlowPosition(props.openAt))
}
</script>

<template>
  <Teleport to="body">
    <!-- The sheet under the ring takes the click that closes it. -->
    <div
      v-if="centre"
      class="fixed inset-0 z-50"
      @pointerdown.self="emit('close')"
      @contextmenu.prevent="emit('close')"
    >
      <div
        ref="ring"
        role="menu"
        aria-label="Quick menu"
        class="quick-menu absolute size-0"
        :style="{ left: `${centre.x}px`, top: `${centre.y}px` }"
        @keydown.esc.stop="emit('close')"
        @keydown.right.prevent="step(1)"
        @keydown.down.prevent="step(1)"
        @keydown.left.prevent="step(-1)"
        @keydown.up.prevent="step(-1)"
        @keydown.tab.prevent="step($event.shiftKey ? -1 : 1)"
      >
        <span class="quick-menu-hub" aria-hidden="true" />
        <button
          v-for="(item, i) in placed"
          :key="item.key"
          type="button"
          role="menuitem"
          class="quick-menu-item"
          :disabled="item.disabled"
          :style="{ '--x': `${item.x}px`, '--y': `${item.y}px`, '--i': i, '--tint': item.tint ?? 'var(--foreground)' }"
          @click="pick(item.key)"
        >
          <span class="quick-menu-icon">
            <img v-if="item.image" :src="iconUrl(item.image)" alt="" class="size-6 rounded-sm bg-white object-contain p-px" />
            <ShapeGlyph v-else-if="item.shape" :shape="item.shape" />
            <component :is="item.icon" v-else class="size-5" aria-hidden="true" />
          </span>
          <span class="quick-menu-label">{{ item.label }}</span>
        </button>
      </div>
    </div>
  </Teleport>
</template>
