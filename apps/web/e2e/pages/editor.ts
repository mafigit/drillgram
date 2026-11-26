import { expect } from '@playwright/test'
import type { Download, Locator, Page } from '@playwright/test'

// Page object for the diagram editor, so journey tests read like the steps a user takes.
// Selector convention (docs/agents/testing.md): role and accessible name first; `data-testid`
// only for canvas elements that have no accessible name.
// The editor features do not exist yet: each feature issue adjusts the helper it needs while
// turning its journey into a real test.

export type ElementKind = 'Box' | 'Person' | 'Software System' | 'Container' | 'Component'
/** What C4 asks an element to say besides its name. */
export type ElementDetails = { description?: string; technology?: string; external?: boolean }
export type ExportFormat = 'PNG' | 'SVG' | 'Mermaid' | 'D2'
export type DiagramKind = 'System Landscape' | 'Free-form'
export type CommentKind = 'Question' | 'Inaccuracy' | 'Idea'

export class DiagramEditor {
  readonly canvas: Locator
  readonly breadcrumb: Locator
  /** The title of the open diagram: its type and scope. */
  readonly title: Locator
  /** The key (legend) of the open diagram. */
  readonly key: Locator
  /** The button that says which workspace is open, and opens the workspaces. */
  readonly workspace: Locator

  constructor(readonly page: Page) {
    this.canvas = page.getByRole('application', { name: 'Diagram canvas' })
    this.breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
    this.title = page.getByRole('heading', { level: 2 })
    this.key = page.getByRole('list', { name: 'Key' })
    this.workspace = page.getByRole('button', { name: /^Workspace: / })
  }

  async open(): Promise<void> {
    await this.page.goto('/')
  }

  /** The card of the tour (J63): what a step says, and its buttons. */
  get tour(): Locator {
    return this.page.getByRole('dialog', { name: 'Tour' })
  }

  /** The name of the tour's step that is shown. */
  get tourStep(): Locator {
    return this.tour.getByRole('heading')
  }

  /** Press a button of the tour's card: "Next", "Back", "Start the tour". */
  async tourPress(name: string): Promise<void> {
    await this.tour.getByRole('button', { name, exact: true }).click()
  }

  /**
   * Whether the tour's light is on something: its frame is around every one of them, close,
   * and all of it is on the screen.
   */
  async expectTourPointsAt(...targets: Locator[]): Promise<void> {
    const spotlight = this.page.getByTestId('tour-spotlight')
    await expect(async () => {
      const light = await spotlight.boundingBox()
      const boxes = await Promise.all(targets.map((target) => target.boundingBox()))
      if (!light || boxes.some((box) => !box)) throw new Error('The light or what it should be on is not there')
      const found = boxes.filter((box) => box !== null)
      const left = Math.min(...found.map((box) => box.x))
      const top = Math.min(...found.map((box) => box.y))
      const right = Math.max(...found.map((box) => box.x + box.width))
      const bottom = Math.max(...found.map((box) => box.y + box.height))
      // The frame leaves a few pixels of air around what it shows.
      const AIR = 12
      for (const [edge, of] of [[left - light.x, 'left'], [top - light.y, 'top'], [light.x + light.width - right, 'right'], [light.y + light.height - bottom, 'bottom']] as const) {
        expect(edge, `the ${of} edge`).toBeGreaterThanOrEqual(0)
        expect(edge, `the ${of} edge`).toBeLessThanOrEqual(AIR)
      }
    }).toPass()
    // The card that speaks is beside it, not on it.
    const [card, light] = [await this.tour.boundingBox(), await spotlight.boundingBox()]
    if (!card || !light) throw new Error('The tour is not there')
    const apart = card.x + card.width <= light.x || card.x >= light.x + light.width || card.y + card.height <= light.y || card.y >= light.y + light.height
    expect(apart, 'the card stands beside what it points at').toBe(true)
  }

  /** Resolve once a service worker is active for this page (production build only). */
  async waitForServiceWorker(): Promise<void> {
    await this.page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
  }

  /** A diagram element on the canvas, by its exact name ("Customer" is not "Customer Accounts"). */
  element(name: string): Locator {
    return this.canvas.getByRole('group', { name, exact: true })
  }

  /** A relationship on the canvas, by its label. */
  relationship(label: string): Locator {
    return this.canvas.getByTestId('relationship').filter({ hasText: label })
  }

