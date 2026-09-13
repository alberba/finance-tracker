#!/usr/bin/env bash
#
# Runs one lane: its tickets in order, each stacked on the previous one's
# branch. Lanes are grouped by blast radius rather than by theme, so two lanes
# running at once rarely touch the same file.
#
#   scripts/run-lane.sh A        # runs lane A in the foreground
#   scripts/run-lane.sh A &      # …or in the background, one lane per shell
#
# A lane stops at the first ticket whose gate fails: everything after it was
# going to build on that work anyway.
#
set -euo pipefail

LANE="${1:?lane: A|B|C|D|E}"
BASE_DEFAULT="mal-guardado-v2-multiusuario"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ticket:runner:model:effort
case "$LANE" in
  A) TICKETS=(137:claude::high 138:claude::high 139:claude:claude-sonnet-5:high) ;;
  B) TICKETS=(140:claude::high 141:claude:claude-sonnet-5:high 142:claude:claude-sonnet-5:medium) ;;
  C) TICKETS=(155:claude::high 143:claude:claude-opus-5:medium 144:codex::medium 145:codex::medium 146:codex::medium 147:claude:claude-opus-5:medium) ;;
  D) TICKETS=(151:claude:claude-opus-5:medium 152:codex::medium) ;;
  E) TICKETS=(150:codex::medium 153:codex::medium 154:codex::medium) ;;
  *) echo "unknown lane: $LANE" >&2; exit 2 ;;
esac

BASE="$BASE_DEFAULT"
for entry in "${TICKETS[@]}"; do
  IFS=: read -r issue runner model effort <<<"$entry"
  printf '\n\033[1;34m── lane %s · ticket #%s (base %s) ──\033[0m\n' "$LANE" "$issue" "$BASE"
  "${HERE}/run-ticket.sh" "$issue" "$BASE" "$runner" "$model" "$effort"
  # Stack the next ticket on this one: they build on each other by design.
  BASE="ticket/${issue}"
done

printf '\n\033[1;32mlane %s complete\033[0m\n' "$LANE"
