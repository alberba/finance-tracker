#!/usr/bin/env bash
# Prepara un worktree recién creado para dev y E2E.
# `.dev.vars` está en .gitignore, así que un worktree nuevo no lo tiene: sin él
# el fixture E2E falla en `POST /api/state/reset-legacy` con 403.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
main_checkout="$(git worktree list --porcelain | sed -n '1s/^worktree //p')"

if [[ ! -f .dev.vars ]]; then
  if [[ -f "$main_checkout/.dev.vars" && "$main_checkout" != "$PWD" ]]; then
    cp "$main_checkout/.dev.vars" .dev.vars
    echo "setup-worktree: .dev.vars copiado de $main_checkout"
  else
    cp .dev.vars.example .dev.vars
    echo "setup-worktree: .dev.vars creado desde .dev.vars.example (sin claves de mercado)"
  fi
fi

# Las dos variables que CI escribe para Playwright (.github/workflows/playwright.yml).
ensure_var() {
  grep -q "^$1=" .dev.vars || { printf '%s=%s\n' "$1" "$2" >> .dev.vars; echo "setup-worktree: añadido $1"; }
}
ensure_var TEST_AUTH_ENABLED true
ensure_var LEGACY_OWNER_EMAIL legacy-owner@e2e.test

[[ -d node_modules ]] || pnpm install --frozen-lockfile
