# Layout engine

`packages/layout` is the layout engine: Rust, compiled to WebAssembly. It is a port of
[TALA](https://github.com/d2lang/d2/tree/master/d2layouts/d2talalayout), the layout engine of D2,
done piece by piece.

## Licence boundary

- `packages/layout` is a git submodule: the engine's own public repository,
  [tidy-layout](https://github.com/mafigit/tidy-layout). It is **MPL-2.0** (its `LICENSE`,
  `NOTICE.md`), because it is a translation of TALA's source. This repository holds no MPL file.
- Whoever ships the built engine must make its source available: the public repository does that.
  So every engine commit the app is built from must be pushed there.
- Do not move app code into it, and do not copy TALA-derived code out of it.
- **Nothing in it names this app**: no "ped", no name of this repository, no path into it
  (`apps/web`, `packages/model`), no journey number. It is written for any user of the engine.
- Its public history starts at the split (2026-11-24); the older history is in this repository,
  under `packages/layout`, up to the commit before the submodule.

## Working with the submodule

- After cloning: `git submodule update --init` (or clone with `--recurse-submodules`). A new
  git worktree needs the same. `bin/engine` says so when the folder is empty.
- An engine change is two commits: one in `packages/layout` (push it to GitHub, branch `main`),
  then one here that moves the submodule to it (`git add packages/layout`). `bin/ci-check`
  builds whatever is checked out; CI builds the commit this repository points at.
- Commits there carry `mafi@inagile.org` and follow the same message rules.

## How to port a piece

1. **Record what TALA answers first.** Write a Go test inside a clone of `d2lang/d2` that runs
   TALA's own function on generated cases and writes inputs and answers as JSON
   (`packages/layout/docs/reference.md`). Keep the recorder in `docs/recorders/`.
2. Port the function to Rust. Name the Go file and functions it comes from at the top of the file.
   Keep TALA's behaviour, also where it looks odd; change behaviour only in `src/api.rs`.
3. Add a Rust test that replays the recorded cases and must give the same answers.
4. Break the port on purpose, once per decision in the code, and see the test fail each time. A case nobody
   recorded is a behaviour nobody checked: record more cases instead of trusting the reading.
   Where random cases do not reach a line, find a layout that does with the probe
   (`packages/layout/docs/reference.md`, "Finding cases").
5. Never edit a fixture by hand and never change one to make a test pass.
6. Probe with many diagrams before a piece counts as done: 40,000 plain ones for a routing
   stage. 1,300 hid three differences in the first routing stage (2026-11-24).

## Layout

| Path | What |
|---|---|
| `src/policy.rs`, `src/graph.rs`, `src/placement.rs`, `src/placementcost/` | Ported from TALA's placement, in slices: [placement-port.md](../../packages/layout/docs/placement-port.md) |
| `src/routing/` | Ported from TALA's router, in slices: [router-port.md](../../packages/layout/docs/router-port.md) |
| `src/pipeline.rs` | The stages in TALA's order, from a diagram to its finished drawing (`layout`, one seed), and TALA's pick of seeds 1, 2 and 3 (`layout_best`) |
| `src/api.rs` | Ours: what the editor asks, as JSON; decides how the ported pieces are used |
| `src/wasm.rs` | The WebAssembly boundary: text in, text out, no generated glue |
| `js/index.ts` | The JavaScript side, `tidy-layout`: `loadLayoutEngine(...)` |
| `tests/` | Rust tests; `tests/fixtures/*.tala.json` are answers recorded from TALA |
| `examples/probe*.rs` | Ours: compare the port with TALA on thousands of random layouts and diagrams (routes, moves of a card, the stages of the pipeline) |
| `tools/breaks/` | Ours: the lists of deliberate breaks per stage and the runner that tries them (`tree_breaks.py`) |
| `pkg/` | The built `tidy_layout.wasm` (not in git) |

## Build and test

- `mise install` installs Rust with the WebAssembly target (`mise.toml`).
- `bin/engine build` compiles the engine into `packages/layout/pkg/`; `bin/engine test` runs the
  Rust tests first. `pnpm test` does the latter for `tidy-layout`, then tests the wrapper against
  the real `.wasm`.
- The Docker image of the checks (`apps/web/e2e/Dockerfile`) builds the engine in its own stage
  and sets `TIDY_LAYOUT_PREBUILT=1`, which makes `bin/engine` only check that the file is
  there. Keep its Rust version equal to `mise.toml`.

## What is ported

- The nearest free place for a card around a point, on a grid: `closest_unoccupied`. Checked
  against 500 recorded cases.
- The gap two cards keep: 20, 60 when connected, and the room of a label between them (its width
  when they sit side by side, its height when one is above the other, the smaller of the two on a
  diagonal): `Graph::gap_between`. Checked against 5066 recorded gaps and 500 more searches.
- One move of a card as TALA's optimizer makes it (`placement::fill_placement_points`,
  `placement::move_node_to_best`, `placementcost`): the free places around a point, the price of
  the card at each (length of its connections, cards in the way, arrows that point down and to
  the right, connections that continue each other, less a reward for symmetry), and the cheapest
  one. Checked against 341 recorded moves, prices bit for bit, and with the probe against TALA
  on 40,000 random layouts.
