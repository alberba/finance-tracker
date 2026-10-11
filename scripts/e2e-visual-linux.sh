#!/usr/bin/env bash
# Runs the @visual specs in the Linux Playwright image, the platform the
# committed `*-linux.png` snapshots belong to. Needs Docker.
# Starts its own dev server for this worktree on $VISUAL_PORT (default derived
# from the worktree path), so a server from another worktree is never tested by
# mistake. `--ignore-lock` lets it run next to the user's `pnpm dev`.
# Extra args go to Playwright: pnpm test:e2e:visual:linux --update-snapshots
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
pnpm install --frozen-lockfile

docker info >/dev/null 2>&1 || {
  echo "e2e-visual-linux: Docker no responde; arranca Docker Desktop y repite" >&2
  exit 1
}

port="${VISUAL_PORT:-$((5100 + $(printf %s "$PWD" | cksum | cut -d' ' -f1) % 400))}"
image="mcr.microsoft.com/playwright:v$(node -p "require('@playwright/test/package.json').version")-noble"
log=".wrangler/visual-dev-server.log"

if curl -fs -o /dev/null "http://127.0.0.1:$port/"; then
  echo "e2e-visual-linux: el puerto $port ya está ocupado; usa VISUAL_PORT=<otro>" >&2
  exit 1
fi

mkdir -p .wrangler
pnpm d1:migrate:local >/dev/null
pnpm d1:migrate:local:v2 >/dev/null
set -m
PUBLIC_SYNC_V2=true ASTRO_DEV_BACKGROUND=0 pnpm dev --host 127.0.0.1 --port "$port" --ignore-lock >"$log" 2>&1 &
server_pgid=$!
set +m
trap 'kill -- "-$server_pgid" 2>/dev/null || true' EXIT

for _ in $(seq 60); do
  curl -fs -o /dev/null "http://127.0.0.1:$port/" && break
  sleep 2
done
curl -fs -o /dev/null "http://127.0.0.1:$port/" || { echo "e2e-visual-linux: el dev server no arrancó, ver $log" >&2; exit 1; }

docker run --rm --ipc=host -v "$PWD:$PWD" -w "$PWD" \
  -e CI= -e PLAYWRIGHT_BASE_URL="http://127.0.0.1:$port" \
  "$image" \
  sh -c 'node scripts/lib/tcp-proxy.mjs "$0" & sleep 1; exec node node_modules/@playwright/test/cli.js test --grep @visual "$@"' "$port" "$@"
