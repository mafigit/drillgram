import { defineConfig, devices } from '@playwright/test'

const port = 4173
const baseURL = `http://localhost:${port}`

// Journey tests: see docs/journeys.md and docs/agents/testing.md.
// Deterministic defaults (fixed clock, no animations, no network outside localhost) live in
// e2e/fixtures.ts. Every test gets a fresh browser context, so storage never leaks between tests.
export default defineConfig({
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
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'tablet', use: { ...devices['iPad Pro 11'], hasTouch: true } },
  ],
  // Build once; the server gives out the production bundle and answers the API, on a database
  // of its own, so the tests see what users get. Asked to stop, not killed: its database goes
  // with it.
  webServer: {
    command: `e2e/serve ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
  },
})
