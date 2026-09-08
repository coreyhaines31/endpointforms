#!/usr/bin/env bash
#
# Fails when `main` carries commits `development` does not (#86).
#
# ## Why this exists
#
# Two fixes were merged straight to `main` and never came back: the database TLS
# fix (7227a8a, 31 Aug) and the seed guard (0f7bcb8). `development` carried
# neither for over a month. The seed guard is the one that mattered —
# `npm run db:seed` from the branch everyone works from could still reach a
# hosted database, which is the exact accident it was written to prevent.
#
# **Nothing would have told us.** The release PRs merged cleanly the whole time,
# because the divergence did not touch the same lines until it finally did. So
# "CI is green and the PR merged" was never evidence that the branches agreed,
# and it cost a wrong diagnosis before anyone noticed: a fix was reported as
# reverted, and production as affected, when neither was true.
#
# Merge commits are excluded because a merge that exists only on `main` — every
# release merge — is not work `development` is missing.
#
# Usage:
#   scripts/check-branch-divergence.sh [base] [head]
# Defaults to origin/main and origin/development.
set -euo pipefail

BASE="${1:-origin/main}"
HEAD_REF="${2:-origin/development}"

if ! git rev-parse --verify --quiet "$BASE" >/dev/null; then
  echo "check-branch-divergence: cannot resolve '$BASE'." >&2
  exit 2
fi
if ! git rev-parse --verify --quiet "$HEAD_REF" >/dev/null; then
  echo "check-branch-divergence: cannot resolve '$HEAD_REF'." >&2
  exit 2
fi

missing=$(git log --oneline --no-merges "$HEAD_REF..$BASE")

if [ -n "$missing" ]; then
  echo "FAIL: $BASE has commits $HEAD_REF does not have."
  echo
  echo "$missing" | sed 's/^/  /'
  echo
  echo "A hotfix merged to main is not finished until it is back-merged."
  echo "Open a back-merge PR before releasing:"
  echo
  echo "  git checkout -b chore/backmerge-main && git merge $BASE"
  echo "  # resolve, then: gh pr create --base development"
  exit 1
fi

echo "OK: $HEAD_REF contains everything on $BASE."
