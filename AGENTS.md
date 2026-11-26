# Agent guide

Index only: one line per topic, details live in the linked files. Add a new topic as a new file
under `docs/agents/` plus one line here; never grow this file with content.

Before you start, read [testing.md](docs/agents/testing.md) and every other file whose topic your
task touches.

| Topic | File | In short |
|---|---|---|
| Testing | [docs/agents/testing.md](docs/agents/testing.md) | Test-driven first, outside-in with e2e browser tests |
| Verification | [docs/agents/verification.md](docs/agents/verification.md) | Run the change, property tests, no gaming flaky tests or checks |
| Design rules | [docs/agents/design.md](docs/agents/design.md) | Nothing ever just sticks: every press gives feedback at once, long work runs off the main thread. Errors are cards, top right |
| Icon licences | [docs/icon-licences.md](docs/icon-licences.md) | Icons on cards come from theSVG's allow-list and Cloudflare's docs only and are never changed |
| Publishing | [docs/agents/publishing.md](docs/agents/publishing.md) | The work is on GitHub and public at once: `bin/pre-push` guards every push. Nothing private in a file, a message or a commit's address |
| Licences | [docs/agents/licences.md](docs/agents/licences.md) | Apache-2.0; every file, npm package and crate is checked against a list. A new folder or a file from elsewhere must be declared |
| C4 model | [docs/agents/c4.md](docs/agents/c4.md) | C4 is a shape library, not the model's rules: everything is a box. Then: c4model.com is the reference: abstractions, diagram scopes, notation, open gaps |
| Layout engine | [docs/agents/layout-engine.md](docs/agents/layout-engine.md) | Rust port of TALA in `packages/layout`, MPL-2.0; record TALA's answers before porting |
| User journeys | [docs/journeys.md](docs/journeys.md) | J1 to J67, each with an e2e test; journey test first |
| Workflow | [docs/agents/workflow.md](docs/agents/workflow.md) | Issue is the spec, PR lists tests, leave issues still in design alone |
| Stack | [docs/agents/stack.md](docs/agents/stack.md) | Vue 3 + Vite + TS, pnpm workspace, tools via mise |
| Server | [docs/agents/server.md](docs/agents/server.md) | Go + Fiber + PostgreSQL in `apps/server`: tests through HTTP on a real database, migrations never changed, the log's entries are not read |
| Product | [README.md](README.md) | What the app is and its features |
| Context | [context/README.md](context/README.md) | What the app does now, how it is built and how to run it |

## Context folder

`context/` holds the durable knowledge about this repository (start with `context/README.md`).

- Read `context/README.md` before larger changes.
- Keep it current: when you change behaviour, architecture, build, deploy or operating steps, or learn
  something a future reader needs, update the matching file in `context/` in the same change.
- Record decisions with their reason in `context/private/notes/decisions.md`. `context/private/` is
  not in the repository (see [publishing](docs/agents/publishing.md)): the decision log, research
  notes, the to-do list and handover reports are working notes and live there, on the owner's
  machine. What the code needs a reader to know goes into `architecture.md` and `operations.md`.
- Plain Markdown, no secrets (say where a secret lives, never its value).
