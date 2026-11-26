import type { Side } from './place'

// The tour (J63): what it says, what each step points at, and how it knows that what a step
// asks for was done. It is told on the example (the made-up bookshop), which it loads.

/** The box of the example the tour opens, and the card it shows connecting and moving on. */
export const TOUR_BOX = 'Web Shop'
const TOUR_CARD = 'Customer'

/** What the tour knows of the editor: where it is and what was done in it. */
export type TourScene = {
  /** The diagram that is open: the Overview, the inside of the tour's box, or another one. */
  at: 'overview' | 'inside' | 'elsewhere'
  /** How many objects and connections the model has. */
  objects: number
  connections: number
  /** How many changes are in the log, and what the last one was. */
  changes: number
  lastChange?: string
  historyOpen: boolean
  /** A connector's label is being typed: the tour waits for it before it goes on. */
  typing: boolean
}

export type TourStep = {
  id: string
  title: string
  text: string
  /**
   * What the step points at: CSS selectors, taken together when several are on the page. None:
   * the card stands in the middle of the screen, over a page that waits.
   */
  target?: string[]
  /** The side of the target the card goes to when it has room there. */
  side?: Side
  /** The diagram the step is about: the tour opens it when the step begins. */
  at?: 'overview' | 'inside'
  /**
   * The step is about the history: the tour opens it when the step begins. When the tour goes
   * on, it closes it and brings the diagram back to now.
   */
  history?: boolean
  /**
   * For a step that asks for something to be done: whether it was, since the step began
   * (`before`). The tour then goes on by itself.
   */
  done?: (now: TourScene, before: TourScene) => boolean
}

/** A card of the canvas, by the name of its object. */
const card = (name: string) => `.vue-flow__node[aria-label="${name}"]`
const button = (name: string) => `button[aria-label="${name}"]`
const TOOLBAR = '[role="toolbar"][aria-label="Diagram tools"]'

/** A change of this kind was logged since the step began. */
const logged = (kind: string) => (now: TourScene, before: TourScene) => now.changes > before.changes && now.lastChange === kind

/**
 * The steps, in their order: a welcome, what the app can do, a goodbye. `browserOnly`: the app
 * runs without a server and keeps the diagrams in the browser.
 */
