import { test as base, expect } from '@playwright/test'
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test'
import { DiagramEditor } from './pages/editor.ts'

/** The admin the server of the tests starts with (e2e/serve). */
export const ADMIN = { email: 'admin@example.org', password: 'the admin of the tests' }

/** Somebody who can sign in. */
export type Account = { email: string; name: string; password: string }

/** One more browser, signed in. */
export type Browser = { page: Page; editor: DiagramEditor; context: BrowserContext }

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

/** What a project of playwright.config.ts says about itself. */
export type Options = {
  /**
   * Whether the app has a server. Off in the project `browser-only`: there nobody signs in and
   * no user is made, the browser keeps the workspaces itself.
   */
  server: boolean
  /**
   * Whether the browser is one the tour was never shown to (J63). Off: the browser has seen
   * the tour, as if it had been skipped. A first visit starts the tour over the empty
   * workspace, and every other journey is about what comes after it.
   */
  tour: boolean
}

type Fixtures = Options & {
  /**
   * Whether the test starts signed in, as `account`. On unless a test says
   * `test.use({ signedIn: false })`: the app is of no use to somebody who is not.
   */
  signedIn: boolean
  /** A user of this test alone, made by the admin: every test starts with its own empty workspace. */
  account: Account
  /** Makes one more user. */
  newAccount: (name?: string) => Promise<Account>
  /**
   * Opens one more browser, signed in as the account given: another device, or another person.
   * Without a server nobody signs in: it is a browser that never ran the app.
   */
  browserOf: (account: Account) => Promise<Browser>
  /** Console errors and uncaught page errors seen during the test. */
  consoleErrors: string[]
  /** Page object for the diagram editor. */
  editor: DiagramEditor
  /** Applied to every test: known start time, no animations, no network outside localhost. */
  deterministic: void
}

/** The browser's note that the tour was seen (src/tour/seen.ts). */
const TOUR_SEEN = ['drillgram.tour', 'seen'] as const

/**
 * Known start time, no animations, no network outside localhost: for a browser of a test.
 * `tour`: whether the tour (J63) starts on its first visit.
 */
async function makeDeterministic(context: BrowserContext, page: Page, tour = false): Promise<void> {
  if (!tour) await context.addInitScript(([key, value]) => window.localStorage.setItem(key, value), TOUR_SEEN)
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
}

/** Signs a browser in through the API: its cookie is the browser's from then on. */
async function signIn(request: APIRequestContext, account: { email: string; password: string }): Promise<void> {
  const answer = await request.post('/api/auth/login', { data: { email: account.email, password: account.password } })
  if (!answer.ok()) throw new Error(`Sign-in of ${account.email} failed: ${answer.status()} ${await answer.text()}`)
}

let made = 0

export const test = base.extend<Fixtures>({
  deterministic: [
    async ({ context, page, tour }, use) => {
      await makeDeterministic(context, page, tour)
      await use()
    },
    { auto: true },
  ],

  signedIn: [true, { option: true }],
  server: [true, { option: true }],
  tour: [false, { option: true }],

  newAccount: async ({ playwright, baseURL, server }, use, testInfo) => {
    if (!server) {
      await use(() => Promise.reject(new Error('This project has no server: there is nobody to make.')))
      return
    }
    // The admin, with cookies of its own: not the test's browser.
    const admin = await playwright.request.newContext({ baseURL })
    await signIn(admin, ADMIN)
    await use(async (name = 'Test User') => {
      // One of a kind on a server that every test of the run shares.
      const email = `user-${testInfo.workerIndex}-${Date.now()}-${++made}@example.org`
      const account = { email, name, password: 'a password of the tests' }
      const answer = await admin.post('/api/users', { data: account })
      if (!answer.ok()) throw new Error(`Could not make ${email}: ${answer.status()} ${await answer.text()}`)
      return account
    })
    await admin.dispose()
  },

  account: [
    async ({ newAccount, context, signedIn, server }, use) => {
      // Without a server the browser is the user: nobody to make, nothing to sign in to.
      if (!server) return use({ email: '', name: 'This browser', password: '' })
      const account = await newAccount()
      if (signedIn) await signIn(context.request, account)
      await use(account)
    },
    { auto: true },
  ],

  browserOf: async ({ browser, server, permissions }, use) => {
    const opened: BrowserContext[] = []
    await use(async (account) => {
      // With what the project allows its browsers (playwright.config.ts).
      const context = await browser.newContext({ permissions })
      opened.push(context)
      const page = await context.newPage()
      await makeDeterministic(context, page)
      if (server) await signIn(context.request, account)
      return { page, editor: new DiagramEditor(page), context }
    })
    for (const context of opened) await context.close()
  },

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
