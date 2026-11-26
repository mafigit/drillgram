<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LoaderCircleIcon } from '@lucide/vue'
import AppHeader from '../components/AppHeader.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useBusy } from '../composables/useBusy'
import { useSession } from '../composables/useSession'
import { api, failureText } from '../lib/api'
import type { SignInWays } from '../lib/api'
import { next } from '../router'

// Who are you? With a password, or through the identity provider of the server when it has
// one. What went wrong stands at the form: it is about what was typed.
const route = useRoute()
const router = useRouter()
const { signIn } = useSession()
const { busy, run } = useBusy()

const ways = shallowRef<SignInWays>()
const email = ref('')
const password = ref('')
// Single sign-on comes back here with the reason when it let nobody in.
const problem = ref(typeof route.query.error === 'string' ? route.query.error : '')

onMounted(async () => {
  try {
    ways.value = await api.get<SignInWays>('/auth/config')
  } catch (failure) {
    problem.value = failureText(failure)
  }
})

const submit = () =>
  run(async () => {
    problem.value = ''
    try {
      await signIn(email.value, password.value)
    } catch (failure) {
      problem.value = failureText(failure)
      return
    }
    await router.replace(next(route.query.next))
  })
</script>

<template>
  <div class="bg-background flex h-dvh flex-col">
    <AppHeader />
    <main class="flex flex-1 items-start justify-center overflow-auto p-6 pt-[12vh]">
      <div class="bg-card flex w-full max-w-sm flex-col gap-4 rounded-xl border p-6 shadow-sm">
        <h2 class="text-lg font-semibold tracking-tight">Sign in</h2>
        <p v-if="problem" role="alert" class="text-destructive text-sm leading-snug">{{ problem }}</p>
        <form v-if="!ways || ways.password" aria-label="Sign in" class="flex flex-col gap-3" :aria-busy="busy" @submit.prevent="submit">
          <label class="flex flex-col gap-1.5 text-sm font-medium">
            E-mail
            <Input v-model="email" type="email" name="email" autocomplete="username" required autofocus class="h-9" />
          </label>
          <label class="flex flex-col gap-1.5 text-sm font-medium">
            Password
            <Input v-model="password" type="password" name="password" autocomplete="current-password" required class="h-9" />
          </label>
          <Button type="submit" class="mt-1" :disabled="busy" :aria-busy="busy">
            <LoaderCircleIcon v-if="busy" class="animate-spin" aria-hidden="true" />
            Sign in
          </Button>
        </form>
        <!-- A link, not a request of the app: the browser itself goes to the identity provider. -->
        <Button v-if="ways?.oidc" as="a" href="/api/auth/oidc/start" variant="outline">Sign in with {{ ways.oidc.name }}</Button>
        <p v-if="ways && !ways.password && !ways.oidc" class="text-muted-foreground text-sm leading-snug">
          This server signs you in through the proxy in front of it. Open the app through that proxy.
        </p>
      </div>
    </main>
  </div>
</template>
