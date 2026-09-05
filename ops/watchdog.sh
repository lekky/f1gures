#!/usr/bin/env bash
# Daily team-principals watchdog, run from ops/loop.sh (replaces the cron in
# .github/workflows/check-principals.yml, which is now dispatch-only).
#
# Once per UTC day, at or after WATCHDOG_HOUR_UTC (default 05), runs
# scripts/check-principals.mjs against Wikipedia. On drift (exit 1) it opens
# ONE GitHub issue - deduped by title - for a human to verify and hand-edit
# scripts/principals.mjs. Flag-only: never edits data. Uses the GitHub REST
# API with the container's GITHUB_TOKEN (needs issues: write), no gh CLI.
set -uo pipefail

DATA_DIR="${DATA_DIR:-/data}"
STATE="$DATA_DIR/state"
REPO_DIR="$DATA_DIR/repo"
GITHUB_REPO="${GITHUB_REPO:-lekky/f1gures}"
HOUR_UTC="${WATCHDOG_HOUR_UTC:-05}"
TODAY=$(date -u +%F)
STAMP="$STATE/watchdog-last-run"

log() { printf '%s  [watchdog] %s\n' "$(date -u +%FT%TZ)" "$*"; }

[ "$(cat "$STAMP" 2>/dev/null)" = "$TODAY" ] && exit 0
[ "$(date -u +%H)" -ge "$HOUR_UTC" ] || exit 0

cd "$REPO_DIR" || exit 1
REPORT="$STATE/watchdog-report.md"
log "running check-principals"
node scripts/check-principals.mjs > "$REPORT" 2>&1
STATUS=$?
echo "$TODAY" > "$STAMP"

if [ "$STATUS" = 0 ]; then
  log "no drift"
  exit 0
fi

log "drift detected (exit $STATUS)"
: "${GITHUB_TOKEN:?GITHUB_TOKEN is required to open the watchdog issue}"
TITLE="Team principal watchdog: data needs a look"
API="https://api.github.com"
AUTH=(-H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28")

Q="repo:${GITHUB_REPO} is:issue is:open in:title \"${TITLE}\""
OPEN=$(curl -sS "${AUTH[@]}" --get --data-urlencode "q=$Q" "$API/search/issues" | jq -r '.total_count // 0')
if [ "$OPEN" != "0" ]; then
  log "an open watchdog issue already exists - not filing another"
  exit 0
fi

BODY=$(jq -n --arg t "$TITLE" --rawfile b "$REPORT" '{title: $t, body: $b, labels: ["data"]}')
if curl -sS -f "${AUTH[@]}" -X POST "$API/repos/$GITHUB_REPO/issues" -d "$BODY" > /dev/null; then
  log "opened issue: $TITLE"
else
  # Label may not exist - retry without it rather than lose the report.
  BODY=$(jq -n --arg t "$TITLE" --rawfile b "$REPORT" '{title: $t, body: $b}')
  curl -sS -f "${AUTH[@]}" -X POST "$API/repos/$GITHUB_REPO/issues" -d "$BODY" > /dev/null \
    && log "opened issue (unlabelled): $TITLE" \
    || log "ERROR: failed to open issue; report kept at $REPORT"
fi
