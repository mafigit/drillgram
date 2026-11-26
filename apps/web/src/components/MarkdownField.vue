<script setup lang="ts">
import '@github/markdown-toolbar-element'
import { ref, useId } from 'vue'
import {
  BoldIcon,
  CodeIcon,
  HeadingIcon,
  ItalicIcon,
  LinkIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  StrikethroughIcon,
  TextQuoteIcon,
} from '@lucide/vue'

// A field for Markdown: a plain text field with a row of buttons for the marks one does not want
// to type (bold, lists, a link). The buttons are GitHub's markdown-toolbar-element: they put the
// marks around the selection, or take them off again. (The element gives its buttons no role of
// its own, so each says here that it is a button.) What is typed stays Markdown; nothing is
// hidden. Ctrl or Cmd with Enter saves, Escape leaves, Ctrl or Cmd with B and I make bold and
// italic.
defineProps<{
  /** What the field is, for a screen reader: "Description". */
  label: string
  placeholder?: string
  /** Take the cursor as soon as the field is there. */
  autofocus?: boolean
}>()
const text = defineModel<string>({ required: true })
const emit = defineEmits<{
  save: []
  cancel: []
  /** The cursor left the field and its buttons. */
  leave: []
}>()

const id = useId()
const root = ref<HTMLElement>()

/** Press one of the buttons, as its shortcut does. */
function press(button: string) {
  root.value?.querySelector<HTMLElement>(button)?.click()
}

function onKeydown(event: KeyboardEvent) {
  const mod = event.ctrlKey || event.metaKey
  const key = event.key.toLowerCase()
  if (event.key === 'Escape') {
    event.stopPropagation()
    emit('cancel')
  } else if (mod && event.key === 'Enter') {
    event.preventDefault()
    emit('save')
  } else if (mod && (key === 'b' || key === 'i')) {
    event.preventDefault()
    press(key === 'b' ? 'md-bold' : 'md-italic')
  }
}

function onFocusOut(event: FocusEvent) {
  if (!root.value?.contains(event.relatedTarget as Node | null)) emit('leave')
}

const vFocus = { mounted: (el: HTMLTextAreaElement, binding: { value?: boolean }) => binding.value && el.focus() }
</script>

<template>
  <div ref="root" class="markdown-field bg-background flex min-h-0 flex-col rounded-md border" @focusout="onFocusOut">
    <!-- A press on a button leaves the cursor and the selection in the field. -->
    <markdown-toolbar :for="id" aria-label="Formatting" class="flex flex-wrap gap-px border-b p-0.5" @mousedown.prevent>
      <md-bold role="button" aria-label="Bold" title="Bold (Ctrl+B)"><BoldIcon aria-hidden="true" /></md-bold>
      <md-italic role="button" aria-label="Italic" title="Italic (Ctrl+I)"><ItalicIcon aria-hidden="true" /></md-italic>
      <md-strikethrough role="button" aria-label="Strikethrough" title="Strikethrough"><StrikethroughIcon aria-hidden="true" /></md-strikethrough>
      <md-header role="button" aria-label="Heading" title="Heading"><HeadingIcon aria-hidden="true" /></md-header>
      <md-unordered-list role="button" aria-label="List" title="List"><ListIcon aria-hidden="true" /></md-unordered-list>
      <md-ordered-list role="button" aria-label="Numbered list" title="Numbered list"><ListOrderedIcon aria-hidden="true" /></md-ordered-list>
      <md-task-list role="button" aria-label="Task list" title="Task list"><ListChecksIcon aria-hidden="true" /></md-task-list>
      <md-quote role="button" aria-label="Quote" title="Quote"><TextQuoteIcon aria-hidden="true" /></md-quote>
      <md-code role="button" aria-label="Code" title="Code"><CodeIcon aria-hidden="true" /></md-code>
      <md-link role="button" aria-label="Link" title="Link"><LinkIcon aria-hidden="true" /></md-link>
    </markdown-toolbar>
    <textarea
      :id="id"
      v-model="text"
      v-focus="autofocus"
      :aria-label="label"
      :placeholder="placeholder"
      class="placeholder:text-muted-foreground min-h-0 w-full flex-1 resize-none bg-transparent px-2 py-1.5 text-left outline-none"
      @keydown="onKeydown"
    />
  </div>
</template>
