# SEO Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full SEO overhaul described in [docs/superpowers/specs/2026-05-09-seo-overhaul-design.md](../specs/2026-05-09-seo-overhaul-design.md) — structured data fixes, listing-page JSON-LD, natural-language race/driver summaries with FAQ schema, internal linking, per-page-type OG images, and an off-page strategy guide.

**Architecture:** All work is on top of the existing Astro 4 SSG static-site pipeline. No new runtime dependencies on the page; OG image generation is a build-time Node script (Satori + @resvg/resvg-js) that runs as part of `prebuild`. Each Astro page passes new SEO props (`ogImage`, `publishedTime`) into `BaseLayout.astro`. Detail pages get expanded JSON-LD graphs and a new visible summary paragraph generated from data already in the page's props.

**Tech Stack:** Astro 4 (SSG), React 18 islands (existing), Satori + @resvg/resvg-js (new, build-time only), TypeScript in `.astro` frontmatter.

**Verification approach:** This codebase has no unit-test framework. Each task verifies via:
1. Dev server (already running on `http://localhost:4322`) — open page, check rendered HTML
2. `curl -s http://localhost:4322/<path>` + `grep` to confirm specific meta/JSON-LD strings
3. `npm run build` to catch frontmatter / type errors before commit
4. Visual via `mcp__Claude_Preview__preview_screenshot` for layout-affecting changes

**Branching:** Create branch `feat/seo-overhaul` at the start. Push at the end and open one PR.

---

## Pre-flight

- [ ] **Step 0.1: Create the feature branch**

```bash
cd /c/Users/rotsm/f1gures/.claude/worktrees/compassionate-cerf-ff7955
git checkout -b feat/seo-overhaul
```

Expected: `Switched to a new branch 'feat/seo-overhaul'`

- [ ] **Step 0.2: Confirm dev server is running**

Dev server should be on `http://localhost:4322`. If not, start it via `mcp__Claude_Preview__preview_start` (config name `f1gures`).

Verify: `curl -s -o /dev/null -w "%{http_code}" http://localhost:4322/` should print `200`.

---

## Phase A — BaseLayout Foundations

### Task 1: Add `og:image:alt`, `twitter:site`, font-display fix to BaseLayout

**Files:**
- Modify: `src/layouts/BaseLayout.astro`

- [ ] **Step 1.1: Add the new optional props to the Props interface**

Open `src/layouts/BaseLayout.astro` and update the `Props` interface (lines 23-32):

```ts
export interface Props {
  title: string;
  description: string;
  canonicalPath: string;
  ogType?: string;
  ogImage?: string;
  ogImageAlt?: string;
  publishedTime?: string;
  jsonLd?: unknown;
  breadcrumb?: { name: string; path: string }[];
  robots?: string;
}
```

Update the destructured props block (lines 34-43) to:

```ts
const {
  title,
  description,
  canonicalPath,
  ogType = 'website',
  ogImage = '/images/og-default.png',
  ogImageAlt,
  publishedTime,
  jsonLd,
  breadcrumb,
  robots = 'index, follow, max-image-preview:large',
} = Astro.props;

const resolvedOgImageAlt = ogImageAlt || title;
```

- [ ] **Step 1.2: Add `og:image:alt` and `twitter:site` meta tags**

In the same file, find the OG block (around lines 78-86) and add `og:image:alt` directly after `og:image:height`. Find the Twitter block (around lines 88-91) and add `twitter:site` after `twitter:card`. Final block:

```astro
  <meta property="og:image" content={ogImageUrl} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content={resolvedOgImageAlt} />
  <meta property="og:locale" content="en_GB" />

  {publishedTime && <meta property="article:published_time" content={publishedTime} />}

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@f1gures" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={ogImageUrl} />
  <meta name="twitter:image:alt" content={resolvedOgImageAlt} />
```

- [ ] **Step 1.3: Add `&display=swap` to the Google Fonts URL**

