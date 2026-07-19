# Tech debt & refactoring register

A ranked, verified list of debt in this codebase — every item below was
confirmed by reading the code (file references included), not guessed.
Referenced from [CLAUDE.md](../CLAUDE.md).

**How to use this doc:**
- Before a large refactor, check whether it's listed here (and whether a
  suggested approach exists).
- When you pay an item down, delete it here in the same PR.
- When you knowingly add debt (a copy "to keep in sync", a hardcoded year,
  a skipped test), add an entry in the same PR.

Ranking: **P1** = correctness/safety risk or actively causing bugs ·
**P2** = high-friction maintenance hazard, pay down opportunistically ·
**P3** = worth fixing when touching the area anyway.

Line numbers are as of 2026-07 and will drift — treat them as pointers,
not anchors.

---

## P1 — correctness / safety

### 1. CI test gate is advisory, not enforced (plan-gated)
- **Done:** `.github/workflows/ci.yml` runs `npm ci && npm test` on every
  PR and on pushes to `main`, so the vitest suite (points math, records,
  lineages, compare) runs automatically and shows a green/red `test`
  check on every PR.
- **Enforcement is blocked by the GitHub plan, not a missing toggle.**
  This repo is **private on a personal/Free plan**, where GitHub does
  *not* enforce branch protection rules or rulesets (the ruleset editor
  shows "won't be enforced on this private repository until you move to a
  GitHub Team organization account"). So the gate cannot be made a
  *required* status check as-is — a red suite can still be merged, and
  `deploy.yml` FTPs `main` straight to production. To get real
  enforcement: make the repo public (free), or move to GitHub Pro/Team.
  Until then the gate is advisory — look at the check before merging.
  Note: adding enforcement would also require a bypass for
  `github-actions[bot]`, because `refresh-current-season.yml` pushes the
  season bundle directly to `main` (would otherwise be blocked).
- **Also still open (optional):** `ci.yml` runs only the tests. It does
  not run `astro check` (a typecheck) or any linter — the repo has no
  eslint/prettier config and no `astro check` has ever run, so adding it
  may surface a backlog of type issues to triage first.

### 2. Team standings for post-Ergast years bypassed `seasonStats.mjs` — ✅ RESOLVED
- **Was:** `scripts/build-archive.mjs` ranked post-Ergast (2025+) constructor
  standings with a hand-rolled `points || wins` sort, while the driver path
  used the canonical `computeStandings`. A points+wins tie fell to arbitrary
  map-insertion order and could disagree with the `/standings-constructors/`
  page (real case: 2025 RB and Aston Martin both on 89 pts, 0 wins).
- **Fix (done):** `build-archive.mjs` now derives a `bundleTeamStandings`
  map from `computeStandings(season).teams` (full FIA countback) and uses it
  for team-doc positions, mirroring how `bundleStandings` already feeds
  driver positions — one `computeStandings` call per season feeds both.
  Guarded by a team-countback test in `seasonStats.test.js`. Verified: all
  ten 2025 constructor positions in the team docs now match the standings
  page exactly.

### 3. Hardcoded Ergast cutoff `2024` alongside the dynamic one — ✅ RESOLVED
- **Was:** two passes hardcoded `> 2024` (bundle-year filter, team race-entry
  indexing) while a third derived the cutoff dynamically — under a local
  `const ARCHIVE_MAX_YEAR` that confusingly reused the name of the runtime
  guard. If the Ergast CSV dump ever advanced to include 2025, the derived
  logic would shift while the literals wouldn't, so the overlapping season
  would be processed as both an Ergast year and a bundle year (double-counted).
- **Fix (done):** one `ERGAST_MAX_YEAR = Math.max(...allYears)` defined where
  `allYears` is built and referenced at all three sites; the misnamed local
  const is removed (the name now belongs only to the runtime guard in
  `archiveMeta.js`, a genuinely different value). Pure refactor — verified the
  archive build output is unchanged today (ERGAST_MAX_YEAR === 2024).

### 4. FTP deploy: no retry, and likely plaintext FTP
- **`deploy.yml`: addressed.** The upload now uses `lftp` over FTPS
  (`ftp:ssl-force`) with `--parallel=10` and built-in reconnect
  (`net:max-retries 3`), replacing the single-connection plaintext
  FTP-Deploy-Action. This encrypts credentials + payload and cut the
  worst-case full re-upload from ~34 min to a few minutes (the old
  action ran one file at a time at ~189 kB/s, so a CSS cache-bust that
  re-hashes every page's `?v=` re-uploaded all ~2,300 files serially).
- **Still open:** `refresh-current-season.yml` still uses the plaintext
  FTP-Deploy-Action (fine for now - it uploads only the few data-changed
  pages per run, so it's not slow, but it's still cleartext). The
  `SFTP_*` secret names remain misleading (now FTPS, still not SFTP).
- **Why it's debt:** deploy credentials on the wire in cleartext (the
  refresh path); no whole-step retry beyond lftp's own reconnect.
- **Fix (remaining):** move `refresh-current-season.yml` to the same
  lftp/FTPS step; rename the secrets to `FTP_*` to match reality. A true
  SSH-SFTP move would need SSH enabled on the host + the web-root path
  (SFTP lands in the SSH home dir, not the FTP web root).

### 5. Feedback worker: committed code ≠ deployed code, no tests
- `feedback-worker/` is deployed manually via `npx wrangler deploy` from
  a developer machine; no workflow builds, tests, or deploys it, and it
  has zero test files despite holding the only server-side logic (CORS
  allow-list, honeypot, Turnstile verify, GitHub-issue creation with a
  PAT).
- **Why it's debt:** a committed-but-undeployed edit silently leaves old
  code in production; regressions in the spam-protection paths are only
  discovered live.
- **Fix:** add a `wrangler-action` deploy workflow (gated on a smoke
  test), or at minimum a vitest suite over `src/index.js`'s handler.

### 6. Silent catch blocks drop data from production builds
- `build-archive.mjs`: missing past-race file → `lastHeldHere = null`
  with no log (~L1102); unreadable driver doc skipped silently during
  index enrichment (~L2283).
- `build-app-feed.mjs` (~L539–550): a corrupt driver/team/circuit doc is
  silently dropped from the mobile-app archive feed.
- `sitemap-lastmod.mjs` `readJsonSafe`: malformed index → empty lastmod
  map, no warning.
- **Why it's debt:** these swallow exactly the failure class (partial /
  corrupt archive output) the build most needs to surface — entities just
  vanish from the site/apps with no signal.