  /**
   * Click the empty canvas: takes the focus off any object. In the top right corner, which stays
   * free even after the diagram was zoomed to fit (that leaves a margin all around).
   */
  async clickCanvas(): Promise<void> {
    const box = await this.canvas.boundingBox()
    if (!box) throw new Error('Canvas is not visible')
    await this.canvas.click({ position: { x: box.width - 10, y: 10 } })
  }

  /** Points along a connector's line, a few pixels apart, where they are on the screen. */
  async pointsAlong(connector: Locator): Promise<Point[]> {
    return this.pointsOfPath(connector.locator('path.vue-flow__edge-path'))
  }

  /** Points along an SVG path, a few pixels apart, where they are on the screen. */
  async pointsOfPath(line: Locator): Promise<Point[]> {
    return line.evaluate((path: SVGPathElement) => {
      const toScreen = path.getScreenCTM()!
      const length = path.getTotalLength()
      const points = []
      for (let at = 0; at <= length; at += 3) {
        const p = path.getPointAtLength(at).matrixTransform(toScreen)
        points.push({ x: p.x, y: p.y })
      }
      return points
    })
  }

  /**
   * How many pieces of a connector's line are neither upright nor level. A bend is drawn round:
   * there the two pieces count as they run into the corner.
   */
  async slantedPieces(connector: Locator): Promise<number> {
    const path = await connector.locator('path.vue-flow__edge-path').getAttribute('d')
    // Every command of the path (M, L, Q) takes points: x, then y.
    const numbers = (path?.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number)
    if (numbers.length < 4) throw new Error(`Not a line: ${path}`)
    let slanted = 0
    for (let i = 2; i + 1 < numbers.length; i += 2) {
      const [x, y, nextX, nextY] = [numbers[i - 2]!, numbers[i - 1]!, numbers[i]!, numbers[i + 1]!]
      if (Math.abs(nextX - x) > 0.01 && Math.abs(nextY - y) > 0.01) slanted++
    }
    return slanted
  }

  /**
   * Which labels lie wrong, in words; empty when all is well. A label lies on no card, on no
   * other label and on no connector, its own included.
   */
  async labelsInTheWay(labels: string[], cards: Locator[]): Promise<string[]> {
    type Box = { x: number; y: number; width: number; height: number }
    const overlap = (a: Box, b: Box) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
    const boxOf = async (locator: Locator) => {
      const box = await locator.boundingBox()
      if (!box) throw new Error('Not visible')
      return box
    }
    const found: string[] = []
    const texts = await Promise.all(labels.map((label) => boxOf(this.relationship(label).getByText(label))))
    const cardBoxes = await Promise.all(cards.map(boxOf))
    const lines = await Promise.all(labels.map((label) => this.pointsAlong(this.relationship(label))))
    for (const [i, label] of labels.entries()) {
      const box = texts[i]!
      if (cardBoxes.some((card) => overlap(box, card))) found.push(`"${label}" lies on a card`)
      for (const [j, other] of labels.entries()) {
        if (j > i && overlap(box, texts[j]!)) found.push(`"${label}" lies on the label "${other}"`)
        // A point of a line counts when it is inside the text, a pixel away from its edge.
        const hit = lines[j]!.some(
          (p) => p.x > box.x + 1 && p.x < box.x + box.width - 1 && p.y > box.y + 1 && p.y < box.y + box.height - 1,
        )
        if (hit) found.push(`"${label}" lies on the connector "${other}"`)
      }
    }
    return found
  }

  /** Every relationship or connector on the canvas. */
  get relationships(): Locator {
    return this.canvas.getByTestId('relationship')
  }

  /** Open "Add shape" in the toolbar and pick a shape from its library: Box from Basic, the rest from C4. */
  async pickShape(kind: ElementKind, how: 'click' | 'tap' = 'click'): Promise<void> {
    const press = (locator: Locator) => (how === 'tap' ? locator.tap() : locator.click())
    await press(this.page.getByRole('button', { name: 'Add shape' }))
    await press(this.page.getByRole('tab', { name: kind === 'Box' ? 'Basic' : 'C4' }))
    await press(this.page.getByRole('button', { name: `Add ${kind}`, exact: true }))
  }

