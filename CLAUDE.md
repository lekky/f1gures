# f1gures

Multi-page F1 stats site. **Astro 4 SSG with React 18 islands.** Every page is prerendered at build time (~2,310 HTMLs covering listing pages plus per-driver/race/circuit/team detail pages from the Ergast 1950–2024 archive plus hand-curated 2025/2026 bundles). React only hydrates the interactive bits (theme toggle, year picker, sortable standings, charts). FTP-deployed from `dist/`.

## Build pipeline

```
npm install
npm run build       # runs prebuild → astro build
npm run preview     # serve dist/ for production-shape preview
npm run dev         # dev server with HMR at http://localhost:4321/
```

`prebuild` runs two scripts in order:
1. `scripts/build-archive.mjs` - parses `data/history/*.csv` (Ergast dump) and writes per-entity JSONs into `public/data/archive/` (gitignored). Then does a second pass over every `public/data/<year>.json` bundle with year > 2024: emits race archive JSONs for completed rounds (those with results), appends them to `_races-index.json` so `getStaticPaths` prerenders them, and merges race entries + championship standings into driver docs. The Astro routes' `getStaticPaths` reads those at build time.
2. `scripts/sync-current-season.mjs` - copies the highest-numbered `public/data/<year>.json` to `src/data/currentSeason.json` (gitignored). The 5 listing-page islands import that JSON via [src/data/currentSeason.js](src/data/currentSeason.js) so the prerendered HTML reflects real current standings instead of the speculative grid in `buildFallback.js`.

Both are idempotent - safe to run repeatedly.

If you only touch the importer and want to skip Astro: `npm run build:archive`. To refresh the current-season JSON from Jolpica without waiting for the nightly cron: `npm run fetch:current` then `npm run sync:current`.

## Key files

### Astro shell
- `src/layouts/BaseLayout.astro` - shared `<head>` (SEO meta, OG/Twitter, canonical, JSON-LD, theme pre-hydration script, content-hashed CSS cache-bust). Every page renders inside it.
- `src/components/Chrome.astro` - desktop top nav + mobile top bar + mobile bottom nav. Static markup; islands slot in for interactivity.
- `src/lib/shared.jsx` - React helpers + components used inside islands: `Panel`, `SectionHead`, `ChangeIndicator`, `StatusPill`, `SprintBadge`, `DriverCell`, `Countdown`, `DriverSilhouette`, plus `urlFor`, `navigate`, `getParam`, `useIsMobile`, `fmtDate`, `fmtDateLong`. **`urlFor` holds the team/circuit alias maps and the `ARCHIVE_MAX_YEAR` guard** - see Conventions.
- `src/lib/assetHash.js` - content-hashes a public asset at build time for `?v=<hash>` cache-busts; the URL only changes when the file changes, so HTML stays byte-identical across PRs that don't touch CSS.
- `src/lib/yearAwareData.js` - `useYearAwareData(fallback)` hook. SSR/initial render uses the 2026 fallback (the prerendered HTML, for SEO); on hydration it reads `?year=` / `localStorage.f1-year` and swaps `data` for the matching `/data/<year>.json`.

### React islands
- `src/components/islands/{ThemeToggle,YearPicker,StandingsDropdown}.jsx` - chrome interactivity.
- `src/components/islands/{Home,Calendar,CircuitsIndex,DriverStandings,ConstructorStandings}Island.jsx` - thin wrappers; each calls `useYearAwareData(currentSeason)` (from `src/data/currentSeason.js`) and passes `data` to the matching screen.
- `src/components/islands/screens/*.jsx` - the actual screens. Take `data` (full F1_DATA shape) as a prop. **Never read `window.F1_DATA`** - that pattern is gone.
- `src/components/islands/screens/StandingsCommon.jsx` - shared chart components (`PointsChart`, `TeamProgressionChart`) and `HeadToHead`. Imports Recharts from npm. Auto-chunked by Vite, so Recharts only loads on the two standings pages.

### Pages

**Listing routes** (use the year-aware islands above):
- `src/pages/{index,calendar,circuits,standings-drivers,standings-constructors}.astro`

**Prerendered detail routes** - pure server-rendered Astro markup, no React island, no client JS:
- `src/pages/drivers/[driverRef].astro` → `src/components/DriverPage.astro` - ~862 driver pages
- `src/pages/races/[year]/[round].astro` → `src/components/RacePage.astro` - ~1,153 race pages (1,125 Ergast + 28 from hand-curated bundles)
- `src/pages/circuits/[circuitRef].astro` → `src/components/CircuitPage.astro` - ~77 circuits
- `src/pages/teams/[constructorRef].astro` → `src/components/TeamPage.astro` - ~212 constructors
- `src/pages/404.astro`

