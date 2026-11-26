import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HistoryPanel from '../HistoryPanel.vue'

const entries = [
  { text: 'Added software system "Shop"', at: '2026-01-01T09:00:01.000Z' },
  { text: 'Renamed "Shop" to "Online Shop"', at: '2026-01-01T09:00:02.000Z' },
  { text: 'Moved "Online Shop"', at: '2026-01-01T09:00:03.000Z' },
]
const panel = (cursor: number) => mount(HistoryPanel, { props: { entries, cursor } })

describe('HistoryPanel', () => {
  it('lists every change in order, with what changed and when', () => {
    const items = panel(3).findAll('li')
    expect(items.map((item) => item.find('button').text())).toEqual(entries.map((e) => expect.stringContaining(e.text)))
    expect(items.map((item) => item.find('time').attributes('datetime'))).toEqual(entries.map((e) => e.at))
  })

  it('marks the change the diagram is at, and the ones that are undone', () => {
    const items = panel(2).findAll('li')
    expect(items.map((item) => item.find('button').attributes('aria-current'))).toEqual([undefined, 'step', undefined])
    expect(items.map((item) => item.classes('opacity-50'))).toEqual([false, false, true])
  })

  it('goes to a change that is clicked', async () => {
    const wrapper = panel(3)
    await wrapper.findAll('li button')[0]!.trigger('click')
    expect(wrapper.emitted('go')).toEqual([[1]])
  })

  it('has a timeline from before the first change to the last', async () => {
    const wrapper = panel(3)
    const slider = wrapper.find('input[type=range]')
    expect(slider.attributes()).toMatchObject({ min: '0', max: '3', 'aria-label': 'Timeline' })
    expect((slider.element as HTMLInputElement).value).toBe('3')
    expect(slider.attributes('aria-valuetext')).toBe('Moved "Online Shop"')
    await slider.setValue('1')
    expect(wrapper.emitted('go')).toEqual([[1]])
  })

  it('steps along the timeline with the wheel: up is back', async () => {
    const wrapper = panel(2)
    const slider = wrapper.find('input[type=range]')
    await slider.trigger('wheel', { deltaY: -100 })
    await slider.trigger('wheel', { deltaY: 100 })
    expect(wrapper.emitted('go')).toEqual([[1], [3]])
  })

  it('says so when nothing has changed yet', () => {
    const wrapper = mount(HistoryPanel, { props: { entries: [], cursor: 0 } })
    expect(wrapper.text()).toContain('No changes yet')
    expect(wrapper.find('input[type=range]').attributes('aria-valuetext')).toBe('Start')
  })
})