  async addElement(kind: ElementKind, name: string, details: ElementDetails = {}): Promise<Locator> {
    await this.pickShape(kind)
    if (details.technology !== undefined) {
      await this.page.getByRole('textbox', { name: 'Technology' }).fill(details.technology)
    }
    if (details.description !== undefined) {
      await this.page.getByRole('textbox', { name: 'Description' }).fill(details.description)
    }
    if (details.external) await this.page.getByRole('checkbox', { name: 'External' }).check()
    await this.page.getByRole('textbox', { name: 'Name' }).fill(name)
    await this.page.keyboard.press('Enter')
    return this.element(name)
  }

  async connect(from: string, to: string, label?: string, technology?: string): Promise<void> {
    await this.element(from).getByTestId('connection-handle').dragTo(this.element(to))
    if (label !== undefined) {
      const labelField = this.page.getByRole('textbox', { name: 'Relationship label' })
      if (technology !== undefined) {
        await this.page.getByRole('textbox', { name: 'Relationship technology' }).fill(technology)
      }
      await labelField.fill(label)
      await this.page.keyboard.press('Enter')
    }
  }

  async rename(from: string, to: string): Promise<void> {
    // On the name: a double-click elsewhere on the card opens its text.
    await this.element(from).getByText(from, { exact: true }).dblclick()
    await this.page.getByRole('textbox', { name: 'Name' }).fill(to)
    await this.page.keyboard.press('Enter')
  }

  async move(name: string, by: { x: number; y: number }): Promise<void> {
    const box = await this.element(name).boundingBox()
    if (!box) throw new Error(`Element "${name}" is not visible`)
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await this.page.mouse.move(start.x, start.y)
    await this.page.mouse.down()
    await this.page.mouse.move(start.x + by.x, start.y + by.y, { steps: 5 })
    await this.page.mouse.up()
  }

  /**
   * Press on the middle of a card and move it by an offset, without letting go. The offset is in
   * pixels of the diagram; `scale` is how many screen pixels one of them takes (on a small screen
   * the diagram is shown smaller). Let go with `page.mouse.up()`.
   */
  async hold(name: string, by: { x: number; y: number }, scale = 1): Promise<void> {
    const box = await this.element(name).boundingBox()
    if (!box) throw new Error(`Element "${name}" is not visible`)
    const grab = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await this.page.mouse.move(grab.x, grab.y)
    await this.page.mouse.down()
    // A drag begins once the pointer has moved more than a pixel, and the card follows from
    // where the pointer is then. A real hand moves a few pixels at a time; a first step of 40 px
    // would leave the card that far behind.
    const length = Math.hypot(by.x, by.y) || 1
    await this.page.mouse.move(grab.x + (3 * by.x) / length, grab.y + (3 * by.y) / length)
    await this.page.mouse.move(grab.x + by.x * scale, grab.y + by.y * scale, { steps: 8 })
  }

  async delete(name: string): Promise<void> {
    await this.element(name).click()
    await this.page.keyboard.press('Delete')
  }

  /** Lay the open diagram out with the layout engine. */
  async arrange(): Promise<void> {
    await this.arrangeButton.click()
  }

  /** The frame around the parts of the object the open diagram is about. */
  get boundary(): Locator {
    return this.canvas.getByTestId('boundary')
  }

  /** The lines of the connectors between a card and the frame, in the order of their labels. */
  get boundaryConnectors(): Locator {
    return this.canvas.getByTestId('boundary-connector')
  }

  /** The connections of the open diagram's object itself: they run between a card and the frame. */
  /** The frames around cards of the open view (groups), in the order they were made. */
  get groups(): Locator {
    return this.canvas.getByTestId('card-group')
  }

  /** The frame with a name: its label is a button with that name. */
  group(name: string): Locator {
    return this.groups.filter({ has: this.page.getByRole('button', { name: `Group ${name}`, exact: true }) })
  }

  /** Select cards and put them in a frame: a new one with this name, or the one that has it. */
  async groupCards(names: string[], name: string, what?: string): Promise<void> {
    await this.element(names[0]!).click()
    for (const other of names.slice(1)) await this.selectAlso(other)
    await this.page.getByRole('button', { name: 'Group', exact: true }).click()
    const form = this.page.getByRole('form', { name: 'Group the selection' })
    await form.getByRole('textbox', { name: 'Name' }).fill(name)
    if (what !== undefined) await form.getByRole('textbox', { name: 'What it is' }).fill(what)
    await form.getByRole('button', { name: 'Group', exact: true }).click()
  }

