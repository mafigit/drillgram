import { computed, shallowRef } from 'vue'
import { api } from '../lib/api'
import type { User } from '../lib/api'

// Who is signed in: one answer for the whole app. `undefined` until the server was asked.
const user = shallowRef<User | null | undefined>(undefined)

/** Asks the server who is signed in. Throws when it does not answer. */
async function load(): Promise<User | null> {
  const session = await api.get<{ user: User | null }>('/session')
  user.value = session.user
  return session.user
}

async function signIn(email: string, password: string): Promise<User> {
  user.value = await api.post<User>('/auth/login', { email, password })
  return user.value
}

/** What to do when nobody is signed in any more: what was the user's goes out of sight. */
const leaving: (() => void)[] = []
/** Asks to be told when the user is gone, to forget what was theirs. */
export function onSignedOut(forget: () => void): void {
  leaving.push(forget)
}

function gone(): void {
  user.value = null
  for (const forget of leaving) forget()
}

async function signOut(): Promise<void> {
  await api.post('/auth/logout')
  gone()
}

/** The session ended without this browser's doing: the server says nobody is signed in. */
function ended(): void {
  gone()
}

export function useSession() {
  return { user, isAdmin: computed(() => user.value?.role === 'admin'), load, signIn, signOut, ended }
}
