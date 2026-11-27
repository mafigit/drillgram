# Drillgram as one image: the server with the built web app inside. `docker compose up --build`
# (compose.yaml) runs it with a PostgreSQL. Alone:
#
#   docker build -t drillgram .       from the repo root, with the submodule packages/layout there
#
# Versions match mise.toml. The image of the checks is another one (apps/web/e2e/Dockerfile).
#
# Every stage that builds runs on the machine's own platform ($BUILDPLATFORM), also for an image of
# another one: the engine and the web app are the same on all of them, and Go compiles for the
# target ($TARGETARCH). Only the last stage, which builds nothing, is the target's. Emulated, the
# arm64 half of a release took 15 minutes on a runner (2026-11-27).

# The layout engine, compiled to WebAssembly.
FROM --platform=$BUILDPLATFORM rust:1.99.1-slim AS engine
RUN rustup target add wasm32-unknown-unknown
WORKDIR /src/packages/layout
COPY packages/layout/Cargo.toml packages/layout/Cargo.lock ./
COPY packages/layout/src src
RUN cargo build --release --locked --target wasm32-unknown-unknown

# The web app.
FROM --platform=$BUILDPLATFORM node:26.13.0-bookworm-slim AS web
# The engine is built: its package only checks that it is there.
ENV CI=1 TIDY_LAYOUT_PREBUILT=1
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/model/package.json packages/model/
COPY packages/layout/package.json packages/layout/
COPY deploy/licences/package.json deploy/licences/
# The image has no corepack: install the pnpm version pinned in packageManager.
RUN npm install -g "$(node -p 'require("./package.json").packageManager')" \
  && pnpm install --frozen-lockfile
COPY apps/web apps/web
COPY packages/model packages/model
COPY packages/layout/bin packages/layout/bin
COPY packages/layout/js packages/layout/js
COPY --from=engine /src/packages/layout/target/wasm32-unknown-unknown/release/tidy_layout.wasm packages/layout/pkg/
RUN pnpm --filter @drillgram/web run build-only

# The server, and the licence texts of the modules that are in it: they go where the program goes.
FROM --platform=$BUILDPLATFORM golang:1.27.4-bookworm AS server
WORKDIR /src/apps/server
COPY apps/server/go.mod apps/server/go.sum ./
RUN go mod download
COPY apps/server .
RUN go run github.com/google/go-licenses/v2@v2.0.1 save ./... --ignore github.com/mafigit/drillgram --save_path /licences/go
# The one step that differs from platform to platform.
ARG TARGETOS TARGETARCH
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags='-s -w' -o /drillgram ./cmd/drillgram

# What runs: the program and the app, as a user who owns nothing. No shell, no package manager.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=server /drillgram /drillgram
COPY --from=web /src/apps/web/dist /web
COPY LICENSE NOTICE /licences/
COPY --from=server /licences/go /licences/go
ENV DRILLGRAM_LISTEN=:8080 DRILLGRAM_WEB_DIR=/web
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=4s --start-period=20s CMD ["/drillgram", "health"]
ENTRYPOINT ["/drillgram"]
