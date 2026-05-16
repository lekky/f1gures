# Records & Milestones Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/records/` — a hub of 17 curated F1 leaderboards across 5 sections, each with a top-50 sub-page and an all-time / modern-era (1981+) toggle.

**Architecture:** Pure-function records library under `scripts/records/` (testable in isolation with vitest), called from a new pass at the end of `scripts/build-archive.mjs`. The library emits `public/data/archive/_records-index.json` and one `records/<topic>.json` per record. Astro prerenders the hub and every sub-page from those JSONs at build time — no React island, no client fetches. Era toggle on sub-pages is a ~15-line inline script that flips `hidden` on a sibling table.

**Tech Stack:** Node ESM, Astro 4 SSG, vitest (existing). No new dependencies.

**Spec:** [docs/superpowers/specs/2026-05-17-records-hub-design.md](docs/superpowers/specs/2026-05-17-records-hub-design.md)

---

## File map

**New:**
- `scripts/records/configs.mjs` — the 17 record definitions (id, title, blurb, group, subjectType, valueFormat).
- `scripts/records/helpers.mjs` — pure helpers: era filtering, rank-with-ties, formatters.
- `scripts/records/helpers.test.js` — vitest unit tests.
- `scripts/records/generators.mjs` — one generator per record type. Each returns an array of entries.
- `scripts/records/generators.test.js` — vitest unit tests with fixture data.
- `scripts/records/index.mjs` — top-level `buildRecords({...})` orchestrator that returns `{ index, byTopic }`.
- `src/components/RecordHeroCard.astro` — hub card.
- `src/components/RecordsTable.astro` — sub-page top-50 table (both eras pre-rendered).
- `src/pages/records/index.astro` — hub page.
- `src/pages/records/[topic].astro` — per-topic sub-page.

**Modified:**
- `scripts/build-archive.mjs` — append records pass at end (~30 lines: import library, call orchestrator, write JSONs).
- `src/components/islands/StandingsDropdown.jsx` — add a third menu item.
- `src/components/Chrome.astro` — extend `route.standings` predicate to include `/records`.
- `public/css/app.css` — add `.records-*` styles (~120 lines added).

**Outputs (gitignored, regenerated each prebuild — `public/data/archive/` is already covered by `.gitignore`):**
- `public/data/archive/_records-index.json`
- `public/data/archive/records/<topic>.json` × 17

---

## Task 1: Define record configs

**Files:**
- Create: `scripts/records/configs.mjs`

- [ ] **Step 1: Create the configs module**

```js
// scripts/records/configs.mjs
//
// Static config for every record in the hub. The records pass in build-archive.mjs
// iterates over RECORD_CONFIGS to drive which generators run and what metadata
// gets attached to each leaderboard.
//
// Field meaning:
//   id            kebab-case slug; URL segment and JSON filename
//   group         section id on the hub page (one of GROUPS keys)
//   title         display string for headings + card eyebrow
//   blurb         one-line description for the sub-page header and meta
//   subjectType   "driver" | "team" | "driver-at-circuit" — drives row rendering
//   valueFormat   "integer" | "age" | "points" — drives valueLabel formatting
//   note          optional caveat shown on the sub-page (currently only title-margin)

export const GROUPS = [
  { id: 'career',         label: 'Career' },
  { id: 'season-streaks', label: 'Single-season & streaks' },
  { id: 'milestones',     label: 'Milestones' },
  { id: 'teams',          label: 'Teams' },
  { id: 'circuit',        label: 'Race & circuit' },
];

export const RECORD_CONFIGS = [
  // Career (driver)
  { id: 'wins',            group: 'career', subjectType: 'driver', valueFormat: 'integer',
    title: 'Most race wins',           blurb: 'Career grand prix victories.' },
  { id: 'podiums',         group: 'career', subjectType: 'driver', valueFormat: 'integer',
    title: 'Most career podiums',      blurb: 'Career top-three finishes.' },
  { id: 'poles',           group: 'career', subjectType: 'driver', valueFormat: 'integer',
    title: 'Most pole positions',      blurb: 'Career pole positions in qualifying.' },
  { id: 'championships',   group: 'career', subjectType: 'driver', valueFormat: 'integer',
    title: 'Most drivers’ championships', blurb: 'World Drivers’ Championships won.' },
  { id: 'starts',          group: 'career', subjectType: 'driver', valueFormat: 'integer',
    title: 'Most race starts',         blurb: 'Career grand prix entries.' },
  { id: 'fastest-laps',    group: 'career', subjectType: 'driver', valueFormat: 'integer',
    title: 'Most fastest laps',        blurb: 'Career fastest-lap records.' },

  // Single-season & streaks (driver)
  { id: 'wins-in-season',  group: 'season-streaks', subjectType: 'driver', valueFormat: 'integer',
    title: 'Most wins in a single season', blurb: 'Highest race-win total in one calendar season.' },
  { id: 'podium-streak',   group: 'season-streaks', subjectType: 'driver', valueFormat: 'integer',
    title: 'Longest consecutive-podium streak', blurb: 'Longest run of consecutive top-three finishes.' },
  { id: 'win-streak',      group: 'season-streaks', subjectType: 'driver', valueFormat: 'integer',
    title: 'Longest consecutive-win streak', blurb: 'Longest run of consecutive race wins.' },
  { id: 'title-margin',    group: 'season-streaks', subjectType: 'driver', valueFormat: 'points',
    title: 'Biggest championship-winning margin',
    blurb: 'Largest points gap between the champion and the runner-up.',
    note: 'Raw point margins aren’t directly comparable across eras - F1’s points system has changed several times since 1950.' },

  // Milestones (driver)
  { id: 'youngest-champion', group: 'milestones', subjectType: 'driver', valueFormat: 'age',
    title: 'Youngest world champion',
    blurb: 'Drivers ordered by age at the final round of the season they won their first title.' },
  { id: 'oldest-winner',   group: 'milestones', subjectType: 'driver', valueFormat: 'age',
    title: 'Oldest race winner',
    blurb: 'Drivers ordered by age at the date of their oldest race-winning result.' },

  // Teams
  { id: 'team-titles',     group: 'teams', subjectType: 'team', valueFormat: 'integer',
    title: 'Most constructors’ championships', blurb: 'World Constructors’ Championships won.' },
  { id: 'team-wins',       group: 'teams', subjectType: 'team', valueFormat: 'integer',
    title: 'Most team race wins',      blurb: 'Career grand prix victories by constructor.' },
  { id: 'team-1-2-finishes', group: 'teams', subjectType: 'team', valueFormat: 'integer',
    title: 'Most 1-2 finishes',        blurb: 'Races where the same constructor took both first and second place.' },

  // Race & circuit (driver-at-circuit)
  { id: 'wins-at-circuit', group: 'circuit', subjectType: 'driver-at-circuit', valueFormat: 'integer',
    title: 'Most wins by one driver at one circuit', blurb: 'Largest concentration of victories by a single driver at a single venue.' },
  { id: 'poles-at-circuit', group: 'circuit', subjectType: 'driver-at-circuit', valueFormat: 'integer',
    title: 'Most poles by one driver at one circuit', blurb: 'Largest concentration of pole positions by a single driver at a single venue.' },
];

export const MODERN_ERA_START_YEAR = 1981;
export const TOP5 = 5;
export const TOP50 = 50;
```

- [ ] **Step 2: Commit**

```bash
git add scripts/records/configs.mjs
git commit -m "feat(records): add config table for 17 leaderboards"
```

---

## Task 2: Helpers — era filter and rank-with-ties

**Files:**
- Create: `scripts/records/helpers.mjs`
- Test: `scripts/records/helpers.test.js`

- [ ] **Step 1: Write failing tests for `filterPerRaceByEra` and `assignRanksWithTies`**

```js
// scripts/records/helpers.test.js
import { describe, it, expect } from 'vitest';
import { filterPerRaceByEra, assignRanksWithTies, MODERN_ERA_START_YEAR } from './helpers.mjs';

describe('filterPerRaceByEra', () => {
  const rows = [
    { year: 1976, round: 1 },
    { year: 1980, round: 14 },
    { year: 1981, round: 1 },
    { year: 2024, round: 24 },
  ];

  it('returns all rows for "all-time"', () => {
    expect(filterPerRaceByEra(rows, 'all-time', 2026)).toHaveLength(4);
  });

  it('drops pre-1981 rows for "modern"', () => {
    const out = filterPerRaceByEra(rows, 'modern', 2026);
    expect(out).toHaveLength(2);
    expect(out.every(r => r.year >= MODERN_ERA_START_YEAR)).toBe(true);
  });

  it('drops in-progress current year for both eras', () => {
    const withCurrent = [...rows, { year: 2026, round: 5 }];
    expect(filterPerRaceByEra(withCurrent, 'all-time', 2026)).toHaveLength(4);
    expect(filterPerRaceByEra(withCurrent, 'modern', 2026)).toHaveLength(2);
  });
});

describe('assignRanksWithTies', () => {
  it('assigns 1,2,3 to strict ordering', () => {
    const entries = [{ value: 10 }, { value: 8 }, { value: 5 }];
    assignRanksWithTies(entries);
    expect(entries.map(e => e.rank)).toEqual([1, 2, 3]);
  });

  it('ties share a rank and the next rank skips', () => {
    const entries = [{ value: 10 }, { value: 10 }, { value: 8 }, { value: 8 }, { value: 5 }];
    assignRanksWithTies(entries);
    expect(entries.map(e => e.rank)).toEqual([1, 1, 3, 3, 5]);
  });

  it('empty array is a no-op', () => {
    expect(() => assignRanksWithTies([])).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run scripts/records/helpers.test.js
```

Expected: FAIL — `Cannot find module './helpers.mjs'`.

- [ ] **Step 3: Implement the helpers**

```js
// scripts/records/helpers.mjs
//
// Pure helpers for the records pipeline. No I/O.

export const MODERN_ERA_START_YEAR = 1981;

// Drop rows whose year is the in-progress current year (we don't have the data
// to compute a stable final standing yet) and, when era === 'modern', drop
// anything before MODERN_ERA_START_YEAR.
export function filterPerRaceByEra(rows, era, currentYear) {
  return rows.filter(r => {
    if (r.year == null) return false;
    if (r.year === currentYear) return false;
    if (era === 'modern' && r.year < MODERN_ERA_START_YEAR) return false;
    return true;
  });
}

// Mutates entries[] adding a `rank` field. Ties share a rank; the next rank
// skips by the number of ties (1, 1, 3, 4 — not 1, 1, 2, 3).
// Assumes entries are already sorted by value descending.
export function assignRanksWithTies(entries) {
  let lastValue = null;
  let lastRank = 0;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].value !== lastValue) {
      lastRank = i + 1;
      lastValue = entries[i].value;
    }
    entries[i].rank = lastRank;
  }
}
```

- [ ] **Step 4: Run the tests — all pass**

```bash
npx vitest run scripts/records/helpers.test.js
```

Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/records/helpers.mjs scripts/records/helpers.test.js
git commit -m "feat(records): add era-filter and rank-with-ties helpers"
```

---

## Task 3: Helpers — age, year-range, and sort comparators

**Files:**
- Modify: `scripts/records/helpers.mjs`
- Modify: `scripts/records/helpers.test.js`

- [ ] **Step 1: Append failing tests**

Append to `scripts/records/helpers.test.js`:

```js
import { formatAge, formatYearsRange, compareEntries } from './helpers.mjs';

