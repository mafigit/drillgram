# Design rules

Owner's rules for how the app behaves. They hold for every feature.

## Nothing ever just sticks

- A button press gives feedback at once, in the same moment as the press: the button itself
  changes (a spinner, a pressed state), and what the press works on shows that it is being
  worked on.
- The page never freezes. Work that can take longer than a frame or two (about 50 ms) runs off
  the main thread, in a web worker, or in small steps. The layout engine's `arrange` is the
  example: `src/workers/arrange.worker.ts`, asked through `arrangeInBackground`.
- One press, one piece of work: the button is disabled until its work is done, so a second
  press cannot start it again. It keeps its spinner at full strength.
- While it works, the control says so to everyone: `aria-busy="true"` on the button and on the
  part of the page that will change.
- A result moves into place; it does not jump. Cards glide to new places, after
  "Arrange" and after a step in the history (undo, redo, the timeline).
- When the work fails or its answer no longer fits, say so in words. A press never ends in
  nothing.

## What went wrong is said on a card

- An error is a card in the top right corner, over the page: `showError('…')` from
  `src/composables/useErrors.ts`, drawn by `ErrorCards.vue` (`role="alert"`). Not a line in the
  bar, not only the console.
- The card says what happened and, where there is one, what to do next, in a sentence.
- It goes by itself after 8 seconds, has a button to close it, and goes when what it was about
  has changed. The same words are one card.
- The exception is a field of a form: what is wrong with what was typed stands at that field
  (the import dialog).
- Respect `prefers-reduced-motion`: keep the sign that something is working (the spinner), drop
  the movement.

## How to test it

- The journey records `aria-busy` with `editor.recordAttribute` before the press and expects
  `['true', 'false']`. A browser only notes a value the page had the time to show, so a handler
  that blocks the page fails this (J32 is the example).
