# Upcoming-race holding pages

**Date:** 2026-05-10
**Status:** Design — pending implementation plan

## Problem

The calendar grid at `/calendar/` shows every round of the current season, but the cards for *future* (un-run) rounds are only weakly clickable: the race name is rendered as plain text (no link), only the circuit name links anywhere, and there's no card-level click target. A user who taps an upcoming card mostly hits dead air — confusing affordance.

The underlying cause: only completed races have a prerendered detail page at `/races/<year>/<round>/`. The `build-archive.mjs` importer skips rounds without `results`, so 2026's rounds 5–22 don't exist as pages, and `urlFor` is forced to no-op for them.

## Goal

Generate a "holding page" for every upcoming round so calendar cards can link uniformly. The page should:

- Lead with what the user wants right now: when's the next session, in their local time.
- Provide context: last time this venue ran, circuit info.
- Be SEO-worthy in its own right — distinct query intent from the post-race results page.
- Live on the same canonical URL as the eventual results page; once the race runs, the URL deepens rather than redirects.

## Non-goals

- Live timing during a race weekend (no realtime data feeds).
- Predictions, betting odds, or speculative content.
- A general "schedule" page beyond what `/calendar/` already provides — these are per-race pages.

## Layout

### Desktop

```
┌──────────────────────────────────────────────────────┐
│ ← Calendar                                           │  (shell)
│ ┌──────────────────────────────────────────────────┐ │
│ │ ROUND 5 · 2026                                   │ │
│ │ Canadian Grand Prix                              │ │
│ │ 🇨🇦 Circuit Gilles Villeneuve · 24 May 2026 · ⚡   │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ ┌────────────────────────┐ ┌───────────────────────┐ │
│ │ NEXT SESSION           │ │ LAST HELD HERE — 2025 │ │
│ │ Race in 6d 4h 22m      │ │ P1 Verstappen         │ │
│ │ [TRACK | YOU]          │ │ P2 Norris             │ │
│ │                        │ │ P3 Leclerc            │ │
│ │ FP1   Fri 16:30        │ │ → 2025 Canadian GP    │ │
│ │ SQ    Fri 20:30        │ │                       │ │
│ │ Sprint Sat 16:00       │ │                       │ │
│ │ Quali Sat 20:00        │ │                       │ │
│ │ Race  Sun 20:00 ←      │ │                       │ │
│ └────────────────────────┘ └───────────────────────┘ │
│                                                      │
│ ┌──────────────────────────────────────────────────┐ │
│ │ [circuit map SVG]                                │ │
│ │ Length / Laps / Lap record / Location            │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ ← Prev race · Next race →                            │
└──────────────────────────────────────────────────────┘
```

### Mobile (≤720px)

Stacks top-to-bottom: hero → next-session+timetable → last-held-here → circuit panel → prev/next nav. Implemented via `@media (max-width: 720px)` (CSS only, no JS — per CLAUDE.md). Two-column block becomes `grid-template-columns: 1fr`. Last-podium reuses the existing post-race podium mobile rule (`flex-direction: column; gap: 6px`). Hero already collapses to single column at 720px; inherited from existing `RacePage.astro` styles.

### Hero

- Reuses the existing `.race-hero` block from `RacePage.astro` (round eyebrow, race name, flag + circuit link, date).
- Right side of hero (currently the podium tile for completed races) is empty for upcoming races — keeps the visual rhythm consistent across past and future.
- Sprint badge in the hero stats row (only on sprint weekends), reusing `<SprintBadge>` from `src/lib/shared.jsx`.

### Next-session panel (left of two-column block)

- Header: "NEXT SESSION".
- Big text: name of the next future session (e.g. "Race") + countdown ("in 6d 4h 22m"). Reuses the `<Countdown>` React component already on the home page.
- TRACK / YOU toggle below the countdown. Reads `localStorage.f1-tz` (the same key the home-page hero uses), so a user who picked "YOU" once sees it everywhere. Toggling on this page writes the key back, so other pages stay in sync.
- Timetable below the toggle. One row per non-null session in `race.sessions`, in chronological order. Columns: session label, day-of-week, time. Time renders in TRACK (using `circuitTz(circuitId)` + `Intl.DateTimeFormat` — same helpers the home-page schedule uses) or YOU per the toggle. The next future session row gets a left-accent and bolded text.

### Last-held-here panel (right of two-column block)

- When the circuit has run before: "LAST HELD HERE — \<year\>" header, then podium-step rows P1/P2/P3 with driver name + team. Reuses the existing `.podium-step` CSS from `RacePage.astro`. Year is the most recent occurrence (handles circuits that drop off the calendar). Footer: link to that race's results page.
- When `circuitFirstTime: true`: "FIRST TIME AT THIS VENUE" header, circuit blurb (country, location, length if known), and a link to the circuit detail page.

