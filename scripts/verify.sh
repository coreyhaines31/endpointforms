#!/usr/bin/env bash
#
# One command that says yes or no, honestly.
#
# This exists because `next build` prints "Compiled successfully" *before* it
# type checks and *before* it collects page data. Grepping for that string
# reports a passing build for one that fails, and a broken build sat on main
# for hours because of exactly that. Every step here is checked by its exit
# code. Nothing greps for success.
set -uo pipefail

failed=()
run () {
  local name="$1"; shift
  printf '\n\033[1m── %s ──\033[0m\n' "$name"
  if "$@"; then
    printf '\033[32m   PASS\033[0m  %s\n' "$name"
  else
    printf '\033[31m   FAIL\033[0m  %s (exit %s)\n' "$name" "$?"
    failed+=("$name")
  fi
}

run "lint"      npm run --silent lint
run "typecheck" npx tsc --noEmit
run "build"     npm run --silent build
run "tests"     npm run --silent test

printf '\n────────────────────────────────\n'
if [ ${#failed[@]} -eq 0 ]; then
  printf '\033[32mAll checks passed.\033[0m\n'
  exit 0
fi
printf '\033[31m%d check(s) failed:\033[0m\n' "${#failed[@]}"
printf '  - %s\n' "${failed[@]}"
exit 1
