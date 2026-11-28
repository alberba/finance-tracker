#!/usr/bin/env bash
# Prepara un worktree recién creado (o el checkout principal) para dev y E2E.
# `.dev.vars` está en .gitignore, así que un worktree nuevo no lo tiene: sin él
# el fixture E2E no puede inyectar una identidad local. Sin las
# migraciones locales, `pnpm dev` arranca contra una D1 vacía.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
main_checkout="$(git worktree list --porcelain | sed -n '1s/^worktree //p')"

node scripts/setup-local.mjs

if [[ ! -f .dev.vars ]]; then
  if [[ -f "$main_checkout/.dev.vars" && "$main_checkout" != "$PWD" ]]; then
    cp "$main_checkout/.dev.vars" .dev.vars
    echo "setup-worktree: .dev.vars copiado de $main_checkout"
  else
    cp .dev.vars.example .dev.vars
    echo "setup-worktree: .dev.vars creado desde .dev.vars.example (sin claves de mercado)"
  fi
fi

# La variable que CI escribe para Playwright (.github/workflows/playwright.yml).
ensure_var() {
  grep -q "^$1=" .dev.vars || { printf '%s=%s\n' "$1" "$2" >> .dev.vars; echo "setup-worktree: añadido $1"; }
}
ensure_var TEST_AUTH_ENABLED true
# Better Auth no arranca sin secreto; cada worktree tiene el suyo.
ensure_var BETTER_AUTH_SECRET "$(openssl rand -base64 32)"

# Better Auth valida el origen contra esta URL: la del puerto propio de este worktree.
node scripts/dev-worktree.mjs --sync-url

pnpm install --frozen-lockfile

pnpm d1:migrate:local:v2 >/dev/null
echo "setup-worktree: migraciones D1 locales (v2) aplicadas"
