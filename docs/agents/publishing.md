# The public repository

The repository is on GitHub: <https://github.com/mafigit/drillgram>. The work happens there
(owner's call, 2026-11-26): commit on `main`, run `bin/ci-check`, push `main` to `origin`.

- **A push is public at once and for good:** the files, the message of every commit and the
  address it carries. Read what you push before you push it; a later commit does not take
  anything back, it stays readable in the history.
- **The history began anew on 2026-11-26**, with the commit `0bc5bdc`. What was before is not
  public and never goes there: it holds what the rules below forbid. A machine that still has
  it keeps it apart from `main` (where, is in `context/private/`). Never push it, never merge
  it into `main`, and bring nothing over from it without reading what that commit holds.
- **`bin/pre-push` is the check before a push**, as git's pre-push hook. Link it once in a
  clone: `ln -sf ../../bin/pre-push "$(git rev-parse --git-path hooks/pre-push)"`. A push to
  GitHub is refused when a commit of it is not of the public history alone, when a commit
  carries another address than the one below, and when `bin/public-check` finds something in
  the files. Never push around it (`--no-verify`).
- **Something went out that should not have:** tell the owner at once. Only the owner decides
  to rewrite the public history (a forced push) or to delete the repository and make it anew;
  GitHub can keep an old commit reachable by its id for a while.
- **The owner's work address must never be in a commit.** Commits of this repository carry the
  address in `docs/agents/layout-engine.md`. Do not commit on a machine whose git config for
  this repository says otherwise.

## What must not be in a file

`bin/public-check` (run by `bin/ci-check` and `bin/pre-push`) fails on an address of a private
network, a host of a local domain and the open port of a Docker daemon. Beyond what it can see:

- Nothing from the owner's work: no name of a service, a system or a customer, not in a test
  either. Fixtures are made up.
- Nothing of the owner's own environment: no address, host name, domain or account, no name of
  a machine, and no tooling that only works there (a deployment to the owner's servers, say).
  What a future reader needs of that goes into `context/private/` (in `.gitignore`, so it exists
  only where the owner keeps it), and the public text says no more than that it is there.
- No secrets, as ever: say where one lives, never its value.
- The one exception, on the owner's word (2026-11-26): `apps/web/imprint.html` and
  `apps/web/privacy.html` name the owner, with a postal address and an e-mail address. The law
  asks for them on the site, and the site is public. Nothing else of the owner's goes there,
  and nothing of the owner's work, ever.

The message of a commit is public too: say what changed for a reader of the app.
