# Runs the e2e journeys headless in the official Playwright image.
# Keep the tag equal to the @playwright/test version in apps/web/package.json.
# Build from the repo root: docker build -f apps/web/e2e/Dockerfile -t drillgram-e2e .
# Run without network:      docker run --rm --init --ipc=host --network none drillgram-e2e
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

FROM mcr.microsoft.com/playwright:v1.64.1-noble

# The engine is built: bin/engine only checks that it is there.
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

COPY . .
COPY --from=engine /src/packages/layout/target/wasm32-unknown-unknown/release/tidy_layout.wasm packages/layout/pkg/
COPY --from=engine /crates.json /crates.json
ENV DRILLGRAM_CRATES=/crates.json
CMD ["pnpm", "test:e2e"]
