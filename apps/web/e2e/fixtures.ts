import { test as base, expect } from '@playwright/test'
import { DiagramEditor } from './pages/editor.ts'

/** The time every test starts at. */
export const FIXED_TIME = new Date('2026-01-01T09:00:00Z')

/**
 * Browser notices that arrive as errors but are none. Keep this list short and say why.
 * - ResizeObserver loop: the browser put off one size notification to the next frame. Vue Flow
 *   measures cards with a ResizeObserver; it happens when a diagram is replaced while it measures.
 */
const NOT_AN_ERROR = ['ResizeObserver loop completed with undelivered notifications']

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

const NO_MOTION_CSS = `*, *::before, *::after {
  animation: none !important;
  transition: none !important;
  caret-color: transparent !important;
}`

type Fixtures = {
  /** Console errors and uncaught page errors seen during the test. */
  consoleErrors: string[]
  /** Page object for the diagram editor. */
  editor: DiagramEditor
  /** Applied to every test: known start time, no animations, no network outside localhost. */
  deterministic: void
}

export const test = base.extend<Fixtures>({
  deterministic: [
    async ({ context, page }, use) => {
      await context.route('**/*', (route) => {
        const { hostname } = new URL(route.request().url())
        return LOCAL_HOSTS.has(hostname) ? route.fallback() : route.abort('blockedbyclient')
      })
      // The clock starts at a fixed time and then runs. It must not stand still: Vue ignores an
      // event handler when `Date.now()` has not moved on since the handler was attached and
      // another Vue listener has already seen the event, so clicks would silently do nothing.
      await page.clock.install({ time: FIXED_TIME })
      await context.addInitScript((css) => {
        const add = () => {
          const style = document.createElement('style')
          style.textContent = css
          document.head.append(style)
        }
        if (document.head) add()
        else document.addEventListener('DOMContentLoaded', add)
      }, NO_MOTION_CSS)
      await use()
    },
    { auto: true },
  ],

  consoleErrors: async ({ page }, use) => {
    const errors: string[] = []
    const collect = (text: string) => {
      if (!NOT_AN_ERROR.some((notice) => text.includes(notice))) errors.push(text)
    }
    page.on('console', (message) => {
      if (message.type() === 'error') collect(message.text())
    })
    page.on('pageerror', (error) => collect(error.message))
    await use(errors)
  },

  editor: async ({ page }, use) => {
    await use(new DiagramEditor(page))
  },
})

export { expect }