describe('formatAge', () => {
  it('returns "<years>y <days>d" for a normal age', () => {
    // 25 years, 100 days from 1990-01-01 to ~2015-04-11
    expect(formatAge('1990-01-01', '2015-04-11')).toBe('25y 100d');
  });

  it('handles February correctly across non-leap years', () => {
    expect(formatAge('2000-02-01', '2001-02-01')).toBe('1y 0d');
  });

  it('returns null on missing input', () => {
    expect(formatAge(null, '2020-01-01')).toBeNull();
    expect(formatAge('2000-01-01', null)).toBeNull();
  });
});

describe('formatYearsRange', () => {
  it('joins first and last with an en-dash equivalent', () => {
    expect(formatYearsRange(2007, 2023)).toBe('2007-2023');
  });

  it('returns just the year when first === last', () => {
    expect(formatYearsRange(1958, 1958)).toBe('1958');
  });

  it('appends "present" when lastYear matches the current year', () => {
    expect(formatYearsRange(2019, 2026, 2026)).toBe('2019-present');
  });
});

describe('compareEntries', () => {
  it('sorts by value descending', () => {
    const out = [{ value: 1 }, { value: 5 }, { value: 3 }].sort(compareEntries);
    expect(out.map(e => e.value)).toEqual([5, 3, 1]);
  });

  it('breaks ties by races ascending', () => {
    const out = [
      { value: 5, races: 100 },
      { value: 5, races: 50 },
      { value: 5, races: 75 },
    ].sort(compareEntries);
    expect(out.map(e => e.races)).toEqual([50, 75, 100]);
  });

  it('falls back to firstYear ascending', () => {
    const out = [
      { value: 5, races: 50, firstYear: 2010 },
      { value: 5, races: 50, firstYear: 1990 },
    ].sort(compareEntries);
    expect(out[0].firstYear).toBe(1990);
  });
});
```

- [ ] **Step 2: Run the tests — verify they fail**

```bash
npx vitest run scripts/records/helpers.test.js
```

Expected: FAIL — the new exports don't exist yet.

- [ ] **Step 3: Implement the new helpers**

Append to `scripts/records/helpers.mjs`:

```js
// "25y 100d" — years and remainder days between two ISO dates (YYYY-MM-DD).
// Returns null if either input is falsy.
export function formatAge(birthIso, eventIso) {
  if (!birthIso || !eventIso) return null;
  const birth = new Date(birthIso + 'T00:00:00Z');
  const event = new Date(eventIso + 'T00:00:00Z');
  if (isNaN(birth) || isNaN(event)) return null;
  let years = event.getUTCFullYear() - birth.getUTCFullYear();
  const anniversary = new Date(Date.UTC(
    event.getUTCFullYear(),
    birth.getUTCMonth(),
    birth.getUTCDate(),
  ));
  if (anniversary > event) {
    years--;
    anniversary.setUTCFullYear(anniversary.getUTCFullYear() - 1);
  }
  const ms = event - anniversary;
  const days = Math.round(ms / (24 * 60 * 60 * 1000));
  return `${years}y ${days}d`;
}

// "2007-2023" or "2019-present" or just "1958" depending on inputs.
export function formatYearsRange(firstYear, lastYear, currentYear) {
  if (firstYear == null && lastYear == null) return '';
  if (firstYear === lastYear) return String(firstYear);
  const right = (currentYear != null && lastYear === currentYear) ? 'present' : String(lastYear);
  return `${firstYear}-${right}`;
}

// Array.sort comparator: value desc, then races asc, then firstYear asc.
export function compareEntries(a, b) {
  if (b.value !== a.value) return b.value - a.value;
  const ra = a.races ?? Infinity;
  const rb = b.races ?? Infinity;
  if (ra !== rb) return ra - rb;
  const ya = a.firstYear ?? Infinity;
  const yb = b.firstYear ?? Infinity;
  return ya - yb;
}
```

- [ ] **Step 4: Run the tests — all pass**

```bash
npx vitest run scripts/records/helpers.test.js
```

Expected: PASS — 6 prior + 9 new = 15 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/records/helpers.mjs scripts/records/helpers.test.js
git commit -m "feat(records): add age/year-range formatters and sort comparator"
```

---

## Task 4: Generators — driver career records

**Files:**
- Create: `scripts/records/generators.mjs`
- Test: `scripts/records/generators.test.js`

This task covers the six career records (`wins`, `podiums`, `poles`, `championships`, `starts`, `fastest-laps`). They share one generator that recomputes from each driver's `perRace` filtered by era — we can't trust `career.wins` etc. for the modern era because those are full-career totals.

- [ ] **Step 1: Write failing tests**

```js
// scripts/records/generators.test.js
import { describe, it, expect } from 'vitest';
import { generateDriverCareerEntries } from './generators.mjs';

const DRIVERS = [
  {
    driverRef: 'hamilton', forename: 'Lewis', surname: 'Hamilton', code: 'HAM',
    nationality: 'British', dob: '1985-01-07',
    natInfo: { country: 'GB', flag: '🇬🇧' },
    perRace: [
      { year: 2007, round: 1, position: 3, grid: 4, fastestLapRank: null, constructorRef: 'mclaren', constructorName: 'McLaren' },
      { year: 2008, round: 6, position: 1, grid: 1, fastestLapRank: 1, constructorRef: 'mclaren', constructorName: 'McLaren' },
      { year: 2014, round: 1, position: 1, grid: 1, fastestLapRank: null, constructorRef: 'mercedes', constructorName: 'Mercedes' },
      { year: 2020, round: 1, position: 1, grid: 1, fastestLapRank: null, constructorRef: 'mercedes', constructorName: 'Mercedes' },
    ],
    finalStandingByYear: { 2008: { position: 1 }, 2014: { position: 1 }, 2020: { position: 1 } },
  },
  {
    driverRef: 'norris', forename: 'Lando', surname: 'Norris', code: 'NOR',
    nationality: 'British', dob: '1999-11-13',
    natInfo: { country: 'GB', flag: '🇬🇧' },
    perRace: [
      { year: 2024, round: 5, position: 1, grid: 1, fastestLapRank: null, constructorRef: 'mclaren', constructorName: 'McLaren' },
      { year: 2024, round: 7, position: 2, grid: 2, fastestLapRank: null, constructorRef: 'mclaren', constructorName: 'McLaren' },
    ],
    finalStandingByYear: {},
  },
];

describe('generateDriverCareerEntries - wins', () => {
  it('all-time: hamilton has 3 wins, norris 1', () => {
    const entries = generateDriverCareerEntries(DRIVERS, 'wins', 'all-time', 2026);
    expect(entries[0].driverRef).toBe('hamilton');
    expect(entries[0].value).toBe(3);
    expect(entries[1].driverRef).toBe('norris');
    expect(entries[1].value).toBe(1);
  });

  it('current-year rows excluded - norris drops to 0 wins and is filtered out', () => {
    const entries = generateDriverCareerEntries(DRIVERS, 'wins', 'all-time', 2024);
    const norris = entries.find(e => e.driverRef === 'norris');
    expect(norris).toBeUndefined();
  });

  it('modern-era filter drops a pre-1981 row', () => {
    const drivers = [{
      driverRef: 'lauda', forename: 'Niki', surname: 'Lauda', code: 'LAU',
      dob: '1949-02-22', natInfo: { country: 'AT', flag: 'X' },
      perRace: [
        { year: 1975, round: 1, position: 1, grid: 1, fastestLapRank: null, constructorRef: 'ferrari', constructorName: 'Ferrari' },
        { year: 1984, round: 1, position: 1, grid: 1, fastestLapRank: null, constructorRef: 'mclaren', constructorName: 'McLaren' },
      ],
      finalStandingByYear: { 1975: { position: 1 }, 1984: { position: 1 } },
    }];
    expect(generateDriverCareerEntries(drivers, 'wins', 'all-time', 2026)[0].value).toBe(2);
    expect(generateDriverCareerEntries(drivers, 'wins', 'modern',   2026)[0].value).toBe(1);
  });

  it('attaches teamRef / context / flag / shortName / valueLabel', () => {
    const entries = generateDriverCareerEntries(DRIVERS, 'wins', 'all-time', 2026);
    const ham = entries.find(e => e.driverRef === 'hamilton');
    expect(ham.teamRef).toBe('mercedes'); // most-raced team
    expect(ham.flag).toBe('🇬🇧');
    expect(ham.shortName).toBe('L. Hamilton');
    expect(ham.context).toBe('2007-2020');
    expect(ham.valueLabel).toBe('3 wins');
  });
});

describe('generateDriverCareerEntries - other stats', () => {
  it('podiums counts position <= 3', () => {
    const entries = generateDriverCareerEntries(DRIVERS, 'podiums', 'all-time', 2026);
    expect(entries[0].driverRef).toBe('hamilton');
    expect(entries[0].value).toBe(4); // P3, P1, P1, P1
  });

  it('poles counts grid === 1', () => {
    const entries = generateDriverCareerEntries(DRIVERS, 'poles', 'all-time', 2026);
    expect(entries[0].value).toBe(3); // hamilton: 2008, 2014, 2020
  });

  it('championships counts finalStandingByYear with position === 1, era-aware', () => {
    expect(generateDriverCareerEntries(DRIVERS, 'championships', 'all-time', 2026)[0].value).toBe(3);
    // currentYear excludes 2020
    expect(generateDriverCareerEntries(DRIVERS, 'championships', 'all-time', 2020)[0].value).toBe(2);
  });

  it('starts counts every perRace row', () => {
    const entries = generateDriverCareerEntries(DRIVERS, 'starts', 'all-time', 2026);
    expect(entries[0].value).toBe(4); // hamilton
  });

  it('fastest-laps counts fastestLapRank === 1', () => {
    const entries = generateDriverCareerEntries(DRIVERS, 'fastest-laps', 'all-time', 2026);
    expect(entries[0].value).toBe(1); // hamilton, 2008 only
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
npx vitest run scripts/records/generators.test.js
```

Expected: FAIL — `Cannot find module './generators.mjs'`.

- [ ] **Step 3: Implement the generator**

