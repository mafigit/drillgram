# User journeys

Each journey proves the product works for a person in a real browser. Every journey has a test
file under `apps/web/e2e/`, named after its entry. A journey whose feature is not built yet is a
`test.fixme`: the feature issue turns it into a real, failing test first, then builds the feature
(see [testing.md](agents/testing.md)).

Projects: `chromium` (desktop), `webkit` (desktop, closest to iOS Safari) and `tablet` (iPad,
touch). Journeys run on all three unless the entry says otherwise.

The journeys run against the server (`apps/server`) with the built app, on a database of its
own. Every test starts signed in, as a user made for it with an empty workspace; "open the app"
means that. J57 is about signing in itself.

A fourth project, `browser-only`, runs against the app built to run without a server (J62), in
desktop Chromium: J62 itself and, of the journeys above it, those about what a workspace keeps
(J2, J4, J31, J43, J58). There "open the app" means a browser that never ran it.

## J1 Open the app

Test: `apps/web/e2e/j1-open-the-app.spec.ts`

1. Open the app.

Expected: the empty editor loads, with no console errors.

## J2 First diagram

Test: `apps/web/e2e/j2-first-diagram.spec.ts`

The app opens on the Overview: the boxes that stand inside no other box.

1. Open the app.
2. Add a person "Customer".
3. Add a software system "Online Shop".
4. Connect "Customer" to "Online Shop" and label the relationship "Places orders in".
5. Reload the page.

Expected: both elements and the labelled relationship are still there.

## J3 Open a box and go back

Test: `apps/web/e2e/j3-drill-down.spec.ts`

Everything is a box: a plain one or one of C4's shapes. Any box can be opened, and what is added
inside it is a part of it. No kind says what may live in what, and there are no diagram types.

1. Open the app and add a software system "Online Shop".
2. Open "Online Shop" and add a container "Web App".
3. Open "Web App" and add a person "Operator"; open "Operator" and add a box "Checklist".
4. Go back to "Online Shop" with the breadcrumb, then to "Overview".

Expected: opening a box leads straight to the diagram inside it, titled with the box's name; the
box is the frame there, not a card. Any kind goes inside any kind, as deep as wanted. The
breadcrumb lists the boxes on the way down ("Overview", "Online Shop", "Web App", "Operator").
"Web App" is on the diagram inside "Online Shop" only; "Online Shop" is a card on the Overview.

## J4 Edit safely

Test: `apps/web/e2e/j4-edit-safely.spec.ts`

1. Open the app and add a software system "Shop".
2. Rename it to "Online Shop", undo, redo.
3. Move it, undo, redo.
4. Delete it, undo, redo.
5. Add a software system "Shop" in a fresh app, undo with Ctrl+Z (Cmd+Z on a Mac), redo with
   Ctrl+Shift+Z.

Expected: each undo restores the state before the step, and each redo applies the step again.

## J5 Export

Test: `apps/web/e2e/j5-export.spec.ts`

1. Open the app and draw the J2 diagram, with a description and a PostgreSQL icon on "Online Shop".
2. Export it as SVG (header button "Export", then "SVG").
3. Export it as PNG, then as Mermaid, then as D2.

Expected: the button shows it is working (`aria-busy`) until the SVG is saved. Every file is named
after the diagram (`system-landscape-diagram.svg`, `.png`, `.mmd`, `.d2`). The SVG is valid, has
the title, names, description and label as text, and holds the icon and the font itself (no links
to the app). The PNG is twice the SVG's size and not blank. The Mermaid file is the C4 diagram
with its title, elements and relationship; the D2 file has the same in D2's C4 notation.

## J6 Work offline

