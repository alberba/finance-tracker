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

# El reparto vive en .agents/tickets.json, que es también lo que lee el
# orquestador: un solo sitio donde cambiar modelo, esfuerzo o carril.
MANIFEST="${HERE}/../.agents/tickets.json"
mapfile -t TICKETS < <(
  python3 -c "
import json,sys
lane=sys.argv[1]
d=json.load(open(sys.argv[2]))
for t in d['tickets']:
    if t['lane']==lane:
        print(':'.join([str(t['issue']),t['runner'],t['model'] or '',t['effort']]))
" "$LANE" "$MANIFEST"
)
[ ${#TICKETS[@]} -gt 0 ] || { echo "carril sin tickets: $LANE" >&2; exit 2; }

BASE="$BASE_DEFAULT"
for entry in "${TICKETS[@]}"; do
  IFS=: read -r issue runner model effort <<<"$entry"
  printf '\n\033[1;34m── lane %s · ticket #%s (base %s) ──\033[0m\n' "$LANE" "$issue" "$BASE"
  "${HERE}/run-ticket.sh" "$issue" "$BASE" "$runner" "$model" "$effort"
  # Stack the next ticket on this one: they build on each other by design.
  BASE="ticket/${issue}"
done

printf '\n\033[1;32mlane %s complete\033[0m\n' "$LANE"
