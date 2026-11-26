# Operations

## Setup

```sh
git submodule update --init   # packages/layout, the layout engine (github.com/mafigit/tidy-layout)
mise install          # Node, pnpm, Rust and Go from mise.toml
pnpm install          # `mise run dev` does this, and the first line where the engine is missing
pnpm --filter @drillgram/web exec playwright install   # browsers, once
```

## Develop and test

| Command | What |
| --- | --- |
| `mise run dev` | Work on the app, in one go: the server with its database (`bin/dev`) and the app's dev server, side by side, on `http://localhost:5173`. Fetches the packages first where they are missing or old. Ctrl-C stops both; the database's container stays. `mise run server` and `mise run web` start one of them, `mise run stack` the compose stack; `mise tasks` lists them (`mise.toml`). |
| `docker compose up --build` | The whole app as it runs for real: one image with the server and the built web app (`Dockerfile`), and a PostgreSQL, on `http://localhost:8080`. See "The stack" below. Needs Docker only. |
| `bin/dev` | The server for work on the app, on `:8080`, with a PostgreSQL that keeps its data between runs (a container and a volume, both `drillgram-dev-db`; `--forget` throws them away). The first start makes the admin `admin@example.org` with the password `drillgram-dev`. Needs Docker. |
| `pnpm --filter @drillgram/web dev` | The app's dev server. It sends `/api` to the server on `localhost:8080` (`DRILLGRAM_API` for another address): start `bin/dev` beside it. |
| `mise run browser` | The app without a server (`dev:browser`), on `http://localhost:5174`: the browser keeps the workspaces. See "Without a server" below. |
| `pnpm test` | All unit tests, headless, one run. |
| `pnpm typecheck` | vue-tsc for `apps/web`, tsc for `packages/*`. |
| `pnpm test:e2e` | Every journey on all Playwright projects, headless, against the server with the built app (`apps/web/e2e/serve`: builds both and starts a PostgreSQL that goes with it), and the project `browser-only` against the app built without a server (`apps/web/e2e/serve-browser`, port 4174). Needs Docker and Go. |
| `pnpm test:e2e:ui` | Playwright UI for local debugging. |
| `pnpm build` | Build every package. |
| `pnpm --filter @drillgram/web generate-pwa-assets` | Regenerate icons after changing `apps/web/public/logo.svg`; commit the PNGs. |
| `bin/with-postgres go test ./...` (in `apps/server`) | The server's tests, on a PostgreSQL that goes with the command (a container; needs Docker). |
| `bin/ci-check` | The full check: the server's format, `go vet` and tests, unit tests, typecheck, the licence gate (`pnpm licences`) and journeys in the pinned Playwright image without network, then the licence of every file (`deploy/licences/reuse`). Needs Docker. Run before pushing. |
| `bin/public-check` | Fails when a file names an address of a private network, a local host or a Docker daemon's open port. First step of `bin/ci-check`. |
| `bin/pre-push` | The check before a push to GitHub, as git's pre-push hook: only the public history, only the address of the repository, nothing `bin/public-check` refuses. Link it once in a clone; see `docs/agents/publishing.md`. |
| `bin/docker-build` | `docker build` that says nothing unless it fails; then the whole build log, and a hint when the Docker host's disk is full. The checks build with it. |
| `pnpm licences` | The licence gate alone: npm packages, the engine's crates and the server's Go modules against `deploy/licences/licences.allow.json` (see `docs/agents/licences.md`). |
| `deploy/licences/reuse` | `reuse lint` alone: every file against `REUSE.toml`. Needs Docker. |

Failed e2e runs leave traces, screenshots and videos in `test-results/` and the HTML report in
`playwright-report/` (both gitignored).

At startup, `bin/dev` prints the server address and admin email. It passes the admin password
to the server through `DRILLGRAM_ADMIN_PASSWORD`.

## The stack

`compose.yaml` runs the app's image and a PostgreSQL. `docker compose up --build` builds the
image first (a few minutes the first time: the layout engine, the web app, the server);
`docker compose down` stops it and keeps the database (the volume `drillgram_db`), `down -v`
throws it away.

- The first start makes the admin `admin@example.org` with the password `drillgram-dev`.
- It listens on this machine alone (`127.0.0.1:8080`). For anybody else, put a proxy with TLS
  in front and set `DRILLGRAM_PUBLIC_URL`.
