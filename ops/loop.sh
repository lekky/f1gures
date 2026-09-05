#!/usr/bin/env bash
# One tick of the f1gures ops loop. Run every LOOP_INTERVAL_SECONDS by the
# container entrypoint (ops/Dockerfile), or by hand:
#
#   docker exec <container> bash /data/repo/ops/loop.sh            # normal tick
#   docker exec <container> bash /data/repo/ops/loop.sh --force    # rebuild + redeploy now
#
# What a tick does (each step idempotent, safe to repeat):
#   1. hard-sync the clone to origin/main (gitignored build caches survive:
#      node_modules, public/images/og, public/data/archive, dist)
#   2. fetch the current season from Jolpica; commit + push the bundle if it
#      changed (this is what refresh-current-season.yml used to do)
#   3. if HEAD differs from the last deployed sha (code merged, data pushed by
#      step 2 or by the local FastF1 job, or --force): npm ci when the lockfile
#      changed, npm run build, sanity-check dist/, SFTP-mirror to Hostmedia
#   4. once a day, run the team-principals watchdog (ops/watchdog.sh)
#
# Failure policy: a failed build/deploy records the sha in last-failed-sha and
# is NOT retried until main moves again (or --force / the force-deploy file),
# so a broken main doesn't burn the VPS's 2 vCPUs every 10 minutes. A no-op
# tick (nothing changed) costs one git fetch + one Jolpica fetch.
#
# Env (set in Coolify; see docs/ops-vps.md):
#   GITHUB_TOKEN            required (push bundle commits; watchdog issues)
#   SSH_HOST                required for deploy
#   SSH_PRIVATE_KEY_B64     required for deploy (base64 of the PEM), or SSH_PRIVATE_KEY raw
#   SSH_PORT=22  SSH_USER=helloweb  REMOTE_DIR=f1gures.app
#   DEPLOY_DISABLED=1       build but skip the SFTP upload (first bring-up / dry run)
#   SKIP_SEASON_FETCH=1     skip the Jolpica step (off-season, debugging)
set -uo pipefail

DATA_DIR="${DATA_DIR:-/data}"
STATE="$DATA_DIR/state"
REPO_DIR="$DATA_DIR/repo"
mkdir -p "$STATE"

log() { printf '%s  %s\n' "$(date -u +%FT%TZ)" "$*"; }
die() { log "ERROR: $*"; exit 1; }

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1
if [ -f "$STATE/force-deploy" ]; then FORCE=1; rm -f "$STATE/force-deploy"; fi

# ── single-flight ──────────────────────────────────────────────────────────
exec 9>"$STATE/loop.lock"
if ! flock -n 9; then log "another tick is running - skipping"; exit 0; fi

cd "$REPO_DIR" || die "no repo at $REPO_DIR"
log "=== tick start (force=$FORCE) ==="

# ── 1. sync to origin/main ─────────────────────────────────────────────────
git fetch origin main -q || die "git fetch failed"
git checkout -q main 2>/dev/null || true
git reset -q --hard origin/main || die "git reset failed"
log "synced to $(git rev-parse --short HEAD)"

# ── 2. current-season refresh (Jolpica → public/data/<year>.json) ─────────
if [ "${SKIP_SEASON_FETCH:-0}" != "1" ]; then
  YEAR=$(date -u +%Y)
  BUNDLE="public/data/${YEAR}.json"
  if node scripts/fetch-season.mjs "$YEAR"; then
    git add "$BUNDLE"
    if git diff --cached --quiet; then
      log "season bundle unchanged"
    else
      git commit -q -m "chore(data): ${YEAR} season refresh" \
        && log "bundle changed - committed $(git rev-parse --short HEAD)"
      if git push -q origin main; then
        log "pushed bundle"
      else
        # Someone else (the local FastF1 job) pushed in between. Build with
        # the local commit anyway; next tick resets to origin/main, re-fetches
        # and pushes cleanly.
        log "WARN: push failed (concurrent push?) - deploying local bundle, will retry next tick"
      fi
    fi
  else
    log "WARN: fetch-season.mjs failed - keeping existing bundle"
    git checkout -q -- "$BUNDLE" 2>/dev/null || true
  fi
fi

