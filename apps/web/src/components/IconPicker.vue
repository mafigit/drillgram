<script setup lang="ts">
import { computed, ref } from 'vue'
import { CheckIcon, SearchIcon } from '@lucide/vue'
import { ICON_SETS, iconUrl, useTechIcons } from '../composables/useTechIcons'

// The icon of one object: find one in the library by a part of its name and press it to put it
// on the card, in the place of the one that was there; press the attached one to take it off.
// A card carries one icon.
const props = defineProps<{
  /** The icons the object has now, in their order. */
  attached: string[]
}>()
const emit = defineEmits<{ change: [icons: string[]]; close: [] }>()

const library = useTechIcons()
const text = ref('')
const set = ref<string>()
/** How many icons are listed at most: the search narrows the rest down. */
const SHOWN = 72

const found = computed(() => {
  const words = text.value.toLowerCase().split(/\s+/).filter(Boolean)
  const all = [...library.value.values()]
  const fits = all.filter(
    (icon) =>
      (set.value === undefined || icon.set === set.value) &&
      words.every((word) => icon.title.toLowerCase().includes(word) || icon.name.includes(word)),
  )
  // What is attached comes first, then names that start with what was typed.
  const first = text.value.trim().toLowerCase()
  const rank = (icon: (typeof all)[number]) =>
    (props.attached.includes(icon.name) ? 0 : 2) + (first && icon.title.toLowerCase().startsWith(first) ? 0 : 1)
  return { count: fits.length, icons: fits.sort((a, b) => rank(a) - rank(b)).slice(0, SHOWN) }
})

/**
 * The name under an icon. With one set chosen, without the set's name in front of it: every icon
 * of Cloudflare's starts with "Cloudflare", and the room under an icon is short.
 */
function shortTitle(icon: { title: string; set: string }): string {
  const prefix = `${ICON_SETS[icon.set] ?? ''} `
  return set.value === icon.set && prefix !== ' ' && icon.title.startsWith(prefix) && icon.title.length > prefix.length ? icon.title.slice(prefix.length) : icon.title
}

const field = ref<HTMLInputElement>()
/** The icon under the pointer: its whole name, set and licence are spelled out below the list. */
const pointed = ref<string>()
const details = computed(() => {
  const icon = pointed.value === undefined ? undefined : library.value.get(pointed.value)
  return icon && `${icon.title} · ${ICON_SETS[icon.set] ?? icon.set} · ${icon.licence}`
})

function toggle(name: string) {
  // The cursor stays in the field: the next icon is a few letters away.
  field.value?.focus()
  if (props.attached.includes(name)) emit('change', props.attached.filter((icon) => icon !== name))
  else emit('change', [name])
}

const vFocus = { mounted: (el: HTMLElement) => el.focus() }
</script>

<template>
  <div role="dialog" aria-label="Icons" class="flex w-[22rem] flex-col" @keydown.esc.stop="emit('close')">
    <div class="flex items-center gap-2 border-b px-3">
      <SearchIcon class="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
      <input
        ref="field"
        v-model="text"
        v-focus
        role="combobox"
        aria-label="Find an icon"
        aria-expanded="true"
        aria-controls="icon-picker-results"
        placeholder="Find an icon: PostgreSQL, S3, Cloudflare…"
        class="placeholder:text-muted-foreground h-10 w-full bg-transparent text-sm outline-none"
      />
    </div>
    <div class="flex flex-wrap gap-1 px-2 pt-2" role="group" aria-label="Icon set">
      <button
        v-for="[key, label] in [[undefined, 'All'], ...Object.entries(ICON_SETS)] as [string | undefined, string][]"
        :key="label"
        type="button"
        class="rounded-full border px-2 py-0.5 text-xs transition-colors"
        :class="set === key ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground hover:bg-accent'"
        :aria-pressed="set === key"
        @click="set = key"
      >
        {{ label }}
      </button>
    </div>
    <ul
      id="icon-picker-results"
      role="listbox"
      aria-label="Icons"
      aria-multiselectable="true"
      class="grid max-h-72 grid-cols-4 gap-1 overflow-y-auto p-2"
      @pointerleave="pointed = undefined"
    >
      <li
        v-for="icon in found.icons"
        :key="icon.name"
        role="option"
        :aria-label="icon.title"
        :aria-selected="attached.includes(icon.name)"
        :title="`${icon.title} · ${ICON_SETS[icon.set] ?? icon.set} · ${icon.licence}`"
        class="hover:bg-accent relative flex cursor-default flex-col items-center gap-1 rounded-lg border border-transparent p-1.5 aria-disabled:opacity-40 aria-selected:border-primary"
        @pointerenter="pointed = icon.name"
        @click="toggle(icon.name)"
      >
        <span class="grid size-10 place-items-center rounded-md bg-white p-1.5">
          <img :src="iconUrl(icon.name)" alt="" loading="lazy" class="size-full object-contain" />
        </span>
        <span class="w-full truncate text-center text-[10px] leading-tight">{{ shortTitle(icon) }}</span>
        <CheckIcon
          v-if="attached.includes(icon.name)"
          class="bg-primary text-primary-foreground absolute -top-1 -right-1 size-4 rounded-full p-0.5"
          aria-hidden="true"
        />
      </li>
    </ul>
    <p v-if="found.count === 0" class="text-muted-foreground px-3 pb-2 text-sm">
      {{ library.size === 0 ? 'Loading the icons…' : 'No icon found.' }}
    </p>
    <p v-else-if="found.count > SHOWN" class="text-muted-foreground px-3 pb-1 text-xs">
      {{ SHOWN }} of {{ found.count }} shown. Type more to narrow them down.
    </p>
    <p data-testid="icon-details" class="min-h-5 truncate px-3 text-xs font-medium">{{ details }}</p>
    <p class="text-muted-foreground border-t px-3 py-2 text-[11px] leading-snug">
      Icons from theSVG and, for its products, from Cloudflare's documentation; shown unchanged, each
      under its own licence (point at an icon to see it). AWS icons: CC BY-ND 2.0. Cloudflare icons:
      CC BY 4.0, © Cloudflare, Inc. Names and logos are trademarks of their owners.
    </p>
  </div>
</template>