- Settings go in a file `.env` beside `compose.yaml` (in `.gitignore`: it holds passwords).
  `POSTGRES_PASSWORD`, `DRILLGRAM_ADMIN_EMAIL`, `DRILLGRAM_ADMIN_PASSWORD` and `DRILLGRAM_PORT`
  are read by `compose.yaml`; every `DRILLGRAM_*` variable in it reaches the server (the table
  below), single sign-on and the proxy's header among them.
- A new database password after the first start does not change the one the database has: the
  volume keeps it.
- The image runs as a user who owns nothing and has no shell. Its health check is the program
  itself: `drillgram health`. The licence texts of what is in it are under `/licences`.
- `bin/ci-check` does not build this image: after a change to the build of the app or the
  server, run `docker compose up --build` once.

## On Kubernetes

The [Helm chart](../deploy/helm/drillgram/README.md) installs the hosted image and an optional
PostgreSQL StatefulSet. The bundled database uses a volume claim that survives Helm uninstall.
The external mode takes a PostgreSQL connection URL from a Kubernetes Secret.

The Helm workflow creates a kind cluster and runs `bin/helm-check` against the packaged chart.
The test signs into both database modes and checks that a workspace survives a PostgreSQL pod
restart. A `helm-v<version>` tag on main publishes the chart to GitHub Releases and the hosted
image to GitHub Container Registry.

## Without a server

`pnpm --filter @drillgram/web build:browser` builds the app to run in the browser alone and
writes it to `apps/web/dist-browser` (about 6,100 files, 30 MB, most of them card icons). Any
host of static files can give it out, if it answers an address that is no file (`/w/<id>`)
with `index.html`.

- The diagrams are in the browser that drew them (IndexedDB, database `drillgram`), per
  address of the app: another browser, another device or another address starts empty, and
  clearing the site's data deletes them. The app asks the browser once to keep its storage
  when the disk runs full (`navigator.storage.persist`); a browser may say no.
- Nothing is sent anywhere: the host sees requests for files only.
- A new version reaches a browser as with a server: the service worker fetches it and the app
  asks before it reloads.
- The build carries an imprint and a privacy policy (`apps/web/imprint.html`, `privacy.html`),
  linked under "About this site". They are of who runs the site, not of the app: they name the
  owner and Cloudflare as the host. Who gives the app to others under another address, or
  from another host, writes their own into these two files first. A site for everybody must
  name who runs it (in Germany § 5 DDG, § 18 MStV, Art. 13 GDPR). The owner's postal address
  and e-mail address are not in yet: the pages say "to be filled in" where they belong. The build with a server has
  neither page.

### On Cloudflare

The workflow deploys every commit on `main` that passed its check ("CI" below); by hand it
is the same command. `mise run cloudflare` builds and then runs `wrangler deploy` in `apps/web`
(`wrangler.jsonc`): the files become the static assets of a Worker named `drillgram`, with no
code of its own, at `drillgram.<your subdomain>.workers.dev`. Requests for static assets are
free and not counted on the free plan, which takes up to 20,000 files of at most 25 MiB each.

