# Testing: test-driven first

Every change is test-driven. No production code without a failing test that demands it.

1. **Red**: write a test from the issue's acceptance criteria and run it. It must fail for the
   expected reason.
2. **Green**: write the least code that makes it pass.
3. **Refactor**: clean up while all tests stay green.

## Rules

- Work outside-in: user-visible behaviour starts with a failing end-to-end test that drives a
  real browser (draw, edit, drill down, export), then unit tests for the parts underneath.
- Bug fixes start with a test that reproduces the bug.
- A PR that adds behaviour without tests is not done.

## End-to-end and browser tests

- Run headless in CI.
- Leave screenshots, traces and videos behind when they fail.
- Deterministic: no sleeps, no live network, fixed test data.
- MCP tools get end-to-end tests too: a test client calls the server and checks the diagram the
  web app then shows.

## User journeys first

- The journeys are catalogued in [docs/journeys.md](../journeys.md); each has a test file in
  `apps/web/e2e/` (`j<N>-<name>.spec.ts`).
- A feature issue starts with its journey: turn the `test.fixme` into a real test, watch it fail,
  then build the feature. A new journey gets a catalogue entry and a test file together.
- Import `test` and `expect` from `e2e/fixtures.ts`, never from `@playwright/test` directly. The
  fixtures start the clock at a fixed time, turn off animations and transitions, block all network outside
  localhost and collect console errors (`consoleErrors`). Each test gets fresh browser storage.
- Drive the editor through the page object in `e2e/pages/editor.ts` (`editor` fixture), so tests
  read like the steps a user takes. Add a helper there rather than raw locators in a journey.
  `editor.element(name)` matches the exact name: "Customer" is not "Customer Accounts".
- `consoleErrors` skips the notices listed in `NOT_AN_ERROR` in `fixtures.ts` (today only the
  browser's "ResizeObserver loop" notice). Add to that list only with the reason next to it.

### Clock and touch

- The clock starts at `FIXED_TIME` and then runs (`page.clock.install`). Never freeze it with
  `setFixedTime`: Vue skips an event handler when `Date.now()` has not moved on since the handler
  was attached and another Vue listener already saw the event, so a click silently does nothing.
- Playwright has no multi-touch API. Pinch and one-finger pan go through `touchGesture` in
  `e2e/pages/editor.ts`, which dispatches plain events carrying `touches`. That proves the canvas
  logic, not a real device: try gestures on a real tablet through the preview.

### Selectors

1. By role and accessible name (`getByRole('button', { name: 'Undo' })`), then by label or text.
2. `data-testid` only for canvas elements that have no accessible name (for example a connection
   handle or a relationship line).
3. Never by CSS class, DOM structure or position.

## Tools and commands

- Unit and component tests use Vitest, with `@vue/test-utils` and jsdom for Vue components.
  `apps/web/vitest.config.ts` passes `--no-experimental-webstorage`: Node 25+ has its own
  `localStorage`, which hides jsdom's.
- `mise install` installs Node and pnpm from `mise.toml`; `pnpm install` then installs the
  workspace.
- `pnpm test` runs every package's tests headless, in a single run.
- `pnpm test` (or `pnpm --filter @drillgram/model test`) runs the unit tests. Every `IssueProvider`
  adapter calls `runIssueProviderContract` from `packages/model/src/issues/contract.ts` in its
  spec, with a stub `fetch` and no network.
- Adapters build that stub `fetch` with `createFixtureFetch` from
  `packages/model/src/issues/testing/fixture-fetch.ts`, serving recorded JSON fixtures from
  `packages/model/src/issues/fixtures/<provider>/`. It throws on any unrecorded request.
  An adapter whose tracker has no label colours passes `{ labelColors: false }` to
  `runIssueProviderContract`.
- Fixtures may instead use the `{status, headers, body}` envelope per file (as
  `fixtures/github/*.json` do), served by `fixtureFetch` from the same module with a handler that
  picks the response per request; a request with no matching fixture throws.
- Every `DiagramFormat` calls `runDiagramFormatContract` from
  `packages/model/src/diagram/contract.ts` in its spec: round trips for each supported C4 level and
  `DiagramFormatError` on invalid input. A format lacking a level passes `{ levels: [...] }`.
- `pnpm typecheck` type-checks every package (vue-tsc for `apps/web`, tsc for `packages/*`).
- Browser end-to-end tests use Playwright (`apps/web/playwright.config.ts`), with three projects:
  `chromium`, `webkit` and `tablet` (iPad, touch). Playwright builds the app and serves it with
  `vite preview` itself.
- The PWA end-to-end tests (`e2e/pwa-*.spec.ts`) run against `vite build` plus `vite preview`,
  because there is no service worker in dev; Playwright's `webServer` already does this. They run
  in Chromium only (service-worker inspection is reliable only there) and wait on
  `editor.waitForServiceWorker()` and locators, never on sleeps.
- `pnpm test:e2e` runs every journey on all projects, headless. `pnpm test:e2e:ui` opens the
  Playwright UI for local debugging. Install the browsers once with
  `pnpm --filter @drillgram/web exec playwright install`.
- On failure, the trace, screenshot and video are kept in `test-results/` and the HTML report in
  `playwright-report/` (both git-ignored). Open a trace with
  `pnpm --filter @drillgram/web exec playwright show-trace <trace.zip>`.
- `bin/ci-check` is the full check CI runs: unit tests, typecheck and every
  journey, in the official Playwright image built from `apps/web/e2e/Dockerfile`, without network.
  It needs Docker. Run it before you push. Keep the image tag in the Dockerfile equal to the
  `@playwright/test` version (pinned exactly) when upgrading.