### Circuit panel (below two-column block)

- Theme-aware SVG map (`public/images/circuits/{black-outline,white-outline}/<id>.svg`). Picks variant by `html.light`, same pattern as `CircuitPage.astro`.
- Below the map: length, laps, lap record, location — values pulled from the bundle `circuit` block.

### Prev/next race nav

- Same component as on completed-race pages. Round 5 → Round 4 (results page) and Round 6 (another holding page). Uniform.

## Component file structure

```
src/components/
  RacePage.astro            # SHELL — hero + breadcrumb + back-to-calendar + prev/next nav.
                            # Branches body once: completed → RaceResultsBody, else → RaceUpcomingBody.
                            # Target: ~80 lines after the split.
  RaceResultsBody.astro     # NEW — extracts results table + qualifying + sprint + key-links from current RacePage.
                            # Receives `race` prop. ~200 lines.
  RaceUpcomingBody.astro    # NEW — countdown panel + timetable + last-podium card + circuit panel.
                            # Receives `race` prop with new fields (sessions, lastHeldHere, circuitFirstTime).
                            # ~200 lines.

src/components/islands/
  RaceCountdown.jsx         # NEW small island — countdown ticker + TRACK/YOU toggle + client-side
                            # next-session re-evaluation (reads data-session-start attrs on rendered rows,
                            # picks current next-session, applies bold class, drives countdown).
```

The route `src/pages/races/[year]/[round].astro` keeps its current shape: loads race JSON via `getRace(year, round)`, computes title/desc/JSON-LD with a small branch on `race.results.length === 0`, renders `<RacePage race={race} />`. The body branch happens inside RacePage.

## Data pipeline (`scripts/build-archive.mjs`)

Two changes:

### 1. Emit upcoming-round JSONs

Currently the importer's bundle pass (year > 2024) only writes `archive/races/<year>/<round>.json` for rounds where `result` exists. Extend it to emit a JSON for rounds where `result` is empty *and* `sessions` is populated (per Section 2 Q6 answer B — rare-no-sessions case falls through to legacy redirect).

Shape of the upcoming JSON:

```js
{
  raceId: `${year}-${round}`,
  year, round, name, date, time, url,
  circuit: {
    circuitRef, name, location, country, countryName, flag,
    length, laps, lapRecord  // copied from bundle's `circuits` map where available
  },
  sprint: boolean,            // is it a sprint weekend
  sessions: {                 // copied verbatim from bundle calendar entry
    fp1, fp2, fp3, q, sprint, sprintQuali, race
    // each value is { date, time } | null
  },
  status: 'upcoming' | 'next',
  lastHeldHere: {
    year, round,
    podium: [{ position, driverRef, driverName, constructorRef, constructorName }, ...]
  } | null,
  circuitFirstTime: boolean,  // true when no completed race exists at this circuitRef
  prev: { year, round, name } | null,
  next: { year, round, name } | null,
  results: [],                // empty arrays so the route can detect "upcoming"
  qualifying: [],
  sprint_results: null
}
```

`lastHeldHere` is computed by scanning `_races-index.json` (already populated this run) for the highest-year completed race at the same `circuitRef`, then loading `archive/races/<y>/<r>.json` and copying its top-3 finishers.

### 2. Append to `_races-index.json`

Same structure as today, with one extra field `completed: boolean`. The route's `getStaticPaths` already iterates this index and prerenders one page per entry, so adding upcoming entries automatically generates ~18 new prerendered pages for 2026.

### 3. Bump `ARCHIVE_MAX_YEAR`

Three call-sites in `src/lib/shared.jsx`, `src/components/DriverPage.astro`, and `src/components/CircuitPage.astro`. Bump 2025 → 2026 so calendar / driver / circuit page links to 2026 races resolve directly to `/races/2026/N/` instead of routing through `/race.html`.

## Calendar card behaviour change

In `src/components/islands/screens/CalendarScreen.jsx`:

- Wrap the card in a stretched-link pattern: keep the `<div className="race-card">` visual container, add an absolute-positioned full-bleed `<a>` whose href is **always** `urlFor({ name: 'race', year, round })` — past and future alike.
- Remove the inline `<a>` wrappers around race-name and circuit-name (redundant once the card is the link).
- Keep winner-name as a nested clickable link to the driver page, sitting on top with `position: relative; z-index: 1`.
- Add `cursor: pointer` and a hover state to `.race-card` (subtle border-accent or background lift). Remove the previous "upcoming → cursor: default" branch.
- Keep the `is-${race.status}` left-border tint and the `pill pill-${status}` status pill.

## SEO

### Title / description / canonical (`src/pages/races/[year]/[round].astro`)