```js
// scripts/records/generators.mjs
//
// One function per record. Each takes the relevant pre-aggregated data
// (driver/team docs etc.) plus an era flag and returns an array of unsorted,
// unranked entries. The orchestrator sorts, caps, and assigns ranks.
//
// Each driver doc passed in is expected to have:
//   driverRef, forename, surname, code, nationality, dob
//   natInfo: { country, flag }   (the importer's natInfo() result, pre-attached)
//   perRace[]: { year, round, position, grid, fastestLapRank, constructorRef, constructorName, circuitId, date, statusId }
//   finalStandingByYear: { [year]: { position } }   (championship lookup)

import { filterPerRaceByEra, formatYearsRange, compareEntries, assignRanksWithTies } from './helpers.mjs';

function shortName(d) {
  const first = (d.forename || '').trim();
  const last = (d.surname || '').trim();
  if (!first) return last;
  return `${first[0]}. ${last}`;
}

function primaryTeamFromRows(rows) {
  const counts = new Map();
  for (const r of rows) {
    if (!r.constructorRef) continue;
    counts.set(r.constructorRef, (counts.get(r.constructorRef) || 0) + 1);
  }
  let topRef = null, topCount = 0, topName = null;
  for (const r of rows) {
    const c = counts.get(r.constructorRef) || 0;
    if (c > topCount) { topCount = c; topRef = r.constructorRef; topName = r.constructorName; }
  }
  return { ref: topRef, name: topName };
}

const STAT_FORMAT = {
  wins: 'wins',
  podiums: 'podiums',
  poles: 'poles',
  championships: 'titles',
  starts: 'starts',
  'fastest-laps': 'fastest laps',
};

function countStat(rows, stat, finalStandingByYear, era, currentYear) {
  switch (stat) {
    case 'wins':         return rows.filter(r => r.position === 1).length;
    case 'podiums':      return rows.filter(r => r.position != null && r.position <= 3).length;
    case 'poles':        return rows.filter(r => r.grid === 1).length;
    case 'starts':       return rows.length;
    case 'fastest-laps': return rows.filter(r => r.fastestLapRank === 1).length;
    case 'championships': {
      let n = 0;
      for (const yearStr of Object.keys(finalStandingByYear || {})) {
        const year = Number(yearStr);
        if (year === currentYear) continue;
        if (era === 'modern' && year < 1981) continue;
        if (finalStandingByYear[yearStr]?.position === 1) n++;
      }
      return n;
    }
    default: return 0;
  }
}

export function generateDriverCareerEntries(drivers, stat, era, currentYear) {
  const entries = [];
  for (const d of drivers) {
    const rows = filterPerRaceByEra(d.perRace || [], era, currentYear);

    const value = countStat(rows, stat, d.finalStandingByYear, era, currentYear);
    if (value === 0) continue;

    const team = primaryTeamFromRows(rows);
    const years = rows.map(r => r.year);
    const firstYear = years.length ? Math.min(...years) : null;
    const lastYear = years.length ? Math.max(...years) : null;
    const context = formatYearsRange(firstYear, lastYear, currentYear);

    entries.push({
      value,
      valueLabel: `${value} ${STAT_FORMAT[stat]}`,
      races: rows.length,
      firstYear,
      driverRef: d.driverRef,
      name: `${d.forename || ''} ${d.surname || ''}`.trim(),
      shortName: shortName(d),
      code: d.code || null,
      flag: d.natInfo?.flag || null,
      country: d.natInfo?.country || null,
      teamRef: team.ref,
      teamName: team.name,
      teamColor: null,            // populated by orchestrator from team-color map
      context,
    });
  }
  entries.sort(compareEntries);
  assignRanksWithTies(entries);
  return entries;
}
```

- [ ] **Step 4: Run — verify tests pass**

```bash
npx vitest run scripts/records/generators.test.js
```

Expected: PASS — 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/records/generators.mjs scripts/records/generators.test.js
git commit -m "feat(records): add driver-career generator (wins/podiums/poles/champs/starts/FLs)"
```

---

## Task 5: Generator — wins-in-season

**Files:**
- Modify: `scripts/records/generators.mjs`
- Modify: `scripts/records/generators.test.js`

- [ ] **Step 1: Append failing tests**

Append to `scripts/records/generators.test.js`:

```js
import { generateWinsInSeasonEntries } from './generators.mjs';

