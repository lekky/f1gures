## Records & Milestones Hub - Design Spec

**Date:** 2026-05-17
**Status:** Approved

## Overview

Add `/records/` - a curated hub of F1 leaderboards computed at build time from the Ergast archive plus the hand-curated post-2024 bundles. The hub shows 17 marquee records as hero cards organised into 5 sections; each record has a dedicated `/records/<topic>/` sub-page with the top 50 and an all-time / modern-era (1981+) toggle.

The page is a pure static surface: prerendered HTML with no React island, no client fetches. Era toggling is a ~15-line inline script that flips a `data-era` attribute and hides the inactive table.

## Approach

Approach A from brainstorming: extend `scripts/build-archive.mjs` with a new "records" pass that runs after the existing driver/team/circuit aggregation. The pass emits one hub-index JSON and 17 per-topic JSONs into `public/data/archive/`. Astro pages read those JSONs in their frontmatter.

## 1. Records Inventory

17 records, grouped into 5 sections. Each has `id` (kebab-case, used as URL segment and JSON filename), `title` (display), `blurb` (sub-page description), `stat` (what gets aggregated), `valueFormat` (how to render the value).

### Career (6)

| `id` | Title | Stat |
|---|---|---|
| `wins` | Most race wins | `career.wins` |
| `podiums` | Most career podiums | `career.podiums` |
| `poles` | Most pole positions | `career.poles` |
| `championships` | Most drivers' championships | `career.championships` |
| `starts` | Most race starts | `career.races` |
| `fastest-laps` | Most fastest laps | `career.fastestLaps` |

### Single-season & streaks (4)

| `id` | Title | Stat |
|---|---|---|
| `wins-in-season` | Most wins in a single season | `max(perSeason[].wins)` per driver |
| `podium-streak` | Longest consecutive-podium streak | walk `perRace` chronological |
| `win-streak` | Longest consecutive-win streak | walk `perRace` chronological |
| `title-margin` | Biggest championship-winning margin | P1 points - P2 points in a year's final standings |

### Milestones (2)

| `id` | Title | Stat |
|---|---|---|
| `youngest-champion` | Youngest world champion | age at final-round date of championship year |
| `oldest-winner` | Oldest race winner | age at race date for any race-winning result |

### Teams (3)

| `id` | Title | Stat |
|---|---|---|
| `team-titles` | Most constructors' championships | `career.championships` from team doc |
| `team-wins` | Most team race wins | `career.wins` from team doc |
| `team-1-2-finishes` | Most 1-2 finishes (single race count) | scan results: same constructor in P1 and P2 |

### Race & circuit (2)

| `id` | Title | Stat |
|---|---|---|
| `wins-at-circuit` | Most wins by one driver at one circuit | group driver `perRace` by `circuitId`, filter `position === 1` |
| `poles-at-circuit` | Most poles by one driver at one circuit | same with `grid === 1` |

## 2. Data Pipeline

A new pass appended to the end of [scripts/build-archive.mjs](scripts/build-archive.mjs), after the team-bundle merge pass. It reuses the in-memory CSV-derived structures (`drivers`, `races`, `results`, `constructors`, `circuits`, `racesById`, `driversById`, `constructorsById`, `circuitsById`, `finalRaceIdByYear`) plus the already-written per-driver / per-team archive JSONs (which already include post-Ergast bundle years).

### Output files

| Path | Purpose |
|---|---|
| `public/data/archive/_records-index.json` | Hub: 17 records x top-5 x 2 eras (all-time + modern). |
| `public/data/archive/records/<topic>.json` | Sub-page payload: top-50 x 2 eras + a `note` field for era caveats. |

Both gitignored; regenerated each prebuild. Total payload roughly: hub index ~25 KB, each topic ~5-10 KB.

### Hub index shape

