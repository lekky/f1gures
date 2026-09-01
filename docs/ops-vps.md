# Ops loop on the VPS (Coolify)

The scheduled build/deploy work that used to run as cron-triggered GitHub
Actions now runs as one long-lived container on the user's Coolify VPS
(`box1.hellowebdesign.co.uk`, Hostmedia: 2 vCPU / 4 GB RAM / 40 GB, Ubuntu
24.04, also hosts PocketBase). Actions minutes were the constraint: the
weekend 10-minute Jolpica poll alone burned ~1,200 free minutes a month, most
of them no-ops. A VPS bills nothing per minute, so the loop can be dumb and
frequent.

| Was (GitHub Actions) | Now |
| --- | --- |
| `refresh-current-season.yml` crons (nightly + every 10 min Sat/Sun) | `ops/loop.sh` step 2, every tick |
| `deploy.yml` 3×-daily batched crons + "unchanged" gate | `ops/loop.sh` step 3, every tick, gated on HEAD ≠ last-deployed |
| `check-principals.yml` daily cron | `ops/watchdog.sh`, once per UTC day |
| local `fetch-and-deploy-local.ps1` → `gh workflow run deploy.yml` | local job just pushes; the loop notices HEAD moved |
| `ci.yml` (vitest on PRs / pushes) | **unchanged** - stays on Actions, cheap and wired into PR checks |

All three workflows keep their `workflow_dispatch` trigger as a manual
fallback (e.g. the VPS is down), but nothing schedules them any more.

## What runs

- **`ops/Dockerfile`** - toolchain image only: Node 22, git, lftp, ssh, jq.
  No repo code baked in. The entrypoint clones `lekky/f1gures` into the
  `/data` volume on first start, then every `LOOP_INTERVAL_SECONDS` (600)
  runs `ops/loop.sh` *from the clone*. Merging a change to `ops/loop.sh` or
  `ops/watchdog.sh` therefore takes effect on the next tick with no image
  rebuild; only Dockerfile changes need a redeploy in Coolify.
- **`ops/loop.sh`** - one tick: hard-sync to `origin/main` → Jolpica season
  fetch, commit + push the bundle if changed → if HEAD ≠ last deployed sha:
  `npm ci` (only when `package-lock.json` changed), `npm run build`, refuse
  to deploy if `dist/` has < 1,000 files, `lftp` SFTP mirror to Hostmedia
  (the exact recipe from `deploy.yml`) → run the watchdog.
- **`ops/watchdog.sh`** - the team-principals Wikipedia check, opening one
  deduped GitHub issue on drift via the REST API.

State lives in `/data/state/`: `last-deployed-sha`, `last-failed-sha`,
`lock-hash`, `last-build.log`, `watchdog-last-run`, `deploy_key`. The gitignored
build caches (`node_modules`, `public/images/og`, `public/data/archive`,
`dist`) live in the clone and survive ticks because `git reset --hard` leaves
ignored files alone - so the OG images regenerate only when their inputs
change, the same job `actions/cache` used to do.

**Failure policy:** a failed build or upload writes `last-failed-sha` and is
not retried until `main` moves again. This stops a broken `main` from
rebuilding every 10 minutes on a 2-vCPU box. To retry the same sha:
`docker exec <ctr> bash /data/repo/ops/loop.sh --force`, or
`touch /data/state/force-deploy` inside the container.

**Latency:** a merge to `main` (or a bundle/FastF1 push) is live within one
tick (≤ 10 min) plus the build (~10–15 min on 2 vCPU) plus the upload (a few
minutes). Faster than the old 3×-daily batching; slower than the old
per-push deploys, which is fine.

## One-time Coolify setup

### 1. Host prep (SSH to the VPS as root)

A build peak can touch ~2.5 GB. With PocketBase on the same 4 GB box, add
swap so a peak never OOM-kills anything:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### 2. Secrets

- **GitHub fine-grained PAT** (Settings → Developer settings → Fine-grained
  tokens): repository access = `lekky/f1gures` only; permissions
  **Contents: read & write** (clone + push bundle commits) and **Issues: read
  & write** (watchdog). Set a long expiry and put a calendar reminder on it.
- **Deploy SSH key**: the same `github_deploy` private key already used by
  `deploy.yml` (see [deploy-ssh.md](deploy-ssh.md)). Base64-encode it so it
  survives Coolify's env editor as a single line:

  ```bash
  base64 -w0 github_deploy.pem
  ```

### 3. Create the resource

