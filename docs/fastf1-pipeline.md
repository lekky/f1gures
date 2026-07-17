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
- `.fastf1-cache/` (gitignored) holds FastF1's raw-response cache; reruns are
  fast and mostly offline.

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

## Ops

- **`.github/workflows/fetch-fastf1.yml`** polls **every 15 minutes across
  race weekends** (Fri–Sun + early Monday, UTC). Two-stage gate keeps that
  affordable: `scripts/fastf1-pending.mjs` (Node built-ins, sub-second, no
  installs — its SESSION_MINUTES/GRACE constants must stay in sync with the
  Python script) ends the run right after checkout when no recently-finished
  session is missing on disk; a pending session triggers the Python fetch +
  commit; only an actual data change triggers npm ci + build + FTP. It shares
  the `deploy` concurrency group with the other two deploy workflows. Net
  latency: charts are live within ~15 min of FastF1 publishing a session
  (FastF1 itself publishes ~30–60 min after the chequered flag). The gate's
  30h lookback means permanently-missing sessions don't keep the poll hot —
  those are manual-backfill territory via `workflow_dispatch` or a local run.
- **Backfill**: FastF1 covers 2018+ (telemetry-complete). Run the script per
  round locally and commit, e.g.
  `for /l %r in (1,1,8) do python scripts/fetch-fastf1.py 2026 %r`. The next
  build picks the pages up automatically — no config needed.
- If FastF1's schema shifts (new season quirks), the workflow's fetch step
  fails loudly but deploys nothing; the site keeps serving the last good data.
