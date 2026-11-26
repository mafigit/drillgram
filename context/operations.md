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
- A static host sees requests for files. The Cloudflare build also supports optional agent
  sharing, and shared sessions (J19): the browsers of a session meet at `/signal/<room>` of the
  site and talk to each other directly from there on.
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
(`wrangler.jsonc`). The Worker named `drillgram` serves the static assets, the optional MCP
relay and the meeting point of shared sessions ("Shared sessions" below) at
`drillgram.<your subdomain>.workers.dev`. The free plan includes all of it. Static file
requests do not count toward the Worker request limit.

- It reads `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from the environment. The token
  needs the permissions of Cloudflare's template "Edit Cloudflare Workers"; with less, the
  deploy stops with "No access to the specified resource". Without the two variables wrangler
  uses the account of `wrangler login` on this machine: check with `wrangler whoami` that it
  is the one you mean.
- An address of your own is set for the Worker in Cloudflare's dashboard (Settings, Domains
  & Routes), not in `wrangler.jsonc`.
- The name of the Worker is in `wrangler.jsonc`; another name is another Worker with its own
  address, and so with its own, empty storage in every browser.

#### Connect an MCP client

1. Open a workspace in the Cloudflare build. Select **Connect agent**, then **Start sharing**.
2. Copy the **MCP URL** and the **Bearer token**. Keep the Drillgram tab open.
3. In **How to connect**, select the tab for your client. The same steps are below.

To test the connection, ask the client to read the open Drillgram diagram. It can use
`read_diagram` for the active view and `read_workspace` to find IDs across the workspace.
The tools let it:

- Open a view or drill into a box. Add, copy, rename and delete custom views.
- Add, edit, duplicate, place, move and delete boxes. Edit table columns and choose icons.
- Add, label, color and delete relationships. Create, edit and remove group frames.
- Arrange the diagram or specific boxes. Load the example into an empty workspace.
- Import Mermaid C4, Mermaid flowcharts and D2. Export Mermaid, D2, SVG and PNG.
- Read the change history, undo, redo or jump to a history position.

Select **Stop sharing** in Drillgram to end access.

##### Claude web and desktop

Use the deployed HTTPS URL. Claude's custom connector needs access to **Request headers**,
which Anthropic is rolling out. If the option is missing, use Claude Code below.

1. Open **Customize → Connectors**. Select **Add → Add custom connector**.
2. Enter **Drillgram** as the name. Paste the **MCP URL**, including `/mcp`, and select **Continue**.
3. Under **Authentication**, choose **No sign-in**. Open **Request headers** under **Advanced** if needed.
4. Add an `Authorization` header. Enter `Bearer ` followed by the token, including the space.
5. Save the connector. In a chat, open **+ → Connectors** and turn on **Drillgram**.

Use a personal connector for a personal workspace. A fixed header on an organization connector
shares its token with everyone who can use that connector.
[Claude custom connector setup](https://claude.com/docs/connectors/custom/add-unlisted#authenticate-with-request-headers)

##### Terminal setup for Codex and Claude Code

In Bash or Zsh, run these lines. Paste the **Bearer token** when asked.

```sh
printf 'Drillgram bearer token: '
IFS= read -rs DRILLGRAM_MCP_TOKEN
printf '\n'
export DRILLGRAM_MCP_TOKEN
```

##### Codex

Replace the example URL with the **MCP URL**. Add the server once, then start Codex in the
same terminal so it can read the token. Type `/mcp` in Codex to check the connection.

```sh
codex mcp add drillgram --url 'https://example.com/mcp' \
  --bearer-token-env-var DRILLGRAM_MCP_TOKEN
