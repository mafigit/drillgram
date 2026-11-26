<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useEventListener } from '@vueuse/core'
import { LoaderCircleIcon } from '@lucide/vue'
import AppHeader from '../components/AppHeader.vue'
import OpenWorkspace from './OpenWorkspace.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { keepName, keptName } from '../collab/name'
import { JoinFailed } from '../collab/sharing'
import { showError } from '../composables/useErrors'
import { openSharedStore } from '../composables/useWorkspaceStore'
import type { WorkspaceStore } from '../composables/useWorkspaceStore'
import type { Problem } from '../lib/workspaceLog'

// A workspace somebody else shares, opened by its link (J19): first who you are, then the
// editor on their workspace, which stays in their browser. When the session is over, or the
// link leads to nobody, this page says so.
const props = defineProps<{ room: string; viewId?: string }>()
const route = useRoute()

type Why = JoinFailed['why'] | 'bye' | 'lost'
const WHY: Record<Why, { title: string; text: string }> = {
  nobody: {
    title: 'Nobody is sharing here right now',
    text: 'The link leads to a workspace only while the one who shares it has it open. Ask them to share it again, then try once more.',
  },
  full: { title: 'This session is full', text: 'It has as many people as one browser can share with. Try again when somebody has left.' },
  noWay: {
    title: 'No way to the other browser',
    text: 'Your browser and theirs could not connect to each other. Some networks do not let two browsers talk directly.',
  },
  unreachable: { title: 'The meeting point does not answer', text: 'Browsers find each other through this site. Check the connection, then try again.' },
  bye: { title: 'This session is over', text: 'The one who shared the workspace stopped sharing it. It is still theirs, with everything you did together.' },
  lost: {
    title: 'This session is over',
    text: 'The connection to the one who shares is gone: they closed the workspace, or a network dropped out. What was done until then is in their browser.',
  },
}

const name = ref(keptName())
const store = shallowRef<WorkspaceStore>()
const joining = ref(false)
/** Why there is no session, when one was asked for. */
const why = ref<Why>()

function said(problem: Problem) {
  if (problem === 'conflict') showError('Somebody else changed the workspace at the same moment. It is shown as it is now; your last change was not kept.')
  else if (problem === 'readOnly') showError('Only the one who shares the workspace can do that. Your change was taken back.')
}

function ended(reason: 'bye' | 'lost') {
  store.value = undefined
  why.value = reason
}

async function join() {
  if (joining.value || name.value.trim() === '') return
  joining.value = true
  try {
    // After the "#" of the link: the key of the session, which this browser tells no server.
    store.value = await openSharedStore(props.room, route.hash.slice(1), keepName(name.value), said, ended)
    why.value = undefined
  } catch (failure) {
    why.value = failure instanceof JoinFailed ? failure.why : 'unreachable'
  } finally {
    joining.value = false
  }
}

// Leaving the page is leaving the session: the others see it at once, not when the
// connection times out.
const leave = () => store.value?.sharing?.stop()
onBeforeUnmount(leave)
useEventListener(window, 'pagehide', leave)
</script>

<template>
  <OpenWorkspace v-if="store" :store="store" :view-id="viewId" />
  <div v-else class="bg-background flex h-dvh flex-col">
    <AppHeader />
    <main class="flex flex-1 items-start justify-center overflow-auto p-6 pt-[12vh]">
      <div class="bg-card flex w-full max-w-sm flex-col gap-4 rounded-xl border p-6 shadow-sm">
        <template v-if="why">
          <h2 class="text-lg font-semibold tracking-tight">{{ WHY[why].title }}</h2>
          <p role="status" class="text-muted-foreground text-sm leading-snug">{{ WHY[why].text }}</p>
        </template>
        <template v-else>
          <h2 class="text-lg font-semibold tracking-tight">Join a shared workspace</h2>
          <p class="text-muted-foreground text-sm leading-snug">
            Somebody shares a workspace with you. You change it together, in their browser: nothing of it is kept in yours. Your browser connects to theirs directly, so they and the others see your name and can see your IP address.
          </p>
        </template>
        <form aria-label="Join" class="flex flex-col gap-3" :aria-busy="joining" @submit.prevent="join">
          <label class="flex flex-col gap-1.5 text-sm font-medium">
            Your name
            <Input v-model="name" required maxlength="40" autocomplete="nickname" autofocus placeholder="As the others see you" class="h-9" />
          </label>
          <Button type="submit" :disabled="joining || name.trim() === ''" :aria-busy="joining" :class="{ 'disabled:opacity-100': joining }">
            <LoaderCircleIcon v-if="joining" class="animate-spin" aria-hidden="true" />
            {{ why ? 'Try again' : 'Join' }}
          </Button>
        </form>
        <RouterLink to="/" class="text-muted-foreground hover:text-foreground text-sm underline underline-offset-2">To my own diagrams</RouterLink>
      </div>
    </main>
  </div>
</template>
