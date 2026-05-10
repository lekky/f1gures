# f1gures - F1 Tracking site

A multi-page F1 stats site built with **Astro 4 SSG + React 18 islands**.
Pages are prerendered at build time (so Google sees real HTML, not a stub),
React only hydrates the interactive bits (theme toggle, year picker,
sortable standings, charts). Live data comes from the
[Jolpica F1 API](https://github.com/jolpica/jolpica-f1) (a free, no-auth
successor to the old Ergast API), with the 1950–2024 historical archive
bundled from the [Ergast CSV dump](http://ergast.com/mrd/) at `data/history/`.

## What's in the box

```
/
├── src/
│   ├── pages/                       Astro pages (one route each)
│   │   ├── index.astro              Home / dashboard
│   │   ├── standings-drivers.astro  Driver championship + chart + H2H
│   │   ├── standings-constructors.astro
│   │   ├── calendar.astro           Full season calendar
│   │   └── circuits.astro           Circuit index
│   ├── layouts/
│   │   └── BaseLayout.astro         Shared <head> (SEO meta, OG, JSON-LD,
│   │                                pre-hydration theme script)
│   ├── components/
│   │   ├── Chrome.astro             Top nav + mobile bar + bottom nav
│   │   └── islands/                 React islands (hydrated on the client)
│   │       ├── ThemeToggle.jsx
│   │       ├── YearPicker.jsx
│   │       ├── StandingsDropdown.jsx
│   │       └── screens/             The actual screen components
│   ├── lib/
│   │   └── shared.jsx               Panel, DriverCell, Countdown, urlFor,
│   │                                useIsMobile, fmtDate, fmtDateLong, etc.
│   └── data/
│       └── buildFallback.js         Speculative 2026 grid + helpers
│
├── public/
│   ├── css/{app,site}.css           Design system + responsive overrides
│   ├── images/drivers/<id>.webp     Driver headshots
│   ├── images/circuits/             Track maps (black + white outline SVGs)
│   ├── data/<year>.json             Pre-fetched season bundles (2020–2025)
│   ├── data/careers/<id>.json       Driver career totals (refreshed nightly)
│   ├── favicon.svg, robots.txt, site.webmanifest
│   └── {driver,race,circuit,team}.html  Legacy detail pages (Babel-compiled
│                                    in browser; replaced by Astro routes
│                                    in PR 2)
│
├── data/history/                    Ergast CSV dump 1950–2024 (build-time
│                                    only, never served)
│
├── scripts/
│   ├── fetch-careers.mjs            Refresh public/data/careers/ from Jolpica
│   ├── fetch-season.mjs             Snapshot a season into public/data/
│   └── build-archive.mjs            (PR 2) Ergast CSV importer
│
├── astro.config.mjs                 Static output, trailing-slash always
├── package.json                     Astro 4 + React 18 + Recharts (npm)
└── .github/workflows/
    ├── deploy.yml                   npm ci && build → FTP from dist/
    └── refresh-careers.yml          Nightly cron
```

## Develop

```
npm install
npm run dev           # Astro dev server with HMR at http://localhost:4321/
npm run build         # Production build → dist/
npm run preview       # Serve dist/ locally for production-shape preview
```

The user works across two machines; the no-Node one can serve the prebuilt
`dist/` (when committed) via:
```
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .claude\serve-dist.ps1
```

## Deploy

GitHub Actions on push to `main`:
1. `npm ci && npm run build` - Astro builds to `dist/`
2. FTP-Deploy uploads `dist/` contents to the live server

No manual steps. Merge the PR and the site updates automatically.

## Where the data comes from

**Live data** (drivers, constructors, calendar, race results, qualifying,
sprint results, standings, session schedules):
[Jolpica F1](https://api.jolpi.ca) - free, no API key, no auth, generous rate
limits (≈500/hour). For PR 1 the listing pages use the bundled fallback;
PR 2 wires real season-aware data via build-time imports of
`public/data/<year>.json` and (for 1950–2024) the Ergast CSVs in
`data/history/`.

**Static lookup data** (circuit length, corners, longest straight, DRS zones,
tyre deg, lap record, blurb): bundled in `src/data/buildFallback.js`.
These don't change between seasons.

**Driver career stats**: `public/data/careers/<jolpicaId>.json`,
refreshed nightly via the `refresh-careers` workflow.

## Adding a historic season

```
node scripts/fetch-season.mjs 2024
```
Writes `public/data/2024.json`. Once committed, the legacy detail pages
and (PR 2) the Astro build will use the local bundle instead of hitting
Jolpica.

## Refreshing driver career stats

```
node scripts/fetch-careers.mjs
```
Writes/updates `public/data/careers/<jolpicaId>.json`. Polite with Jolpica's
rate limit (sequential drivers, retries on 429/503/network errors).
Skips writes when stats are unchanged.

## Configuration

### Force the bundled fallback (legacy detail pages only)
Append `?offline=1` to a `driver.html` / `race.html` URL.

### Use a different API server (proxy or self-hosted Jolpica)
Set `window.F1_API_BASE` before the legacy detail HTML's `js/api.js` loads.
Useful if you run [your own Jolpica instance](https://github.com/jolpica/jolpica-f1)
or want to put a CDN in front.

## How it works under the hood

- **Listing pages**: pure Astro. The page component imports `buildFallback()`,
  passes the data object to a React island as a prop, Astro pre-renders the
  resulting markup at build time. The island hydrates only the interactive
  parts (sortable headers, Recharts charts, head-to-head dropdowns).
- **Detail pages** (driver/race/circuit/team): still the legacy stack - plain
  HTML in `public/`, Babel compiles JSX in the browser, `js/api.js` fetches
  Jolpica or `public/data/<year>.json` and replaces `window.F1_DATA`. Will be
  ported to Astro `getStaticPaths` in PR 2.
- **Theme**: `<script is:inline>` in `BaseLayout.astro` reads
  `localStorage.f1-theme` and toggles `html.light` *before* CSS paints, killing
  the dark→light flash.
- **No `?v=` cache-busting**: Vite hashes built assets in `dist/_astro/*.[hash].js`
  automatically.

## API endpoints used

The legacy loader and the (PR 2) build-time fetcher hit these Jolpica
endpoints (under `https://api.jolpi.ca/ergast/f1/<year>/`):

| Endpoint | Purpose |
|---|---|
| `/{year}/` | Season schedule with practice/quali/sprint times per round |
| `/{year}/drivers/` | Driver list (name, code, number, nationality) |
| `/{year}/constructors/` | Constructor list (name, nationality) |
| `/{year}/driverstandings/` | Driver→team mapping + last completed round |
| `/{year}/{round}/results/` | Race results for one completed round |
| `/{year}/{round}/qualifying/` | Qualifying times for one completed round |
| `/{year}/{round}/sprint/` | Sprint results (sprint weekends only) |

If you want richer per-session data (tyre stints, sector times, telemetry,
weather, race control messages), [OpenF1](https://openf1.org) covers that
ground for 2023+ - also free, also no auth.

## Notes

- Jolpica's terms ask you to be respectful of their rate limit (≈500
  req/hour, with burst). The 1-hour cache means a typical user generates
  fewer than 30 requests per session. PR 2 moves most data to build-time,
  cutting runtime calls to the bare minimum (current-year live overlay only).
- Tested in Chromium-based browsers. Should work in Firefox and Safari too.
