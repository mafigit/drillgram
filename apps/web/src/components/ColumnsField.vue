<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { PlusIcon, XIcon } from '@lucide/vue'
import { COLUMN_KEYS } from '@drillgram/model'
import { Button } from '@/components/ui/button'
import { COLUMN_TYPES, KEY_SIGN, columnsFromText } from './canvas/columns'
import type { ColumnRow } from './canvas/columns'

// The columns of a table, in its form: a row each with its key, name and type. Made for the
// keyboard: Enter in a row makes the next one and puts the cursor there, Backspace in an empty
// name takes the row away, and lines pasted into a name (from a CREATE TABLE, a list) become
// columns, one per line.
const columns = defineModel<ColumnRow[]>({ required: true })
const emit = defineEmits<{ save: [] }>()

const names = ref<HTMLInputElement[]>([])
const focus = async (at: number) => {
  await nextTick()
  names.value[at]?.focus()
}

function addAfter(at: number) {
  columns.value.splice(at + 1, 0, { name: '', type: '', key: '' })
  focus(at + 1)
}

function remove(at: number) {
  columns.value.splice(at, 1)
  // A table's form always has a row to type into.
  if (columns.value.length === 0) columns.value.push({ name: '', type: '', key: '' })
  focus(Math.max(0, at - 1))
}

function onEnter(event: KeyboardEvent, at: number) {
  // With Ctrl or Cmd the form is saved, as from its text field.
  if (event.ctrlKey || event.metaKey) emit('save')
  else addAfter(at)
}

function onBackspace(event: KeyboardEvent, at: number) {
  const row = columns.value[at]!
  if (row.name !== '' || row.type !== '' || columns.value.length === 1) return
  event.preventDefault()
  remove(at)
}

/** Several lines pasted into a name: each a column, in place of this row when it is empty. */
function onPaste(event: ClipboardEvent, at: number) {
  const text = event.clipboardData?.getData('text/plain') ?? ''
  if (!/[\r\n]/.test(text.trim())) return
  const pasted = columnsFromText(text)
  if (pasted.length === 0) return
  event.preventDefault()
  const row = columns.value[at]!
  const empty = row.name === '' && row.type === ''
  columns.value.splice(empty ? at : at + 1, empty ? 1 : 0, ...pasted)
  focus((empty ? at : at + 1) + pasted.length - 1)
}
</script>

<template>
  <!-- `min-w-0`: a fieldset is as wide as its content at least, and would reach out of the form. -->
  <fieldset role="group" aria-label="Columns" class="flex min-w-0 flex-col gap-1">
    <legend class="text-muted-foreground mb-1 text-xs">Columns: Enter adds one, pasted lines add many</legend>
    <div class="flex max-h-48 flex-col gap-1 overflow-y-auto pr-0.5">
      <div v-for="(column, at) in columns" :key="at" class="flex items-center gap-1">
        <select v-model="column.key" :aria-label="`Key of ${column.name || `column ${at + 1}`}`" title="Key" class="form-select h-8 w-16 shrink-0 px-1.5 text-xs">
          <option value="">–</option>
          <option v-for="key in COLUMN_KEYS" :key="key" :value="key">{{ KEY_SIGN[key] }}</option>
        </select>
        <input
          ref="names"
          v-model="column.name"
          aria-label="Column"
          placeholder="column"
          autocomplete="off"
          class="border-input bg-background h-8 min-w-0 flex-1 rounded-md border px-2 font-mono text-xs outline-none focus-visible:ring-2"
          @keydown.enter.prevent="onEnter($event, at)"
          @keydown.backspace="onBackspace($event, at)"
          @paste="onPaste($event, at)"
        />
        <input
          v-model="column.type"
          role="combobox"
          :aria-label="`Type of ${column.name || `column ${at + 1}`}`"
          placeholder="type"
          list="column-types"
          class="border-input bg-background h-8 w-[5.5rem] shrink-0 rounded-md border px-2 font-mono text-xs outline-none focus-visible:ring-2"
          @keydown.enter.prevent="onEnter($event, at)"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          class="text-muted-foreground shrink-0"
          :aria-label="`Remove the column ${column.name || at + 1}`"
          title="Remove this column"
          @click="remove(at)"
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
    <datalist id="column-types">
      <option v-for="type in COLUMN_TYPES" :key="type" :value="type" />
    </datalist>
    <Button type="button" variant="ghost" size="sm" class="text-muted-foreground self-start" @click="addAfter(columns.length - 1)">
      <PlusIcon aria-hidden="true" />
      Add column
    </Button>
  </fieldset>
</template>
