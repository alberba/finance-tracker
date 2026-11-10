#!/usr/bin/env bash
# Compare the committed Linux baselines with Playwright's Linux Chromium and an
# isolated build/database. Extra arguments are passed unchanged to Playwright.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
pnpm check:deps
exec node scripts/run-browser-linux.mjs pnpm exec playwright test --grep @visual "$@"