# ── 3. decide whether to build + deploy ────────────────────────────────────
HEAD=$(git rev-parse HEAD)
LAST=$(cat "$STATE/last-deployed-sha" 2>/dev/null || echo "")
FAILED=$(cat "$STATE/last-failed-sha" 2>/dev/null || echo "")

if [ "$FORCE" = 0 ]; then
  if [ "$HEAD" = "$LAST" ]; then
    log "nothing to deploy (HEAD == last deployed)"
    bash "$REPO_DIR/ops/watchdog.sh" || true
    log "=== tick done (no-op) ==="
    exit 0
  fi
  if [ "$HEAD" = "$FAILED" ]; then
    log "HEAD $HEAD already failed once - not retrying until main moves (or --force)"
    bash "$REPO_DIR/ops/watchdog.sh" || true
    exit 0
  fi
fi
log "deploying ${HEAD:0:7} (last deployed: ${LAST:0:7})"

fail() {
  echo "$HEAD" > "$STATE/last-failed-sha"
  log "ERROR: $*"
  log "=== tick FAILED ==="
  exit 1
}

# npm ci only when the lockfile changed (or node_modules is missing).
LOCK_HASH=$(sha256sum package-lock.json | cut -c1-16)
if [ ! -d node_modules ] || [ "$(cat "$STATE/lock-hash" 2>/dev/null)" != "$LOCK_HASH" ]; then
  log "package-lock changed - npm ci"
  npm ci --no-audit --no-fund --loglevel=error || fail "npm ci failed"
  echo "$LOCK_HASH" > "$STATE/lock-hash"
fi

# prebuild → astro build. OG images live in the volume (gitignored), so the
# generator's on-disk cache does the job actions/cache used to.
log "building"
BUILD_LOG="$STATE/last-build.log"
if ! timeout 45m npm run build > "$BUILD_LOG" 2>&1; then
  tail -n 40 "$BUILD_LOG"
  fail "build failed (full log: $BUILD_LOG)"
fi

FILES=$(find ./dist -type f | wc -l)
log "dist/ has $FILES files"
[ "$FILES" -ge 1000 ] || fail "dist/ has only $FILES files (<1000) - refusing to mirror --delete against the live site"

if [ "${DEPLOY_DISABLED:-0}" = "1" ]; then
  log "DEPLOY_DISABLED=1 - build ok, skipping upload"
  echo "$HEAD" > "$STATE/last-deployed-sha"
  rm -f "$STATE/last-failed-sha"
  exit 0
fi

# ── SFTP mirror (same lftp recipe as deploy.yml) ───────────────────────────
: "${SSH_HOST:?SSH_HOST is required for deploy}"
SSH_USER="${SSH_USER:-helloweb}"
SSH_PORT="${SSH_PORT:-22}"
REMOTE_DIR="${REMOTE_DIR:-f1gures.app}"
KEY="$STATE/deploy_key"
if [ -n "${SSH_PRIVATE_KEY_B64:-}" ]; then
  printf '%s' "$SSH_PRIVATE_KEY_B64" | base64 -d > "$KEY"
elif [ -n "${SSH_PRIVATE_KEY:-}" ]; then
  printf '%s\n' "$SSH_PRIVATE_KEY" > "$KEY"
else
  fail "SSH_PRIVATE_KEY_B64 (or SSH_PRIVATE_KEY) is required for deploy"
fi
chmod 600 "$KEY"

log "uploading to $SSH_USER@$SSH_HOST:$REMOTE_DIR via SFTP"
if ! lftp -c "
  set cmd:fail-exit true;
  set sftp:auto-confirm yes;
  set sftp:connect-program 'ssh -a -x -i $KEY -p $SSH_PORT -o StrictHostKeyChecking=accept-new';
  set net:max-retries 3;
  set net:timeout 30;
  set mirror:parallel-transfer-count 10;
  open -u \"$SSH_USER,\" sftp://$SSH_HOST;
  mirror --reverse --delete --parallel=10 -X .well-known -X cgi-bin ./dist/ $REMOTE_DIR/;
"; then
  fail "SFTP upload failed"
fi

echo "$HEAD" > "$STATE/last-deployed-sha"
rm -f "$STATE/last-failed-sha"
date -u +%FT%TZ > "$STATE/last-deployed-at"
log "deployed ${HEAD:0:7}"

bash "$REPO_DIR/ops/watchdog.sh" || true
log "=== tick done ==="
