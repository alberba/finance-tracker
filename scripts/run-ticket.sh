#!/usr/bin/env bash
#
# Runs one ticket end to end, unattended.
#
#   scripts/run-ticket.sh <issue> <base-branch> [runner] [model] [effort]
#
# The loop is deliberately dumb: a fresh worktree, one agent, a gate, a PR.
# What makes it trustworthy is the gate, not the orchestration — most of these
# tickets ship with a failing round-trip test that says what "done" means, so
# the agent cannot declare victory it hasn't earned.
#
# Nothing is pushed unless lint, typecheck and the whole suite pass locally.
#
set -euo pipefail

ISSUE="${1:?issue number}"
BASE="${2:?base branch}"
RUNNER="${3:-claude}"          # claude | codex
MODEL="${4:-}"                 # passed through to the runner, optional
EFFORT="${5:-medium}"          # low | medium | high | max (claude only)
ATTEMPTS="${ATTEMPTS:-2}"

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")/.." rev-parse --show-toplevel)"
BRANCH="ticket/${ISSUE}"
WORKTREE="${REPO_ROOT}/../.ticket-${ISSUE}"
LOG_DIR="${REPO_ROOT}/.scratch/runner"
LOG="${LOG_DIR}/${ISSUE}.log"

mkdir -p "$LOG_DIR"
say() { printf '\n\033[1m[%s]\033[0m %s\n' "$ISSUE" "$1" | tee -a "$LOG"; }

# --- the gate -----------------------------------------------------------
# Runs in the worktree, before anything is published. A ticket that cannot
# pass this has not been done, whatever the agent says about it.
gate() (
  cd "$WORKTREE"
  npx eslint src tests --max-warnings 0 \
    && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "\.vue'" | { ! grep -q "error TS"; } \
    && npx vitest run --project integration \
    && npx vitest run --project unit
)

# --- setup --------------------------------------------------------------
if git -C "$REPO_ROOT" worktree list | grep -q "$WORKTREE"; then
  say "reusing worktree $WORKTREE"
else
  say "creating worktree $WORKTREE from $BASE"
  git -C "$REPO_ROOT" fetch origin "$BASE" --quiet || true
  git -C "$REPO_ROOT" worktree add -b "$BRANCH" "$WORKTREE" "origin/${BASE}" >>"$LOG" 2>&1 \
    || git -C "$REPO_ROOT" worktree add -b "$BRANCH" "$WORKTREE" "$BASE" >>"$LOG" 2>&1
fi

TITLE="$(gh issue view "$ISSUE" --json title -q .title)"
say "$TITLE"

PROMPT=$(cat <<EOF
Implementa el issue #${ISSUE} de este repositorio ("${TITLE}").

Lee el issue completo con: gh issue view ${ISSUE}
Lee también el spec padre (#136), CONTEXT.md y los ADRs en docs/adr/ antes de tocar código.

Reglas:
- El criterio de "hecho" son los criterios de aceptación del issue. Varios tickets
  tienen ya su test en rojo escrito en tests/integration/d1-v2/round-trip/: ponlos
  en verde sin relajar ninguna aserción ni cambiar lo que afirman.
- Usa el vocabulario de CONTEXT.md y respeta los ADRs.
- No toques ficheros que este ticket no necesita: hay otros agentes trabajando en
  paralelo sobre la misma base.
- Antes de terminar, deja pasando: eslint, tsc y las suites unit e integration.
- No hagas commit, push ni abras PR: de eso se encarga el runner.

Cuando termines, resume en una línea qué cambiaste y por qué.
EOF
)

# --- the loop -----------------------------------------------------------
for attempt in $(seq 1 "$ATTEMPTS"); do
  say "attempt ${attempt}/${ATTEMPTS} with ${RUNNER}${MODEL:+ (${MODEL})}"

  case "$RUNNER" in
    claude)
      ( cd "$WORKTREE" && claude -p "$PROMPT" \
          ${MODEL:+--model "$MODEL"} \
          --permission-mode bypassPermissions ) >>"$LOG" 2>&1 || true
      ;;
    codex)
      codex exec -C "$WORKTREE" ${MODEL:+-m "$MODEL"} \
        --dangerously-bypass-approvals-and-sandbox "$PROMPT" >>"$LOG" 2>&1 || true
      ;;
    *) echo "unknown runner: $RUNNER" >&2; exit 2 ;;
  esac

  if gate >>"$LOG" 2>&1; then
    say "gate passed"
    break
  fi

  say "gate failed"
  if [ "$attempt" -eq "$ATTEMPTS" ]; then
    say "giving up after ${ATTEMPTS} attempts — see ${LOG}"
    gh issue comment "$ISSUE" --body "El runner no consiguió pasar el gate en ${ATTEMPTS} intentos. Log: \`${LOG}\`. La rama \`${BRANCH}\` queda para revisar a mano."
    exit 1
  fi
  PROMPT="${PROMPT}

El intento anterior no pasó el gate. Ejecuta el gate tú mismo, lee el fallo y corrígelo:
  npx eslint src tests --max-warnings 0
  npx tsc --noEmit -p tsconfig.json
  npx vitest run --project integration
  npx vitest run --project unit"
done

# --- publish ------------------------------------------------------------
cd "$WORKTREE"
if [ -z "$(git status --porcelain)" ]; then
  say "nothing changed — not publishing"
  exit 1
fi

git add -A
git commit -q -m "$(printf '%s\n\n%s\n\nCloses #%s\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>' \
  "feat: ${TITLE}" "Implementa el ticket #${ISSUE} (spec #136)." "$ISSUE")"
git push -q -u origin "$BRANCH"

# `gh pr create` has been flaky on this repo (GraphQL 502); REST is the fallback.
PR_URL=$(gh api "repos/{owner}/{repo}/pulls" -X POST \
  -f title="${TITLE}" -f head="${BRANCH}" -f base="${BASE}" \
  -f body="Implementa #${ISSUE}. Spec: #136.

El gate pasó en local antes de publicar: eslint, tsc, y las suites unit e integration.

Closes #${ISSUE}

🤖 Generated with [Claude Code](https://claude.com/claude-code)" --jq .html_url)

say "PR: ${PR_URL}"
gh issue comment "$ISSUE" --body "Implementado por el runner: ${PR_URL}"
