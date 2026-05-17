# Records Table Standings-Row Look Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the standings-page row design (headshot avatar, lipis flag image, team-color left strip, bold-surname split, code badge, top-3 medal colors, whole-row clickable with chevron) to the records leaderboard tables.

**Architecture:** Three changes: (1) extend `scripts/records/generators.mjs` to emit `first`/`last` on driver entries; (2) retire the `.records-table-wrap` CSS rules from PR 1 and add new `.tbl`-scoped rules with headshot/silhouette/flag-img tweaks; (3) rewrite `src/components/RecordsTable.astro` to use `.tbl`, render headshots + flag images + `firstlast` split + code badge, and make rows whole-row clickable. Pure server-rendered Astro, no JS bundle change.

**Tech Stack:** Astro 4 SSG, plain CSS, vitest for generator unit tests.

**Spec:** [docs/superpowers/specs/2026-05-17-records-table-standings-look-design.md](../specs/2026-05-17-records-table-standings-look-design.md)

---

## Task ordering and concurrency

- **Phase 1 (2 tasks, concurrent):** Data shape change + CSS update — disjoint files.
- **Phase 2 (1 task, sequential):** Rewrite RecordsTable.astro — depends on Phase 1 (uses new fields + new CSS classes).
- **Phase 3 (1 task, verification):** Dev-server visual check.

---

## Phase 1a (concurrent with 1b): Add `first` / `last` to driver records entries

### Task 1: `scripts/records/generators.mjs` + test

**Files:**
- Modify: `scripts/records/generators.mjs`
- Modify: `scripts/records/generators.test.js`

- [ ] **Step 1: Edit `generateDriverCareerEntries`**

In `scripts/records/generators.mjs`, locate the `entries.push({...})` at lines 88-103 inside `generateDriverCareerEntries`. After the `name:` line, insert `first` and `last`:

Replace:

```js
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
```

with:

```js
    entries.push({
      value,
      valueLabel: `${value} ${STAT_FORMAT[stat]}`,
      races: rows.length,
      firstYear,
      driverRef: d.driverRef,
      name: `${d.forename || ''} ${d.surname || ''}`.trim(),
      first: d.forename || null,
      last: d.surname || null,
      shortName: shortName(d),
      code: d.code || null,
      flag: d.natInfo?.flag || null,
      country: d.natInfo?.country || null,
      teamRef: team.ref,
      teamName: team.name,
      teamColor: null,            // populated by orchestrator from team-color map
      context,
    });
```

- [ ] **Step 2: Edit `generateWinsInSeasonEntries`**

Locate the `entries.push({...})` at lines 130-145. Same pattern. Replace:

```js
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
```

with:

```js
    entries.push({
      value: bestWins,
      valueLabel: `${bestWins} wins`,
      races: bestRows.length,
      firstYear: bestYear,
      driverRef: d.driverRef,
      name: `${d.forename || ''} ${d.surname || ''}`.trim(),
      first: d.forename || null,
      last: d.surname || null,
      shortName: shortName(d),
      code: d.code || null,
      flag: d.natInfo?.flag || null,
      country: d.natInfo?.country || null,
      teamRef: team.ref,
      teamName: team.name,
      teamColor: null,
      context: team.name ? `${bestYear} - ${team.name}` : String(bestYear),
    });
```

- [ ] **Step 3: Edit `generateStreakEntries`**

Locate the `entries.push({...})` at lines 190-205. Replace:

```js
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
```

with:

```js
    entries.push({
      value: best,
      valueLabel: `${best} ${stat}`,
      races: rows.length,
      firstYear: bestStart.year,
      driverRef: d.driverRef,
      name: `${d.forename || ''} ${d.surname || ''}`.trim(),
      first: d.forename || null,
      last: d.surname || null,
      shortName: shortName(d),
      code: d.code || null,
      flag: d.natInfo?.flag || null,
      country: d.natInfo?.country || null,
      teamRef: team.ref,
      teamName: team.name,
      teamColor: null,
      context,
    });
```

- [ ] **Step 4: Edit `generateTitleMarginEntries`**

This one is different — it pulls names from `yearStandings[year].p1` (which only has `name`, `surname`), not from the driver doc. The driver doc `champ` is looked up via `driversByRef`. If we have `champ`, use its `forename`/`surname`; otherwise split `row.p1.name`.