Find the fonts `<link>` (around line 99) and append `&display=swap` to the href (the URL already uses query params so it's just `&`):

```astro
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800&family=Barlow:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
```

(That URL already has `&display=swap` — verify it's present. If it is, no change needed; record this in the commit message.)

- [ ] **Step 1.4: Verify in dev server**

Run:

```bash
curl -s http://localhost:4322/ | grep -E 'og:image:alt|twitter:site|display=swap'
```

Expected: three matching lines (one each for og:image:alt, twitter:site, display=swap).

- [ ] **Step 1.5: Build to verify no TS errors**

```bash
npm run build
```

Expected: Build completes successfully, no errors. Discard the `dist/` if produced (it's gitignored).

- [ ] **Step 1.6: Commit**

```bash
git add src/layouts/BaseLayout.astro
git commit -m "feat(seo): add og:image:alt, twitter:site, publishedTime to BaseLayout"
```

---

### Task 2: Verify font-display swap is rendered

**Files:** (read-only verification)

- [ ] **Step 2.1: Inspect the actual fonts URL in BaseLayout**

```bash
grep -n "display=swap\|fonts.googleapis" src/layouts/BaseLayout.astro
```

If the existing line includes `display=swap`, this task is a no-op — log that and move on.
If not, add `&display=swap` to the href and commit:

```bash
git add src/layouts/BaseLayout.astro
git commit -m "perf(fonts): add display=swap to Google Fonts URL"
```

---

## Phase B — Detail Page Structured Data Fixes

### Task 3: Race page — `article:published_time` + expanded SportsEvent JSON-LD + FAQ

**Files:**
- Modify: `src/pages/races/[year]/[round].astro`

- [ ] **Step 3.1: Add buildRaceFaq helper inside frontmatter**

Open `src/pages/races/[year]/[round].astro`. After the existing frontmatter destructuring, before the `jsonLd` block, add:

```ts
const completed = race.results.length > 0;
const winner = race.results.find(r => r.position === 1) || null;
const second = race.results.find(r => r.position === 2) || null;
const third = race.results.find(r => r.position === 3) || null;
const poleSitterRef = race.qualifying?.[0]?.driverRef || null;
```

- [ ] **Step 3.2: Replace the existing `jsonLd` block with the expanded graph**

Replace the existing `const jsonLd = { ... }` block (around lines 20-32) with:

```ts
const sportsEvent: any = {
  '@type': 'SportsEvent',
  name: `${race.name} ${race.year}`,
  startDate: race.date,
  sport: 'Formula 1',
  url: `https://f1gures.app${canonicalPath}`,
  superEvent: {
    '@type': 'SportsEventSeries',
    name: 'FIA Formula One World Championship',
  },
};

if (race.circuit) {
  sportsEvent.location = {
    '@type': 'Place',
    name: race.circuit.name,
    address: race.circuit.location ? `${race.circuit.location}, ${race.circuit.countryName}` : race.circuit.countryName,
  };
}

if (completed && winner?.driverName) {
  sportsEvent.winner = { '@type': 'Person', name: winner.driverName };
  const performers = [winner, second, third].filter(p => p?.driverName).map(p => ({
    '@type': 'Person',
    name: p!.driverName,
  }));
  if (performers.length > 0) sportsEvent.performer = performers;
}

const jsonLd: any[] = [sportsEvent];

if (completed) {
  const fastest = race.results
    .filter(r => r.fastestLapRank === 1 && r.fastestLapTime)
    .map(r => ({ name: r.driverName, time: r.fastestLapTime }))[0];

  const faqEntities: any[] = [];
  if (winner?.driverName) {
    faqEntities.push({
      '@type': 'Question',
      name: `Who won the ${race.name} ${race.year}?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `${winner.driverName} won the ${race.name} ${race.year}${winner.constructorName ? `, driving for ${winner.constructorName}` : ''}.`,
      },
    });
  }
  if (race.qualifying && race.qualifying[0]?.driverName) {
    const pole = race.qualifying[0];
    faqEntities.push({
      '@type': 'Question',
      name: `Who was on pole position at the ${race.name} ${race.year}?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `${pole.driverName} took pole position${pole.constructorName ? ` for ${pole.constructorName}` : ''}.`,
      },
    });
  }
  if (fastest?.name && fastest?.time) {
    faqEntities.push({
      '@type': 'Question',
      name: `Who set the fastest lap at the ${race.name} ${race.year}?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `${fastest.name} set the fastest lap with a time of ${fastest.time}.`,
      },
    });
  }
  if (faqEntities.length > 0) {
    jsonLd.push({
      '@type': 'FAQPage',
      mainEntity: faqEntities,
    });
  }
}
```

- [ ] **Step 3.3: Pass `publishedTime` and `jsonLd` to BaseLayout**

Replace the `<BaseLayout … {jsonLd} {breadcrumb}>` line (around line 41) with:

```astro
<BaseLayout {title} {description} {canonicalPath} ogType="article" publishedTime={race.date || undefined} jsonLd={jsonLd.length === 1 ? jsonLd[0] : { '@context': 'https://schema.org', '@graph': jsonLd }} {breadcrumb}>
```

Note: BaseLayout already wraps a single object into the right `@context` envelope. The `@graph` form is needed only when we have ≥ 2 entries (SportsEvent + FAQPage).

- [ ] **Step 3.4: Verify a completed race has FAQ schema**

The 2025 British GP is round 12. Run:

```bash
curl -s http://localhost:4322/races/2025/12/ | grep -o '"@type":"FAQPage"'
```

Expected: `"@type":"FAQPage"` printed once.

```bash
curl -s http://localhost:4322/races/2025/12/ | grep -o 'article:published_time'
```

Expected: `article:published_time` printed once.

- [ ] **Step 3.5: Verify a future race has NO FAQ schema (graceful degrade)**

If the 2026 calendar still has uncompleted rounds, pick one (e.g. round 24):

```bash
curl -s http://localhost:4322/races/2026/24/ | grep -c '"@type":"FAQPage"'
```

Expected: `0`.

If the route returns 404 (round not yet prerendered), skip — the race page only exists for completed rounds.

- [ ] **Step 3.6: Build**

```bash
npm run build
```

Expected: Build succeeds, no errors.

- [ ] **Step 3.7: Commit**

```bash
git add src/pages/races/[year]/[round].astro
git commit -m "feat(seo): expand race SportsEvent JSON-LD, add FAQPage + article:published_time"
```

---

### Task 4: Driver page — expanded Person JSON-LD + FAQ

**Files:**
- Modify: `src/pages/drivers/[driverRef].astro`

- [ ] **Step 4.1: Add helpers for FAQ + description**

Open `src/pages/drivers/[driverRef].astro`. Inside frontmatter, after the existing `const yearsPart = …` line and before `const title = …`, add:

```ts
const completed = driver.career.races > 0;
const championshipYears = (driver.perSeason || [])
  .filter(s => s.position === 1)
  .map(s => s.year)
  .sort((a, b) => a - b);
const teamsRaced = Array.from(new Set((driver.perSeason || [])
  .map(s => s.constructorName)
  .filter((n): n is string => !!n)));
const careerSummary = `${fullName} (${driver.nationality || 'unknown nationality'}, F1 ${yearsPart}) — ${driver.career.races} races, ${driver.career.wins} wins, ${driver.career.podiums} podiums, ${driver.career.poles} poles, ${driver.career.championships} championships.`;
```

- [ ] **Step 4.2: Replace the `jsonLd` block with an expanded graph (Person + FAQPage)**

Replace the existing `const jsonLd = { … }` block with:

```ts
const personLd: any = {
  '@type': 'Person',
  name: fullName,
  givenName: driver.forename,
  familyName: driver.surname,
  nationality: driver.nationality,
  birthDate: driver.dob,
  jobTitle: 'Formula 1 Driver',
  description: careerSummary,
  identifier: driver.code || driver.driverRef,
  url: `https://f1gures.app${canonicalPath}`,
  hasOccupation: {
    '@type': 'Occupation',
    name: 'Formula 1 Racing Driver',
  },
};

const jsonLd: any[] = [personLd];

if (completed) {
  const faqEntities: any[] = [];
  if (driver.career.championships > 0 && championshipYears.length > 0) {
    faqEntities.push({
      '@type': 'Question',
      name: `How many F1 World Championships did ${fullName} win?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `${driver.career.championships} (${championshipYears.join(', ')}).`,
      },
    });
  } else {
    faqEntities.push({
      '@type': 'Question',
      name: `Did ${fullName} win an F1 World Championship?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `No. ${fullName} did not win the Formula 1 World Drivers' Championship.`,
      },
    });
  }
  faqEntities.push({
    '@type': 'Question',
    name: `How many F1 races did ${fullName} win?`,
    acceptedAnswer: {
      '@type': 'Answer',
      text: `${driver.career.wins} wins from ${driver.career.races} starts, with ${driver.career.podiums} podiums and ${driver.career.poles} pole positions.`,
    },
  });
  if (teamsRaced.length > 0) {
    faqEntities.push({
      '@type': 'Question',
      name: `Which teams did ${fullName} drive for in F1?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: teamsRaced.join(', ') + '.',
      },
    });
  }
  jsonLd.push({
    '@type': 'FAQPage',
    mainEntity: faqEntities,
  });
}
```

- [ ] **Step 4.3: Update the BaseLayout invocation to pass the graph**

Replace the existing `<BaseLayout {title} {description} {canonicalPath} ogType="profile" {jsonLd} {breadcrumb}>` line with:

```astro
<BaseLayout
  {title}
  {description}
  {canonicalPath}
  ogType="profile"
  jsonLd={jsonLd.length === 1 ? jsonLd[0] : { '@context': 'https://schema.org', '@graph': jsonLd }}
  {breadcrumb}
>
```

- [ ] **Step 4.4: Verify on a known driver**

```bash
curl -s http://localhost:4322/drivers/hamilton/ | grep -o '"@type":"FAQPage"'
```

Expected: prints `"@type":"FAQPage"` once.

```bash
curl -s http://localhost:4322/drivers/hamilton/ | grep -o '"hasOccupation"'
```

Expected: prints `"hasOccupation"` once.

- [ ] **Step 4.5: Verify on a driver with zero races (defensive)**

Pick a known historic driver with no race entries — `senna` will have many. Pick one with `career.races === 0` if any exist; otherwise this branch is verified by code review only.

```bash
npm run build
```

Expected: succeeds.

- [ ] **Step 4.6: Commit**

```bash
git add src/pages/drivers/[driverRef].astro
git commit -m "feat(seo): expand driver Person JSON-LD with hasOccupation + FAQPage"
```

---

### Task 5: Team page — fix ogType, expand SportsTeam JSON-LD

**Files:**
- Modify: `src/pages/teams/[constructorRef].astro`

- [ ] **Step 5.1: Replace the `jsonLd` block with expanded SportsTeam**

Open `src/pages/teams/[constructorRef].astro`. Replace the existing `const jsonLd = { … }` block (lines 22-30) with:

```ts
const jsonLd: any = {
  '@context': 'https://schema.org',
  '@type': 'SportsTeam',
  name: team.name,
  sport: 'Formula 1',
  identifier: team.constructorRef,
  url: `https://f1gures.app${canonicalPath}`,
  memberOf: {
    '@type': 'SportsOrganization',
    name: 'FIA Formula One World Championship',
  },
};

if (team.career.firstYear) {
  jsonLd.foundingDate = String(team.career.firstYear);
}
if (team.nationality) {
  jsonLd.location = { '@type': 'Country', name: team.nationality };
}
```

- [ ] **Step 5.2: Fix the ogType**

In the `<BaseLayout … ogType="article" …>` line, change `ogType="article"` to `ogType="website"`.

- [ ] **Step 5.3: Verify**

```bash
curl -s http://localhost:4322/teams/mclaren/ | grep -o '"memberOf"'
```

Expected: prints `"memberOf"` once.

```bash
curl -s http://localhost:4322/teams/mclaren/ | grep -o 'og:type" content="website"'
```

Expected: prints `og:type" content="website"` once.

- [ ] **Step 5.4: Build**

```bash
npm run build
```

Expected: succeeds.

- [ ] **Step 5.5: Commit**

```bash
git add src/pages/teams/[constructorRef].astro
git commit -m "fix(seo): correct team ogType to website, expand SportsTeam JSON-LD"
```

---

## Phase C — Listing Page JSON-LD

### Task 6: Driver standings page — ItemList JSON-LD (top 10)

**Files:**
- Modify: `src/pages/standings-drivers.astro`

- [ ] **Step 6.1: Compute top-10 standings in frontmatter**

Open `src/pages/standings-drivers.astro`. Replace the entire frontmatter with:

```ts
---
import BaseLayout from '../layouts/BaseLayout.astro';
import DriverStandingsIsland from '../components/islands/DriverStandingsIsland.jsx';
import currentSeason from '../data/currentSeason.js';

const seasonYear = currentSeason.seasonYear || '2026';
const title = `F1 ${seasonYear} Driver Standings — Live Championship Table | f1gures`;
const description = `Live ${seasonYear} Formula 1 World Drivers' Championship standings. Points, wins, podiums, poles and head-to-head driver comparison, updated every race.`;

const breadcrumb = [
  { name: 'Home', path: '/' },
  { name: 'Driver Standings', path: '/standings-drivers/' },
];

let jsonLd: unknown = undefined;
if (!currentSeason._empty && typeof currentSeason.computeStandings === 'function') {
  const standings = currentSeason.computeStandings();
  const top10 = (standings.drivers || []).slice(0, 10);
  // Only include drivers that have a known Ergast slug (jolpicaId) so the
  // emitted URLs resolve to real prerendered pages. driver.id is the F1 code
  // (e.g. "ALB") which is NOT the URL slug.
  const linkable = top10.filter(row => row.driver.jolpicaId);
  if (linkable.length > 0) {
    jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `${seasonYear} F1 Driver Championship Standings`,
      numberOfItems: linkable.length,
      itemListElement: linkable.map((row, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'Person',
          name: `${row.driver.first} ${row.driver.last}`,
          url: `https://f1gures.app/drivers/${row.driver.jolpicaId}/`,
        },
      })),
    };
  }
}
---
```

- [ ] **Step 6.2: Pass jsonLd to BaseLayout**

Update the `<BaseLayout …>` block to include `jsonLd={jsonLd}`:

```astro
<BaseLayout
  title={title}
  description={description}
  canonicalPath="/standings-drivers/"
  ogType="website"
  jsonLd={jsonLd}
  breadcrumb={breadcrumb}
>
  <DriverStandingsIsland client:load />
</BaseLayout>
```

- [ ] **Step 6.3: Verify**

```bash
curl -s http://localhost:4322/standings-drivers/ | grep -o '"@type":"ItemList"'
```

Expected: prints `"@type":"ItemList"` once.

- [ ] **Step 6.4: Build**

```bash
npm run build
```

Expected: succeeds.

- [ ] **Step 6.5: Commit**

```bash
git add src/pages/standings-drivers.astro
git commit -m "feat(seo): add ItemList JSON-LD to driver standings page"
```

---

### Task 7: Constructor standings page — ItemList JSON-LD

**Files:**
- Modify: `src/pages/standings-constructors.astro`

- [ ] **Step 7.1: Replace frontmatter to compute and emit ItemList**

Open `src/pages/standings-constructors.astro`. Replace the entire frontmatter with:

```ts
---
import BaseLayout from '../layouts/BaseLayout.astro';
import ConstructorStandingsIsland from '../components/islands/ConstructorStandingsIsland.jsx';
import currentSeason from '../data/currentSeason.js';

const seasonYear = currentSeason.seasonYear || '2026';
const title = `F1 ${seasonYear} Constructor Standings — Live Team Championship | f1gures`;
const description = `Live ${seasonYear} Formula 1 World Constructors' Championship table. Team points, wins, podiums and season trajectory for every F1 team, updated every race.`;

const breadcrumb = [
  { name: 'Home', path: '/' },
  { name: 'Constructor Standings', path: '/standings-constructors/' },
];

let jsonLd: unknown = undefined;
if (!currentSeason._empty && typeof currentSeason.computeStandings === 'function') {
  const standings = currentSeason.computeStandings();
  const ranked = standings.teams || [];
  if (ranked.length > 0) {
    jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `${seasonYear} F1 Constructor Championship Standings`,
      numberOfItems: ranked.length,
      itemListElement: ranked.map((row, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'SportsTeam',
          name: row.team.name,
          url: `https://f1gures.app/teams/${row.team.id}/`,
        },
      })),
    };
  }
}
---
```

- [ ] **Step 7.2: Pass jsonLd to BaseLayout**

```astro
<BaseLayout
  title={title}
  description={description}
  canonicalPath="/standings-constructors/"
  ogType="website"
  jsonLd={jsonLd}
  breadcrumb={breadcrumb}