**Legacy URL redirects** in `public/`:
- `driver.html`, `race.html`, `circuit.html`, `team.html` - small client-side redirect docs that fetch `_*-index.json` from `/data/archive/` to resolve `?id=NOR` → `/drivers/norris/`, etc. Preserves bookmarks and outbound search-engine links.

### Data
- `src/data/buildFallback.js` - speculative 2026 grid + `buildFromYearJson(json)` factory. Last-resort fallback when no current-season bundle exists.
- `src/data/currentSeason.js` - picks `buildFromYearJson(currentSeason.json)` if the prebuild-synced bundle has drivers; otherwise falls back to `buildFallback()`. This is what the 5 listing islands import as their SSR data.
- `src/data/currentSeason.json` (**gitignored, generated by prebuild**) - copy of the highest-numbered `public/data/<year>.json`. Refreshed nightly by `.github/workflows/refresh-current-season.yml`.
- `public/data/<year>.json` - season bundles. Hand-curated for 2020–2025 (rich session/circuit metadata). 1950–2019 generated by `build-archive.mjs` from the CSVs. The current calendar year (2026) is fetched nightly from Jolpica and committed by the refresh workflow. Bundles for years > 2024 are also consumed by `build-archive.mjs` to generate race archive JSONs and driver standings for post-Ergast seasons.
- `public/data/archive/` (**gitignored, generated by prebuild**):
  - `_drivers-index.json`, `drivers/<driverRef>.json`
  - `_races-index.json`, `races/<year>/<round>.json`
  - `_circuits-index.json`, `circuits/<circuitRef>.json`
  - `_teams-index.json`, `teams/<constructorRef>.json`
  - `_driver-codes.json` - code→driverRef map for the `/driver.html?id=NOR` redirect
- `data/history/*.csv` - Ergast Database CSV dump (1950–2024, ~22 MB). Build-time only, never served. Excluded from `dist/` because it's at repo root, not in `public/`.

### Assets
- `public/css/{app,site}.css` - design tokens + global styles. Linked from BaseLayout with content-hashed `?v=<hash>`.
- `public/images/drivers/<driverRef>.webp` - ~32 modern driver headshots. SVG silhouette fallback when missing.
- `public/images/circuits/{black-outline,white-outline}/<id>.svg` - track maps; CSS picks the variant by `html.light`. The SVG basenames diverge from Ergast circuitRefs in a few cases - see `SVG_FOR_REF` in `CircuitPage.astro`.
- `public/favicon.svg`, `public/site.webmanifest`, `public/robots.txt`, `public/images/og-default.png`.

## Conventions

- **Branch naming**: `fix/`, `feat/`, `chore/` prefixes.
- **Never read `window.F1_DATA` in islands** - pass `data` via prop. The Astro page's island wrapper builds the F1 object; the screen consumes it pure.
- **Year-aware listing pages**: islands wrap their screen with `useYearAwareData(buildFallback())`. Don't bypass - direct `buildFallback()` consumers won't react to the year picker.
- **Trailing slash**: Astro is configured `trailingSlash: 'always'`, `build.format: 'directory'` - pages emit `dist/<route>/index.html`. Internal links must end with `/`.
- **`urlFor` aliases & guards** in `src/lib/shared.jsx`:
  - `TEAM_ID_ALIAS`: `redbull` → `red_bull`, `aston` → `aston_martin` (buildFallback ↔ Ergast)
  - `CIRCUIT_ID_ALIAS`: `albert` → `albert_park`, `marina` → `marina_bay`, `lasvegas` → `vegas`, `yas` → `yas_marina`, `montreal` → `villeneuve`, `cota` → `americas`, `spielberg` → `red_bull_ring`
  - `ARCHIVE_MAX_YEAR = 2025` - race URLs for years ≤ this generate `/races/<y>/<r>/` links directly; years past it fall through to `/race.html?round=N&year=Y`. The redirect checks `_races-index.json` (which now includes completed bundle rounds), so 2026 completed races redirect correctly to their prerendered pages; future rounds redirect to `/calendar/`. The same guard is duplicated in `DriverPage.astro` and `CircuitPage.astro` via local `raceUrl()` helpers - bump in all three when a new year's data is complete enough to fully prerender (i.e. the season bundle is finalised and all rounds have results).
