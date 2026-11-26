# Server

`apps/server`: Go with [Fiber](https://gofiber.io) 3, PostgreSQL through `pgx`. It keeps users,
sessions, workspaces and the change log of each workspace, and answers under `/api` in JSON.
What it is told at the start, and how to run it: [operations](../../context/operations.md).

## Layout

| Path | What |
| --- | --- |
| `cmd/drillgram` | The program: reads the configuration, migrates, listens. `drillgram health` asks a running one whether it is up (the image's health check). |
| `internal/config` | The configuration: environment variables `DRILLGRAM_*`, checked at the start. |
| `internal/store` | Every SQL statement, and `migrations/`. |
| `internal/auth` | Password hashes, tokens of a header, single sign-on. No HTTP, no SQL. |
| `internal/api` | Routes and handlers, and the tests of everything through HTTP. |
| `internal/testdb` | A database of its own for each test. |

## Rules

- **Tests first, through HTTP, on a real PostgreSQL.** A test starts the server as `main` does
  (`start` in `internal/api/harness_test.go`) and talks to it as a browser would. No fake of the
  database. Run them with `bin/with-postgres go test ./...` from `apps/server`; the script
  starts a PostgreSQL that goes with the command.
- **A migration is never changed once it is on `main`.** A change to the tables is a new file
  in `internal/store/migrations/`, the next number first. They run in the order of their names
  when the server starts.
- **SQL lives in `internal/store` only**, with `$1` parameters, never a text put together from
  what a request sent.
- **The server does not read a log entry.** It keeps what the editor sends and gives it back in
  order; what an entry means is `@drillgram/model`'s to say (`applyEvent`). The server's part is
  who may append, and that nobody appends after an entry they have not seen (`after`, 409).
- **For somebody who is no member, a workspace is not there** (404, not 403). An admin of the
  server manages users, not other people's workspaces.
- **A setting that cannot work stops the start** (`Config.Check`): a proxy header without the
  proxy's addresses would let anybody name themselves.
- **A page that asks who is signed in gets an answer, not a refusal** (`/api/session`): a 401
  would be an error in the browser's console at every visit of somebody new.
- **A request that changes something must come from the app's own pages** (`sameSite`). A new
  way to reach the API from a browser must not get around it.
- **Who a request is from is decided in one place**, `identify` in `internal/api/auth.go`: a
  token in a header, then the proxy's header, then the session cookie.
- **An answer never carries a password hash**; `viewUser` is the only way a user leaves the API.
- A new module: `pnpm licences` judges it ([licences.md](licences.md)).
- `gofmt` and `go vet` must be clean; the check's image fails otherwise.

## Sign-in, the four ways

| Way | Switch | Notes |
| --- | --- | --- |
| Password | `AUTH_PASSWORD_ENABLED` (on) | Argon2id. Users are made by an admin; the first start makes the admin. |
| Single sign-on | `AUTH_OIDC_ISSUER` | OpenID Connect with PKCE, state and nonce. The provider's `sub` says who somebody is; their address only where the provider checked it. |
| Proxy header | `AUTH_PROXY_ENABLED` | As Grafana's `auth.proxy`: believed only from `AUTH_PROXY_TRUSTED`. |
| Token in a header | `AUTH_JWT_ENABLED` | As Grafana's `auth.jwt`: checked against the keys at `AUTH_JWT_JWKS_URL`. |

The last three make a user for somebody new unless their `…_AUTO_SIGN_UP` is off.