>
  <ConstructorStandingsIsland client:load />
</BaseLayout>
```

- [ ] **Step 7.3: Verify**

```bash
curl -s http://localhost:4322/standings-constructors/ | grep -o '"@type":"ItemList"'
```

Expected: prints `"@type":"ItemList"` once.

- [ ] **Step 7.4: Build**

```bash
npm run build
```

Expected: succeeds.

- [ ] **Step 7.5: Commit**

```bash
git add src/pages/standings-constructors.astro
git commit -m "feat(seo): add ItemList JSON-LD to constructor standings page"
```

---

### Task 8: Calendar page — ItemList JSON-LD

**Files:**
- Modify: `src/pages/calendar.astro`

- [ ] **Step 8.1: Replace frontmatter to emit ItemList of calendar entries**

Open `src/pages/calendar.astro`. Replace the entire frontmatter with:

```ts
---
import BaseLayout from '../layouts/BaseLayout.astro';
import CalendarIsland from '../components/islands/CalendarIsland.jsx';
import currentSeason from '../data/currentSeason.js';

const seasonYear = currentSeason.seasonYear || '2026';
const calendar = Array.isArray(currentSeason.calendar) ? currentSeason.calendar : [];
const title = `F1 ${seasonYear} Race Calendar — All ${calendar.length || 24} Grands Prix, Dates & Times | f1gures`;
const description = `Complete ${seasonYear} Formula 1 schedule. All Grand Prix dates, circuits, sprint weekends, qualifying and race times in your local timezone.`;

const breadcrumb = [
  { name: 'Home', path: '/' },
  { name: 'Calendar', path: '/calendar/' },
];

let jsonLd: unknown = undefined;
if (calendar.length > 0) {
  jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${seasonYear} Formula 1 Race Calendar`,
    numberOfItems: calendar.length,
    itemListElement: calendar.map((race) => ({
      '@type': 'ListItem',
      position: race.round,
      item: {
        '@type': 'SportsEvent',
        name: race.name,
        startDate: race.date || undefined,
        sport: 'Formula 1',
      },
    })),
  };
}
---
```

- [ ] **Step 8.2: Pass jsonLd to BaseLayout**

```astro
<BaseLayout
  title={title}
  description={description}
  canonicalPath="/calendar/"
  ogType="website"
  jsonLd={jsonLd}
  breadcrumb={breadcrumb}
>
  <CalendarIsland client:load />
</BaseLayout>
```

- [ ] **Step 8.3: Verify**

```bash
curl -s http://localhost:4322/calendar/ | grep -o '"@type":"ItemList"'
```

Expected: prints `"@type":"ItemList"` once.

- [ ] **Step 8.4: Build + commit**

```bash
npm run build
git add src/pages/calendar.astro
git commit -m "feat(seo): add ItemList JSON-LD to calendar page"
```

---

### Task 9: Circuits index page — ItemList JSON-LD

**Files:**
- Modify: `src/pages/circuits.astro`

- [ ] **Step 9.1: Replace frontmatter to emit ItemList of circuits**

Open `src/pages/circuits.astro`. Replace the entire frontmatter with:

```ts
---
import BaseLayout from '../layouts/BaseLayout.astro';
import CircuitsIndexIsland from '../components/islands/CircuitsIndexIsland.jsx';
import currentSeason from '../data/currentSeason.js';

const seasonYear = currentSeason.seasonYear || '2026';
const calendar = Array.isArray(currentSeason.calendar) ? currentSeason.calendar : [];
const title = `F1 Circuits ${seasonYear} — All Tracks, Maps & Lap Records | f1gures`;
const description = `Every circuit on the ${seasonYear} Formula 1 calendar. Track maps, lap records, length, corners, DRS zones and tyre characteristics for all ${calendar.length || 24} Grands Prix.`;

const breadcrumb = [
  { name: 'Home', path: '/' },
  { name: 'Circuits', path: '/circuits/' },
];

const seenCircuits = new Set<string>();
const circuitItems: { circuitId: string; name: string }[] = [];
for (const r of calendar) {
  const id = r.circuitId || r.circuit;
  if (id && !seenCircuits.has(id)) {
    seenCircuits.add(id);
    circuitItems.push({ circuitId: id, name: r.name?.replace(/Grand Prix$/i, 'Circuit').trim() || id });
  }
}

const jsonLd = circuitItems.length > 0 ? {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: `${seasonYear} F1 Circuits`,
  numberOfItems: circuitItems.length,
  itemListElement: circuitItems.map((c, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': 'Place',
      name: c.name,
      url: `https://f1gures.app/circuits/${c.circuitId}/`,
    },
  })),
} : undefined;
---
```

- [ ] **Step 9.2: Pass jsonLd to BaseLayout**

```astro
<BaseLayout
  title={title}
  description={description}
  canonicalPath="/circuits/"
  ogType="website"
  jsonLd={jsonLd}
  breadcrumb={breadcrumb}
>
  <CircuitsIndexIsland client:load />
</BaseLayout>
```

- [ ] **Step 9.3: Verify + build + commit**

```bash
curl -s http://localhost:4322/circuits/ | grep -o '"@type":"ItemList"'
npm run build
git add src/pages/circuits.astro
git commit -m "feat(seo): add ItemList JSON-LD to circuits index page"
```

Expected verify: `"@type":"ItemList"` once. Expected build: succeeds.

---

## Phase D — Natural-Language Summaries & FAQ Content

### Task 10: Race summary helper + visible paragraph

**Files:**
- Create: `src/lib/buildRaceSummary.js`
- Modify: `src/components/RacePage.astro`
- Modify: `public/css/app.css` (add `.race-summary` style)

- [ ] **Step 10.1: Create the helper**

Create `src/lib/buildRaceSummary.js`:

```js
// Build a 2-3 sentence natural-language summary of a race for SEO/snippet use.
// Returns null when the race has no results yet (future race).
//
// Input shape matches `RacePage.astro`'s `race` prop.

export function buildRaceSummary(race) {
  if (!race?.results?.length) return null;

  const winner = race.results.find(r => r.position === 1);
  const second = race.results.find(r => r.position === 2);
  const third = race.results.find(r => r.position === 3);
  if (!winner?.driverName) return null;

  const circuitName = race.circuit?.name || null;
  const dateText = race.date ? formatDateLong(race.date) : null;
  const winnerStartLabel = (() => {
    if (winner.grid == null) return null;
    if (winner.grid === 1) return 'starting from pole position';
    return `starting from P${winner.grid} on the grid`;
  })();

  const sentences = [];

  let s1 = `${winner.driverName} won the ${race.name} ${race.year}`;
  if (circuitName) s1 += ` at ${circuitName}`;
  if (dateText) s1 += ` on ${dateText}`;
  if (winnerStartLabel) s1 += `, ${winnerStartLabel}`;
  s1 += '.';
  sentences.push(s1);

  const podiumParts = [];
  if (second?.driverName) {
    podiumParts.push(`${second.driverName} finished second${second.constructorName ? ` for ${second.constructorName}` : ''}`);
  }
  if (third?.driverName) {
    podiumParts.push(`${third.driverName} completing the podium${third.constructorName ? ` for ${third.constructorName}` : ''}`);
  }
  if (podiumParts.length > 0) {
    sentences.push(podiumParts.join(', with ') + '.');
  }

  const fastest = race.results.find(r => r.fastestLapRank === 1 && r.fastestLapTime);
  if (fastest?.driverName && fastest?.fastestLapTime) {
    sentences.push(`${fastest.driverName} set the fastest lap with a time of ${fastest.fastestLapTime}.`);
  }

  if (race.sprint?.length > 0) {
    const sprintWinner = race.sprint.find(r => r.position === 1);
    if (sprintWinner?.driverName) {
      sentences.push(`It was a sprint weekend, with ${sprintWinner.driverName} winning the sprint race.`);
    }
  }

  return sentences.join(' ');
}

