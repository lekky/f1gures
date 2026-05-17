# Records placeholder + Classic-era toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat team-color disc silhouette fallback with a diagonal-stripe rounded-square placeholder, AND add a third "Classic era (1950-1980)" toggle to records sub-pages.

**Architecture:** Two related changes bundled. Section A is a 1-rule CSS edit (silhouette restyle). Section B touches the records data pipeline (helpers/generators/index/test) and two Astro files ([topic].astro toggle, RecordsTable.astro type extension).

**Tech Stack:** Astro 4 SSG, plain CSS, vitest.

**Spec:** [docs/superpowers/specs/2026-05-17-records-placeholder-and-classic-era-design.md](../specs/2026-05-17-records-placeholder-and-classic-era-design.md)

---

## Task ordering and concurrency

- **Phase 1 (2 tasks, concurrent):** Section A CSS + Section B1+B2 data pipeline + tests. Disjoint files.
- **Phase 2 (2 tasks, concurrent):** Section B3 UI — RecordsTable.astro type extension + [topic].astro third button/component. Disjoint files.
- **Phase 3 (sequential, verification):** Regenerate records JSON + visual check.

---

## Phase 1a (concurrent with 1b): Striped placeholder

### Task 1: `public/css/app.css` — silhouette restyle

**Files:**
- Modify: `public/css/app.css`

- [ ] **Step 1: Replace the existing silhouette rule**

Find this rule (added earlier on this branch — use `rg -n "records-row-headshot.silhouette" public/css/app.css` if the line moved):

```css
.records-row-headshot.silhouette {
  background: var(--team-color, var(--fg-4));
  opacity: 0.6;
}
```

Replace it with:

```css
.records-row-headshot.silhouette {
  background:
    repeating-linear-gradient(
      135deg,
      var(--team-color, var(--fg-4)) 0 4px,
      var(--bg-2) 4px 8px
    );
  opacity: 0.7;
  border-radius: 6px;
}
```

The `border-radius: 6px` overrides the parent `.records-row-headshot` rule's `border-radius: 50%`. Real WebP headshots stay circular; only placeholders become rounded squares.

- [ ] **Step 2: Verify**

```
rg -n "repeating-linear-gradient" public/css/app.css
```
Expected: at least 1 hit on the new rule.

```
rg -B 1 -A 1 "border-radius: 6px" public/css/app.css
```
Expected: appears inside `.records-row-headshot.silhouette` block.

- [ ] **Step 3: Commit**

```bash
git add public/css/app.css
git commit -m "$(cat <<'EOF'
feat(records): striped rounded-square placeholder for missing headshots

Replace the flat team-color disc with a diagonal-stripe pattern in a
rounded square. Real WebP headshots stay circular (border-radius:
50% on the parent .records-row-headshot rule); the shape change to
placeholders signals "no photo." Stripes tint per row via
var(--team-color) so each row stays branded to its team.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 1b (concurrent with 1a): Classic-era data pipeline

### Task 2: `scripts/records/{helpers,generators,index}.mjs` + test

**Files:**
- Modify: `scripts/records/helpers.mjs`
- Modify: `scripts/records/generators.mjs`
- Modify: `scripts/records/index.mjs`
- Modify: `scripts/records/generators.test.js`

- [ ] **Step 1: Edit `scripts/records/helpers.mjs`**

Find the `filterPerRaceByEra` function. Use Edit with old_string:

```js
export function filterPerRaceByEra(rows, era, currentYear) {
  return rows.filter(r => {
    if (r.year == null || r.year === currentYear) return false;
    if (era === 'modern' && r.year < 1981) return false;
    return true;
  });
}
```

and new_string:

```js
export function filterPerRaceByEra(rows, era, currentYear) {
  return rows.filter(r => {
    if (r.year == null || r.year === currentYear) return false;
    if (era === 'modern' && r.year < 1981) return false;
    if (era === 'classic' && r.year >= 1981) return false;
    return true;
  });
}
```

If the source formatting differs (one-liner vs multi-line), adapt the match to the actual content but keep the new logic identical.

- [ ] **Step 2: Edit `countStat` in `scripts/records/generators.mjs`**

Use Edit with old_string:

```js
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
```

and new_string:

```js
    case 'championships': {
      let n = 0;
      for (const yearStr of Object.keys(finalStandingByYear || {})) {
        const year = Number(yearStr);
        if (year === currentYear) continue;
        if (era === 'modern' && year < 1981) continue;
        if (era === 'classic' && year >= 1981) continue;
        if (finalStandingByYear[yearStr]?.position === 1) n++;
      }
      return n;
    }