- One pass of TALA's sized optimizer over all cards (`optimizer::optimize`): every card moves to
  the cheapest place near the middle of the cards it is connected to, or swaps with a neighbour,
  or turns its branch around a card (`transpose`); hubs move once more without their spokes.
  With Go's seeded random numbers (`gorand::GoRand`, a port of Go's `math/rand`), so a pass can
  be replayed. Checked against 322 recorded passes and with the probe against TALA on 20,000
  more. Nothing in the editor uses it yet.
- Node placement for one connected group of cards (`node_placement::place_nodes_orthogonally`):
  from nothing to a place for every card, with a seed. A first arrangement on a coarse grid, the
  sizeless optimizer and compaction while it cools down, the change to real sizes, the pass
  above with compaction, and last passes without temperature. Checked stage by stage against
  139 recorded placements and with the probe against TALA on 3,000 more. Nothing in the editor
  uses it yet.
- The node placement stage for cards in several groups (`place::place`, `place::prescale`): cards
  with many connections grow, the groups are split, placed alone, mirrored to their flow
  direction and packed. Checked against 432 recorded diagrams and with the probe on 9,000
  more. Nothing in the editor uses it yet.
- TALA's tree stage (`trees::find_trees`, `place::place_with_trees`): the branches that hang on
  the rest of a diagram by one connection are taken out before node placement (which changes
  the order of cards and connections also where no tree remains) and laid out around the cards
  they hang on afterwards, level by level, on the side where they come nearest. The stage
  also says on which side of its card a tree lies and where the labels of its connections
  are to go (`Graph::tree_links`, `label_presets`): routing and the label stage read that.
  Checked against 432 recorded diagrams (73 with trees laid out and no cluster) and with the
  probe on 9,000 more.
- TALA's hierarchy stage (`hierarchy::find_hierarchies`, `hierarchy_layout::place_hierarchies`):
  which groups of cards flow one way through three or more levels, the level of each card
  (rings broken, then ranked by network simplex), and the group laid out in layers: few
  crossings, cards straight under each other where they can be (Brandes and Köpf). Checked
  against 432 recorded diagrams (54 with a hierarchy) and with the probe on 9,000 more.
- TALA's cluster stage (`clusters::find_clusters`, and in `placementcost`, `optimizer`,
  `place`): cards that are alike in size, neighbours and arrows are put in a row or a column
  and placed as one card, the vessel. A connection to a cluster is priced for the card it
  belongs to; a cluster turns from a row into a column, or back, to face its neighbours.
  Checked against 432 recorded diagrams (105 with a cluster) and with the probe on 9,000 more
  (2,122 with a cluster).