- **Fix:** `console.warn` with the path in every catch; fail when the
  failure count is non-trivial. Related: `generate-og-images.mjs` counts
  per-image failures but never fails the build, so pages can ship meta
  tags pointing at missing PNGs.

### 6b. FastF1 quali JSONs predating `bs` need a one-off `--force` backfill
- `fetch-fastf1.py` now writes session-best sectors (`bs`) into each
  `sectors` entry — the Theoretical Best chart's ideal-lap basis (the old
  fastest-lap-only sectors always summed to the lap itself, so the chart
  showed +0.000 for everyone). Committed files fetched before the change
  lack `bs`, and the chart renders its empty state on those pages.
- The `fetch-fastf1.yml` workflow only fetches *missing* sessions, so the
  backfill never happens automatically; the fix sandbox couldn't reach
  `livetiming.formula1.com` (proxy 403) to do it in-PR.
- **Fix:** on a machine with normal network, re-fetch the 13 stale files
  and commit:
  `for r in 1 2 3 4 5 6 7 8 9; do python scripts/fetch-fastf1.py 2026 $r --session q --force; done`
  plus `--session sprintQuali` for rounds 2, 4, 5 and 9. Delete this
  entry once done.

---

## P2 — high-friction maintenance hazards

### 7. `build-archive.mjs` is a 2,502-line module-scope monolith
- ~14 distinct stages (CSV parse, driver/team/circuit/race docs, bundle
  merges, holding pages, lineages, records, meta emit) run as top-level
  statements with implicit ordering invariants (e.g. the "build
  `completedByCircuit` BEFORE the upcoming loop appends to racesIndex"
  comment). Nothing is unit-testable; any throw aborts everything with no
  stage context.
- **Fix (incremental):** extract stages into exported functions under
  `scripts/archive/`, one module per stage, with a thin orchestrator
  documenting the dependency order. Do it stage-by-stage as stages are
  touched — no big-bang rewrite needed.

