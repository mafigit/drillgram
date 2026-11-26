# Licences

The repository is Apache-2.0 (`LICENSE`). `NOTICE` lists the parts under other terms. Three
checks keep that true; `bin/ci-check` runs them all.

| What | Check | Its list |
| --- | --- | --- |
| Every file of the repository | `deploy/licences/reuse` (`reuse lint`, [reuse.software](https://reuse.software)) | `REUSE.toml`, texts in `LICENSES/` |
| npm packages, the engine's crates and the server's Go modules | `pnpm licences` (`deploy/licences`) | `deploy/licences/licences.allow.json` |
| Icons a card can carry | tests in `apps/web/src/__tests__/tech-icons.spec.ts` | [icon-licences.md](../icon-licences.md) |

## A new file

- A file in a folder of ours (see the first table of `REUSE.toml`) is ours, Apache-2.0: nothing
  to do.
- A **new folder** at the top or directly under `apps/web` is in no table: the check fails until
  `REUSE.toml` says whose its files are. That is on purpose.
- A file **from somewhere else** (a copied component, a picture, a font) gets a table of its own
  in `REUSE.toml` with its holder and its licence, the licence's text in `LICENSES/`
  (`docker run --rm -v "$PWD":/data fsfe/reuse:6.3.0 download <SPDX id>`), and a line in `NOTICE`.
  Check first that its licence lets it be passed on; when unsure, ask the owner.

## A new package

`pnpm licences` fails when a package (also one that another package brings along) is under a
licence that is not on the list of `licences.allow.json`.

- A permissive licence that is only missing from the list (no duty beyond keeping its text): add
  its SPDX id to `licences`.
- Anything else (copyleft, share-alike, a licence with duties, none stated): do not add it to the
  list. Either take another package, or except this one **by name**, with the reason in `why`:
  what it is for and whether any of it is in the app that ships. An exception is for the licence
  it names; when the package changes its licence the check fails again.
- An exception that no package needs any more fails the check too: take it out.

The licences come from the package managers: `pnpm licenses list` and `cargo metadata` (in the
check's image from the list written while the engine was built, `DRILLGRAM_CRATES`). A Go module
states no licence in a manifest: `go-licenses` reads each module's licence file and names it
(`DRILLGRAM_GO_MODULES` in the check's image). Only modules that are in the server count, not
those its tests alone use.

## What the checks do not know

- Whether a picture may be shipped at all: that is read and decided by a person
  ([icon-licences.md](../icon-licences.md)).
- Whether a package states its licence truthfully.
- Trademarks. No file licence grants a name or a logo.
