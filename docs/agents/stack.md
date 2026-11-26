# Stack and layout

- **Stack:** Vue 3, Vite, TypeScript, Vitest, Playwright, pnpm workspace, Node
  `^22.22.2 || >=24.15.0`. vite-plugin-pwa with a Workbox service worker; Capacitor comes later.
- **Server:** Go with Fiber 3 and PostgreSQL 17 (`pgx`), in `apps/server`, a Go module of its
  own (owner's call, 2026-11-26). Rules: [server.md](server.md).
- **UI:** Tailwind CSS 4 (`@tailwindcss/vite`) with shadcn-vue components on Reka UI, icons from
  `@lucide/vue`, the Geist font from `@fontsource-variable/geist`. Components are copied into
  `apps/web/src/components/ui/` by the CLI (`components.json`): add one with
  `pnpm --filter @drillgram/web dlx shadcn-vue@latest add <name>`. The app uses rules from
  `apps/web/src/assets/shadcn-vue.css`. If the CLI adds a package import for its stylesheet,
  use the local stylesheet and copy any additional rules the component uses. Design tokens (colours, radius, light
  and dark, the canvas and the colour of each C4 kind) are CSS variables in
  `apps/web/src/assets/main.css`; `src/composables/useTheme.ts` switches the `dark` class.
- **Canvas:** Vue Flow (`@xyflow/vue` 2, MIT) draws the diagram: pan, zoom, selection, dragging
  and connecting. Our parts are in `apps/web/src/components/canvas/`: `ObjectNode.vue` (the card),
  `ConnectionEdge.vue` (a connector along the engine's route, label typed on the line),
  `CanvasControls.vue`, `CanvasQuickMenu.vue` (the round menu of a right-click), `geometry.ts`. The workspace stays the truth: nodes are rebuilt from it and
  a finished drag is written back as an `objectsMoved` event.
- **Markdown on cards:** `apps/web/src/lib/markdown.ts` (markdown-it, HTML off) renders a card's
  description; `canvas/cardRoom.ts` measures the room it needs with the card's own classes (keep
  it in step with `ObjectNode.vue`). Never put text on the page with `v-html` any other way.
- **Icons on cards:** `apps/web/tech-icons.vite.ts` serves the allowed icons of `@thesvg/static`
  under `/tech-icons/` and their list as `virtual:tech-icons` (`useTechIcons`). Rules:
  [icon-licences.md](../icon-licences.md).
- **Layout engine:** `packages/layout` (`tidy-layout`), Rust compiled to WebAssembly, a port of
  TALA under MPL-2.0. Rules: [layout-engine.md](layout-engine.md).
  "Arrange" runs in a web worker (`apps/web/src/workers/arrange.worker.ts`), so the page stays
  live; the quick calls (`snap`, `route`) stay on the main thread.
- **Layout:** `apps/web` (`@drillgram/web`, the Vue app), `packages/model` (`@drillgram/model`, shared domain
  types; `src/issues/` holds the provider-neutral issue model and `IssueProvider` interface;
  `src/diagram/` holds the editor's `Workspace` (model plus views), the format-neutral C4 `Diagram`
  model and the `DiagramFormat` converters (Mermaid first); property tests use fast-check), `deploy/licences` (`@drillgram/licences`, the licence checks, see
  [licences.md](licences.md)), `apps/server` (the server, Go), later `apps/mcp-server`.
- **PWA:** the manifest config lives in `apps/web/vite.config.ts` (`VitePWA`). Icons are generated
  from `apps/web/public/logo.svg` by `@vite-pwa/assets-generator` (`apps/web/pwa-assets.config.ts`,
  `minimal2023Preset`). Run `pnpm --filter @drillgram/web generate-pwa-assets` after changing the SVG, and
  commit the PNGs. A Workbox service worker (`registerType: 'prompt'`) precaches the app shell, with
  `navigateFallback: 'index.html'`; `src/components/ReloadPrompt.vue` registers it and asks before
  updating. `workbox-window` is a devDependency because `virtual:pwa-register/vue` imports it.
- **Local tools:** [mise](https://mise.jdx.dev) installs every local dependency (Node, pnpm, Rust, Go) from
  `mise.toml`: run `mise install` once in the repo root. Add new local tools there, never as a
  global install.
- **Commands** (from the repo root): `mise install`, `mise run dev` (the server and the app's
  dev server together; the tasks are in `mise.toml`), `pnpm install`, `pnpm test`, `pnpm test:e2e`, `pnpm test:e2e:ui`,
  `pnpm typecheck`, `pnpm build`, `mise run browser` and `pnpm --filter @drillgram/web build:browser`
  (the app without a server), `bin/engine build|test`, `pnpm --filter @drillgram/web generate-pwa-assets`.
  Run the dev server with `pnpm --filter @drillgram/web dev`. The server's tests:
  `bin/with-postgres go test ./...` from `apps/server`.

## Rules

- Use explicit imports (no auto-import plugins).
- Write components with `<script setup lang="ts">`.
- Put tests in `src/**/__tests__/*.spec.ts`.
- Keep shared domain code in `packages/*` with no Vue imports.
- Ask the server through `src/lib/api.ts` only, never with `fetch` in a component. A button that
  asks it is busy until the answer is there (`useBusy`).
- The workspace is the server's log. Nothing of it is written to the browser's storage but
  what waits to be sent (`lib/outbox.ts`). The browser's storage is for what belongs to the
  browser: the theme, the tab last used, the workspace last open.
- The build without a server (`build:browser`, J62) has the server in the browser:
  `lib/browserServer.ts` answers what `lib/api.ts` asks, from IndexedDB. Nothing else writes
  a workspace there, and no component asks whether there is a server but to show what only one
  of the two has (`browserOnly` in `lib/api.ts`). What the app newly asks of the server gets
  its answer there in the same change, or says in the journey that it needs a server.
- Change the workspace only with `dispatch(event)` from `useWorkspaceStore`: a new kind of change
  is a new `WorkspaceEvent` in `packages/model/src/diagram/events.ts` (reducer, description, tests).
  Anything else would miss the change log, undo and redo. `applyEvent` must stay deterministic.
- Never introduce a framework or language that no issue asks for.
- Style with Tailwind classes and the tokens in `main.css`; no hard-coded colours in components.
- No requests to other hosts at run time (fonts, icons, scripts): the app asks its own server
  and nobody else, and the e2e tests block the rest of the network. The shadcn-vue CLI adds a Google Fonts import to `main.css`; remove
  it if it comes back.
- A shadcn-vue `CommandItem` must sit inside a `CommandGroup`, or the list stays empty.
- Buttons and fields inside a canvas card or edge label need the classes `nodrag nopan`.
- Keep edges not focusable: a focusable Vue Flow edge is a `group` named after its ends and would
  be found by the selectors that look for objects.
- The canvas and `body` use `overflow: clip`. With `hidden` the browser can still scroll them
  (focus, scrolling a half-visible card into view), which shifts Vue Flow's coordinates.
- Keep the small "Vue Flow" attribution: the project asks for it unless one subscribes.
- When an issue sets or changes the stack, the commands or the repo layout, record it here.
