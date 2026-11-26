import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '../App.vue'
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

async function mountApp(path = '/') {
  await router.push(path)
  await router.isReady()
  return mount(App, { global: { plugins: [router] } })
}

describe('App', () => {
  it('renders the app heading', async () => {
    const wrapper = await mountApp()
    expect(wrapper.get('h1').text()).toBe('Drillgram')
  })

  it('shows the Overview at the root and for an unknown address', async () => {
    for (const path of ['/', '/view/nope', '/some/route']) {
      const wrapper = await mountApp(path)
      expect(wrapper.get('nav').text()).toBe('Overview')
      expect(wrapper.findAll('button').map((b) => b.text())).toContain('Add shape')
    }
  })

  it('shows no update prompt while no update is waiting', async () => {
    const wrapper = await mountApp()
    expect(wrapper.text()).not.toContain('New version available')
  })
})
