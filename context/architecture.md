# Architecture

## Layout

| Path | Package | Role |
| --- | --- | --- |
| `apps/web` | `@drillgram/web` | Vue 3 app. `vite.config.ts` holds the PWA manifest (`VitePWA`); `src/components/ReloadPrompt.vue` registers the Workbox service worker and asks before updating. |
| `apps/web/src/components/DiagramEditor.vue` | | The editor: toolbar, canvas, the screen around the canvas. `AppHeader.vue` is the top bar (name, breadcrumb slot, theme menu: `useTheme.ts` sets the classes `dark` and `solarized` on `<html>`, the tokens are in `assets/main.css`); the editor's tools sit in a floating bar at the bottom of the canvas. The canvas itself is Vue Flow (`@xyflow/vue`) with our node, edge and controls in `src/components/canvas/`; cards can be dragged, the canvas panned and zoomed (wheel pans, Ctrl or pinch zooms). `src/components/ui/` holds the shadcn-vue components (generated, owned by us). It shows the view named in the address (`src/router/index.ts`: `/` is the System Landscape, `/view/<id>` any other view, unknown addresses fall back to `/`), with a breadcrumb, an Open button on objects that have a next level, a picker for objects that are already in the model, and the connections made inside its cards, one level up. The workspace comes from `src/composables/useWorkspaceStore.ts`: it holds the `History`, gives the workspace at the cursor, and `dispatch(event)` is the one way to change it (also `undo`, `redo`, `goTo`). What a browser saved under an earlier name of the app (keys starting with `ped.` or `drillplan.`) is taken over once at start (`src/lib/formerKeys.ts`). Saved on every change under the `localStorage` keys `drillgram.workspace.v1` (the workspace, the truth) and `drillgram.history.v1` (start, events, cursor); a saved log that does not replay to the saved workspace is dropped. The editor shows `openView(workspace, view)`: opening a view is no change. `HistoryPanel.vue` is the timeline (a range input) and the change log; undo, redo and the History button sit in the top bar. |
| `apps/web/src/export` | | Export of the open diagram. `svg.ts` draws a `Scene` (cards, connectors, frame, title, key; built by `exportScene` in `DiagramEditor.vue`) as a standalone SVG, pure and unit-tested with a fake text measure; `palette.ts` holds the light theme as hex (a test keeps it equal to `assets/main.css`); `download.ts` measures text, puts the font and icons in as `data:` URLs, paints the PNG and saves the file. The menu is `src/components/ExportMenu.vue`; `src/components/ImportMenu.vue` is the import dialog (Mermaid, D2), and `bringDiagram` in `DiagramEditor.vue` lays an imported file out and dispatches `diagramImported`. |
| `deploy/helm/drillgram` | Helm | The hosted image, a Service and optional Ingress. PostgreSQL runs as a StatefulSet with a volume claim, or the app uses an external connection URL from a Secret. |
| `apps/web/src/tour` | | The tour of the first visit (J63). `steps.ts`: the steps in their order, what each says and points at (CSS selectors), the diagram it is about and how it knows that it was answered, from a `TourScene` the editor gives (where it is, how many objects, connections and changes, whether the history is open). `place.ts`: where the card stands beside its target. `seen.ts`: the browser's note that the tour was begun or skipped. All pure and unit-tested; `components/TourGuide.vue` draws the card and the light and is mounted by `DiagramEditor.vue`. |
| `apps/web/src/collab` | | Working together (J19), in the app without a server. `rooms.ts`: a room of the signalling server as a pure function (who is seated as host or guest, who gets which message of a handshake; the host proves itself with the secret the room's name is a hash of). `apps/web/worker/signalRoom.ts` is that server in the Worker (a Durable Object per room, WebSockets that hibernate, STUN and TURN servers handed to who takes a seat), beside the MCP relay; `signal.vite.ts` beside the app's config is the same for the dev server, which has no Worker. `signal.ts` is the browser's WebSocket to a room, `peer.ts` the direct connection (WebRTC data channel; `frames.ts` cuts large messages), `relay.ts` the way through the room for two browsers without a direct one (AES-GCM with the key of the link, pointers said more seldom), `session.ts` what is said over it: the host serves its change log (`LogServer`: read, append) to the guests, tells them when it moved, and passes on who is there and where everybody points. `sharing.ts` puts these together for the editor; `name.ts` keeps the name somebody goes by. See "Working together" below. |
| `apps/web/e2e` | | Playwright journeys `j<N>-<name>.spec.ts`, PWA tests `pwa-*.spec.ts`, fixtures in `fixtures.ts`, page object `pages/editor.ts`. |
| `packages/model` | `@drillgram/model` | Domain types shared by all apps, no Vue. |
| `packages/model/src/diagram` | | `workspace.ts`: the `Workspace` the editor holds, one `Model` (objects with an optional `parent`, connections with ids) and `View`s (optional `scope`, positions of the objects placed on it, ids of the connections shown). Editing functions never mutate their input; `validateWorkspace` guards what is loaded. Everything is a box: an object has a kind (a plain box or one of C4's four shapes) and no kind says what lives in what. Views are the Overview (`ROOT_VIEW_ID`) and one view inside each object that was opened (`scope`); there are no levels. `drillDown` opens the view inside any object and creates it on first use; `syncView` fills the Overview with the objects that stand inside no other and an inner view with its object's neighbours each time they are opened; `addObject` on an inner view sets `parent`; `breadcrumb` gives the way back. `parseWorkspace` upgrades workspaces saved with C4 levels and System Context views. `placeObject` shows an existing object on another view (only kinds that belong on that level). A card is `CARD` in size unless its view stores another size for it (`View.sizes`, read with `cardSize`). Cards never come closer than `CARD_GAP`, each with its own size: `fitsOnView` tells, `moveObject` refuses a bad place, new cards take the first free one. `arrangeView` puts listed cards at new places with new sizes in one go and refuses the whole arrangement if one card does not fit. A `View` with a `name` is one that was added to a box beside its first view (`addView`, `renameView`, `removeView`, `viewsOf`; ids `view-<n>`): `syncView` puts nothing on it, `findViewInside` and the breadcrumb mean the first view. `canShow` holds the rule for what a diagram may show (any object, from any depth, but not the object the diagram is inside nor what that stands inside); `viewTitle` gives its title. a view lists the connections made on it; `liftedConnections` derives, per view, those made inside its cards, between the cards that hold their ends (one per pair of cards and direction, without a label, none where the view has its own between the same two cards); they are never stored. `viewToDiagram` turns a view into the format-neutral C4 `Diagram` that the `DiagramFormat` converters (`mermaid.ts`, `d2.ts`) read and write; `diagramOfView` gives what the canvas shows for export (title, the opened object as `boundary`, the connections drawn on it and those lifted from inside its cards, ids unique also without regard to case). `writableAsMermaid` makes any diagram fit for Mermaid (no double quotes or line breaks, no relationships to the boundary). |
| `packages/model/src/diagram/events.ts`, `history.ts` | | The change log. `WorkspaceEvent` is every change the editor can make (add, place, move, rename, delete, connect, label, load the example, arrange a view); `applyEvent` is the one reducer and must stay deterministic, `describeEvent` says a change in words. `History` is a start workspace, the logged events with their times and a cursor; `record`, `undo`, `redo`, `goTo`; one workspace per event is kept in memory (`states`, sharing what did not change), only start, events and cursor are saved. `renameObject`, `removeObjects`, `removeCards` and `openView` are in `workspace.ts`. "Delete" writes `cardsRemoved` (per view); `objectsRemoved` stays for older logs and the agent's `delete_boxes`. |
| `packages/layout` | `tidy-layout` | A git submodule, the engine's own public repository (`github.com/mafigit/tidy-layout`). The layout engine: Rust (`src/`), compiled to WebAssembly (`pkg/`, built by `bin/engine`), with a small JavaScript wrapper (`js/index.ts`). A port of parts of TALA (D2), MPL-2.0, checked against answers recorded from TALA's own code. |
| `packages/model/src/issues` | | Provider-neutral issue model, read-only `IssueProvider` interface, adapters `gitea.ts`, `github.ts`, `gitlab.ts`, `contract.ts` (shared contract test), recorded fixtures. |
| `apps/server` | Go module | The server: users, sign-in, workspaces and the change log of each, in PostgreSQL, under `/api`. Can also give out the built web app. See "Server" below. |
| `deploy/licences` | `@drillgram/licences` | The licence gate (`pnpm licences`: npm packages and crates against an allow-list) and the REUSE check of every file (`reuse`). See `docs/agents/licences.md`. |
| `bin/` | | `ci-check` (full check), `with-postgres` (a PostgreSQL for the server's tests), `publish`, `public-check`, `engine`, `docker-build`. |
| `apps/web/worker` | Cloudflare Workers | MCP relay for the browser-only app. |

## Server

Go with Fiber 3, PostgreSQL through `pgx` (`apps/server`; rules in `docs/agents/server.md`).
The web app needs it: see "The web app and the server" below.

- **Tables** (`internal/store/migrations`): `users` (role `admin` or `user`, a password hash or
  none), `identities` (who a user is at an identity provider), `sessions` (the SHA-256 of the
  cookie's token), `workspaces` (with `head`, the number of the newest log entry),
  `workspace_members` (role `owner`, `editor` or `viewer`), `workspace_log`.
- **Who a request is from** (`identify`): a signed token in a header, else the header of the
  proxy in front when the request comes from the proxy's address, else the session cookie
  (`drillgram_session`, HTTP-only, `SameSite=Lax`, for HTTPS only when `DRILLGRAM_PUBLIC_URL` is
  https). A request that changes something and comes from another site is refused (`sameSite`):
  the browser's own word counts (`Sec-Fetch-Site`), else the page's origin must be an address
  of the server (`PUBLIC_URL`, the request's host, or the host the proxy passes on).
- **Workspaces:** a user has many and starts with one. A workspace has members; for anybody else
  it is not there. A viewer reads, an editor appends to the log, an owner renames, deletes,
  shares and clears. A workspace keeps an owner, the server an admin.
- **The change log is the truth about a workspace.** `GET /api/workspaces/:id/log?after=n`
  gives the entries after number n and the head; `POST` appends after the entry the sender has
  seen last (`after`) and is refused with 409 and the head when the log has moved on; `DELETE`
  removes every entry and leaves one that says so, the numbers going on. The server keeps an
  entry as it came (`jsonb`) and does not read it.
- **API:** `/api/health`, `/api/session` (who is signed in, or nobody: never a refusal),
  `/api/auth/config|login|logout`, `/api/auth/oidc/start|callback`,
  `/api/me` (and `/password`), `/api/users` (admins), `/api/workspaces` with `/:id`,
  `/:id/members` and `/:id/log`. Errors are `{"error": "…"}` with the status.
- **The web app from the same server:** with `DRILLGRAM_WEB_DIR` it gives out the built app;
  an address that is no file (a diagram, `/login`) gets the app's page.

## The web app and the server

- **`src/lib/api.ts`**: every request to `/api`, `ApiError` with the status and the server's
  words. What is sent may outlive the page (`keepalive`), so a change is not cut off by a reload.
- **Without a server** (`build:browser` sets `VITE_BROWSER_ONLY=1`; `browserOnly` in `api.ts`):
  a request does not leave the browser. `src/lib/browserServer.ts` answers it in the server's
  place, with the server's statuses and words, from IndexedDB (database `drillgram`: the store
  `workspaces`, and `log` with every entry under `[workspace, seq]`). One transaction is one
  piece of work for all tabs, as the row lock of a workspace is on the server, so an append
  after an entry that is not the newest gets its 409 there too. It keeps what the server keeps
  and nothing else: no users, no members. `/api/session` always names one user, who is no
  admin, so the router lets everybody in and nobody to `/users`; `AppHeader.vue` shows
  `AboutSite.vue` where the account menu is: where the diagrams are, and links to the imprint
  and the privacy policy. Those are `imprint.html` and `privacy.html` beside `index.html`,
  pages of their own (no Vue; `src/legal.ts` gives them the app's stylesheet and theme) and
  inputs of this build alone (`vite.config.ts`): the build with a server has neither. The
  service worker keeps them like every other file, so they are not answered with the app. Everything above `api.ts` is the same code.
  A change to what the app asks of the server needs its answer in `browserServer.ts` too
  (its tests say of it what `workspaces_test.go` says of the server).
- **Agent sharing** (`build:cloudflare`, J7): the tab opens a same-origin WebSocket to a
  Durable Object when the user starts sharing. The MCP client sends its bearer token to `/mcp`.
  The token is the hash of the tab credential. The Worker hashes the token to find its session.
  Each session ends after one hour or when the tab disconnects. The Worker routes MCP requests
  to the session's Durable Object, which handles Streamable HTTP and validates the input with
  the schemas in `apps/web/src/lib/agentTools.ts`. The tab runs calls in order against the
  shared editor. Edits and history moves use the editor's change log and confirm success after
  IndexedDB saves them. Import, layout and export use the same code as the editor. The relay
  does not persist diagram content. Plain static hosts still use `build:browser`.
- **Who is signed in:** `useSession` (one answer for the app, from `/api/session`). The router
  (`src/router/index.ts`) lets nobody past `/login` who is not, and brings them to where they
  wanted to go afterwards (`next`). Pages are in `src/pages/`: `SignIn`, `StartPage` (on to the
  workspace that was open last, or the form for a first one), `WorkspacePage`, `UsersPage`.
- **A workspace opens** in `WorkspacePage.vue`: `openWorkspaceStore` reads its log and gives the
  store to the editor (`OpenWorkspace.vue` provides it; `useWorkspaceStore()` in the editor is
  as before). Another workspace is another page: `App.vue` keys the page by the workspace.
- **The log** (`src/lib/workspaceLog.ts`, no Vue, no fetch: both are given to it): the history
  the editor works on is `replay` of the server's entries (`@drillgram/model`, `log.ts`). A
  change is applied at once and its entry (`change`, or `wentTo` for undo, redo and the
  timeline) joins those that wait; they go to the server in order, one request at a time, up to
  500 in one. What waits is also in the browser's storage (`drillgram.outbox.<workspace>`), so a
  reload loses nothing. Every entry has an id of the browser's making: by it the browser knows
  its own entries again when a request's answer got lost, or a reload cut it off. When the
  server refuses an append because the log moved on and the new entries are somebody else's,
  theirs win: the history is made again from the server's log, what waited is dropped, and a
  card says so.
- **What the log cannot say** is said on a card (`WorkspacePage.vue`, `said`): the server does
  not answer (it is tried again), the workspace was changed elsewhere, the user may only look,
  the workspace is gone; a session that ended leads to the sign-in page.
- **Before the server** the app kept one workspace in the browser (`drillgram.workspace.v1`,
  `drillgram.history.v1`). `src/lib/localWorkspace.ts` reads it; the editor offers to bring it
  into an empty workspace (`WorkspaceLog.bring`: the event `workspaceBrought` for where its log
  began, then its changes with their times). The app writes nothing there any more.

## Working together

In the app without a server (J19). The workspace stays where it is: in the browser of who
shares it, as a change log that is the one truth. A shared session makes that browser the
server of this one log for the others.

- **The host is the server.** A guest's editor is the same editor on a `WorkspaceLog` whose
  `LogServer` is not `lib/api.ts` but the connection to the host (`GuestSession.server`): read
  and append go to the host's browser, which answers from its own log (`HostSession`) with the
  rules it has anyway (an append after an entry that is not the newest is refused). A guest
  keeps nothing: no outbox, no database. Only the host can clear.
- **Live.** After every append the host tells the others that the log moved (`moved`), and
  each takes what is new (`WorkspaceLog.pull`): the host's own editor too when a guest wrote.
  A change that is on its way when somebody else's lands is refused as between two browsers of
  a server: its maker sees the workspace as it is and is told. Undo, redo and the place on the
  timeline are entries of the log, so they are shared: one history for everybody.
- **Direct.** Host and guest talk over a WebRTC data channel, one per guest (a star: guests
  never connect to each other, the host passes on what all must know). The browsers encrypt it;
  no server of ours sees it. They find each other through a room on the signalling server,
  named by the link: the guest offers, the host answers, both send the addresses they can be
  reached at. The guest leaves the room once connected; the host stays for the next guest and
  takes its seat again when the server lets go of it.
- **Through the server, when there is no direct way.** A guest whose connection does not open
  in 8 seconds (or whose browser, or the host's, has no WebRTC: then at once) sends what it
  has to say through the room instead (`relay` in `rooms.ts`), and stays in the room for it.
  Both sides seal every piece with AES-GCM under a key that the host made and put into the
  link after its "#": a browser sends that part to no server, so the room passes on what it
  cannot read, and who has only the room's name cannot talk to the host this way. To the
  session it is a connection like the other. Pointers go through at most 5 times a second
  there: every message counts against the free plan's day. Such a guest's session ends when
  the host's connection to the room does; a direct one does not.
- **The link** is `/s/<room>#<key>`. The room's name is a hash of a secret only the host has,
  and the server seats as host only who shows the secret: nobody else can sit down as the
  host of a link that is around. Who has the link can join and change the workspace: it is
  the key. Addresses inside a session keep the "#" part (`viewPath`), so a reload joins again.
- **People and pointers** are not in the log. The host gives everybody an id and a colour and
  says who is there; a pointer is a place in a diagram's own measures on one view, sent at
  most 20 times a second (`canvas/pointerReporter.ts`: a move still held when the pointer
  leaves the canvas is dropped) and drawn by `canvas/CanvasPointers.vue` over the cards.
- **What ends a session:** the host stops sharing or leaves the workspace (reload, another
  workspace, the tab closed). Guests are told at once where the browser has the time to say
  so, else when the connection is found dead.

## Issue providers

`IssueProvider` has `getIssue` and `listIssues`; pull and merge requests are never returned. Adapters
get `baseUrl`, `getToken` and `fetch` through `ProviderConfig` and never read globals. Every adapter
runs `runIssueProviderContract` against recorded JSON fixtures; an unrecorded request throws.

## Stack

Vue 3, Vite, TypeScript, Tailwind CSS 4 with shadcn-vue on Reka UI, Vue Flow, Vitest (with `@vue/test-utils` and jsdom), Playwright (projects `chromium`,
`webkit`, `tablet`), pnpm workspace, vite-plugin-pwa with Workbox. Node and pnpm pinned in `mise.toml`.
The app keeps the Tailwind rules its shadcn-vue components use in `apps/web/src/assets/shadcn-vue.css`.
Capacitor is planned for later mobile apps. Rules: [stack](../docs/agents/stack.md).

## Where it runs

- The repository is <https://github.com/mafigit/drillgram>: the work happens there, and every
  push is public (`docs/agents/publishing.md`).
- The app without a server is files (`apps/web/dist-browser`) for any static host;
  `apps/web/wrangler.jsonc` puts them on Cloudflare as the static assets of a Worker without
  code (`operations.md`, "Without a server").
- The server is deployed nowhere: it and the app are built and run locally
  (`context/operations.md`). CI is `bin/ci-check`, called by `.github/workflows/ci.yml`, which then
  deploys the app without a server from `main`.
- **As one image** (`Dockerfile`): stages build the layout engine (Rust to WebAssembly), the
  web app (Node) and the server (Go, no C); what runs is the program and the built app in a
  distroless image, as a user who owns nothing. `compose.yaml` runs it with a PostgreSQL. No
  image is published yet.