Locate the `entries.push({...})` at lines 227-242. Replace:

```js
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
```

with:

```js
    const champ = driversByRef.get(row.p1.driverRef);
    const champFirst = champ?.forename || null;
    const champLast = champ?.surname || row.p1.surname || null;
    entries.push({
      value: margin,
      valueLabel: `${margin} pts`,
      races: 0,
      firstYear: year,
      driverRef: row.p1.driverRef,
      name: row.p1.name,
      first: champFirst,
      last: champLast,
      shortName: champ ? shortName(champ) : row.p1.name,
      code: champ?.code || null,
      flag: champ?.natInfo?.flag || null,
      country: champ?.natInfo?.country || null,
      teamRef: null,        // filled by orchestrator from the per-driver season team
      teamName: null,
      teamColor: null,
      context: `${year} - beat ${row.p2.surname}`,
    });
```

- [ ] **Step 5: Edit `generateYoungestChampionEntries`**

Locate the `entries.push({...})` at lines 275-290. Replace:

```js
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
```

with:

```js
    entries.push({
      value: ageDays,
      valueLabel: formatAge(d.dob, eventDate) || `${ageDays}d`,
      races: 0,
      firstYear: firstChampYear,
      driverRef: d.driverRef,
      name: `${d.forename || ''} ${d.surname || ''}`.trim(),
      first: d.forename || null,
      last: d.surname || null,
      shortName: shortName(d),
      code: d.code || null,
      flag: d.natInfo?.flag || null,
      country: d.natInfo?.country || null,
      teamRef: team.ref,
      teamName: team.name,
      teamColor: null,
      context: `${firstChampYear}${team.name ? ` - ${team.name}` : ''}`,
    });
```

- [ ] **Step 6: Edit `generateOldestWinnerEntries`**

Locate the `entries.push({...})` at lines 316-331. Replace:

```js
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
```

with:

```js
    entries.push({
      value: oldestDays,
      valueLabel: formatAge(d.dob, oldestRow.date) || `${oldestDays}d`,
      races: 0,
      firstYear: oldestRow.year,
      driverRef: d.driverRef,
      name: `${d.forename || ''} ${d.surname || ''}`.trim(),
      first: d.forename || null,
      last: d.surname || null,
      shortName: shortName(d),
      code: d.code || null,
      flag: d.natInfo?.flag || null,
      country: d.natInfo?.country || null,
      teamRef: oldestRow.constructorRef || null,
      teamName: oldestRow.constructorName || null,
      teamColor: null,
      context: `${oldestRow.year} ${oldestRow.raceName || ''}`.trim(),
    });
```

- [ ] **Step 7: Edit `generateDriverAtCircuitEntries`**

Locate the `entries.push({...})` at lines 449-466. Replace:

```js
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
```

with:

```js
      entries.push({
        value: list.length,
        valueLabel: `${list.length} ${stat}`,
        races: list.length,
        firstYear,
        driverRef: d.driverRef,
        name: `${d.forename || ''} ${d.surname || ''}`.trim(),
        first: d.forename || null,
        last: d.surname || null,
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
```

- [ ] **Step 8: Update tests to assert `first` / `last` on a driver entry**

In `scripts/records/generators.test.js`, find the existing `it('attaches teamRef / context / flag / shortName / valueLabel', ...)` test at line 59. Update its body to additionally assert `first` and `last`:

Replace:

```js
  it('attaches teamRef / context / flag / shortName / valueLabel', () => {
    const entries = generateDriverCareerEntries(DRIVERS, 'wins', 'all-time', 2026);
    const ham = entries.find(e => e.driverRef === 'hamilton');
    expect(ham.teamRef).toBe('mercedes'); // most-raced team
    expect(ham.flag).toBe('🇬🇧');
    expect(ham.shortName).toBe('L. Hamilton');
    expect(ham.context).toBe('2007-2020');
    expect(ham.valueLabel).toBe('3 wins');
  });
```

with:

```js
  it('attaches teamRef / context / flag / shortName / first+last / valueLabel', () => {
    const entries = generateDriverCareerEntries(DRIVERS, 'wins', 'all-time', 2026);
    const ham = entries.find(e => e.driverRef === 'hamilton');
    expect(ham.teamRef).toBe('mercedes'); // most-raced team
    expect(ham.flag).toBe('🇬🇧');
    expect(ham.shortName).toBe('L. Hamilton');
    expect(ham.first).toBe('Lewis');
    expect(ham.last).toBe('Hamilton');
    expect(ham.context).toBe('2007-2020');
    expect(ham.valueLabel).toBe('3 wins');
  });
```

- [ ] **Step 9: Run the test suite**

Run: `npx vitest run scripts/records/generators.test.js`

Expected: all tests pass, including the updated `attaches teamRef / context / flag / shortName / first+last / valueLabel` test.

- [ ] **Step 10: Regenerate records JSON (sanity check)**

Run: `npm run build:archive`

Expected: completes without error. The file `public/data/archive/records/wins.json` (gitignored, not committed) now has `first: "Lewis"` and `last: "Hamilton"` on its top entry.

Verify:

```
node -e "const d = JSON.parse(require('fs').readFileSync('public/data/archive/records/wins.json','utf8')); const e = d.allTime.top50[0]; console.log({first: e.first, last: e.last, name: e.name});"
```

Expected: `{ first: 'Lewis', last: 'Hamilton', name: 'Lewis Hamilton' }`.

- [ ] **Step 11: Commit**

```bash
git add scripts/records/generators.mjs scripts/records/generators.test.js
git commit -m "$(cat <<'EOF'
feat(records): add first/last name fields to driver record entries

Every driver-subject record entry now ships `first` and `last`
alongside the existing `name`. Sourced directly from d.forename /
d.surname, so compound surnames ("von Trips", "de la Rosa") are
handled correctly without client-side splitting.

generateTitleMarginEntries pulls forename from the driver doc and
falls back to row.p1.surname if the doc lookup misses.

Team-subject generators (generateTeamCareerEntries,
generateTeam12FinishesEntries) unchanged - teams don't have
first/last.

Records JSON is gitignored; rebuild via `npm run build:archive` to
refresh on disk. Vitest covers the new fields on
generateDriverCareerEntries; visual rendering uses them in a
follow-up commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 1b (concurrent with 1a): Update CSS

### Task 2: `public/css/app.css` — replace records-table-wrap rules, add new headshot styles

**Files:**
- Modify: `public/css/app.css`

- [ ] **Step 1: Delete old `.records-table-wrap` block from PR 1**

Locate this block (introduced earlier on this branch, currently in app.css after the era-toggle / note rules):

```css
/* Records sub-page column tweaks (sit on top of .data-table) */
.records-table-wrap .col-rank { width: 44px; font-variant-numeric: tabular-nums; color: var(--fg-3); }
.records-table-wrap .col-value { font-variant-numeric: tabular-nums; font-weight: 700; }
.records-table-wrap .col-context { color: var(--fg-3); }

@media (max-width: 720px) {
  .records-table-wrap .col-context { display: none; }
}
```

Delete it entirely. Use `rg -n "Records sub-page column tweaks" public/css/app.css` to find the exact line.

- [ ] **Step 2: Add the new `.tbl`-scoped records rules + headshot styles in its place**

Insert this block where the deleted block was:

```css
/* Records sub-page table column tweaks (sit on top of .tbl) */
.records-table-wrap .tbl .col-rank { width: 56px; }
.records-table-wrap .tbl .col-value { font-variant-numeric: tabular-nums; font-weight: 700; }
.records-table-wrap .tbl .col-context { color: var(--fg-3); white-space: nowrap; }

.records-table-wrap .tbl .col-name {
  border-left: 3px solid var(--team-color, var(--line-2));
  padding-left: 10px;
}

.records-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.records-name {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: inherit;
  text-decoration: none;
  min-width: 0;
}

.records-row-headshot {
  width: 28px; height: 28px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--bg-2);
  flex-shrink: 0;
}
.records-row-headshot.silhouette {
  background: var(--team-color, var(--fg-4));
  opacity: 0.6;
}

.records-cell .flag-img { height: 14px; }