- TALA's stages after node placement, up to routing (`swap::swap`, `swap::transpose_all`,
  `align::align`, `gaps::normalize_gaps`, `align` again, `cluster_stage::optimize_clusters`,
  `align` a third time, `balance::balance_symmetry`, `equidistance::equidistance`, `align` a
  fourth time, `pack::pack`, `place::pad`, on `place::Placed`): two cards swap
  places where that makes the whole diagram shorter and adds no crossing, the diagram is
  mirrored so that most arrows point right and down, a card with one or two connections turns
  its branch around the card at the other end, two connected cards that are a little out of
  line are lined up, a card's connected neighbours are pulled closer where the gap is large,
  a cluster is put in line with its neighbours, a card moves to the middle of neighbours
  that stand in one line on one side of it, a card between two neighbours moves halfway
  between them, and the groups of connected cards are packed. Not ported: the three stages
  that move cards after routing. Checked against 432 recorded diagrams and
  with the probe on 9,000 more. Nothing in the editor uses it yet.
- `snap` in `src/api.rs` uses all three: "where does this card go if it is dropped here". A free
  place is taken as it is. On a taken place a card without connections gets the nearest free
  one; a card with connections makes that one move around the wanted place, looking 40 px
  further than the nearest free place.
- The router's visibility graph (`routing::ovg::build`): ports, the points a route may pass,
  tunnels between cards that face each other, and the free stretches between all of them. Checked
  against 480 recorded graphs.
- The search for one connection through that graph (`routing::router::Router`): the cheapest way
  from card to card, where turns, crossings, running along other routes and side ports cost.
  Checked against 1955 recorded routes, prices bit for bit, and with the probe against TALA on
  34,000 random layouts.
- Routing all connections of a diagram (`routing::coordinator::route_all`): cards on a diagonal
  get a route with one or two bends by rule where one is free, the rest is searched; three orders
  of routing are tried and the cheapest result is kept. Checked against 244 recorded layouts and
  with the probe against TALA on 22,500 more.
- What TALA does to the routes afterwards (`routing::line`, `routing::balance`): two facing cards
  closer than 42 get a straight line; a route is replaced by a straight line where that is
  cheaper; then all pieces are spread evenly over the room between cards and other routes.
  TALA's straight lines may be slanted. `route` in `src/api.rs` allows only upright and level
  ones (`Graph::slanted_lines`, journey J30): ours, not TALA's.
  `routing::coordinator::route_edges` is TALA's `RouteEdges` for plain cards: checked step by
  step against 262 recorded layouts, and with the probe against TALA's final routes on 22,500
  more, bit for bit.
- Label places (`routing::labels`): every label is tried beside and on its route, at twelve
  positions and along the whole route, and gets the place where it covers the least: cards,
  other routes, labels placed before it, stretches that routes share.
  `routing::coordinator::route_edges_with_labels` is TALA's `RouteEdges` with labels: checked
  against 246 recorded layouts, and with the probe against TALA on 181,239 labels.
- The routing stages of TALA's pipeline for plain cards, as far as they are ported
  (`routing::coordinator::route_graph`, `route_stages`; `routing::simplify`,
  `routing::swap_ports`): every group of connected cards is routed alone, with the cards of
  other groups in the way; a hook is taken out of a route; two connections of a card that
  cross beside it exchange their ports; then the straight lines, the spreading and the labels
  as above; last, pieces of routes that lie on one line between two walls are moved where
  that makes the routes shorter or the gaps wider (`routing::nudge`). Checked against 174
  recorded diagrams and with the probe on 44,119 more: TALA's routes and label places at the
  end of the pipeline's routing in all of them, also where two connected cards touch (TALA's
  placement leaves such a pair now and then). After the first routing a card moves a little where that straightens a route
  that leaves it with two bends close together, and all connections are routed again
  (`dejitter::dejitter`). Before the labels are placed the groups are packed once more, with
  their routes (`pack::pack_routed`). With the last stage (`place::normalize`: the drawing
  moves to the origin) that is TALA's final drawing for every diagram of plain cards: the
  places of the cards, the routes and the label places. `pipeline::layout` runs all stages,
  from the diagram as it is given: checked against TALA's finished drawing of 174 recorded
  and 45,419 probe diagrams.
