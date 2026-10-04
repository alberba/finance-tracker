#!/usr/bin/env bash
# PreToolUse (Bash): `gh issue view N --comments` prints nothing in this
# environment (exit 0, empty output), so reject it and name the form that works.
command="$(jq -r '.tool_input.command // empty')"
if [[ "$command" =~ gh[[:space:]]+issue[[:space:]]+view ]] && [[ "$command" == *--comments* ]] && [[ "$command" != *--json* ]]; then
  echo 'Aquí `gh issue view --comments` no imprime nada. Usa: gh issue view N --json title,body,comments' >&2
  exit 2
fi
exit 0
