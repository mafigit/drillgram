<script setup lang="ts">
import { computed, ref } from 'vue'
import { Trash2Icon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// A frame around cards of a view (a group): its name and, in a few words, what it is, as a
// deployment diagram says of a node ("Deployment Node: Azure App Service"). The same form puts
// the selected cards in a frame (a new one, or one the view has) and changes a frame.
const props = defineProps<{
  /** The frames the view has, to join one. Not asked for when a frame is edited. */
  existing?: { id: string; name: string }[]
  /** The frame being changed: the form starts with what it says. */
  edit?: { name: string; type?: string }
}>()
const emit = defineEmits<{
  submit: [name: string, what: string]
  remove: []
}>()

const NEW = ''
/** The name of the frame to join, or `NEW`. */
const joined = ref(NEW)
const name = ref(props.edit?.name ?? '')
const what = ref(props.edit?.type ?? '')
const joining = computed(() => joined.value !== NEW)
const ready = computed(() => joining.value || name.value.trim() !== '')

function submit() {
  if (ready.value) emit('submit', joining.value ? joined.value : name.value, joining.value ? '' : what.value)
}
</script>

<template>
  <form :aria-label="edit ? 'Edit the group' : 'Group the selection'" class="flex w-64 flex-col gap-2.5" @submit.prevent="submit">
    <select
      v-if="!edit && existing && existing.length > 0"
      v-model="joined"
      aria-label="Group"
      class="border-input bg-background h-9 rounded-lg border px-2 text-sm outline-none"
    >
      <option :value="NEW">New group</option>
      <option v-for="group in existing" :key="group.id" :value="group.name">{{ group.name }}</option>
    </select>
    <template v-if="!joining">
      <Input v-model="name" aria-label="Name" placeholder="Name, e.g. prod-appsvc-shop" class="h-9" autofocus />
      <Input v-model="what" aria-label="What it is" placeholder="What it is, e.g. Deployment Node: Azure App Service" class="h-9" />
    </template>
    <div class="flex items-center gap-2">
      <Button v-if="edit" type="button" variant="ghost" size="sm" class="text-muted-foreground" aria-label="Delete the group" title="Delete the group: its cards stay" @click="emit('remove')">
        <Trash2Icon aria-hidden="true" />
        Delete
      </Button>
      <Button type="submit" size="sm" class="ml-auto" :disabled="!ready">{{ edit ? 'Save' : 'Group' }}</Button>
    </div>
  </form>
</template>