- The same for diagrams with trees (`routing::tree_routes`): the connections of a tree are
  routed by rule before the search, straight or as an S with two bends halfway between the
  cards; the later stages leave them alone; their labels go where the tree stage wants
  them, if that place is free. `pipeline::layout` takes such a diagram too. Checked against
  TALA's finished drawing of 73 recorded and 26,647 probe diagrams with trees.
- The same for diagrams with a hierarchy (`routing::ovg_hierarchy`): the routing graph gets
  rows between the levels and points beside the cards of every level, the group is routed
  in one order, from the top, and no connection in it becomes a straight line.
  `pipeline::layout` takes such a diagram too. Checked against TALA's finished drawing of
  50 recorded and 15,441 probe diagrams with a hierarchy.
- The same for diagrams with clusters (`Graph::clusters`, `place::cleanup`,
  `routing::crosshatch`, `cluster_branching`, `shortcut`): the routes of a cluster leave
  their cards on the sides facing the card they hang on and share their way to it; TALA's
  stages for clusters (`Crosshatch`, `FixClusterEdgeBranching`, `ShortcutEdgeRoutes`) and
  its label rules for them. Checked against TALA's finished drawing of 113 recorded diagrams
  with a cluster and 28 with several kinds; 43,613 cluster and 17,700 mixed probe diagrams
  match, from TALA's graph and through the whole pipeline. The placement
  keeps TALA's price cache and its transaction rules (`Graph::length_cache`, `Allowed`). Nothing in the editor uses it yet.
- What TALA counts on a finished drawing (`quality::inspect`): cards on each other, routes
  through cards, covered labels, crossings, detours and the length of all routes. The nudge
  stage judges its work by it. Checked bit for bit against TALA's counts on its own final
  drawings: 174 recorded and 44,119 probe diagrams, and 403 denser layouts.
- TALA's score of a finished drawing and its choice between seeds 1, 2 and 3 (`score`,
  `pipeline::layout_best`): bends, slanted pieces, crossings and how badly the labels sit,
  then the area for a tie; of equal scores the later seed. Checked bit for bit against
  TALA's scores of all 438 recorded diagrams for each seed, and of 137,012 probe diagrams.
- `route` in `src/api.rs` gives the editor those routes: per connection the points from border to
  border, and for a connection with a label the top-left corner of the label's box. It refuses
  cards that overlap or touch: the editor never has them, and the router was never checked
  for cards that lie on each other.
  Ours, not TALA's (owner's calls of 2026-11-24), in this order after TALA's routing:
  1. `separate_lines`: no two connections lie on one line. TALA lets connections of one card
     share an end and the line from it. Pieces of different routes that share more than a
     pixel of a line are spread around it, 16 apart; closer (12, 8, 6) where an end has no
     room on its card's side (8 from the corners) or a route would run through a card. The
     route that turns off first lies on the side it turns to, so the lines do not cross. Up
     to 8 rounds, as a moved line can come to lie on a third. On 600 random layouts TALA
     leaves 346 pairs of routes on one line, this none; none either on 4,000 denser ones.
  2. `follow_lines`: a label moves with the piece of its line it lay beside.
  3. `clear_labels`: a label under a line, on a card or on another label moves to the nearest
     place beside its own line, on either side of any of its pieces, that is clear of every
     line, card and other label. Where no such place exists it stays: with three lines 55
     apart no label 183 wide fits between them. On random layouts a third of the cases go
     (153 to 103 in `tests/route.rs`).
  4. `make_room`: for a label still in the way, lines of other connections that run beside
     its own line move aside, to just past the label (the next 16 further). A way is kept
     only if every moved route still ends on the sides of its cards, runs through no card
     and lies on no other line, and no label that was clear comes to lie in the way; of the
     ways that work, the one that moves the lines least. That takes the 103 down to 69.
     What stays: labels where the lines cannot move, as their ends have no room on their
     cards (three lines into one side 220 wide, labels 190 wide), or where a line crosses.
     Kept though no test can tell: a line that crosses the place rules the place out at once
     (the check after the move would refuse it too).
  Found on the way, TALA's own and not changed: in 1 of 4,000 dense layouts the ported
  router ends a route 10 beside the corner of its card, not on its side.
