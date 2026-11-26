<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { Handle, Position, storeToRefs, useConnection, useVueFlowStore } from '@xyflow/vue'
import type { NodeProps } from '@xyflow/vue'
import { CopyIcon, ImagePlusIcon, PencilIcon, UserIcon, ZoomInIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { CARD } from '@drillgram/model'
import MarkdownField from '../MarkdownField.vue'
import { renderMarkdown } from '@/lib/markdown'
import { iconUrl, useTechIcons } from '../../composables/useTechIcons'
import { codeBadge, isAbstractCode } from './codeLanguages'
import { KEY_SIGN } from './columns'
import { cardType } from './kinds'
import { boxShape } from './shapes'
import { CANVAS_ACTIONS, CANVAS_FADED } from './types'
import type { ObjectNode } from './types'

const props = defineProps<NodeProps<ObjectNode>>()

const actions = inject(CANVAS_ACTIONS)
const faded = inject(CANVAS_FADED)
const connection = useConnection()
/** While a connection is being drawn, the whole card of every other object takes the drop. */
const takesDrop = computed(() => connection.value.inProgress && connection.value.fromNode.id !== props.id)

// How a card is laid out: the name in the middle, the object's icons
// left of it, the description under it and, on the last line, what kind of thing it is. Nothing
// else says the kind: no row at the top, no coloured bar.
// The icons say what the object is made with or runs on, each a little over the one before. The
// library gives their names; it is only asked for when a card has icons.
const library = computed(() => (props.data.icons.length > 0 ? useTechIcons().value : undefined))

/** Room the icons take left of the name. The same is kept free on the right, so the name stays in the middle. */
const iconsRoom = computed(() => (props.data.icons.length > 0 ? `${props.data.icons.length * 18 + 14}px` : '0px'))

// A code element is drawn as a class box (c4model.com/diagrams/code, UML): what it is over its
// name, a round badge with its letter and the language's icon beside the name, and under a line
// its members. The same parts as any card, laid out by `.object-card.is-code` in main.css.
// A box with a shape (a cylinder for a database, a diamond for a decision) is drawn as that
// outline, under its text; the card itself then has no border or ground of its own, and its text
// keeps clear of where the outline comes in (canvas/shapes.ts).
const outline = computed(() => {
  const shape = props.data.shape
  // A table is a card of its own make: its name over a line, then its columns as rows.
  if (!shape || shape === 'table') return undefined
  // The editor gives every card its size (types.ts: a known size, not a measured one).
  const width = typeof props.width === 'number' ? props.width : CARD.width
  const height = typeof props.height === 'number' ? props.height : CARD.height
  // Inside the box by half a line, so the 1 px line is sharp and whole.
  return { width, height, ...boxShape(shape, Math.max(width - 1, 1), Math.max(height - 1, 1)) }
})
/** The room the text keeps at each side: the card's own, more where the outline comes in. */
const shapeRoom = computed(() => {
  const inset = outline.value?.inset
  if (!inset) return undefined
  return {
    paddingTop: `${Math.max(16, inset.top + 6)}px`,
    paddingRight: `${Math.max(12, inset.right + 8)}px`,
    paddingBottom: `${Math.max(8, inset.bottom + 4)}px`,
    paddingLeft: `${Math.max(12, inset.left + 8)}px`,
  }
})

const isCode = computed(() => props.data.kind === 'code')
const isTable = computed(() => props.data.shape === 'table')
const badge = computed(() => (isCode.value ? codeBadge(props.data.technology) : undefined))
const slanted = computed(() => isCode.value && isAbstractCode(props.data.technology))

// The description is Markdown (lib/markdown.ts makes it safe HTML). The card is as tall as the
// text needs when it was added or edited (cardRoom.ts measures it with the classes used here);
// where it is not, a card that was made longer since, the text scrolls inside the selected card.
const text = computed(() => (props.data.description ? renderMarkdown(props.data.description) : ''))

/** The last line: the kind, "external" for what is not ours, and the technology where there is one. */
const type = computed(() => cardType(props.data))

const cornerOf = (event: MouseEvent) => {
  const corner = (event.currentTarget as HTMLElement).getBoundingClientRect()
  return { x: corner.right, y: corner.bottom }
}
const pickIcons = (event: MouseEvent) => actions?.pickIcons(props.id, cornerOf(event))
const edit = (event: MouseEvent) => actions?.edit(props.id, cornerOf(event))

// Renaming: double-click the card and type. Enter or leaving the field saves, Escape does not.
const newName = ref<string>()
const vFocus = { mounted: (el: HTMLInputElement) => el.select() }

function commitName() {
  const name = newName.value
  newName.value = undefined
  if (name !== undefined) actions?.rename(props.id, name)
}

// The text opens the same way: a double-click on it, or anywhere on the card that is not the
// name, shows it as it was written (Markdown), in a field over the card with buttons for the
// usual marks. Leaving the field or Ctrl/Cmd with Enter saves, Escape does not.
const newText = ref<string>()
// The field is as large on the screen however the diagram is zoomed: drawn at a fixed size and
// scaled back by the zoom, from its top middle, which stays under the name.
const { transform } = storeToRefs(useVueFlowStore())
const TEXT_FIELD = { width: 300, height: 190 }
const textFieldStyle = computed(() => ({
  width: `${TEXT_FIELD.width}px`,
  height: `${TEXT_FIELD.height}px`,
  transform: `translateX(-50%) scale(${1 / transform.value[2]})`,
  transformOrigin: 'top center',
}))

function onDoubleClick(event: MouseEvent) {
  if (newName.value !== undefined || newText.value !== undefined) return
  const target = event.target as Element
  // Not on a button of the card, and not on a link in its text: those have their own click.
  if (target.closest('button, a, input, textarea, .vue-flow__handle')) return
  if (target.closest('[data-card-name]')) newName.value = props.data.name
  // A table's columns are written in its form.
  else if (isTable.value) edit(event)
  else newText.value = props.data.description ?? ''
}

function commitText() {
  const text = newText.value
  newText.value = undefined
  if (text !== undefined && text.trim() !== (props.data.description ?? '')) actions?.describe(props.id, text)
}
</script>

<template>
  <div
    class="object-card group bg-card text-card-foreground relative flex size-full flex-col items-center rounded-xl border px-3 pt-4 pb-2 text-center shadow-xs transition-shadow duration-100 select-none hover:shadow-md"
    :class="{
      'ring-ring/60 ring-2': selected,
      'is-faded': faded?.has(id),
      'bg-muted': data.external,
      'is-external': data.external,
      'is-code': isCode,
      'is-table': isTable,
      'is-shaped': outline !== undefined,
    }"
    :style="{ '--kind': data.external ? 'var(--muted-foreground)' : `var(--kind-${data.kind})`, ...shapeRoom }"
    @dblclick="onDoubleClick"
  >
    <svg
      v-if="outline"
      data-testid="card-shape"
      :data-shape="data.shape"
      class="card-shape pointer-events-none absolute inset-0 -z-10 size-full overflow-visible"
      :viewBox="`0 0 ${outline.width} ${outline.height}`"
      aria-hidden="true"
    >
      <g transform="translate(0.5 0.5)">
        <path :d="outline.outline" class="card-shape-outline" :class="outline.look && `is-${outline.look}`" />
        <path v-for="line in outline.lines" :key="line" :d="line" class="card-shape-line" />
      </g>
    </svg>
    <!-- A person has a figure on the top border. -->
    <span
      v-if="data.kind === 'person'"
      data-testid="card-figure"
      class="bg-card absolute -top-4 left-1/2 grid size-7 -translate-x-1/2 place-items-center rounded-lg border shadow-xs"
      :class="{ 'bg-muted': data.external }"
    >
      <UserIcon class="size-4" aria-hidden="true" />
    </span>

    <div class="card-body flex min-h-0 w-full flex-1 flex-col items-center gap-1" :class="newText === undefined ? 'justify-center' : 'justify-start pt-3'">
      <!-- The name, with the icons left of it; as much room is kept free on its right. -->
      <div class="card-name-row relative w-full shrink-0" :style="isCode ? undefined : { paddingInline: iconsRoom }">
        <span v-if="badge" data-testid="code-badge" class="code-badge" aria-hidden="true">{{ badge }}</span>
        <!-- On a class box the icons stand in the row, after the badge; else left of the name, over the row's padding. -->
        <div class="card-icons flex items-center" :class="isCode ? 'flex-none' : 'absolute top-1/2 left-0 -translate-y-1/2'">
          <img
            v-for="icon in data.icons"
            :key="icon"
            :src="iconUrl(icon)"
            :alt="library?.get(icon)?.title ?? icon"
            :title="library?.get(icon)?.title ?? icon"
            class="card-icon"
            draggable="false"
          />
        </div>
        <input
          v-if="newName !== undefined"
          v-model="newName"
          v-focus
          aria-label="Title"
          autocomplete="off"
          class="nodrag nopan bg-background w-full rounded-sm border px-1 text-center text-[15px] font-semibold outline-none"
          @keydown.enter="commitName"
          @keydown.esc="newName = undefined"
          @blur="commitName"
        />
        <strong v-else data-card-name class="card-name line-clamp-2 block text-[15px] leading-tight font-semibold" :class="{ italic: slanted }">{{ data.name }}</strong>
      </div>
      <!-- A table's columns, a row each: its key, its name, its type. -->
      <ul v-if="isTable && data.columns?.length" aria-label="Columns" class="card-columns" :class="selected ? 'nowheel overflow-y-auto' : 'overflow-hidden'">
        <li v-for="(column, at) in data.columns" :key="at" class="card-column" :class="column.key && `is-${column.key}`">
          <span class="card-column-key">{{ column.key ? KEY_SIGN[column.key] : '' }}</span>
          <span class="card-column-name">{{ column.name }}</span>
          <span class="card-column-type">{{ column.type }}</span>
        </li>
      </ul>
      <p v-else-if="isTable" class="card-columns-none">No columns yet: double-click to add them</p>
      <!-- The text being written: under the name, over the card and out of it where it is
           larger (its size is the screen's, not the diagram's). The empty block keeps the name
           at the top meanwhile. -->
      <div v-if="newText !== undefined" class="relative h-0 w-full shrink-0">
        <MarkdownField
          v-model="newText"
          label="Description"
          placeholder="Markdown works."
          autofocus
          class="nodrag nopan nowheel absolute top-0 left-1/2 z-10 text-[13px] leading-snug shadow-lg"
          :style="textFieldStyle"
          @save="commitText"
          @leave="commitText"
          @cancel="newText = undefined"
        />
      </div>
      <!-- eslint-disable-next-line vue/no-v-html -- made safe by renderMarkdown -->
      <div
        v-else-if="text"
        class="card-text text-muted-foreground min-h-0 w-full shrink text-[11px] leading-snug"
        :class="[selected ? 'nowheel overflow-y-auto' : 'overflow-hidden', { 'is-code': data.kind === 'code' }]"
        v-html="text"
      />
    </div>
    <span v-if="type" data-testid="card-type" class="card-type text-muted-foreground w-full truncate font-mono text-[10px] leading-tight">{{ type }}</span>

    <Button
      v-if="data.opens"
      variant="ghost"
      size="icon-xs"
      class="card-open nodrag nopan text-muted-foreground absolute top-1 left-1"
      aria-label="Open"
      :title="`Open ${data.name}`"
      @click="actions?.open(id)"
    >
      <ZoomInIcon aria-hidden="true" />
    </Button>

    <!-- Shown with the card selected or under the pointer (main.css). -->
    <div class="card-tools nodrag nopan absolute top-1 right-1 gap-0.5">
      <Button variant="ghost" size="icon-xs" class="text-muted-foreground" aria-label="Edit" title="Edit" @click.stop="edit">
        <PencilIcon aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon-xs" class="text-muted-foreground" aria-label="Icons" title="Icons" @click.stop="pickIcons">
        <ImagePlusIcon aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon-xs" class="text-muted-foreground" aria-label="Copy" title="Copy" @click.stop="actions?.copy(id)">
        <CopyIcon aria-hidden="true" />
      </Button>
    </div>

    <Handle
      type="target"
      :position="Position.Left"
      :is-connectable-start="false"
      class="drop-target"
      :class="{ 'takes-drop': takesDrop }"
    />
    <Handle
      type="source"
      :position="Position.Right"
      class="connect-handle"
      data-testid="connection-handle"
      title="Drag to connect"
    />
  </div>
