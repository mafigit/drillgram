import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ReloadPrompt from '../ReloadPrompt.vue'

const { needRefresh, offlineReady, updateServiceWorker } = await vi.hoisted(async () => {
  const { ref } = await import('vue')
  return { needRefresh: ref(false), offlineReady: ref(false), updateServiceWorker: vi.fn() }
})

vi.mock('virtual:pwa-register/vue', () => ({
  useRegisterSW: () => ({ needRefresh, offlineReady, updateServiceWorker }),
}))

function button(wrapper: ReturnType<typeof mount>, name: string) {
  return wrapper.findAll('button').find((b) => b.text() === name)
}

describe('ReloadPrompt', () => {
  beforeEach(() => {
    needRefresh.value = false
    offlineReady.value = false
    updateServiceWorker.mockReset()
  })

  it('renders nothing while no update is waiting', () => {
    const wrapper = mount(ReloadPrompt)
    expect(button(wrapper, 'Reload')).toBeUndefined()
    expect(wrapper.text()).not.toContain('New version available')
  })

  it('shows "New version available" with a Reload button when needRefresh is true', async () => {
    const wrapper = mount(ReloadPrompt)
    needRefresh.value = true
    await nextTick()
    expect(wrapper.text()).toContain('New version available')
    expect(button(wrapper, 'Reload')).toBeDefined()
  })

  it('clicking Reload calls updateServiceWorker(true)', async () => {
    needRefresh.value = true
    const wrapper = mount(ReloadPrompt)
    await button(wrapper, 'Reload')!.trigger('click')
    expect(updateServiceWorker).toHaveBeenCalledWith(true)
  })

  it('clicking Close hides the prompt without updating', async () => {
    needRefresh.value = true
    const wrapper = mount(ReloadPrompt)
    await button(wrapper, 'Close')!.trigger('click')
    expect(wrapper.text()).not.toContain('New version available')
    expect(updateServiceWorker).not.toHaveBeenCalled()
  })
})