  /** The tabs of the views of the open box, the first view first. */
  get views(): Locator {
    return this.page.getByRole('tablist', { name: 'Views' }).getByRole('tab')
  }

  /** Add a view of the open box; it opens. `empty`: without the cards of the view it is made from. */
  async addView(name: string, options: { empty?: boolean } = {}): Promise<void> {
    await this.page.getByRole('button', { name: 'New view' }).click()
    const form = this.page.getByRole('form', { name: 'New view' })
    if (options.empty) await form.getByRole('checkbox', { name: 'Start with the cards of this view' }).uncheck()
    await form.getByRole('textbox', { name: 'Name' }).fill(name)
    await form.getByRole('button', { name: 'Add view' }).click()
  }

  /** The error cards in the top right corner, the oldest first. */
  get errors(): Locator {
    return this.page.getByRole('list', { name: 'Errors' }).getByRole('alert')
  }

  get boundaryRelationships(): Locator {
    return this.canvas.getByTestId('boundary-relationship')
  }

  /** Open the form of a card: select it, then press "Edit" on its corner. */
  async openEditForm(name: string): Promise<void> {
    await this.element(name).click()
    await this.element(name).getByRole('button', { name: 'Edit' }).click()
  }

  /**
   * Double-click a connector's label. The text itself lets the pointer through to the box behind
   * it, which belongs to the connector: so the click is aimed at the text without waiting for the
   * text to take it.
   */
  private async dblclickLabel(label: string): Promise<void> {
    await this.relationship(label).getByText(label).dblclick({ force: true })
  }

  /** Open a connector's label with a double-click on it, and give it another one. */
  async relabel(label: string, to: string, technology?: string): Promise<void> {
    await this.dblclickLabel(label)
    const field = this.page.getByRole('textbox', { name: 'Relationship label' })
    await expect(field).toHaveValue(label)
    if (technology !== undefined) {
      await this.page.getByRole('textbox', { name: 'Relationship technology' }).fill(technology)
    }
    await field.fill(to)
    await this.page.keyboard.press('Enter')
  }

  /** Open a connector's label with a double-click on it, and delete the connector. */
  async deleteRelationship(label: string): Promise<void> {
    await this.dblclickLabel(label)
    await this.page.getByRole('button', { name: 'Delete relationship' }).click()
  }

  /** Open the icons of a card: select it, then press the button on its corner. */
  async openIconPicker(name: string): Promise<void> {
    await this.element(name).click()
    await this.element(name).getByRole('button', { name: 'Icons' }).click()
  }

  /** The panel icons are picked from. */
  get iconPicker(): Locator {
    return this.page.getByRole('dialog', { name: 'Icons' })
  }

  /** A point on the canvas, as parts of its width and height (0.5, 0.5 is the middle). */
  async canvasPoint(across: number, down: number): Promise<Point> {
    const box = await this.canvas.boundingBox()
    if (!box) throw new Error('Canvas is not visible')
    return { x: Math.round(box.x + box.width * across), y: Math.round(box.y + box.height * down) }
  }

  /** Right-click the canvas at a point of the screen: opens the quick menu around it. */
  async openQuickMenu(at: Point): Promise<void> {
    await this.page.mouse.click(at.x, at.y, { button: 'right' })
  }

  /** The round menu a right-click on the empty canvas opens. */
  get quickMenu(): Locator {
    return this.page.getByRole('menu', { name: 'Quick menu' })
  }

  /** Add a card to the selection: a click with Ctrl held (Cmd on a Mac). */
  async selectAlso(name: string): Promise<void> {
    await this.element(name).click({ modifiers: ['ControlOrMeta'] })
  }

  /** Select cards by drawing a frame around them on the canvas, with Shift held. */
  async selectFrame(names: string[]): Promise<void> {
    const boxes = await Promise.all(names.map((name) => this.element(name).boundingBox()))
    const found = boxes.filter((box) => box !== null)
    if (found.length !== names.length) throw new Error('Not every card is visible')
    const MARGIN = 8
    const left = Math.min(...found.map((box) => box.x)) - MARGIN
    const top = Math.min(...found.map((box) => box.y)) - MARGIN
    const right = Math.max(...found.map((box) => box.x + box.width)) + MARGIN
    const bottom = Math.max(...found.map((box) => box.y + box.height)) + MARGIN
    await this.page.keyboard.down('Shift')
    await this.page.mouse.move(left, top)
    await this.page.mouse.down()
    await this.page.mouse.move(right, bottom, { steps: 8 })
    await this.page.mouse.up()
    await this.page.keyboard.up('Shift')
  }