@media (max-width: 720px) {
  .records-table-wrap .tbl .col-context { display: none; }
}
```

- [ ] **Step 3: Verify**

Run:

```
rg -n "\.records-table-wrap \.col-" public/css/app.css
```

Expected: 0 hits (old rules gone).

Run:

```
rg -n "\.records-table-wrap \.tbl \.col-" public/css/app.css
```

Expected: 4 hits (new col-rank/value/context/context-mobile rules).

Run:

```
rg -n "\.records-row-headshot|\.records-cell|\.records-name " public/css/app.css
```

Expected: 5+ hits covering the new classes.

- [ ] **Step 4: Commit**

```bash
git add public/css/app.css
git commit -m "$(cat <<'EOF'
feat(records): swap .data-table column tweaks for .tbl-scoped, add headshot/silhouette/flag-cell styles

Retire the .records-table-wrap rules that targeted .data-table (added
earlier in this branch). Replace with .tbl-scoped equivalents now
that RecordsTable.astro adopts the standings-row look.

Adds:
- .records-table-wrap .tbl .col-rank/value/context column treatments
  including a team-color border-left strip on the name cell
- .records-cell / .records-name flex layout for headshot + flag +
  name + code badge
- .records-row-headshot 28x28 circular image with silhouette
  fallback (flat team-color disc at 60% opacity for the ~830
  historic drivers without curated WebPs)
- .records-cell .flag-img height override (14px) so lipis flags
  match standings sizing rather than table body 13px

Mobile media query hides the context column (same UX as PR 1).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2: Rewrite the records table markup

### Task 3: `src/components/RecordsTable.astro` — adopt standings-row look

Depends on Phase 1a (uses `first` / `last` on entries) and Phase 1b (uses new CSS classes). Run only after both phase-1 commits land.

**Files:**
- Modify: `src/components/RecordsTable.astro` (full rewrite)

- [ ] **Step 1: Rewrite the entire file**

Replace the whole file content (currently the PR 1 version with `<table class="data-table">`) with:

```astro
---
// src/components/RecordsTable.astro
//
// Renders the top-50 table for one era of a record sub-page. The sub-page
// includes two copies of this component (one per era); the era toggle script
// in [topic].astro flips `hidden` between them by selecting
// `[data-era-table]` on the wrapping <div>.

import { ccFromFlag } from '../lib/shared.jsx';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

interface Entry {
  rank: number;
  value: number;
  valueLabel: string;
  driverRef?: string;
  constructorRef?: string;
  name: string;
  first?: string | null;
  last?: string | null;
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

function flagCode(e: Entry): string | null {
  if (e.country) return e.country.toLowerCase();
  const fromEmoji = ccFromFlag(e.flag);
  return fromEmoji ? fromEmoji.toLowerCase() : null;
}

function headshotExists(driverRef?: string): boolean {
  if (!driverRef) return false;
  return existsSync(resolve(process.cwd(), 'public', 'images', 'drivers', `${driverRef}.webp`));
}

function rowHref(e: Entry): string | null {
  if (subjectType === 'team') return e.constructorRef ? `/teams/${e.constructorRef}/` : null;
  return e.driverRef ? `/drivers/${e.driverRef}/` : null;
}
---
<div class="panel records-table-panel" data-era-table={era} hidden={!isDefault}>
  <div class="tbl-wrap">
    <table class="tbl">
      <thead>
        <tr>
          <th class="col-rank">#</th>
          <th class="col-name">{subjectType === 'team' ? 'Team' : 'Driver'}</th>
          {subjectType === 'driver-at-circuit' && <th class="col-circuit">Circuit</th>}
          {subjectType === 'driver' && <th class="col-team">Team</th>}
          <th class="col-value right">Stat</th>
          <th class="col-context">Detail</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(e => {
          const href = rowHref(e);
          const cc = flagCode(e);
          const hasHeadshot = subjectType !== 'team' && headshotExists(e.driverRef);
          const teamColor = e.teamColor || 'var(--line-2)';
          return (
            <tr
              class="clickable"
              onclick={href ? `window.location='${href}'` : undefined}
              style={`--team-color: ${teamColor}`}
            >
              <td class="col-rank">
                <div class={`pos pos-${e.rank}`}>{e.rank}</div>
              </td>
              <td class="col-name">
                <div class="records-cell">
                  {subjectType === 'team' ? (
                    <>
                      <span class="records-team-chip" style={`background: ${teamColor}`}></span>
                      <a href={href} onclick="event.stopPropagation()">{e.name}</a>
                    </>
                  ) : (
                    <>
                      {hasHeadshot ? (
                        <img class="records-row-headshot" src={`/images/drivers/${e.driverRef}.webp`} alt="" width="28" height="28" loading="lazy" />
                      ) : (
                        <div class="records-row-headshot silhouette" aria-hidden="true"></div>
                      )}
                      {cc && (
                        <img class="flag-img" src={`/images/flags/${cc}.svg`} alt={e.country || ''} loading="lazy" decoding="async" />
                      )}
                      <a class="records-name" href={href} onclick="event.stopPropagation()">
                        <span class="driver-firstlast">
                          {e.first && <span class="first">{e.first}</span>}
                          <span class="last">{e.last || e.name}</span>
                        </span>
                        {e.code && <span class="driver-code">{e.code}</span>}
                      </a>
                    </>
                  )}
                </div>
              </td>
              {subjectType === 'driver-at-circuit' && (
                <td class="col-circuit">
                  <a href={`/circuits/${e.circuitRef}/`} onclick="event.stopPropagation()">{e.circuitName}</a>
                </td>
              )}
              {subjectType === 'driver' && (
                <td class="col-team">
                  {e.teamRef
                    ? <a href={`/teams/${e.teamRef}/`} onclick="event.stopPropagation()">{e.teamName}</a>
                    : <span>-</span>}
                </td>
              )}
              <td class="col-value right">{e.valueLabel}</td>
              <td class="col-context">{e.context || ''}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
</div>
```

