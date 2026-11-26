<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { LoaderCircleIcon } from '@lucide/vue'
import AppHeader from '../components/AppHeader.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useBusy } from '../composables/useBusy'
import { showError } from '../composables/useErrors'
import { useWorkspaces } from '../composables/useWorkspaces'
import { failureText, NO_ANSWER } from '../lib/api'

// The app's own address: on to the workspace that was open last. Somebody who has none (they
// deleted their last one) makes one here.
const router = useRouter()
const { load, first, create } = useWorkspaces()
const { busy, run } = useBusy()

const state = ref<'opening' | 'none' | 'unreachable'>('opening')
const name = ref('My workspace')

async function open() {
  state.value = 'opening'
  try {
    await load()
  } catch {
    state.value = 'unreachable'
    return
  }
  const workspace = first()
  if (workspace) await router.replace(`/w/${workspace.id}`)
  else state.value = 'none'
}
onMounted(open)

const make = () =>
  run(async () => {
    try {
      const made = await create(name.value)
      await router.replace(`/w/${made.id}`)
    } catch (failure) {
      showError(failureText(failure))
    }
  })
</script>

<template>
  <div class="bg-background flex h-dvh flex-col">
    <AppHeader :plain="state === 'opening'" />
    <main class="flex flex-1 items-start justify-center overflow-auto p-6 pt-[12vh]" :aria-busy="state === 'opening'">
      <p v-if="state === 'opening'" role="status" class="text-muted-foreground flex items-center gap-2 text-sm">
        <LoaderCircleIcon class="size-4 animate-spin" aria-hidden="true" />
        Opening your workspace
      </p>
      <div v-else-if="state === 'unreachable'" class="flex max-w-sm flex-col items-start gap-3">
        <h2 class="text-lg font-semibold tracking-tight">{{ NO_ANSWER.title }}</h2>
        <p class="text-muted-foreground text-sm leading-snug">{{ NO_ANSWER.text }}</p>
        <Button @click="open">Try again</Button>
      </div>
      <form v-else aria-label="New workspace" class="bg-card flex w-full max-w-sm flex-col gap-4 rounded-xl border p-6 shadow-sm" :aria-busy="busy" @submit.prevent="make">
        <h2 class="text-lg font-semibold tracking-tight">No workspace yet</h2>
        <p class="text-muted-foreground text-sm leading-snug">A workspace holds your diagrams. Give the first one a name.</p>
        <label class="flex flex-col gap-1.5 text-sm font-medium">
          Name
          <Input v-model="name" required maxlength="200" autofocus class="h-9" />
        </label>
        <Button type="submit" :disabled="busy || name.trim() === ''" :aria-busy="busy">
          <LoaderCircleIcon v-if="busy" class="animate-spin" aria-hidden="true" />
          Create
        </Button>
      </form>
    </main>
  </div>
</template>