  get arrangeButton(): Locator {
    return this.page.getByRole('button', { name: 'Arrange' })
  }

  /**
   * Every value an attribute of the element takes from now on, in order. The browser notes a
   * value only when the page had the time to show it: a value set and taken back in one go, with
   * the page standing still in between, is never seen.
   */
  async recordAttribute(locator: Locator, name: string): Promise<() => Promise<(string | null)[]>> {
    const seen = await locator.evaluateHandle((element, attribute) => {
      const values: (string | null)[] = []
      new MutationObserver(() => values.push(element.getAttribute(attribute))).observe(element, {
        attributes: true,
        attributeFilter: [attribute],
      })
      return values
    }, name)
    return () => seen.jsonValue()
  }

  async undo(): Promise<void> {
    await this.page.getByRole('button', { name: 'Undo' }).click()
  }

  async redo(): Promise<void> {
    await this.page.getByRole('button', { name: 'Redo' }).click()
  }

  /** Show the history: the timeline and the change log. */
  async openHistory(): Promise<void> {
    await this.page.getByRole('button', { name: 'History' }).click()
  }

  /** The entries of the change log, oldest first. */
  get changes(): Locator {
    return this.page.getByRole('list', { name: 'Change log' }).getByRole('listitem')
  }

  get timeline(): Locator {
    return this.page.getByRole('slider', { name: 'Timeline' })
  }

  /**
   * Drag the timeline's handle to after the change with this number (0: before the first one),
   * without letting go. Let go with `page.mouse.up()`.
   */
  async holdTimelineAt(position: number): Promise<void> {
    const box = await this.timeline.boundingBox()
    if (!box) throw new Error('The timeline is not visible')
    const last = Number(await this.timeline.getAttribute('max'))
    const now = Number(await this.timeline.inputValue())
    // The handle of a range input is about 16 px wide and stays inside the track.
    const HANDLE = 16
    const x = (value: number) => box.x + HANDLE / 2 + (value / last) * (box.width - HANDLE)
    const y = box.y + box.height / 2
    await this.page.mouse.move(x(now), y)
    await this.page.mouse.down()
    await this.page.mouse.move(x(position), y, { steps: 5 })
  }

  /**
   * Zoom into an element: a software system opens its System Context diagram, and from there its
   * Container diagram; a container opens its Component diagram.
   */
  async drillDown(name: string): Promise<void> {
    await this.element(name).getByRole('button', { name: 'Open' }).click()
  }

  /** Go back up by clicking a breadcrumb entry: "Overview", a system's name or "Containers". */
  async backTo(level: string): Promise<void> {
    await this.breadcrumb.getByRole('link', { name: level }).click()
  }

  /** The header button that opens the export menu. */
  get exportButton(): Locator {
    return this.page.getByRole('button', { name: 'Export', exact: true })
  }

  async exportAs(format: ExportFormat): Promise<Download> {
    await this.exportButton.click()
    const download = this.page.waitForEvent('download')
    await this.page.getByRole('menuitem', { name: format }).click()
    return download
  }

  // Helpers for journeys J9 to J18. Their features do not exist yet (see the note at the top).

  /** Ctrl + wheel over the canvas centre; a negative delta zooms in. Desktop only. */
  async zoomWithWheel(deltaY: number): Promise<void> {
    const mid = await centre(this.canvas)
    await this.page.mouse.move(mid.x, mid.y)
    await this.page.keyboard.down('Control')
    await this.page.mouse.wheel(0, deltaY)
    await this.page.keyboard.up('Control')
  }

  /** Drag the empty canvas, starting at the middle of its right edge. */
  async pan(by: Point): Promise<void> {
    const box = await this.canvas.boundingBox()
    if (!box) throw new Error('Canvas is not visible')
    const start = { x: box.x + box.width - 20, y: box.y + box.height / 2 }
    await this.page.mouse.move(start.x, start.y)
    await this.page.mouse.down()
    await this.page.mouse.move(start.x + by.x, start.y + by.y, { steps: 5 })
    await this.page.mouse.up()
  }