```

- [ ] **Step 3: Edit `generateTitleMarginEntries` year filter**

Use Edit with old_string:

```js
    const year = Number(yearStr);
    if (year === currentYear) continue;
    if (era === 'modern' && year < 1981) continue;

    const row = yearStandings[yearStr];
```

and new_string:

```js
    const year = Number(yearStr);
    if (year === currentYear) continue;
    if (era === 'modern' && year < 1981) continue;
    if (era === 'classic' && year >= 1981) continue;

    const row = yearStandings[yearStr];
```

- [ ] **Step 4: Edit `generateYoungestChampionEntries` champYears filter**

Use Edit with old_string:

```js
    const champYears = Object.keys(d.finalStandingByYear || {})
      .filter(y => d.finalStandingByYear[y]?.position === 1)
      .map(Number)
      .filter(y => y !== currentYear && (era !== 'modern' || y >= 1981));
```

and new_string:

```js
    const champYears = Object.keys(d.finalStandingByYear || {})
      .filter(y => d.finalStandingByYear[y]?.position === 1)
      .map(Number)
      .filter(y => y !== currentYear
        && (era !== 'modern' || y >= 1981)
        && (era !== 'classic' || y < 1981));
```

- [ ] **Step 5: Edit `generateTeamCareerEntries` titles branch**

Use Edit with old_string:

```js
      // titles
      for (const yearStr of Object.keys(t.finalStandingByYear || {})) {
        const year = Number(yearStr);
        if (year === currentYear) continue;
        if (era === 'modern' && year < 1981) continue;
        if (t.finalStandingByYear[yearStr]?.position === 1) value++;
      }
```

and new_string:

```js
      // titles
      for (const yearStr of Object.keys(t.finalStandingByYear || {})) {
        const year = Number(yearStr);
        if (year === currentYear) continue;
        if (era === 'modern' && year < 1981) continue;
        if (era === 'classic' && year >= 1981) continue;
        if (t.finalStandingByYear[yearStr]?.position === 1) value++;
      }
