# Operations

## Setup

```sh
git submodule update --init   # packages/layout, the layout engine (github.com/mafigit/tidy-layout)
mise install          # Node and pnpm from mise.toml
pnpm install
pnpm --filter @drillgram/web exec playwright install   # browsers, once
```

## Develop and test

| Command | What |
| --- | --- |
| `pnpm --filter @drillgram/web dev` | Dev server. |
| `pnpm test` | All unit tests, headless, one run. |
| `pnpm typecheck` | vue-tsc for `apps/web`, tsc for `packages/*`. |
| `pnpm test:e2e` | Every journey on all Playwright projects, headless. |
| `pnpm test:e2e:ui` | Playwright UI for local debugging. |
| `pnpm build` | Build every package. |
| `pnpm --filter @drillgram/web generate-pwa-assets` | Regenerate icons after changing `apps/web/public/logo.svg`; commit the PNGs. |
| `bin/ci-check` | The full check: unit tests, typecheck, the licence gate (`pnpm licences`) and journeys in the pinned Playwright image without network, then the licence of every file (`deploy/licences/reuse`). Needs Docker. Run before pushing. |
| `bin/public-check` | Fails when a file names an address of a private network, a local host or a Docker daemon's open port. First step of `bin/ci-check`. |
| `bin/publish "<message>"` | Puts the files of `main` on the public repository on GitHub as one commit (`--dry-run` to look first). The only way there: see `docs/agents/publishing.md`. |
| `bin/docker-build` | `docker build` that says nothing unless it fails; then the whole build log, and a hint when the Docker host's disk is full. The checks build with it. |
| `pnpm licences` | The licence gate alone: npm packages and the engine's crates against `deploy/licences/licences.allow.json` (see `docs/agents/licences.md`). |
| `deploy/licences/reuse` | `reuse lint` alone: every file against `REUSE.toml`. Needs Docker. |

Failed e2e runs leave traces, screenshots and videos in `test-results/` and the HTML report in
`playwright-report/` (both gitignored).

## CI

`.github/workflows/ci.yml` only checks out and calls `bin/ci-check`, on every push to `main` and
every pull request. It runs on GitHub Actions and on any server that runs the same workflows.

On a runner that is not thrown away after the job, the Docker build cache grows with every build
until the disk is full; then every run fails within half a minute with `no space left on device`,
also in the job's own clean-up, and nothing in the repository can repair it (free the cache by
hand with `docker builder prune --all --force`, then start the run again). So the workflow frees
what no build used for 6 hours after every check and prints `docker system df`.

## Pitfalls

- Keep the image tag in `apps/web/e2e/Dockerfile` equal to the exactly pinned `@playwright/test`
  version when upgrading.
- PWA tests need `vite build` plus `vite preview` (no service worker in dev); they run in Chromium only.

## What is not in the repository

`context/private/` is in `.gitignore`. It holds what the public repository must not say (see
`docs/agents/publishing.md`): how and where the owner runs things. It exists only where the
owner keeps it.