```json
{
  "generatedAt": "2026-05-17T...",
  "groups": [
    {
      "id": "career",
      "label": "Career",
      "records": [
        {
          "id": "wins",
          "title": "Most race wins",
          "blurb": "Career grand prix victories.",
          "stat": "wins",
          "valueFormat": "integer",
          "subjectType": "driver",
          "allTime": { "top5": [Entry, ...] },
          "modern":  { "top5": [Entry, ...] }
        }
      ]
    }
  ]
}
```

`subjectType` is one of `"driver"`, `"team"`, `"driver-at-circuit"`. Drives row rendering in the Astro template.

### Sub-page shape

```json
{
  "id": "wins",
  "title": "Most race wins",
  "blurb": "Career grand prix victories.",
  "subjectType": "driver",
  "valueFormat": "integer",
  "note": null,
  "allTime": { "top50": [Entry, ...] },
  "modern":  { "top50": [Entry, ...] }
}
```

The `title-margin` topic sets `note` to a one-line caveat about points-system changes across eras.

### Entry shape

Driver records:
```json
{
  "rank": 1,
  "value": 105,
  "valueLabel": "105 wins",
  "driverRef": "hamilton",
  "name": "Lewis Hamilton",
  "shortName": "L. Hamilton",
  "code": "HAM",
  "flag": "🇬🇧",
  "country": "GB",
  "teamRef": "mercedes",
  "teamName": "Mercedes",
  "teamColor": "#27F4D2",
  "context": "2007-present"
}
```

For career and streak records, `teamRef` / `teamName` / `teamColor` reflect the driver's most-raced team within the era window (same convention as `perSeason.constructorRef` selection in build-archive.mjs). For single-season records like `wins-in-season`, they reflect that specific season's primary team.

Team records: replace driver fields with `constructorRef`, `name`, `nationality`, `color`. `context` is the team's active years.

Driver-at-circuit records: add `circuitRef` and `circuitName`; `context` reads e.g. `"Hungaroring - 8 wins"`. `valueLabel` and the main value mirror that count.

### Era logic

- **All-time:** every season with a result, 1950 through the last *fully completed* season.
- **Modern:** strict filter on `year >= 1981`.
- **In-progress current season** (`year === currentYear` and not every calendar round has a result): excluded from both. Mirrors the `pickBestSeason` convention already in build-archive.mjs.

`finalStandingByYear` (per driver) is re-aggregated per era; perRace and perSeason are filtered before counting. For team records and circuit records, races are filtered by year before grouping.

### Tie-breaking

For all leaderboards:
1. Primary: `value` desc.
2. Secondary: races-entered asc (fewer races for the same stat = more impressive).
3. Tertiary: chronological-first asc (earliest to achieve it).

Rows with identical `value` share a displayed `rank` (1, 1, 3, 4, ...) - the array index doesn't drive the rank label.

### Streak computation

Walk each driver's `perRace` in `(year, round)` order. Maintain `(current, best)`. Increment `current` while predicate holds (`position === 1` for win-streak, `position != null && position <= 3` for podium-streak). DNS / DNQ / withdrawn (no `position` and not status `"R"`) breaks the streak. Race-not-in-era-window breaks the streak (so the modern leaderboard doesn't inherit a 1970s streak crossing into 1981).

### Title-margin computation

Iterate years with a complete final-round standings table. For each year, find the two highest-ranked finishers via `driver_standings.csv` row where `raceId === finalRaceIdByYear.get(year)` and `position` in {1, 2}. Margin = `P1.points - P2.points`. Entry's `name` is the champion; `context` reads `"<year> - beat <P2 surname>"`.

### Post-Ergast coverage

The existing driver/team docs already include hand-curated bundle years (per the team-bundle merge pass higher up in build-archive.mjs). The records pass reads from those merged docs, not from CSV directly, so post-2024 wins/poles/podiums/championships are counted.

Bundle-year championships are credited via `bundleStandings` (year -> Map<driverRef, champPosition>) which already exists. Title margin for bundle years uses the same map plus race-result point totals from the bundle (skip the year if not all rounds completed).

## 3. Routes & Files