  async fitToScreen(): Promise<void> {
    await this.page.getByRole('button', { name: 'Fit to screen' }).click()
  }

  async newDiagram(kind: DiagramKind, name: string): Promise<void> {
    await this.page.getByRole('button', { name: 'New diagram' }).click()
    await this.page.getByRole('menuitem', { name: kind }).click()
    await this.page.getByRole('textbox', { name: 'Diagram name' }).fill(name)
    await this.page.keyboard.press('Enter')
  }

  async openDiagram(name: string): Promise<void> {
    await this.page.getByRole('navigation', { name: 'Diagrams' }).getByRole('link', { name }).click()
  }

  /** Place an object that is already in the model on the open diagram. */
  async addExisting(name: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Add existing object' }).click()
    await this.page.getByRole('option', { name }).click()
  }

  /** Open the command palette, search and open the first result. */
  async searchAndOpen(text: string): Promise<void> {
    await this.page.keyboard.press('ControlOrMeta+k')
    await this.page.getByRole('combobox', { name: 'Search' }).fill(text)
    await this.page.keyboard.press('Enter')
  }

  /** Give an element a tag, creating the tag and its group. */
  async tag(element: string, group: string, tag: string): Promise<void> {
    await this.element(element).click()
    await this.page.getByRole('button', { name: 'Add tag' }).click()
    await this.page.getByRole('textbox', { name: 'Tag group' }).fill(group)
    await this.page.getByRole('textbox', { name: 'Tag name' }).fill(tag)
    await this.page.keyboard.press('Enter')
  }

  /** Switch the focus on a tag, or hiding it, on or off. */
  async toggleTag(action: 'Focus' | 'Hide', tag: string): Promise<void> {
    await this.page.getByRole('button', { name: `${action} ${tag}` }).click()
  }

  async newFlow(name: string): Promise<void> {
    await this.page.getByRole('button', { name: 'New flow' }).click()
    await this.page.getByRole('textbox', { name: 'Flow name' }).fill(name)
    await this.page.keyboard.press('Enter')
  }

  /** Add a message step along a relationship. */
  async addFlowStep(relationshipLabel: string, title: string): Promise<void> {
    await this.relationship(relationshipLabel).click()
    await this.page.getByRole('button', { name: 'Add step' }).click()
    await this.page.getByRole('textbox', { name: 'Step title' }).fill(title)
    await this.page.keyboard.press('Enter')
  }

  async exportFlowAs(format: 'Mermaid'): Promise<Download> {
    await this.page.getByRole('button', { name: 'Export flow' }).click()
    const download = this.page.waitForEvent('download')
    await this.page.getByRole('menuitem', { name: format }).click()
    return download
  }

  /** Add a shape from a shape library to a free-form diagram. */
  async addShape(library: string, shape: string, text: string): Promise<Locator> {
    await this.page.getByRole('button', { name: 'Add shape' }).click()
    await this.page.getByRole('tab', { name: library }).click()
    await this.page.getByRole('button', { name: `Add ${shape}` }).click()
    await this.page.getByRole('textbox', { name: 'Name' }).fill(text)
    await this.page.keyboard.press('Enter')
    return this.element(text)
  }

  async importMermaid(text: string): Promise<void> {
    await this.importDiagram('Mermaid', text)
  }

  /** Paste a diagram written as text into the import dialog and bring it onto the open diagram. */
  async importDiagram(format: 'Mermaid' | 'D2', text: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Import', exact: true }).click()
    await this.page.getByRole('menuitem', { name: format }).click()
    await this.page.getByRole('textbox', { name: format, exact: true }).fill(text)
    await this.page.getByRole('button', { name: 'Import diagram' }).click()
    await expect(this.page.getByRole('dialog')).toHaveCount(0)
  }

  async startDraft(name: string): Promise<void> {
    await this.page.getByRole('button', { name: 'New draft' }).click()
    await this.page.getByRole('textbox', { name: 'Draft name' }).fill(name)
    await this.page.keyboard.press('Enter')
  }

  async mergeDraft(name: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Drafts' }).click()
    await this.page.getByRole('listitem').filter({ hasText: name }).getByRole('button', { name: 'Merge' }).click()
  }