### 8. Duplicated alias / lookup maps (many copies, some already diverged)
The single worst duplication family in the repo. Copies that must be
hand-synced today:
- **Team logo alias** (`red_bull→redbull`, `aston_martin→aston`):
  `src/lib/teamLogo.js` (`LOGO_ALIAS`, the only copy with `team_lotus`),
  `src/lib/shared.jsx` (`TEAM_LOGO_ALIAS`),
  `src/components/islands/compareShared.jsx`,
  `src/lib/compareShareCard.js`, `src/components/TeamPage.astro`
  (~L97, missing `team_lotus` and the engine-suffix fallback — **already
  a live gap**: Compare Mode and the TeamPage hero can miss logos that
  `teamLogoPath()` resolves).
- **Team id alias** (`redbull→red_bull`, `aston→aston_martin`):
  `shared.jsx` `TEAM_ID_ALIAS`, `public/team.html`, plus three
  overlapping copies inside `build-archive.mjs` (`BUNDLE_TEAM_ALIAS`
  ~L866, inline `TEAM_ALIAS` ~L1433, `HAND_CONSTRUCTOR_ALIAS` ~L1513).
- **Circuit alias**: `shared.jsx` `CIRCUIT_ID_ALIAS` ↔ byte-identical
  copy in `public/circuit.html`; inverse pair `HAND_CIRCUIT_ALIAS`
  (`build-archive.mjs` ~L1370) ↔ `CIRCUIT_ID_ALIASES`
  (`fetch-season.mjs` ~L64) maintained in opposite directions.
- **Country/flag maps**: `src/lib/nationality.js` (the intended SSOT) vs
  `COUNTRY` in `build-archive.mjs` ~L61 vs three maps in
  `fetch-season.mjs` ~L41–63.
- **Team colors**: full set in `build-archive.mjs` ~L27, a smaller copy
  in `fetch-season.mjs` ~L31, and the `#888888→#9B9B9B` neutral rule
  re-encoded in `build-app-feed.mjs` ~L126.
- **Fix:** one `scripts/lib/aliases.mjs` (plain ESM, importable by Node
  scripts and Vite alike, like `seasonStats.mjs`) exporting canonical
  maps + an `invert()` helper; the legacy redirect docs can fetch a
  build-emitted `_aliases.json` from `/data/archive/` instead of carrying
  inline copies.

### 9. `https://f1gures.app` origin hardcoded in ~20 files
- `const ORIGIN = 'https://f1gures.app'` is re-declared in 9 files
  (`BaseLayout.astro`, `astro.config.mjs`, guide/read/stats/compare/
  records pages) and inlined as a bare literal in a dozen more
  (blog pages, detail routes, `compareShareCard.js`, `build-app-feed.mjs`
  `SITE`).
- **Why it's debt:** a domain change or staging origin means editing 20+
  files; the JSON-LD `@id`/`url` strings are the easiest to miss.
- **Fix:** export `ORIGIN` from one `src/lib/site.js`; feed
  `astro.config.mjs`'s `site` and the scripts from it.

### 10. Session/timezone schedule logic triplicated in the islands
- `HomeScreen.jsx` `buildSessions()`, `CalendarScreen.jsx`
  `buildSessionStrip()` (whose comment admits "Mirrors
  HomeScreen.buildSessions"), and `RaceCountdown.jsx` `formatDayTime()`
  each carry their own `SESSION_LABELS` map + sprint/non-sprint order
  array; the labels have already drifted ("Practice 1" vs "FP1").
  `RaceCountdown.zoneAbbr()` also re-implements `shared.jsx`'s
  `zoneShort()`.
- **Fix:** one `src/lib/sessions.js` exporting `SESSION_LABELS`,
  session ordering, and `buildSessions(race, zone)`; import in all three.

### 11. Flag-wash hero effect copy-pasted across 4 detail components
- The identical flag-SVG→data-URI IIFE and the identical
  `visibilityState` entrance-wipe `<script is:inline>` exist in
  `DriverPage.astro`, `CircuitPage.astro`, `TeamPage.astro`, and
  `RacePage.astro`, plus 4 near-identical `.-hero-flagwash` CSS blocks.
- **Fix:** `flagWashDataUri(cc)` in a shared lib + one inline script
  targeting `[data-flagwash]` + shared CSS in `app.css` with per-hero
  custom props.

### 12. Oversized multi-responsibility files (beyond build-archive)
- `src/components/DriverPage.astro` (~1,219 lines): form-chart geometry,
  career waffle, outcome-mix bars, teammate duels, tables, and a ~370-line
  style block in one file. Natural splits: `DriverForm` / `CareerMosaic` /
  `SeasonOutcomes` / `TeammateDuels` sub-components.
- `src/lib/shared.jsx` (~405 lines): URL/alias logic, `useIsMobile`,
  circuit-TZ map, date helpers, flags, UI atoms, points helpers, image
  components — every screen imports all of it. Split into
  `urls` / `dates` / `flags` / `ui` modules.
- `src/components/islands/screens/HomeScreen.jsx` (~678 lines): 7 sibling
  panels + session/weather helpers; `TitleRace` hand-rolls an SVG chart
  overlapping `PointsChart` in `StandingsCommon.jsx`.
- `src/components/islands/compareShared.jsx` (~443 lines): loaders +
  picker + view + share actions.

### 13. Missing tests where the logic is pure and gnarly
Tested today: `seasonStats`, `raceTimings`, `listingUtils`, `guide`,
`buildFallback`, `compareStats`, `weather`, `lineages`, `records/*`.
Untested but complex and cheap to test:
- `shared.jsx` `urlFor` — the app's single URL source of truth (alias
  maps + `ARCHIVE_MAX_YEAR` guard), zero tests.