- **Astro template gotcha**: don't write `r.year <= ARCHIVE_MAX_YEAR` inline in a JSX expression - Astro's compiler parses `<=` as a tag opener and errors with *"Unable to assign attributes when using <> Fragment shorthand syntax"*. Wrap the comparison in a function defined in the frontmatter.
- **Dark mode tokens**: `:root` holds dark defaults; `html.light` overrides for light mode. Pre-hydration `<script is:inline>` in BaseLayout reads `localStorage.f1-theme` and toggles `html.light` *before* paint, killing the dark→light flash.
- **Mobile responsive**: prefer CSS `@media (max-width: 720px)` over JS `useIsMobile()` for layout-only decisions. SSR has no `window` so JS-driven layouts emit the desktop variant in HTML and snap to mobile only after hydration - visible flash on slow phones, persistent breakage if JS fails. `css/site.css` has overrides forcing `repeat(N, 1fr)` inline grids back to `1fr` below 720px.
- **Driver code collisions**: many historic drivers have no Ergast `code` field, so the importer derives one from surname (first 3 chars). For per-season bundles, that collides for shared surnames (1961: Phil Hill + Graham Hill → both `HIL`). Use `driverRef` (always unique slug like `phil_hill`) as `id` in season JSONs; `code` stays as the display label only.
- **SEO meta**: every Astro page passes `title`, `description`, `canonicalPath`, optional `ogType`, `jsonLd`, `breadcrumb` to BaseLayout. Origin is hard-coded as `https://f1gures.app`. Sitemap is auto-generated by `@astrojs/sitemap` from the page graph - no manual updates.
- **Buy Me a Coffee widget**: BMC `<script>` tag at the bottom of `BaseLayout.astro`. Restyled in `css/app.css` (`#bmc-wbtn` overrides). Don't `display: none` - breaks the modal.
- **CalendarScreen race card links**: `href` is conditional - only set when `result` exists for the round. Upcoming/future rounds get `href={undefined}` and `cursor: default` (intentionally non-navigable). Completed rounds link to `/race.html?round=N&year=Y`, which redirects via `_races-index.json` to `/races/<year>/<round>/`.
- **Worktree rebase before PRs**: Worktrees accumulate commits that may already be merged to `origin/main` via different commit hashes (squash merges, etc.). Always run `git fetch origin main && git rebase origin/main` before pushing a PR from a worktree - otherwise `gh pr view <n> --json files` will list files from old already-merged commits, which would overwrite more recent main changes on merge.

## Adding a historic season bundle

```
node scripts/fetch-season.mjs 2024
```

Writes `public/data/2024.json` (hand-curated bundle with sessions). Once committed, the year-aware islands and the importer's post-archive merge step (for circuit page race history) will pick it up.

For years already covered by Ergast (≤ 2024), the importer's CSV-derived bundle is generated automatically; only run `fetch-season.mjs` when the CSV is missing data or you want richer session metadata.

## Deploy

Two GitHub Actions workflows write to the live server, sharing a `concurrency: deploy` group so they can't overlap:

- **`deploy.yml`** - push to `main`. `npm ci && npm run build` (prebuild → Astro build), then FTP sync.
- **`refresh-current-season.yml`** - nightly cron at 04:00 UTC (also `workflow_dispatch`-able). Runs `node scripts/fetch-season.mjs $(date +%Y)` to pull the current year from Jolpica into `public/data/<year>.json`, commits the bundle if it changed (so future builds have it cached), then build + FTP. The fetch step is non-fatal - if Jolpica is down or the year hasn't started, the existing bundle is reused and the deploy proceeds.

The first deploy after a heavy PR (lots of new routes, or a CSS edit that re-hashes every HTML's `?v=` cache-bust) can take 20+ minutes and occasionally fails with `ECONNRESET` mid-upload - `gh run rerun <id> --failed` is idempotent and usually clears it.

## Two-machine setup

The user has Node on one machine, not the other. The no-Node box can serve a prebuilt `dist/` (when present locally) via a static PowerShell HTTP server at `.claude/serve-dist.ps1`. With Node, `npm run preview` is the canonical local server.

## Useful URL flags
- `?year=YYYY` on any listing page - overrides `localStorage.f1-year`. e.g. `https://f1gures.app/calendar/?year=1990` (the `useYearAwareData` hook checks the URL param first, then falls through to localStorage). Years 1950–2025 have JSON bundles; older or future years silently fall back to the 2026 grid.

## Post-Ergast data notes
- **Championships**: Ergast CSVs cover 1950–2024 only. `build-archive.mjs` computes `bundleStandings` (year → Map<driverRef, champPosition>) from race-result points in hand-curated bundles. Championships for completed bundle years (`year < new Date().getFullYear()`) are credited via `bundleChampionships` in the driver-doc recompute pass. Anything touching post-Ergast career stats should use `bundleStandings` rather than rebuilding the logic.