Test: `apps/web/e2e/j6-work-offline.spec.ts`. Chromium only: service-worker inspection is reliable
only there (spike #1).

1. Open the app and wait for the service worker.
2. Go offline.
3. Reload the page.
4. Add a software system "Online Shop".

Expected: the app loads offline and the new element is shown.

## J7 Agent changes the diagram

Test: `apps/web/e2e/j7-agent-changes-the-diagram.spec.ts`

1. Open the app.
2. A test MCP client adds a software system "Payment Service".

Expected: the open editor shows "Payment Service" without a reload.

## J8 Tablet

Test: `apps/web/e2e/j8-tablet.spec.ts`. Tablet project only (touch).

1. Open the app.
2. Tap to add a person "Customer" and a software system "Online Shop".
3. Drag from "Customer" to "Online Shop" to connect them, and label the relationship
   "Places orders in".
4. Pinch to zoom in.
5. Reload the page.

Expected: the pinch zooms the canvas in; after the reload both elements and the labelled
relationship are still there.

## J9 Pan and zoom

Test: `apps/web/e2e/j9-pan-and-zoom.spec.ts`

1. Open the app and add a software system "Online Shop".
2. Zoom in (Ctrl + wheel on desktop, pinch on the tablet).
3. Pan by dragging the empty canvas.
4. Choose "Fit to screen".

Expected: zooming makes the element larger, panning moves it, and after "Fit to screen" the whole
element is inside the canvas.

## J10 Reuse an object on a second diagram

Test: `apps/web/e2e/j10-reuse-an-object.spec.ts`

1. Open the app and add a software system "Online Shop".
2. Create a second System Landscape diagram "Payments".
3. Add the existing object "Online Shop" to it.
4. Rename it to "Web Shop".
5. Open the first diagram.

Expected: the first diagram shows "Web Shop" and no "Online Shop": both diagrams show the same
object of the model.

## J11 Find anything with the search

Test: `apps/web/e2e/j11-command-palette.spec.ts`

1. Open the app, add a software system "Online Shop", open it and add a container "Web App".
2. Go back to the Overview.
3. Press Ctrl+K (Cmd+K on macOS), type "Web" and press Enter.
4. Add a container "Database", click the empty canvas, search for "web a", press Enter, then
   Delete.
5. In a fresh app with the software systems "Online Shop" and "Billing": click the search field
   in the header, type "bill", then something no object is called, then press Escape.

Expected: after step 3 the diagram inside "Online Shop" is open and shows "Web App". In
step 4 the search selects "Web App" on the open diagram: Delete removes it and leaves "Database".
Both times
the found card comes to the middle of the canvas, at the zoom the diagram has. In step 5 the field has the cursor at once and lists both objects; "bill" leaves "Billing" (a
part of the name is enough, capitals do not matter); a text that fits nothing says "No object
found."; Escape closes the search.

## J12 Tag overlay

Test: `apps/web/e2e/j12-tag-overlay.spec.ts`

1. Open the app and add the software systems "Online Shop" and "Payment Service".
2. Tag "Payment Service" with a new tag "PCI" in a new group "Compliance".
3. Focus on the tag "PCI", then leave the focus.
4. Hide the tag "PCI".

Expected: with the focus only "Payment Service" is shown; with the tag hidden only "Online Shop"
is shown.

## J13 Tell a flow

Test: `apps/web/e2e/j13-flow.spec.ts`

1. Open the app and draw the J2 diagram.
2. Create a flow "Place an order" with one step "Submits the cart" along "Places orders in".
3. Play the flow.
4. Export the flow as Mermaid.

Expected: playing shows step 1 "Submits the cart"; the export downloads a `.mmd` file with a
sequence diagram that contains the step.

## J14 Free-form flowchart

Test: `apps/web/e2e/j14-free-form-flowchart.spec.ts`

1. Open the app and create a free-form diagram "Checkout".
2. From the Flowchart shapes add a terminator "Start", a process "Validate cart" and a decision
   "In stock?".
3. Connect "Start" to "Validate cart" and "Validate cart" to "In stock?".
4. Drag "Validate cart" until it is almost level with "Start".
5. Reload the page.

Expected: "Validate cart" snaps level with "Start"; after the reload all three shapes and both
connectors are still there.

## J15 Diagram as code

Test: `apps/web/e2e/j15-diagram-as-code.spec.ts`

1. Open the app and import a Mermaid C4 diagram (header button "Import", then "Mermaid", paste,
   "Import diagram") with a person "Customer", a software system "Online Shop" and the
   relationship "Places orders in".
2. Rename "Online Shop" to "Web Shop".
3. Export the diagram as Mermaid.
4. On a diagram with "Billing", import a D2 file (as the D2 export writes it) with "Online Shop"
   framed around the containers "Web App" and "API".
5. Import a Mermaid file with a line the app does not read.

Expected: after the import both elements and the relationship are shown; the export downloads a
`.mmd` file that names "Web Shop". The D2 import puts "Customer" and "Online Shop" beside
"Billing", with a line without a label from "Customer" to "Online Shop" ("Shops in" was made
inside and shows one level up), and the diagram inside "Online Shop" holds "Web App" and "API" with "Calls [HTTPS]", and
"Customer" outside the frame with "Shops in"; one undo takes the whole import back. A text
longer than the window scrolls inside its box, so the button to import it stays on screen. A
text that is plainly another kind of diagram (a Mermaid sequence diagram) is said to be that,
instead of a complaint about its first line.

A Mermaid flowchart (`flowchart` or `graph`) is read, whichever format was chosen: every node is
a box named by its label, every subgraph a box with its nodes inside (a subgraph inside a
subgraph too), every arrow a connection with its text. The outermost boxes come onto the open
diagram; the diagram above shows a line where two boxes are connected by what is inside them.
A node's shape is kept (J53). What else says how the flowchart looks is left out: classes, styles, directions,
links that are not drawn (`~~~`) and subgraphs without a name, whose nodes stand in the box
around them. One undo takes the import back. The unreadable
file is refused with its line number ("Line 3") and nothing is added.

## J16 Draft a future state

Test: `apps/web/e2e/j16-draft-and-versions.spec.ts`

1. Open the app, add a software system "Online Shop" and save a version "Shop only".
2. Start a draft "Add payments" and add a software system "Payment Service" in it.
3. Leave the draft.
4. Merge the draft.
5. Revert to the version "Shop only".

Expected: outside the draft "Payment Service" is not shown until the merge; after the merge it is
shown; after the revert it is gone again.

## J17 Comment on an object

Test: `apps/web/e2e/j17-comments.spec.ts`

1. Open the app and add a software system "Online Shop".
2. Add a question "Who owns this?" to "Online Shop".
3. Resolve it.

Expected: the question is shown on the canvas until it is resolved; afterwards it is in the list of
resolved comments only.

## J18 A connection made inside a box shows one level up

Test: `apps/web/e2e/j18-connections-one-level-up.spec.ts`

1. Open the app and add the software systems "Online Shop" and "Payment Service".
2. Open "Online Shop" and add the containers "Web App" and "API".
3. Add the existing object "Payment Service" to this diagram.
4. Connect "Web App" to "Payment Service" ("Starts payment") and go back to the Overview.
5. Inside "Online Shop" connect "API" to "Payment Service" ("Confirms payment"); go back.
6. Delete "Starts payment" inside "Online Shop", go back; delete "Confirms payment", go back.
7. On a new workspace: connect "Online Shop" to "Payment Service" on the Overview first, then
   open "Online Shop", add "Web App" and connect it to "Payment Service".

Expected: after step 4 one line runs from "Online Shop" to "Payment Service" on the Overview,
without a label: it says that the two are connected, what for is said inside. The second
connection adds nothing above. The line stays while one of the two is left and goes with the
last. In step 7 the Overview keeps the one line that was drawn there, with its label: a part
that takes a connection of its box makes no second line between the boxes.

## J19 Work together on one diagram

Test: `apps/web/e2e/j19-work-together.spec.ts`

1. Ada opens the app, adds a software system "Online Shop" and copies the share link.
2. Ben opens the share link in his own browser.
3. Ben adds a person "Customer".
4. Ada renames "Online Shop" to "Web Shop".

Expected: without a reload, Ada sees "Customer" and Ben sees "Web Shop", and each sees that the
other is there.

## J20 A diagram that explains itself

What c4model.com asks of every diagram: a title, a key, and elements and relationships that say
what they are (see [agents/c4.md](agents/c4.md)).

Test: `apps/web/e2e/j20-diagram-explains-itself.spec.ts`

1. Open the app and add a software system "Online Shop" with the description "Sells books to
   customers".
2. Add an external software system "Payment Provider".
3. Open "Online Shop" and add a container "Web App" with the technology "Vue 3".
4. Add the existing object "Payment Provider" and connect "Web App" to it with the label "Starts
   payments with" and the technology "HTTPS".

Expected: the first diagram is titled "Overview", "Online Shop" shows its
description and "Payment Provider" is marked as external. The diagram inside "Online Shop" is titled
"Online Shop", "Web App" shows "Vue 3", the relationship shows its label and "HTTPS",
and the key names every kind of object on the diagram.

## J21 Start from an example

Test: `apps/web/e2e/j21-start-from-an-example.spec.ts`

1. Open the app.
2. Choose "Load an example".
3. Open "Web Shop".

Expected: the Overview shows a made-up bookshop with its people, its own software systems
and external ones such as "Card Processor", all on screen; the diagram inside "Web Shop"
shows "Shop API". Once something is on the Overview, the example is no longer offered.

## J22 Focus on one object

Test: `apps/web/e2e/j22-focus-on-one-object.spec.ts`

1. Open the app and add a person "Customer" and the software systems "Online Shop", "Mail Server"
   and "Billing".
2. Connect "Customer" to "Online Shop" ("Buys in") and "Mail Server" to "Billing" ("Sends invoices
   for").
3. Click "Online Shop".
4. Click the empty canvas.

Expected: after the click on "Online Shop", it and "Customer" and the relationship between them
stay clear; "Mail Server", "Billing" and their relationship fade. After the click on the canvas
everything is clear again.

## J23 Cards snap to a free place

Test: `apps/web/e2e/j23-snap-to-a-free-place.spec.ts`

1. Open the app and add the software systems "Online Shop" and "Billing".
2. Start dragging "Billing" and hold it on top of "Online Shop".
3. Release it.
4. Reload the page.

Expected: while "Billing" is held, a preview shows where it will land, and that place is clear of
"Online Shop". On release "Billing" sits exactly where the preview was, at least 20 px from "Online
Shop" and on the 20 px grid, and it is still there after the reload. Two cards never overlap.

## J24 Room for the label

Test: `apps/web/e2e/j24-room-for-the-label.spec.ts`

1. Open the app and add the software systems "Online Shop" and "Billing".
2. Connect "Online Shop" to "Billing" with the label "Sends every paid order with its invoice
   lines to".
3. "Billing" sits too close for the label. Drag it a little to the right and release it.

Expected: wherever "Billing" lands, the whole label is clear of both cards. (Level with "Online
Shop" that takes the label's width between them; on a diagonal the cards may be closer. Which of
the free places is the best one is not decided yet: the nearest wins.)

## J25 Connectors go around cards

Test: `apps/web/e2e/j25-connectors-go-around-cards.spec.ts`

1. Open the app and add the software systems "Online Shop", "Billing" and "Warehouse". They land
   side by side, "Billing" in the middle.
2. Connect "Online Shop" to "Warehouse" with the label "Sends parcels to".
3. Drag "Billing" far down, out of the way.
4. Drag "Billing" back up to where it was and hold it there.
5. Release it.
6. Drag "Warehouse" onto "Billing" and hold it there.

Expected: the connector never runs through a card that lies still. After step 2 it goes around
"Billing". After step 3 it is one straight line. In step 4, while "Billing" is still held, the
connector already bends around the place where "Billing" will land. After step 5 it goes around
"Billing". In step 6 "Warehouse" cannot land on "Billing": an outline shows where it will land,
and the connector runs to that outline, not to the card under the pointer.

## J26 Cards snap to the grid and line up

Test: `apps/web/e2e/j26-cards-snap-and-line-up.spec.ts`

1. Open the app and add the software systems "Online Shop", "Billing" and "Warehouse".
2. Drag "Online Shop" to below "Billing", a few pixels beside its column, and hold it there.
3. Release it.
4. Drag "Online Shop" 70 px to the right and hold it there.
5. Release it.

Expected: a dragged card moves in steps of the 20 px grid, not smoothly. In step 2 "Online Shop"
sits exactly in the column of "Billing", and a guide line through both cards shows that they are
in line. After step 3 the guide is gone and the card is still in the column. In step 4 the card
is on the grid but in line with no other card, and no guide shows. After step 5 it stays where
it was held: lining up is offered, never forced.

A group of selected cards dragged together shows the guides as well: one for every card of the
group that comes in line with a card that stays (second test of the file).

## J27 Equal distances show while dragging

Test: `apps/web/e2e/j27-equal-distances.spec.ts`

1. Open the app and add the software systems "Online Shop", "Billing" and "Warehouse". They land
   in a row, the same distance apart, "Billing" in the middle.
2. Drag "Billing" down, out of the row, and release it.
3. Drag "Billing" back up to its place between the other two and hold it there.
4. Move it 20 px to the right, still holding.
5. Release it.

Expected: in step 3 both gaps, left and right of "Billing", are marked: they are equally wide. In
step 4 the gaps differ and no mark shows. After step 5 no mark shows and "Billing" stays where it
was held.

## J28 Labels sit beside their connector

Test: `apps/web/e2e/j28-labels-beside-connectors.spec.ts`

1. Open the app and add the software systems "Online Shop", "Billing" and "Warehouse".
2. Connect "Online Shop" to "Billing" with the label "Pays".
3. Connect "Online Shop" to "Warehouse" with the label "Ships parcels with".

Expected: both labels can be read in full. Neither lies on a card, on a connector's line (its own
included: the label sits beside the line, which stays visible from end to end) or on the other
label.


## J29 A dropped card lands in line with its connection

Test: `apps/web/e2e/j29-dropped-card-lands-in-line.spec.ts`

1. Open the app and add the software systems "Online Shop" and "Billing".
2. Connect "Online Shop" to "Billing" with the label "Pays".
3. Start dragging "Billing" and hold it on top of "Online Shop": 40 px to the right of and 40 px
   below where "Online Shop" lies.
4. Release it.

Expected: while "Billing" is held, the preview shows it straight below "Online Shop": in the same
column, with the gap connected cards keep. That is not the nearest free place, which lies 40 px
out of line. On release "Billing" sits exactly where the preview was, and the connector between
the two is one straight, upright line.

## J30 Connectors run at right angles

Test: `apps/web/e2e/j30-connectors-run-at-right-angles.spec.ts`

1. Open the app and add the software systems "Online Shop" and "Billing".
2. Connect "Billing" to "Online Shop" with the label "Charges for".
3. Start dragging "Billing" and hold it below "Online Shop", 60 px out of line to the left, with
   100 px between the two.
4. Release it.

Expected: every piece of the connector is upright or level, while "Billing" is held and after it
is released. The connector has bends: the two cards are not in line. It is never one slanted line
from card to card.

## J31 Go back along the timeline

Test: `apps/web/e2e/j31-timeline.spec.ts`

1. Open the app, add the software systems "Online Shop" and "Billing" and connect "Online Shop"
   to "Billing" with the label "Pays".
2. Open the history.
3. Drag the timeline back to the first change and hold it there.
4. Let go.
5. Redo twice.
6. Drag the timeline back to the first change again, let go, and add a software system
   "Warehouse".
7. In a fresh app: draw step 1, undo once, reload the page and open the history.
8. In a fresh app, on a desktop: draw step 1, open the history and turn the wheel over the
   timeline, one notch up and one down.

Expected: in step 2 the change log lists the three changes in order, each with what changed and
when. In step 3 the diagram shows only "Online Shop", and still does after step 4. After step 5
"Billing" and the connector are back. After step 6 the change log has two changes: the two that
were undone are dropped. In step 7 the change log still has its three changes after the reload,
the connector is still undone, and redo brings it back. In step 8 the wheel takes the connector
away and brings it back.

## J32 Arrange lays the diagram out

Test: `apps/web/e2e/j32-arrange.spec.ts`

1. Open the app and add the software systems "Online Shop", "Billing", "Warehouse" and
   "Mail Service".
2. Connect "Online Shop" to "Billing" with the labels "Pays" and "Asks for refunds", and
   "Billing" to "Online Shop" with "Confirms payments". Connect "Online Shop" to "Warehouse"
   with "Ships with" and "Warehouse" to "Mail Service" with "Notifies through".
3. Press "Arrange".
4. Undo, then redo.

Expected: the press in step 3 shows at once: the button and the diagram are busy while the
engine works, and at rest again when the cards are in place. After step 3 the cards stand where the layout engine puts them (TALA's layout, the
best of its three seeds). "Online Shop" and "Billing", which share three connections, are 160
high; "Warehouse" and "Mail Service" keep their size. No two cards are closer than 20 px, and
every connector runs at right angles. Undo puts every card back where it was, at its old size;
redo arranges it again; both times the cards glide and the diagram is busy meanwhile.
Arranging is one change in the history.

## J33 Select several cards and arrange only them

Test: `apps/web/e2e/j33-arrange-the-selection.spec.ts`

1. Open the app and add the software systems "Online Shop", "Billing", "Warehouse" and
   "Mail Service".
2. Connect "Online Shop" to "Billing" with the labels "Pays" and "Asks for refunds", and
   "Billing" to "Online Shop" with "Confirms payments". Connect "Warehouse" to "Mail Service"
   with "Notifies through".
3. Click "Online Shop", then click "Billing" with Ctrl held (Cmd on a Mac).
4. Press "Arrange".
5. Open the history, then undo.
6. With Shift held, draw a frame around "Warehouse" and "Mail Service" on the canvas.
7. Press Delete.

Expected: after step 3 both cards are selected and the Arrange button says "Arrange the 2
selected cards". After step 4 only those two are arranged (they are 160 high); "Warehouse" and
"Mail Service" stand where they stood, and no two cards are closer than 20 px: the arranged
group moves aside as one when a card that stays is in its way. In step 5 the change log says
"Arranged 2 objects", and undo puts both cards back. After step 6 the two cards in the frame
are selected; after step 7 they are gone and the other two are still there. With fewer than two
cards selected, "Arrange" lays out the whole diagram (J32).

## J34 Quick menu on the canvas

Test: `apps/web/e2e/j34-quick-menu.spec.ts`

1. Open the app and right-click the empty canvas.
2. Press Escape, then right-click the same point again.
3. Pick "Add Software System", type "Online Shop" and press Enter.
4. In a fresh app: add the software systems "Online Shop" and "Billing" with "Add shape", then
   press Delete.

Expected: the form of step 3 floats where the ring was, not in the toolbar. In step 1 a round menu opens around the pointer with what the toolbar adds on this
diagram: "Add Box", "Add Person", "Add Software System" and "Add existing object" (not available while the
model has no object to add). Escape closes it and adds nothing. After step 3 "Online Shop" lies
on the point that was clicked (its middle there, on the grid, moved to the nearest free place if
a card is in the way). In step 4 Delete removes "Billing" only: a card that was just added is
the selected one.

## J35 Keyboard shortcuts

Test: `apps/web/e2e/j35-keyboard-shortcuts.spec.ts`

1. Open the app, add the software systems "Online Shop" and "Billing" and connect them.
2. Press "Keyboard shortcuts" in the panel at the bottom right, then Escape.
3. Click the empty canvas and press A.
4. Add a software system and type "aa" as its name.

Expected: in step 2 a legend lists what the keys do: Arrange (A), Undo, Redo, Delete the
selection, Add to the selection, Select with a frame, Quick menu. Escape closes it. In step 3
the diagram is arranged, as by the Arrange button (busy, then at rest). In step 4 the letters
go into the name and nothing is arranged.

## J36 An icon on a card

Test: `apps/web/e2e/j36-icons-on-cards.spec.ts`

1. Open the app and add the software system "Orders".
2. Select the card and press "Icons" on it.
3. Type "postgres", point at "PostgreSQL" and press it; press Escape.
4. Open the icons again, type "api gateway" and press "Amazon API Gateway"; press Escape.
5. Undo. Open the icons again and press "PostgreSQL".
6. On another card choose the set "Cloudflare", type "r2" and press "Cloudflare R2"; look for
   "d1", "durable", "kv" and "queues".

Expected: the picker finds icons by a part of their name in every set (brands and tools, AWS,
Azure, Google Cloud, Kubernetes, Cloudflare) and says where the icons come from and that names
and logos are trademarks of their owners. Cloudflare's products have a set of their own, from
Cloudflare's documentation under CC BY 4.0 (`docs/icon-licences.md`); with a set chosen the
name under an icon leaves the set's name out ("R2"). Every icon has its name under it; under the pointer its whole
name, its set and its licence are spelled out. After step 3 the card shows the icon inside it,
left of its name. A card carries one icon: after step 4 "Amazon API Gateway" stands in the
place of "PostgreSQL". Each press is one change: undo brings "PostgreSQL" back, and pressing
the attached icon in the picker takes it off. The icon is on the object, so every diagram that
shows it shows it.

## J37 Edit what is there

Test: `apps/web/e2e/j37-edit-what-is-there.spec.ts`

1. Open the app, add the software systems "Online Shop" and "Billing" and connect them with
   "Pays".
2. Select "Online Shop" and press "Edit" in its top right corner. Change the name to "Web Shop", the
   description to "Sells books to customers", tick "External" and press "Save".
3. Undo, then redo.
4. Double-click the connector's label "Pays", type "Charges" and the technology "HTTPS", press
   Enter.
5. Double-click the label again and press "Delete relationship". Undo.

Expected: the form of step 2 opens at the card with what the card says now, and saving is one
change: the card shows the new name, the description and "External"; undo brings the old card
back whole. After step 4 the connector says "Charges [HTTPS]". Step 5 deletes the connector and
leaves both cards; undo brings it back. A connector that stands for connections inside its
cards (a thick one) is changed on the diagram those are on.

## J38 How a card is laid out

Test: `apps/web/e2e/j38-card-layout.spec.ts`

1. Open the app and add the software system "Online Shop" with the description "Sells books to
   customers".
2. Attach the icon "PostgreSQL" to it.
3. Add the external software system "Payment Provider" and the person "Customer".
4. In a fresh app: open "Online Shop" and add the container "Web App"
   with the technology "Vue 3".

Expected: the name of a card is in the middle, the
description under it, and the last line says the type: "Software system", "External system",
"Person", "Container: Vue 3". The kind is not written a second time at the top. The button that
opens the next diagram is in the top left corner. An icon stands left of the name, on its line,
inside the card. A person has a figure on the top border of the card; other kinds have none.

## J39 The opened object is a frame around what is inside it

Test: `apps/web/e2e/j39-boundary-of-the-opened-object.spec.ts`

1. Open the app, add the software system "Online Shop" and open it.
2. Add the containers "Web App" and "Database" and connect "Database" to "Web App" with a
   long label.
3. Drag "Database" to below "Web App".
4. Open "Web App".

Expected: the Overview shows "Online Shop" as a card and has no
frame. On the diagram inside it the system is a frame with its name and "[Software System]" on
it, there before anything is inside (C4's boundary). Both containers stand inside it, and the
frame goes with them when one is moved; the connector between them and its label, which then
lies beside the line and further out than the cards, are inside the frame too. The frame is
quiet: a shade of the canvas with a grey dashed border. Inside "Web App" the frame is "Web App",
"[Container]". A card of another object that was added to the diagram is not what the frame
goes around.

## J40 What an object is connected to stands at its frame

Test: `apps/web/e2e/j40-neighbours-at-the-frame.spec.ts`

1. Open the app. Add the person "Customer" and the software systems "Online Shop" and
   "Payments". Connect "Customer" to "Online Shop" with "Buys from" and "Online Shop" to
   "Payments" with "Charges through".
2. Open "Online Shop" and add the container "Web App".
3. Go back to the Overview and open "Online Shop" again.
4. Connect "Customer" to "Web App" with "Shops in".
5. Connect "Web App" to "Payments" with "Pays with".

Expected: the diagram inside "Online Shop" also shows "Customer" and "Payments", as cards outside the
frame: who points at the system above its cards, what it points at below. Their connections,
made a level up, are the system's own: each runs between the card and the frame, with its
label, in red, and the key says "Not yet to a part". After step 3 the whole diagram is on screen, the cards above the frame too. After step 4
the connection of "Customer" is said for a card inside, so the connector from "Customer" to
the frame is gone; the one to "Payments" stays until step 5, after which nothing is red and the
key drops the line. A neighbour that is a part of another
box stands there as it is. "Arrange" on such a diagram lays out the cards
inside the frame and leaves the neighbours around it.

## J41 Add a shape from a library

Test: `apps/web/e2e/j41-add-a-shape.spec.ts`

1. Open the app and press "Add shape" in the toolbar.
2. Look at the tabs, then at the "C4" tab.
3. From "Basic", add a "Box" "Idea" with the description "Something to try".
4. From "C4", add a software system "Online Shop" and connect "Idea" to it ("Shapes").
5. Open "Online Shop" and look at the "C4" tab there.
6. Add a "Box" "Notes" there, then go back to the Overview.

Expected: the start diagram is titled "Overview". The tabs are "Basic", "C4" and "Code" (J46); C4 offers
"Add Person", "Add Software System", "Add Container" and "Add Component", on every diagram
alike. The box shows its name and description and no kind line; it has an "Open" button like
every box, and the key lists "Box". The software system says "Software system" on its last line; the connector is
drawn. "Notes" belongs to "Online Shop": it stands inside the frame, and not on the Overview.

The picker has a search over every library: a part of a shape's name, of what it is for or of
its library finds it, names first ("contain" finds "Container"); a language is found by what it
has, as that ("trait" finds "Rust trait", and the form opens for a Rust trait). Enter takes the
first shape found; "No shape found." says so; the search emptied, the libraries are back.

## J42 Around its frame, the opened object is a card of its own

Test: `apps/web/e2e/j42-the-frame-is-a-card.spec.ts`

1. On the Overview add "Customer", "Online Shop", "Payments" and "Mail Service", with
   "Customer" to "Online Shop" ("Buys from"), "Online Shop" to "Payments" ("Charges through")
   and to "Mail Service" ("Sends e-mail with").
2. Open "Online Shop" and add "Web App" and "API", connected
   ("Calls").
3. Press Arrange.
4. Drag "Customer" onto the middle of the frame.

Expected: the connectors to the frame are laid by the layout engine as for cards: at right
angles, through no card, each label beside the lines and on no card. Arrange lays out the cards
inside first, then the frame, as one card with them in it, among its neighbours: no neighbour
lies on the frame, "Web App" and "API" stay inside it, and the connectors stay as above. The
dropped "Customer" lands beside the frame, not on it. The other way round too (second test of
the file): a card inside the frame cannot be dragged so near a card outside that the frame,
which reaches further than its cards, would lie on that card; it lands at the nearest place
where the frame keeps the gap. A frame that holds nothing yet (third test: six neighbours, no
part) stays where its first card will stand, and Arrange lays the neighbours around it, none on
it; the first part then lands in the frame. A card outside that connects to a card inside
(fourth test) is put at the side of the frame nearest to that card, level with it, so its
connector is short; cards that want the same place stand beside each other in the order of
their cards. A card that connects to the frame only keeps the side the engine gave it.

## J43 Clear the workspace

Test: `apps/web/e2e/j43-clear-the-workspace.spec.ts`

1. Open the app, add the software systems "Online Shop" and "Billing", connect them and open
   "Online Shop".
2. Press "Clear workspace" in the top bar, then "Cancel".
3. Press "Clear workspace" again, then "Clear everything".
4. Reload the page and add the software system "Fresh Start".

Expected: with nothing in the workspace the button is not available. In step 2 the app asks
first and says that every diagram, object and connection of the workspace goes, the change
log too, and that this cannot be undone; "Cancel" changes nothing. After step 3 the workspace is
as on the first day: on its first diagram, empty, with "Load an example" offered and nothing to
undo. It stays empty after a reload, and works on: a new card can be added. The workspace
itself stays, with its name; a new one is begun in the workspace menu (J58).

## J44 Markdown on a card

Test: `apps/web/e2e/j44-markdown-on-cards.spec.ts`

1. Open the app and add a box "Plain" with the description "Just a sentence.".
2. Add a box "Notes" whose description is Markdown: a heading, bold and slanted words, a task
   list with one task done, a piece of code, a link and a table.
3. Double-click the text of "Plain". Select it, press "Bold" and "List" above the field, then
   type another text and press Ctrl or Cmd with Enter. Double-click it again, type, press Escape.
4. Double-click the name of "Plain"; press Escape. Add a box "Bare", zoom out twice, double-click
   "Bare" below its name and write a list.
5. Add a box "Unsafe" whose description is HTML with a script in it.
6. Edit "Notes": make the description one short line. Then undo.

Expected: the card of "Notes" shows the Markdown rendered: the heading, the bold and the slanted
word, two tasks with their boxes (one ticked), the code in a fixed-width font, the link (it opens
in another tab) and the table; none of the marks (`#`, `**`) show. The card is as tall as the
text needs, with all of it inside, down to the table; "Plain" keeps the usual size, and the two
keep their gap. A double-click on a card's text, or anywhere on the card but its name, opens
the text right there as it was written, in a field with buttons for the usual marks (bold,
italic, strikethrough, heading, the three lists, quote, code, link): a button puts its marks
around the selection and leaves the cursor in the field. Ctrl or Cmd with Enter, or leaving the
field, saves; Escape does not. The field is as large on the screen however far the diagram is
zoomed out. A double-click on the name still renames. "Unsafe" shows its HTML as text and runs
nothing. After the edit "Notes" is as
small as the others again; undo brings the text and the size back together. The description
field takes several lines; Ctrl or Cmd with Enter saves.

## J45 Minimap

Test: `apps/web/e2e/j45-minimap.spec.ts`

1. Open the app and add the software systems "Online Shop" and "Billing".
2. Drag inside the minimap.
3. Connect "Online Shop" to "Billing", open "Online Shop" and add the containers "Web App" and
   "API".
4. Open the history, then close it.

Expected: an empty diagram has no minimap. With cards on it, the minimap stands in the top right
corner of the canvas and shows the whole diagram small, the part on screen marked. Dragging in
it moves the view: the cards go to another place on the screen. Inside a box the minimap also shows its frame:
around the cards that are its parts ("Web App"), not around a neighbour ("Billing"), and wider
when a second part stands beside the first. While the history is open, which
takes the same corner, the minimap is away; it is back when the history closes. A card never
lies under the minimap after it was added: the view fits itself instead.

## J46 Code elements

Test: `apps/web/e2e/j46-code-elements.spec.ts`

1. Open the app, press "Add shape" and look at the "Code" tab.
2. Pick "Go". Choose "struct", name it "Order" and write two fields, a line `---` and two methods.
3. Add a "Rust" shape, choose "trait" and name it "Repository".
4. Edit "Order": language "C++", "template". Edit "Repository": language "Other", "Zig comptime
   fn".
5. Open "Order".

Expected: the Code library has a shape per language (Go, Python, Rust, C++, TypeScript, Java,
SQL and more, and "Other"). The form offers what that language has (Go: struct, interface, func,
package; no class) and another list when the language is changed. The card says both on its last
line ("Go struct"), shows the language's icon by itself (Rust's logo has no open licence, so
none there), and its text reads like a class box: fixed-width, from the left, with a line where
`---` stands. The card looks like one too, as the class boxes on c4model.com/diagrams/code:
square corners; over the name what it is, in guillemets («Go struct»); beside the name a round
badge with its letter ("S" for a struct, "T" for a trait); the name of what only says what others
have to do (interface, trait, protocol) is slanted; under a line the members. Other cards keep
their round corners. "Other" takes any words. The key lists "Code". A code element is a box like the
others: it opens, and code goes inside code.

## J47 Copy a shape

Test: `apps/web/e2e/j47-copy-a-shape.spec.ts`

1. Open the app and add the container "API" with the technology "Go" and a description.
2. Select "API" and press "Copy" on its corner. Rename the copy.
3. On another diagram, add "Online Shop" and "Customer", select both and press Ctrl or Cmd with D.
4. Press Delete, then undo twice.

Expected: the copy is a card of its own beside the first, on a free place, called "API copy",
with the same kind, technology, text, icon and size; it is another object, so renaming it leaves
"API" alone. The change log says `Copied "API"`. The box alone is copied: not its parts, its
connections or the diagram inside it. Ctrl or Cmd with D copies every selected card in one change
(one undo takes all copies back) and the copies are the selection afterwards.

## J48 Add any existing object

Test: `apps/web/e2e/j48-add-any-existing-object.spec.ts`

1. Open the app and add the software systems "Online Shop" and "Payments". Inside "Online Shop"
   add the container "Web App", inside "Web App" the component "Cart".
2. On the Overview press "Add existing object" and pick "Cart".
3. Open "Payments" and press "Add existing object".
4. Open "Online Shop", press "Add existing object" and pick "Cart". Rename it to "Basket".
5. Go back to the Overview and reload the page.

Expected: the list offers every object that is not on the diagram yet, from any depth, each under
where it is from: "Overview", "Inside Online Shop", "Inside Online Shop › Web App", the Overview
first. On the Overview that is "Web App" and "Cart"; inside "Payments" also "Online Shop"; inside
"Online Shop" it is "Payments" and "Cart", never "Online Shop" itself. A picked object is a card
on that diagram, the same object as everywhere else: renamed here, it is renamed on the Overview.
After a reload every diagram is as it was.

## J49 No connection between two cards outside the frame

Test: `apps/web/e2e/j49-no-connection-outside-the-frame.spec.ts`

1. Open the app and add "Online Shop", the person "Customer" and "Payments".
2. Open "Online Shop", add the containers "Web App" and "API" and the existing objects
   "Customer" and "Payments".
3. Drag from the handle of "Customer" to "Payments".
4. Connect "Web App" to "API", "Customer" to "Web App" and "API" to "Payments".
5. Go back to the Overview and connect "Customer" to "Payments".

Expected: step 3 draws no line and asks for no label; an error card (J50) says "Cards outside
the frame are connected on a diagram they are on, not here." and goes with the next change. Inside the frame
and across it, either way round, cards connect as ever. On the Overview the two connect.

## J50 What went wrong is said on a card

Test: `apps/web/e2e/j50-error-cards.spec.ts`

1. Open the app, build the diagram of J49 and drag from "Customer" to "Payments" inside
   "Online Shop": a connection the editor refuses.
2. Do the same again.
3. Press "Close" on the card.
4. Drag again, then connect "Customer" to "Web App".
5. Drag again and wait.

Expected: the refusal is said on a card in the top right corner, under the bar, over the page.
The same again is no second card. "Close" takes the card away; so does the next change to the
diagram; and left alone it goes by itself after 8 seconds. Every error of the editor is shown
this way: "Arrange" that found no layout, an export that made no file.

## J51 Several views of one box

Test: `apps/web/e2e/j51-several-views.spec.ts`

1. Open the app, add "Online Shop", open it and add the containers "Web App" and "API",
   connected with "Calls".
2. Press "New view" beside the title, name it "Deployment" and add it.
3. On "Deployment" add the container "Queue" and move "Web App". Go to "Structure" and back.
4. Add a view "Flow" without the cards of this view. Rename it to "Checkout flow" with a
   double-click on its tab, delete it with the button in its tab, and undo.
7. Add two views to a box and go from tab to tab.
5. Go to the Overview, open "Online Shop", reload the page.
6. On the Overview add a view "Team map" without cards, add the existing "Online Shop" to it;
   add a person on the first view.

Expected: every box, and the Overview, starts with one view, "Structure". An added view has a
name, a tab and an address of its own (`/view/view-1`); its title is "Online Shop: Deployment".
Started with the cards of the view it was made from, it shows them where they stood, with their
connections and the frame. Each view keeps its own cards and places: "Queue" is a part of
"Online Shop" but stands on "Deployment" only (the other views are offered it as an existing
object), and "Web App" moved there stays where it was on "Structure". Nothing comes onto an added
view by itself, on the Overview either. An added view is renamed and deleted; the first view is
neither. A deleted view leaves for the first view and one undo brings it back. Opening a box
leads to its first view. The views are kept over a reload. Going from tab to tab moves no tab
and no button: the title beside them names the box only, and every added tab has its own delete
button.

## J52 Frames that hold cards

Test: `apps/web/e2e/j52-groups.spec.ts`

1. Open the app, add "Netbank", open it, add three containers and a view "Deployment".
2. Select "Netbank BE", press "Group", name the frame and say what it is.
3. Group two other cards as "prod-data"; move one of them.
4. Select "Netbank BE", press "Group" and choose "prod-data"; then "Ungroup" it.
5. Press the name of a frame; double-click it, rename it, reload, delete the group, undo.

Expected: the selected cards stand in a dashed frame with its name and, in brackets, what it
is ("[Deployment Node: Azure App Service]"). The frame is around its cards only and goes with a
card that is moved. Frames belong to the view: the other views of the box have none. A card
stands in one frame at most; a frame goes with its last card. A press on a frame's name selects
its cards; a double-click changes the name, what it is, or deletes the frame (the cards stay),
and the × on the frame deletes it at once. Inside a box only its own cards are grouped: a card
from outside its frame is left out, and alone it cannot be grouped (Ctrl or Cmd with G says why).
The key lists "Group". "Arrange" keeps a frame whole: its cards are laid out among themselves,
then the frame is one block among the other cards and frames, so that afterwards every frame
holds its own cards only and no two frames overlap. Not yet: the export knows nothing of
frames, and a card can still be dragged into a frame it is not in.

## J53 A box with a shape

Test: `apps/web/e2e/j53-box-shapes.spec.ts`

1. Open the app, press "Add shape", search for "database" and pick "Database". Name it
   "Orders DB".
2. Add the container "Events", open its form and choose the shape "Queue".
3. Open the form of "Orders DB" and choose "Rectangle".
4. Start adding a person.
5. Connect the two, copy "Events", reload.
6. Look at the Flowchart library; add "Documents" by search and "Text" from Basic; change the
   text to "Comment" in its form; reload.
7. Import a flowchart that names shapes (`a@{ shape: lin-cyl }`, `c[/Priority\]`).

Expected: the Basic library offers the plain box and seventeen shapes that say what a box is:
Database (a cylinder), Queue (a lying cylinder), Document, Hexagon, Decision (a diamond), Circle,
Pill, Input or output (a slanted box), Cloud, Subroutine, D2's Page, Folder, Step, Callout,
Stored data and Text, and the Table (J56). The Flowchart library has the thirty others a Mermaid flowchart knows
(trapezoids, piles of documents and boxes, a disk, a display, comments beside a brace, a browser
window, a data store). The search finds them all, and a box's form lists them in the two groups.
A text has no outline until it is selected, a comment has a brace only, a data store a line
above and below. A flowchart's shapes come along on import, written with brackets or by any of
Mermaid's names; a shape that is a sign without room for a name (an hourglass, a bolt, a bar)
and a name nobody knows give a plain box, a `person` a person. The card is drawn
as that outline, without a border or ground of its own, and its text keeps clear of the outline.
Any box says its shape in its form, a C4 container too, and stays what it is ("Container");
"Rectangle" gives the plain card back. A person and a piece of code have no shape to choose. A
box with a shape connects, is copied and is kept like any other. The SVG and PNG export draw the
outline; D2 writes it where D2 has the shape; a Mermaid flowchart's node shapes are kept on
import (`[(orders DB)]` is a cylinder).

## J54 Choose a theme

Test: `apps/web/e2e/j54-themes.spec.ts`

1. Open the app, add a box and press "Theme" in the top bar.
2. Choose "Solarized Dark", reload the page.
3. Choose "Solarized Light", then "Dark", then "Light".

Expected: the menu lists Light, Dark, Solarized Light and Solarized Dark, each with a swatch,
the one in use ticked. A theme applies at once, to the top bar, the canvas and the cards
(Solarized Dark: base03 under the app, cards on base02; Solarized Light: base3), and is kept
over a reload. Solarized Dark is a dark theme for everything that follows the dark theme.

## J55 A connection with a colour

Test: `apps/web/e2e/j55-connection-colours.spec.ts`

1. Open the app, add "Shop" and "Billing", connect them with "Calls".
2. Double-click the label, press "Orange" among the colours, then "Blue". Close the form.
3. Undo, redo, give the connection another label, reload.
4. Open the form again and press "No colour".
5. Import a flowchart whose arrows have a `linkStyle` with a stroke.

Expected: the form of a connection has a row of colours under its fields: none and eight
(red, orange, yellow, green, teal, blue, purple, pink), the one in use marked. A press colours
the line and its arrowhead at once and the form stays open; each press is one change. The colour
is a name, drawn in the theme's own tone of it; the label keeps its usual colour. It is kept
over a reload and through a new label; "No colour" gives the usual grey back. The SVG and PNG
export draw it; D2 writes it as the line's stroke and reads any stroke as the nearest colour. A
flowchart's arrows come with the colour their `linkStyle` gives them, as the nearest of the
eight (a grey is none); the same arrow drawn twice in two colours is two connections. Not yet:
the line one level up (it has no colour), dashes and widths, the Mermaid C4 export.

## J56 A database table with its columns

Test: `apps/web/e2e/j56-database-table.spec.ts`

1. Open the app, press "Add shape", search for "table" and pick "Table". Name it "orders".
2. In its form write the column "id", type "uuid", key "PK"; press Enter and type the next,
   "customer_id", "uuid", "FK"; press "Add column" and type "total". Add the table.
3. Double-click its columns, remove "total", add a row and paste four lines of a CREATE TABLE
   into its name. Save.
4. Connect another box to the table, copy the table, reload, undo.
5. Add a table without columns; then give it the shape "Database" in its form.

Expected: a table is a box with the shape "Table". Its form has its columns, a row each: key
(none, PK, FK, UQ), name, type (the usual ones are offered, any can be typed) and a button to
remove it; a row is there to start with, Enter in a row makes the next and puts the cursor
there, Backspace in an empty row takes it away, and every field stays inside the form. Lines
pasted into a name become columns, one per line: the first word the name, what follows the type
up to NOT NULL, DEFAULT and the like, the key from PRIMARY KEY, REFERENCES or UNIQUE; lines that
are no column (CREATE TABLE, a constraint) are left out. The card shows the name over a line and
a row per column: its key, its name (a primary key in bold) and at the right its type; it is as
tall as its rows need. A double-click on the rows opens the form. A table without columns says
how to add them. A table connects, is copied with its columns and is kept; saving its form is
one change. Another shape has no columns: they go with the shape. The SVG and PNG export draw
the rows; D2 writes an `sql_table` with the columns and their constraints. Not yet: a
connection from one column to another, and columns on a code element ("SQL table").


## J57 Sign in and out

Test: `apps/web/e2e/j57-sign-in.spec.ts`

The app is of no use to somebody who is not signed in: the tests of the other journeys start
signed in, each as a user of its own (`e2e/fixtures.ts`). These start signed out.

1. Open the app.
2. Type the e-mail address and a wrong password, and press "Sign in".
3. Type the right password and press Enter.
4. Reload the page.
5. Open "Account" in the top bar and press "Sign out".
6. Open the app again.

Also: open the address of a diagram inside a box while signed out, and sign in. And: open the
sign-in page as single sign-on leaves it when it let nobody in (`/login?error=…`). And: sign
in, choose "Change password" in the account menu, give a wrong current password, then a new one
that is too short, then a good one; sign out and sign in with the old and with the new one.

Expected: step 1 leads to the sign-in page (`/login`), with no editor. Step 2 says beside the
form that the address or the password is wrong, and keeps what was typed. Step 3 opens the
editor on the user's workspace, "My workspace"; step 4 leaves it there. The account menu names
the user and their address. After step 5 the sign-in page is back, and step 6 leads to it again.
Somebody who signs in after asking for an address of the app gets to that address. The sign-in
page shows the reason single sign-on gave, and no button for single sign-on on a server that has
none. A wrong current password and a new one that is too short are said at the form, which
stays; after the change the browser is still signed in, the old password is refused and the new
one lets the user in.

## J58 Several workspaces

Test: `apps/web/e2e/j58-workspaces.spec.ts`

1. Open the app and add a software system "Online Shop".
2. Open the workspace menu in the top bar, press "New workspace", name it "Bookshop".
3. Add a person "Reader" and reload the page.
4. Choose "My workspace" in the menu.
5. Open the app's own address.
6. Rename the workspace to "Shop landscape".

Also: make a workspace, delete it ("Cancel" first), then delete the last one too and make one
on the page that follows. And: open the address of somebody else's workspace.

Expected: the menu's button names the open workspace. A new workspace is empty and open at
once; its address names it, so a reload opens the same one with "Reader". "My workspace" still
has "Online Shop" and no "Reader". The app's own address leads to the workspace that was open
last. The new name is on the button and in the menu. Deleting asks first, names the workspace
and says that this cannot be undone; afterwards another workspace is open, and after the last
one a page that offers to make one ("No workspace yet"). The address of a workspace that is not
shared with the user leads to their own, and a card says that there is no such workspace.

## J59 An admin manages the users

Test: `apps/web/e2e/j59-users.spec.ts`

1. Sign in as the admin and open "Users" in the account menu.
2. Fill "New user" with an address, the name "Grace Hopper" and the password "short"; press
   "Create user". Then give a password of ten characters or more and press it again.
3. In another browser, sign in as Grace. Open the account menu, then the address `/users`.
4. As the admin, press "Disable" in Grace's row. As Grace, reload and try to sign in.
5. As the admin, press "Enable". As Grace, sign in.
6. As the admin, press "Disable" in the admin's own row.

Expected: the page lists the users with their roles. A password that is too short is said at
the form; then the user is in the list and the form is empty again. Grace gets her own
"My workspace"; her account menu has no "Users", and the address of the users leads her to her
diagrams. Disabled, she is out at her next step and the sign-in page refuses her with the same
words as a wrong password; enabled, she is in again. The last admin cannot be disabled: a card
says that the server needs one.

## J60 The same workspace in two browsers

Test: `apps/web/e2e/j60-two-browsers.spec.ts`

A workspace is kept on the server, with its change log.

1. Add "Customer" and "Online Shop", connect them, and undo the connection.
2. Open the app in a second browser as the same user, and redo.
3. Reload the first browser.

Also: with the workspace open in two browsers, add "Billing" in the second, then "Mail" in the
first, then "Mail" in the first again.

Expected: the second browser shows the two cards without the connection, and can redo it: the
change log and the place in it came along. The first browser has the connection after its
reload. A change made in a browser that has not seen what another one did is not kept: the
workspace is shown as it is on the server (with "Billing", without "Mail"), and a card says
that it was changed somewhere else. The next change works as ever. Not yet: seeing each other's
changes without a reload (J19).

## J61 Bring the diagrams of this browser

Test: `apps/web/e2e/j61-bring-the-browsers-diagrams.spec.ts`

Before the app had a server it kept one workspace in the browser. A browser that ran it then
still has it, also under the app's earlier names (`ped.`, `drillplan.`).

1. Open the app in a browser that kept a workspace with the card "Online Shop".
2. Press "Bring the diagrams of this browser" on the empty diagram.
3. Open the history, undo and redo.
4. Open the app in a second browser as the same user.
5. Delete the card and reload.

Expected: a browser that kept nothing is not offered anything. After step 2 the card is there,
with the change that made it in the change log, which undoes and redoes. The second browser
has the card: it is on the server. The offer is made once: after step 5 the empty workspace
offers the example only. What the browser kept stays in it, under the app's name of today.

## J62 The app without a server

Test: `apps/web/e2e/j62-without-a-server.spec.ts`. Project `browser-only` only.

The app can be built to run without a server (`pnpm --filter @drillgram/web build:browser`): the
browser keeps the workspaces and their change logs itself, and the app is files alone.

1. Open the app in a browser that never ran it.
2. Press "Kept in this browser" in the top bar.
3. Add "Customer" and "Online Shop", connect them, and undo the connection. Reload, then redo.
4. Open the addresses `/login` and `/users`.

Also: go offline, reload, add "Billing" and reload again. And with the workspace open in two
tabs, add "Billing" in the second, then "Mail" in the first, then "Mail" in the first again.

Expected: the editor opens on "My workspace" and nobody signs in; there is no account menu.
Where it was, a note says that the diagrams are kept in this browser alone and to export what
is worth keeping. The cards, the change log and the place in it survive the reload. Both
addresses lead to the diagrams. The app asks nothing of `/api`. Offline everything is there
and can be changed. A change made in a tab that has not seen what another one did is not kept,
as between two browsers of a server (J60); the next change works as ever.
