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
- The journeys run against the real server with a real PostgreSQL (`e2e/serve`), one server
  for the whole run. So that tests do not see each other, every test is a user of its own
  (`account`), made by the admin and signed in before the test begins, with an empty workspace.
  `test.use({ signedIn: false })` starts signed out; `newAccount()` makes one more user;
  `browserOf(account)` opens one more browser, signed in: another device, or another person.
  Anything a test makes that other tests could see (a user's address) is one of a kind.
- A first visit starts the tour (J63) over the empty workspace. The browser of a test has
  seen it (the fixtures note that in its storage before the app starts);
  `test.use({ tour: true })` is a browser that has not.
- Working together (J19) is two browsers of one test that connect to each other (WebRTC):
  `browserOf(account)` opens the second one, which without a server is a browser that never
  ran the app. The project `browser-only` starts Chromium with a flag and a permission for it
  (`playwright.config.ts`): the check runs without a network, where a machine has only its own
  loopback address. Chromium offers that address only with `--allow-loopback-in-peer-connection`,
  and any address of the machine only to a page that may use the microphone; without both no
  connection is ever tried (found with a probe in the check's image, 2026-11-26). The meeting point is
  the Worker itself in wrangler's local runtime (`e2e/serve-browser`), told to name no STUN
  server. What is said between the browsers is tested without any
  (`src/collab/__tests__/`): rooms, sessions over a connection in memory, frames.
- A fourth project, `browser-only`, runs against the app built without a server
  (`e2e/serve-browser`): J7, J62 and the journeys named in `playwright.config.ts`. Wrangler runs
  the Cloudflare worker locally. There the option
  `server` is off: `account` makes nobody and signs nobody in, `newAccount` refuses. A journey
  that needs somebody else skips itself there (`test.skip(!server, …)`). A journey about what
  a workspace keeps belongs on that project's list.
- A browser notes a refused request in its console ("401", "409"). A journey that makes the
  server refuse something on purpose takes that note out of `consoleErrors` by its status, and
  nothing else.
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
- The server (`apps/server`) has Go tests that talk to it through HTTP, on a PostgreSQL that
  `bin/with-postgres` starts for the command: `bin/with-postgres go test ./...` from
  `apps/server`. Each test gets a database of its own. See [server.md](server.md).
- `pnpm typecheck` type-checks every package (vue-tsc for `apps/web`, tsc for `packages/*`).
- Browser end-to-end tests use Playwright (`apps/web/playwright.config.ts`), with three projects:
  `chromium`, `webkit` and `tablet` (iPad, touch). Playwright starts `e2e/serve` itself: it
  builds the app and the server and runs the server, which gives out the app, on a PostgreSQL
  from `bin/with-postgres`.
- The PWA end-to-end tests (`e2e/pwa-*.spec.ts`) run against the built app, because there is
  no service worker in dev; Playwright's `webServer` already does this. They run
  in Chromium only (service-worker inspection is reliable only there) and wait on
  `editor.waitForServiceWorker()` and locators, never on sleeps.
- `pnpm test:e2e` runs every journey on all projects, headless. `pnpm test:e2e:ui` opens the
  Playwright UI for local debugging. Install the browsers once with
  `pnpm --filter @drillgram/web exec playwright install`.
- On failure, the trace, screenshot and video are kept in `test-results/` and the HTML report in
  `playwright-report/` (both git-ignored). Open a trace with
  `pnpm --filter @drillgram/web exec playwright show-trace <trace.zip>`.
- `lib/browserServer.ts` is tested on `fake-indexeddb`, a browser's database in memory: two
  servers on one database are two tabs.
- Code that talks to the server is tested without one where it can be: `lib/workspaceLog.ts`
  is given its server and its storage, and its tests give it fakes that are slow, deaf or busy
  with somebody else (`lib/__tests__/workspaceLog.spec.ts`).
- `bin/ci-check` is the full check CI runs: the server's tests, unit tests, typecheck and every
  journey, in the official Playwright image built from `apps/web/e2e/Dockerfile`, without network.
  It needs Docker. Run it before you push. Keep the image tag in the Dockerfile equal to the
  `@playwright/test` version (pinned exactly) when upgrading.
