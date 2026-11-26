<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { KeyRoundIcon, LoaderCircleIcon, LogOutIcon, UserIcon, UsersIcon } from '@lucide/vue'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuSeparator, DropdownMenuTrigger } from 'reka-ui'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useBusy } from '../composables/useBusy'
import { showError } from '../composables/useErrors'
import { useSession } from '../composables/useSession'
import { api, failureText } from '../lib/api'

// Who is signed in, a new password, the way out, and for an admin the way to the users.
const router = useRouter()
const { user, isAdmin, signOut } = useSession()

// A new password: the current one is asked for, so an open browser alone is not enough.
const changing = ref(false)
const current = ref('')
const replacement = ref('')
// About what was typed: it stands at the form.
const problem = ref('')
const { busy, run } = useBusy()

function askForPassword() {
  current.value = replacement.value = problem.value = ''
  changing.value = true
}

const change = () =>
  run(async () => {
    problem.value = ''
    try {
      await api.post('/me/password', { current: current.value, new: replacement.value })
      changing.value = false
    } catch (failure) {
      problem.value = failureText(failure)
    }
  })

async function leave() {
  try {
    await signOut()
    await router.replace('/login')
  } catch (failure) {
    showError(failureText(failure))
  }
}
</script>

<template>
  <DropdownMenuRoot v-if="user" :modal="false">
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon" aria-label="Account" title="Account">
        <UserIcon aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent align="end" :side-offset="4" class="bg-popover text-popover-foreground ring-foreground/10 z-50 min-w-56 rounded-lg p-1 text-sm shadow-md ring-1">
        <DropdownMenuLabel class="flex flex-col px-2 py-1.5">
          <span class="font-medium">{{ user.name || user.email }}</span>
          <span v-if="user.name" class="text-muted-foreground text-xs">{{ user.email }}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator class="bg-border -mx-1 my-1 h-px" />
        <DropdownMenuItem v-if="isAdmin" class="data-highlighted:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none" @select="router.push('/users')">
          <UsersIcon class="size-4" aria-hidden="true" />
          Users
        </DropdownMenuItem>
        <DropdownMenuItem class="data-highlighted:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none" @select="askForPassword">
          <KeyRoundIcon class="size-4" aria-hidden="true" />
          Change password
        </DropdownMenuItem>
        <DropdownMenuItem class="data-highlighted:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none" @select="leave">
          <LogOutIcon class="size-4" aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>

  <Dialog v-model:open="changing">
    <DialogContent class="sm:max-w-md">
      <form class="contents" :aria-busy="busy" @submit.prevent="change">
        <DialogHeader>
          <DialogTitle>Change your password</DialogTitle>
          <DialogDescription>At least 10 characters. Your other browsers are signed out; this one stays signed in.</DialogDescription>
        </DialogHeader>
        <label class="flex flex-col gap-1.5 text-sm font-medium">
          Current password
          <Input v-model="current" type="password" autocomplete="current-password" required autofocus class="h-9" />
        </label>
        <label class="flex flex-col gap-1.5 text-sm font-medium">
          New password
          <Input v-model="replacement" type="password" autocomplete="new-password" required class="h-9" />
        </label>
        <p v-if="problem" role="alert" class="text-destructive text-sm leading-snug">{{ problem }}</p>
        <DialogFooter>
          <Button type="button" variant="ghost" @click="changing = false">Cancel</Button>
          <Button type="submit" :disabled="busy" :aria-busy="busy">
            <LoaderCircleIcon v-if="busy" class="animate-spin" aria-hidden="true" />
            Change password
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
