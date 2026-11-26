<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { CheckIcon, CopyIcon, LoaderCircleIcon, UsersIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { keepName, keptName } from '../collab/name'
import type { Sharing } from '../collab/sharing'
import { useBusy } from '../composables/useBusy'
import { showError } from '../composables/useErrors'

// Working together (J19): who has the workspace shares it under a link, and whoever opens
// the link changes it with them, browser to browser (collab/). In the top bar: who is here,
// and the button to share, to see the link again, to stop or to leave.
const props = defineProps<{ sharing: Sharing }>()
const router = useRouter()
const { busy, run } = useBusy()

const name = ref(keptName())
const on = computed(() => props.sharing.state.value === 'on')
const host = props.sharing.role === 'host'
const people = computed(() => props.sharing.people.value.map((person) => ({ ...person, you: person.id === props.sharing.you.value })))

const start = () =>
  run(async () => {
    try {
      await props.sharing.start(keepName(name.value))
    } catch (failure) {
      showError(failure instanceof Error ? failure.message : 'Sharing could not be started.')
    }
  })

/** A guest who leaves goes back to their own diagrams. */
function leave() {
  props.sharing.stop()
  void router.push('/')
}

const copied = ref(false)
async function copy() {
  try {
    await navigator.clipboard.writeText(props.sharing.link.value ?? '')
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    showError('The browser did not let the link be copied. Select it in its field and copy it by hand.')
  }
}
</script>

<template>
  <div class="flex items-center gap-1">
    <!-- Who is here, at a glance: a dot with a letter each, in the colour of their pointer. -->
    <ul v-if="on" aria-label="People here" class="flex items-center -space-x-1.5 max-sm:hidden">
      <li
        v-for="person in people"
        :key="person.id"
        :aria-label="person.you ? `${person.name} (you)` : person.name"
        :title="person.you ? `${person.name} (you)` : person.name"
        class="person-dot ring-background grid size-6 place-items-center rounded-full text-[11px] font-semibold ring-2"
        :style="{ '--colour': `var(--line-${person.colour})` }"
      >
        <span aria-hidden="true">{{ [...person.name][0]?.toUpperCase() }}</span>
      </li>
    </ul>
    <Popover>
      <PopoverTrigger as-child>
        <Button variant="ghost" size="icon" aria-label="Share" title="Work on this workspace together" :class="{ 'bg-accent': on }">
          <UsersIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" class="w-80" aria-label="Share">
        <template v-if="host && !on">
          <PopoverHeader>
            <PopoverTitle>Work together</PopoverTitle>
            <PopoverDescription class="leading-snug">
              Whoever opens your link changes this workspace with you, while you have it open. Their browsers connect to yours directly: they see your name, and can see your IP address.
            </PopoverDescription>
          </PopoverHeader>
          <form aria-label="Share" class="flex flex-col gap-2.5" :aria-busy="busy" @submit.prevent="start">
            <label class="flex flex-col gap-1.5 text-sm font-medium">
              Your name
              <Input v-model="name" required maxlength="40" autocomplete="nickname" placeholder="As the others see you" class="h-9" />
            </label>
            <Button type="submit" :disabled="busy || name.trim() === ''" :aria-busy="busy" :class="{ 'disabled:opacity-100': busy }">
              <LoaderCircleIcon v-if="busy" class="animate-spin" aria-hidden="true" />
              Start sharing
            </Button>
          </form>
        </template>
        <template v-else>
          <PopoverHeader>
            <PopoverTitle>{{ host ? 'You are sharing this workspace' : 'A shared workspace' }}</PopoverTitle>
            <PopoverDescription class="leading-snug">
              {{
                host
                  ? 'Give the link to who you want to work with. It leads here while you have this workspace open.'
                  : 'You work in the browser of who shares it: nothing of it is kept in yours.'
              }}
            </PopoverDescription>
          </PopoverHeader>
          <div v-if="host" class="flex items-center gap-1.5">
            <Input readonly aria-label="Share link" :model-value="sharing.link.value" class="h-9 min-w-0 flex-1 text-xs" @focus="($event.target as HTMLInputElement).select()" />
            <Button variant="outline" size="icon-lg" :aria-label="copied ? 'Copied' : 'Copy link'" :title="copied ? 'Copied' : 'Copy link'" @click="copy">
              <CheckIcon v-if="copied" aria-hidden="true" />
              <CopyIcon v-else aria-hidden="true" />
            </Button>
          </div>
          <ul aria-label="In this session" class="flex flex-col gap-1">
            <li v-for="person in people" :key="person.id" class="flex items-center gap-2">
              <span class="person-dot size-2.5 rounded-full" :style="{ '--colour': `var(--line-${person.colour})` }" aria-hidden="true" />
              <span class="truncate">{{ person.name }}</span>
              <span v-if="person.you" class="text-muted-foreground text-xs">you</span>
              <span v-else-if="person.id === 'host'" class="text-muted-foreground text-xs">shares</span>
            </li>
          </ul>
          <Button v-if="host" variant="outline" @click="sharing.stop()">Stop sharing</Button>
          <Button v-else variant="outline" @click="leave">Leave</Button>
        </template>
      </PopoverContent>
    </Popover>
  </div>
</template>

<style scoped>
.person-dot {
  background: var(--colour);
  color: var(--background);
}
</style>