Key invariants:

- The `data-era-table` attribute stays on the outer `<div>` (matches PR 1) so the era-toggle script in `[topic].astro` still works.
- Inner anchors call `event.stopPropagation()` to prevent double-navigation when the row click fires.
- For team subject type, no headshot/flag/code (teams don't have those); only the existing `.records-team-chip` and team name link.
- For driver-at-circuit, both the driver-cell treatment AND the circuit cell are present.
- `--team-color` CSS variable is set per-row via inline style; sub-element rules read it for the name-cell border-left and the silhouette tint.

- [ ] **Step 2: Verify the file parses**

Run:

```
rg -n "records-table|text-muted|—" src/components/RecordsTable.astro
```

Expected: 0 hits (no leftover legacy markup or em-dashes).

Run:

```
rg -n 'class="tbl"|class="panel records-table-panel"|class="records-cell"|class="records-row-headshot"' src/components/RecordsTable.astro
```

Expected: 4 hits.

- [ ] **Step 3: Build sanity check**

Run: `npx astro check 2>&1 | head -30`

Expected: no type errors in `RecordsTable.astro`. If the project doesn't run `astro check`, skip this step.

- [ ] **Step 4: Commit**

```bash
git add src/components/RecordsTable.astro
git commit -m "$(cat <<'EOF'
feat(records): adopt standings-row look on records sub-page tables

Switch from .data-table to .tbl. Rich row now has:
- 28x28 rounded headshot avatar (real WebP for the ~32 modern
  drivers with one, flat team-color disc silhouette at 60% opacity
  for the ~830 historic drivers without)
- Lipis flag image (not the regional-indicator emoji - Windows
  renders those as "GB" letters)
- "First **Last**" with the surname bolded via .driver-firstlast
- Mono driver-code badge
- Team-color left border strip on the name cell
- Gold/silver/bronze position colours for ranks 1/2/3 via .pos-1
  /.pos-2/.pos-3
- Whole-row clickable with a chevron at the end of the last cell
  (chevron comes free via the PR #96 selector for
  .tbl tbody tr.clickable)

Team-subject records (team-wins, team-titles, team-1-2-finishes) get
the team-color border-left strip plus existing colour chip; no
headshot/flag/code since teams don't have those.

Driver-at-circuit records get the driver treatment plus the existing
circuit cell.

Inner <a> elements still exist for SEO and accessibility; they call
event.stopPropagation() to prevent double-navigation when the row
click fires.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3: Visual verification

### Task 4: Dev-server check

**Files:** none (verification only)

- [ ] **Step 1: Ensure dev server is running**

The dev server should already be running on port 4322 from this session. If not, the user runs `npm run dev` (which includes a `predev` step that regenerates `public/data/archive/records/*.json` with the new `first`/`last` fields).

- [ ] **Step 2: Hard-reload `/records/wins/` and inspect**

Confirm at `http://localhost:4322/records/wins/`:

1. Each row shows a 28x28 rounded avatar on the left (real photo for Hamilton, Verstappen, Norris, Russell etc; a flat colored disc for older drivers like Stewart, Fangio, Moss).
2. Driver names render as "Lewis **Hamilton**" with the first muted, surname bold.
3. A mono `HAM` / `VER` / etc badge sits to the right of the name.
4. The country flag is rendered as a small image (not an emoji), styled with a 1px border (`.flag-img` rule).
5. The position cell `1` is gold, `2` is silver, `3` is bronze (or browser-default if `--pos-1` colour isn't applied; verify via inspect).
6. Each row has a `›` chevron at the right end of the last cell.
7. Hovering a row tints the background.
8. Clicking anywhere on a row navigates to `/drivers/<ref>/`.

- [ ] **Step 3: Era toggle**

Click `Modern era (1981-present)`. Confirm the all-time table hides and the modern table shows. Click `All-time (1950-present)`. Confirm it flips back.

- [ ] **Step 4: Check team-subject record**

Navigate to `http://localhost:4322/records/team-wins/`. Confirm:

- No headshot, no flag, no code (correctly).
- Existing team-color chip sits next to the team name.
- The name cell has a team-color border-left strip.
- Row click navigates to `/teams/<ref>/`.

- [ ] **Step 5: Check driver-at-circuit record**

Navigate to `http://localhost:4322/records/wins-at-circuit/`. Confirm:

- Full driver treatment (headshot + flag + bold surname + code) in the name cell.
- Circuit name in its own cell, link goes to `/circuits/<ref>/`.
- Row click navigates to the driver page (not the circuit — by spec).
- Inner circuit-name anchor click navigates to the circuit (event.stopPropagation prevents row navigation).

- [ ] **Step 6: Regression check on driver and race pages**

Navigate to `http://localhost:4322/drivers/hamilton/` and `http://localhost:4322/races/2024/1/`. Confirm both still use the simpler `.data-table` look from PR 1 (no headshot, no chevron). No visual regression.

- [ ] **Step 7: Mobile width check**

Resize browser to ≤720px. On `/records/wins/`:

- The table scrolls horizontally inside its panel.
- The `.col-context` (Detail) column is hidden by the mobile media query.
- Headshots and flags still render at 28x28 / 14px.

- [ ] **Step 8: Light + dark mode check**

Toggle the theme. Confirm:

- Light mode: header bg, name-cell border, flag border, silhouette tint all readable.
- Dark mode: same.

- [ ] **Step 9: Report**

If all checks pass, report DONE with a one-line summary and offer to push the PR. If any regression is found, identify which commit (`git log --oneline main..HEAD`) is the likely culprit and follow up with a fix commit.

---

## Notes for the implementer

- **CI as safety net.** Per project convention, you can skip `npm run build` locally and let CI verify. The `predev` hook handles `npm run build:archive` for you when you start the dev server.
- **Commit per task.** Each task above commits its own work. Do not batch commits across tasks.
- **No `--no-verify`.** If a pre-commit hook fails, investigate the cause; don't skip.
- **ASCII hyphens.** Use `-` not `—` in source. Already enforced in the rewritten file.
- **Trailing slash.** All internal links must end with `/`. Every `href` in this plan ends with a slash.
- **Inline `onclick`.** This is acceptable for static Astro markup — no JS bundle change, no event listener wiring. The standings page uses React event handlers because it's a React island; the records page is pure server-rendered HTML.

## Out of scope

- Sortable column headers (records have a fixed sort by value).
- Δ change indicator (records are all-time, no change concept).
- "Last N" sparkline column (standings-specific).
- New driver headshot images for historic drivers (silhouette fallback covers them).
- Classic-era (1950-1980) toggle - still a separate follow-up.
- CircuitPage / TeamPage scoped `.data-table` cleanup - still a separate follow-up.