- Title (upcoming): `"Canadian GP 2026 — Round 5 schedule, sessions & circuit | f1gures"`
- Description (upcoming): `"Canadian Grand Prix 2026, Round 5 of 22. Race weekend at Circuit Gilles Villeneuve, 22–24 May. Session times for FP1, qualifying, sprint and the race."` Drop the word "sprint" if not a sprint weekend; only mention sessions whose entries are non-null.
- Canonical unchanged (`/races/2026/5/`).
- `ogType: "event"` (was `"article"`); add `event:start_time` and `event:end_time` meta tags computed from race weekend window (FP1 start → race start).

### JSON-LD

The route already emits a `SportsEvent`. Tune the upcoming variant:

- Drop `winner` and `performer` (don't apply yet).
- Add `eventStatus: "https://schema.org/EventScheduled"`.
- `startDate`: race UTC datetime.
- `endDate`: same as `startDate` (single-day for the race itself; whole-weekend modeling deferred).
- Add `subEvent[]` — one entry per session, each a nested `SportsEvent` with its own `startDate`. Useful structured data: search engines can render session times in rich results.
- **Drop the FAQPage block** entirely for upcoming pages — current FAQs are about winner / pole / fastest lap, none of which exist yet. No speculative replacements.

### OG image (`scripts/og-templates/og-race.mjs`)

The current template's bottom-block falls back to an empty div when `race.results` is empty. Update to branch:

- `race.results.length > 0` → existing winner block (unchanged).
- Else → "RACE WEEKEND" eyebrow + race date in big type (e.g. `"24 MAY 2026"`). Same brand mark in the corner.

### OG cache invalidation

PR #64's cache skips PNGs that already exist on disk. After the race runs, `build-archive.mjs` overwrites the archive JSON with results, but the cached PNG would still be the upcoming variant. **Add a `.completed` marker file** alongside each PNG (e.g. `2026-5.png.completed` for completed races). The OG generator regenerates if the marker state doesn't match the current `_races-index.json` `completed` flag.

### Indexing

Index the holding pages (no `noindex`). Different query intent from results pages ("when is X" vs "who won X"); same canonical URL means deepening, not competing. Sitemap auto-includes via `@astrojs/sitemap`.

## Edge cases & staleness

- **Mid-weekend staleness.** Static SSR + nightly cron means the build-time "next session" pick can drift between rebuilds. Two layers handle this:
  1. Each rendered timetable row carries `data-session-start="<iso>"`. Server-rendered "next session" highlight is computed from the build clock.
  2. `RaceCountdown` re-evaluates on hydration, picks the correct next session client-side, and drives the countdown. JS-off visitors see a possibly-stale highlight + a static "Race weekend: 22–24 May" instead of a ticking timer.
- **Results land overnight.** 04:00 UTC nightly cron pulls Jolpica → rebuilds → archive JSON has results → route renders `RaceResultsBody` → OG marker triggers PNG regen → `_races-index.json` `completed` flips. Same URL throughout.
- **No session data.** Round skipped; not in index; not prerendered. Calendar card link falls through to `/race.html` redirect, which finds no entry and lands on `/calendar/`. Rare/transient.
- **Brand-new circuit.** `lastHeldHere: null`, `circuitFirstTime: true`. Right tile renders "First time at this venue" + circuit blurb + link to `/circuits/<ref>/`.
- **Sprint vs non-sprint weekend.** Timetable rows are derived from non-null `sessions` keys in chronological order. Non-sprint: FP1, FP2, FP3, Q, Race. Sprint: FP1, SprintQuali, Sprint, Q, Race.
- **Two-machine setup.** Holding pages are static HTML + a small JS island; serve identically from `dist/` on the no-Node box.
- **Out-of-bounds rounds.** `getStaticPaths` only generates pages for index entries; unknown rounds 404 (unchanged).

## Open questions

None at design-approval time. Implementation plan to elaborate file-by-file ordering and tests.

## Definition of done

- 2026 rounds 5–22 (or whatever's currently un-run) have prerendered pages at `/races/2026/N/`.
- Each holding page shows hero + countdown to next session + full session timetable with TRACK/YOU toggle + last-held-here panel + circuit panel + prev/next nav.
- Mobile layout stacks correctly at ≤720px.
- Calendar cards are uniformly clickable across past and future rounds; whole-card click → race page; winner-name nested link → driver page.
- `urlFor` and the two `raceUrl()` helpers updated to the new `ARCHIVE_MAX_YEAR`.
- SEO: upcoming pages have tuned title/description/og:event meta + scheduled-status JSON-LD with `subEvent[]` per session; FAQPage omitted; OG images render the upcoming variant; OG cache invalidation marker in place.
- Visual regression on completed-race pages: zero (the shell-and-bodies refactor must produce byte-identical HTML for the existing 1,153 race pages, modulo whitespace).