</template>

<style scoped>
.connect-handle {
  width: 16px;
  height: 16px;
  border: 2px solid var(--background);
  background: var(--primary);
  opacity: 0.4;
  transition: opacity 100ms;
}

.object-card:hover .connect-handle {
  opacity: 1;
}

/* Touch screens have no hover: keep the handle visible. */
@media (hover: none) {
  .connect-handle {
    opacity: 1;
  }
}

/* A finger is wider than the handle and the magnifier: on a touch screen a press around them
   counts too, 12 px of the screen however small the diagram is shown (--zoom, set by
   CanvasControls.vue), but never more than 40 px of the diagram: the rest of the card stays
   the card's. */
@media (pointer: coarse) {
  .connect-handle::after,
  .card-open::after {
    content: '';
    position: absolute;
    inset: calc(-1 * min(12px / var(--zoom, 1), 40px));
    border-radius: 9999px;
  }
}

/* An invisible target the size of the card, so a connection can be dropped anywhere on it. */
.drop-target {
  inset: 0;
  width: 100%;
  height: 100%;
  transform: none;
  border: 0;
  border-radius: inherit;
  background: transparent;
}

/* `!important`: Vue Flow's own handle rule would make it take every click on the card. */
.drop-target:not(.takes-drop) {
  pointer-events: none !important;
}

.drop-target.takes-drop {
  z-index: 10;
}
</style>
