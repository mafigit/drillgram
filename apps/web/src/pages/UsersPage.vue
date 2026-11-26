<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowLeftIcon, LoaderCircleIcon } from '@lucide/vue'
import AppHeader from '../components/AppHeader.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useBusy } from '../composables/useBusy'
import { showError } from '../composables/useErrors'
import { useSession } from '../composables/useSession'
import { api, failureText } from '../lib/api'
import type { User } from '../lib/api'

// The users of the server, for an admin: make one, let one be an admin, keep one out.
// Nobody is deleted: a disabled user cannot sign in, and what they made stays.
const { user: me } = useSession()
const users = shallowRef<User[]>([])
const loading = ref(true)
/** The id of the user a row's button is working on. */
const working = ref<string>()

onMounted(async () => {
  try {
    users.value = await api.get<User[]>('/users')
  } catch (failure) {
    showError(failureText(failure))
  } finally {
    loading.value = false
  }
})

const { busy, run } = useBusy()
const email = ref('')
const name = ref('')
const password = ref('')
const role = ref<User['role']>('user')
// About what was typed: it stands at the form.
const problem = ref('')

const make = () =>
  run(async () => {
    problem.value = ''
    try {
      const made = await api.post<User>('/users', { email: email.value, name: name.value, password: password.value, role: role.value })
      users.value = [...users.value, made]
      email.value = name.value = password.value = ''
      role.value = 'user'
    } catch (failure) {
      problem.value = failureText(failure)
    }
  })

async function edit(user: User, change: Partial<Pick<User, 'role' | 'disabled'>>) {
  if (working.value) return
  working.value = user.id
  try {
    const edited = await api.patch<User>(`/users/${user.id}`, change)
    users.value = users.value.map((known) => (known.id === edited.id ? edited : known))
  } catch (failure) {
    showError(failureText(failure))
  } finally {
    working.value = undefined
  }
}
</script>

<template>
  <div class="bg-background flex h-dvh flex-col">
    <AppHeader>
      <RouterLink to="/" class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
        <ArrowLeftIcon class="size-4" aria-hidden="true" />
        Back to the diagrams
      </RouterLink>
    </AppHeader>
    <main class="flex-1 overflow-auto p-6">
      <div class="mx-auto flex max-w-4xl flex-col gap-6">
        <h2 class="text-lg font-semibold tracking-tight">Users</h2>

        <form aria-label="New user" class="bg-card flex flex-col gap-3 rounded-xl border p-4" :aria-busy="busy" @submit.prevent="make">
          <h3 class="text-sm font-semibold">New user</h3>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label class="flex flex-col gap-1.5 text-sm font-medium">
              E-mail
              <Input v-model="email" type="email" required autocomplete="off" class="h-9" />
            </label>
            <label class="flex flex-col gap-1.5 text-sm font-medium">
              Name
              <Input v-model="name" maxlength="200" autocomplete="off" class="h-9" />
            </label>
            <label class="flex flex-col gap-1.5 text-sm font-medium">
              Password
              <Input v-model="password" type="password" autocomplete="new-password" class="h-9" />
            </label>
            <label class="flex flex-col gap-1.5 text-sm font-medium">
              Role
              <select v-model="role" class="border-input bg-background h-9 rounded-lg border px-2 text-sm font-normal outline-none">
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </div>
          <p class="text-muted-foreground text-xs leading-snug">
            At least 10 characters. Without a password the user signs in through single sign-on or the proxy only.
          </p>
          <p v-if="problem" role="alert" class="text-destructive text-sm leading-snug">{{ problem }}</p>
          <Button type="submit" size="sm" class="self-start" :disabled="busy" :aria-busy="busy">
            <LoaderCircleIcon v-if="busy" class="animate-spin" aria-hidden="true" />
            Create user
          </Button>
        </form>

        <div class="overflow-x-auto rounded-xl border" :aria-busy="loading">
          <table class="w-full text-left text-sm">
            <thead class="text-muted-foreground border-b text-xs">
              <tr>
                <th class="px-3 py-2 font-medium">Name</th>
                <th class="px-3 py-2 font-medium">E-mail</th>
                <th class="px-3 py-2 font-medium">Role</th>
                <th class="px-3 py-2 font-medium"><span class="sr-only">What to do</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in users" :key="user.id" class="border-b last:border-b-0" :aria-busy="working === user.id">
                <td class="px-3 py-2 font-medium">
                  {{ user.name }}
                  <span v-if="user.id === me?.id" class="text-muted-foreground font-normal">(you)</span>
                </td>
                <td class="px-3 py-2">{{ user.email }}</td>
                <td class="px-3 py-2">
                  {{ user.role === 'admin' ? 'Admin' : 'User' }}
                  <span v-if="user.disabled" class="bg-muted text-muted-foreground ml-1.5 rounded-md px-1.5 py-0.5 text-xs">Disabled</span>
                </td>
                <td class="px-3 py-2">
                  <div class="flex justify-end gap-1.5">
                    <Button variant="ghost" size="sm" :disabled="working !== undefined" @click="edit(user, { role: user.role === 'admin' ? 'user' : 'admin' })">
                      {{ user.role === 'admin' ? 'Make user' : 'Make admin' }}
                    </Button>
                    <Button variant="ghost" size="sm" :disabled="working !== undefined" :aria-busy="working === user.id" @click="edit(user, { disabled: !user.disabled })">
                      <LoaderCircleIcon v-if="working === user.id" class="animate-spin" aria-hidden="true" />
                      {{ user.disabled ? 'Enable' : 'Disable' }}
                    </Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="loading" role="status" class="text-muted-foreground flex items-center gap-2 p-3 text-sm">
            <LoaderCircleIcon class="size-4 animate-spin" aria-hidden="true" />
            Reading the users
          </p>
        </div>
      </div>
    </main>
  </div>
</template>
