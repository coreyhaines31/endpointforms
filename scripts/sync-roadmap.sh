#!/usr/bin/env bash
# Regenerates ROADMAP.md from GitHub issues so the local list can't drift
# from the tracker. Run: npm run roadmap
set -euo pipefail

REPO="${REPO:-coreyhaines31/endpointforms}"
OUT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/ROADMAP.md"

phase_title () {
  case "$1" in
    phase-1-foundation) echo "Phase 1 — Foundation" ;;
    phase-2-plan)       echo "Phase 2 — Plan the site" ;;
    phase-3-build)      echo "Phase 3 — Build" ;;
    phase-4-distribute) echo "Phase 4 — Distribute" ;;
    *)                  echo "Unphased" ;;
  esac
}

{
  echo "# Roadmap — Part 1: Marketing site & assets"
  echo
  echo "> Generated from GitHub issues by \`npm run roadmap\`. Don't hand-edit —"
  echo "> edit the issue and re-run, or the two will drift."
  echo
  echo "Last synced: $(date -u '+%Y-%m-%d %H:%M UTC')"
  echo

  for phase in phase-1-foundation phase-2-plan phase-3-build phase-4-distribute; do
    rows=$(gh issue list --repo "$REPO" --label "$phase" --state all \
             --json number,title,state --jq \
             '.|sort_by(.number)|.[]|"\(.number)\t\(.title)\t\(.state)"')
    [ -z "$rows" ] && continue
    echo "## $(phase_title "$phase")"
    echo
    while IFS=$'\t' read -r num title state; do
      [ -z "$num" ] && continue
      box="[ ]"; [ "$state" = "CLOSED" ] && box="[x]"
      echo "- $box **#$num** [$title](https://github.com/$REPO/issues/$num)"
    done <<< "$rows"
    echo
  done

  open=$(gh issue list --repo "$REPO" --milestone "Part 1 — Marketing site & assets" --state open --json number --jq 'length')
  closed=$(gh issue list --repo "$REPO" --milestone "Part 1 — Marketing site & assets" --state closed --json number --jq 'length')
  echo "---"
  echo
  echo "**$closed done / $((open + closed)) total**"
} > "$OUT"

echo "Wrote $OUT"
