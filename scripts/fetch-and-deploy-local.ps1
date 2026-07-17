<#
.SYNOPSIS
  Local race-weekend data fetch for f1gures — the piece CI cannot do.

.DESCRIPTION
  F1's live-timing API does not serve GitHub's Actions runners (every CI fetch
  fails at "Failed to load session info data!"), but it does serve residential
  IPs. So the FastF1 fetch has to run from a machine like this one. This script:

    1. hard-syncs a DEDICATED clone to origin/main (never the dev working copy),
    2. runs scripts/fetch-fastf1.py --auto (fetches any finished session missing
       on disk),
    3. if new session JSON appeared, commits + pushes it to main and dispatches
       deploy.yml so the site rebuilds and the new tab goes live.

  Intended to run on a schedule (Task Scheduler) every ~15 min during race
  weekends. Idempotent and safe to run any time: a no-op poll fetches nothing,
  commits nothing, deploys nothing. Runs against its own clone so it can
  `git reset --hard` without ever touching your development checkout.

.NOTES
  Set REPO_DIR to the dedicated clone. Requires python (+ fastf1), git, gh on
  this machine. gh must be authenticated (gh auth status) so the deploy
  dispatch works unattended.
#>

$ErrorActionPreference = 'Stop'

# --- config -------------------------------------------------------------
$REPO_DIR = 'C:\Users\rotsm\f1gures-fastf1-bot'
$LOG_DIR  = Join-Path $REPO_DIR '.fetch-logs'
# Explicit tool paths so the task works under a non-interactive scheduler
# environment where PATH may be minimal.
$env:Path = 'C:\Program Files\Git\cmd;C:\Program Files\nodejs;C:\Python314;C:\Python314\Scripts;C:\Users\rotsm\tools\gh\bin;' + $env:Path

New-Item -ItemType Directory -Force -Path $LOG_DIR | Out-Null
$log = Join-Path $LOG_DIR ("fetch-" + (Get-Date -Format 'yyyyMMdd') + ".log")
function Log($m) { "$([DateTime]::UtcNow.ToString('o'))  $m" | Tee-Object -FilePath $log -Append }

try {
  Log "=== run start ==="
  Set-Location $REPO_DIR

  # 1. hard-sync to origin/main (safe: dedicated clone, no dev work here)
  git fetch origin main --quiet
  git checkout main --quiet 2>$null
  git reset --hard origin/main --quiet
  Log "synced to $(git rev-parse --short HEAD)"

  # 2. fetch any finished-but-missing session
  python scripts/fetch-fastf1.py --auto 2>&1 | Tee-Object -FilePath $log -Append

  # 3. commit + push + deploy only if new session data appeared
  git add public/data/fastf1
  if (git diff --cached --quiet; $LASTEXITCODE -eq 0) {
    Log "no new session data — nothing to deploy"
  } else {
    $stamp = [DateTime]::UtcNow.ToString('yyyy-MM-dd HH:mm')
    git -c user.name='f1gures-fastf1-bot' -c user.email='rotsmane@gmail.com' commit -q -m "chore(data): FastF1 session data ($stamp UTC, local fetch)"
    git push origin main --quiet
    Log "pushed new data: $(git rev-parse --short HEAD)"
    gh workflow run deploy.yml 2>&1 | Tee-Object -FilePath $log -Append
    Log "dispatched deploy.yml"
  }
  Log "=== run ok ==="
}
catch {
  Log "ERROR: $($_.Exception.Message)"
  exit 1
}