describe('generateWinsInSeasonEntries', () => {
  const drivers = [
    {
      driverRef: 'verstappen', forename: 'Max', surname: 'Verstappen', code: 'VER',
      dob: '1997-09-30', natInfo: { country: 'NL', flag: '🇳🇱' },
      perRace: [
        { year: 2023, round: 1, position: 1, constructorRef: 'red_bull', constructorName: 'Red Bull' },
        { year: 2023, round: 2, position: 1, constructorRef: 'red_bull', constructorName: 'Red Bull' },
        { year: 2023, round: 3, position: 1, constructorRef: 'red_bull', constructorName: 'Red Bull' },
        { year: 2022, round: 1, position: 1, constructorRef: 'red_bull', constructorName: 'Red Bull' },
      ],
    },
  ];

  it('returns the best season per driver', () => {
    const entries = generateWinsInSeasonEntries(drivers, 'all-time', 2026);
    expect(entries[0].value).toBe(3);
    expect(entries[0].context).toBe('2023 - Red Bull');
  });

  it('era filter excludes pre-1981', () => {
    const drivers81 = [{
      ...drivers[0], perRace: [
        { year: 1976, round: 1, position: 1, constructorRef: 'mclaren', constructorName: 'McLaren' },
        { year: 1976, round: 2, position: 1, constructorRef: 'mclaren', constructorName: 'McLaren' },
      ],
    }];
    expect(generateWinsInSeasonEntries(drivers81, 'modern', 2026)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
npx vitest run scripts/records/generators.test.js
```

Expected: FAIL — `generateWinsInSeasonEntries is not exported`.

- [ ] **Step 3: Implement**

Append to `scripts/records/generators.mjs`:

```js
export function generateWinsInSeasonEntries(drivers, era, currentYear) {
  const entries = [];
  for (const d of drivers) {
    const rows = filterPerRaceByEra(d.perRace || [], era, currentYear);
    if (!rows.length) continue;

    // Group by year, count wins
    const byYear = new Map();
    for (const r of rows) {
      if (!byYear.has(r.year)) byYear.set(r.year, []);
      byYear.get(r.year).push(r);
    }
    let bestYear = null, bestWins = 0, bestRows = null;
    for (const [year, list] of byYear) {
      const w = list.filter(r => r.position === 1).length;
      if (w > bestWins) { bestWins = w; bestYear = year; bestRows = list; }
    }
    if (bestWins === 0) continue;

    const team = primaryTeamFromRows(bestRows);
    entries.push({
      value: bestWins,
      valueLabel: `${bestWins} wins`,
      races: bestRows.length,
      firstYear: bestYear,
      driverRef: d.driverRef,
      name: `${d.forename || ''} ${d.surname || ''}`.trim(),
      shortName: shortName(d),
      code: d.code || null,
      flag: d.natInfo?.flag || null,
      country: d.natInfo?.country || null,
      teamRef: team.ref,
      teamName: team.name,
      teamColor: null,
      context: team.name ? `${bestYear} - ${team.name}` : String(bestYear),
    });
  }
  entries.sort(compareEntries);
  assignRanksWithTies(entries);
  return entries;
}
```

- [ ] **Step 4: Run — verify pass**

```bash
npx vitest run scripts/records/generators.test.js
```

Expected: PASS — 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/records/generators.mjs scripts/records/generators.test.js
git commit -m "feat(records): add wins-in-season generator"
```

---

## Task 6: Generator — streaks (win and podium)

**Files:**
- Modify: `scripts/records/generators.mjs`
- Modify: `scripts/records/generators.test.js`

- [ ] **Step 1: Append failing tests**

Append to `scripts/records/generators.test.js`:

```js
import { generateStreakEntries } from './generators.mjs';

describe('generateStreakEntries — win-streak', () => {
  const drivers = [{
    driverRef: 'vettel', forename: 'Sebastian', surname: 'Vettel', code: 'VET',
    dob: '1987-07-03', natInfo: { country: 'DE', flag: '🇩🇪' },
    perRace: [
      { year: 2013, round: 12, position: 2, constructorRef: 'red_bull', constructorName: 'Red Bull' },
      { year: 2013, round: 13, position: 1, constructorRef: 'red_bull', constructorName: 'Red Bull' },
      { year: 2013, round: 14, position: 1, constructorRef: 'red_bull', constructorName: 'Red Bull' },
      { year: 2013, round: 15, position: 1, constructorRef: 'red_bull', constructorName: 'Red Bull' },
      { year: 2013, round: 16, position: 1, constructorRef: 'red_bull', constructorName: 'Red Bull' },
      { year: 2013, round: 17, position: 2, constructorRef: 'red_bull', constructorName: 'Red Bull' }, // breaks
      { year: 2013, round: 18, position: 1, constructorRef: 'red_bull', constructorName: 'Red Bull' }, // restart
    ],
  }];

  it('finds the longest run of consecutive wins', () => {
    const entries = generateStreakEntries(drivers, 'win', 'all-time', 2026);
    expect(entries[0].value).toBe(4);
    expect(entries[0].context).toMatch(/2013/);
  });

  it('era filter breaks streaks across the boundary', () => {
    const cross = [{
      ...drivers[0], perRace: [
        { year: 1980, round: 14, position: 1, constructorRef: 'mclaren', constructorName: 'McLaren' },
        { year: 1981, round: 1, position: 1, constructorRef: 'mclaren', constructorName: 'McLaren' },
        { year: 1981, round: 2, position: 1, constructorRef: 'mclaren', constructorName: 'McLaren' },
      ],
    }];
    const modern = generateStreakEntries(cross, 'win', 'modern', 2026);
    expect(modern[0].value).toBe(2);
  });
});

describe('generateStreakEntries — podium-streak', () => {
  const drivers = [{
    driverRef: 'hamilton', forename: 'Lewis', surname: 'Hamilton', code: 'HAM',
    natInfo: { country: 'GB', flag: '' },
    perRace: [
      { year: 2014, round: 1, position: 3, constructorRef: 'mercedes', constructorName: 'Mercedes' },
      { year: 2014, round: 2, position: 1, constructorRef: 'mercedes', constructorName: 'Mercedes' },
      { year: 2014, round: 3, position: 2, constructorRef: 'mercedes', constructorName: 'Mercedes' },
      { year: 2014, round: 4, position: 5, constructorRef: 'mercedes', constructorName: 'Mercedes' }, // breaks
      { year: 2014, round: 5, position: 1, constructorRef: 'mercedes', constructorName: 'Mercedes' },
    ],
  }];

  it('counts top-3 streaks', () => {
    const entries = generateStreakEntries(drivers, 'podium', 'all-time', 2026);
    expect(entries[0].value).toBe(3);
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
npx vitest run scripts/records/generators.test.js
```

Expected: FAIL — `generateStreakEntries is not exported`.

- [ ] **Step 3: Implement**

Append to `scripts/records/generators.mjs`:

```js
// kind: 'win' (position === 1) | 'podium' (position != null && position <= 3)
export function generateStreakEntries(drivers, kind, era, currentYear) {
  const predicate = kind === 'win'
    ? (r) => r.position === 1
    : (r) => r.position != null && r.position <= 3;
  const stat = kind === 'win' ? 'wins' : 'podiums';

  const entries = [];
  for (const d of drivers) {
    const filteredAll = filterPerRaceByEra(d.perRace || [], era, currentYear);
    if (!filteredAll.length) continue;

    // Sort chronologically (perRace already mostly is, but be safe)
    const rows = filteredAll.slice().sort((a, b) => (a.year - b.year) || ((a.round || 0) - (b.round || 0)));

    let current = 0, best = 0;
    let currentStart = null, bestStart = null, bestEnd = null;
    for (const r of rows) {
      if (predicate(r)) {
        if (current === 0) currentStart = r;
        current++;
        if (current > best) {
          best = current;
          bestStart = currentStart;
          bestEnd = r;
        }
      } else {
        current = 0;
        currentStart = null;
      }
    }
    if (best === 0) continue;

    const team = primaryTeamFromRows([bestStart, bestEnd].filter(Boolean));
    const context = bestStart.year === bestEnd.year
      ? `${bestStart.year}`
      : `${bestStart.year}-${bestEnd.year}`;

    entries.push({
      value: best,
      valueLabel: `${best} ${stat}`,
      races: rows.length,
      firstYear: bestStart.year,
      driverRef: d.driverRef,
      name: `${d.forename || ''} ${d.surname || ''}`.trim(),
      shortName: shortName(d),
      code: d.code || null,
      flag: d.natInfo?.flag || null,
      country: d.natInfo?.country || null,
      teamRef: team.ref,
      teamName: team.name,
      teamColor: null,
      context,
    });
  }
  entries.sort(compareEntries);
  assignRanksWithTies(entries);
  return entries;
}
```

- [ ] **Step 4: Run — verify pass**

```bash
npx vitest run scripts/records/generators.test.js
```

Expected: PASS — 16 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/records/generators.mjs scripts/records/generators.test.js
git commit -m "feat(records): add win-streak and podium-streak generator"
```

---

## Task 7: Generator — title margin

**Files:**
- Modify: `scripts/records/generators.mjs`
- Modify: `scripts/records/generators.test.js`

`title-margin` runs over **years**, not drivers. For each year, find the champion and runner-up's final-round points, return one entry per year.

- [ ] **Step 1: Append failing test**

Append to `scripts/records/generators.test.js`:

```js
import { generateTitleMarginEntries } from './generators.mjs';

describe('generateTitleMarginEntries', () => {
  // yearStandings[year] = { p1: {driverRef, name, points, surname}, p2: {...} }
  const yearStandings = {
    1992: { p1: { driverRef: 'mansell', name: 'Nigel Mansell', surname: 'Mansell', points: 108 },
            p2: { driverRef: 'patrese', name: 'Riccardo Patrese', surname: 'Patrese', points: 56 } },
    2023: { p1: { driverRef: 'max_verstappen', name: 'Max Verstappen', surname: 'Verstappen', points: 575 },
            p2: { driverRef: 'perez', name: 'Sergio Perez', surname: 'Pérez', points: 285 } },
    1976: { p1: { driverRef: 'hunt', name: 'James Hunt', surname: 'Hunt', points: 69 },
            p2: { driverRef: 'lauda', name: 'Niki Lauda', surname: 'Lauda', points: 68 } },
  };
  const driversByRef = new Map([
    ['mansell',        { driverRef: 'mansell',        forename: 'Nigel', surname: 'Mansell',  code: 'MAN', natInfo: { country: 'GB', flag: 'X' } }],
    ['max_verstappen', { driverRef: 'max_verstappen', forename: 'Max',   surname: 'Verstappen', code: 'VER', natInfo: { country: 'NL', flag: 'Y' } }],
    ['hunt',           { driverRef: 'hunt',           forename: 'James', surname: 'Hunt',     code: 'HUN', natInfo: { country: 'GB', flag: 'Z' } }],
  ]);

  it('returns one entry per year, sorted by margin desc', () => {
    const entries = generateTitleMarginEntries(yearStandings, driversByRef, 'all-time', 2026);
    expect(entries[0].driverRef).toBe('max_verstappen');
    expect(entries[0].value).toBe(290);
    expect(entries[0].context).toBe('2023 - beat Pérez');
    expect(entries[1].driverRef).toBe('mansell');
  });

  it('modern era drops 1976', () => {
    const entries = generateTitleMarginEntries(yearStandings, driversByRef, 'modern', 2026);
    expect(entries.find(e => e.context.startsWith('1976'))).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
npx vitest run scripts/records/generators.test.js
```

Expected: FAIL — `generateTitleMarginEntries is not exported`.

- [ ] **Step 3: Implement**

Append to `scripts/records/generators.mjs`:

```js
// yearStandings: { [year]: { p1: {driverRef,name,surname,points}, p2: {driverRef,name,surname,points} } }
// driversByRef: Map<driverRef, driverDoc>  (for flag/short-name/team lookup)
export function generateTitleMarginEntries(yearStandings, driversByRef, era, currentYear) {
  const entries = [];
  for (const yearStr of Object.keys(yearStandings)) {
    const year = Number(yearStr);
    if (year === currentYear) continue;
    if (era === 'modern' && year < 1981) continue;

    const row = yearStandings[yearStr];
    if (!row?.p1 || !row?.p2) continue;
    const margin = (row.p1.points || 0) - (row.p2.points || 0);
    if (margin <= 0) continue;

    const champ = driversByRef.get(row.p1.driverRef);
    entries.push({
      value: margin,
      valueLabel: `${margin} pts`,
      races: 0,
      firstYear: year,
      driverRef: row.p1.driverRef,
      name: row.p1.name,
      shortName: champ ? shortName(champ) : row.p1.name,
      code: champ?.code || null,
      flag: champ?.natInfo?.flag || null,
      country: champ?.natInfo?.country || null,
      teamRef: null,        // filled by orchestrator from the per-driver season team
      teamName: null,
      teamColor: null,
      context: `${year} - beat ${row.p2.surname}`,
    });
  }
  entries.sort(compareEntries);
  assignRanksWithTies(entries);
  return entries;
}
```

- [ ] **Step 4: Run — verify pass**

```bash
npx vitest run scripts/records/generators.test.js
```

Expected: PASS — 18 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/records/generators.mjs scripts/records/generators.test.js
git commit -m "feat(records): add title-margin generator"
```

---

## Task 8: Generator — milestones (youngest-champion, oldest-winner)

**Files:**
- Modify: `scripts/records/generators.mjs`
- Modify: `scripts/records/generators.test.js`

- [ ] **Step 1: Append failing tests**

Append to `scripts/records/generators.test.js`:

```js
import { generateYoungestChampionEntries, generateOldestWinnerEntries } from './generators.mjs';

describe('generateYoungestChampionEntries', () => {
  const drivers = [{
    driverRef: 'max_verstappen', forename: 'Max', surname: 'Verstappen', code: 'VER',
    dob: '1997-09-30', natInfo: { country: 'NL', flag: 'X' },
    perRace: [{ year: 2021, round: 22, position: 1, date: '2021-12-12', constructorRef: 'red_bull', constructorName: 'Red Bull' }],
    finalStandingByYear: { 2021: { position: 1 } },
  }];
  const finalRoundDateByYear = { 2021: '2021-12-12' };

  it('uses age at final-round date of the first championship', () => {
    const entries = generateYoungestChampionEntries(drivers, finalRoundDateByYear, 'all-time', 2026);
    expect(entries[0].driverRef).toBe('max_verstappen');
    expect(entries[0].value).toBeLessThan(25 * 365); // value is age in days
    expect(entries[0].valueLabel).toMatch(/24y \d+d/);
  });
});

describe('generateOldestWinnerEntries', () => {
  const drivers = [{
    driverRef: 'farina', forename: 'Nino', surname: 'Farina', code: 'FAR',
    dob: '1906-10-30', natInfo: { country: 'IT', flag: 'X' },
    perRace: [
      { year: 1953, round: 7, position: 1, date: '1953-09-13', constructorRef: 'ferrari', constructorName: 'Ferrari' },
      { year: 1955, round: 3, position: 5, date: '1955-05-22', constructorRef: 'ferrari', constructorName: 'Ferrari' },
    ],
  }];

  it('uses the oldest race-winning date', () => {
    const entries = generateOldestWinnerEntries(drivers, 'all-time', 2026);
    expect(entries[0].driverRef).toBe('farina');
    expect(entries[0].valueLabel).toMatch(/46y \d+d/);
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
npx vitest run scripts/records/generators.test.js
```

Expected: FAIL — the new generators aren't exported.

- [ ] **Step 3: Implement**

Append to `scripts/records/generators.mjs`:

```js
import { formatAge } from './helpers.mjs';

// Age in days as the leaderboard's `value` so sort comparator works naturally.
// `valueLabel` is the human "Xy Yd" string.
function ageInDays(dobIso, eventIso) {
  if (!dobIso || !eventIso) return null;
  const dob = new Date(dobIso + 'T00:00:00Z');
  const evt = new Date(eventIso + 'T00:00:00Z');
  if (isNaN(dob) || isNaN(evt)) return null;
  return Math.floor((evt - dob) / (24 * 60 * 60 * 1000));
}

export function generateYoungestChampionEntries(drivers, finalRoundDateByYear, era, currentYear) {
  const entries = [];
  for (const d of drivers) {
    if (!d.dob) continue;
    const champYears = Object.keys(d.finalStandingByYear || {})
      .filter(y => d.finalStandingByYear[y]?.position === 1)
      .map(Number)
      .filter(y => y !== currentYear && (era !== 'modern' || y >= 1981));
    if (!champYears.length) continue;
    const firstChampYear = Math.min(...champYears);
    const eventDate = finalRoundDateByYear[firstChampYear];
    if (!eventDate) continue;
    const ageDays = ageInDays(d.dob, eventDate);
    if (ageDays == null) continue;

    const team = primaryTeamFromRows((d.perRace || []).filter(r => r.year === firstChampYear));
    entries.push({
      value: ageDays,
      valueLabel: formatAge(d.dob, eventDate) || `${ageDays}d`,
      races: 0,
      firstYear: firstChampYear,
      driverRef: d.driverRef,
      name: `${d.forename || ''} ${d.surname || ''}`.trim(),
      shortName: shortName(d),
      code: d.code || null,
      flag: d.natInfo?.flag || null,
      country: d.natInfo?.country || null,
      teamRef: team.ref,
      teamName: team.name,
      teamColor: null,
      context: `${firstChampYear}${team.name ? ` - ${team.name}` : ''}`,
    });
  }
  // Youngest = smallest age in days. Override default sort.
  entries.sort((a, b) => a.value - b.value);
  // assignRanksWithTies expects descending sort. Use a sentinel: temporarily
  // flip sign for ranking, then restore.
  entries.forEach(e => { e.value = -e.value; });
  assignRanksWithTies(entries);
  entries.forEach(e => { e.value = -e.value; });
  return entries;
}

export function generateOldestWinnerEntries(drivers, era, currentYear) {
  const entries = [];
  for (const d of drivers) {
    if (!d.dob) continue;
    const rows = filterPerRaceByEra(d.perRace || [], era, currentYear)
      .filter(r => r.position === 1 && r.date);
    if (!rows.length) continue;
    let oldestRow = rows[0], oldestDays = ageInDays(d.dob, rows[0].date) ?? -1;
    for (const r of rows) {
      const days = ageInDays(d.dob, r.date);
      if (days != null && days > oldestDays) { oldestDays = days; oldestRow = r; }
    }
    if (oldestDays < 0) continue;

    entries.push({
      value: oldestDays,
      valueLabel: formatAge(d.dob, oldestRow.date) || `${oldestDays}d`,
      races: 0,
      firstYear: oldestRow.year,
      driverRef: d.driverRef,
      name: `${d.forename || ''} ${d.surname || ''}`.trim(),
      shortName: shortName(d),
      code: d.code || null,
      flag: d.natInfo?.flag || null,
      country: d.natInfo?.country || null,
      teamRef: oldestRow.constructorRef || null,
      teamName: oldestRow.constructorName || null,
      teamColor: null,
      context: `${oldestRow.year} ${oldestRow.raceName || ''}`.trim(),
    });
  }
  entries.sort(compareEntries); // value desc — oldest is largest
  assignRanksWithTies(entries);
  return entries;
}
```

- [ ] **Step 4: Run — verify pass**

```bash
npx vitest run scripts/records/generators.test.js
```

Expected: PASS — 20 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/records/generators.mjs scripts/records/generators.test.js
git commit -m "feat(records): add youngest-champion and oldest-winner generators"
```

---

## Task 9: Generator — team career records (titles, wins)

**Files:**
- Modify: `scripts/records/generators.mjs`
- Modify: `scripts/records/generators.test.js`

- [ ] **Step 1: Append failing tests**

Append to `scripts/records/generators.test.js`:

```js
import { generateTeamCareerEntries } from './generators.mjs';

describe('generateTeamCareerEntries', () => {
  const teams = [
    {
      constructorRef: 'ferrari', name: 'Ferrari', nationality: 'Italian', color: '#E80020',
      perRace: [
        { year: 1979, round: 1, position: 1 },
        { year: 1979, round: 2, position: 1 },
        { year: 2000, round: 3, position: 1 },
      ],
      finalStandingByYear: { 1979: { position: 1 }, 2000: { position: 1 } },
    },
    {
      constructorRef: 'mercedes', name: 'Mercedes', nationality: 'German', color: '#27F4D2',
      perRace: [
        { year: 2014, round: 1, position: 1 },
        { year: 2014, round: 2, position: 1 },
      ],
      finalStandingByYear: { 2014: { position: 1 } },
    },
  ];

  it('team-wins counts position === 1 per result', () => {
    const entries = generateTeamCareerEntries(teams, 'wins', 'all-time', 2026);
    expect(entries[0].constructorRef).toBe('ferrari');
    expect(entries[0].value).toBe(3);
  });

  it('team-titles counts championship years', () => {
    const entries = generateTeamCareerEntries(teams, 'titles', 'all-time', 2026);
    expect(entries[0].value).toBe(2);
  });

  it('modern era drops 1979', () => {
    const entries = generateTeamCareerEntries(teams, 'wins', 'modern', 2026);
    const ferrari = entries.find(e => e.constructorRef === 'ferrari');
    expect(ferrari.value).toBe(1);
  });

  it('attaches teamColor and context', () => {
    const entries = generateTeamCareerEntries(teams, 'wins', 'all-time', 2026);
    expect(entries[0].teamColor).toBe('#E80020');
    expect(entries[0].context).toBe('1979-2000');
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
npx vitest run scripts/records/generators.test.js
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `scripts/records/generators.mjs`:

```js
// stat: 'wins' | 'titles'
export function generateTeamCareerEntries(teams, stat, era, currentYear) {
  const entries = [];
  for (const t of teams) {
    const rows = filterPerRaceByEra(t.perRace || [], era, currentYear);
    let value = 0;
    if (stat === 'wins') {
      value = rows.filter(r => r.position === 1).length;
    } else {
      // titles
      for (const yearStr of Object.keys(t.finalStandingByYear || {})) {
        const year = Number(yearStr);
        if (year === currentYear) continue;
        if (era === 'modern' && year < 1981) continue;
        if (t.finalStandingByYear[yearStr]?.position === 1) value++;
      }
    }
    if (value === 0) continue;

    const years = rows.map(r => r.year);
    const firstYear = years.length ? Math.min(...years) : null;
    const lastYear = years.length ? Math.max(...years) : null;

    entries.push({
      value,
      valueLabel: stat === 'wins' ? `${value} wins` : `${value} titles`,
      races: rows.length,
      firstYear,
      constructorRef: t.constructorRef,
      name: t.name,
      nationality: t.nationality || null,
      teamColor: t.color || null,
      context: formatYearsRange(firstYear, lastYear, currentYear),
    });
  }
  entries.sort(compareEntries);
  assignRanksWithTies(entries);
  return entries;
}
```

- [ ] **Step 4: Run — verify pass**

```bash
npx vitest run scripts/records/generators.test.js
```

Expected: PASS — 24 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/records/generators.mjs scripts/records/generators.test.js
git commit -m "feat(records): add team-career generator (titles, wins)"
```

---

## Task 10: Generator — team 1-2 finishes

**Files:**
- Modify: `scripts/records/generators.mjs`
- Modify: `scripts/records/generators.test.js`

This generator needs a different input shape: per-race result rows with `{ year, raceId|year+round, constructorRef, position }`. The orchestrator will flatten team docs into a single results array.

- [ ] **Step 1: Append failing test**

Append to `scripts/records/generators.test.js`:

```js
import { generateTeam12FinishesEntries } from './generators.mjs';

describe('generateTeam12FinishesEntries', () => {
  // Each result row: { year, round, constructorRef, position }
  const results = [
    { year: 2014, round: 1, constructorRef: 'mercedes', position: 1 },
    { year: 2014, round: 1, constructorRef: 'mercedes', position: 2 },
    { year: 2014, round: 2, constructorRef: 'mercedes', position: 1 },
    { year: 2014, round: 2, constructorRef: 'mercedes', position: 2 },
    { year: 2014, round: 3, constructorRef: 'mercedes', position: 1 },
    { year: 2014, round: 3, constructorRef: 'red_bull', position: 2 },
    { year: 1990, round: 1, constructorRef: 'mclaren', position: 1 },
    { year: 1990, round: 1, constructorRef: 'mclaren', position: 2 },
  ];
  const teamsByRef = new Map([
    ['mercedes', { constructorRef: 'mercedes', name: 'Mercedes', color: '#27F4D2' }],
    ['mclaren',  { constructorRef: 'mclaren',  name: 'McLaren',  color: '#FF8000' }],
  ]);

  it('counts races where the same team holds P1+P2', () => {
    const entries = generateTeam12FinishesEntries(results, teamsByRef, 'all-time', 2026);
    expect(entries[0].constructorRef).toBe('mercedes');
    expect(entries[0].value).toBe(2);
    expect(entries[1].constructorRef).toBe('mclaren');
    expect(entries[1].value).toBe(1);
  });

  it('era filter excludes pre-1981', () => {
    const entries = generateTeam12FinishesEntries(results, teamsByRef, 'modern', 2026);
    expect(entries.find(e => e.constructorRef === 'mclaren')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
npx vitest run scripts/records/generators.test.js
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `scripts/records/generators.mjs`:

```js
// results: array of all per-race result rows { year, round, constructorRef, position }
export function generateTeam12FinishesEntries(results, teamsByRef, era, currentYear) {
  // Group rows by (year-round)
  const byRace = new Map();
  for (const r of results) {
    if (r.year == null || r.year === currentYear) continue;
    if (era === 'modern' && r.year < 1981) continue;
    if (r.position !== 1 && r.position !== 2) continue;
    const key = `${r.year}-${r.round}`;
    if (!byRace.has(key)) byRace.set(key, { p1: null, p2: null, year: r.year });
    if (r.position === 1) byRace.get(key).p1 = r.constructorRef;
    if (r.position === 2) byRace.get(key).p2 = r.constructorRef;
  }

  // Count 1-2s per team
  const countByTeam = new Map();
  const firstYearByTeam = new Map();
  for (const { p1, p2, year } of byRace.values()) {
    if (p1 && p1 === p2) {
      countByTeam.set(p1, (countByTeam.get(p1) || 0) + 1);
      const fy = firstYearByTeam.get(p1);
      if (fy == null || year < fy) firstYearByTeam.set(p1, year);
    }
  }

  const entries = [];
  for (const [ref, value] of countByTeam) {
    const t = teamsByRef.get(ref);
    if (!t) continue;
    entries.push({
      value,
      valueLabel: `${value} 1-2 finishes`,
      races: 0,
      firstYear: firstYearByTeam.get(ref) || null,
      constructorRef: ref,
      name: t.name,
      nationality: t.nationality || null,
      teamColor: t.color || null,
      context: `from ${firstYearByTeam.get(ref) || '?'}`,
    });
  }
  entries.sort(compareEntries);
  assignRanksWithTies(entries);
  return entries;
}
```

- [ ] **Step 4: Run — verify pass**

```bash
npx vitest run scripts/records/generators.test.js
```

Expected: PASS — 26 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/records/generators.mjs scripts/records/generators.test.js
git commit -m "feat(records): add team 1-2 finishes generator"
```

---

## Task 11: Generator — driver-at-circuit (wins, poles)

**Files:**
- Modify: `scripts/records/generators.mjs`
- Modify: `scripts/records/generators.test.js`

- [ ] **Step 1: Append failing test**

Append to `scripts/records/generators.test.js`:

```js
import { generateDriverAtCircuitEntries } from './generators.mjs';

describe('generateDriverAtCircuitEntries', () => {
  const drivers = [{
    driverRef: 'hamilton', forename: 'Lewis', surname: 'Hamilton', code: 'HAM',
    natInfo: { country: 'GB', flag: 'X' },
    perRace: [
      { year: 2007, round: 1, circuitRef: 'hungaroring', circuitName: 'Hungaroring', position: 1, grid: 1, constructorRef: 'mclaren', constructorName: 'McLaren' },
      { year: 2009, round: 2, circuitRef: 'hungaroring', circuitName: 'Hungaroring', position: 1, grid: 4, constructorRef: 'mclaren', constructorName: 'McLaren' },
      { year: 2012, round: 3, circuitRef: 'hungaroring', circuitName: 'Hungaroring', position: 1, grid: 1, constructorRef: 'mclaren', constructorName: 'McLaren' },
      { year: 2007, round: 4, circuitRef: 'silverstone', circuitName: 'Silverstone', position: 2, grid: 1, constructorRef: 'mclaren', constructorName: 'McLaren' },
    ],
  }];

  it('wins-at-circuit groups by driver+circuit', () => {
    const entries = generateDriverAtCircuitEntries(drivers, 'wins', 'all-time', 2026);
    expect(entries[0].driverRef).toBe('hamilton');
    expect(entries[0].circuitRef).toBe('hungaroring');
    expect(entries[0].value).toBe(3);
  });

  it('poles-at-circuit groups by grid === 1', () => {
    const entries = generateDriverAtCircuitEntries(drivers, 'poles', 'all-time', 2026);
    expect(entries[0].value).toBe(2);   // hungaroring 2007 + 2012 (both grid 1)
  });

  it('a driver can appear multiple times (different circuits)', () => {
    const withSilverstoneWin = [{
      ...drivers[0],
      perRace: [
        ...drivers[0].perRace,
        { year: 2008, round: 5, circuitRef: 'silverstone', circuitName: 'Silverstone', position: 1, grid: 4, constructorRef: 'mclaren', constructorName: 'McLaren' },
      ],
    }];
    const entries = generateDriverAtCircuitEntries(withSilverstoneWin, 'wins', 'all-time', 2026);
    const silv = entries.find(e => e.circuitRef === 'silverstone');
    expect(silv).toBeDefined();
    expect(silv.value).toBe(1);
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
npx vitest run scripts/records/generators.test.js
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `scripts/records/generators.mjs`:

```js
// kind: 'wins' (position === 1) | 'poles' (grid === 1)
export function generateDriverAtCircuitEntries(drivers, kind, era, currentYear) {
  const predicate = kind === 'wins' ? (r) => r.position === 1 : (r) => r.grid === 1;
  const stat = kind === 'wins' ? 'wins' : 'poles';

  const entries = [];
  for (const d of drivers) {
    const rows = filterPerRaceByEra(d.perRace || [], era, currentYear).filter(predicate);
    if (!rows.length) continue;

    // Group by circuitRef
    const byCircuit = new Map();
    for (const r of rows) {
      const cr = r.circuitRef || r.circuitId;
      if (!cr) continue;
      if (!byCircuit.has(cr)) byCircuit.set(cr, []);
      byCircuit.get(cr).push(r);
    }
    for (const [circuitRef, list] of byCircuit) {
      const years = list.map(r => r.year);
      const firstYear = Math.min(...years);
      const lastYear = Math.max(...years);
      const circuitName = list[0].circuitName || circuitRef;
      const team = primaryTeamFromRows(list);

      entries.push({
        value: list.length,
        valueLabel: `${list.length} ${stat}`,
        races: list.length,
        firstYear,
        driverRef: d.driverRef,
        name: `${d.forename || ''} ${d.surname || ''}`.trim(),
        shortName: shortName(d),
        code: d.code || null,
        flag: d.natInfo?.flag || null,
        country: d.natInfo?.country || null,
        teamRef: team.ref,
        teamName: team.name,
        teamColor: null,
        circuitRef,
        circuitName,
        context: `${circuitName} - ${formatYearsRange(firstYear, lastYear, currentYear)}`,
      });
    }
  }
  entries.sort(compareEntries);
  assignRanksWithTies(entries);
  return entries;
}
```

- [ ] **Step 4: Run — verify pass**

```bash
npx vitest run scripts/records/generators.test.js
```

Expected: PASS — 29 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/records/generators.mjs scripts/records/generators.test.js
git commit -m "feat(records): add driver-at-circuit generator (wins, poles)"
```

---

## Task 12: Records orchestrator

**Files:**
- Create: `scripts/records/index.mjs`

The orchestrator pulls everything together: takes raw input from build-archive.mjs, dispatches per-record generators, attaches team colours, slices top-5 / top-50, and returns `{ index, byTopic }`.

- [ ] **Step 1: Create the orchestrator**

```js
// scripts/records/index.mjs
//
// Top-level entry point. Called once from build-archive.mjs after all driver/
// team archive docs are written.
//
// buildRecords({ driverDocs, teamDocs, yearStandings, finalRoundDateByYear,
//                allResults, teamColorByRef, currentYear })
//   returns { index, byTopic } — JSON-serialisable shapes per the spec.

import { RECORD_CONFIGS, GROUPS, TOP5, TOP50 } from './configs.mjs';
import {
  generateDriverCareerEntries,
  generateWinsInSeasonEntries,
  generateStreakEntries,
  generateTitleMarginEntries,
  generateYoungestChampionEntries,
  generateOldestWinnerEntries,
  generateTeamCareerEntries,
  generateTeam12FinishesEntries,
  generateDriverAtCircuitEntries,
} from './generators.mjs';

function dispatch(configId, driverDocs, teamDocs, yearStandings, finalRoundDateByYear, allResults, era, currentYear) {
  const driversByRef = new Map(driverDocs.map(d => [d.driverRef, d]));
  const teamsByRef = new Map(teamDocs.map(t => [t.constructorRef, t]));

  switch (configId) {
    case 'wins':
    case 'podiums':
    case 'poles':
    case 'championships':
    case 'starts':
    case 'fastest-laps':
      return generateDriverCareerEntries(driverDocs, configId, era, currentYear);
    case 'wins-in-season':
      return generateWinsInSeasonEntries(driverDocs, era, currentYear);
    case 'podium-streak':
      return generateStreakEntries(driverDocs, 'podium', era, currentYear);
    case 'win-streak':
      return generateStreakEntries(driverDocs, 'win', era, currentYear);
    case 'title-margin':
      return generateTitleMarginEntries(yearStandings, driversByRef, era, currentYear);
    case 'youngest-champion':
      return generateYoungestChampionEntries(driverDocs, finalRoundDateByYear, era, currentYear);
    case 'oldest-winner':
      return generateOldestWinnerEntries(driverDocs, era, currentYear);
    case 'team-titles':
      return generateTeamCareerEntries(teamDocs, 'titles', era, currentYear);
    case 'team-wins':
      return generateTeamCareerEntries(teamDocs, 'wins', era, currentYear);
    case 'team-1-2-finishes':
      return generateTeam12FinishesEntries(allResults, teamsByRef, era, currentYear);
    case 'wins-at-circuit':
      return generateDriverAtCircuitEntries(driverDocs, 'wins', era, currentYear);
    case 'poles-at-circuit':
      return generateDriverAtCircuitEntries(driverDocs, 'poles', era, currentYear);
    default:
      throw new Error(`Unknown record id: ${configId}`);
  }
}

function attachTeamColor(entries, teamColorByRef) {
  for (const e of entries) {
    if (e.teamColor) continue;
    if (e.teamRef && teamColorByRef.has(e.teamRef)) e.teamColor = teamColorByRef.get(e.teamRef);
  }
}

function strip(entry) {
  // Drop internal fields not needed in JSON output
  const { ...rest } = entry;
  delete rest.firstYear;
  delete rest.races;
  return rest;
}

export function buildRecords({
  driverDocs,
  teamDocs,
  yearStandings,
  finalRoundDateByYear,
  allResults,
  teamColorByRef,
  currentYear,
}) {
  const byTopic = {};
  const indexRecordsByGroup = new Map(GROUPS.map(g => [g.id, []]));

  for (const cfg of RECORD_CONFIGS) {
    const allTime = dispatch(cfg.id, driverDocs, teamDocs, yearStandings, finalRoundDateByYear, allResults, 'all-time', currentYear);
    const modern  = dispatch(cfg.id, driverDocs, teamDocs, yearStandings, finalRoundDateByYear, allResults, 'modern',   currentYear);

    attachTeamColor(allTime, teamColorByRef);
    attachTeamColor(modern,  teamColorByRef);

    const top5 = allTime.slice(0, TOP5).map(strip);
    const modernTop5 = modern.slice(0, TOP5).map(strip);

    byTopic[cfg.id] = {
      id: cfg.id,
      title: cfg.title,
      blurb: cfg.blurb,
      subjectType: cfg.subjectType,
      valueFormat: cfg.valueFormat,
      note: cfg.note || null,
      allTime: { top50: allTime.slice(0, TOP50).map(strip) },
      modern:  { top50: modern.slice(0, TOP50).map(strip) },
    };

    indexRecordsByGroup.get(cfg.group).push({
      id: cfg.id,
      title: cfg.title,
      blurb: cfg.blurb,
      stat: cfg.id,
      valueFormat: cfg.valueFormat,
      subjectType: cfg.subjectType,
      allTime: { top5 },
      modern:  { top5: modernTop5 },
    });
  }

  const index = {
    generatedAt: new Date().toISOString(),
    groups: GROUPS.map(g => ({
      id: g.id,
      label: g.label,
      records: indexRecordsByGroup.get(g.id),
    })),
  };

  return { index, byTopic };
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/records/index.mjs
git commit -m "feat(records): add orchestrator that assembles index + per-topic JSONs"
```

---

## Task 13: Wire orchestrator into build-archive.mjs

**Files:**
- Modify: `scripts/build-archive.mjs:2043` (end of file)

The build-archive pass needs to:
1. Re-load every per-driver and per-team JSON it just wrote (those have post-Ergast merges already applied).
2. Build `yearStandings` for title-margin from `driver_standings.csv` rows for each final-round raceId. Augment with bundle data for post-Ergast years.
3. Build `finalRoundDateByYear` from `races` (final round per year, take its `date`).
4. Build `allResults` for the team-1-2 generator by flattening every driver's `perRace`.
5. Call `buildRecords` and write outputs.

- [ ] **Step 1: Append the records pass to build-archive.mjs**

At the very bottom of [scripts/build-archive.mjs](scripts/build-archive.mjs), append:

```js
// ─── Records & milestones pass ────────────────────────────────────
// Computes 17 curated leaderboards (top-5 for the hub, top-50 for sub-pages)
// across all-time and modern (>= 1981) eras. Reads per-driver / per-team docs
// written above (which already include hand-curated bundle years).

{
  const { buildRecords } = await import('./records/index.mjs');

  console.log('[archive] building records...');

  // For per-race circuit-name lookup: bundle rows store circuitRef (string),
  // Ergast rows store numeric circuitId (string). We need both maps.
  const circuitsByRef = new Map(circuits.map(c => [c.circuitRef, c]));

  // Load all driver docs we just wrote, attach derived fields the records
  // library expects (natInfo, finalStandingByYear).
  const driverFiles = readdirSync(join(OUT, 'drivers'));
  const driverDocs = [];
  for (const f of driverFiles) {
    if (!f.endsWith('.json')) continue;
    const doc = JSON.parse(readFileSync(join(OUT, 'drivers', f), 'utf8'));
    doc.natInfo = natInfo(doc.nationality);
    // finalStandingByYear: { year: {position} } - rebuilt from doc.perSeason.
    doc.finalStandingByYear = {};
    for (const s of doc.perSeason || []) {
      if (s.position != null) doc.finalStandingByYear[s.year] = { position: s.position };
    }
    // Normalise circuitRef + circuitName on perRace. Ergast rows store numeric
    // circuitId in the CSV-keyed map; bundle rows store the circuitRef directly.
    for (const r of doc.perRace || []) {
      if (r.circuitId && circuitsById.has(r.circuitId)) {
        const c = circuitsById.get(r.circuitId);
        r.circuitRef = c.circuitRef;
        r.circuitName = c.name;
      } else if (typeof r.circuitId === 'string') {
        r.circuitRef = r.circuitId;
        const c = circuitsByRef.get(r.circuitRef);
        if (c) r.circuitName = c.name;
      }
    }
    driverDocs.push(doc);
  }

  // Load all team docs
  const teamFiles = readdirSync(join(OUT, 'teams'));
  const teamDocs = [];
  for (const f of teamFiles) {
    if (!f.endsWith('.json')) continue;
    const doc = JSON.parse(readFileSync(join(OUT, 'teams', f), 'utf8'));
    // Synthesise perRace / finalStandingByYear from perSeason for the team generator.
    doc.perRace = [];
    doc.finalStandingByYear = {};
    for (const s of doc.perSeason || []) {
      if (s.position != null) doc.finalStandingByYear[s.year] = { position: s.position };
      for (let i = 0; i < (s.wins || 0); i++) {
        doc.perRace.push({ year: s.year, round: null, position: 1 });
      }
      // Tail of races as non-wins so era filter still treats the year as active
      const nonWins = Math.max(0, (s.races || 0) - (s.wins || 0));
      for (let i = 0; i < nonWins; i++) {
        doc.perRace.push({ year: s.year, round: null, position: null });
      }
    }
    teamDocs.push(doc);
  }

  // yearStandings: per year, the P1 and P2 final standing (driverRef, name, surname, points)
  const yearStandings = {};
  for (const [year, final] of finalRaceIdByYear) {
    const top2 = [];
    for (const s of driverStandings) {
      if (s.raceId !== final.raceId) continue;
      const pos = toInt(s.position);
      if (pos === 1 || pos === 2) {
        const d = driversById.get(s.driverId);
        if (!d) continue;
        top2.push({ pos, driverRef: d.driverRef, name: `${d.forename} ${d.surname}`.trim(), surname: d.surname, points: toFloat(s.points) || 0 });
      }
    }
    const p1 = top2.find(x => x.pos === 1);
    const p2 = top2.find(x => x.pos === 2);
    if (p1 && p2) yearStandings[year] = { p1, p2 };
  }

  // finalRoundDateByYear from races.csv
  const finalRoundDateByYear = {};
  for (const [year, final] of finalRaceIdByYear) {
    const race = racesById.get(final.raceId);
    if (race?.date) finalRoundDateByYear[year] = race.date;
  }

  // allResults for team-1-2: flatten team docs' perRace into rows with constructorRef
  const allResults = [];
  for (const t of teamDocs) {
    for (const r of t.perRace) {
      allResults.push({ year: r.year, round: r.round, constructorRef: t.constructorRef, position: r.position });
    }
  }

  // teamColorByRef
  const teamColorByRef = new Map(teamDocs.map(t => [t.constructorRef, t.color || null]));

  const currentYear = new Date().getFullYear();

  const { index, byTopic } = buildRecords({
    driverDocs,
    teamDocs,
    yearStandings,
    finalRoundDateByYear,
    allResults,
    teamColorByRef,
    currentYear,
  });

  mkdirSync(join(OUT, 'records'), { recursive: true });
  writeFileSync(join(OUT, '_records-index.json'), JSON.stringify(index));
  for (const [id, payload] of Object.entries(byTopic)) {
    writeFileSync(join(OUT, 'records', `${id}.json`), JSON.stringify(payload));
  }
  console.log(`[archive] wrote records index + ${Object.keys(byTopic).length} topic files`);
}
```

- [ ] **Step 2: Run the prebuild and verify outputs**

```bash
node scripts/build-archive.mjs
ls public/data/archive/_records-index.json public/data/archive/records/ 2>/dev/null
```

Expected: 17 files in `records/`, plus `_records-index.json`. Console output should end with `[archive] wrote records index + 17 topic files`.

- [ ] **Step 3: Spot-check the index**

```bash
node -e "const x = require('./public/data/archive/_records-index.json'); console.log(JSON.stringify(x.groups[0].records[0].allTime.top5[0], null, 2))"
```

Expected: a hero entry for the all-time wins leader (Hamilton at the time of writing). Verify `driverRef`, `value`, `teamColor`, `flag`, `context` are present.

- [ ] **Step 4: Run the helper tests once more to confirm nothing regressed**

```bash
npx vitest run scripts/records/
```

Expected: PASS — all 29 tests still pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-archive.mjs
git commit -m "feat(records): wire records pass into build-archive prebuild"
```

---

## Task 14: RecordHeroCard.astro component

**Files:**
- Create: `src/components/RecordHeroCard.astro`

- [ ] **Step 1: Create the component**

```astro
---
// src/components/RecordHeroCard.astro
//
// Hero card for the records hub. Renders one record's all-time top-5:
//   - eyebrow with record title
//   - giant value + holder name + context
//   - rows 2-5 compact list
//   - footer link to /records/<id>/
// Whole card is one <a>.

interface Entry {
  rank: number;
  value: number;
  valueLabel: string;
  driverRef?: string;
  constructorRef?: string;
  name: string;
  shortName?: string;
  code?: string | null;
  flag?: string | null;
  country?: string | null;
  teamRef?: string | null;
  teamName?: string | null;
  teamColor?: string | null;
  circuitRef?: string | null;
  circuitName?: string | null;
  context?: string;
}

interface RecordIndex {
  id: string;
  title: string;
  blurb: string;
  subjectType: 'driver' | 'team' | 'driver-at-circuit';
  allTime: { top5: Entry[] };
}

const { record } = Astro.props as { record: RecordIndex };
const entries = record.allTime.top5 || [];
const holder = entries[0];
const rest = entries.slice(1);
const accent = holder?.teamColor || 'var(--accent)';
---
{holder && (
  <a class="records-hero-card" href={`/records/${record.id}/`} style={`--card-accent: ${accent}`}>
    <div class="records-hero-eyebrow">{record.title}</div>

    <div class="records-hero-value">{holder.value}</div>

    <div class="records-hero-holder">
      {record.subjectType === 'team' ? (
        <>
          <span class="records-team-chip" style={`background: ${accent}`}></span>
          <span class="records-hero-name">{holder.name}</span>
        </>
      ) : (
        <>
          {holder.flag && <span class="records-flag">{holder.flag}</span>}
          <span class="records-hero-name">{holder.name}</span>
        </>
      )}
    </div>

    {holder.context && <div class="records-hero-context">{holder.context}</div>}

    {rest.length > 0 && (
      <ul class="records-hero-rows">
        {rest.map(e => (
          <li class="records-hero-row">
            <span class="records-rank">{e.rank}</span>
            <span class="records-row-name">
              {record.subjectType === 'team' && e.teamColor && (
                <span class="records-team-chip records-team-chip-sm" style={`background: ${e.teamColor}`}></span>
              )}
              {e.flag && record.subjectType !== 'team' && <span class="records-flag-sm">{e.flag}</span>}
              {record.subjectType === 'driver-at-circuit' ? (
                <>
                  {e.shortName || e.name}
                  <span class="records-row-sub">{e.circuitName}</span>
                </>
              ) : (
                <>{e.shortName || e.name}</>
              )}
            </span>
            <span class="records-row-value">{e.value}</span>
          </li>
        ))}
      </ul>
    )}

    <div class="records-hero-footer">See full ranking →</div>
  </a>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/RecordHeroCard.astro
git commit -m "feat(records): add RecordHeroCard component for hub"
```

---

## Task 15: Hub page `src/pages/records/index.astro`

**Files:**
- Create: `src/pages/records/index.astro`

- [ ] **Step 1: Create the hub page**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import RecordHeroCard from '../../components/RecordHeroCard.astro';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexPath = resolve(__dirname, '../../../public/data/archive/_records-index.json');
const data = JSON.parse(readFileSync(indexPath, 'utf8'));

const title = 'F1 Records & Milestones - All-Time Leaderboards | f1gures';
const description = 'Every F1 leaderboard, from most race wins to longest podium streaks. All-time and modern-era rankings since 1950.';
const canonicalPath = '/records/';

const breadcrumb = [
  { name: 'Home', path: '/' },
  { name: 'Records', path: '/records/' },
];

const ORIGIN = 'https://f1gures.app';
const allRecords = data.groups.flatMap((g: any) => g.records);
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'F1 Records & Milestones',
  url: ORIGIN + canonicalPath,
  mainEntity: {
    '@type': 'ItemList',
    numberOfItems: allRecords.length,
    itemListElement: allRecords.map((r: any, i: number) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${ORIGIN}/records/${r.id}/`,
      name: r.title,
    })),
  },
};
---
<BaseLayout
  title={title}
  description={description}
  canonicalPath={canonicalPath}
  ogType="website"
  jsonLd={jsonLd}
  breadcrumb={breadcrumb}
>
  <main class="records-page records-hub">
    <header class="records-page-head">
      <h1>F1 Records & Milestones</h1>
      <p class="page-sub">Every Formula 1 leaderboard worth knowing — career, single-season, streaks, milestones, teams and tracks. All-time and modern-era (1981+) rankings, computed from 1950 through the last completed season.</p>
    </header>

    {data.groups.map((group: any) => (
      <section class="records-section">
        <div class="section-head">
          <h2>{group.label}</h2>
          <div class="section-rule"></div>
        </div>
        <div class="records-grid">
          {group.records.map((r: any) => <RecordHeroCard record={r} />)}
        </div>
      </section>
    ))}
  </main>
</BaseLayout>
```

- [ ] **Step 2: Build the site and verify the page renders**

```bash
npm run build
```

Expected: build succeeds; output includes `Building astro src/pages/records/index.astro`. No errors.

- [ ] **Step 3: Check the HTML output**

```bash
ls dist/records/index.html
head -c 600 dist/records/index.html
```

Expected: file exists, head contains `<title>F1 Records & Milestones...`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/records/index.astro
git commit -m "feat(records): add hub page rendering 17 records across 5 sections"
```

---

## Task 16: RecordsTable.astro component

**Files:**
- Create: `src/components/RecordsTable.astro`

- [ ] **Step 1: Create the component**

```astro
---
// src/components/RecordsTable.astro
//
// Renders the top-50 table for one era of a record sub-page. The sub-page
// includes two copies of this component (one per era); the era toggle script
// flips `hidden` between them.

interface Entry {
  rank: number;
  value: number;
  valueLabel: string;
  driverRef?: string;
  constructorRef?: string;
  name: string;
  shortName?: string;
  code?: string | null;
  flag?: string | null;
  country?: string | null;
  teamRef?: string | null;
  teamName?: string | null;
  teamColor?: string | null;
  circuitRef?: string | null;
  circuitName?: string | null;
  context?: string;
}

const { entries, subjectType, era } = Astro.props as {
  entries: Entry[];
  subjectType: 'driver' | 'team' | 'driver-at-circuit';
  era: 'all-time' | 'modern';
};

const isDefault = era === 'all-time';
---
<table class="records-table" data-era-table={era} hidden={!isDefault}>
  <thead>
    <tr>
      <th class="col-rank">#</th>
      <th class="col-name">{subjectType === 'team' ? 'Team' : 'Driver'}</th>
      {subjectType === 'driver-at-circuit' && <th class="col-circuit">Circuit</th>}
      {subjectType === 'driver' && <th class="col-team">Team</th>}
      <th class="col-value">Stat</th>
      <th class="col-context">Detail</th>
    </tr>
  </thead>
  <tbody>
    {entries.map(e => (
      <tr>
        <td class="col-rank">{e.rank}</td>
        <td class="col-name">
          {subjectType === 'team' ? (
            <>
              {e.teamColor && <span class="records-team-chip" style={`background: ${e.teamColor}`}></span>}
              <a href={`/teams/${e.constructorRef}/`}>{e.name}</a>
            </>
          ) : (
            <>
              {e.flag && <span class="records-flag">{e.flag}</span>}
              <a href={`/drivers/${e.driverRef}/`}>{e.name}</a>
            </>
          )}
        </td>
        {subjectType === 'driver-at-circuit' && (
          <td class="col-circuit">
            <a href={`/circuits/${e.circuitRef}/`}>{e.circuitName}</a>
          </td>
        )}
        {subjectType === 'driver' && (
          <td class="col-team">
            {e.teamRef ? (
              <a href={`/teams/${e.teamRef}/`} style={e.teamColor ? `border-left: 3px solid ${e.teamColor}; padding-left: 6px;` : ''}>{e.teamName}</a>
            ) : <span class="text-muted">—</span>}
          </td>
        )}
        <td class="col-value">{e.valueLabel}</td>
        <td class="col-context text-muted">{e.context || ''}</td>
      </tr>
    ))}
  </tbody>
</table>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/RecordsTable.astro
git commit -m "feat(records): add RecordsTable component for sub-pages"
```

---

## Task 17: Sub-page `src/pages/records/[topic].astro`

**Files:**
- Create: `src/pages/records/[topic].astro`

- [ ] **Step 1: Create the dynamic sub-page route**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import RecordsTable from '../../components/RecordsTable.astro';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

export async function getStaticPaths() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const recordsDir = resolve(__dirname, '../../../public/data/archive/records');
  const files = readdirSync(recordsDir);
  return files
    .filter((f: string) => f.endsWith('.json'))
    .map((f: string) => {
      const data = JSON.parse(readFileSync(join(recordsDir, f), 'utf8'));
      return { params: { topic: data.id }, props: { data } };
    });
}

const { data } = Astro.props as { data: any };

const title = `${data.title} - All-Time F1 Leaderboard | f1gures`;
const description = `${data.blurb} Top 50 all-time and from 1981 onwards.`;
const canonicalPath = `/records/${data.id}/`;

const breadcrumb = [
  { name: 'Home', path: '/' },
  { name: 'Records', path: '/records/' },
  { name: data.title, path: canonicalPath },
];

const ORIGIN = 'https://f1gures.app';
const top = data.allTime.top50 || [];
const jsonLd = top.length > 0 ? {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: `${data.title} (All-time top ${top.length})`,
  numberOfItems: top.length,
  itemListElement: top.map((e: any, i: number) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: e.name,
    url: data.subjectType === 'team'
      ? `${ORIGIN}/teams/${e.constructorRef}/`
      : `${ORIGIN}/drivers/${e.driverRef}/`,
  })),
} : undefined;
---
<BaseLayout
  title={title}
  description={description}
  canonicalPath={canonicalPath}
  ogType="website"
  jsonLd={jsonLd}
  breadcrumb={breadcrumb}
>
  <main class="records-page records-sub">
    <header class="records-page-head">
      <h1>{data.title}</h1>
      <p class="page-sub">{data.blurb}</p>
    </header>

    <div class="records-era-toggle">
      <button class="active" data-era-toggle="all-time">All-time (1950-present)</button>
      <button data-era-toggle="modern">Modern era (1981-present)</button>
    </div>

    {data.note && <p class="records-note">{data.note}</p>}

    <div class="records-table-wrap" data-era="all-time">
      <RecordsTable entries={data.allTime.top50 || []} subjectType={data.subjectType} era="all-time" />
      <RecordsTable entries={data.modern.top50  || []} subjectType={data.subjectType} era="modern" />
    </div>
  </main>

  <script is:inline>
    (function () {
      const root = document.querySelector('.records-page');
      if (!root) return;
      const wrap = root.querySelector('.records-table-wrap');
      if (!wrap) return;
      root.querySelectorAll('[data-era-toggle]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const era = btn.getAttribute('data-era-toggle');
          wrap.setAttribute('data-era', era);
          wrap.querySelectorAll('[data-era-table]').forEach(function (t) {
            t.hidden = t.getAttribute('data-era-table') !== era;
          });
          root.querySelectorAll('[data-era-toggle]').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-era-toggle') === era);
          });
        });
      });
    })();
  </script>
</BaseLayout>
```

- [ ] **Step 2: Rebuild and check 17 sub-pages prerender**

```bash
npm run build
ls dist/records/ | wc -l
```

Expected: 18 entries (`index.html` + 17 topic dirs). Each topic dir has `index.html`.

- [ ] **Step 3: Inspect one sub-page**

```bash
head -c 800 dist/records/wins/index.html
```

Expected: HTML contains `<h1>Most race wins</h1>`, the era toggle buttons, both `<table data-era-table=...>` elements with one initially `hidden`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/records/\[topic\].astro
git commit -m "feat(records): add per-topic sub-page route with era toggle"
```

---

## Task 18: CSS for records pages

**Files:**
- Modify: `public/css/app.css` (append at end)

- [ ] **Step 1: Append the styles**

Append at the end of [public/css/app.css](public/css/app.css):

```css
/* ============================================================
   RECORDS HUB + SUB-PAGES
   ============================================================ */

.records-page { max-width: 1200px; margin: 0 auto; padding: 28px 20px 80px; }
.records-page-head { margin-bottom: 12px; }
.records-page h1 { font-family: var(--f-display); font-weight: 800; font-size: 36px; letter-spacing: 0; text-transform: uppercase; line-height: 1.02; }
@media (max-width: 720px) { .records-page h1 { font-size: 26px; } }

.records-section { margin-top: 28px; }

.records-grid {
  display: grid; gap: 14px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
@media (max-width: 1024px) { .records-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 720px)  { .records-grid { grid-template-columns: 1fr; } }

/* Hero card */
.records-hero-card {
  --card-accent: var(--accent);
  position: relative;
  display: flex; flex-direction: column;
  padding: 18px 18px 14px;
  background: var(--bg-2);
  border: 1px solid var(--line-1);
  border-left: 4px solid var(--card-accent);
  color: inherit; text-decoration: none;
  gap: 8px;
  transition: transform 0.12s ease, border-color 0.12s ease;
}
.records-hero-card:hover { border-color: var(--card-accent); transform: translateY(-1px); }

.records-hero-eyebrow {
  font-family: var(--f-mono); font-size: 11px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--fg-3);
}

.records-hero-value {
  font-family: var(--f-display); font-weight: 800;
  font-size: 52px; line-height: 1; letter-spacing: -0.02em;
  color: var(--card-accent);
}
@media (max-width: 720px) { .records-hero-value { font-size: 40px; } }

.records-hero-holder { display: flex; align-items: center; gap: 8px; }
.records-hero-name { font-family: var(--f-display); font-weight: 700; font-size: 18px; text-transform: uppercase; letter-spacing: 0.01em; }
.records-flag { font-size: 18px; }
.records-flag-sm { font-size: 13px; margin-right: 4px; }
.records-team-chip { display: inline-block; width: 14px; height: 14px; border-radius: 2px; }
.records-team-chip-sm { width: 8px; height: 8px; margin-right: 4px; }

.records-hero-context {
  font-size: 12px; color: var(--fg-3);
}

.records-hero-rows {
  list-style: none; margin: 8px 0 0; padding: 8px 0 0;
  border-top: 1px solid var(--line-1);
  display: flex; flex-direction: column; gap: 4px;
}
.records-hero-row {
  display: grid; grid-template-columns: 18px 1fr auto; gap: 10px;
  align-items: center;
  font-size: 13px;
}
.records-rank { color: var(--fg-3); font-variant-numeric: tabular-nums; font-weight: 600; }
.records-row-name { display: inline-flex; align-items: center; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-direction: column; align-items: flex-start; }
.records-row-sub { font-size: 11px; color: var(--fg-3); }
.records-row-value { font-variant-numeric: tabular-nums; font-weight: 600; }

.records-hero-footer {
  margin-top: 8px; padding-top: 8px;
  border-top: 1px dashed var(--line-1);
  font-family: var(--f-mono); font-size: 11px; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--card-accent);
}

/* Sub-page era toggle */
.records-era-toggle {
  display: inline-flex; gap: 0;
  border: 1px solid var(--line-1);
  margin: 16px 0 12px;
}
.records-era-toggle button {
  background: transparent;
  border: 0;
  padding: 8px 14px;
  font-family: var(--f-mono); font-size: 12px; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--fg-3); cursor: pointer;
}
.records-era-toggle button + button { border-left: 1px solid var(--line-1); }
.records-era-toggle button.active { background: var(--bg-2); color: var(--fg-1); }

.records-note {
  font-size: 13px; color: var(--fg-3); margin: 0 0 12px;
  padding: 8px 12px; background: var(--bg-2); border-left: 3px solid var(--card-accent, var(--accent));
}

/* Top-50 table */
.records-table { width: 100%; border-collapse: collapse; }
.records-table th, .records-table td { padding: 8px 10px; border-bottom: 1px solid var(--line-1); text-align: left; vertical-align: middle; font-size: 14px; }
.records-table th { font-family: var(--f-mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--fg-3); }
.records-table .col-rank { width: 44px; font-variant-numeric: tabular-nums; color: var(--fg-3); }
.records-table .col-value { font-variant-numeric: tabular-nums; font-weight: 700; }
.records-table a { color: inherit; text-decoration: none; border-bottom: 1px dashed transparent; }
.records-table a:hover { border-bottom-color: var(--fg-3); }
.records-table .text-muted { color: var(--fg-3); }

@media (max-width: 720px) {
  .records-table .col-context { display: none; }
  .records-table th, .records-table td { padding: 6px 8px; font-size: 13px; }
}
```

- [ ] **Step 2: Rebuild to refresh the CSS content hash**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add public/css/app.css
git commit -m "feat(records): add CSS for hub cards and sub-page tables"
```

---

## Task 19: Nav integration

**Files:**
- Modify: `src/components/islands/StandingsDropdown.jsx`
- Modify: `src/components/Chrome.astro`

- [ ] **Step 1: Update the dropdown to include Records**

Replace lines 25-30 of [src/components/islands/StandingsDropdown.jsx](src/components/islands/StandingsDropdown.jsx):

```jsx
      {open && (
        <div className="nav-dropdown" style={{ top: 'calc(100% - 1px)' }}>
          <a href="/standings-drivers/">Drivers</a>
          <a href="/standings-constructors/">Constructors</a>
          <a href="/records/">Records & milestones</a>
        </div>
      )}
```

- [ ] **Step 2: Update Chrome.astro standings predicate**

In [src/components/Chrome.astro:22](src/components/Chrome.astro), change:

```ts
  standings:   isRoute('/standings-drivers') || isRoute('/standings-constructors'),
```

to:

```ts
  standings:   isRoute('/standings-drivers') || isRoute('/standings-constructors') || isRoute('/records'),
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

Expected: build succeeds. Open `dist/records/index.html` and confirm the "Standings" nav item has `active` class on it (look for `nav-item active` near `Standings`).

- [ ] **Step 4: Commit**

```bash
git add src/components/islands/StandingsDropdown.jsx src/components/Chrome.astro
git commit -m "feat(records): add Records & milestones link to Standings dropdown"
```

---

## Task 20: End-to-end smoke verification

**Files:** (no edits)

- [ ] **Step 1: Full prebuild + build from a clean state**

```bash
rm -rf dist public/data/archive
npm run build
```

Expected: completes without errors. `[archive] wrote records index + 17 topic files` appears in the output.

- [ ] **Step 2: Verify route count**

```bash
ls dist/records/ | grep -c '^'
```

Expected: 18 (1 hub `index.html` + 17 topic directories).

- [ ] **Step 3: Verify sitemap picked up the new routes**

```bash
grep -c '/records/' dist/sitemap-*.xml
```

Expected: 18 (1 hub + 17 sub-pages).

- [ ] **Step 4: Spot-check a sub-page in the preview server**

```bash
npm run preview
```

In a browser, open:
- `http://localhost:4321/records/` — hub renders with 5 sections, 17 cards, every card has a non-zero giant value.
- `http://localhost:4321/records/wins/` — top-50 table renders; clicking "Modern era" swaps the visible table.
- `http://localhost:4321/records/title-margin/` — note line visible above the table.
- `http://localhost:4321/records/wins-at-circuit/` — circuit column renders.

Stop the server with Ctrl-C.

- [ ] **Step 5: Run the records test suite once more**

```bash
npx vitest run scripts/records/
```

Expected: PASS — 29 tests.

- [ ] **Step 6: Final commit (if any incidental drift)**

```bash
git status
```

If clean, no commit. If there's drift, investigate and commit fixes.

---

## Self-review

**1. Spec coverage:**
- Inventory of 17 records — Task 1 (configs) + Tasks 4-11 (one generator per type).
- Data pipeline output shape (`_records-index.json`, `records/<topic>.json`) — Task 12 (orchestrator) + Task 13 (wire-in).
- Era logic (all-time, modern ≥ 1981, exclude in-progress year) — Task 2 (`filterPerRaceByEra`).
- Tie-breaking + rank-with-ties — Tasks 2 + 3.
- Streak edge cases (DNS/DNQ breaks, era-boundary breaks) — Task 6.
- Title-margin computation — Task 7.
- Youngest-champion uses final-round date — Task 8.
- Post-Ergast coverage — handled because Task 13 reads merged driver/team docs (which already include bundle years).
- Hub layout (5 sections, hero cards, accent stripe, top-2-5 list, "See full ranking" footer) — Tasks 14 + 15 + 18.
- Sub-page layout (breadcrumb, h1, era toggle, both tables in HTML, note) — Tasks 16 + 17.
- Era toggle script — Task 17 step 1.
- Nav update (Standings dropdown + Chrome route-active) — Task 19.
- SEO (titles, descriptions, canonicals, JSON-LD `CollectionPage` + `ItemList`, breadcrumbs) — Tasks 15 + 17.
- Sitemap auto-pickup — verified in Task 20.

**2. Placeholder scan:** No TBDs, no "TODOs", no "implement appropriately". Every step shows the exact code.

**3. Type consistency:** Function signatures used in Task 12 (`buildRecords`, `dispatch`) match the exports introduced in Tasks 4-11. Entry shape stays consistent across generators (driver vs team vs driver-at-circuit). `RecordIndex` interface in Task 14 matches what Task 12 writes to `_records-index.json`. `RecordsTable` props in Task 16 match what Task 17 passes.

**4. Open risk (acceptable):** The bundle-year title margin isn't covered exactly the way the spec describes — Task 13 uses `driver_standings.csv` directly, so any 2025/2026 final-standings titles from hand-curated bundles get a 0 margin (no CSV row to match). If 2025 needs to count, add a follow-up that augments `yearStandings` from `bundleStandings`. v1 ships with Ergast 1950-2024 coverage only for title-margin.
