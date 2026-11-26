# Verification

Source: [How the Claude Code team thinks about verification](https://claude.dev/blog/how-the-claude-code-team-thinks-about-verification/)
(Addy Osmani, 2026-11-16). Builds on [testing.md](testing.md).

A change is done when there is evidence it works, not when the code is written.

## Run the change

- Passing tests are not enough. Run the app and use the feature as a user would: the dev server
  (`pnpm --filter @drillgram/web dev`) in a browser.
- [journeys.md](../journeys.md) is the feature map: it says what to try and what the result must be.
- Run `bin/ci-check` before you push. Cheap local checks come before CI and review time.

## Tests that catch real bugs

- Prefer e2e journeys: they are hard to fool. A failure must show the step, a screenshot and a
  trace, not only a timeout.
- Use property tests for invariants, with fast-check (installed in `@drillgram/model`; add it as a
  devDependency of any other package that needs it). Good properties in this repo:
  - round trip: `DiagramFormat` parse then serialise gives back the same `Diagram`;
  - idempotency: applying the same edit twice equals applying it once;
  - equivalence: an optimised path gives the same result as the simple one;
  - validity: any sequence of edits gives a workspace that `validateWorkspace` accepts.
- Check that a test has teeth: break the code on purpose and see the test fail. Remove a guard
  that no test needs.
- For a migration or rewrite, run old and new on the same inputs and compare. Normalise noise such
  as whitespace; list intended differences explicitly.
- Keep tests fast. A slow suite gets run less often.

## Saved workspaces

- A change to what the model puts on a diagram by itself (`syncView`, `openView`) must give a
  workspace that `validateWorkspace` accepts, for every model: the editor saves what it shows,
  and a saved workspace that fails the check loads as an empty one. On 2026-11-25 a diagram got
  a card it may not show and the owner's workspace no longer loaded (`mended` in
  `parseWorkspace` now takes such a workspace without that card).
- Try a change on a large real diagram in the browser, and reload the page, before pushing.

## Flaky tests

- Never skip, add a sleep or retry until green. Find the root cause.
- If you cannot find it, delete the test and say why in the PR.

## Do not move the goalposts

- A change must not weaken the checks that judge it. Changes to `bin/ci-check`,
  `e2e/fixtures.ts`, the contract tests or an existing assertion need their own reason in the PR.
- Verification evidence belongs to one commit. New commits make it stale; verify again.

## When stuck

- After three failed rounds on the same check, stop. Write down what you tried and hand it to the
  owner (PR description or issue comment).

## Learn from misses

- A mistake that happens twice becomes a rule in the matching `docs/agents/` file, or a check in
  `bin/ci-check` if it can be automated.
- Review findings carry a grade: must-fix, should-fix, nit or pre-existing. Pre-existing problems
  are not the author's to fix in this PR.
- Prune: remove rules and tests that no longer catch anything.