function formatDateLong(iso) {
  // Match shared.jsx fmtDateLong. Avoid importing JSX into a build-time helper.
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}
```

- [ ] **Step 10.2: Render the summary in RacePage.astro**

Open `src/components/RacePage.astro`. Add to the imports at the top of frontmatter:

```ts
import { buildRaceSummary } from '../lib/buildRaceSummary.js';
```

In the frontmatter (anywhere after `const { race } = Astro.props;`), add:

```ts
const raceSummary = buildRaceSummary(race);
```

Find the place where the race hero / first heading is rendered. Add directly after the hero block (before the results table) a visible paragraph:

```astro
{raceSummary && (
  <p class="race-summary">{raceSummary}</p>
)}
```

You may need to read the surrounding markup to find the right insertion point. The summary should be the first text after the page title/hero, before the results table.

- [ ] **Step 10.3: Add CSS**

Open `public/css/app.css`. Append to the end of the file:

```css
/* SEO content paragraphs — visible natural-language summaries above
   detail page tables. Reused for race-summary and driver-summary. */
.race-summary,
.driver-summary {
  font-size: 0.95rem;
  line-height: 1.55;
  color: var(--ink-2, #444);
  margin: 12px 0 18px;
  max-width: 65ch;
}
:root .race-summary,
:root .driver-summary { color: var(--ink-2, #c9c9c9); }
html.light .race-summary,
html.light .driver-summary { color: var(--ink-2, #444); }
```

(If `--ink-2` does not exist in this codebase, the fallback hex applies — verify by checking `:root` block earlier in the same file.)

- [ ] **Step 10.4: Verify on a known completed race**

```bash
curl -s http://localhost:4322/races/2024/12/ | grep -o '<p class="race-summary">'
```

Expected: prints once.

- [ ] **Step 10.5: Visual check**

Use `mcp__Claude_Preview__preview_screenshot` after navigating to `/races/2024/12/`. The summary paragraph should appear above the results table, in muted text style.

- [ ] **Step 10.6: Build**

```bash
npm run build
```

Expected: succeeds.

- [ ] **Step 10.7: Commit**

```bash
git add src/lib/buildRaceSummary.js src/components/RacePage.astro public/css/app.css
git commit -m "feat(seo): add natural-language race summary paragraph above results"
```

---

### Task 11: Driver summary helper + visible paragraph

**Files:**
- Create: `src/lib/buildDriverSummary.js`
- Modify: `src/components/DriverPage.astro`

- [ ] **Step 11.1: Create the helper**

Create `src/lib/buildDriverSummary.js`:

```js
// Build a 2-3 sentence natural-language career summary for a driver.
// Returns null when the driver has zero races (data integrity guard).

export function buildDriverSummary(driver, currentYear) {
  if (!driver || driver.career?.races == null || driver.career.races === 0) return null;

  const fullName = `${driver.forename} ${driver.surname}`;
  const isActive = driver.career.lastYear != null && driver.career.lastYear >= currentYear;
  const verb = isActive ? 'is' : 'was';
  const compete = isActive ? 'has competed' : 'competed';
  const yearsLabel = driver.career.firstYear === driver.career.lastYear
    ? `${driver.career.firstYear}`
    : `between ${driver.career.firstYear} and ${driver.career.lastYear}`;

  const championshipYears = (driver.perSeason || [])
    .filter(s => s.position === 1)
    .map(s => s.year)
    .sort((a, b) => a - b);

  const teams = Array.from(new Set((driver.perSeason || [])
    .map(s => s.constructorName)
    .filter(Boolean)));

  const sentences = [];
  sentences.push(`${fullName} ${verb} a ${driver.nationality || ''} Formula 1 driver who ${compete} ${yearsLabel}.`.replace(/\s+/g, ' '));

  let stats = '';
  if (driver.career.championships > 0 && championshipYears.length > 0) {
    const titlesWord = driver.career.championships === 1 ? 'World Drivers\' Championship' : 'World Drivers\' Championships';
    stats += `${fullName.split(' ').slice(-1)[0]} won ${driver.career.championships} ${titlesWord} (${championshipYears.join(', ')}) `;
  }
  stats += `across ${driver.career.races} races, taking ${driver.career.wins} wins, ${driver.career.podiums} podiums and ${driver.career.poles} pole positions`;
  if (teams.length > 0 && teams.length <= 4) {
    stats += ` for ${teams.join(', ')}`;
  }
  stats += '.';
  sentences.push(stats);

  if (driver.career.championships >= 3) {
    sentences.push(`${fullName.split(' ').slice(-1)[0]} is widely regarded as one of the greatest drivers in the sport's history.`);
  }

  return sentences.join(' ');
}
```

- [ ] **Step 11.2: Render the summary in DriverPage.astro**

Open `src/components/DriverPage.astro`. Add to the frontmatter imports:

```ts
import { buildDriverSummary } from '../lib/buildDriverSummary.js';
```

After the existing `const fullName = …` line, add:

```ts
const driverSummary = buildDriverSummary(driver, new Date().getFullYear());
```

Find the appropriate insertion point — after the hero/title block, before the career stats grid. Insert:

```astro
{driverSummary && (
  <p class="driver-summary">{driverSummary}</p>
)}
```

- [ ] **Step 11.3: Verify**

```bash
curl -s http://localhost:4322/drivers/hamilton/ | grep -o '<p class="driver-summary">'
```

Expected: prints once.

```bash
curl -s http://localhost:4322/drivers/hamilton/ | grep -o "World Drivers' Championship"
```

Expected: prints at least once (Hamilton has 7 championships).

- [ ] **Step 11.4: Build + visual check**

```bash
npm run build
```

Expected: succeeds. Then screenshot `/drivers/hamilton/` and confirm the paragraph renders above the stats grid.

- [ ] **Step 11.5: Commit**

```bash
git add src/lib/buildDriverSummary.js src/components/DriverPage.astro
git commit -m "feat(seo): add natural-language driver career summary paragraph"
```

---

## Phase E — Internal Linking

### Task 12: Race page — Key Links row

**Files:**
- Modify: `src/components/RacePage.astro`

- [ ] **Step 12.1: Add Key Links row beneath the results table**

Open `src/components/RacePage.astro`. In frontmatter, after the existing destructuring, add:

```ts
const winnerRow = race.results.find(r => r.position === 1) || null;
const poleQualifying = race.qualifying?.[0] || null;

interface KeyLink { label: string; href: string; text: string; }
const keyLinks: KeyLink[] = [];
if (winnerRow?.driverRef && winnerRow?.driverName) {
  keyLinks.push({ label: 'Winner', href: `/drivers/${winnerRow.driverRef}/`, text: winnerRow.driverName });
}
if (poleQualifying?.driverRef && poleQualifying?.driverName && poleQualifying.driverRef !== winnerRow?.driverRef) {
  keyLinks.push({ label: 'Pole', href: `/drivers/${poleQualifying.driverRef}/`, text: poleQualifying.driverName });
}
if (race.circuit?.circuitRef && race.circuit?.name) {
  keyLinks.push({ label: 'Circuit', href: `/circuits/${race.circuit.circuitRef}/`, text: race.circuit.name });
}
if (winnerRow?.constructorRef && winnerRow?.constructorName) {
  keyLinks.push({ label: 'Winning team', href: `/teams/${winnerRow.constructorRef}/`, text: winnerRow.constructorName });
}
```

Find the closing of the results table block (the last `</div>` after the table, before the qualifying section). Insert directly after the results section:

```astro
{keyLinks.length > 0 && (
  <div class="race-keylinks">
    <span class="t-eyebrow">Key links:</span>
    <ul>
      {keyLinks.map((l) => (
        <li>
          <span class="t-mono">{l.label}</span>{' '}
          <a href={l.href}>{l.text}</a>
        </li>
      ))}
    </ul>
  </div>
)}
```

- [ ] **Step 12.2: Add CSS for `.race-keylinks`**

Append to `public/css/app.css`:

```css
.race-keylinks {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin: 16px 0 20px;
  font-size: 0.9rem;
}
.race-keylinks ul {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  list-style: none;
  padding: 0;
  margin: 0;
}
.race-keylinks li { display: inline-flex; gap: 6px; }
.race-keylinks .t-mono { opacity: 0.6; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.04em; }
.race-keylinks a { color: inherit; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }
.race-keylinks a:hover { text-decoration-thickness: 2px; }
```

- [ ] **Step 12.3: Verify**

```bash
curl -s http://localhost:4322/races/2024/12/ | grep -o '"race-keylinks"'
```

Expected: prints once.

```bash
curl -s http://localhost:4322/races/2024/12/ | grep -oE '/drivers/[a-z_]+/' | sort -u
```

Expected: at least 1-2 driver hrefs.

- [ ] **Step 12.4: Build + screenshot + commit**

```bash
npm run build
git add src/components/RacePage.astro public/css/app.css
git commit -m "feat(seo): add key links row (winner, pole, circuit, team) to race page"
```

---

### Task 13: Driver page — link constructor names + race names in tables

**Files:**
- Modify: `src/components/DriverPage.astro`

- [ ] **Step 13.1: Locate the per-season table**

Open `src/components/DriverPage.astro`. Find the per-season table (it iterates over `driver.perSeason`). The constructor name cell currently renders something like `{s.constructorName}` or wraps with `<span style={...}>`. Wrap it in an anchor only when `s.constructorRef` exists:

```astro
{s.constructorRef && s.constructorName ? (
  <a href={`/teams/${s.constructorRef}/`} class="inline-link">{s.constructorName}</a>
) : (
  s.constructorName || '—'
)}
```

- [ ] **Step 13.2: Locate the per-race table and link race names**

Find the per-race table (iterates over `driver.perRace`). The page already has an `ARCHIVE_MAX_YEAR = 2025` and a local `raceUrl(year, round)` helper (per CLAUDE.md). Reuse it. Wrap each `r.raceName` cell:

```astro
{r.raceName ? (
  <a href={raceUrl(r.year, r.round)} class="inline-link">{r.raceName}</a>
) : '—'}
```

If the helper doesn't exist in this file (the spec says it does in `CircuitPage` and `DriverPage`), add it in frontmatter:

```ts
const ARCHIVE_MAX_YEAR = 2025;
function raceUrl(year, round) {
  if (year == null || round == null) return '/calendar/';
  if (year <= ARCHIVE_MAX_YEAR) return `/races/${year}/${round}/`;
  return `/race.html?round=${round}&year=${year}`;
}
```

- [ ] **Step 13.3: Add `.inline-link` style to css/app.css**

Append:

```css
.inline-link { color: inherit; text-decoration: underline; text-decoration-thickness: 1px; text-decoration-color: rgba(255,255,255,0.25); text-underline-offset: 3px; }
.inline-link:hover { text-decoration-color: currentColor; text-decoration-thickness: 2px; }
html.light .inline-link { text-decoration-color: rgba(0,0,0,0.25); }
```

- [ ] **Step 13.4: Verify**

```bash
curl -s http://localhost:4322/drivers/hamilton/ | grep -oE '/teams/[a-z_]+/' | sort -u | head -5
```

Expected: includes `/teams/mclaren/`, `/teams/mercedes/`, `/teams/ferrari/`.

```bash
curl -s http://localhost:4322/drivers/hamilton/ | grep -oE '/races/[0-9]+/[0-9]+/' | head -3
```

Expected: at least 3 race links.

- [ ] **Step 13.5: Build + commit**

```bash
npm run build
git add src/components/DriverPage.astro public/css/app.css
git commit -m "feat(seo): link constructor + race names in driver page tables"
```

---

### Task 14: Circuit page — link winner names in historical winners table

**Files:**
- Modify: `src/components/CircuitPage.astro`

- [ ] **Step 14.1: Locate the historical races table**

Open `src/components/CircuitPage.astro`. Find the table iterating over `circuit.races`. Each row likely renders `{r.winnerName}` and `{r.winnerTeam}`. Wrap winner name only when `r.winnerRef` exists:

```astro
{r.winnerRef && r.winnerName ? (
  <a href={`/drivers/${r.winnerRef}/`} class="inline-link">{r.winnerName}</a>
) : (r.winnerName || '—')}
```

Leave `r.winnerTeam` as plain text — the data does not include `winnerTeamRef` (verified in `scripts/build-archive.mjs:929,1071`).

- [ ] **Step 14.2: Verify**

```bash
curl -s http://localhost:4322/circuits/silverstone/ | grep -oE '/drivers/[a-z_]+/' | sort -u | head -5
```

Expected: 3+ driver links (Silverstone has many winners).

- [ ] **Step 14.3: Build + commit**

```bash
npm run build
git add src/components/CircuitPage.astro
git commit -m "feat(seo): link winners in circuit historical race table"
```

---

### Task 15: Team page — Drivers section with links

**Files:**
- Modify: `src/components/TeamPage.astro`

- [ ] **Step 15.1: Add a "Drivers" section using `team.topDrivers`**

Open `src/components/TeamPage.astro`. The team data already has `topDrivers: Array<{ driverRef, name, races, wins }>` (verified in the interface). After the season-by-season block (or wherever fits in the visual flow — read surrounding markup to decide), add:

```astro
{team.topDrivers && team.topDrivers.length > 0 && (
  <div class="section-head"><h2>Notable Drivers</h2><div class="section-rule"></div></div>
  <ul class="team-drivers-list">
    {team.topDrivers.slice(0, 20).map((d) => (
      <li>
        <a href={`/drivers/${d.driverRef}/`} class="inline-link">{d.name}</a>
        <span class="t-mono"> · {d.races} races · {d.wins} wins</span>
      </li>
    ))}
  </ul>
)}
```

- [ ] **Step 15.2: Add CSS**

Append to `public/css/app.css`:

```css
.team-drivers-list {
  list-style: none;
  padding: 0;
  margin: 12px 0 24px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 8px 16px;
}
.team-drivers-list li { font-size: 0.95rem; }
.team-drivers-list .t-mono { opacity: 0.65; font-size: 0.85rem; }
@media (max-width: 720px) {
  .team-drivers-list { grid-template-columns: 1fr; }
}
```

- [ ] **Step 15.3: Verify**

```bash
curl -s http://localhost:4322/teams/mclaren/ | grep -o 'team-drivers-list'
```

Expected: prints once.

```bash
curl -s http://localhost:4322/teams/mclaren/ | grep -oE '/drivers/[a-z_]+/' | sort -u | wc -l
```

Expected: ≥ 5 unique driver links.

- [ ] **Step 15.4: Build + screenshot + commit**

```bash
npm run build
git add src/components/TeamPage.astro public/css/app.css
git commit -m "feat(seo): add Notable Drivers section with links to team page"
```

---

### Task 16: Audit listing-island internal links

**Files:**
- Read-only: `src/components/islands/screens/HomeScreen.jsx`, `CalendarScreen.jsx`, `DriverStandingsScreen.jsx`, `ConstructorStandingsScreen.jsx`, `CircuitsIndexScreen.jsx`

- [ ] **Step 16.1: Read each screen and verify driver/team/race name links exist**

For each screen, confirm that:
- Driver names render with an anchor to `/drivers/<ref>/` (or use `urlFor('driver', driverRef)`)
- Team names render with an anchor to `/teams/<ref>/`
- Race names (calendar) link to `/race.html?round=N&year=Y` for completed rounds

For each screen where this is **already** the case, no change is needed.

For each screen where it's **not**, wrap the relevant `{name}` JSX in `<a href={urlFor('driver', ref)}>...</a>` (using the existing `urlFor` helper from `src/lib/shared.jsx`).

This is a read-only audit task; if any wraps are needed, do them in this task with a single commit.

- [ ] **Step 16.2: If changes were made, build + commit**

```bash
npm run build
git add src/components/islands/screens
git commit -m "feat(seo): ensure listing islands link driver/team/race names"
```

If no changes were needed, skip the commit.

---

## Phase F — Per-Type OG Images (Build-Time Generation)

### Task 17: Add Satori + @resvg/resvg-js dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (regenerated by npm)

- [ ] **Step 17.1: Install dependencies as devDependencies**

```bash
cd /c/Users/rotsm/f1gures/.claude/worktrees/compassionate-cerf-ff7955
npm install --save-dev satori @resvg/resvg-js
```

Expected: both packages added to `package.json` `devDependencies`. No errors. If `npm install` reports peer dependency warnings, accept them (Satori is permissive).

- [ ] **Step 17.2: Verify the install**

```bash
node -e "import('satori').then(m => console.log('satori loaded:', typeof m.default)); import('@resvg/resvg-js').then(m => console.log('resvg loaded:', typeof m.Resvg));"
```

Expected: prints both confirmations.

- [ ] **Step 17.3: Commit lockfile + package.json**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add satori + resvg-js for build-time OG image generation"
```

---

### Task 18: OG image generator script — base + race template

**Files:**
- Create: `scripts/generate-og-images.mjs`
- Create: `scripts/og-templates/og-shared.mjs` (shared layout helpers)
- Create: `scripts/og-templates/og-race.mjs`
- Modify: `package.json` (extend prebuild)
- Modify: `.gitignore` (ignore generated PNGs)

- [ ] **Step 18.1: Add `public/images/og/` to .gitignore**

Append to `.gitignore`:

```
# Generated OG images (rebuilt by prebuild)
/public/images/og/
```

- [ ] **Step 18.2: Create `scripts/og-templates/og-shared.mjs`**

```js
// Shared layout primitives for OG image templates rendered with Satori.
// Returns plain Satori-style JSX object trees (no React).

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export const COLORS = {
  bg: '#0a0a0a',
  bgGrad: '#1a1a1a',
  text: '#f5f5f5',
  muted: '#a0a0a0',
  accent: '#ff5f5f',
};

// Build a base container card. Children render inside a 60px-padded box.
export function ogCard(children) {
  return {
    type: 'div',
    props: {
      style: {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '60px',
        backgroundColor: COLORS.bg,
        backgroundImage: `linear-gradient(135deg, ${COLORS.bg} 0%, ${COLORS.bgGrad} 100%)`,
        color: COLORS.text,
        fontFamily: 'Inter',
      },
      children,
    },
  };
}

export function ogBrand() {
  return {
    type: 'div',
    props: {
      style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: 24, color: COLORS.muted },
      children: [
        { type: 'span', props: { style: { color: COLORS.accent }, children: '●' } },
        { type: 'span', props: { children: 'f1gures' } },
      ],
    },
  };
}

export function ogTitle(text) {
  return {
    type: 'div',
    props: {
      style: { fontSize: 84, fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.02em' },
      children: text,
    },
  };
}

export function ogSubtitle(text) {
  return {
    type: 'div',
    props: {
      style: { fontSize: 32, fontWeight: 500, color: COLORS.muted, marginTop: 16 },
      children: text,
    },
  };
}
```

- [ ] **Step 18.3: Create `scripts/og-templates/og-race.mjs`**

```js
import { ogCard, ogBrand, ogTitle, ogSubtitle, COLORS } from './og-shared.mjs';

// race shape: { name, year, results[], circuit: { name, flag, countryName } }
export function renderRaceOg(race) {
  const winner = race.results?.find(r => r.position === 1) || null;

  const top = {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column' },
      children: [
        {
          type: 'div',
          props: {
            style: { fontSize: 28, fontWeight: 600, color: COLORS.accent, textTransform: 'uppercase', letterSpacing: '0.08em' },
            children: `${race.year} · Round ${race.round}`,
          },
        },
        ogTitle(race.name),
        race.circuit?.name ? ogSubtitle(`${race.circuit.flag || ''} ${race.circuit.name}`.trim()) : null,
      ].filter(Boolean),
    },
  };

  const bottom = {
    type: 'div',
    props: {
      style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' },
      children: [
        winner ? {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', gap: 4 },
            children: [
              { type: 'div', props: { style: { fontSize: 20, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }, children: 'Winner' } },
              { type: 'div', props: { style: { fontSize: 44, fontWeight: 700 }, children: winner.driverName } },
              winner.constructorName ? { type: 'div', props: { style: { fontSize: 22, color: COLORS.muted }, children: winner.constructorName } } : null,
            ].filter(Boolean),
          },
        } : { type: 'div', props: { children: '' } },
        ogBrand(),
      ],
    },
  };

  return ogCard([top, bottom]);
}
```

- [ ] **Step 18.4: Create `scripts/generate-og-images.mjs`**

```js
#!/usr/bin/env node
// Build-time OG image generator. Renders one PNG per detail page using Satori
// + @resvg/resvg-js. Output: public/images/og/<type>/<slug>.png.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { OG_WIDTH, OG_HEIGHT } from './og-templates/og-shared.mjs';
import { renderRaceOg } from './og-templates/og-race.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ARCHIVE = path.join(ROOT, 'public/data/archive');
const OUT_BASE = path.join(ROOT, 'public/images/og');

// Load Inter font from npm cache or download once.
async function loadFont() {
  // Use a system fallback if no font is shipped. Satori needs at least one.
  // For deterministic builds, fetch Inter from Google Fonts API once and cache.
  const cacheDir = path.join(ROOT, 'node_modules/.cache/og-fonts');
  fs.mkdirSync(cacheDir, { recursive: true });
  const cachePath = path.join(cacheDir, 'inter-700.ttf');
  if (!fs.existsSync(cachePath)) {
    const css = await fetch('https://fonts.googleapis.com/css2?family=Inter:wght@500;700&display=swap', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }).then(r => r.text());
    const match = css.match(/url\((https:[^)]+\.woff2|https:[^)]+\.ttf)\)/);
    if (!match) throw new Error('Could not find Inter TTF in Google Fonts CSS response');
    const buf = Buffer.from(await fetch(match[1]).then(r => r.arrayBuffer()));
    fs.writeFileSync(cachePath, buf);
  }
  return fs.readFileSync(cachePath);
}

async function renderPng(tree, fontData) {
  const svg = await satori(tree, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: [{ name: 'Inter', data: fontData, weight: 700, style: 'normal' }],
  });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } });
  return resvg.render().asPng();
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

async function generateRaceOgs(fontData) {
  const indexPath = path.join(ARCHIVE, '_races-index.json');
  if (!fs.existsSync(indexPath)) {
    console.warn('[og] no race index found, skipping race OGs');
    return 0;
  }
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const outDir = path.join(OUT_BASE, 'races');
  ensureDir(outDir);

  let count = 0;
  const batchSize = 20;
  for (let i = 0; i < index.length; i += batchSize) {
    const batch = index.slice(i, i + batchSize);
    await Promise.all(batch.map(async (entry) => {
      const racePath = path.join(ARCHIVE, 'races', String(entry.year), `${entry.round}.json`);
      if (!fs.existsSync(racePath)) return;
      const race = JSON.parse(fs.readFileSync(racePath, 'utf8'));
      const png = await renderPng(renderRaceOg(race), fontData);
      const out = path.join(outDir, `${entry.year}-${entry.round}.png`);
      fs.writeFileSync(out, png);
      count++;
    }));
  }
  return count;
}

async function main() {
  console.log('[og] starting OG image generation');
  const fontData = await loadFont();
  ensureDir(OUT_BASE);

  const races = await generateRaceOgs(fontData);
  console.log(`[og] generated ${races} race OG images → ${path.relative(ROOT, OUT_BASE)}/races/`);
}

main().catch(err => {
  console.error('[og] failed:', err);
  process.exit(1);
});
```

- [ ] **Step 18.5: Wire the script into prebuild**

Open `package.json`. Update the `prebuild` and `predev` scripts to add the OG step **after** `build:archive` but before `sync:current`:

```json
"build:archive": "node scripts/build-archive.mjs",
"build:og": "node scripts/generate-og-images.mjs",
"sync:current": "node scripts/sync-current-season.mjs",
"fetch:current": "node scripts/fetch-season.mjs $(date +%Y)",
"prebuild": "npm run build:archive && npm run build:og && npm run sync:current",
"predev": "npm run build:archive && npm run sync:current",
```

Note: deliberately skip OG generation in `predev` — it's slow on every dev start. Only run for production builds.

- [ ] **Step 18.6: Run the script standalone**

```bash
npm run build:og
```

Expected: prints `[og] generated NNNN race OG images …`. The number should match the race count (≈1153).

- [ ] **Step 18.7: Spot-check an output**

```bash
ls public/images/og/races/ | head -5
```

Expected: at least 5 PNG files.

```bash
node -e "const fs = require('fs'); const s = fs.statSync('public/images/og/races/2024-12.png'); console.log('size:', s.size);"
```

Expected: file exists, non-zero size (typically 30-100 KB).

- [ ] **Step 18.8: Commit**

```bash
git add scripts/generate-og-images.mjs scripts/og-templates/ package.json .gitignore
git commit -m "feat(seo): generate race OG images at build time with Satori"
```

---

### Task 19: Driver OG template

**Files:**
- Create: `scripts/og-templates/og-driver.mjs`
- Modify: `scripts/generate-og-images.mjs`

- [ ] **Step 19.1: Create `scripts/og-templates/og-driver.mjs`**

```js
import { ogCard, ogBrand, ogTitle, ogSubtitle, COLORS } from './og-shared.mjs';

export function renderDriverOg(driver) {
  const fullName = `${driver.forename} ${driver.surname}`;
  const headlineParts = [];
  if (driver.career.championships > 0) {
    headlineParts.push(`${driver.career.championships}× Champion`);
  }
  headlineParts.push(`${driver.career.wins} wins`);
  headlineParts.push(`${driver.career.poles} poles`);
  const headline = headlineParts.join(' · ');

  const yearsLabel = driver.career.firstYear === driver.career.lastYear
    ? `${driver.career.firstYear}`
    : `${driver.career.firstYear}–${driver.career.lastYear}`;

  const top = {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column' },
      children: [
        {
          type: 'div',
          props: {
            style: { fontSize: 28, fontWeight: 600, color: COLORS.accent, textTransform: 'uppercase', letterSpacing: '0.08em' },
            children: 'F1 Driver',
          },
        },
        ogTitle(fullName),
        ogSubtitle(`${driver.nationality || ''} · ${yearsLabel}`.trim()),
      ],
    },
  };

  const bottom = {
    type: 'div',
    props: {
      style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' },
      children: [
        {
          type: 'div',
          props: {
            style: { fontSize: 38, fontWeight: 700, color: COLORS.text },
            children: headline,
          },
        },
        ogBrand(),
      ],
    },
  };

  return ogCard([top, bottom]);
}
```

- [ ] **Step 19.2: Add a `generateDriverOgs` function in `scripts/generate-og-images.mjs`**

After `generateRaceOgs`, add:

```js
async function generateDriverOgs(fontData) {
  const indexPath = path.join(ARCHIVE, '_drivers-index.json');
  if (!fs.existsSync(indexPath)) {
    console.warn('[og] no driver index found, skipping driver OGs');
    return 0;
  }
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const outDir = path.join(OUT_BASE, 'drivers');
  ensureDir(outDir);

  let count = 0;
  const batchSize = 20;
  for (let i = 0; i < index.length; i += batchSize) {
    const batch = index.slice(i, i + batchSize);
    await Promise.all(batch.map(async (entry) => {
      const driverPath = path.join(ARCHIVE, 'drivers', `${entry.driverRef}.json`);
      if (!fs.existsSync(driverPath)) return;
      const driver = JSON.parse(fs.readFileSync(driverPath, 'utf8'));
      const png = await renderPng((await import('./og-templates/og-driver.mjs')).renderDriverOg(driver), fontData);
      const out = path.join(outDir, `${entry.driverRef}.png`);
      fs.writeFileSync(out, png);
      count++;
    }));
  }
  return count;
}
```

Update `main()` to call it:

```js
async function main() {
  console.log('[og] starting OG image generation');
  const fontData = await loadFont();
  ensureDir(OUT_BASE);

  const races = await generateRaceOgs(fontData);
  console.log(`[og] generated ${races} race OG images`);

  const drivers = await generateDriverOgs(fontData);
  console.log(`[og] generated ${drivers} driver OG images`);
}
```

- [ ] **Step 19.3: Run + verify**

```bash
npm run build:og
ls public/images/og/drivers/ | head -3
```

Expected: prints driver count + at least 3 PNG files.

- [ ] **Step 19.4: Commit**

```bash
git add scripts/generate-og-images.mjs scripts/og-templates/og-driver.mjs
git commit -m "feat(seo): generate driver OG images at build time"
```

---

### Task 20: Circuit + Team OG templates

**Files:**
- Create: `scripts/og-templates/og-circuit.mjs`
- Create: `scripts/og-templates/og-team.mjs`
- Modify: `scripts/generate-og-images.mjs`

- [ ] **Step 20.1: Create `scripts/og-templates/og-circuit.mjs`**

```js
import { ogCard, ogBrand, ogTitle, ogSubtitle, COLORS } from './og-shared.mjs';

export function renderCircuitOg(circuit) {
  const yearsLabel = circuit.firstYear === circuit.lastYear
    ? `${circuit.firstYear}`
    : `${circuit.firstYear}–${circuit.lastYear}`;

  const top = {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column' },
      children: [
        {
          type: 'div',
          props: {
            style: { fontSize: 28, fontWeight: 600, color: COLORS.accent, textTransform: 'uppercase', letterSpacing: '0.08em' },
            children: 'F1 Circuit',
          },
        },
        ogTitle(circuit.name),
        ogSubtitle(`${circuit.flag || ''} ${circuit.location || ''}, ${circuit.countryName || ''}`.replace(/^,\s*/, '').trim()),
      ],
    },
  };

  const bottom = {
    type: 'div',
    props: {
      style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' },
      children: [
        {
          type: 'div',
          props: { style: { fontSize: 38, fontWeight: 700 }, children: `${circuit.raceCount} F1 races · ${yearsLabel}` },
        },
        ogBrand(),
      ],
    },
  };

  return ogCard([top, bottom]);
}
```

- [ ] **Step 20.2: Create `scripts/og-templates/og-team.mjs`**

```js
import { ogCard, ogBrand, ogTitle, ogSubtitle, COLORS } from './og-shared.mjs';

export function renderTeamOg(team) {
  const yearsLabel = team.career.firstYear === team.career.lastYear
    ? `${team.career.firstYear}`
    : `${team.career.firstYear}–${team.career.lastYear}`;

  const top = {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column' },
      children: [
        {
          type: 'div',
          props: {
            style: { fontSize: 28, fontWeight: 600, color: COLORS.accent, textTransform: 'uppercase', letterSpacing: '0.08em' },
            children: 'F1 Constructor',
          },
        },
        ogTitle(team.name),
        ogSubtitle(`${team.nationality || ''} · ${yearsLabel}`.trim()),
      ],
    },
  };

  const bottom = {
    type: 'div',
    props: {
      style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' },
      children: [
        {
          type: 'div',
          props: {
            style: { fontSize: 38, fontWeight: 700 },
            children: `${team.career.races} races · ${team.career.wins} wins · ${team.career.championships} WCC`,
          },
        },
        ogBrand(),
      ],
    },
  };

  return ogCard([top, bottom]);
}
```

- [ ] **Step 20.3: Wire both into `generate-og-images.mjs`**

Add two functions parallel to `generateDriverOgs`:

```js
async function generateCircuitOgs(fontData) {
  const indexPath = path.join(ARCHIVE, '_circuits-index.json');
  if (!fs.existsSync(indexPath)) return 0;
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const outDir = path.join(OUT_BASE, 'circuits');
  ensureDir(outDir);
  const { renderCircuitOg } = await import('./og-templates/og-circuit.mjs');
  let count = 0;
  for (let i = 0; i < index.length; i += 20) {
    const batch = index.slice(i, i + 20);
    await Promise.all(batch.map(async (entry) => {
      const p = path.join(ARCHIVE, 'circuits', `${entry.circuitRef}.json`);
      if (!fs.existsSync(p)) return;
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      const png = await renderPng(renderCircuitOg(data), fontData);
      fs.writeFileSync(path.join(outDir, `${entry.circuitRef}.png`), png);
      count++;
    }));
  }
  return count;
}

async function generateTeamOgs(fontData) {
  const indexPath = path.join(ARCHIVE, '_teams-index.json');
  if (!fs.existsSync(indexPath)) return 0;
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const outDir = path.join(OUT_BASE, 'teams');
  ensureDir(outDir);
  const { renderTeamOg } = await import('./og-templates/og-team.mjs');
  let count = 0;
  for (let i = 0; i < index.length; i += 20) {
    const batch = index.slice(i, i + 20);
    await Promise.all(batch.map(async (entry) => {
      const p = path.join(ARCHIVE, 'teams', `${entry.constructorRef}.json`);
      if (!fs.existsSync(p)) return;
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      const png = await renderPng(renderTeamOg(data), fontData);
      fs.writeFileSync(path.join(outDir, `${entry.constructorRef}.png`), png);
      count++;
    }));
  }
  return count;
}
```

Extend `main()`:

```js
const circuits = await generateCircuitOgs(fontData);
console.log(`[og] generated ${circuits} circuit OG images`);

const teams = await generateTeamOgs(fontData);
console.log(`[og] generated ${teams} team OG images`);
```

- [ ] **Step 20.4: Run + verify**

```bash
npm run build:og
ls public/images/og/circuits/ | wc -l
ls public/images/og/teams/ | wc -l
```

Expected: ~77 circuits, ~212 teams.

- [ ] **Step 20.5: Commit**

```bash
git add scripts/generate-og-images.mjs scripts/og-templates/og-circuit.mjs scripts/og-templates/og-team.mjs
git commit -m "feat(seo): generate circuit + team OG images at build time"
```

---

### Task 21: Wire `ogImage` props into detail pages

**Files:**
- Modify: `src/pages/races/[year]/[round].astro`
- Modify: `src/pages/drivers/[driverRef].astro`
- Modify: `src/pages/circuits/[circuitRef].astro`
- Modify: `src/pages/teams/[constructorRef].astro`

- [ ] **Step 21.1: Race page — set ogImage**

Open `src/pages/races/[year]/[round].astro`. After `const canonicalPath = …`, add:

```ts
const ogImage = `/images/og/races/${race.year}-${race.round}.png`;
```

In the `<BaseLayout …>` invocation, add `ogImage={ogImage}` to the props.

- [ ] **Step 21.2: Driver page — set ogImage**

Open `src/pages/drivers/[driverRef].astro`. After `const canonicalPath = …`, add:

```ts
const ogImage = `/images/og/drivers/${driver.driverRef}.png`;
```

Add `ogImage={ogImage}` to BaseLayout props.

- [ ] **Step 21.3: Circuit page — set ogImage**

Open `src/pages/circuits/[circuitRef].astro`. After `const canonicalPath = …`, add:

```ts
const ogImage = `/images/og/circuits/${circuit.circuitRef}.png`;
```

Add `ogImage={ogImage}` to BaseLayout props.

- [ ] **Step 21.4: Team page — set ogImage**

Open `src/pages/teams/[constructorRef].astro`. After `const canonicalPath = …`, add:

```ts
const ogImage = `/images/og/teams/${team.constructorRef}.png`;
```

Add `ogImage={ogImage}` to BaseLayout props.

- [ ] **Step 21.5: Verify**

```bash
curl -s http://localhost:4322/drivers/hamilton/ | grep -oE 'og:image" content="[^"]+'
```

Expected: `og:image" content="https://f1gures.app/images/og/drivers/hamilton.png`.

```bash
curl -s http://localhost:4322/races/2024/12/ | grep -oE 'og:image" content="[^"]+'
```

Expected: race-specific OG URL.

- [ ] **Step 21.6: Build + commit**

```bash
npm run build
git add src/pages/races src/pages/drivers src/pages/circuits src/pages/teams
git commit -m "feat(seo): wire per-page OG images for races, drivers, circuits, teams"
```

---

## Phase G — Off-Page Strategy Doc

### Task 22: Write `docs/seo/strategy.md`

**Files:**
- Create: `docs/seo/strategy.md`

- [ ] **Step 22.1: Create the strategy doc**

Create `docs/seo/strategy.md` with the following content (verbatim):

````markdown
# f1gures — SEO Strategy & Off-Page Playbook

This is a living playbook for off-page SEO work. The technical/on-page changes
shipped in `feat/seo-overhaul` cover what code can do; this doc covers what
needs to happen outside the codebase.

## Google Search Console setup

1. Go to https://search.google.com/search-console
2. Add a property for **`f1gures.app`** — choose "Domain property" (covers
   all subdomains and protocols). URL prefix property is fine if domain
   property fails for any reason.
3. Verify via DNS TXT record. FTP-deploy means HTML file verification is
   unreliable; the static file may not survive the next deploy. The TXT
   record persists.
4. Once verified:
   - **Sitemaps tab:** submit `https://f1gures.app/sitemap.xml` (auto-generated
     by `@astrojs/sitemap` at build time).
   - **URL Inspection tool:** submit the 5 listing pages (`/`, `/calendar/`,
     `/standings-drivers/`, `/standings-constructors/`, `/circuits/`) for
     immediate indexing. Google then discovers the rest via the sitemap.
   - **Settings → Users and permissions:** add a backup owner if appropriate.
   - **Email preferences:** turn on alerts for coverage errors, manual
     actions, and security issues.

## Initial indexing expectations

- New site, ~2,310 pages: full indexing typically takes 2–8 weeks.
- The sitemap accelerates discovery but does not guarantee inclusion.
- Listing pages index first (highest internal link count). Detail pages
  follow as Google crawls outward through the internal links shipped in
  Phase E.
- Watch the **Coverage** tab weekly. "Discovered – currently not indexed"
  is normal for the first few weeks; "Crawl anomaly" is not — investigate.

## Monitoring cadence

| Frequency | Tool | What to check |
|---|---|---|
| Weekly | GSC Coverage | Excluded pages, crawl errors. Aim for >90% indexed within 8 weeks. |
| Weekly | Rich Results Test (https://search.google.com/test/rich-results) | Spot-check one race, one driver, one circuit page after each deploy. Verify FAQ + SportsEvent + Person schemas render. |
| Monthly | GSC Performance | Filter by URL pattern (`/races/`, `/drivers/`, etc.) — track impressions + CTR by page type. |
| Per-deploy | GSC Page Experience | Confirm Core Web Vitals stay green after the `font-display: swap` fix. |

## Link building playbook

F1 is a link-rich vertical: fans share results, debate stats, and link out
constantly. Every link below is on-policy — no paid links, no spam.

### Reddit (`r/formula1`, ~5.4M members)
- Allowed: fan-built tools, original analysis, "I made this" posts.
- Forbidden: low-effort affiliate-style spam, repeated self-promotion.
- Strategy: **one quality post per week, max.** Lead with a stat — e.g.
  "Most podiums without a win, all-time" — and link the relevant page
  as supporting evidence.
- Reply organically to "Who won X race?" or "Career stats for Y?" threads
  with a direct link to the specific page. Do not reply unless your link
  actually answers the question better than alternatives.

### Twitter / X
- Tweet results within 30 minutes of the chequered flag. Format:
  > "[Winner] wins the [Race]! Full results, fastest lap and pit-stop pace
  > → f1gures.app/races/[year]/[round]/"
- Tag `@F1` for visibility. Use `#F1` and `#Formula1`.
- Pin the tweet for the first 24 hours after a race.

### Wikipedia
- F1 driver and race articles often have an "External links" section that
  cites stats sources (statsf1.com, f1.com, etc.). Where f1gures has
  accurate, comprehensive data, it qualifies as a notable fan stats site
  per WP:ELYES (and WP:ELNO does not exclude it).
- Start with high-traffic articles: Lewis Hamilton, Michael Schumacher,
  Ayrton Senna, Max Verstappen, Sebastian Vettel, current championship
  leader.
- Always disclose your conflict of interest on the talk page if you're
  the site owner. Wikipedia editors enforce this.

### F1 enthusiast communities
- **autosport.com forums** — long-form fan discussion. Answer historical
  stat queries with links.
- **f1technical.net forums** — more engineering-focused but receptive to
  data sources.
- **Large F1 Discord servers** — share in #stats / #history channels.
  Discord links are nofollow but drive traffic + rankings indirectly via
  user behaviour signals.

### Content angle for organic shares
The natural-language race summaries (Phase D) are quotable. The driver
career summaries support side-by-side comparison content. After deploy,
the strongest social hook is historical comparisons:

- "Hamilton vs Schumacher head-to-head" linking both driver pages
- "Every race winner at Monaco since 1950" linking the circuit page
- "Most championships without a fastest lap" — pure stat curiosities

These hooks travel well on Twitter and Reddit because they answer a
question someone might already be asking.

## What NOT to do

- Don't buy links, list-swap, or join PBNs. Google will catch it eventually
  and a penalty is fatal for a new site.
- Don't keyword-stuff race summaries or descriptions. Google's spam filters
  flag this and the existing data-driven summaries already include all the
  relevant keywords naturally.
- Don't submit to "F1 directories" — they are almost universally low quality
  and Google ignores or penalises them.
- Don't request indexing of the same URL repeatedly in GSC. Once is enough.

## Review schedule

Re-read this doc every 8 weeks. Update with what's working, what isn't,
and any new platform-policy changes.
````

- [ ] **Step 22.2: Commit**

```bash
git add docs/seo/strategy.md
git commit -m "docs(seo): add off-page strategy + link-building playbook"
```

---

## Phase H — Final Build + PR

### Task 23: Full production build + push + open PR

- [ ] **Step 23.1: Run a full production build**

```bash
npm run build
```

Expected: success. Note that `prebuild` will regenerate all OG images. Total time should be under 90 seconds for OG generation + ~30 seconds for Astro build.

- [ ] **Step 23.2: Spot-check the built output**

```bash
ls dist/images/og/races/ | wc -l
ls dist/images/og/drivers/ | wc -l
ls dist/images/og/circuits/ | wc -l
ls dist/images/og/teams/ | wc -l
```

Expected: ~1153 races, ~862 drivers, ~77 circuits, ~212 teams.

```bash
grep -o '"@type":"FAQPage"' dist/races/2024/12/index.html | wc -l
grep -o '"@type":"FAQPage"' dist/drivers/hamilton/index.html | wc -l
```

Expected: 1 each.

- [ ] **Step 23.3: Rebase against latest origin/main**

```bash
git fetch origin main
git rebase origin/main
```

Resolve any conflicts. If there are major conflicts, commit a merge instead — but try rebase first.

- [ ] **Step 23.4: Push the branch**

```bash
git push -u origin feat/seo-overhaul
```

- [ ] **Step 23.5: Open the PR**

```bash
gh pr create --title "feat(seo): full SEO overhaul — structured data, summaries, OG images, internal linking" --body "$(cat <<'EOF'
## Summary
- Adds FAQ + expanded SportsEvent / Person / SportsTeam JSON-LD on detail pages
- Adds ItemList JSON-LD on listing pages (drivers, constructors, calendar, circuits)
- Adds natural-language summary paragraphs on race + driver pages
- Adds internal links between race ↔ driver ↔ circuit ↔ team pages
- Generates per-page OG images at build time (Satori + resvg-js)
- Adds off-page strategy doc at `docs/seo/strategy.md`
- Spec: docs/superpowers/specs/2026-05-09-seo-overhaul-design.md
- Plan: docs/superpowers/plans/2026-05-09-seo-overhaul.md

## Test plan
- [ ] `npm run build` succeeds
- [ ] Spot-check `dist/races/2024/12/index.html` has FAQPage JSON-LD + race-summary paragraph
- [ ] Spot-check `dist/drivers/hamilton/index.html` has FAQPage JSON-LD + driver-summary paragraph
- [ ] Spot-check `dist/teams/mclaren/index.html` has memberOf SportsOrganization + ogType=website
- [ ] Verify Rich Results Test passes for one race, one driver, one circuit
- [ ] Verify per-type OG image renders correctly via `https://www.opengraph.xyz/`
- [ ] Production deploy → verify `https://f1gures.app/sitemap.xml` is reachable
- [ ] Submit sitemap to Google Search Console after merge

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

- [ ] **Step 23.6: Mark plan complete**

The plan is complete when the PR is open and CI (if any) is green.

---

## Self-Review Notes

This plan covers all five sections of the spec:
- Section 1 (structured data + meta fixes): Tasks 1, 3, 4, 5, 6, 7, 8, 9
- Section 2 (per-type OG images): Tasks 17, 18, 19, 20, 21
- Section 3 (natural-language summaries + FAQ): Tasks 3 (race FAQ), 4 (driver FAQ), 10 (race summary), 11 (driver summary)
- Section 4 (internal linking): Tasks 12, 13, 14, 15, 16
- Section 5 (off-page strategy): Task 22

**Known caveats called out inline:**
- `winnerTeam` on circuit historical winners table cannot be linked (no `winnerTeamRef` in data) — Task 14 handles this gracefully.
- The pole sitter on race pages uses `race.qualifying[0]?.driverRef`, not `race.pole` (which is a name string) — Task 12 implements this correctly.
- OG image generation is deliberately skipped in `predev` to keep dev startup fast — only runs in `prebuild`.
- The `og-default.png` fallback survives — pages that don't have a generated OG (404, listing pages) fall back to it via the existing BaseLayout default.
