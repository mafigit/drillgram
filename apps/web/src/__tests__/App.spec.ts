import { beforeAll, beforeEach, describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '../App.vue'
import { useSession } from '../composables/useSession'
import router from '../router'

// Keep the real service-worker registration out of jsdom.
vi.mock('virtual:pwa-register/vue', async () => {
  const { ref } = await import('vue')
  return {
    useRegisterSW: () => ({ needRefresh: ref(false), offlineReady: ref(false), updateServiceWorker: vi.fn() }),
  }
})

// No engine in jsdom (there is nothing to fetch the .wasm from): the editor then relies on the
// model's own rules, as it does while the engine is still loading.
vi.mock('../composables/useLayoutEngine', async () => {
  const { shallowRef } = await import('vue')
  return { useLayoutEngine: () => shallowRef(undefined) }
})

// jsdom has no ResizeObserver; the canvas (Vue Flow) asks for one.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

// A server, as far as the app asks it when it opens: who is signed in, their workspaces, the
// change log of one. `signedIn` says whether anybody is.
let signedIn = true
const answers: Record<string, () => unknown> = {
  '/api/session': () => ({ user: signedIn ? { id: 'u1', email: 'ada@example.org', name: 'Ada', role: 'user', disabled: false } : null }),
  '/api/auth/config': () => ({ password: true, oidc: null }),
  '/api/workspaces': () => [{ id: 'w1', name: 'My workspace', role: 'owner', head: 0 }],
  '/api/workspaces/w1/log?after=0': () => ({ head: 0, entries: [] }),
}
vi.stubGlobal('fetch', async (address: string) => {
  const answer = answers[address]
  return new Response(JSON.stringify(answer ? answer() : { error: 'There is no such thing.' }), { status: answer ? 200 : 404 })
})

async function mountApp(path = '/') {
  useSession().user.value = undefined
  await router.push(path)
  await router.isReady()
  return mount(App, { global: { plugins: [router] } })
}

describe('App', () => {
  // The pages load lazily: the first test to reach one would otherwise spend its waitFor on Vite
  // transforming the editor, past 1 s on a slow runner.
  beforeAll(() => Promise.all(router.getRoutes().map((r) => (r.components?.default as () => unknown)?.())))
  beforeEach(() => {
    signedIn = true
  })

  it('renders the app heading', async () => {
    const wrapper = await mountApp()
    expect(wrapper.get('h1').text()).toBe('Drillgram')
  })

  it('opens the workspace of the user on its Overview, at the root and for an unknown address', async () => {
    for (const path of ['/', '/view/nope', '/some/route']) {
      const wrapper = await mountApp(path)
      await vi.waitFor(() => expect(wrapper.find('nav').exists()).toBe(true))
      expect(router.currentRoute.value.path).toBe('/w/w1')
      expect(wrapper.get('nav').text()).toBe('Overview')
      expect(wrapper.findAll('button').map((b) => b.text())).toContain('Add shape')
      wrapper.unmount()
    }
  })

  it('asks who you are when nobody is signed in, and remembers where you wanted to go', async () => {
    signedIn = false
    const wrapper = await mountApp('/w/w1/view/inside-Shop')
    await vi.waitFor(() => expect(wrapper.find('h2').exists()).toBe(true))
    expect(wrapper.get('h2').text()).toBe('Sign in')
    expect(router.currentRoute.value.fullPath).toBe('/login?next=/w/w1/view/inside-Shop')
    expect(wrapper.find('nav').exists()).toBe(false)
  })

  it('shows no update prompt while no update is waiting', async () => {
    const wrapper = await mountApp()
    expect(wrapper.text()).not.toContain('New version available')
  })
})
