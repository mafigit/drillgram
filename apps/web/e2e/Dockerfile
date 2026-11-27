# Runs the e2e journeys headless in the official Playwright image.
# Keep the tag equal to the @playwright/test version in apps/web/package.json.
# Build from the repo root: docker build -f apps/web/e2e/Dockerfile -t drillgram-e2e .
# Run without network:      docker run --rm --init --ipc=host --network none drillgram-e2e
# The journeys run against the server (the stage `server`) with a PostgreSQL inside the image.
# The layout engine: run its Rust tests and compile it to WebAssembly. Rust matches mise.toml.
FROM rust:1.99.1-slim AS engine
RUN rustup target add wasm32-unknown-unknown
WORKDIR /src/packages/layout
COPY packages/layout/Cargo.toml packages/layout/Cargo.lock ./
COPY packages/layout/src src
COPY packages/layout/tests tests
RUN cargo test --locked && cargo build --release --locked --target wasm32-unknown-unknown
# The engine's crates and their licences, for the licence gate (`pnpm licences`): the image the
# checks run in has no cargo.
RUN cargo metadata --format-version 1 --locked --offline > /crates.json

# The server: its format, `go vet` and its tests against a PostgreSQL of its own, then the
# program and the list of its modules with their licences, for the licence gate. Go matches
# mise.toml, PostgreSQL the image in bin/with-postgres.
FROM golang:1.27.4-bookworm AS server
# PostgreSQL from its own package repository: Debian's own is older.
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-common ca-certificates \
  && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y \
  && apt-get install -y --no-install-recommends postgresql-17 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /src/apps/server
COPY apps/server/go.mod apps/server/go.sum ./
RUN go mod download
COPY bin/with-postgres /src/bin/
COPY apps/server .
RUN unformatted=$(gofmt -l .) && [ -z "$unformatted" ] || { echo "gofmt: not formatted: $unformatted" >&2; exit 1; }
RUN go vet ./... && /src/bin/with-postgres go test ./... && CGO_ENABLED=0 go build -o /drillgram ./cmd/drillgram
# The check's image has no Go.
COPY deploy/licences/go-modules.tpl /go-modules.tpl
RUN go run github.com/google/go-licenses/v2@v2.0.1 report ./... --ignore github.com/mafigit/drillgram --template /go-modules.tpl > /go-modules.tsv

FROM mcr.microsoft.com/playwright:v1.64.1-noble

# The journeys run against the server on a PostgreSQL of its own (e2e/serve, bin/with-postgres):
# the same PostgreSQL as the server's tests have above.
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-common ca-certificates \
  && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y \
  && apt-get install -y --no-install-recommends postgresql-17 \
  && rm -rf /var/lib/apt/lists/*

# The engine is built: bin/engine only checks that it is there.
ENV CI=1 TIDY_LAYOUT_PREBUILT=1
WORKDIR /src

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/model/package.json packages/model/
COPY packages/layout/package.json packages/layout/
COPY deploy/licences/package.json deploy/licences/
COPY deploy/release/package.json deploy/release/
# The image has no corepack: install the pnpm version pinned in packageManager.
RUN npm install -g "$(node -p 'require("./package.json").packageManager')" \
  && pnpm install --frozen-lockfile

COPY . .
COPY --from=engine /src/packages/layout/target/wasm32-unknown-unknown/release/tidy_layout.wasm packages/layout/pkg/
COPY --from=engine /crates.json /crates.json
ENV DRILLGRAM_CRATES=/crates.json
COPY --from=server /go-modules.tsv /go-modules.tsv
ENV DRILLGRAM_GO_MODULES=/go-modules.tsv
# The server is built: e2e/serve starts this one.
COPY --from=server /drillgram /usr/local/bin/drillgram
ENV DRILLGRAM_SERVER_BIN=/usr/local/bin/drillgram
CMD ["pnpm", "test:e2e"]
