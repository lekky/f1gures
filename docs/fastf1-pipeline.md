# FastF1 pipeline & the race-weekend Visualisation Explorer

Race pages for weekends with FastF1 data get a tabbed **Weekend Analysis**
experience: a sticky session bar (FP1 → … → Race), per-session results blocks,
and a dark **Visualisation Explorer** card with ~30 interactive charts, every
one exportable as a branded share PNG in three social formats
(16:9 1920×1080 for Reddit/X, 1:1 1080×1080 feed, 9:16 1080×1920 story).

```
scripts/fetch-fastf1.py  ──►  public/data/fastf1/<year>/<round>/
                                index.json           (manifest: schedule + hasData)
                                fp1.json fp2.json fp3.json
                                sprintQuali.json sprint.json q.json race.json
                                          │
     RacePage.astro (build time) ─ checks index.json exists ─► RaceWeekendBody.astro
                                          │
     RaceWeekendIsland.jsx (client) ─ fetches the session JSONs ─► charts
```

## The Python side (`scripts/fetch-fastf1.py`)

Run by hand or by the `fetch-fastf1.yml` workflow — **not** part of
`npm run prebuild` (the Python/FastF1 cost is quarantined off the Node build,
like `build:climate`). Requires `pip install -r scripts/requirements-fastf1.txt`.

```
python scripts/fetch-fastf1.py 2026 9              # whole weekend
python scripts/fetch-fastf1.py 2026 9 --session q  # one session
python scripts/fetch-fastf1.py 2026 9 --force      # refetch existing files
python scripts/fetch-fastf1.py --auto              # current season: fetch every
                                                   # finished session missing on disk
```

Design decisions:

- **Heavy analysis happens in Python**, so session JSONs stay ~20-80 KB:
  mini-sector dominance, pole-lap speed/delta traces (resampled on a distance
  grid, delta end anchored to the official lap-time gap), the track outline
  from the pole lap's GPS (normalized, rotation from `circuit_info`), long-run
  detection, pit-lane durations, SC/VSC lap bands, thinned weather samples
  (wind converted m/s → km/h).
- **UI-state-dependent derivations happen client-side** in
  `src/components/islands/raceweekend/derive.js` (gap-to-leader, positions per
  lap, overtake detection, tyre-deg smoothing, undercut windows, fuel-corrected
  pace) — vitest-covered via `derive.test.js`.
- Outputs are **deterministic** (sorted driver keys, fixed rounding, no
  timestamps) and **committed to the repo** like the season bundles.
- A session is only fetched once its scheduled end + 40 min grace has passed;
  one failed session never kills the rest of the weekend.
- The schedule comes from the season bundle's calendar (falls back to the
  FastF1 event schedule), so manifest times match the site's session tables.
- `.fastf1-cache/` (gitignored) holds FastF1's raw-response cache; local reruns
  are fast and mostly offline. **CI deliberately does not persist this cache
  across runs** — FastF1 caches the empty "not ready" responses from polling a
  session before its archive is published, and a restored cache would re-serve
  that stale empty forever, permanently stranding the session. Each CI run
  starts fresh and queries the live API; `--auto`/`--force` also pass
  `force_renew=True` (renews the processed-session cache layer).

Session JSON shapes (schema 1): every file carries `drivers` (classification
order, with `ref` = Ergast driverRef and `teamId` + `color` mapped from the
season bundle — the frontend uses `ref` for driver-page links and headshots)
and `weather`. Driver faces + team logos are resolved at build time in
`RaceWeekendBody.astro` (via `driverFaceExists.js` / `teamLogo.js`) and passed
to the island as URL maps, so the client never probes for missing images. Race/sprint files add compact per-lap arrays
`[lap, t, pos, compound, tyreLife, stint, pit, neutral, green]` plus `stints`,
`pitStops` (pit-lane transit, not stationary time — FastF1 has no stationary
timing), `trackStatus` bands and `raceControl`. Quali files add `results`
(Q1-3), `sectors`, `lapsAll`, `poleTel`, `dominance`, `track`. Practice files
add `order`, `lapsAll`, `longRuns`, `speedTraps`.

## The frontend side

- `src/components/RacePage.astro` mounts `RaceWeekendBody.astro` **only when
  the manifest exists on disk at build time**; every other race keeps the plain
  server-rendered body. Mid-weekend, holding pages get the tabs too — sessions
  without data show a live countdown (or "data pending" once started).
- `src/components/islands/RaceWeekendIsland.jsx` renders the session bar +
  results blocks (from the archive race doc, so results are in the prerendered
  HTML for SEO) and the explorer. Deep-linkable:
  `/races/2026/9/?session=q&viz=dominance`.
- Charts live in `src/components/islands/raceweekend/charts-*.jsx` with shared
  SVG primitives in `primitives.jsx`. The explorer card is **always dark** in
  both site themes (its `--vx-*` vars are deliberately not remapped by
  `html.light`); results blocks use normal theme tokens. Styles: the
  "RACE WEEKEND ANALYSIS" section of `public/css/app.css`.
- Share cards: `raceweekend/share.js` serialises the chart SVG (or HTML via
  `foreignObject` for table-style charts) onto a branded canvas. Filename:
  `f1gures-<race>-<year>-<chart>-<16x9|1x1|9x16>.png`.

## Ops — the fetch runs LOCALLY, not in CI

**Key constraint: FastF1 cannot run on GitHub's runners.** F1's live-timing API
refuses datacenter IPs — every CI fetch failed at `Failed to load session info
data!`, while the identical `fastf1.get_session(...).load()` succeeds from a
residential IP seconds later. This is not a cache or code bug (we ruled both
out on the live 2026 Belgian FP2); it's the F1 API declining cloud egress. So:

- **`scripts/fetch-and-deploy-local.ps1`** is the real automation. Windows Task
  Scheduler runs it every ~15 min Fri–Sun on a residential machine. It
  hard-syncs a **dedicated clone** (`C:\Users\rotsm\f1gures-fastf1-bot` — never
  the dev checkout, so its `git reset --hard` is safe), runs
  `scripts/fetch-fastf1.py --auto`, and if new session JSON appeared, commits to
  `main` and dispatches `deploy.yml`. Net latency: a session is live within
  ~15 min of FastF1 publishing it, **provided the machine is on and online** —
  that's the tradeoff of local fetching. Logs land in the clone's
  `.fetch-logs/`.
- **`.github/workflows/fetch-fastf1.yml`** is kept **dispatch-only** as a manual
  fallback (it still runs the gate + fetch + build + FTP when dispatched) in
  case F1 ever serves cloud IPs or the fetch is pointed at a self-hosted runner
  with residential egress. Its schedule is disabled — it only ever failed.
- **`deploy.yml`** does the actual build + FTP for locally-committed data (the
  local script dispatches it; its 3×-daily schedule is the fallback).
- **Backfill**: FastF1 covers 2018+ (telemetry-complete). Run the script per
  round **on a residential machine** and commit, e.g.
  `for /l %r in (1,1,8) do python scripts/fetch-fastf1.py 2026 %r`. The next
  build picks the pages up automatically.
- `scripts/fastf1-pending.mjs` (a sub-second Node gate; SESSION_MINUTES/GRACE
  constants must stay in sync with the Python script) is still used by the
  dispatch-only workflow to decide whether a pending session exists.