- `buildDriverSummary.js` / `buildRaceSummary.js` — many-branch natural-
  language generation.
- `yearAwareData.js` `readYearPref` — URL/localStorage/'current'
  precedence.
- `scripts/sitemap-lastmod.mjs` — its own comment says the pure function
  is "exported separately so it can be unit-tested", but no test exists.
- `scripts/build-app-feed.mjs` (`buildSeason`, `validateSeason`,
  `stripMdx`) and `scripts/records/index.mjs` (`buildRecords` orchestration)
  — the two files most able to corrupt production data silently.

### 14. Duplicated per-entity helpers in the Astro layer
- **Driver headshot existence** checked 4 ways: the memoized
  `lib/driverFaceExists.js` (used by CircuitPage) vs inline `existsSync`
  in `DriverPage.astro` ~L100 vs a local `faceCache`/`hasFace()` in
  `TeamPage.astro` ~L173 vs `driverImg()` in `CircuitPage.astro` ~L235.
  → export `hasDriverFace` + `driverFacePath` from the one lib.
- **OG-image exists-else-default** resolver copied into all four dynamic
  detail routes → one `resolveOgImage(relPath)` helper.
- **Season-history table markup** (`.tbl.tbl-static` + `std-bar` points
  bars) near-identical between `DriverPage` ~L733 and `TeamPage` ~L430.

### 15. Feedback categories & validation limits duplicated client/server
- The 4 categories exist in `feedback-worker/src/index.js` ~L15 and
  `FeedbackForm.jsx` ~L13 with labels already drifted ("Data fix" vs
  "Data correction"); message/email length limits (4000/200) are
  hardcoded in both layers.
- **Fix:** tolerate the duplication (they're separate deploy units) but
  document it in both files with pointer comments, or generate the worker
  constants from a shared JSON at deploy time.

### 16. Design-system card unification (audit PR 5) never landed
- `design-system/audit.html` prescribed 5 migration PRs; 1–4 are done
  (verified: spacing/motion tokens exist, dotted links gone,
  `.listing-card` squared, `.data-table` deleted). PR 5 — unify the five
  card systems into a `.card` base + modifiers — is not done: no `.card`
  base exists and 58 `.race-card/.driver-card/.blog-card/.rec-card`
  references remain in `app.css`. The Ferrari-vs-`--accent` collision
  documented there also persists.
- **Fix:** follow `audit.html`'s prescribed order (introduce `.card`
  base + `.card-team/.card-accent/.is-next`, reskin `.rec-card` + home
  top-3 first).

---

## P3 — opportunistic cleanups

### 17. Dead code & vestigial dependencies
- `shared.jsx`: `StatusPill`, `DriverSilhouette`, and `F1_POINTS` have
  zero importers (`F1_POINTS` also duplicates `POINTS` in
  `seasonStats.mjs`, inviting SSOT violations). Delete all three.
- `prop-types` in `package.json` dependencies: zero usages in `src/` —
  a leftover from the pre-Astro era. `npm remove prop-types`.
- `build-archive.mjs` ~L1604: `order.includes(code) ? null : null` —
  both ternary branches return `null` (either dead code or a lost
  fallback; decide which and fix).
- `records/configs.mjs` exports a second, unused `MODERN_ERA_START_YEAR`;
  meanwhile `records/generators.mjs` ignores the constant and hardcodes
  the literal `1981` in ~8 places. Keep the `helpers.mjs` export only and
  import it in the generators.