| File | Type | Purpose |
|---|---|---|
| `src/pages/records/index.astro` | new | Hub. Reads `_records-index.json` in frontmatter, renders 5 sections of hero cards. |
| `src/pages/records/[topic].astro` | new | Sub-page. `getStaticPaths` over the 17 record IDs, reads `records/<topic>.json`. |
| `src/components/RecordHeroCard.astro` | new | Reusable hero card (used on hub) - eyebrow, big value, holder name, top-2-5 rows, accent stripe. |
| `src/components/RecordsTable.astro` | new | Reusable top-50 table (used on sub-page) - renders both era tables side-by-side in HTML with `data-era-table`. |
| `scripts/build-archive.mjs` | edit | Append "records" pass (~250 lines) emitting the JSONs above. |
| `src/components/islands/StandingsDropdown.jsx` | edit | Add third option "Records & milestones" pointing to `/records/`. |
| `src/components/Chrome.astro` | edit | Add `/records` to the standings route-active detection so the dropdown trigger highlights on records pages. |
| `public/css/app.css` or `public/css/site.css` | edit | Add `.records-page`, `.records-hero-card`, `.records-era-toggle`, `.records-table` styles. |

URL pattern: `/records/`, `/records/wins/`, `/records/title-margin/`, etc. Trailing slash per site convention. All routes prerender to `dist/records/.../index.html`.

## 4. Hub Page Layout

Frontmatter reads `_records-index.json`. Body:

1. Page wrapper with intro block:
   - H1: "F1 Records & Milestones"
   - Sub: one paragraph (~30 words) summarising the hub.
2. Five sections, in this order: Career, Single-season & streaks, Milestones, Teams, Race & circuit.
3. Each section:
   - `SectionHead` component from `shared.jsx` (or an equivalent Astro version) for the title.
   - Responsive grid (`grid-template-columns: repeat(3, 1fr)` >= 1024px, `repeat(2, 1fr)` >= 720px, `1fr` below).
   - One `RecordHeroCard` per record.

### Hero card

Astro component, no React. Props: `record` (the index entry).

Anatomy:
- 4px left accent stripe in `teamColor` of the record holder (driver's primary team / constructor's color / `--accent` fallback).
- Eyebrow (record title) in monospace caps.
- Giant value (display font, ~52px desktop / ~40px mobile).
- Holder name (driver or team), with flag and team chip.
- Context line (one-liner from the entry).
- Divider, then 4 compact rows (ranks 2-5): `rank | short name | value`. Ties show identical rank.
- "See full ranking ->" link spanning the card footer.
- The whole card is an `<a href="/records/<id>/">`.

The card's all-time top-5 is what's rendered. Modern-era data sits in the sub-page only - keeps the hub from being too dense.

For `subjectType: "team"` cards, the holder block and the rank 2-5 rows both show teams (constructors), not drivers. There's no headshot - a coloured `■` chip in the team color plus the team name.

Driver-at-circuit cards (`wins-at-circuit`, `poles-at-circuit`) show `circuitName` in the context line for the holder and inline in each of the rank 2-5 rows, since the same driver may appear multiple times at different circuits.

## 5. Sub-Page Layout

`/records/<topic>/` template (Astro frontmatter reads `records/<topic>.json`):

