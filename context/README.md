# Drillgram

A design tool for product engineers: draw and maintain software architecture as diagrams of
boxes that open into deeper diagrams (C4's elements are one library of shapes), let AI agents change them over MCP,
and export them to many formats. A web app (installable PWA) with a server of its own, which
keeps the users and their workspaces, or built to run in the browser alone; iOS and Android
may follow.

## How it is built

The product is designed in issues, and each issue is built in a pull request of its own.
Development is
test-driven first, outside-in from end-to-end browser tests of user journeys.
Project started 2026-11-03.

## Status (2026-11-26)

- Done: pnpm workspace with the Vue 3 app shell (installable PWA, offline app shell, update prompt),
  Playwright e2e harness with the journey catalogue, `bin/ci-check` as the one check that CI calls, and
  a provider-neutral issue model with Gitea, GitHub and GitLab adapters (`packages/model`).
- Editor (J2): add a person or software system, connect two elements by dragging the handle and
  label the relationship; kept on the server, survives a reload. The editor holds a workspace:
  one model (objects, connections) and views that place parts of it.
- Around the frame (J42): on a Container or Component diagram the frame is a card of its own
  for the layout engine. Its connectors (the object's own connections) are routed by the engine
  between the frame, as one card, and the cards outside; Arrange lays out the cards inside, then
  the frame with them among its neighbours (connections of a card inside to a card outside count
  for the frame there); a card outside is dropped among the others and the frame. Without the
  engine the old lines with one bend are drawn.
- Boxes, not C4 levels (owner's call, 2026-11-25): everything is a box. A box has a kind (a
  plain Box, or one of C4's shapes: Person, Software System, Container, Component), may stand
  inside any other box, and any box can be opened to look inside. No kind says what lives in
  what; there are no diagram types and no System Context diagram. C4 is a shape library.
- Shapes (J41): "Add shape" in the toolbar opens the shape libraries, one tab each: "Basic" (a
  plain Box) and "C4". Every shape goes on every diagram; a shape added inside a box is a part
  of that box and stands in its frame. The tab last used is kept in the browser. The quick menu
  offers the same shapes. Mermaid has no plain box: its export writes one as a software system;
  D2 writes it as is.
- Several views of one box (J51): a box, and the Overview, has a first view ("Structure") and
  any number of added ones with a name ("Deployment", a flow), on tabs beside the diagram's
  title. Each view has its own cards, places and sizes; an added view starts with the cards of
  the view it is made from or empty, gets nothing by itself afterwards, and is renamed and
  deleted in its tab. Not yet: kinds of views with shapes of their own (deployment nodes that
  hold cards), and taking a card off one view only.
- Shapes (J53): a box can have one of 46 outlines instead of the rectangle (or be a table, J56) (`BOX_SHAPES`):
  `shape` on an object of the model, for every kind but person and code. The list covers what a
  Mermaid flowchart and D2 can draw, as far as a name fits inside. The geometry is our own
  (`canvas/shapes.ts`: paths for a box of any size, used by the canvas and the SVG export);
  nothing is taken from a shape library. Chosen in the
  Basic or Flowchart library of "Add shape" or in a box's form. D2 writes and reads the ones D2
  has (a folder is its `package`); the flowchart import keeps a node's shape, written with
  brackets or by name (`a@{ shape: cyl }`, every name and alias of Mermaid 12.3); the Mermaid C4
  export does not write them yet. Connectors still end at the card's rectangle, so on a slanted
  or round outline a line can stop a few pixels short.
- Tables (J56): a box with the shape `table` has `columns` (name, type, key: primary, foreign,
  unique), in their order. The card is a card of its own make (`.object-card.is-table`), not an
  outline: the name over a line, a row per column; `cardRoom` measures it with the same classes.
  The form's column editor is `ColumnsField.vue`; `columnsFromText` (`canvas/columns.ts`) turns
  pasted lines, a CREATE TABLE too, into columns. D2 writes `sql_table`. Not yet: connections
  between columns.
- Neighbours of a frame (J42): "Arrange" lays the cards inside out, then the frame as one card
  among its neighbours, then moves each neighbour to the side nearest to the cards it connects
  to (`canvas/besideFrame.ts`). An empty frame keeps its place.
- Connection colours (J55): a connection can have one of eight colours (`LINE_COLOURS`,
  `colour` on a connection), set in its form and stored as a name; each theme draws the name in
  its own tone (`--line-<name>` in `assets/main.css`). `LINE_COLOUR_HEX` has the value for files
  (SVG export, D2 `style.stroke`); `nearestLineColour` turns a file's value into a name, which is
  how a flowchart's `linkStyle` strokes come in. Not yet: colours on the derived line one level
  up, dashes, the Mermaid C4 export.
- Shape search (J41): "Add shape" has a search over all its libraries (`searchShapes` in
  `canvas/kinds.ts`); a code shape is found by a construct of its language and starts as that.
- draw.io's shape libraries are not taken in (decision of 2026-11-25): their terms give no clear
  licence to reuse them and forbid use with Atlassian products.
- Frames that hold cards (J52): on any view the selected cards go in a frame with a name and
  what it is ("Group", Ctrl or Cmd with G), as the nodes of a deployment diagram. Kept per view
  (`View.groups`), drawn around the cards where they are. Inside a box only its own cards are
  grouped. "Arrange" lays out the cards of each frame first and then the frames as blocks
  (`arrangeWithGroups`). Open: the SVG, Mermaid and D2 export leave the frames out, and a drag
  can still put a card into a frame it is not in.
- Error cards (J50): what went wrong (a refused connection, "Arrange" without a layout, an
  export without a file) is a card in the top right corner, which goes by itself after 8 seconds,
  on "Close" or with the next change (`composables/useErrors.ts`, `ErrorCards.vue` in `App.vue`).
  The import dialog keeps its message at its field.
- No connection outside the frame (J49): inside a box, cards connect inside the frame and across
  it; a drag between two cards that both stand outside it draws nothing and a note says where
  such a line is drawn (`connectable` in `@drillgram/model`).
- Add any existing object (J48): "Add existing object" offers every object of the model that is
  not on the diagram yet, from any depth (a part of a box on the Overview, a part of a part in
  the outer box), under where it is from: "Overview" or "Inside <box> › <box>". Only the box the
  diagram is inside, and what that stands inside, cannot be put on it. Its connections to the
  cards there come with it.
- Copy a shape (J47): "Copy" on a card's corner, or Ctrl or Cmd with D for the selection, makes
  one more object like it beside it ("<name> copy": kind, text, icon, card size; not its parts or
  connections), all copies in one change (`objectsCopied`).
- Code elements (J46): a sixth kind of box, "Code", for C4's code level
  (c4model.com/diagrams/code), in its own shape library with a shape per language (Go, Python,
  Rust, C++, C, Java, Kotlin, TypeScript, JavaScript, C#, Swift, SQL, Other). The form asks what
  the code is, in the words of its language (`canvas/codeLanguages.ts`: Go has structs and no
  classes, Rust has traits); both together are the object's technology ("Go struct"). The card
  is a class box, as on that page: square corners, the technology in guillemets over the name,
  beside the name a round badge with the letter of what it is and the language's icon (by itself
  where one may be passed on: not Rust's, Ruby's, PHP's or Zig's), the name slanted for an
  interface, trait or protocol, and under a line its members: fixed-width, from the left, a
  `---` line between fields and methods. The SVG and PNG export draw the same. D2 keeps it;
  Mermaid writes a component.
- Open a box (J3): opening a box leads to the diagram inside it, where it is the frame around
  its parts; back with the breadcrumb, which lists the boxes on the way down; each diagram has
  its own address (`/view/inside-<id>`). The start diagram is the "Overview": the boxes that
  stand inside no other.
- Connections show one level up (J18): a connection of a part of a box is drawn inside that box,
  with its other end outside the frame, and also on every diagram above, between the cards that
  hold its ends: one line per pair of cards and direction, made by the first such connection,
  without a label, and not to be changed there. Not where that diagram has a connection of its
  own between the same two cards the same way round (no doubled line).
- Red at the frame (J40): a connector that runs only to the frame of the opened box (the box is
  connected, none of its parts yet) is red, line and label, on the canvas, in the key ("Not yet
  to a part") and in the SVG and PNG export.
- Look: Tailwind CSS with shadcn-vue components, four themes (Light, Dark, Solarized Light, Solarized Dark), a floating toolbar, cards
  with one colour per C4 kind, the font shipped with the app.
- Canvas on Vue Flow (J9): pan, zoom, fit to screen, drag a card to move it (saved). A fit
  (the button, a diagram that opens with a card out of sight, a new card out of sight) leaves
  room around the cards for what stands over the canvas: the title, the toolbar, air at the
  sides, the frame of an opened box, and the minimap when a card would lie under it
  (`canvas/fit.ts`, J21).
- C4 as on c4model.com (J20): every diagram has a title and a key; elements carry a description,
  a technology (containers, components) and an external mark; relationships a label and a
  technology; the title of a diagram is the name of the box it is inside. Open gaps are listed in
  `docs/agents/c4.md`.
- Example (J21): an empty workspace offers "Load an example", a made-up bookshop with 22 people
  and software systems, 10 containers, 4 components and 37 relationships
  (`packages/model/src/diagram/examples.ts`, built with the model's own editing functions).
- Focus (J22): clicking a card keeps it, its connectors and the cards at their other ends clear
  and fades the rest; clicking the empty canvas ends it.
- Layout engine: `packages/layout`, a Rust port of TALA compiled to WebAssembly (389 KB, 126 KB compressed). Ported:
  the nearest free place for a card that keeps its gaps, TALA's connector router
  with its label placement (`RouteEdges`: all six slices), one move of a card as TALA's
  placement makes it (the price of a card at a place, the cheapest free place around a point),
  and TALA's node placement for a group of connected cards, from nothing to a place for every
  card, with Go's random numbers (not used by the editor yet).
  What was ported and how it was checked: `packages/layout/docs/router-port.md` and
  `packages/layout/docs/placement-port.md`.
- Connectors (J25): every connector runs around the cards, along the route the engine lays for
  it, with rounded bends, spread evenly over the room between cards. Every piece is upright or
  level, never slanted (J30). While a
  card is dragged, the connectors are already laid for the place it will land on (7 ms for the
  bookshop landscape).
- Grid and guides (J26, J27): a dragged card moves in steps of the 20 px grid; a guide line
  shows when it is in the same column or row as another card, and gaps of the same width beside
  it are marked.
- Snap (J23, J24, J29): a dragged card shows a preview of where it will land and snaps there on
  release; cards never overlap or come closer than 20 px (60 px when connected, more where a
  label needs the room). A free place is always taken as it is. A card dropped on a taken place
  goes to the nearest free one; when it has connections it looks 40 px further and takes the
  place TALA prices lowest, so a card dropped a little out of line with its connection lands in
  line (0.14 ms per drop on the bookshop landscape).
- History (J4, J31): every change is an event in a change log, with its time. Undo and redo
  (buttons in the top bar, Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y; Cmd on a Mac) step through it. The
  History button opens the timeline and the log: drag the slider, turn the wheel over it or click
  a change to see the diagram as it was; the diagram follows to where the change was made. A new
  change after going back drops the undone ones. Log and position survive a reload and are the
  same in every browser of the user: they are the workspace's log on the server (J60). The
  editor works on the last 1000 changes.
- Markdown on cards (J44): the description of a card is Markdown (CommonMark with tables,
  strikethrough, links found in plain text and task lists; `lib/markdown.ts`, markdown-it, MIT).
  HTML written in the text is shown as text. A card is as tall as its text needs, up to 480 px
  (`canvas/cardRoom.ts` measures it when the card is added or edited; the size goes with that
  change, `objectAdded.size` and `objectEdited.card`), and moves to the nearest free place where
  it would otherwise reach into another card. Longer text scrolls inside the selected card. A
  double-click on a card (not on its name, which renames) opens the text in place, in a field
  with buttons for the usual marks (`MarkdownField.vue`, GitHub's markdown-toolbar-element,
  MIT), at the same size on screen at any zoom; the form's description is the same field. The
  picture export draws the text as plain lines; D2 keeps the Markdown, Mermaid writes it on one
  line.
- Minimap (J45): the whole diagram small, in the top right corner of the canvas, with the part
  on screen marked and, inside a box, its frame; dragging in it moves the view, the wheel over it zooms. Not on an empty
  diagram or a phone, and it makes room for the history. A card that would lie under it counts
  as out of sight, so the view fits itself.
- Clear the workspace (J43): "Clear workspace" in the top bar asks first, then deletes
  everything in the workspace and its change log, on the server. It cannot be undone. The
  workspace stays, with its name; a new one is begun in the workspace menu (J58).
- Rename and delete (J4): double-click a card to rename it; Delete, Backspace or the Delete
  button removes the selected cards from the model, with what is inside them and their
  connections.
- Edit what is there (J37): "Edit" on a selected card opens its form (name, description,
  technology, external) as one change; a double-click on a connector opens its label to change
  it or to delete the connector.
- Export (J5): the "Export" button in the header saves the open diagram as SVG or PNG: the whole
  diagram, wherever the view is panned to, with its title and its key, always in the light theme.
  `src/export/svg.ts` draws it again from the editor's data with plain shapes and text (no HTML
  inside), with the Geist font and the card icons put inside the file as `data:` URLs; the PNG is
  that SVG painted on a canvas at twice its size (less for very large diagrams, so every browser
  can paint it). Mermaid (`.mmd`, a C4 diagram) and D2 (`.d2`) write the diagram as text
  (`diagramOfView` in `@drillgram/model`): its title, the opened object as a boundary around its parts,
  and the connections drawn on it, those shown from inside its boxes too. Mermaid cannot draw a relationship to a
  boundary nor write a double quote, so its file leaves those relationships out and has single
  quotes instead. D2 draws everything; the C4 level rides in `vars`.
- Flowchart import (J15): a Mermaid flowchart is read as boxes (`flowchartFormat` in
  `@drillgram/model`, read only): subgraphs are boxes with their nodes inside, at any depth. The
  exchange format carries that as `DiagramElement.inside`; `importDiagram` gives every such box
  its diagram, its cards on a grid ("Arrange" lays them out).
- Import (J15): the "Import" button takes a Mermaid C4 diagram (also inside a Markdown
  ```mermaid block) or D2 as the export writes it, pasted or from a file, onto the open diagram as
  one change (`diagramImported`, `importDiagram` in `@drillgram/model`). Every element becomes a new
  object named as in the file; the layout engine lays the file out and the block goes right of the
  cards that are there. People and systems go on the open diagram; containers and components live
  in the system or container the file frames them in (a new object with its own diagram, or the
  open diagram's object if it is of that kind), else in the open diagram's object; if nothing
  fits, the dialog says why. A line the app cannot read is named with its number.
- Server (`apps/server`, 2026-11-26): Go with Fiber and PostgreSQL. Users (made by an admin, the
  first start makes the admin), sign-in four ways (password, single sign-on through OpenID
  Connect, the header of a proxy, a signed token in a header: the last two as Grafana does it),
  several workspaces for a user, each with members (owner, editor, viewer) and a change log
  that is the truth about it. See `architecture.md` ("Server") and `operations.md`
  ("The server").
- With a server the app needs a signed-in user (owner's call, 2026-11-26). Sign in and out (J57): a page for it, with the password form, a button for
  single sign-on where the server has it, and the reason when a sign-in was refused; an address
  asked for while signed out is where the browser is after the sign-in. The account menu in the
  top bar names the user, changes their password and signs them out.
- Workspaces (J58): the top bar names the open workspace and leads to the others, to a new one,
  and for its owner to another name or to deleting it. The address names the workspace
  (`/w/<id>`, a view of it `/w/<id>/view/<view>`); the app's own address leads to the one that
  was open last. Not yet in the app: sharing a workspace (the server can: members and roles).
- Users (J59): an admin has a page for them (`/users`): make one, make one an admin, disable
  and enable. Nobody is deleted.
- The workspace is the server's log (J60): the editor reads it when a workspace opens and
  writes every change to it, also undo, redo and the place on the timeline. A change shows at
  once and is written after; what is not written yet waits in the browser and survives a
  reload. A change made in a browser that has not seen what another one did is not kept: the
  workspace is shown as the server has it and a card says so. Not yet: seeing each other's
  changes as they are made (J19).
- What a browser kept before (J61): the one workspace the app used to keep in the browser can
  be brought into an empty workspace of the server, with its change log, once.
- Without a server (J62; owner's call, 2026-11-26, which takes back "no mode without a
  server" of the same day): `build:browser` builds the same app to run in the browser alone,
  as files for a static host. Nobody signs in; where the account menu is, "About this site" says that
  the diagrams are kept in this browser and leads to the imprint and the privacy policy
  (`apps/web/imprint.html`, `privacy.html`: of who runs the site, in this build alone; the
  postal address and the e-mail address are still to be filled in, and the pages say so). Workspaces and their change logs are in the browser's
  IndexedDB, behind the same API the server answers (`lib/browserServer.ts`), so the editor,
  several workspaces, the history and the two-tabs rule of J60 work as with a server. Not
  there: users, sharing, the same diagrams on a second device. Not yet: a workspace as a file,
  to take it to another browser or keep a copy. `mise run cloudflare` puts the build on
  Cloudflare (Workers static assets, the free plan; `operations.md`, "Without a server").
- A tour on the first visit (J63, 2026-11-26): on a workspace nothing was ever done in, in a
  browser the tour was never shown to, a card welcomes and offers a tour. It loads the example
  and goes through 15 steps, each with a frame of light around the part of the editor it is
  about (`TourGuide.vue` in `DiagramEditor.vue`). The page under it stays the app: seven steps
  ask for something (open a box, go back, add a shape, connect, move, arrange, open the
  history) and the tour goes on when it was done, or with "Next". The steps, what each points
  at (CSS selectors, mostly a button's `aria-label`) and how it knows that it was answered are
  `src/tour/steps.ts`; `tour/place.ts` puts the card beside its target. That the tour was
  begun or skipped is kept in the browser (`drillgram.tour`, `tour/seen.ts`). An empty
  workspace offers it again ("Take the tour"). A new feature gets a step there, or a sentence
  in the step of its part.
- Run as a stack (2026-11-26): `docker compose up --build` builds one image with the server and
  the web app and runs it with a PostgreSQL (`Dockerfile`, `compose.yaml`; `operations.md`,
  "The stack").
- Kubernetes: the [Helm chart](../deploy/helm/drillgram/README.md) runs the hosted app with
  bundled PostgreSQL or connects to an external PostgreSQL database.
- Agent sharing (J7): the Cloudflare build can pair an MCP client with the open workspace.
  The client can read the workspace, switch views, edit the diagram, arrange cards, import and
  export, and move through history. The sharing dialog gives setup instructions for Claude, Codex
  and Claude Code. Changes go into the browser's change log. See [operations](operations.md#on-cloudflare).
- Journeys J1 to J5, J7, J9, J11, J15, J18 and J20 to J63 are real tests. J6, J8, J10,
  J12 to J14, J16, J17 and J19 are still `test.fixme`.
- Event sourcing (owner's call, 2026-11-22; begun 2026-11-26): the events are the truth and the
  workspace is what they add up to: the server keeps the log, the editor makes the workspace
  from it. Still to come for real multi-user behaviour (several people on one diagram): changes
  that reach the other browsers as they are made, and bringing together what two people did at
  the same time instead of dropping the later one.
- Arrange (J32): the Arrange button lays the open diagram out as TALA does: the layout engine
  (`api::arrange` in `packages/layout`) runs TALA's whole pipeline with seeds 1, 2 and 3 and
  keeps the best drawing by TALA's score, among those that keep every two cards 20 px apart.
  The cards move there in one change (`viewArranged`, one undo step); the arrangement keeps
  its top-left corner where the cards' was. A card with many connections may come back taller
  (from five on one side also wider): only that card grows, and the view stores its size
  (`View.sizes`). If no seed keeps the cards apart, nothing moves and the editor says so. The
  With two or more cards selected (Ctrl or Cmd with a click, or a frame drawn with Shift
  held; J33) only those are arranged, by the connections among them; they move aside as one
  group when a card that stays is in the way (`canvas/blockPlace.ts`). The
  engine works in a web worker, so the page stays live: the button spins, the cards shuffle
  and then glide to their places (design rule "nothing ever just sticks"). The
  engine matches TALA's final drawing, score and pick of seed on 137,000 probe diagrams of
  plain cards, trees, hierarchies and clusters. The port, in slices, is
  `packages/layout/docs/placement-port.md` and `router-port.md`.
- Labels (J28): a connector's label sits beside the line where there is room, clear of cards,
  other connectors and other labels; the engine picks the place that covers the least.

## Main parts

- **`apps/web`** (`@drillgram/web`): the Vue 3 + Vite + TypeScript app, Vitest unit tests, Playwright e2e
  journeys in `e2e/`.
- **`packages/model`** (`@drillgram/model`): shared domain types, no Vue imports. `C4Level`, and in
  `src/issues/` the `IssueProvider` interface, a contract test and the three tracker adapters.
- **`apps/server`**: the server, Go with Fiber and PostgreSQL; Go tests through HTTP on a real
  database (`bin/with-postgres`).
- **`deploy/licences`** (`@drillgram/licences`): the licence gate and the check of every file's licence.
- **`bin/ci-check`**: the full check, locally and in CI.

## More

- [architecture](architecture.md), [operations](operations.md).
- Agent rules (index): [AGENTS.md](../AGENTS.md), [testing](../docs/agents/testing.md),
  [stack](../docs/agents/stack.md), [server](../docs/agents/server.md), [workflow](../docs/agents/workflow.md), [C4](../docs/agents/c4.md),
  [layout engine](../docs/agents/layout-engine.md), [design rules](../docs/agents/design.md),
  [verification](../docs/agents/verification.md).
- [User journeys](../docs/journeys.md).
