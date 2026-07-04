# f1gures

Multi-page F1 stats site. **Astro 4 SSG with React 18 islands.** Every page is prerendered at build time (~2,300+ HTMLs covering listing pages plus per-driver/race/circuit/team detail pages from the Ergast 1950–2024 archive plus hand-curated 2025/2026 bundles, plus a records hub, an MDX blog, and a beginner's guide). React only hydrates the interactive bits (theme toggle, year picker, sortable standings, charts, search palette). FTP-deployed from `dist/`.

## Build pipeline

```
npm install
npm run build       # runs prebuild → astro build
npm run preview     # serve dist/ for production-shape preview
npm run dev         # dev server with HMR at http://localhost:4321/ (predev runs build:archive + sync:current)
npm test            # vitest - covers src/lib/ and scripts/
```

`prebuild` runs five scripts in order:
1. `scripts/build-archive.mjs` - parses `data/history/*.csv` (Ergast dump) and writes per-entity JSONs into `public/data/archive/` (gitignored). Then does a second pass over every `public/data/<year>.json` bundle with year > 2024: emits race archive JSONs for completed rounds (those with results), appends them to `_races-index.json` so `getStaticPaths` prerenders them, and merges race entries + championship standings into driver docs. A final pass attaches constructor `lineage` chains to team docs (see `scripts/lineages.mjs`) and computes the 17 record leaderboards (see Records library). The Astro routes' `getStaticPaths` read those at build time.
2. `scripts/generate-og-images.mjs` - renders per-page Open Graph PNGs into `public/images/og/<type>/<slug>.png` using satori + resvg. Cached: only regenerates images whose source data has changed. CI restores the directory from a content-hashed cache.
3. `scripts/sync-current-season.mjs` - copies the highest-numbered `public/data/<year>.json` to `src/data/currentSeason.json` (gitignored). The listing-page islands import that JSON via [src/data/currentSeason.js](src/data/currentSeason.js) so the prerendered HTML reflects real current standings (with no bundle, screens get an empty `_empty: true` shape and render placeholders).
4. `scripts/fetch-weather.mjs` - pulls next-race weather from Open-Meteo into `src/data/weather-next.json` (gitignored). Non-fatal if the API is down (existing data is reused).
5. `scripts/build-htaccess.mjs` - emits `public/.htaccess` (gitignored): Apache `mod_rewrite` 301s that turn legacy `?id=`/`?round=` query-string URLs into server-side redirects to the prerendered routes (better link-equity consolidation than the JS fallback). Silently ignored on non-Apache hosts, where the JS redirect docs still run.
6. `scripts/build-app-feed.mjs` - writes the **mobile-app data feed** to `public/data/app/v1/` (gitignored): manifest + per-season contract files (standings precomputed via `seasonStats.mjs`) + `content.json` (guide/blog/records/facts). The native apps in github.com/lekky/figures-app depend on this shape - **read `docs/app-data-feed.md` before touching it**. Additive-only within v1; deterministic output (no timestamps outside the manifest); a hard failure fails the build on purpose (the FTP sync would otherwise delete the feed from production and strand shipped apps).

All steps are idempotent - safe to run repeatedly.

Two **manual** (not in prebuild) build scripts:
- `npm run build:climate` (`scripts/build-climate.mjs`) - one-shot climate-normals bake. For each circuit in the current calendar, fetches 10 years of ERA5 history from Open-Meteo and writes `src/data/climate/<circuitRef>.json` (gitignored). Re-run only when the calendar adds a circuit or a race date shifts more than ~2 weeks - climate normals don't change overnight, so it's deliberately off the nightly path.
- `npm run build:og` - just the OG-image step, if you only touched OG templates.

Other useful scripts: `npm run build:archive` (skip Astro, just the importer); `npm run fetch:current` then `npm run sync:current` (refresh the current-season JSON from Jolpica without waiting for the nightly cron).

## Design system

The canonical design reference for f1gures lives at `design-system/`.

**Before touching any UI:**

1. Skim `design-system/TOKENS.md` — single-file reference for every token,
   component class name + role, and the drift to avoid. Loads fast.
2. For visual reference, open `design-system/index.html` in a browser —
   the same content rendered with live examples, in both themes.

**Authoring rules:**

- Never hardcode hex. Use the CSS custom properties defined in
  `public/css/app.css`. The light-mode override (`html.light`) remaps
  the same names — hardcoded values break theme parity.
- Two themes are required. Verify dark and `html.light` before merging.
- Don't introduce new card / table variants. Five card classes and two
  table classes already exist — see `design-system/audit.html` for the
  drift to avoid and the migration order.
- The records hero card pattern (`.card-accent` + `.card-bars`) is the
  "colourful and dynamic" pattern to copy for any new leaderboard
  surface (circuit all-time records, home page top-3, etc.).
- Team colour goes on a strip (3 px left), rule (2–4 px top), dot
  (8–12 px round), chip left-edge, or bar fill — never as a panel
  background. The collisions with `--accent` (Ferrari), `--pos`
  (Sauber), and Williams ↔ Racing Bulls are documented in
  `design-system/teams.html`.

When in doubt: the system favors data density, hard corners, condensed
uppercase labels, mono numerics, and `--accent` red used at most once
per screen as a signal of "now / active / leader".

## Key files

### Astro shell
- `src/layouts/BaseLayout.astro` - shared `<head>` (SEO meta, OG/Twitter, canonical, JSON-LD, theme pre-hydration script, content-hashed CSS cache-bust, GA4 tag `G-17WG173FST`, Buy Me a Coffee loader). Every page renders inside it.
- `src/components/Chrome.astro` - desktop top nav + mobile top bar + mobile bottom nav + mobile "More" bottom sheet. Active-route detection runs at build time from `Astro.url.pathname`. Static markup; islands slot in for interactivity (theme toggle, year picker, standings dropdown, search). Nav now has Home / Standings / Calendar / Circuits / Drivers / Teams / Blog / Guide.
- `src/lib/shared.jsx` - React helpers + components used inside islands: `Panel`, `SectionHead`, `ChangeIndicator`, `StatusPill`, `SprintBadge`, `DriverCell`, `Countdown`, `DriverSilhouette`, `Flag`, `TeamLogo`, `MiniChart`, plus `urlFor`, `navigate`, `getParam`, `useIsMobile`, `circuitTz`, `zoneShort`, `fmtDate`, `fmtDateLong`. **`urlFor` holds the team/circuit alias maps and the `ARCHIVE_MAX_YEAR` guard** - see Conventions.
- `src/lib/assetHash.js` - content-hashes a public asset at build time for `?v=<hash>` cache-busts; the URL only changes when the file changes, so HTML stays byte-identical across PRs that don't touch CSS.
- `src/lib/yearAwareData.js` - `useYearAwareData(fallback)` hook. SSR/initial render uses the current-season fallback (the prerendered HTML, for SEO); on hydration it reads `?year=` / `localStorage.f1-year` and swaps `data` for the matching `/data/<year>.json`.

### React islands
- `src/components/islands/{ThemeToggle,YearPicker,StandingsDropdown}.jsx` - chrome interactivity.
- `src/components/islands/SearchPalette.jsx` - global Cmd/Ctrl+K (or `/`) command palette, mounted once in Chrome. Lazy-fetches the four `_*-index.json` files on first open and ranks substring matches across drivers, teams, circuits, races; navigates via the shared `urlFor()` so alias maps + the `ARCHIVE_MAX_YEAR` guard stay in one place. Any `data-search-trigger` element opens it.
- `src/components/islands/RaceCountdown.jsx` - live countdown to the next session, mounted on detail pages (race/driver/team/circuit).
- `src/components/islands/{Home,Calendar,CircuitsIndex,DriverStandings,ConstructorStandings}Island.jsx` - **year-aware** thin wrappers; each calls `useYearAwareData(currentSeason)` (from `src/data/currentSeason.js`) and passes `data` to the matching screen.
- `src/components/islands/{DriversIndex,TeamsIndex}Island.jsx` - the `/drivers/` and `/teams/` listing islands. These are **not** year-aware: they `fetch('/data/archive/_drivers-index.json')` / `_teams-index.json` client-side (the all-time roster) and render with filters. Don't wrap them in `useYearAwareData` - they're a deliberately different, archive-backed pattern from the 5 season islands above.
- `src/components/islands/screens/*.jsx` - the actual screens. Take `data` (full F1_DATA shape) as a prop. **Never read `window.F1_DATA`** - that pattern is gone. Notable screens: `HomeScreen`, `CalendarScreen`, `DriverStandingsScreen`, `ConstructorStandingsScreen`, `CircuitsIndexScreen`, `DriversIndexScreen`, `TeamsIndexScreen`, `ChampPodium` (top-3 podium block), `TriviaBoard` (rotating facts from `src/data/trivia.json`), `SessionWeatherCell` / `SessionWeatherExpand` / `WeatherIcon` (per-session weather + climate normals).
- `src/components/islands/screens/StandingsCommon.jsx` - shared chart components (`PointsChart`, `TeamProgressionChart`) and `HeadToHead`. Imports Recharts from npm. Auto-chunked by Vite, so Recharts only loads on the two standings pages.

### Pages

**Listing routes**:
- Year-aware islands: `src/pages/{index,calendar,circuits,standings-drivers,standings-constructors}.astro`
- Archive-index islands (all-time roster, not year-aware): `src/pages/drivers.astro`, `src/pages/teams.astro`

**Prerendered detail routes** - server-rendered Astro markup, no React island for the body (some mount the small `RaceCountdown` island), no other client JS:
- `src/pages/drivers/[driverRef].astro` → `src/components/DriverPage.astro` - ~862 driver pages
- `src/pages/races/[year]/[round].astro` → `src/components/RacePage.astro` - ~1,153 race pages (1,125 Ergast + 28 from hand-curated bundles). Race body is split into `RacePodium`, `RaceResultsTable`/`RaceResultsBody`, `RaceQualifyingTable`, `RaceUpcomingBody` components.
- `src/pages/circuits/[circuitRef].astro` → `src/components/CircuitPage.astro` - ~77 circuits (animated track + did-you-know trivia)
- `src/pages/teams/[constructorRef].astro` → `src/components/TeamPage.astro` - ~212 constructors (uses `LineageStrip.astro` to render the heritage chain)
- `src/pages/records/index.astro` + `src/pages/records/[topic].astro` - hub + 17 sub-pages (one per leaderboard). Uses `RecordHeroCard.astro`, `RecordsTable.astro`, `RecordsTopHero.astro`, `RecordsTimeline.astro`. Era toggle on sub-pages is a ~15-line inline `<script is:inline>` - no island.
- `src/pages/404.astro`

**Content collections** (MDX, via `@astrojs/mdx`):
- `src/pages/blog/{index,[...slug]}.astro` + `src/pages/blog/category/[category].astro` + `src/pages/blog/rss.xml.ts` - the blog: index, per-post pages, category pages, and an RSS feed. Posts live in `src/content/blog/*.mdx`; in-post React-ish bits render via `src/components/blog/{DriverChip,RaceResult,SeasonChart}.astro`.
- `src/pages/guide/{index,[slug]}.astro` - a beginner's F1 guide hub + per-topic pages. Topics live in `src/content/guide/*.mdx`.
- Collection schemas live in `src/content/config.ts` (Zod). Blog has `title`/`description`/`category`/`publishedAt`/`updatedAt`/`draft`; guide has `title`/`order`/`summary`/`related`/`draft`. Categories + labels are exported from the same file. Drafts and future-dated posts are hidden in PROD by `isPublic()` in `src/lib/blog.ts`.

**Legacy URL redirects** in `public/`:
- `driver.html`, `race.html`, `circuit.html`, `team.html`, plus `calendar.html`, `circuits.html`, `standings-*.html` - small client-side redirect docs that fetch `_*-index.json` from `/data/archive/` to resolve `?id=NOR` → `/drivers/norris/`, etc. Preserves bookmarks and outbound search-engine links. The generated `public/.htaccess` does the same 301s server-side where Apache is available.

### Data
- `src/lib/seasonStats.mjs` - **the single source of truth for points/standings math** (race + sprint, canonical bundle points first, era drop-rule snapshots, wins countback). Plain ESM consumed by the islands, Astro frontmatter AND `scripts/build-archive.mjs`. Never re-implement scoring anywhere else - three independent copies once produced three different point totals for the same driver. Has vitest tests (`seasonStats.test.js`).
- `src/lib/nationality.js` - demonym → `{ country (ISO alpha-2), flag }` map. Single source of truth, consumed by `build-archive.mjs` (stamps driver docs) and `src/data/archive.js` (enriches race rows). Plain ESM so Node + Vite both import it.
- `src/lib/raceTimings.js` - parsers turning Ergast/Jolpica time strings into seconds, so race tables draw proportional gap bars. Defensive: unrecognised input returns null and the bar is simply omitted (raw string always still shown). Tested.
- `src/lib/listingUtils.js` - `filterItems()` search/nationality filter for the drivers/teams index screens. Tested.
- `src/lib/{buildDriverSummary,buildRaceSummary}.js` - build human-readable summary strings for driver/race pages.
- `src/lib/driverFaceExists.js` - build-time memoized check for `public/images/drivers/<ref>.webp`. Server-only (imported by Astro frontmatter, never shipped).
- `src/lib/{blog,guide,blogData}.ts` - content-collection helpers (sorting, public filter, date formatting, per-topic accent colours). Tested (`guide.test.js`).
- `src/data/buildFallback.js` - `buildFromYearJson(json, circuitProfiles?)` factory: turns a season bundle into the data object screens consume. There is deliberately **no speculative grid**; with no bundle, `buildFromYearJson({})` yields an empty-but-valid shape and screens render explicit placeholders. Tested.
- `src/data/currentSeason.js` - imports `currentSeason.json`, builds it via `buildFromYearJson(..., circuitProfiles)`, then attaches `weather` (from `weather-next.json`) and `climate` (from `climate/*.json`) using `import.meta.glob` so missing files don't break the build. Exposes `_empty: true` when the synced bundle has no drivers. This is what the 5 year-aware listing islands import as their SSR data.
- `src/data/circuitProfiles.js` - per-circuit static metadata merged into the current-season object.
- `src/data/driverBios.js` - hand-written short bios surfaced on driver pages.
- `src/data/trivia.json` - fact pool for `TriviaBoard`, race pages, and circuit pages.
- `src/data/currentSeason.json` (**gitignored, generated by prebuild**) - copy of the highest-numbered `public/data/<year>.json`. Refreshed nightly by `.github/workflows/refresh-current-season.yml`.
- `src/data/weather-next.json` (**gitignored, generated by prebuild**) - next-race forecast from Open-Meteo.
- `src/data/climate/<circuitRef>.json` (**gitignored, generated by `build:climate`**) - per-circuit climate normals.
- `public/data/<year>.json` - season bundles. Hand-curated for 2020–2025 (rich session/circuit metadata). 1950–2019 generated by `build-archive.mjs` from the CSVs (gitignored). The current calendar year (2026) is fetched nightly from Jolpica and committed by the refresh workflow. Bundles for years > 2024 are also consumed by `build-archive.mjs` to generate race archive JSONs and driver standings for post-Ergast seasons. A round only lands in `results` once its **race** has run (so standings/win-count passes treat "in `results`" as "race completed"); a round whose qualifying (and, on a sprint weekend, sprint) has run but whose race hasn't goes into separate `pendingQuali` / `pendingSprint` maps keyed by round, which `build-archive.mjs` maps onto the holding page's `qualifying` / `sprint_results` so those tables show before the race.
- `public/data/archive/` (**gitignored, generated by prebuild**):
  - `_drivers-index.json`, `drivers/<driverRef>.json`
  - `_races-index.json`, `races/<year>/<round>.json`
  - `_circuits-index.json`, `circuits/<circuitRef>.json`
  - `_teams-index.json`, `teams/<constructorRef>.json` (team docs carry a `lineage` chain when in a curated lineage)
  - `_records-index.json`, `records/<topic>.json` - 17 curated leaderboards (top-5 for hub, top-50 for sub-pages, all-time + modern era). Computed by the records pass in `build-archive.mjs` from already-merged driver/team docs.
  - `_driver-codes.json` - code→driverRef map for the `/driver.html?id=NOR` redirect + `.htaccess` rules
- `data/history/*.csv` - Ergast Database CSV dump (1950–2024, ~22 MB). Build-time only, never served. Excluded from `dist/` because it's at repo root, not in `public/`.

### Records library
- `scripts/records/{configs,helpers,generators,index}.mjs` - pure-function records computation: 17 record configs (in 5 groups: career / season-streaks / milestones / teams / circuit), era filter / rank-with-ties / formatters, generators (one per record type), and an orchestrator. Called as the final pass of `build-archive.mjs`. Has vitest unit tests in `scripts/records/*.test.js`.

### Constructor lineages
- `scripts/lineages.mjs` - hand-curated linear lineage chains (e.g. Jordan → Midland → Spyker → Force India → Racing Point → Aston Martin) plus pure helpers (`validateLineages`, `buildLineageAttachment`). `build-archive.mjs` calls these to attach a `lineage` field to each team doc; `LineageStrip.astro` renders it. Tested (`lineages.test.js`). Linear chains only - no fork/merge; same ref may appear twice (e.g. Renault).

### Sitemap
- `scripts/sitemap-lastmod.mjs` - `buildLastmodMap()` reads the archive indexes + blog frontmatter and returns a URL→lastmod map. Loaded from `astro.config.mjs` and applied in the `@astrojs/sitemap` `serialize` hook so every URL signals real freshness. The config also injects team URLs via `customPages` to work around a sitemap-integration bug that drops the last dynamic route group.

### Assets
- `public/css/{app,site}.css` - design tokens + global styles. Linked from BaseLayout with content-hashed `?v=<hash>`. CSS is bundled into one file (`vite.build.cssCodeSplit: false`).
- `public/images/drivers/<driverRef>.webp` - ~32 modern driver headshots. SVG silhouette / flag fallback when missing (`driverFaceExists.js`).
- `public/images/circuits/{black-outline,white-outline}/<id>.svg` - track maps; CSS picks the variant by `html.light`. The SVG basenames diverge from Ergast circuitRefs in a few cases - see `SVG_FOR_REF` in `CircuitPage.astro`.
- `public/images/og/<type>/<slug>.png` (**gitignored, generated by prebuild**) - per-page OG images.
- `public/favicon.svg`, `public/site.webmanifest`, `public/robots.txt`, `public/images/og-default.png`.

## Conventions

- **Branch naming**: `fix/`, `feat/`, `chore/` prefixes.
- **Never read `window.F1_DATA` in islands** - pass `data` via prop. The Astro page's island wrapper builds the F1 object; the screen consumes it pure.
- **Year-aware listing pages**: the 5 season islands wrap their screen with `useYearAwareData(currentSeason)`. Don't bypass - direct `currentSeason` consumers won't react to the year picker. The `/drivers/` and `/teams/` index islands are the exception: they fetch the all-time archive index client-side and are intentionally not year-aware.
- **Trailing slash**: Astro is configured `trailingSlash: 'always'`, `build.format: 'directory'` - pages emit `dist/<route>/index.html`. Internal links must end with `/`.
- **`urlFor` aliases & guards** in `src/lib/shared.jsx`:
  - `TEAM_ID_ALIAS`: `redbull` → `red_bull`, `aston` → `aston_martin` (bundle short ids ↔ Ergast). The legacy redirect docs `public/circuit.html` / `public/team.html` carry their own copies of these maps - keep them in sync.
  - `CIRCUIT_ID_ALIAS`: `albert` → `albert_park`, `marina` → `marina_bay`, `lasvegas` → `vegas`, `yas` → `yas_marina`, `montreal` → `villeneuve`, `cota` → `americas`, `spielberg` → `red_bull_ring`
  - Prefer the canonical ids the bundles already ship - drivers/teams carry `jolpicaId`, calendar entries carry `circuitId` (both Ergast refs) - over the alias maps; the aliases exist for old data and legacy URLs.
  - `ARCHIVE_MAX_YEAR` - race URLs for years ≤ this generate `/races/<y>/<r>/` links directly (build-archive emits holding pages for upcoming current-year rounds); years past it fall through to `/race.html?round=N&year=Y`. The redirect checks `_races-index.json`, so completed races redirect to their prerendered pages; future rounds redirect to `/calendar/`. **Auto-derived, not hand-maintained**: `build-archive.mjs` computes it as `max(year)` over the fully-populated races index and writes `src/data/archiveMeta.js` (only when the value changes); `shared.jsx`, `DriverPage.astro`, and `CircuitPage.astro` all import `ARCHIVE_MAX_YEAR` from there. It rolls over on its own the first time a new season's race pages are built - no manual bump. The committed `archiveMeta.js` carries a fallback value so a fresh clone (tests / dev before a build) resolves the import.
- **Astro template gotcha**: don't write `r.year <= ARCHIVE_MAX_YEAR` inline in a JSX expression - Astro's compiler parses `<=` as a tag opener and errors with *"Unable to assign attributes when using <> Fragment shorthand syntax"*. Wrap the comparison in a function defined in the frontmatter.
- **Astro frontmatter fs reads**: when an `.astro` page reads JSON from the filesystem at build time, use `resolve(process.cwd(), 'public/data/...')` - NOT `import.meta.url + fileURLToPath`. Vite bundles frontmatter into `dist/chunks/astro/server_*.mjs`, so `import.meta.url` resolves relative to the bundle path, not the source file. Existing examples: `src/data/archive.js`, `src/pages/records/index.astro`, `src/pages/records/[topic].astro`.
- **Dark mode tokens**: `:root` holds dark defaults; `html.light` overrides for light mode. Pre-hydration `<script is:inline>` in BaseLayout reads `localStorage.f1-theme` and toggles `html.light` *before* paint, killing the dark→light flash.
- **Mobile responsive**: prefer CSS `@media (max-width: 720px)` over JS `useIsMobile()` for layout-only decisions. SSR has no `window` so JS-driven layouts emit the desktop variant in HTML and snap to mobile only after hydration - visible flash on slow phones, persistent breakage if JS fails. `css/site.css` has overrides forcing `repeat(N, 1fr)` inline grids back to `1fr` below 720px.
- **Driver code collisions**: many historic drivers have no Ergast `code` field, so the importer derives one from surname (first 3 chars). For per-season bundles, that collides for shared surnames (1961: Phil Hill + Graham Hill → both `HIL`). Use `driverRef` (always unique slug like `phil_hill`) as `id` in season JSONs; `code` stays as the display label only.
- **SEO meta**: every Astro page passes `title`, `description`, `canonicalPath`, optional `ogType`, `jsonLd`, `breadcrumb` to BaseLayout. Origin is hard-coded as `https://f1gures.app`. Sitemap is auto-generated by `@astrojs/sitemap` with per-URL `lastmod` from `sitemap-lastmod.mjs` - no manual updates.
- **`is:inline` is load-bearing**: the GA4 tag and Buy Me a Coffee loader in `BaseLayout.astro` must stay `is:inline` (without it Astro bundles the tag and the BMC loader stops injecting `#bmc-wbtn`). The BMC widget is restyled in `css/app.css` (`#bmc-wbtn` overrides) - don't `display: none` it (breaks the modal).
- **CalendarScreen race card links**: `href` is conditional - only set when `result` exists for the round. Upcoming/future rounds get `href={undefined}` and `cursor: default` (intentionally non-navigable). Completed rounds link to `/race.html?round=N&year=Y`, which redirects via `_races-index.json` to `/races/<year>/<round>/`.
- **Content collections are PROD-gated**: drafts and future-dated blog posts are filtered out in production by `isPublic()`. Don't hand-maintain a published list - add the `.mdx` with the right frontmatter and it flows through index/category/RSS/sitemap automatically.
- **Worktree rebase before PRs**: Worktrees accumulate commits that may already be merged to `origin/main` via different commit hashes (squash merges, etc.). Always run `git fetch origin main && git rebase origin/main` before pushing a PR from a worktree - otherwise a stale file list could overwrite more recent main changes on merge.

## Adding a historic season bundle

```
node scripts/fetch-season.mjs 2024
```

Writes `public/data/2024.json` (hand-curated bundle with sessions). Once committed, the year-aware islands and the importer's post-archive merge step (for circuit page race history) will pick it up.

For years already covered by Ergast (≤ 2024), the importer's CSV-derived bundle is generated automatically; only run `fetch-season.mjs` when the CSV is missing data or you want richer session metadata.

## Adding a blog post or guide topic

Drop an `.mdx` file into `src/content/blog/` or `src/content/guide/` with frontmatter matching the Zod schema in `src/content/config.ts`. Blog posts need `title`, `description`, `category` (one of the `BLOG_CATEGORIES`), `publishedAt`; guide topics need `title`, `order`, `summary`. Set `draft: true` to keep it out of PROD. Index, category, RSS, and sitemap entries are all derived automatically.

## Deploy

Two GitHub Actions workflows write to the live server, sharing a `concurrency: deploy` group so they can't overlap:

- **`deploy.yml`** - push to `main`. `npm ci && npm run build` (prebuild → Astro build), then FTP sync.
- **`refresh-current-season.yml`** - nightly cron at 04:00 UTC (also `workflow_dispatch`-able). Runs `node scripts/fetch-season.mjs $(date +%Y)` to pull the current year from Jolpica into `public/data/<year>.json`, commits the bundle if it changed (so future builds have it cached), then build + FTP. The fetch step is non-fatal - if Jolpica is down or the year hasn't started, the existing bundle is reused and the deploy proceeds.

The first deploy after a heavy PR (lots of new routes, or a CSS edit that re-hashes every HTML's `?v=` cache-bust) can take 20+ minutes and occasionally fails with `ECONNRESET` mid-upload - `gh run rerun <id> --failed` is idempotent and usually clears it.

## Two-machine setup

The user has Node on one machine, not the other. The no-Node box can serve a prebuilt `dist/` (when present locally) via a static PowerShell HTTP server at `.claude/serve-dist.ps1`. With Node, `npm run preview` is the canonical local server.

## Useful URL flags
- `?year=YYYY` on any year-aware listing page - overrides `localStorage.f1-year`. e.g. `https://f1gures.app/calendar/?year=1990` (the `useYearAwareData` hook checks the URL param first, then falls through to localStorage). Years 1950–2026 have JSON bundles; older or future years silently fall back to the current-season data. (Doesn't apply to `/drivers/` and `/teams/`, which are all-time archive listings.)

## Post-Ergast data notes
- **Championships**: Ergast CSVs cover 1950–2024 only. `build-archive.mjs` computes `bundleStandings` (year → Map<driverRef, champPosition>) from race-result points in hand-curated bundles. Championships for completed bundle years (`year < new Date().getFullYear()`) are credited via `bundleChampionships` in the driver-doc recompute pass. Anything touching post-Ergast career stats should use `bundleStandings` rather than rebuilding the logic.
</content>
</invoke>