```

- [ ] **Step 6: Edit `generateTeam12FinishesEntries` year filter**

Use Edit with old_string:

```js
  for (const r of results) {
    if (r.year == null || r.year === currentYear) continue;
    if (era === 'modern' && r.year < 1981) continue;
    if (r.position !== 1 && r.position !== 2) continue;
```

and new_string:

```js
  for (const r of results) {
    if (r.year == null || r.year === currentYear) continue;
    if (era === 'modern' && r.year < 1981) continue;
    if (era === 'classic' && r.year >= 1981) continue;
    if (r.position !== 1 && r.position !== 2) continue;
```

- [ ] **Step 7: Edit `scripts/records/index.mjs` — dispatch classic era**

Find the loop in `buildRecords`. Use Edit with old_string:

```js
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
```

and new_string:

```js
  for (const cfg of RECORD_CONFIGS) {
    const allTime = dispatch(cfg.id, driverDocs, teamDocs, yearStandings, finalRoundDateByYear, allResults, 'all-time', currentYear);
    const modern  = dispatch(cfg.id, driverDocs, teamDocs, yearStandings, finalRoundDateByYear, allResults, 'modern',   currentYear);
    const classic = dispatch(cfg.id, driverDocs, teamDocs, yearStandings, finalRoundDateByYear, allResults, 'classic',  currentYear);

    attachTeamColor(allTime, teamColorByRef);
    attachTeamColor(modern,  teamColorByRef);
    attachTeamColor(classic, teamColorByRef);

    const top5 = allTime.slice(0, TOP5).map(strip);
    const modernTop5 = modern.slice(0, TOP5).map(strip);
    const classicTop5 = classic.slice(0, TOP5).map(strip);

    byTopic[cfg.id] = {
      id: cfg.id,
      title: cfg.title,
      blurb: cfg.blurb,
      subjectType: cfg.subjectType,
      valueFormat: cfg.valueFormat,
      note: cfg.note || null,
      allTime: { top50: allTime.slice(0, TOP50).map(strip) },
      modern:  { top50: modern.slice(0, TOP50).map(strip) },
      classic: { top50: classic.slice(0, TOP50).map(strip) },
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
      classic: { top5: classicTop5 },
    });
  }
```

- [ ] **Step 8: Add classic-era test assertion**

In `scripts/records/generators.test.js`, find the existing "modern-era filter drops a pre-1981 row" test (around line 45 — Niki Lauda with 1975 + 1984 rows). After it, add a new sibling test:

Use Edit with old_string:

```js
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
```

and new_string:

```js
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

  it('classic-era filter drops a post-1980 row', () => {
    const drivers = [{
      driverRef: 'lauda', forename: 'Niki', surname: 'Lauda', code: 'LAU',
      dob: '1949-02-22', natInfo: { country: 'AT', flag: 'X' },
      perRace: [
        { year: 1975, round: 1, position: 1, grid: 1, fastestLapRank: null, constructorRef: 'ferrari', constructorName: 'Ferrari' },
        { year: 1984, round: 1, position: 1, grid: 1, fastestLapRank: null, constructorRef: 'mclaren', constructorName: 'McLaren' },
      ],
      finalStandingByYear: { 1975: { position: 1 }, 1984: { position: 1 } },
    }];
    expect(generateDriverCareerEntries(drivers, 'wins', 'classic', 2026)[0].value).toBe(1);
  });
```

- [ ] **Step 9: Run tests**

Run: `npx vitest run scripts/records/generators.test.js`

Expected: all tests pass, including the new "classic-era filter drops a post-1980 row" test.

- [ ] **Step 10: Verify**

```
rg -c "era === 'classic'" scripts/records/helpers.mjs scripts/records/generators.mjs
```
Expected: at least 5 hits across the two files (1 helper + 4-5 generators).

```
rg -c "classic" scripts/records/index.mjs
```
Expected: at least 5 hits (dispatch, attachTeamColor, classicTop5, byTopic.classic, indexRecordsByGroup.classic).

- [ ] **Step 11: Commit**

```bash
git add scripts/records/helpers.mjs scripts/records/generators.mjs scripts/records/index.mjs scripts/records/generators.test.js
git commit -m "$(cat <<'EOF'
feat(records): classic era (1950-1980) data pipeline

Adds a third era bucket to the records pipeline. Mirrors the
existing all-time and modern eras:

- helpers.filterPerRaceByEra excludes year >= 1981 when era ===
  'classic' (inverse of the modern cutoff).
- generators.mjs: every inline year-filter that handles modern now
  handles classic too (countStat championships, generateTitleMargin,
  generateYoungestChampion champYears, generateTeamCareer titles,
  generateTeam12Finishes).
- index.mjs dispatches a third era per record and emits classic.top50
  on each byTopic entry plus classic.top5 on each indexRecordsByGroup
  entry.

Tests cover the new filter on generateDriverCareerEntries via Niki
Lauda's 1975 + 1984 wins (classic = 1, modern = 1, all-time = 2).

Records JSON is gitignored; rebuild via npm run build:archive to
refresh on disk. UI consumes the new bucket in a follow-up commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2a (concurrent with 2b): RecordsTable era type extension

### Task 3: `src/components/RecordsTable.astro` — extend era type union

**Files:**
- Modify: `src/components/RecordsTable.astro`

- [ ] **Step 1: Extend the era prop type**

Use Edit with old_string:

```ts
const { entries, subjectType, era } = Astro.props as {
  entries: Entry[];
  subjectType: 'driver' | 'team' | 'driver-at-circuit';
  era: 'all-time' | 'modern';
};
```

and new_string:

```ts
const { entries, subjectType, era } = Astro.props as {
  entries: Entry[];
  subjectType: 'driver' | 'team' | 'driver-at-circuit';
  era: 'all-time' | 'modern' | 'classic';
};
```

That is the only change. `const isDefault = era === 'all-time';` stays correct.

- [ ] **Step 2: Verify**

```
rg -n "'all-time' \| 'modern' \| 'classic'" src/components/RecordsTable.astro
```
Expected: 1 hit.

- [ ] **Step 3: Commit**

```bash
git add src/components/RecordsTable.astro
git commit -m "$(cat <<'EOF'
feat(records): widen RecordsTable era prop to include 'classic'

Type-only change so [topic].astro can render a third era panel.
isDefault check (era === 'all-time') unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2b (concurrent with 2a): Records sub-page third toggle

### Task 4: `src/pages/records/[topic].astro` — third button + third RecordsTable

**Files:**
- Modify: `src/pages/records/[topic].astro`

- [ ] **Step 1: Add the third toggle button**

Use Edit with old_string:

```astro
    <div class="records-era-toggle">
      <button class="active" data-era-toggle="all-time" aria-pressed="true">All-time (1950-present)</button>
      <button data-era-toggle="modern" aria-pressed="false">Modern era (1981-present)</button>
    </div>
```

and new_string:

```astro
    <div class="records-era-toggle">
      <button class="active" data-era-toggle="all-time" aria-pressed="true">All-time (1950-present)</button>
      <button data-era-toggle="modern" aria-pressed="false">Modern era (1981-present)</button>
      <button data-era-toggle="classic" aria-pressed="false">Classic era (1950-1980)</button>
    </div>
```

- [ ] **Step 2: Add the third RecordsTable component**

Use Edit with old_string:

```astro
    <div class="records-table-wrap" data-era="all-time">
      <RecordsTable entries={data.allTime.top50 || []} subjectType={data.subjectType} era="all-time" />
      <RecordsTable entries={data.modern.top50  || []} subjectType={data.subjectType} era="modern" />
    </div>
```

and new_string:

```astro
    <div class="records-table-wrap" data-era="all-time">
      <RecordsTable entries={data.allTime.top50 || []} subjectType={data.subjectType} era="all-time" />
      <RecordsTable entries={data.modern.top50  || []} subjectType={data.subjectType} era="modern" />
      <RecordsTable entries={data.classic?.top50 || []} subjectType={data.subjectType} era="classic" />
    </div>
```

(Using `?.` because old records JSON cache might not have `classic` until prebuild regenerates.)

- [ ] **Step 3: Verify**

```
rg -n "data-era-toggle=\"classic\"|era=\"classic\"|data.classic" "src/pages/records/[topic].astro"
```
Expected: 3 hits.

- [ ] **Step 4: Commit**

```bash
git add "src/pages/records/[topic].astro"
git commit -m "$(cat <<'EOF'
feat(records): classic era (1950-1980) toggle on sub-pages

Third era button + third RecordsTable component. The inline era
toggle script in this file already calls
wrap.querySelectorAll('[data-era-table]') so it handles three
panels without modification.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3: Regenerate JSON + visual verification

### Task 5: Rebuild archive + verify

**Files:** none (verification)

- [ ] **Step 1: Regenerate records JSON**

Run: `npm run build:archive`

Expected: completes without errors. Confirms the generator + index changes don't crash.

- [ ] **Step 2: Spot-check the new JSON shape**

```
node -e "const d = JSON.parse(require('fs').readFileSync('public/data/archive/records/wins.json','utf8')); console.log({ hasClassic: !!d.classic, classicTop1: d.classic?.top50?.[0]?.name, classicSize: d.classic?.top50?.length });"
```

Expected: `hasClassic: true`, a pre-1980s driver as classic top1 (e.g. Jackie Stewart, Jim Clark, or Niki Lauda), `classicSize` between 1 and 50.

- [ ] **Step 3: Visual check at `/records/wins/`**

Open `http://localhost:4322/records/wins/`. Confirm:

1. Three era toggle buttons render: All-time / Modern era / Classic era.
2. Click "Classic era (1950-1980)". The visible table swaps to the third panel; top row is a pre-1980s driver (Jackie Stewart with 27 wins, or Jim Clark with 25, or similar).
3. Historic-driver placeholder shows the new diagonal-stripe pattern in a rounded square (not the old flat disc). Stripes tint to the row's team color (e.g. Tyrrell blue for Stewart, Lotus dark green for Clark).
4. Real WebP headshots (if any classic-era driver has one — unlikely) stay circular.
5. Click "Modern era" then "All-time" — toggle returns to the original views.

- [ ] **Step 4: Inspect placeholder styles**

In the browser console:

```js
JSON.stringify({
  bg: getComputedStyle(document.querySelector('.records-row-headshot.silhouette')).background,
  radius: getComputedStyle(document.querySelector('.records-row-headshot.silhouette')).borderRadius,
  opacity: getComputedStyle(document.querySelector('.records-row-headshot.silhouette')).opacity,
})
```

Expected: `background` contains "repeating-linear-gradient" with 135deg; `borderRadius: "6px"`; `opacity: "0.7"`.

- [ ] **Step 5: Check a record where classic era is empty**

`/records/wins-in-season/` — many records have no qualifying classic-era entry; the third panel should render headers and an empty `<tbody>`. Confirm no JS errors in console.

- [ ] **Step 6: Mobile width**

Resize to 375px. Confirm the three era buttons fit (or wrap, depending on text width). Confirm the placeholder stripes still render legibly at 28x28.

- [ ] **Step 7: Report**

If all checks pass, summarize and offer to push the PR.

---

## Notes for the implementer

- **CI as safety net.** Per project convention, skip local `npm run build` and let CI verify.
- **Commit per task.** Each task above commits its own work.
- **No `--no-verify`.** If a pre-commit hook fails, investigate; don't skip.
- **ASCII hyphens.** Use `-` not `—` in source.
- **Trailing slash.** All internal links must end with `/`.
