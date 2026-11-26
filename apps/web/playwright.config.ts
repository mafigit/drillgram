import { defineConfig, devices } from '@playwright/test'
import type { Options } from './e2e/fixtures.ts'

const port = 4173
const baseURL = `http://localhost:${port}`
// The app built to run without a server (J62).
const browserOnlyPort = 4174
const browserOnlyURL = `http://127.0.0.1:${browserOnlyPort}`
/** Journeys that only run in the browser-only build. */
const WITHOUT_A_SERVER = /j(7-agent-changes-the-diagram|62-without-a-server)\.spec\.ts$/

// Journey tests: see docs/journeys.md and docs/agents/testing.md.
// Deterministic defaults (fixed clock, no animations, no network outside localhost) live in
// e2e/fixtures.ts. Every test gets a fresh browser context, so storage never leaks between tests.
export default defineConfig<Options>({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  outputDir: '../../test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: '../../playwright-report', open: 'never' }]],
  use: {
    baseURL,
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', testIgnore: WITHOUT_A_SERVER, use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', testIgnore: WITHOUT_A_SERVER, use: { ...devices['Desktop Safari'] } },
    { name: 'tablet', testIgnore: WITHOUT_A_SERVER, use: { ...devices['iPad Pro 11'], hasTouch: true } },
    // The same app without a server: its own journey, and those of the others that are about
    // what a workspace keeps (the cards, the change log, clearing, several workspaces), and the
    // tour (J63): the site without a server is where most first visits are.
    {
      name: 'browser-only',
      testMatch: [WITHOUT_A_SERVER, /j(2-first-diagram|4-edit-safely|31-timeline|43-clear-the-workspace|58-workspaces|63-tour)\.spec\.ts$/],
      use: { ...devices['Desktop Chrome'], baseURL: browserOnlyURL, server: false },
    },
  ],
  // Build once; the server gives out the production bundle and answers the API, on a database
  // of its own, so the tests see what users get. Asked to stop, not killed: its database goes
  // with it.
  webServer: [
    {
      command: `e2e/serve ${port}`,
      url: `${baseURL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    },
    // The Cloudflare build keeps workspaces in the browser and also serves the optional MCP relay.
    // Start after the server above, so the two builds do not run at once.
    {
      command: `e2e/serve-browser ${browserOnlyPort}`,
      url: browserOnlyURL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    },
  ],
})