- Stale code comments describing the dead architecture:
  `build-archive.mjs` header ("PR 2a: drivers only"), `shared.jsx` header
  ("still use legacy `?id=` URLs until PR 2"), `HomeScreen.jsx` line 2
  (`window.F1_DATA` note), `teamLogo.js` header (references a
  `TEAM_LOGO_ALIAS` name that doesn't match `shared.jsx`).

### 18. Build-time performance in `build-archive.mjs`
- The records pass re-reads every driver/team doc from disk right after
  writing them, although they're still in `driverDocCache`/`teamDocCache`.
- Each season bundle is read + `JSON.parse`d ~5–7 times by different
  passes → parse once into a `Map<year, season>`.
- O(circuits × races) filter inside the per-circuit loop (~L1275) and
  `Array.find` scans inside loops (~L437, ~L1323) where lookup Maps
  already exist. `constructorShort` rebuilds its literal map on every
  call (~L108).
- `build-app-feed.mjs` recomputes `roundPointsMap(res)` per driver-row
  instead of once per race (~L212, ~L244).

### 19. Islands: fetch/effect and a11y smells
- `SearchPalette.jsx` swallows index-load errors — a persistently flaky
  network leaves the palette stuck on "Loading index…" with no error
  state (contrast `compareShared`'s `status:'error'` pattern).
- `DriversIndexIsland` / `TeamsIndexIsland` fetch without an abort/
  cancelled guard → setState after unmount.
- `HomeScreen`'s `NextRacePanel` and `SeasonAtGlance` are whole-card
  `<div onClick={navigate}>`s — keyboard/screen-reader inaccessible.
  CalendarScreen's stretch-`<a>` overlay is the right pattern to copy.

### 20. Config / infra odds and ends
- Node version pinned as `22` independently in both workflows; no
  `engines` field or `.nvmrc` → add one source and use
  `node-version-file`.
- `astro.config.mjs` sitemap `customPages` workaround is pinned to
  `@astrojs/sitemap` 3.2.1 (exact pin, so the upstream fix never arrives
  via `^`); add a "retest on upgrade" TODO with an issue link.
- `public/robots.txt` disallows `/scripts/` and `/docs/` — paths that are
  never served (they live at repo root, outside `public/`).
- `site.webmanifest` declares only an SVG icon with `purpose: "any
  maskable"`; installability needs 192/512 PNG maskable icons.
- The 4 trivial legacy redirect shims (`calendar.html`, `circuits.html`,
  `standings-*.html`) are near-byte-identical hand-written templates —
  generate them (the repo already generates `.htaccess`).
- `site.css` carries 36 `!important`s in ~476 lines (specificity fights);
  `app.css` has ~124 hex literals outside the token block (many are
  legitimately team colors, but podium gold/silver/bronze in
  `TeamPage.astro` and the waffle palette in `DriverPage.astro` belong in
  tokens).
- `wmoFromMeans` / hourly-summary thresholds exist in both
  `src/lib/weather.js` and `scripts/build-climate.mjs` (self-documented
  "keep in sync") → move to a zero-dep `.mjs` both can import.
- `records` team generators run on synthesized fake per-race rows
  (`build-archive.mjs` ~L2371 fabricates `{position:1}`/`{position:null}`
  rows so driver-oriented era filters can be reused) — works, but blocks
  any future team record needing real round identity.
- 2020–2024 are covered by BOTH hand-curated bundles and the Ergast CSVs
  (intentional — bundles add session metadata — but undocumented field
  ownership; a results correction must be reconciled in both).

---

## Explicitly verified non-issues

Checked and found fine — don't re-litigate without new evidence:
- `window.F1_DATA` is fully gone from `src/` (doc/comment remnants only).
- Driver-standings scoring goes through `seasonStats.mjs` everywhere
  (only the *team* post-Ergast path deviates — item 2).
- The prebuild step ordering in `package.json` is correct (app feed after
  archive, OG after archive); it's an implicit contract but currently
  right.
- The OG-image CI cache claim in CLAUDE.md is true in both workflows,
  with matching content-hash keys.
- `concurrency: deploy` is correctly shared across both workflows.
- Design-system audit PRs 1–4 (spacing tokens, link cleanup, listing-card
  radius, `.data-table` removal) all landed.
- `useIsMobile`, `MiniChart`, `PointsChart` sharing — all live and used.
