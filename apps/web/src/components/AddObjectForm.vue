<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { BOX_SHAPES, canHaveShape } from '@drillgram/model'
import type { BoxShape, ElementKind } from '@drillgram/model'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ColumnsField from './ColumnsField.vue'
import MarkdownField from './MarkdownField.vue'
import type { ColumnRow } from './canvas/columns'
import { CODE_LANGUAGES, OTHER_LANGUAGE, codeOf, codeTechnology } from './canvas/codeLanguages'
import { KIND_ICON, KIND_LABEL } from './canvas/kinds'
import { BASIC_SHAPES, SHAPE_ABOUT } from './canvas/shapes'

// What a new object says: its name and what it does; a C4 container or component also its
// technology, a C4 person or software system whether it is ours. Shown in the toolbar, or
// floating where the quick menu was opened.
const props = defineProps<{
  kind: ElementKind
  /** Changing an object that is there, not making a new one. */
  edit?: boolean
}>()
const name = defineModel<string>('name', { required: true })
const details = defineModel<{ description: string; technology: string; external: boolean; shape: BoxShape | ''; columns: ColumnRow[] }>('details', {
  required: true,
})
const emit = defineEmits<{ add: []; cancel: [] }>()

const hasTechnology = computed(() => props.kind === 'container' || props.kind === 'component')
const canBeExternal = computed(() => props.kind === 'person' || props.kind === 'softwareSystem')
/** A box says its shape: a rectangle, or an outline that says what it is (not a person, not code). */
const hasShape = computed(() => canHaveShape(props.kind))
// A table says its columns, row by row; there is always a row to type into.
const isTable = computed(() => hasShape.value && details.value.shape === 'table')
watch(
  isTable,
  (table) => {
    if (table && details.value.columns.length === 0) details.value.columns.push({ name: '', type: '', key: '' })
  },
  { immediate: true },
)

// Code says its language and what it is there, picked from what the language has; both together
// are its technology ("Go struct"). Any other language: the words are written out.
const isCode = computed(() => props.kind === 'code')
const code = ref(codeOf(details.value.technology))
const constructs = computed(() => CODE_LANGUAGES.find((language) => language.name === code.value.language)?.constructs ?? [])
watch(
  () => code.value.language,
  () => {
    // Another language has other things: take its most usual one, unless it has the same word.
    if (constructs.value.length > 0 && !constructs.value.includes(code.value.construct)) code.value.construct = constructs.value[0]!
  },
)
watch(
  code,
  (now) => {
    if (isCode.value) details.value.technology = codeTechnology(now.language, now.construct)
  },
  { deep: true, immediate: true },
)

/** A sticky note is its text alone (J69): no title, no shape to pick. */
const isNote = computed(() => details.value.shape === 'stickyNote')
const title = computed(() => `${props.edit ? 'Edit' : 'New'} ${isNote.value ? 'sticky note' : KIND_LABEL[props.kind].toLowerCase()}`)
const vFocus = { mounted: (el: HTMLInputElement) => (el.focus(), el.select()) }
</script>

<template>
  <form
    :aria-label="title"
    class="flex w-80 flex-col gap-2 p-1.5"
    @submit.prevent="emit('add')"
    @keydown.esc.stop="emit('cancel')"
  >
    <p class="flex items-center gap-2 text-sm font-medium">
      <span class="kind-chip grid size-6 place-items-center rounded-md" :style="{ '--kind': `var(--kind-${kind})` }">
        <component :is="KIND_ICON[kind]" class="size-3.5" aria-hidden="true" />
      </span>
      {{ title }}
    </p>
    <!-- "Title", not "Name": iOS Safari offers a contact for any field called "Name", whatever its
         autocomplete says, and the name of a box is no person's. -->
    <Input v-if="!isNote" v-model="name" v-focus aria-label="Title" placeholder="Title" autocomplete="off" class="h-9" />
    <div v-if="isCode" class="flex gap-2">
      <select v-model="code.language" aria-label="Language" class="form-select w-28 shrink-0">
        <option v-for="language in CODE_LANGUAGES" :key="language.name">{{ language.name }}</option>
        <option>{{ OTHER_LANGUAGE }}</option>
      </select>
      <select v-if="constructs.length > 0" v-model="code.construct" aria-label="What it is" class="form-select min-w-0 flex-1">
        <option v-for="construct in constructs" :key="construct">{{ construct }}</option>
      </select>
      <Input v-else v-model="code.construct" aria-label="What it is" placeholder="What it is, e.g. Zig struct" class="h-9 min-w-0 flex-1" />
    </div>
    <select v-if="hasShape && !isNote" v-model="details.shape" aria-label="Shape" class="form-select">
      <option value="">Rectangle</option>
      <optgroup label="Basic">
        <option v-for="shape in BASIC_SHAPES" :key="shape" :value="shape">{{ SHAPE_ABOUT[shape].label }}</option>
      </optgroup>
      <optgroup label="Flowchart">
        <option v-for="shape in BOX_SHAPES.filter((shape) => !BASIC_SHAPES.includes(shape))" :key="shape" :value="shape">{{ SHAPE_ABOUT[shape].label }}</option>
      </optgroup>
    </select>
    <ColumnsField v-if="isTable" v-model="details.columns" @save="emit('add')" />
    <Input
      v-if="hasTechnology"
      v-model="details.technology"
      aria-label="Technology"
      placeholder="Technology, e.g. Vue 3 or PostgreSQL"
      class="h-9"
    />
    <!-- Markdown; Enter makes a new line here, so Ctrl or Cmd with Enter saves. -->
    <MarkdownField
      v-model="details.description"
      :label="isNote ? 'Note' : 'Description'"
      :autofocus="isNote"
      :placeholder="isNote ? 'What to remember. Markdown works; Ctrl or Cmd with Enter adds it.' : isCode ? 'Fields, then --- on a line of its own, then methods. Markdown works.' : 'What it does. Markdown works.'"
      :class="isTable ? 'h-20 text-sm' : 'h-32 text-sm'"
      @save="emit('add')"
      @cancel="emit('cancel')"
    />
    <label v-if="canBeExternal" class="text-muted-foreground flex items-center gap-2 text-sm">
      <input v-model="details.external" type="checkbox" class="accent-primary size-4" />
      External: not ours
    </label>
    <div class="flex justify-end gap-1">
      <Button type="button" variant="ghost" @click="emit('cancel')">Cancel</Button>
      <Button type="submit">{{ edit ? 'Save' : 'Add' }}</Button>
    </div>
  </form>
</template>
