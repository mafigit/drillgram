# The public repository

The repository is published on GitHub: <https://github.com/mafigit/drillgram>. The work happens on
`origin` (branch `main`); the two do not share a history.

- **The public history started fresh on 2026-11-26.** Nothing of the history before goes out,
  whatever it holds.
- **`bin/publish "<message>"` is the only way to GitHub.** It takes the files of `main` as they
  are in its last commit and puts them on top of the public history as one commit (branch
  `public` here, `main` there). `--dry-run` shows what would go out. Publish when the owner
  asks for it, not after every push.
- **Something went out that should not have:** a later commit does not take it back, it stays
  readable in the history. `bin/publish --fresh` starts the public history again with one
  commit. Only on the owner's word. GitHub can keep an old commit reachable by its id for a
  while; to be rid of it for certain the owner deletes the repository there and makes it anew.
- **Never push `main`, or any other branch, to GitHub.** That would publish the old history.
  The pre-push hook that `bin/publish` installs refuses it; a fresh clone has no hook until
  `bin/publish` ran once.
- **The owner's work address must never be in a commit.** Commits of this repository carry the
  address in `docs/agents/layout-engine.md`; `bin/publish` refuses any other. Do not commit on a
  machine whose git config for this repository says otherwise.

## What must not be in a file

`bin/public-check` (run by `bin/ci-check` and `bin/publish`) fails on an address of a private
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

The message of a public commit is public too: say what changed for a reader of the app.