export function tourSteps(browserOnly: boolean): TourStep[] {
  return [
    {
      id: 'welcome',
      title: 'Welcome to Drillgram',
      text: 'Architecture diagrams you can drill into. This tour shows what the app can do, on a made-up bookshop. It takes about three minutes, and you can end it at any step.',
    },
    {
      id: 'open',
      title: 'Boxes that open',
      text: `Every box holds a diagram of its own. Press the magnifier in the corner of "${TOUR_BOX}" to look inside.`,
      target: [card(TOUR_BOX)],
      side: 'right',
      at: 'overview',
      done: (now) => now.at === 'inside',
    },
    {
      id: 'inside',
      title: 'Inside the box',
      text: `"${TOUR_BOX}" is now the frame around its parts. What it is connected to stands outside the frame. A red line is a connection of the box that no part of it has yet.`,
      target: ['[data-testid="boundary"]'],
      side: 'right',
      at: 'inside',
    },
    {
      id: 'views',
      title: 'Several views of one box',
      text: 'A box can have more views than this one. The plus adds one, for a deployment or a flow, with cards and a layout of its own.',
      target: ['[data-tour="views"]'],
      side: 'right',
      at: 'inside',
    },
    {
      id: 'back',
      title: 'The way back',
      text: 'The breadcrumb lists the boxes on the way down. A connection made in here also shows one level up, between the boxes that hold its ends. Press "Overview" to go back.',
      target: ['nav[aria-label="Breadcrumb"]'],
      at: 'inside',
      done: (now) => now.at === 'overview',
    },
    {
      id: 'add',
      title: 'Add a shape',
      text: 'Shapes come in libraries: a plain box, the people and systems of C4, 46 flowchart outlines, database tables and code. Press "Add shape", pick one and give it a name.',
      target: [TOOLBAR],
      side: 'top',
      at: 'overview',
      done: (now, before) => now.objects > before.objects,
    },
    {
      id: 'connect',
      title: 'Connect two cards',
      text: 'Drag from the round handle on the right side of a card onto another card, then type what the connection says. The line finds its own way around the cards.',
      target: [card(TOUR_CARD)],
      side: 'away',
      at: 'overview',
      done: (now, before) => now.connections > before.connections,
    },
    {
      id: 'move',
      title: 'Move a card',
      text: 'Drag a card. It moves on a grid, shows where it will land and snaps to a free place. Guide lines show when it lines up with another card.',
      target: [card(TOUR_CARD)],
      side: 'away',
      at: 'overview',
      done: logged('objectsMoved'),
    },
    {
      id: 'arrange',
      title: 'Arrange',
      text: 'One press lays out the whole diagram. With several cards selected, it arranges only those. Press "Arrange".',
      target: [button('Arrange')],
      done: logged('viewArranged'),
    },
    {
      id: 'history',
      title: 'Undo and redo',
      text: 'Every change is logged with its time. Undo and Redo step through the log, one change at a time. Press "History" to see all of it.',
      target: [button('Undo'), button('Redo'), button('History')],
      done: (now, before) => now.historyOpen && !before.historyOpen,
    },
    {
      id: 'timeline',
      title: 'The history',
      text: 'Every change with its time, the newest last. Drag the timeline or press a change: the diagram shows itself as it was then, and a card that moved glides back. The tour brings you back to now.',
      target: ['aside[aria-label="History"]'],
      side: 'left',
      history: true,
    },
    {
      id: 'search',
      title: 'Find anything',
      text: 'The search finds a box by its name on any diagram, however deep, and takes you to it. Ctrl or Cmd with K opens it.',
      target: [button('Search')],
    },
    {
      id: 'card',
      title: 'Work on a card',
      text: 'A click on a card keeps it and what it connects to clear, and fades the rest. Its corner has buttons to edit it, give it icons and copy it. A double-click writes its text, in Markdown.',
      target: [card(TOUR_BOX)],
      side: 'away',
      at: 'overview',
    },
    {
      id: 'select',
      title: 'Select several cards',
      text: 'Ctrl or Cmd with a click adds a card to the selection, and Shift with a drag draws a frame around several. The bar then offers to put them in a group with a name, or to delete them.',
      target: [TOOLBAR],
      side: 'top',
    },
    {
      id: 'canvas',
      title: 'The canvas',
      text: 'Scroll to move, pinch or scroll with Ctrl to zoom. A right-click on the canvas opens a quick menu. These buttons zoom, fit the diagram to the screen and list the keyboard shortcuts.',
      target: [button('Zoom out'), button('Zoom in'), button('Fit to screen'), button('Keyboard shortcuts')],
      side: 'top',
    },
    {
      id: 'files',
      title: 'Import and export',
      text: 'Export saves the open diagram as SVG, PNG, Mermaid or D2. Import reads Mermaid and D2, pasted or from a file. The button between them empties the workspace.',
      target: [button('Import'), button('Export')],
    },
    {
      id: 'theme',
      title: 'Themes',
      text: 'Light, Dark and two Solarized themes. The one you choose is kept in this browser.',
      target: [button('Theme')],
    },
    // Only the app without a server shares a workspace so far (collab/).
    ...(browserOnly
      ? [
          {
            id: 'share',
            title: 'Work together',
            text: 'Share this workspace under a link. Whoever opens it changes the diagrams with you, each sees what the others do as they do it, and where their pointers are. The browsers talk to each other directly.',
            target: [button('Share')],
          } satisfies TourStep,
        ]
      : []),
    {
      id: 'keep',
      title: 'Where your diagrams are',
      text: `${
        browserOnly
          ? 'In this browser, on this device, and nowhere else: export what you want to keep.'
          : 'On the server: every browser you sign in to has them.'
      } This menu names the open workspace and leads to the others; you can have as many as you like. It also saves a workspace as a file, to keep it or to open it in another browser.`,
      target: ['button[aria-label^="Workspace: "]'],
    },
    {
      id: 'done',
      title: 'That is the tour',
      text: 'The bookshop stays here to try things on. For a clean start, empty the workspace with its button in the top bar, or make a new one. An empty workspace offers the tour again.',
    },
  ]
}
