# Upcoming Race Holding Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a prerendered "holding page" at `/races/<year>/<round>/` for every un-run round of the current season, so calendar cards link uniformly across past and future races.

**Architecture:** Extend `build-archive.mjs` to emit upcoming-round JSONs into `public/data/archive/races/<y>/<r>.json` and append them to `_races-index.json` with a new `completed` boolean. Refactor `RacePage.astro` into a shell + two body components (`RaceResultsBody`, `RaceUpcomingBody`); the shell branches on `race.results.length === 0`. A new tiny island (`RaceCountdown.jsx`) handles the live countdown to the next session and the TRACK/YOU timezone toggle, reusing the existing `Countdown` component, `circuitTz()` helper, and `localStorage.f1-tz` key from the home-page schedule. `CalendarScreen.jsx` becomes a stretched-link card so the whole tile is clickable.

**Tech Stack:** Astro 4 SSG, React 18 islands, Node `csv-parse` (build-time only), Satori + Resvg (build-time OG images). No new deps. No test framework in this repo — verification is `npm run dev` (http://localhost:4321/) + `preview_*` MCP tools + manual checks of generated archive JSONs.

**Spec:** [docs/superpowers/specs/2026-05-10-upcoming-race-holding-pages-design.md](../specs/2026-05-10-upcoming-race-holding-pages-design.md)

---

## File map

**Modify:**
- `scripts/build-archive.mjs` — second pass after the existing post-2024 bundle pass that emits upcoming-round JSONs and appends them to `_races-index.json` with `completed: false`. Existing completed entries get `completed: true`.
- `src/components/RacePage.astro` — becomes the shell. Hero, breadcrumb, prev/next nav stay here. Body branches: `race.results.length === 0 ? <RaceUpcomingBody /> : <RaceResultsBody />`.
- `src/pages/races/[year]/[round].astro` — title, description, OG type, JSON-LD branch on completed.
- `src/components/islands/screens/CalendarScreen.jsx` — wrap `.race-card` in a stretched-link `<a>`; drop the `result ?` conditional on the href; remove inline race-name and circuit-name links.
- `public/css/app.css` — `.race-card-link` overlay rules + hover state.
- `src/lib/shared.jsx` — bump `ARCHIVE_MAX_YEAR` from 2025 to 2026 inside the `case 'race'` block.
- `src/components/DriverPage.astro` — bump local `ARCHIVE_MAX_YEAR` constant.
- `src/components/CircuitPage.astro` — bump local `ARCHIVE_MAX_YEAR` constant.
- `scripts/og-templates/og-race.mjs` — render an "upcoming" variant when `race.results.length === 0`.
- `scripts/generate-og-images.mjs` — cache invalidation via a `.state` sidecar marker file so the PNG regenerates when the race transitions from upcoming → completed.

**Create:**
- `src/components/RaceResultsBody.astro` — extract the existing results-table + qualifying + sprint + key-links blocks from `RacePage.astro`.
- `src/components/RaceUpcomingBody.astro` — new server-rendered body: next-session panel + last-held-here panel + circuit panel.
- `src/components/islands/RaceCountdown.jsx` — new small island: live countdown ticker + TRACK/YOU toggle + client-side next-session re-evaluation.

---

## Task 1: build-archive emits upcoming-round JSONs

**Files:**
- Modify: `scripts/build-archive.mjs` — insert a new pass between the existing bundle-completed-rounds pass (ends ~line 900) and the Circuits section (starts ~line 902).

- [ ] **Step 1: Read the file and locate the insertion point**

Open `scripts/build-archive.mjs`. The existing post-2024 bundle pass ends with:

```js
if (allBundleRounds.length > 0) {
  writeFileSync(join(OUT, '_races-index.json'), JSON.stringify(racesIndex));
  console.log(`[archive] +${bundleRacesWritten} bundle race detail bundles (${bundleYears.join(', ')})`);
}

// ─── Circuits ─────────────────────────────────────────────────────────
```

Insert the new section *between* these two blocks. Do not modify either block in this step.

- [ ] **Step 2: Add the upcoming-rounds pass**

Insert the following block immediately after the `if (allBundleRounds.length > 0) { ... }` block, before the `// ─── Circuits ───` comment:

```js
// ─── Upcoming bundle rounds → holding-page archive entries ───────────────
// For rounds in post-Ergast bundles (year > 2024) that have NOT been run yet
// (no results in bundle.results) but have session timetable data populated,
// emit a holding-page archive JSON. The Astro route renders these via
// RaceUpcomingBody.astro instead of RaceResultsBody.astro.
//
// Schema differs from completed races: results/qualifying/sprint are empty
// arrays/null, sessions is populated, lastHeldHere holds the most recent
// completed race at the same circuitRef (any year), circuitFirstTime is true
// when no completed race ever exists at this circuitRef.

// Index completed races by circuitRef so we can compute lastHeldHere quickly.
// racesIndex now contains both Ergast (1950–2024) and post-2024 completed
// bundle rounds — that's everything we need.
const completedByCircuit = new Map();
for (const entry of racesIndex) {
  if (!entry.circuitRef) continue;
  const list = completedByCircuit.get(entry.circuitRef) || [];
  list.push(entry);
  completedByCircuit.set(entry.circuitRef, list);
}
for (const list of completedByCircuit.values()) {
  list.sort((a, b) => b.year - a.year || b.round - a.round); // newest first
}

// Walk every bundle year × round; emit archive JSON for rounds with no result
// but with sessions populated. Track upcoming rounds in chronological order so
// prev/next nav links work cross-bundle and cross-completion.
const allBundleCalendars = [];
for (const bYear of bundleYears) {
  const bundle = JSON.parse(readFileSync(join(DATA_DIR, `${bYear}.json`), 'utf8'));
  if (!bundle.calendar) continue;
  for (const calEntry of bundle.calendar.slice().sort((a, b) => a.round - b.round)) {
    allBundleCalendars.push({ year: bYear, round: calEntry.round, calEntry, bundle });
  }
}

let upcomingRacesWritten = 0;
for (let i = 0; i < allBundleCalendars.length; i++) {
  const { year: bYear, round, calEntry, bundle } = allBundleCalendars[i];
  // Skip rounds that already have a completed archive entry (handled above).
  const hasResult = bundle.results && bundle.results[String(round)];
  if (hasResult) continue;
  // Skip rounds with no session data — falls through to legacy /race.html redirect.
  if (!calEntry.sessions || Object.values(calEntry.sessions).every(v => !v)) continue;

  const circuitId = calEntry.circuitId;
  const ergCircuit = circuitsByRef.get(circuitId);
  const cInfo = ergCircuit
    ? countryInfo(ergCircuit.country)
    : { code: calEntry.country || '', flag: calEntry.flag || '' };

  // lastHeldHere: most recent completed race at this circuitRef, any year.
  const completedHere = completedByCircuit.get(circuitId) || [];
  let lastHeldHere = null;
  let circuitFirstTime = true;
  if (completedHere.length > 0) {
    circuitFirstTime = false;
    const newest = completedHere[0];
    try {
      const past = JSON.parse(readFileSync(
        join(OUT, 'races', String(newest.year), `${newest.round}.json`),
        'utf8'
      ));
      const podium = (past.results || [])
        .filter(r => r.position != null && r.position <= 3)
        .sort((a, b) => a.position - b.position)
        .map(r => ({
          position: r.position,
          driverRef: r.driverRef,
          driverName: r.driverName,
          constructorRef: r.constructorRef,
          constructorName: r.constructorName,
        }));
      if (podium.length > 0) {
        lastHeldHere = { year: newest.year, round: newest.round, podium };
      }
    } catch {
      // Past race file missing — treat as no lastHeldHere data, but still not first time.
      lastHeldHere = null;
    }
  }

  // prev/next: walk allBundleCalendars in order; pair with the immediate neighbours.
  // For the first upcoming round, prev points at the most recent completed (whichever
  // year). For the last, next is null.
  const prevEntry = i > 0 ? allBundleCalendars[i - 1] : null;
  const nextEntry = i < allBundleCalendars.length - 1 ? allBundleCalendars[i + 1] : null;
  const prev = prevEntry
    ? { year: prevEntry.year, round: prevEntry.round, name: prevEntry.calEntry.name }
    : null;
  const next = nextEntry
    ? { year: nextEntry.year, round: nextEntry.round, name: nextEntry.calEntry.name }
    : null;

  const raceDoc = {
    raceId: `${bYear}_${round}`,
    year: bYear,
    round,
    name: calEntry.name,
    date: calEntry.date || null,
    time: calEntry.time || null,
    url: null,
    circuit: {
      circuitRef: circuitId,
      circuitId,
      name: ergCircuit?.name || calEntry.name,
      location: ergCircuit?.location || '',
      country: cInfo.code,
      countryName: ergCircuit?.country || '',
      flag: calEntry.flag || '',
    },
    sprint: !!calEntry.sprint,
    sessions: calEntry.sessions, // { fp1, fp2, fp3, q, sprint, sprintQuali, race } | each null or { date, time }
    status: calEntry.status || 'upcoming',
    lastHeldHere,
    circuitFirstTime,
    pole: null,
    fastest: null,
    fastestLapTime: null,
    winner: null,
    results: [],
    qualifying: [],
    sprint_results: null,
    prev,
    next,
  };

  const yearDir = join(OUT, 'races', String(bYear));
  mkdirSync(yearDir, { recursive: true });
  writeFileSync(join(yearDir, `${round}.json`), JSON.stringify(raceDoc));
  racesIndex.push({
    year: bYear,
    round,
    name: calEntry.name,
    date: calEntry.date || null,
    circuitRef: circuitId,
    completed: false,
  });
  upcomingRacesWritten++;
}

if (upcomingRacesWritten > 0) {
  writeFileSync(join(OUT, '_races-index.json'), JSON.stringify(racesIndex));
  console.log(`[archive] +${upcomingRacesWritten} upcoming race holding bundles`);
}
```

- [ ] **Step 3: Backfill `completed: true` on existing index entries**

The existing index entries (Ergast + completed bundle rounds) don't have `completed`. The code in Step 2 only adds `completed: false` to upcoming entries. Add `completed: true` to every push call in earlier sections so the field is consistent.

Locate two places that push to `racesIndex`:

1. Inside the Ergast races loop (around line 700-ish — search for `racesIndex.push(`). Add `completed: true,` to the object literal.
2. Inside the post-2024 bundle completed loop (around line 893). Add `completed: true,` to that object literal.

Example: change

```js
racesIndex.push({ year: bYear, round, name: calEntry.name, date: calEntry.date || null, circuitRef: circuitId });
```

to

```js
racesIndex.push({ year: bYear, round, name: calEntry.name, date: calEntry.date || null, circuitRef: circuitId, completed: true });
```

Apply the same change in both locations. Use Read + Edit to avoid hitting the wrong push.

- [ ] **Step 4: Run the build**

```
npm run build:archive
```

Expected console output (the tail):
```
[archive] wrote ... bundle race detail bundles (2025, 2026)
[archive] +N upcoming race holding bundles
```

where N is the number of un-run rounds in 2026 (typically 18 if rounds 1–4 have run).

- [ ] **Step 5: Verify outputs**

```
node -e "const idx=require('./public/data/archive/_races-index.json'); console.log('total:', idx.length, 'completed:', idx.filter(x=>x.completed).length, 'upcoming:', idx.filter(x=>x.completed===false).length); const sample=idx.find(x=>x.completed===false); console.log('sample upcoming:', sample);"
```

Expected: `total` matches the previous count + N upcoming. `completed` matches the previous total. `upcoming` is N. The sample shows a 2026 entry with `completed: false`.

```
node -e "const r=require('./public/data/archive/races/2026/8.json'); console.log({year:r.year, round:r.round, name:r.name, results:r.results.length, sessions:Object.keys(r.sessions||{}).filter(k=>r.sessions[k]), lastHeldHere: r.lastHeldHere?.year, circuitFirstTime: r.circuitFirstTime});"
```

(Pick a round number in the un-run range. If round 8 is already completed, try 12 or 20.)

Expected: `results: 0`, `sessions` has at least 4-5 non-null entries, `lastHeldHere.year` is a previous year (2024 or 2025), `circuitFirstTime: false`.

- [ ] **Step 6: Commit**

```
git add scripts/build-archive.mjs
git commit -m "feat(archive): emit upcoming-round JSONs with sessions + lastHeldHere"
```

---

## Task 2: Split RacePage into shell + RaceResultsBody (no behavior change)

This is a pure refactor — output should be byte-identical for completed races. We do this *before* introducing the upcoming branch so any visual regression is caught against existing race pages, not new ones.

**Files:**
- Create: `src/components/RaceResultsBody.astro`
- Modify: `src/components/RacePage.astro`

- [ ] **Step 1: Create RaceResultsBody.astro**

Create `src/components/RaceResultsBody.astro` with the following content:

```astro
---
// Server-rendered body for completed races. Receives the full race prop
// (same shape as RacePage takes today). Renders results table + qualifying
// + sprint + key-links + the post-results podium-aware sections.
//
// The shell (RacePage.astro) owns the hero (race name, circuit link, date),
// breadcrumb, and prev/next nav.

interface Props {
  race: {
    year: number;
    round: number;
    name: string;
    date: string | null;
    time: string | null;
    circuit: any;
    results: Array<any>;
    qualifying: Array<any>;
    sprint: Array<any> | null;
  };
}

import { buildRaceSummary } from '../lib/buildRaceSummary.js';

const { race } = Astro.props;
const raceSummary = buildRaceSummary(race);

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
---

{raceSummary && (
  <p class="race-summary">{raceSummary}</p>
)}

{race.results.length > 0 && (
  <>
    <div class="section-head"><h2>Race Results</h2><div class="section-rule"></div></div>
    <div class="panel" style="padding: 0; overflow-x: auto;">
      <table class="data-table">
        <thead>
          <tr>
            <th class="right">Pos</th>
            <th class="right">Grid</th>
            <th>Driver</th>
            <th>Team</th>
            <th class="right">Laps</th>
            <th>Time / Status</th>
            <th class="right">Pts</th>
            <th>FL</th>
          </tr>
        </thead>
        <tbody>
          {race.results.map(r => (
            <tr style={r.constructorColor ? `border-left: 3px solid ${r.constructorColor}` : ''}>
              <td class={`right t-mono ${r.position === 1 ? 'is-win-cell' : ''}`}>{r.positionText || (r.position != null ? String(r.position) : '—')}</td>
              <td class="right t-mono">{r.grid != null ? r.grid : '—'}</td>
              <td>{r.driverRef ? <a href={`/drivers/${r.driverRef}/`}>{r.driverName}</a> : (r.driverName || '—')} {r.code && <span class="t-mono code-tag">{r.code}</span>}</td>
              <td>{r.constructorRef ? <a href={`/teams/${r.constructorRef}/`}>{r.constructorName}</a> : (r.constructorName || '—')}</td>
              <td class="right t-mono">{r.laps != null ? r.laps : '—'}</td>
              <td class="t-mono">{r.time || r.status || '—'}</td>
              <td class="right t-mono">{r.points}</td>
              <td class="t-mono">{r.fastestLapRank === 1 ? `⚡ ${r.fastestLapTime || ''}` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {keyLinks.length > 0 && (
      <div class="race-keylinks">
        <span class="t-eyebrow">Key links:</span>
        <ul>
          {keyLinks.map((l) => (
            <li>
              <span class="t-mono">{l.label}</span>{' '}
              <a href={l.href} class="inline-link">{l.text}</a>
            </li>
          ))}
        </ul>
      </div>
    )}
  </>
)}

{race.qualifying.length > 0 && (
  <>
    <div class="section-head"><h2>Qualifying</h2><div class="section-rule"></div></div>
    <div class="panel" style="padding: 0; overflow-x: auto;">
      <table class="data-table">
        <thead>
          <tr>
            <th class="right">Pos</th>
            <th>Driver</th>
            <th>Team</th>
            <th class="right">Q1</th>
            <th class="right">Q2</th>
            <th class="right">Q3</th>
          </tr>
        </thead>
        <tbody>
          {race.qualifying.map(q => (
            <tr>
              <td class={`right t-mono ${q.position === 1 ? 'is-win-cell' : ''}`}>{q.position}</td>
              <td>{q.driverRef ? <a href={`/drivers/${q.driverRef}/`}>{q.driverName}</a> : q.driverName}</td>
              <td>{q.constructorName}</td>
              <td class="right t-mono">{q.q1 || '—'}</td>
              <td class="right t-mono">{q.q2 || '—'}</td>
              <td class="right t-mono">{q.q3 || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
)}

{race.sprint && race.sprint.length > 0 && (
  <>
    <div class="section-head"><h2>Sprint</h2><div class="section-rule"></div></div>
    <div class="panel" style="padding: 0; overflow-x: auto;">
      <table class="data-table">
        <thead>
          <tr>
            <th class="right">Pos</th>
            <th class="right">Grid</th>
            <th>Driver</th>
            <th>Team</th>
            <th>Time / Status</th>
            <th class="right">Pts</th>
          </tr>
        </thead>
        <tbody>
          {race.sprint.map(s => (
            <tr>
              <td class={`right t-mono ${s.position === 1 ? 'is-win-cell' : ''}`}>{s.positionText || s.position}</td>
              <td class="right t-mono">{s.grid != null ? s.grid : '—'}</td>
              <td>{s.driverRef ? <a href={`/drivers/${s.driverRef}/`}>{s.driverName}</a> : s.driverName}</td>
              <td>{s.constructorRef ? <a href={`/teams/${s.constructorRef}/`}>{s.constructorName || s.constructorRef}</a> : '—'}</td>
              <td class="t-mono">{s.time || s.status || '—'}</td>
              <td class="right t-mono">{s.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
)}
```

This is the existing markup from `RacePage.astro` lines 136-251 (the `{raceSummary && ...}` block through the end of the Sprint table). The existing podium-tile inside the hero block stays in `RacePage.astro` (the shell) — it's part of the hero, not the body.

- [ ] **Step 2: Replace the body section in RacePage.astro with a delegate**

In `src/components/RacePage.astro`:

1. Add an import at the top of the frontmatter (after `import { buildRaceSummary }` — which can stay for now, we'll remove it next step):

```astro
import RaceResultsBody from './RaceResultsBody.astro';
```

2. Delete the `buildRaceSummary` import line and the `const raceSummary = buildRaceSummary(race);` line — both moved into RaceResultsBody.
3. Delete the `keyLinks` block and the `KeyLink` interface — also moved into RaceResultsBody.
4. Replace the body markup (everything from `{raceSummary && (` through the closing `</>` of the Sprint section, i.e. the chunk we just moved) with a single line:

```astro
<RaceResultsBody race={race} />
```

The result is that `RacePage.astro` now contains: the back-to-calendar button, the `.panel.race-hero` block, then `<RaceResultsBody race={race} />`, then the prev/next nav, then the existing `<style>` tag. Roughly 100 lines down from ~265.

- [ ] **Step 3: Run dev server and check a completed race renders identically**

```
npm run dev
```

Then open `http://localhost:4321/races/2024/1/` in a browser (or `preview_snapshot` it). Confirm:
- Hero, podium tile, results table, qualifying table, key-links — all present.
- Visual rendering matches what was there before the split.
- No console warnings/errors.

If hydration warnings appear: re-check that no React island was accidentally introduced, and that no whitespace/text-node difference snuck into the moved block.

- [ ] **Step 4: Commit**

```
git add src/components/RaceResultsBody.astro src/components/RacePage.astro
git commit -m "refactor(race): extract RaceResultsBody from RacePage shell"
```

---

## Task 3: Branch RacePage shell on completed flag (placeholder body)

We add the branch *before* the real `RaceUpcomingBody` exists, so we can verify upcoming JSONs route correctly. The placeholder body is a simple "Race weekend coming up" panel — replaced in Task 4.

**Files:**
- Modify: `src/components/RacePage.astro`

- [ ] **Step 1: Add the branch to the shell**

In `src/components/RacePage.astro`, replace the line:

```astro
<RaceResultsBody race={race} />
```

with:

```astro
{race.results.length > 0
  ? <RaceResultsBody race={race} />
  : <div class="panel" style="padding: 20px;">
      <p>Race weekend coming up — full schedule and circuit info loading.</p>
    </div>}
```

Also remove the existing `{podium.length > 0 && (...)}` block from inside the hero (lines 118-132 originally) — wrap it the same way:

```astro
{race.results.length > 0 && podium.length > 0 && (
  <div class="race-hero-podium">
    {podium.map(p => (
      <div class={`podium-step podium-${p.position}`}>
        <div class="podium-pos">P{p.position}</div>
        <div class="podium-name">
          {p.driverRef ? (
            <a href={`/drivers/${p.driverRef}/`}>{p.driverName}</a>
          ) : p.driverName}
        </div>
        <div class="podium-team">{p.constructorName}</div>
      </div>
    ))}
  </div>
)}
```

The `const podium = race.results.filter(...)` line at the top of the frontmatter still works for both modes (empty `results` → empty `podium`).

- [ ] **Step 2: Verify a completed race still renders results**

`http://localhost:4321/races/2024/1/` — should look unchanged from Task 2.

- [ ] **Step 3: Verify an upcoming race renders the placeholder**

Pick an un-run 2026 round (e.g. round 8 or 12 — whichever is unrun in your local data). Visit `http://localhost:4321/races/2026/8/`.

Expected: hero shows ROUND 8 · 2026 + race name + circuit link + date. Body shows the placeholder panel "Race weekend coming up...". Prev/next nav at the bottom links to neighbouring rounds.

If the page 404s: the upcoming JSON wasn't generated. Re-run `npm run build:archive` and restart dev server (Astro caches getStaticPaths between dev runs).

- [ ] **Step 4: Commit**

```
git add src/components/RacePage.astro
git commit -m "feat(race): branch shell on completed flag, placeholder upcoming body"
```

---

## Task 4: Build RaceUpcomingBody — hero left-empty + sprint badge

This task only handles the hero's right side and the sprint-badge addition. The body content (next-session, last-podium, circuit panel) comes in Tasks 5–7.

**Files:**
- Modify: `src/components/RacePage.astro`

- [ ] **Step 1: Add sprint badge to the hero stats row**

In the existing `.race-hero-stats` div in `RacePage.astro` frontmatter/markup, append a sprint pill conditionally:

```astro
<div class="race-hero-stats">
  {race.circuit && (
    <a class="t-mono race-hero-circuit-link" href={`/circuits/${race.circuit.circuitRef}/`}>
      {race.circuit.flag} {race.circuit.name}
    </a>
  )}
  {race.circuit && race.date && <span class="sep">·</span>}
  {race.date && <span class="t-mono">{race.date}</span>}
  {race.sprint === true && <span class="sep">·</span>}
  {race.sprint === true && <span class="pill pill-sprint">⚡ Sprint</span>}
</div>
```

Note: `race.sprint` for completed races is the array of sprint results (truthy when present). For upcoming races we set it to a literal boolean (`!!calEntry.sprint`). The `=== true` guard ensures the badge only appears for upcoming sprint weekends — completed sprint weekends already have the existing `<h2>Sprint</h2>` table, so showing the pill again would duplicate. (Optional: also show on completed if you want, but YAGNI for now.)

- [ ] **Step 2: Add `.pill-sprint` style** (if not present)

In the existing `<style>` block of `RacePage.astro`, add:

```css
.pill-sprint {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 999px;
  background: var(--accent);
  color: var(--bg-1);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
```

If `.pill-sprint` already exists in `public/css/app.css` (search for `pill-sprint`), skip this step.

- [ ] **Step 3: Verify**

Visit `http://localhost:4321/races/2026/5/` (Canadian GP — sprint weekend). Hero should show the ⚡ Sprint pill. A non-sprint round (e.g. `/races/2026/3/`) should not.

- [ ] **Step 4: Commit**

```
git add src/components/RacePage.astro
git commit -m "feat(race): show sprint pill in hero for upcoming sprint weekends"
```

---

## Task 5: RaceUpcomingBody — next-session panel (server-rendered timetable, no countdown yet)

We build the static SSR timetable first. The countdown island lands in Task 6 to drive it.

**Files:**
- Create: `src/components/RaceUpcomingBody.astro`
- Modify: `src/components/RacePage.astro`

- [ ] **Step 1: Create RaceUpcomingBody.astro skeleton with the next-session panel**

```astro
---
// Server-rendered body for upcoming/un-run races. Receives the holding-page
// race prop emitted by build-archive.mjs (results: [], sessions populated,
// lastHeldHere optional, circuitFirstTime optional). Renders next-session
// panel + last-held-here panel + circuit panel.
//
// The shell (RacePage.astro) owns the hero, breadcrumb, prev/next nav.

interface Session { date: string; time: string }
interface RaceProp {
  year: number;
  round: number;
  name: string;
  circuit: { circuitRef: string; circuitId?: string; name: string; flag: string; location: string; countryName: string };
  sessions: Record<string, Session | null>;
  sprint: boolean;
  lastHeldHere: { year: number; round: number; podium: any[] } | null;
  circuitFirstTime: boolean;
}

interface Props { race: RaceProp }

const { race } = Astro.props;

// Build an ordered list of sessions for rendering. Keys come from the bundle
// shape: fp1, fp2, fp3, q, sprintQuali, sprint, race. Each entry's iso UTC
// is `<date>T<time>` where time already ends in 'Z' (per the bundle format).
const SESSION_LABELS: Record<string, string> = {
  fp1:         'Practice 1',
  fp2:         'Practice 2',
  fp3:         'Practice 3',
  sprintQuali: 'Sprint Qualifying',
  sprint:      'Sprint',
  q:           'Qualifying',
  race:        'Race',
};

const SESSION_KEYS_ORDER = ['fp1', 'fp2', 'fp3', 'sprintQuali', 'sprint', 'q', 'race'];

const sessionRows = SESSION_KEYS_ORDER
  .map(key => {
    const s = race.sessions?.[key];
    if (!s || !s.date || !s.time) return null;
    const iso = `${s.date}T${s.time}`; // time already includes 'Z'
    return { key, label: SESSION_LABELS[key], iso, date: s.date, time: s.time };
  })
  .filter(Boolean) as Array<{ key: string; label: string; iso: string; date: string; time: string }>;

// Sort by ISO ascending (ensures FP1 → race even if bundle ordering ever drifts).
sessionRows.sort((a, b) => a.iso.localeCompare(b.iso));

// Build-time "next session" pick — first session with start >= now. Hydration
// will re-pick client-side once the page loads, but this gives us a sensible
// default for no-JS visitors.
const buildNow = new Date().toISOString();
const nextIdx = sessionRows.findIndex(r => r.iso >= buildNow);
const initialNextKey = nextIdx >= 0 ? sessionRows[nextIdx].key : null;
---

<div class="race-upcoming-grid">
  <div class="panel race-upcoming-next">
    <div class="t-eyebrow">Next session</div>
    <race-countdown
      data-circuit-id={race.circuit.circuitId || race.circuit.circuitRef}
      data-initial-next-key={initialNextKey || ''}
    >
      <div class="next-session-headline">
        <span class="next-session-label" data-next-label>
          {initialNextKey ? SESSION_LABELS[initialNextKey] : 'Race weekend complete'}
        </span>
        <span class="next-session-countdown" data-next-countdown>—</span>
      </div>
      <div class="tz-toggle" role="tablist" aria-label="Time zone">
        <button type="button" class="tz-btn is-active" data-tz="track" role="tab" aria-selected="true">Track</button>
        <button type="button" class="tz-btn" data-tz="user" role="tab" aria-selected="false">You</button>
      </div>
      <table class="session-table">
        <tbody>
          {sessionRows.map(row => (
            <tr
              class={row.key === initialNextKey ? 'is-next' : ''}
              data-session-key={row.key}
              data-session-iso={row.iso}
            >
              <td class="session-label">{row.label}</td>
              <td class="session-day t-mono" data-session-day>—</td>
              <td class="session-time t-mono" data-session-time>—</td>
            </tr>
          ))}
        </tbody>
      </table>
    </race-countdown>
  </div>
</div>
```

The `<race-countdown>` element is a custom-element wrapper — the React island in Task 6 will mount onto it. Until then, the visible text shows `—` for day/time and the next-session label shows the SSR pick. Acceptable interim state.

- [ ] **Step 2: Wire RaceUpcomingBody into RacePage shell**

In `src/components/RacePage.astro`, replace the placeholder block from Task 3:

```astro
{race.results.length > 0
  ? <RaceResultsBody race={race} />
  : <div class="panel" style="padding: 20px;">
      <p>Race weekend coming up — full schedule and circuit info loading.</p>
    </div>}
```

with:

```astro
{race.results.length > 0
  ? <RaceResultsBody race={race} />
  : <RaceUpcomingBody race={race} />}
```

Add the import in the frontmatter alongside the existing `RaceResultsBody` import:

```astro
import RaceResultsBody from './RaceResultsBody.astro';
import RaceUpcomingBody from './RaceUpcomingBody.astro';
```

- [ ] **Step 3: Add baseline styles for the next-session panel**

In the existing `<style>` block at the bottom of `src/components/RacePage.astro`, append:

```css
.race-upcoming-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-top: 20px;
}

.race-upcoming-next { padding: 20px; }
.next-session-headline {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 6px;
  margin-bottom: 16px;
}
.next-session-label {
  font-size: 14px;
  color: var(--fg-3);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}
.next-session-countdown {
  font-family: var(--f-display);
  font-weight: 800;
  font-size: 32px;
  line-height: 1.1;
  color: var(--fg-1);
}

.tz-toggle {
  display: inline-flex;
  border: 1px solid var(--line-1);
  border-radius: 999px;
  padding: 2px;
  background: var(--bg-2);
  margin-bottom: 16px;
}
.tz-btn {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--fg-3);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 4px 12px;
  border-radius: 999px;
  cursor: pointer;
}
.tz-btn.is-active {
  background: var(--bg-1);
  color: var(--fg-1);
  box-shadow: 0 0 0 1px var(--line-1);
}

.session-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.session-table td {
  padding: 8px 0;
  border-bottom: 1px solid var(--line-1);
}
.session-table tr:last-child td { border-bottom: 0; }
.session-table .session-label { color: var(--fg-2); }
.session-table .session-day { color: var(--fg-3); width: 96px; }
.session-table .session-time { text-align: right; width: 90px; }
.session-table tr.is-next .session-label,
.session-table tr.is-next .session-time {
  color: var(--accent);
  font-weight: 700;
}
.session-table tr.is-next td { border-left: 3px solid var(--accent); padding-left: 8px; }
.session-table tr.is-next td:not(:first-child) { border-left: 0; padding-left: 0; }

@media (max-width: 720px) {
  .race-upcoming-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 4: Verify SSR markup**

Visit `http://localhost:4321/races/2026/5/`. Expected:
- Hero shows ROUND 5 · 2026 + Canadian GP + circuit link + date + ⚡ Sprint pill.
- Below the hero: a panel with "Next session" eyebrow, the build-time-picked session label (likely "Race" if you're days away), table rows for FP1, SQ, Sprint, Q, Race.
- Day/time columns show `—` (not yet populated by JS).
- Toggle pill shows TRACK selected.
- One row has the `is-next` class (left accent + bolded text). On non-sprint rounds: FP1, FP2, FP3, Q, Race rows. On sprint rounds: FP1, SQ, Sprint, Q, Race rows.

- [ ] **Step 5: Commit**

```
git add src/components/RaceUpcomingBody.astro src/components/RacePage.astro
git commit -m "feat(race): upcoming body skeleton with next-session timetable SSR"
```

---

## Task 6: RaceCountdown island — countdown ticker, TRACK/YOU toggle, next-session re-eval

**Files:**
- Create: `src/components/islands/RaceCountdown.jsx`
- Modify: `src/components/RaceUpcomingBody.astro` (mount the island).

- [ ] **Step 1: Create the island**

Create `src/components/islands/RaceCountdown.jsx`:

```jsx
// Hydrates the <race-countdown> element from RaceUpcomingBody.astro:
// - Ticks the countdown to the next non-passed session
// - Re-evaluates "next session" on hydration (SSR pick may be stale)
// - Drives TRACK/YOU timezone toggle (persists to localStorage.f1-tz, same
//   key the home-page schedule uses)
// - Formats day-of-week + HH:MM in the chosen zone via Intl.DateTimeFormat
//
// Reads `data-circuit-id` from the wrapper element to pick the circuit's
// IANA timezone via circuitTz() from shared.jsx.

import { useEffect, useMemo, useRef, useState } from 'react';
import { circuitTz } from '../../lib/shared.jsx';

const SESSION_LABELS = {
  fp1: 'Practice 1',
  fp2: 'Practice 2',
  fp3: 'Practice 3',
  sprintQuali: 'Sprint Qualifying',
  sprint: 'Sprint',
  q: 'Qualifying',
  race: 'Race',
};

function readSavedTz() {
  try {
    const v = typeof localStorage !== 'undefined' && localStorage.getItem('f1-tz');
    return v === 'user' || v === 'track' ? v : 'track';
  } catch { return 'track'; }
}

function formatDay(iso, zone) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'short' }).format(new Date(iso));
}
function formatTime(iso, zone) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

function formatCountdown(targetIso) {
  const diff = Math.max(0, new Date(targetIso).getTime() - Date.now());
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `in ${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `in ${hours}h ${mins}m`;
  if (mins > 0) return `in ${mins}m`;
  return 'live now';
}

export default function RaceCountdown({ rootSelector = 'race-countdown' }) {
  const [tz, setTz] = useState(readSavedTz);
  const [now, setNow] = useState(() => Date.now());
  const rootRef = useRef(null);

  // Find our wrapper element — only one per page, addressed by tag.
  useEffect(() => {
    rootRef.current = document.querySelector(rootSelector);
  }, [rootSelector]);

  // Tick.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Persist timezone.
  useEffect(() => {
    try { localStorage.setItem('f1-tz', tz); } catch { /* no-op */ }
  }, [tz]);

  const root = rootRef.current;
  const circuitId = root?.getAttribute('data-circuit-id') || '';
  const trackZone = circuitTz(circuitId);
  const userZone = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
  })();
  const zone = tz === 'user' ? userZone : trackZone;

  // Read session rows from DOM (data-session-iso attributes).
  const rows = useMemo(() => {
    if (!root) return [];
    return Array.from(root.querySelectorAll('[data-session-iso]')).map(tr => ({
      el: tr,
      key: tr.getAttribute('data-session-key'),
      iso: tr.getAttribute('data-session-iso'),
      dayCell: tr.querySelector('[data-session-day]'),
      timeCell: tr.querySelector('[data-session-time]'),
    }));
  }, [root]);

  // Pick next session based on current time.
  const nextRow = useMemo(() => {
    return rows.find(r => new Date(r.iso).getTime() > now) || null;
  }, [rows, now]);

  // Apply DOM updates: day/time in the chosen zone, is-next class on the right row,
  // headline label + countdown.
  useEffect(() => {
    if (!root) return;
    for (const r of rows) {
      if (r.dayCell) r.dayCell.textContent = formatDay(r.iso, zone);
      if (r.timeCell) r.timeCell.textContent = formatTime(r.iso, zone);
      if (r.el.classList.contains('is-next') !== (r === nextRow)) {
        r.el.classList.toggle('is-next', r === nextRow);
      }
    }
    const labelEl = root.querySelector('[data-next-label]');
    const countEl = root.querySelector('[data-next-countdown]');
    if (labelEl) labelEl.textContent = nextRow ? SESSION_LABELS[nextRow.key] : 'Race weekend complete';
    if (countEl) countEl.textContent = nextRow ? formatCountdown(nextRow.iso) : '';
  }, [root, rows, nextRow, zone]);

  // Sync toggle button visual state.
  useEffect(() => {
    if (!root) return;
    for (const btn of root.querySelectorAll('.tz-btn')) {
      const isActive = btn.getAttribute('data-tz') === tz;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    }
  }, [root, tz]);

  // Wire toggle clicks.
  useEffect(() => {
    if (!root) return;
    function onClick(e) {
      const btn = e.target.closest('.tz-btn');
      if (!btn) return;
      const v = btn.getAttribute('data-tz');
      if (v === 'user' || v === 'track') setTz(v);
    }
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [root]);

  // Cross-tab sync (home page may toggle in another tab).
  useEffect(() => {
    function onStorage(e) {
      if (e.key === 'f1-tz' && (e.newValue === 'user' || e.newValue === 'track')) setTz(e.newValue);
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return null; // The island manipulates the SSR DOM, doesn't render its own tree.
}
```

- [ ] **Step 2: Mount the island in RaceUpcomingBody.astro**

At the top of the frontmatter in `src/components/RaceUpcomingBody.astro`, add the import:

```astro
import RaceCountdownIsland from './islands/RaceCountdown.jsx';
```

(Path is relative: `RaceUpcomingBody.astro` is at `src/components/`, the island at `src/components/islands/`.)

At the very bottom of `RaceUpcomingBody.astro`, after the `</div>` that closes `.race-upcoming-grid` (and before any other top-level elements added by later tasks), append:

```astro
<RaceCountdownIsland client:load />
```

Astro will hydrate the island in-place. The component returns `null` (nothing visible) but its `useEffect` hooks find the SSR-rendered `<race-countdown>` element via `document.querySelector` and decorate it. Pattern: SSR renders the full markup; island decorates and ticks.

- [ ] **Step 3: Verify hydration**

`http://localhost:4321/races/2026/5/`. Expected after hydration:
- Day-of-week column populates (e.g. "Fri", "Sat", "Sun").
- Time column populates (e.g. "16:30", "20:30", "20:00").
- Next-session headline shows "Race in 6d 4h 22m" (or whichever next session — ticks every second).
- Toggle: click "You" → times shift to your local zone, day-of-week may change for sessions that cross midnight, `localStorage.f1-tz` becomes `'user'` (verify via devtools).
- Refresh the page: the toggle remembers "you".
- Open `/` in another tab, toggle to "Track": when you return to the race page, the storage event fires and the race-countdown table swaps to track time.

Use `preview_eval` to confirm `localStorage.getItem('f1-tz')` returns `"user"` after toggling.

- [ ] **Step 4: Commit**

```
git add src/components/islands/RaceCountdown.jsx src/components/RaceUpcomingBody.astro
git commit -m "feat(race): RaceCountdown island — live ticker + TRACK/YOU toggle"
```

---

## Task 7: RaceUpcomingBody — last-held-here panel

**Files:**
- Modify: `src/components/RaceUpcomingBody.astro`

- [ ] **Step 1: Add the last-held-here panel inside `.race-upcoming-grid`**

In `src/components/RaceUpcomingBody.astro`, after the closing `</div>` of `.panel.race-upcoming-next` and before the closing `</div>` of `.race-upcoming-grid`, add:

```astro
<div class="panel race-upcoming-history">
  {race.lastHeldHere && race.lastHeldHere.podium.length > 0 ? (
    <>
      <div class="t-eyebrow">Last held here — {race.lastHeldHere.year}</div>
      <div class="race-upcoming-podium">
        {race.lastHeldHere.podium.map(p => (
          <div class={`podium-step podium-${p.position}`}>
            <div class="podium-pos">P{p.position}</div>
            <div class="podium-name">
              {p.driverRef ? <a href={`/drivers/${p.driverRef}/`}>{p.driverName}</a> : p.driverName}
            </div>
            <div class="podium-team">
              {p.constructorRef ? <a href={`/teams/${p.constructorRef}/`}>{p.constructorName}</a> : p.constructorName}
            </div>
          </div>
        ))}
      </div>
      <a class="inline-link race-upcoming-history-link" href={`/races/${race.lastHeldHere.year}/${race.lastHeldHere.round}/`}>
        → {race.lastHeldHere.year} {race.name}
      </a>
    </>
  ) : race.circuitFirstTime ? (
    <>
      <div class="t-eyebrow">First time at this venue</div>
      <p class="race-upcoming-firsttime">
        {race.circuit.name} hosts a Formula 1 race for the first time. Located in {race.circuit.location ? `${race.circuit.location}, ` : ''}{race.circuit.countryName}.
      </p>
      <a class="inline-link" href={`/circuits/${race.circuit.circuitRef}/`}>
        → Circuit page
      </a>
    </>
  ) : (
    <>
      <div class="t-eyebrow">No prior data</div>
      <p>No previous results available for this venue.</p>
    </>
  )}
</div>
```

- [ ] **Step 2: Add styles**

In `src/components/RacePage.astro`'s `<style>` block (where the other upcoming styles live from Task 5), append:

```css
.race-upcoming-history { padding: 20px; }
.race-upcoming-podium {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  margin-bottom: 16px;
}
.race-upcoming-podium .podium-step {
  border-left: 3px solid var(--line-1);
  padding: 4px 12px;
}
.race-upcoming-podium .podium-step .podium-pos {
  font-family: var(--f-display);
  font-weight: 800;
  font-size: 16px;
}
.race-upcoming-podium .podium-step .podium-name {
  font-weight: 600;
  font-size: 14px;
}
.race-upcoming-podium .podium-step .podium-name a {
  color: inherit;
  text-decoration: none;
  border-bottom: 1px dotted var(--line-2);
}
.race-upcoming-podium .podium-step .podium-team {
  font-size: 12px;
  color: var(--fg-3);
}
.race-upcoming-podium .podium-step .podium-team a {
  color: inherit;
  text-decoration: none;
  border-bottom: 1px dotted var(--line-2);
}
.race-upcoming-podium .podium-step.podium-1 { border-left-color: var(--accent); }
.race-upcoming-podium .podium-step.podium-2 { border-left-color: var(--fg-2); }
.race-upcoming-podium .podium-step.podium-3 { border-left-color: var(--fg-3); }
.race-upcoming-history-link {
  display: inline-block;
  margin-top: 6px;
  font-size: 13px;
}
.race-upcoming-firsttime {
  margin: 12px 0 16px;
  color: var(--fg-2);
  font-size: 14px;
  line-height: 1.5;
}
```

- [ ] **Step 3: Verify**

`http://localhost:4321/races/2026/5/` (Canadian GP, has prior history). Right column shows "Last held here — 2025" with podium and link to last year's race.

`http://localhost:4321/races/2026/<some-round-with-no-prior>/` — if any 2026 round has `circuitFirstTime: true`, expect "First time at this venue". (For 2026 the only candidate is Madrid if it's on the calendar; otherwise you can stub `circuitFirstTime: true` in a JSON manually to test, then revert.)

- [ ] **Step 4: Commit**

```
git add src/components/RaceUpcomingBody.astro src/components/RacePage.astro
git commit -m "feat(race): last-held-here panel with podium + first-time fallback"
```

---

## Task 8: RaceUpcomingBody — circuit panel

**Files:**
- Modify: `src/components/RaceUpcomingBody.astro`

- [ ] **Step 1: Add the circuit panel below the two-column grid**

In `src/components/RaceUpcomingBody.astro`, after the closing `</div>` of `.race-upcoming-grid`, append (still inside the outer wrapper if any, or at the top level):

```astro
<div class="panel race-upcoming-circuit">
  <div class="section-head"><h2>Circuit</h2><div class="section-rule"></div></div>
  <div class="race-upcoming-circuit-body">
    <div class="race-upcoming-circuit-map">
      <img class="circuit-map-light" src={`/images/circuits/black-outline/${race.circuit.circuitId || race.circuit.circuitRef}.svg`} alt={`${race.circuit.name} layout`} />
      <img class="circuit-map-dark" src={`/images/circuits/white-outline/${race.circuit.circuitId || race.circuit.circuitRef}.svg`} alt={`${race.circuit.name} layout`} />
    </div>
    <div class="race-upcoming-circuit-meta">
      <div class="meta-row"><span class="meta-label">Country</span><span class="meta-value">{race.circuit.flag} {race.circuit.countryName}</span></div>
      {race.circuit.location && (
        <div class="meta-row"><span class="meta-label">Location</span><span class="meta-value">{race.circuit.location}</span></div>
      )}
      <a class="inline-link race-upcoming-circuit-link" href={`/circuits/${race.circuit.circuitRef}/`}>
        → Full circuit page
      </a>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add styles**

In `src/components/RacePage.astro`'s `<style>` block, append:

```css
.race-upcoming-circuit { padding: 20px; margin-top: 20px; }
.race-upcoming-circuit-body {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 24px;
  align-items: center;
}
.race-upcoming-circuit-map img {
  width: 100%;
  height: auto;
  display: block;
}
.race-upcoming-circuit-map .circuit-map-dark { display: none; }
:root:not(.light) .race-upcoming-circuit-map .circuit-map-light { display: none; }
:root:not(.light) .race-upcoming-circuit-map .circuit-map-dark { display: block; }
.race-upcoming-circuit-meta { display: flex; flex-direction: column; gap: 12px; }
.race-upcoming-circuit-meta .meta-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.race-upcoming-circuit-meta .meta-label {
  font-size: 11px;
  color: var(--fg-3);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.race-upcoming-circuit-meta .meta-value {
  font-weight: 600;
  font-size: 15px;
}
.race-upcoming-circuit-meta .race-upcoming-circuit-link { margin-top: 8px; font-size: 13px; }

@media (max-width: 720px) {
  .race-upcoming-circuit-body { grid-template-columns: 1fr; }
}
```

Note: the SVG show/hide rules above mirror what `CircuitPage.astro` does — light theme shows black-outline, dark theme shows white-outline. Verify the existing `CircuitPage.astro` patterns and adjust class names if they differ.

- [ ] **Step 3: Verify**

`http://localhost:4321/races/2026/5/`. Below the two-column grid, the circuit panel shows the SVG map (black on light, white on dark — toggle theme to verify), country + flag + location, and a link to the full circuit page.

If the SVG file doesn't exist (some `circuitRef`s diverge from SVG basenames, see `SVG_FOR_REF` in `CircuitPage.astro`), reuse that lookup map. Add the same `SVG_FOR_REF` import or duplicate the map in `RaceUpcomingBody.astro`.

To check: open `src/components/CircuitPage.astro`, find `SVG_FOR_REF`. If it's exported from somewhere (or worth extracting), use it. Otherwise duplicate the map at the top of `RaceUpcomingBody.astro` and use `SVG_FOR_REF[circuitRef] ?? circuitRef` in the SVG src URLs.

- [ ] **Step 4: Commit**

```
git add src/components/RaceUpcomingBody.astro src/components/RacePage.astro
git commit -m "feat(race): circuit panel on upcoming race holding pages"
```

---

## Task 9: Branch route SEO/JSON-LD on completed flag

**Files:**
- Modify: `src/pages/races/[year]/[round].astro`

- [ ] **Step 1: Branch title and description**

In `src/pages/races/[year]/[round].astro`, replace the `const title` and `const description` lines with:

```astro
const completed = race.results.length > 0;
const winnerName = completed ? race.results.find(r => r.position === 1)?.driverName || null : null;

let title: string;
let description: string;

if (completed) {
  title = `${race.name} ${race.year}${winnerName ? ` — ${winnerName} won` : ''} | f1gures`;
  description = `${race.name} ${race.year} race results from ${race.circuit?.name || 'the circuit'}. Full grid, finishing order, qualifying times${race.sprint ? ', sprint results' : ''}, points, and pit-stop pace.`;
} else {
  // Build a "FP1, qualifying, sprint and the race"-style sentence from non-null sessions.
  const SESSION_NAMES: Record<string, string> = {
    fp1: 'FP1', fp2: 'FP2', fp3: 'FP3', sprintQuali: 'sprint qualifying', sprint: 'sprint', q: 'qualifying', race: 'the race',
  };
  const sessionsList = Object.entries(race.sessions || {})
    .filter(([_, v]) => v && v.date)
    .map(([k]) => SESSION_NAMES[k])
    .filter(Boolean)
    .join(', ');
  title = `${race.name} ${race.year} — Round ${race.round} schedule, sessions & circuit | f1gures`;
  description = `${race.name} ${race.year}, Round ${race.round}. Race weekend at ${race.circuit?.name || 'the circuit'}. Session times for ${sessionsList || 'the race weekend'}.`;
}
```

The existing `const completed = race.results.length > 0;` further down the file should be removed (it's been moved up here). Same for `const winner = ...`, `const second`, `const third` — they only matter for completed races; relocate them inside the `if (completed)` block of the JSON-LD construction below.

- [ ] **Step 2: Branch ogType**

Find the existing line:

```astro
<BaseLayout {title} {description} {canonicalPath} {ogImage} ogType="article" ...
```

Replace `ogType="article"` with `ogType={completed ? 'article' : 'event'}`.

For `publishedTime`: only pass when `completed`. Change the `publishedTime={race.date || undefined}` attribute to `publishedTime={completed ? (race.date || undefined) : undefined}`.

- [ ] **Step 3: Add `eventStatus` and `subEvent[]` for upcoming races**

Locate the existing `sportsEvent` object construction. Augment it:

```astro
const sportsEvent: any = {
  '@context': 'https://schema.org',
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

if (completed && winnerRow?.driverName) {
  // existing winner/performer logic — wrap inside the existing if-block
  sportsEvent.winner = { '@type': 'Person', name: winnerRow.driverName };
  const performers = [winnerRow, secondRow, thirdRow].filter(p => p?.driverName).map(p => ({
    '@type': 'Person',
    name: p!.driverName,
  }));
  if (performers.length > 0) sportsEvent.performer = performers;
}

if (!completed) {
  sportsEvent.eventStatus = 'https://schema.org/EventScheduled';
  // sub-events from session timetable
  const SESSION_NAMES: Record<string, string> = {
    fp1: 'Practice 1', fp2: 'Practice 2', fp3: 'Practice 3',
    sprintQuali: 'Sprint Qualifying', sprint: 'Sprint', q: 'Qualifying', race: 'Race',
  };
  const subEvents: any[] = [];
  for (const [key, val] of Object.entries(race.sessions || {})) {
    if (!val || !val.date || !val.time) continue;
    subEvents.push({
      '@type': 'SportsEvent',
      name: `${race.name} ${race.year} — ${SESSION_NAMES[key] || key}`,
      startDate: `${val.date}T${val.time}`,
      sport: 'Formula 1',
    });
  }
  if (subEvents.length > 0) sportsEvent.subEvent = subEvents;
}
```

Replace `winner`/`second`/`third` references with locally-scoped `winnerRow`/`secondRow`/`thirdRow` derived inside the `if (completed)` guard. Adjust to your existing variable names — the key is that none of these should be referenced in the upcoming branch.

- [ ] **Step 4: Skip FAQPage on upcoming**

Locate the `if (completed) { ... faqEntities ... }` block. Confirm it's already gated by `completed`. If it isn't, wrap it. Don't add speculative FAQs for upcoming races.

- [ ] **Step 5: Verify**

Visit `http://localhost:4321/races/2026/5/` and view source. Expect:
- `<title>Canadian GP 2026 — Round 5 schedule, sessions & circuit | f1gures</title>` (or similar — based on the actual race name).
- `<meta property="og:type" content="event">`.
- One `<script type="application/ld+json">` containing a `SportsEvent` with `eventStatus: "https://schema.org/EventScheduled"` and a `subEvent` array of 5–6 sessions.
- No FAQPage entry.

For `/races/2024/1/`: title still ends with " — Verstappen won | f1gures", JSON-LD has `winner` + `performer` + the FAQPage @graph entry.

- [ ] **Step 6: Commit**

```
git add src/pages/races/[year]/[round].astro
git commit -m "feat(seo): scheduled SportsEvent + subEvents for upcoming races"
```

---

## Task 10: Bump ARCHIVE_MAX_YEAR in three places

**Files:**
- Modify: `src/lib/shared.jsx`
- Modify: `src/components/DriverPage.astro`
- Modify: `src/components/CircuitPage.astro`

- [ ] **Step 1: shared.jsx**

In `src/lib/shared.jsx`, line ~23, change:

```jsx
const ARCHIVE_MAX_YEAR = 2025;
```

to:

```jsx
const ARCHIVE_MAX_YEAR = 2026;
```

The surrounding comment block already explains the gate; update the year reference in the comment too:

```jsx
// /races/<y>/<r>/ pages exist for Ergast (1950–2024) + hand-curated bundles
// (2025 full, 2026 completed AND upcoming rounds via holding pages emitted by
// build-archive.mjs). All entries land in _races-index.json. Future years
// without bundles still fall through to /race.html → /calendar/.
```

- [ ] **Step 2: DriverPage.astro**

In `src/components/DriverPage.astro`, line ~108, change `const ARCHIVE_MAX_YEAR = 2025;` to `const ARCHIVE_MAX_YEAR = 2026;`. Update the surrounding comment to mention upcoming pages exist now.

- [ ] **Step 3: CircuitPage.astro**

Same change in `src/components/CircuitPage.astro`, line ~46.

- [ ] **Step 4: Verify**

`http://localhost:4321/calendar/` — view source, search for `2026/8` (or any upcoming round number). The card link href should now point at `/races/2026/8/` directly (currently passes through `/race.html`).

`http://localhost:4321/circuits/villeneuve/` — the upcoming-race entry in the circuit's race history should also link to `/races/2026/5/` directly.

- [ ] **Step 5: Commit**

```
git add src/lib/shared.jsx src/components/DriverPage.astro src/components/CircuitPage.astro
git commit -m "chore: bump ARCHIVE_MAX_YEAR to 2026 — holding pages now exist"
```

---

## Task 11: Calendar card stretched-link + uniform clickability

**Files:**
- Modify: `src/components/islands/screens/CalendarScreen.jsx`
- Modify: `public/css/app.css`

- [ ] **Step 1: Update CalendarScreen card markup**

In `src/components/islands/screens/CalendarScreen.jsx`, replace the contents of the `cal.map` block. Current shape (paraphrased):

```jsx
{cal.map(race => {
  const circuit = F.circuits[race.circuit] || { name: race.circuit };
  const result = F.results[race.round];
  const winner = result ? F.driverById(result.order[0]) : null;
  const fastest = result ? F.driverById(result.fastest) : null;
  const raceHref = result ? urlFor({ name: 'race', year: F.seasonYear, round: race.round }) : undefined;
  const circuitHref = race.circuit ? urlFor({ name: 'circuit', id: race.circuit, ref: race.circuit }) : undefined;
  return (
    <div key={race.round} className={`race-card is-${race.status}`}>
      <div className="race-card-head">...</div>
      <div>...race name link, circuit link...</div>
      <div className="race-card-foot">... mini rows ...</div>
    </div>
  );
})}
```

Replace with:

```jsx
{cal.map(race => {
  const circuit = F.circuits[race.circuit] || { name: race.circuit };
  const result = F.results[race.round];
  const winner = result ? F.driverById(result.order[0]) : null;
  const fastest = result ? F.driverById(result.fastest) : null;
  const raceHref = urlFor({ name: 'race', year: F.seasonYear, round: race.round });
  return (
    <div key={race.round} className={`race-card race-card-link is-${race.status}`}>
      <a className="race-card-stretch" href={raceHref} aria-label={`${race.name} — round ${race.round}`}></a>
      <div className="race-card-head">
        <div>
          <div className="race-round">RD {String(race.round).padStart(2, '0')}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {race.sprint && <SprintBadge />}
          <span className={`pill pill-${race.status}`}>{race.status}</span>
        </div>
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
          <span className="race-flag">{race.flag}</span>
          <div className="race-name">{race.name.replace(' Grand Prix', '')}</div>
        </div>
        <div className="race-circuit">{circuit.name}</div>
      </div>
      <div className="race-card-foot">
        <div className="race-mini-row">
          <span className="lbl">Date</span>
          <span className="val">{fmtDateLong(race.date)}</span>
        </div>
        {winner && (() => {
          const winnerHref = urlFor({ name: 'driver', id: winner.id, ref: winner.jolpicaId });
          const winnerLabel = `${winner.flag} ${winner.first ? winner.first[0] + '. ' : ''}${winner.last}`;
          return (
            <div className="race-mini-row">
              <span className="lbl">Winner</span>
              <span className="val" style={{ color: 'var(--fg-1)' }}>
                {winner.jolpicaId
                  ? <a href={winnerHref} className="inline-link race-card-overlay-link" style={{ color: 'inherit' }}>{winnerLabel}</a>
                  : winnerLabel}
              </span>
            </div>
          );
        })()}
        {fastest && (
          <div className="race-mini-row">
            <span className="lbl">Fastest Lap</span>
            <span className="val">{fastest.code}</span>
          </div>
        )}
      </div>
    </div>
  );
})}
```

Key changes:
- `raceHref` is unconditional (no `result ?` guard).
- New `<a className="race-card-stretch">` is the full-bleed stretched link.
- Race name and circuit name go back to plain `<div>` (no inline `<a>`).
- Winner name keeps its `<a>` but gains class `race-card-overlay-link` so CSS can promote z-index above the stretch link.

- [ ] **Step 2: Add CSS to public/css/app.css**

Append to `public/css/app.css`:

```css
.race-card-link {
  position: relative;
  cursor: pointer;
  transition: border-color 120ms ease, transform 120ms ease;
}
.race-card-link:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}
.race-card-stretch {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: transparent;
  border: 0;
  font-size: 0;
  color: transparent;
  text-decoration: none;
}
/* keep the winner inline-link clickable and on top of the stretch overlay */
.race-card-overlay-link {
  position: relative;
  z-index: 1;
}
.race-card-link .race-mini-row,
.race-card-link .race-card-head,
.race-card-link > div {
  position: relative;
  z-index: 1;
}
```

- [ ] **Step 3: Verify**

`http://localhost:4321/calendar/`:
- Click anywhere on a future round card → lands on `/races/2026/N/`.
- Click anywhere on a past round card → lands on `/races/2026/N/` (results page).
- Click a winner name → lands on `/drivers/<ref>/` (not the race page).
- Hover any card → border accent shifts, slight lift.
- No console warnings about nested `<a>`.

- [ ] **Step 4: Commit**

```
git add src/components/islands/screens/CalendarScreen.jsx public/css/app.css
git commit -m "feat(calendar): whole-card click target via stretched link"
```

---

## Task 12: OG image — upcoming variant

**Files:**
- Modify: `scripts/og-templates/og-race.mjs`

- [ ] **Step 1: Branch the bottom block on results presence**

In `scripts/og-templates/og-race.mjs`, replace the existing `bottom` definition with:

```js
const isCompleted = (race.results || []).length > 0;
const winner = isCompleted ? race.results.find(r => r.position === 1) : null;

const fmtDate = (iso) => {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      .format(new Date(iso))
      .toUpperCase();
  } catch { return iso; }
};

const bottom = {
  type: 'div',
  props: {
    style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' },
    children: [
      isCompleted && winner ? {
        type: 'div',
        props: {
          style: { display: 'flex', flexDirection: 'column', gap: 4 },
          children: [
            { type: 'div', props: { style: { fontSize: 20, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }, children: 'Winner' } },
            { type: 'div', props: { style: { fontSize: 44, fontWeight: 700 }, children: winner.driverName } },
            winner.constructorName ? { type: 'div', props: { style: { fontSize: 22, color: COLORS.muted }, children: winner.constructorName } } : null,
          ].filter(Boolean),
        },
      } : {
        type: 'div',
        props: {
          style: { display: 'flex', flexDirection: 'column', gap: 4 },
          children: [
            { type: 'div', props: { style: { fontSize: 20, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }, children: 'Race weekend' } },
            { type: 'div', props: { style: { fontSize: 44, fontWeight: 700 }, children: fmtDate(race.date) } },
          ],
        },
      },
      ogBrand(),
    ],
  },
};
```

- [ ] **Step 2: Generate one OG image and inspect it**

```
npm run build:og
```

The generator iterates `_races-index.json`. Look at the console output for `[og]` lines — should show the new upcoming entries being skipped (PNG already exists from earlier runs) or freshly generated.

To force-regenerate one: temporarily delete `public/images/og/races/2026-5.png`, then run `npm run build:og`. Open the regenerated PNG and confirm:
- Top: "2026 · ROUND 5" + "Canadian Grand Prix" + "🇨🇦 Circuit Gilles Villeneuve".
- Bottom-left: "RACE WEEKEND" eyebrow + "24 MAY 2026" big text.
- Bottom-right: brand mark.

- [ ] **Step 3: Commit**

```
git add scripts/og-templates/og-race.mjs
git commit -m "feat(og): upcoming-race OG variant — race-weekend + date"
```

---

## Task 13: OG cache invalidation via .state sidecar

**Files:**
- Modify: `scripts/generate-og-images.mjs`

- [ ] **Step 1: Replace the race-OG cache check**

In `scripts/generate-og-images.mjs`, locate the race generation loop (around line 82–100):

```js
await Promise.all(batch.map(async (entry) => {
  try {
    const out = path.join(outDir, `${entry.year}-${entry.round}.png`);
    if (!FORCE && fs.existsSync(out)) { skipped++; return; }
    const racePath = path.join(ARCHIVE, 'races', String(entry.year), `${entry.round}.json`);
    if (!fs.existsSync(racePath)) return;
    const race = JSON.parse(fs.readFileSync(racePath, 'utf8'));
    const png = await renderPng(renderRaceOg(race));
    fs.writeFileSync(out, png);
    count++;
  } catch (err) {
    failed++;
    console.warn(`[og] race ${entry.year}/${entry.round} failed: ${err.message}`);
  }
}));
```

Replace with:

```js
await Promise.all(batch.map(async (entry) => {
  try {
    const out = path.join(outDir, `${entry.year}-${entry.round}.png`);
    const stateFile = `${out}.state`;
    const wantState = entry.completed === false ? 'upcoming' : 'completed';

    let cacheValid = false;
    if (!FORCE && fs.existsSync(out) && fs.existsSync(stateFile)) {
      const have = fs.readFileSync(stateFile, 'utf8').trim();
      if (have === wantState) cacheValid = true;
    }
    if (cacheValid) { skipped++; return; }

    const racePath = path.join(ARCHIVE, 'races', String(entry.year), `${entry.round}.json`);
    if (!fs.existsSync(racePath)) return;
    const race = JSON.parse(fs.readFileSync(racePath, 'utf8'));
    const png = await renderPng(renderRaceOg(race));
    fs.writeFileSync(out, png);
    fs.writeFileSync(stateFile, wantState);
    count++;
  } catch (err) {
    failed++;
    console.warn(`[og] race ${entry.year}/${entry.round} failed: ${err.message}`);
  }
}));
```

The first run after this change will see existing PNGs without sidecars and regenerate them all (sidecar missing = cache invalid). Subsequent runs hit the cache. When `_races-index.json` flips a round from `completed: false` to `completed: true`, the sidecar mismatches and the PNG regenerates.

- [ ] **Step 2: Run and verify**

```
npm run build:og
```

Expected on first run after the change: every existing race PNG regenerates (could take several minutes — be patient). Console shows `[og]` count: high.

```
ls public/images/og/races/2026-5.png.state
cat public/images/og/races/2026-5.png.state
```

Expected: file exists, content is `upcoming`.

```
ls public/images/og/races/2024-1.png.state
cat public/images/og/races/2024-1.png.state
```

Expected: content is `completed`.

Run again:

```
npm run build:og
```

Expected: every entry skipped (cache valid). Console shows `[og] races: 0 generated, N skipped`.

- [ ] **Step 3: Commit**

```
git add scripts/generate-og-images.mjs
git commit -m "feat(og): .state sidecar invalidates cache on completed-flag flip"
```

---

## Task 14: Smoke verification

This is a final pass once everything's in. Catches integration issues that escaped per-task checks.

- [ ] **Step 1: Full build**

```
npm run build
```

Expected: completes without errors. The build summary should mention more prerendered routes than before (~18 new ones for 2026).

- [ ] **Step 2: Spot-check via preview server**

```
npm run preview
```

(Or use the `preview_*` MCP tools.)

Visit and snapshot:

| URL                              | Expectation                                                          |
| -------------------------------- | -------------------------------------------------------------------- |
| `/calendar/`                     | Cards uniformly clickable; future cards link to `/races/2026/N/`     |
| `/races/2026/5/`                 | Holding page renders: hero + countdown + timetable + last-podium + circuit |
| `/races/2024/1/`                 | Completed race renders identically to before refactor                |
| `/races/2026/12/` (sprint round) | Hero shows ⚡ Sprint pill; timetable shows SQ + Sprint rows           |
| `/circuits/villeneuve/`          | Upcoming Canadian GP entry in race history links to `/races/2026/5/` |

For each holding page: open devtools, set `localStorage.f1-tz = 'user'`, refresh — confirm timetable converts to local zone. Set back to `'track'`, refresh, confirm reverts.

Confirm view-source on `/races/2026/5/`:
- Title contains "schedule, sessions & circuit"
- `og:type` is `"event"`
- JSON-LD has `eventStatus: "https://schema.org/EventScheduled"` and `subEvent` array
- No FAQPage entry in the @graph

Confirm view-source on `/races/2024/1/`:
- Title contains "Verstappen won" (or whichever winner)
- `og:type` is `"article"`
- JSON-LD has `winner` + FAQPage entry

- [ ] **Step 3: Sitemap check**

```
node -e "const f=require('fs').readFileSync('./dist/sitemap-0.xml','utf8'); console.log('upcoming entries:', (f.match(/\/races\/2026\//g)||[]).length);"
```

Expected: 22 (the full 2026 calendar, both completed and upcoming).

- [ ] **Step 4: Accessibility check**

`preview_snapshot` or browser devtools:

- The `.race-card-stretch` `<a>` has an `aria-label` (set in Task 11).
- The TRACK/YOU toggle has `role="tablist"` + `aria-selected` on each button.
- Tab order on a calendar card: card link → winner inline link (z-index 1, nested but interactive).
- No console warnings about hydration or invalid HTML.

- [ ] **Step 5: Final commit if anything was tweaked during smoke**

```
git status
```

If clean, no commit needed. Otherwise commit with a `chore(race): smoke fixes` message.

---

## Self-review notes

Coverage check against spec sections:
- §Layout (desktop + mobile): Tasks 5–8 (next-session panel, last-held, circuit panel, mobile via `@media`).
- §Component file structure: Tasks 2 (split), 5 (UpcomingBody), 6 (RaceCountdown).
- §Data pipeline: Task 1 (build-archive emit + index `completed` flag) + Task 10 (`ARCHIVE_MAX_YEAR` bump).
- §Calendar card behaviour: Task 11.
- §SEO (title/desc/og/jsonld): Task 9. OG cache invalidation: Task 13. OG upcoming variant: Task 12.
- §Edge cases: Task 1 covers `lastHeldHere` lookup, `circuitFirstTime`, no-session-data skip, prev/next chaining; Task 6 covers SSR-staleness re-eval on hydration.

Type/name consistency: `circuit.circuitId` vs `circuit.circuitRef` — the bundle calendar has `circuitId` (the ref-like slug), Ergast circuits have `circuitRef`. The build-archive bundle code already aliases (`circuitId: circuitId` in raceDoc). Reads in templates use `race.circuit.circuitId || race.circuit.circuitRef` defensively.

The `sprint` field on `race` differs by mode: array on completed, boolean on upcoming. Template guards (`race.sprint === true`) prevent confusion.

`session.time` strings in bundles end with `'Z'`; ISO concatenation (`${date}T${time}`) is valid as-is.

The `ARCHIVE_MAX_YEAR` bump should be the last "user-facing" change (Task 10) before calendar-card uniformity (Task 11), so the calendar card can rely on `urlFor` returning the prerendered path. If you reorder Tasks 10 and 11, calendar cards link to `/races/2026/N/` before `urlFor` returns it directly — they go through `/race.html` first, which works (it consults `_races-index.json`) but is one redirect hop slower. Prefer the order as written.