1. Breadcrumb: `Home > Standings & Records > <title>`.
2. H1: `<title>`.
3. Sub: `<blurb>`.
4. Era toggle (two `<button data-era-toggle="all-time">` / `data-era-toggle="modern">` buttons). Active button has `.active` class; default = all-time.
5. `<div class="records-table-wrap" data-era="all-time">` containing two `<table data-era-table="...">` elements. Modern table starts `hidden`.
6. Optional note line (visible only when there's a value in `note` - currently only `title-margin`).

### Table rendering

For `subjectType: "driver"`:

| # | Driver | Team | Stat | Context |
|---|---|---|---|---|
| 1 | Flag + Name (links to `/drivers/<ref>/`) | Team chip (links to `/teams/<ref>/`) | `valueLabel` | `context` |

For `subjectType: "team"`: drop the team column, replace driver with team.

For `subjectType: "driver-at-circuit"`: extra column showing `circuitName` linked to `/circuits/<ref>/`. Context shows the active-years range.

### Toggle script

One inline `<script>` at the end of `[topic].astro`:

```js
const root = document.querySelector('.records-page');
if (root) {
  const wrap = root.querySelector('.records-table-wrap');
  root.querySelectorAll('[data-era-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const era = btn.dataset.eraToggle;
      wrap.dataset.era = era;
      wrap.querySelectorAll('[data-era-table]').forEach(t => {
        t.hidden = t.dataset.eraTable !== era;
      });
      root.querySelectorAll('[data-era-toggle]').forEach(b => {
        b.classList.toggle('active', b.dataset.eraToggle === era);
      });
    });
  });
}
```

The active-era state is not persisted across navigation - intentional (kept simple; user can re-toggle on each sub-page).

## 6. Nav Update

In [src/components/islands/StandingsDropdown.jsx](src/components/islands/StandingsDropdown.jsx), append a third item after Constructors:

```
Records & milestones    href: /records/
```

In [src/components/Chrome.astro](src/components/Chrome.astro), update the standings active-route helper:

```ts
standings:   isRoute('/standings-drivers') || isRoute('/standings-constructors') || isRoute('/records'),
```

So the "Standings" trigger stays highlighted while on `/records/...`. Mobile bottom nav is untouched (5-slot limit; standings already covers the dropdown).

## 7. SEO

### Hub page

- `title`: "F1 Records & Milestones - All-Time Leaderboards | f1gures"
- `description`: "Every F1 leaderboard, from most race wins to longest podium streaks. All-time and modern-era rankings since 1950."
- `canonicalPath`: `/records/`
- JSON-LD: `CollectionPage` with an `ItemList` of the 17 records, each as a `ListItem` whose `url` is `https://f1gures.app/records/<id>/`.
- `breadcrumb`: `[Home, Records]`.

### Sub-pages

- `title`: e.g. "Most F1 Race Wins - All-Time Leaderboard | f1gures"
- `description`: drawn from the record's `blurb` extended with "Top 50 drivers all-time and from 1981 onwards."
- `canonicalPath`: `/records/<id>/`
- JSON-LD: `ItemList` with all 50 all-time entries (skip modern from JSON-LD to keep payload bounded; modern is still in HTML for crawlers).
- `breadcrumb`: `[Home, Records, <title>]`.

`@astrojs/sitemap` picks the routes up automatically from `getStaticPaths`.

## 8. Out of Scope (v1)

- Back-links from driver / team / circuit detail pages to records sub-pages they appear on.
- Per-decade or per-engine-era filters.
- Combined "all leaderboards" search.
- Records that need lap-time analysis (fastest lap of all time, etc.) - the lap_times CSV is loaded but currently unused for aggregations; out of scope here.
- Active-era state persistence across navigation.

## 9. Risks & Notes

- **Build-archive size.** The file is ~2,000 lines; adding ~250 keeps it readable but is a known size pressure. Acceptable for now - similar in spirit to the existing per-pass structure.
- **Points-system caveat (title-margin).** Raw margins aren't comparable across eras. The `note` field on the sub-page is the mitigation; the era toggle further narrows the comparison. Champion-by-champion margin in points-per-win-equivalent is a richer-but-bigger feature, deferred.
- **Streak edge cases.** Drivers who skip a race weekend (illness, injury) but return next round - the missing race breaks the streak per the rule above. Matches how F1's own records page treats them.
- **Youngest-champion measurement date.** Age is computed at the *final-round date* of the championship year, not the mathematically-clinching date. This is a simplification - the clinching date is what Wikipedia uses. Final-round date is what the existing `finalRaceIdByYear` data structure makes trivial; clinching date would need extra computation per year. v1 picks the simpler signal and documents it.
- **Tie volume.** For low-value records (e.g. championships: 7 drivers tie at 1), the top-5 may have many ties. The rank-1-1-3 display handles this; visually the card will show two or three drivers as "rank 1" with stat 1, which is correct.