- It reads `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from the environment. The token
  needs the permissions of Cloudflare's template "Edit Cloudflare Workers"; with less, the
  deploy stops with "No access to the specified resource". Without the two variables wrangler
  uses the account of `wrangler login` on this machine: check with `wrangler whoami` that it
  is the one you mean.
- An address of your own is set for the Worker in Cloudflare's dashboard (Settings, Domains
  & Routes), not in `wrangler.jsonc`.
- The name of the Worker is in `wrangler.jsonc`; another name is another Worker with its own
  address, and so with its own, empty storage in every browser.

## The server

```sh
cd apps/server
go build -o drillgram ./cmd/drillgram
DRILLGRAM_DATABASE_URL=postgres://user:password@host:5432/drillgram \
DRILLGRAM_ADMIN_EMAIL=you@example.org DRILLGRAM_ADMIN_PASSWORD='at least ten characters' \
./drillgram
```

It makes its tables itself when it starts, and the admin when there is no user yet. It listens
on `:8080`; `GET /api/health` says whether it and its database are up, and so does the program
itself: `drillgram health` asks the server that runs with the same settings (exit status 0: up). A PostgreSQL to try it
with: `docker run --rm -e POSTGRES_PASSWORD=drillgram -p 5432:5432 postgres:17.2-bookworm`.

Everything it is told is an environment variable, each beginning with `DRILLGRAM_`. A setting
that cannot work stops the start with the reason.

| Variable | Default | What |
| --- | --- | --- |
| `DATABASE_URL` | none, needed | The PostgreSQL. |
| `LISTEN` | `:8080` | The address it listens on. |
| `PUBLIC_URL` | none | Where people reach it, behind whatever proxies it. With an `https` address the session cookie is for HTTPS only. Single sign-on needs it. |
| `WEB_DIR` | none | The folder of the built web app (`apps/web/dist`); without it the server is the API alone. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | none | The first user, an admin, made when there is no user yet. Of no effect later. |
| `SESSION_LIFE` | `720h` | How long a sign-in holds. |
| `LOGIN_TRIES_PER_MINUTE` | `10` | Wrong passwords for one address within a minute before sign-in is refused; `0` for no limit. |
| `AUTH_PASSWORD_ENABLED` | `true` | Sign-in with e-mail and password. |
| `AUTH_OIDC_ISSUER`, `_CLIENT_ID`, `_CLIENT_SECRET` | none | Single sign-on through an OpenID Connect provider; on when the issuer is set. The provider must allow the address `<PUBLIC_URL>/api/auth/oidc/callback`. |
| `AUTH_OIDC_SCOPES` | `openid email profile` | What is asked of the provider. |
| `AUTH_OIDC_NAME` | `Single sign-on` | What the sign-in page calls the provider. |
| `AUTH_OIDC_AUTO_SIGN_UP` | `true` | Make a user for somebody the provider knows and the server does not. |
| `AUTH_OIDC_TRUST_EMAIL` | `false` | Take the provider's word for an address also where it does not say `email_verified`. Only for a provider that gives nobody an address that is not theirs. |
| `AUTH_PROXY_ENABLED` | `false` | Believe the header of a proxy in front, as Grafana's `auth.proxy`. |
| `AUTH_PROXY_HEADER` | `X-WEBAUTH-USER` | The header with the user's e-mail address. |
| `AUTH_PROXY_NAME_HEADER` | none | A header with the user's name. |
| `AUTH_PROXY_TRUSTED` | none, needed with the switch | The proxy's addresses or ranges, with commas or spaces between. The header counts only from there. |
| `AUTH_PROXY_AUTO_SIGN_UP` | `true` | Make a user for somebody new. |
| `AUTH_JWT_ENABLED` | `false` | Believe a signed token (JWT) in a header, as Grafana's `auth.jwt`. |
| `AUTH_JWT_HEADER` | `X-JWT-Assertion` | The header with the token, with or without `Bearer `. |
| `AUTH_JWT_JWKS_URL` | none, needed with the switch | Where the keys that sign the tokens are published. |
| `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE` | none | What the token's `iss` and `aud` must be, where set. |
| `AUTH_JWT_EMAIL_CLAIM`, `AUTH_JWT_NAME_CLAIM` | `email`, `name` | The claims that say who the user is. |
| `AUTH_JWT_AUTO_SIGN_UP` | `true` | Make a user for somebody new. |

Behind a proxy that signs people in: a header that names a user wins over a session cookie, and
the proxy must take away such a header when a request brings one from outside.

## CI

`.github/workflows/ci.yml` only checks out and calls `bin/ci-check`, on every push to `main` and
every pull request. It runs on GitHub Actions and on any server that runs the same workflows.

After a green check of a commit on `main`, its job `deploy` puts the app without a server on
Cloudflare: `mise run cloudflare`, with the tools of `mise.toml` (see "On Cloudflare" above).
It reads the repository's secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (GitHub:
Settings, Secrets and variables, Actions). So what is pushed to `main` is live some twenty
minutes later, without anybody looking at it again. "Run workflow" on the workflow's page
checks and deploys `main` once more without a new commit. A pull request and a fork deploy
nothing.

On a runner that is not thrown away after the job, the Docker build cache grows with every build
until the disk is full; then every run fails within half a minute with `no space left on device`,
also in the job's own clean-up, and nothing in the repository can repair it (free the cache by
hand with `docker builder prune --all --force`, then start the run again). So the workflow frees
what no build used for 6 hours after every check and prints `docker system df`.

## Pitfalls

- Keep the image tag in `apps/web/e2e/Dockerfile` equal to the exactly pinned `@playwright/test`
  version when upgrading.
- PWA tests need the built app (no service worker in dev); they run in Chromium only.
- A journey run that is killed, not stopped, can leave its database behind: a container named
  `drillgram-test-db-…`. `docker rm -f` it.
- The server refuses a request that changes something when the page's origin is not its own.
  Behind a proxy that gives it another host, set `DRILLGRAM_PUBLIC_URL`, or let the proxy pass
  the host on (`X-Forwarded-Host`).

## What is not in the repository

`context/private/` is in `.gitignore`. It holds what the public repository must not say (see
`docs/agents/publishing.md`): how and where the owner runs things. It exists only where the
owner keeps it.