codex
```

The Codex IDE extension and desktop app can use the same server configuration on the same
host. Start the client with `DRILLGRAM_MCP_TOKEN` in its environment and restart any open session.
[Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli#connect-codex-to-an-mcp-server)

##### Claude Code CLI

Replace the example URL with the **MCP URL**. Run the command once from the directory where
you use Claude Code. Keep the single quotes so Claude Code reads the token at connection time.

```sh
claude mcp add-json --scope local drillgram \
  '{"type":"http","url":"https://example.com/mcp","headers":{"Authorization":"Bearer ${DRILLGRAM_MCP_TOKEN}"}}'
claude mcp get drillgram
```

Start `claude` in the same terminal. Type `/mcp` to check the connection.
[Claude Code MCP setup](https://code.claude.com/docs/en/mcp#environment-variable-expansion-in-mcp-json)

##### Reconnect after sharing ends

The token expires after one hour. It also stops working if the tab closes or disconnects.
Start sharing again to get a new token. In Claude web or desktop, remove the connector and
add it again with the new token. For either CLI, repeat the terminal setup and restart the client.
The saved CLI server configuration can stay in place if the URL is the same.

For local testing, run `apps/web/e2e/serve-browser 4174` from the repository root. It builds
the Cloudflare variant and starts the relay in Wrangler. Use `http://127.0.0.1:4174`.

#### Shared sessions

Working together (J19) needs one thing that is no file: a place where the browsers of a
session find each other. That is a part of the Worker (`apps/web/worker/signalRoom.ts`), beside
the MCP relay: under `/signal/<room>` it takes WebSockets into a Durable Object per session
(`SignalRoom`, bound as `ROOMS`; its entry in the `migrations` of `wrangler.jsonc` makes the
class with the first deployment that has it). Only the handshake of two browsers passes it;
what they say to each other afterwards goes directly between them.

- All of it is in the free plan: Durable Objects with SQLite storage (the only kind the free
  plan has; the room stores nothing), 100,000 requests a day for the Worker. A request here is
  a browser that connects to a room, and messages of a handshake count 20 to 1. A room sleeps
  between two messages. When the day's requests are used up, sharing stops until midnight UTC;
  the site itself (files) goes on.
- STUN is Cloudflare's (`stun.cloudflare.com`, the variable `STUN_URL` in `wrangler.jsonc`),
  free and without a key: it tells a browser under which address it can be reached.
- Two browsers that find no direct way to each other (strict firewalls, some mobile
  networks) talk through the room itself: the Worker passes on what they encrypted
  (`src/collab/relay.ts`). That is in the free plan too, and counts: 20 messages passed on
  are a request, so a pair that works for an hour this way uses a few hundred to a few
  thousand of the day's 100,000.
- TURN does the same job outside the Worker, and is off: Cloudflare gives a TURN key only to
  an account with a payment method (seen in the dashboard, 2026-11-26), and bills what goes
  beyond the free amount, without a cap. With a key as two secrets of the Worker, browsers
  would use it before they fall back to the room. To turn it on, once:
  1. In Cloudflare's dashboard: Realtime, TURN Server, "Create". It shows a Turn Token ID and
     an API token.
  2. In `apps/web`, with the account the site is on (`wrangler whoami`):
     `pnpm exec wrangler secret put TURN_KEY_ID` and
     `pnpm exec wrangler secret put TURN_KEY_API_TOKEN`; each asks for its value.
  The first 1,000 GB a month are free, then $0.05 per GB. Changes of a diagram are small; the
  Worker gives TURN credentials only to who takes a seat in a session, good for a day.
- The Worker takes WebSockets only from pages of its own address (`Origin`).
- Not tried against Cloudflare itself yet (2026-11-26): the first deployment with this
  Durable Object, and the answer of the TURN API. Both were written from Cloudflare's
  documentation; the journeys run the Worker itself in wrangler's local runtime
  (`e2e/serve-browser`), with no STUN server (`--var STUN_URL:`), so they ask nothing outside
  the machine.
- The dev server (`mise run browser`) has no Worker: there the meeting point is
  `apps/web/signal.vite.ts`, with the same rooms (`src/collab/rooms.ts`). It names no STUN
  and no TURN server: browsers of one machine or one network find each other without.

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
