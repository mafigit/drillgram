<script setup lang="ts">
import { computed } from 'vue'
import type { ElementKind } from '@drillgram/model'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { KIND_ICON, KIND_LABEL } from './canvas/kinds'

// The objects of the model that are not on this diagram yet, to pick one from: all of them,
// under where each is from (the Overview, or the boxes it stands inside).
const props = defineProps<{ objects: { id: string; name: string; kind: ElementKind; where: string }[] }>()
const emit = defineEmits<{ pick: [objectId: string] }>()

/** The objects by where they are from, the places in the order they first come in. */
const places = computed(() => {
  const byPlace = new Map<string, typeof props.objects>()
  for (const object of props.objects) byPlace.set(object.where, [...(byPlace.get(object.where) ?? []), object])
  return [...byPlace].map(([where, objects]) => ({ where, objects }))
})
</script>

<template>
  <Command>
    <CommandInput placeholder="Find an object" aria-label="Find an object" />
    <CommandList aria-label="Existing objects">
      <CommandEmpty>No object found.</CommandEmpty>
      <CommandGroup v-for="place in places" :key="place.where" :heading="place.where">
        <CommandItem v-for="object in place.objects" :key="object.id" :value="object.id" @select="emit('pick', object.id)">
          <span class="kind-chip grid size-5 place-items-center rounded-md" :style="{ '--kind': `var(--kind-${object.kind})` }">
            <component :is="KIND_ICON[object.kind]" class="size-3" aria-hidden="true" />
          </span>
          {{ object.name }}
          <span class="text-muted-foreground ml-auto text-xs">{{ KIND_LABEL[object.kind] }}</span>
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </Command>
</template>
