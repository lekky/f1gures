# Data flow

There is no runtime API layer. All third-party data (Ergast CSVs, Jolpica,
Open-Meteo) is fetched or parsed **at build time**; the browser only ever
fetches the site's own prerendered JSON. The old `window.F1_DATA` /
`F1_READY` / Babel-in-browser architecture is gone.

## Build-time pipeline

`npm run build` triggers `prebuild` (six scripts, in order — see
[CLAUDE.md](../CLAUDE.md#build-pipeline)) and then `astro build`.

### 1. All-time archive → detail pages

```
data/history/*.csv (Ergast 1950–2024)
        │
        ▼
scripts/build-archive.mjs
        │  + second pass over public/data/<year>.json bundles (years > 2024)
        │  + lineage attach (scripts/lineages.mjs)
        │  + records pass (scripts/records/) → 17 leaderboards
        ▼
public/data/archive/          (gitignored)
  _drivers-index.json          drivers/<ref>.json
  _teams-index.json            teams/<ref>.json
  _circuits-index.json         circuits/<ref>.json
  _races-index.json            races/<year>/<round>.json
  _records-index.json          records/<topic>.json
  _driver-codes.json           (CODE → driverRef, for legacy redirects)
```

`src/data/archive.js` (`getDriversIndex`, `getDriver`, `getTeamsIndex`, …)
reads these with `resolve(process.cwd(), …)` paths; every detail route's
`getStaticPaths` is fed from it. `stats.astro` and the records pages read
`_records-index.json` / `records/*.json` directly at build time.

### 2. Season bundles → year-aware listing pages

```
public/data/<year>.json        (2020–2026 committed; 1950–2019 generated
        │                       from the CSVs by build-archive; current year
        │                       refreshed from Jolpica by the cron workflow)
        ▼
scripts/sync-current-season.mjs   copies highest-numbered bundle to
        ▼
src/data/currentSeason.json    (gitignored)
        ▼
src/data/currentSeason.js      buildFromYearJson(json, circuitProfiles)
        │                      + attaches weather-next.json and climate/*
        ▼
the 5 year-aware islands import it as their SSR fallback
(Home, Calendar, CircuitsIndex, DriverStandings, ConstructorStandings)
```

`buildFromYearJson` (in `src/data/buildFallback.js`) produces the full data
object screens consume — `drivers`, `teams`, `calendar`, `results`,
`computeStandings()` (delegating to `src/lib/seasonStats.mjs`, the single
source of truth for points math). With no bundle it yields an
`_empty: true` shape and screens render placeholders — there is
deliberately no speculative grid.

### 3. Weather and climate

- `scripts/fetch-weather.mjs` (prebuild, best-effort, never fails the
  build): finds the next race in the synced calendar and, if it's within
  14 days, pulls an hourly forecast from Open-Meteo for that circuit's
  lat/lng (`scripts/circuit-latlng.json`) → `src/data/weather-next.json`
  (gitignored).
- `scripts/build-climate.mjs` (manual `npm run build:climate`): 10-year
  ERA5 climate normals per circuit → `src/data/climate/<ref>.json`
  (gitignored).
- `src/data/currentSeason.js` attaches both via `import.meta.glob` so
  missing files can't break the build. Only `HomeScreen`'s next-race
  session widget consumes them: live forecast preferred, climate normals
  as the fallback (rendered with a "climate" tag) via
  `SessionWeatherCell` / `SessionWeatherExpand` / `WeatherIcon` and the
  helpers in `src/lib/weather.js`.

### 4. Mobile app feed

`scripts/build-app-feed.mjs` (last prebuild step) writes the versioned
feed the native apps consume to `public/data/app/v1/` — see
[app-data-feed.md](app-data-feed.md) for the contract. Standings are
precomputed via `seasonStats.mjs`, so the apps ship no scoring rules.

## Client-side runtime fetches

All against the site's own origin:

| Who | When | What |
|---|---|---|
| `useYearAwareData` (`src/lib/yearAwareData.js`) | user picks a non-current year | `/data/<year>.json`, rebuilt client-side with `buildFromYearJson`. Precedence: `?year=` URL param overrides `localStorage.f1-year`; empty/`current`/same-year means "use the SSR data, no fetch". On fetch error it falls back to the SSR data |
| `DriversIndexIsland` / `TeamsIndexIsland` | on mount | `/data/archive/_drivers-index.json` / `_teams-index.json` (all-time rosters) |
| `SearchPalette` | first open (lazy, module-cached) | the four `_*-index.json` archive indexes |
| Compare Mode (`CompareLauncher`, `CompareCta`, `compareShared.jsx`) | picking entities | `_drivers-index.json` / `_teams-index.json` for the picker, then `/data/archive/drivers/<ref>.json` or `teams/<ref>.json` per selected entity (cached). Math in `src/lib/compareStats.js` |
| `RaceCountdown` | upcoming race/detail pages | no fetch — reads session ISO timestamps from SSR data attributes and ticks locally |
| `FeedbackForm` | submit | POST to the Cloudflare Worker URL in `src/data/feedbackConfig.js` (the only cross-origin request in the app) |

To avoid a flash of wrong-year content, `BaseLayout.astro` ships an inline
"year guard" script that adds `html.year-pending` (hiding
`[data-year-aware]` sections) when a non-current year is stored, until the
islands hydrate and swap data in.

## Legacy URLs

Old query-string URLs still resolve, two ways:

1. **Server-side (Apache)**: `scripts/build-htaccess.mjs` generates
   `public/.htaccess` with 301 rewrites built from `_driver-codes.json`.
2. **Client-side (everywhere)**: redirect shims in `public/`:
   - `driver.html` fetches `_driver-codes.json` and maps `?id=NOR` →
     `/drivers/norris/`
   - `team.html` / `circuit.html` fetch their index and map `?id=` to the
     entity route
   - `race.html` validates `?year=&round=` against `_races-index.json` →
     `/races/<year>/<round>/` (future rounds → `/calendar/`)
   - `calendar.html`, `circuits.html`, `standings-*.html` are trivial
     `location.replace` shims to the new routes

All shims are `noindex` with a canonical to the new route.

## localStorage keys

Exactly two:

- `f1-theme` — `'light'` | `'dark'`. Written by `ThemeToggle`, read
  pre-paint by the BaseLayout inline script (toggles `html.light`).
- `f1-year` — `'current'` or a 4-digit year. Written by `YearPicker`, read
  by `useYearAwareData` (after the `?year=` param) and by the year-guard
  inline script.

(The Compare temperature/share state and the weather °C/°F unit are *not*
persisted — Compare state lives in the URL, the temp unit is derived from
`navigator.language` each load.)

## Refresh cadence

`.github/workflows/refresh-current-season.yml` runs nightly at 04:00 UTC
**and every 10 minutes Fri–Mon UTC** (race weekends). It fetches the
current year from Jolpica (`scripts/fetch-season.mjs`), commits
`public/data/<year>.json` if it changed, then rebuilds and FTP-deploys.
Because prebuild regenerates everything downstream (archive race pages for
completed rounds, the current-season sync, the app feed), race results
flow to the site and the mobile apps within minutes of landing — the fetch
step is non-fatal, so a Jolpica outage just redeploys existing data.