- `arrange` in `src/api.rs` gives every card a new place, as TALA arranges the diagram: the
  whole pipeline for seeds 1, 2 and 3, and TALA's best by its score among the drawings that
  keep every two cards 20 apart (the editor's gap, measured as the model does: the larger of
  the gap beside and the gap above or below). If no seed keeps it, an error. A card keeps its
  own size, except that a card with many connections grows as TALA makes it grow; a card of a
  cluster keeps its own size, not the cluster's. The places are TALA's top-left corners,
  moved so that the box around all cards starts where it started. Cards may overlap in the
  request. The answer names the seed.

Not ported yet, with the size of TALA's Go source as a measure:

| Piece | In TALA | Why it matters |
|---|---|---|
| "Arrange" in the editor | ours | Slice 7 in placement-port.md: the editor puts the cards where `arrange` says. Cards stay where they are put |

## How the editor uses it

- `apps/web/src/composables/useLayoutEngine.ts` loads the `.wasm` once, in the background.
- While a card is dragged, `DiagramEditor.vue` asks `snap` where it would land (grid of 20 px) and
  shows that place as a dashed outline; on release the card moves there (journey J23). A card
  dropped on a taken place, a little out of line with a card it is connected to, lands in line
  with it (journey J29).
- The model has its own, simpler rule (`fitsOnView`, `CARD_GAP` in `packages/model`): no card closer
  than 20 px to another. `moveObject` refuses such a place, and new cards take the first free
  one. So nothing can overlap even while the engine is not loaded; the engine's places always
  satisfy the model.
- Label sizes are measured in the editor (`canvas/labelSize.ts`) and passed with each connection
  (journey J24).
- Connectors: `DiagramEditor.vue` asks `route` for all connectors whenever the workspace changes
  and hands each connector its points; `canvas/ConnectionEdge.vue` draws them with rounded bends
  (`canvas/routePath.ts`, journey J25). If a card covers a label, the editor searches farther
  from each segment for a clear spot (`canvas/routeLabels.ts`, journey J28). This also applies
  to connections to the frame. While one card is
  dragged, the routes are laid for the place it would land on, at every change of that place,
  and drawn that way: all connectors, the dragged card's own too, show how they will run after
  the drop (they end at the outlined landing place when the card under the pointer is somewhere
  it cannot land). A route that does not start and end on its cards is not drawn; the connector
  then runs from border to border with one bend at most (`canvas/geometry.ts`, `elbow`; several
  cards dragged together).
- Speed: the bookshop landscape (22 cards, 27 connectors with labels) is routed and labelled in
  7 ms in WebAssembly.
- Grid, lining up and equal distances (journeys J26, J27): Vue Flow snaps a dragged card to the
  20 px grid, so it moves in steps. `canvas/alignment.ts` gives, for the place the card would
  land on, a guide line through every other card whose middle is in the same column or row
  (`guidesFor`), and the gaps beside the card that are as wide as the next gap along its row or
  column (`gapsFor`); the editor draws both while the card is dragged. Nothing pulls a card into
  line or to an equal distance beyond the grid: every free grid place can be taken.
- A card dropped on a taken place looks only 40 px beyond the nearest free one. A label can
  still cross a line or another label in a dense diagram. During a drag of several cards, the
  connectors update after the drop.
