#!/usr/bin/env bash
# For a step of a chart test: reaches the app of the release in $NAMESPACE through a port
# forward, checks that it serves the web app and its health, signs in as the admin, then runs
# the shell command given with $APP (the app's address) and $COOKIE (the session) set.
set -euo pipefail
tmp=$(mktemp -d)
pid=
trap 'if [ -n "$pid" ]; then kill "$pid" 2>/dev/null || true; fi; rm -rf "$tmp"' EXIT
kubectl -n "$NAMESPACE" port-forward service/drillgram :8080 >"$tmp/forward" 2>&1 &
pid=$!
port=
for ((attempt = 0; attempt < 50; attempt++)); do
  port=$(sed -n 's/^Forwarding from 127\.0\.0\.1:\([0-9]*\) -> 8080$/\1/p' "$tmp/forward")
  if [ -n "$port" ]; then break; fi
  kill -0 "$pid"
  sleep 0.2
done
test -n "$port"
export APP="http://127.0.0.1:$port" COOKIE="$tmp/cookie"
curl -fsS "$APP/" | grep -q '<title>Drillgram</title>'
curl -fsS "$APP/api/health" >/dev/null
curl -fsS -c "$COOKIE" -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.org","password":"helm-test-admin"}' "$APP/api/auth/login" >/dev/null
bash -ec "$1"