Coolify → project (a new one, e.g. **f1gures-ops**) → **New Resource** →
**Dockerfile** (paste the contents of `ops/Dockerfile`), or **Git → Private
repository (GitHub App)** with *Base Directory* `/ops` and build pack
*Dockerfile*. Either works; the pasted variant needs no git source at all
because the repo is cloned at runtime.

Settings:

- **General** → *Ports Exposes*: leave empty (nothing listens). Turn off
  any health check that expects HTTP.
- **Persistent Storage** → add a volume mounted at **`/data`**. Without it
  every restart re-clones and rebuilds the OG cache from scratch.
- **Resource limits** → memory **3 GB**, CPUs **1.5** (leave headroom for
  PocketBase and the host).
- **Environment variables**:

  | Name | Value |
  | --- | --- |
  | `GITHUB_TOKEN` | the fine-grained PAT |
  | `SSH_HOST` | the Hostmedia SSH host (same as the `SFTP_HOST` repo secret) |
  | `SSH_PORT` | the SSH port (`22` unless cPanel says otherwise) |
  | `SSH_PRIVATE_KEY_B64` | the base64 line from step 2 |
  | `DEPLOY_DISABLED` | `1` **for the first run only** (see step 4) |

  Optional: `SSH_USER` (default `helloweb`), `REMOTE_DIR` (default
  `f1gures.app`), `LOOP_INTERVAL_SECONDS` (default `600`), `GITHUB_REPO`
  (default `lekky/f1gures`), `WATCHDOG_HOUR_UTC` (default `05`),
  `SKIP_SEASON_FETCH=1` in the off-season.

  `REMOTE_DIR` is relative to the SSH home (`/home/helloweb`); f1gures.app is
  an addon domain whose docroot is the `f1gures.app` folder, **not**
  `public_html`. A wrong value combined with `--delete` would mirror over the
  wrong site - see deploy-ssh.md.

### 4. First run, then go live

Deploy with `DEPLOY_DISABLED=1`. Watch the container logs: the first tick
clones, runs `npm ci`, and does a full build including all ~2,300 OG images
(expect 15–25 min on 2 vCPU). It should end with
`DEPLOY_DISABLED=1 - build ok, skipping upload` and `dist/ has N files`.

Then remove `DEPLOY_DISABLED`, redeploy, and force one real upload:

```bash
docker exec -it $(docker ps -qf name=f1gures-ops) bash /data/repo/ops/loop.sh --force
```

Check https://f1gures.app loads and the Hostmedia docroot still has
`.well-known/` and `cgi-bin/` (excluded from the mirror on purpose).

### 5. Turn the Actions crons off

Already done in the repo: `deploy.yml`, `refresh-current-season.yml` and
`check-principals.yml` have no `schedule:` any more. Nothing else to disable
on GitHub. The repo secrets (`SSH_PRIVATE_KEY`, `SSH_PORT`, `SFTP_*`) stay so
the dispatch fallbacks keep working.

## Local FastF1 job (still local, on purpose)

F1's live-timing host refuses datacenter IPs. Verified 2026-09-01 from the
VPS: a completed session (2026 Dutch GP qualifying) returns "Failed to load
session info data!" for every live-timing endpoint, exactly as it did from
GitHub's runners, while the same call works from a residential connection.
So `scripts/fetch-and-deploy-local.ps1` keeps running on Windows Task
Scheduler, but it now only fetches, commits and pushes; it no longer
dispatches `deploy.yml`. The VPS loop sees `main` move and builds. If it is
ever worth getting the fetch off the home PC, the options are a residential
proxy or a Tailscale exit node through a home device - both still depend on
a residential connection somewhere.

## Day-to-day

- **Logs**: Coolify → the resource → Logs. Each tick logs `=== tick start`
  … `=== tick done`. `last-build.log` in `/data/state` has the full build
  output of the most recent build.
- **Publish now**: `--force` as above. Or just wait for the next tick - any
  push to `main` deploys itself.
- **Something's stuck**: restart the container in Coolify. The `flock` in
  `loop.sh` is per-process so a restart clears it.
- **VPS down**: run `deploy.yml` / `refresh-current-season.yml` by hand on
  GitHub (`workflow_dispatch`) until it's back. When the VPS returns it will
  redeploy the current `main` on its first tick (its last-deployed sha is
  stale), which is harmless.
- **Rotate the PAT**: update `GITHUB_TOKEN` in Coolify and redeploy. The
  token is only held in the environment (git uses a credential helper), never
  written to the volume.
