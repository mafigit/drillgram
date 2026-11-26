<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { SearchIcon } from '@lucide/vue'
import type { ElementKind } from '@drillgram/model'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { KIND_ICON, KIND_LABEL } from './canvas/kinds'

// The search: every object of the model, found by a part of its name. Picking one goes to it.
// It opens from its field in the header or with Ctrl+K (Cmd+K on a Mac).
export interface Found {
  id: string
  name: string
  kind: ElementKind
  /** The diagram it is on, in words; nothing when that is the open one. */
  where?: string
}

const props = defineProps<{ objects: Found[] }>()
const emit = defineEmits<{ pick: [objectId: string] }>()

const open = defineModel<boolean>('open', { default: false })
const text = ref('')
/** Which result the arrows are on. */
const active = ref(0)
const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

const results = computed(() => {
  const wanted = text.value.trim().toLowerCase()
  return props.objects.filter((object) => object.name.toLowerCase().includes(wanted)).slice(0, 50)
})
watch([text, open], () => (active.value = 0))
watch(open, (now) => now && (text.value = ''))

function step(by: number) {
  const count = results.value.length
  if (count > 0) active.value = (active.value + by + count) % count
}

function pick(object: Found | undefined) {
  if (!object) return
  open.value = false
  emit('pick', object.id)
}

const vFocus = { mounted: (el: HTMLElement) => el.focus() }
</script>

<template>
  <Popover v-model:open="open">
    <!-- Below lg (tablets) only the icon: the header keeps room for the breadcrumb. -->
    <PopoverTrigger as-child>
      <button
        type="button"
        aria-label="Search"
        class="text-muted-foreground hover:bg-accent flex h-8 items-center gap-2 rounded-lg border px-2.5 text-sm transition-colors lg:w-52"
      >
        <SearchIcon class="size-4 shrink-0" aria-hidden="true" />
        <span class="flex-1 text-left max-lg:hidden">Search</span>
        <kbd class="bg-muted rounded border px-1 font-sans text-[10px] max-lg:hidden" aria-hidden="true">
          {{ MAC ? '⌘' : 'Ctrl' }} K
        </kbd>
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" class="w-80 p-0">
      <div class="flex items-center gap-2 border-b px-3">
        <SearchIcon class="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <input
          v-model="text"
          v-focus
          role="combobox"
          aria-label="Search"
          aria-expanded="true"
          aria-controls="object-search-results"
          aria-autocomplete="list"
          :aria-activedescendant="results[active] ? `object-search-${active}` : undefined"
          placeholder="Find an object by its title"
          class="placeholder:text-muted-foreground h-10 w-full bg-transparent text-sm outline-none"
          @keydown.down.prevent="step(1)"
          @keydown.up.prevent="step(-1)"
          @keydown.enter.prevent="pick(results[active])"
        />
      </div>
      <ul
        id="object-search-results"
        role="listbox"
        aria-label="Found objects"
        class="max-h-72 overflow-y-auto p-1"
      >
        <li
          v-for="(object, i) in results"
          :id="`object-search-${i}`"
          :key="object.id"
          role="option"
          :aria-selected="i === active"
          class="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm"
          :class="{ 'bg-accent text-accent-foreground': i === active }"
          @pointermove="active = i"
          @click="pick(object)"
        >
          <span class="kind-chip grid size-5 shrink-0 place-items-center rounded-md" :style="{ '--kind': `var(--kind-${object.kind})` }">
            <component :is="KIND_ICON[object.kind]" class="size-3" aria-hidden="true" />
          </span>
          <span class="truncate">{{ object.name }}</span>
          <span class="text-muted-foreground ml-auto shrink-0 truncate text-xs">
            {{ object.where ?? KIND_LABEL[object.kind] }}
          </span>
        </li>
      </ul>
      <p v-if="results.length === 0" class="text-muted-foreground px-3 pb-3 text-sm">No object found.</p>
    </PopoverContent>
  </Popover>
</template>