  async saveVersion(name: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Versions' }).click()
    await this.page.getByRole('button', { name: 'Create version' }).click()
    await this.page.getByRole('textbox', { name: 'Version name' }).fill(name)
    await this.page.keyboard.press('Enter')
  }

  async revertTo(version: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Versions' }).click()
    const item = this.page.getByRole('list', { name: 'Versions' }).getByRole('listitem')
    await item.filter({ hasText: version }).getByRole('button', { name: 'Revert' }).click()
  }

  async comment(element: string, kind: CommentKind, text: string): Promise<void> {
    await this.element(element).click()
    await this.page.getByRole('button', { name: 'New comment' }).click()
    await this.page.getByRole('radio', { name: kind }).check()
    await this.page.getByRole('textbox', { name: 'Comment' }).fill(text)
    await this.page.keyboard.press('ControlOrMeta+Enter')
  }

  /** The link that lets someone else open this workspace. */
  async shareLink(): Promise<string> {
    await this.page.getByRole('button', { name: 'Share' }).click()
    return this.page.getByRole('textbox', { name: 'Share link' }).inputValue()
  }

  // Touch gestures, for the tablet project.

  async tapToAdd(kind: ElementKind, name: string): Promise<Locator> {
    await this.pickShape(kind, 'tap')
    await this.page.getByRole('textbox', { name: 'Name' }).fill(name)
    await this.page.keyboard.press('Enter')
    return this.element(name)
  }

  async dragToConnect(from: string, to: string): Promise<void> {
    const handle = this.element(from).getByTestId('connection-handle')
    const start = await centre(handle)
    const end = await centre(this.element(to))
    await touch(handle, 'touchstart', [start])
    await touch(handle, 'touchmove', [end])
    await touch(handle, 'touchend', [])
  }

  /** Pinch on the canvas; a scale above 1 zooms in, below 1 zooms out. */
  async pinch(scale: number): Promise<void> {
    const mid = await centre(this.canvas)
    const spread = (distance: number) => [
      { x: mid.x - distance, y: mid.y },
      { x: mid.x + distance, y: mid.y },
    ]
    await this.touchGesture([spread(50), spread(50 * ((1 + scale) / 2)), spread(50 * scale)])
  }

  /** Drag the empty canvas with one finger, starting at the middle of its right edge. */
  async touchPan(by: Point): Promise<void> {
    const box = await this.canvas.boundingBox()
    if (!box) throw new Error('Canvas is not visible')
    const start = { x: box.x + box.width - 20, y: box.y + box.height / 2 }
    const at = (part: number) => [{ x: start.x + by.x * part, y: start.y + by.y * part }]
    await this.touchGesture([at(0), at(0.5), at(1)])
  }

  /**
   * A touch gesture: each step holds the position of every finger. Playwright has no multi-touch
   * API, and not every engine can construct a `Touch`. The canvas reads `touches` and
   * `changedTouches` only, so plain events carry them.
   */
  private async touchGesture(steps: Point[][]): Promise<void> {
    await this.page.evaluate((steps) => {
      const first = steps[0]![0]!
      const target = document.elementFromPoint(first.x, first.y)
      if (!target) throw new Error('Nothing to touch at this point')
      const send = (type: string, points: { x: number; y: number }[], changed = points) => {
        const list = (ps: typeof points) =>
          ps.map((p, identifier) => ({
            identifier,
            target,
            clientX: p.x,
            clientY: p.y,
            pageX: p.x,
            pageY: p.y,
          }))
        const event = new Event(type, { bubbles: true, cancelable: true })
        Object.defineProperties(event, {
          touches: { value: list(points) },
          targetTouches: { value: list(points) },
          changedTouches: { value: list(changed) },
        })
        target.dispatchEvent(event)
      }
      send('touchstart', steps[0]!)
      for (const step of steps.slice(1)) send('touchmove', step)
      send('touchend', [], steps.at(-1)!)
    }, steps)
  }
}

type Point = { x: number; y: number }

async function centre(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Element is not visible')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function touch(target: Locator, type: string, points: Point[]): Promise<void> {
  const touches = points.map((point, id) => ({ identifier: id, clientX: point.x, clientY: point.y }))
  await target.dispatchEvent(type, { touches, changedTouches: touches, targetTouches: touches })
}
