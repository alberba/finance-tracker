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
gate() ( cd "$WORKTREE" && pnpm gate )

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

# El encargo sale del mismo sitio que lee el orquestador. Hay uno por runner:
# /implement sólo existe como skill de Claude Code, así que a Codex se le
# explica el flujo por extenso.
TEMPLATE="${REPO_ROOT}/.agents/ticket-prompt.${RUNNER}.md"
PROMPT="$(sed -e "s/{{issue}}/${ISSUE}/g" -e "s|{{title}}|${TITLE}|g" "$TEMPLATE" \
  | sed -n '/^---$/,$p' | tail -n +2)"

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

El intento anterior no pasó el gate. Ejecútalo tú mismo, lee el fallo y corrígelo: pnpm gate"
done

# --- publish ------------------------------------------------------------
cd "$WORKTREE"
if [ -z "$(git status --porcelain)" ] && [ -z "$(git log --oneline "origin/${BASE}..HEAD" 2>/dev/null)" ]; then
  say "nothing changed — not publishing"
  exit 1
fi

# El agente commitea su propio trabajo (/implement lo hace, y a Codex se le
# pide). Esto es la red por si dejó algo sin commitear.
if [ -n "$(git status --porcelain)" ]; then
  say "committing what the agent left uncommitted"
  git add -A
  git commit -q -m "$(printf '%s\n\nImplementa el ticket #%s (spec #136).\n\nCloses #%s' \
    "feat: ${TITLE}" "$ISSUE" "$ISSUE")"
fi
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
