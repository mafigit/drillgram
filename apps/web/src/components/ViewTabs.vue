<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { PlusIcon, XIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

// The views of the box that is open (of the Overview, on the Overview): one tab each, the first
// view first. A box can have several views, each with its own cards and layout: its structure,
// how it is deployed, a flow through it. "+" adds one; a view that was added is renamed with a
// double-click on its tab and deleted with the button in it.
const props = defineProps<{
  views: { id: string; name: string; to: string }[]
  current: string
}>()
const emit = defineEmits<{
  add: [name: string, copy: boolean]
  rename: [viewId: string, name: string]
  remove: [viewId: string]
}>()

/** The first view is the one every box has: it keeps its name and cannot be deleted. */
const isAdded = (viewId: string) => props.views[0]?.id !== viewId

// Adding: a name, and whether the new view starts with what this one shows.
const adding = ref(false)
const newName = ref('')
const copy = ref(true)

function add() {
  if (newName.value.trim() === '') return
  emit('add', newName.value, copy.value)
  adding.value = false
  newName.value = ''
  copy.value = true
}

// Renaming: in the tab itself. Enter or leaving the field saves, Escape does not.
const renaming = ref<string>()
const renamed = ref('')
const field = ref<HTMLInputElement[]>()

async function startRenaming(view: { id: string; name: string }) {
  if (!isAdded(view.id)) return
  renaming.value = view.id
  renamed.value = view.name
  await nextTick()
  field.value?.[0]?.select()
}

function commitRenaming() {
  const viewId = renaming.value
  renaming.value = undefined
  if (viewId !== undefined && renamed.value.trim() !== '') emit('rename', viewId, renamed.value)
}
</script>

<template>
  <div class="flex items-center gap-1" data-tour="views">
    <!-- Nothing here changes its width with the view that is open: every added tab has its own
         delete button, so going from tab to tab moves no tab and no button. -->
    <div role="tablist" aria-label="Views" class="bg-muted/70 flex items-center gap-0.5 rounded-lg p-0.5">
      <div
        v-for="view in views"
        :key="view.id"
        role="presentation"
        class="flex h-7 items-center rounded-md transition-colors"
        :class="view.id === current ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'"
      >
        <input
          v-if="renaming === view.id"
          ref="field"
          v-model="renamed"
          aria-label="View name"
          class="bg-background text-foreground h-7 w-32 rounded-md border px-2 text-sm outline-none"
          @keydown.enter="commitRenaming"
          @keydown.esc="renaming = undefined"
          @blur="commitRenaming"
        />
        <template v-else>
          <RouterLink
            role="tab"
            :to="view.to"
            :aria-selected="view.id === current"
            :title="isAdded(view.id) ? 'Double-click to rename' : undefined"
            class="text-sm leading-7 font-medium whitespace-nowrap"
            :class="isAdded(view.id) ? 'pr-1 pl-2.5' : 'px-2.5'"
            @dblclick.prevent="startRenaming(view)"
          >
            {{ view.name }}
          </RouterLink>
          <button
            v-if="isAdded(view.id)"
            type="button"
            class="hover:bg-muted hover:text-foreground mr-1 grid size-5 place-items-center rounded opacity-60 hover:opacity-100"
            :aria-label="`Delete the view ${view.name}`"
            title="Delete this view"
            @click="emit('remove', view.id)"
          >
            <XIcon class="size-3.5" aria-hidden="true" />
          </button>
        </template>
      </div>
    </div>
    <Popover v-model:open="adding">
      <PopoverTrigger as-child>
        <Button variant="ghost" size="icon-sm" class="text-muted-foreground" aria-label="New view" title="New view">
          <PlusIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" class="w-64">
        <form aria-label="New view" class="flex flex-col gap-2.5" @submit.prevent="add">
          <Input v-model="newName" aria-label="Name" placeholder="Deployment, Data flow, …" class="h-9" autofocus />
          <label class="text-muted-foreground flex items-center gap-2 text-xs">
            <input v-model="copy" type="checkbox" class="size-3.5" />
            Start with the cards of this view
          </label>
          <Button type="submit" size="sm" :disabled="newName.trim() === ''">Add view</Button>
        </form>
      </PopoverContent>
    </Popover>
  </div>
</template>
