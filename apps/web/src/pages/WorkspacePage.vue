<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useEventListener } from '@vueuse/core'
import { useRoute, useRouter } from 'vue-router'
import { LoaderCircleIcon } from '@lucide/vue'
import AppHeader from '../components/AppHeader.vue'
import OpenWorkspace from './OpenWorkspace.vue'
import { Button } from '@/components/ui/button'
import { showError } from '../composables/useErrors'
import { useSession } from '../composables/useSession'
import { openWorkspaceStore } from '../composables/useWorkspaceStore'
import type { WorkspaceStore } from '../composables/useWorkspaceStore'
import { useWorkspaces } from '../composables/useWorkspaces'
import { ApiError, NO_ANSWER } from '../lib/api'
import type { Problem } from '../lib/workspaceLog'

// A workspace of the server, opened: its change log is read, then the editor works on it.
const props = defineProps<{ workspace: string; viewId?: string }>()
const route = useRoute()
const router = useRouter()
const session = useSession()
const { opened } = useWorkspaces()

const store = shallowRef<WorkspaceStore>()
const unreachable = ref(false)

function signInAgain() {
  session.ended()
  void router.replace({ name: 'login', query: { next: route.fullPath } })
}

// What the change log has to say while the editor is open (lib/workspaceLog.ts).
function said(problem: Problem) {
  if (problem === 'offline') showError(NO_ANSWER.waiting)
  else if (problem === 'conflict') showError('This workspace was changed somewhere else. It is shown as it is now; your last change was not kept.')
  else if (problem === 'readOnly') showError('You can look at this workspace, not change it. Your change was taken back.')
  else if (problem === 'signedOut') signInAgain()
  else if (problem === 'gone') {
    showError('This workspace is not there any more.')
    void router.replace('/')
  }
}

async function open() {
  unreachable.value = false
  try {
    store.value = await openWorkspaceStore(props.workspace, said)
    opened(props.workspace)
  } catch (failure) {
    if (failure instanceof ApiError && failure.status === 401) signInAgain()
    else if (failure instanceof ApiError && failure.status === 404) {
      showError('There is no such workspace, or it is not shared with you.')
      await router.replace('/')
    } else unreachable.value = true
  }
}
onMounted(open)

// A workspace is shared while it is open: leaving the page ends the session (collab/), and
// the guests are told at once.
const stopSharing = () => store.value?.sharing?.stop()
onBeforeUnmount(stopSharing)
useEventListener(window, 'pagehide', stopSharing)
</script>

<template>
  <OpenWorkspace v-if="store" :store="store" :view-id="viewId" />
  <div v-else class="bg-background flex h-dvh flex-col">
    <AppHeader :plain="!unreachable" />
    <main class="flex flex-1 items-start justify-center p-6 pt-[12vh]" :aria-busy="!unreachable">
      <div v-if="unreachable" class="flex max-w-sm flex-col items-start gap-3">
        <h2 class="text-lg font-semibold tracking-tight">{{ NO_ANSWER.title }}</h2>
        <p class="text-muted-foreground text-sm leading-snug">{{ NO_ANSWER.text }}</p>
        <Button @click="open">Try again</Button>
      </div>
      <p v-else role="status" class="text-muted-foreground flex items-center gap-2 text-sm">
        <LoaderCircleIcon class="size-4 animate-spin" aria-hidden="true" />
        Opening the workspace
      </p>
    </main>
  </div>
</template>
