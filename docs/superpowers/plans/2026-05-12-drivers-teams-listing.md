# Drivers & Teams Listing Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/drivers/` and `/teams/` all-time listing pages — filterable, sortable, paginated card grids, each card linking to the existing detail page.

**Architecture:** Static Astro shell per page + React island that fetches the pre-built archive index JSON (`_drivers-index.json` / `_teams-index.json`) on mount and handles all search/filter/sort/pagination client-side. `build-archive.mjs` gets one unconditional enrichment pass at the very end that adds `last5`, `number`, and `teamName` to driver index entries and `last5` to team index entries, then re-writes both index files.

**Tech Stack:** Astro 4, React 18, Vitest (new), existing `MiniChart` component from `src/lib/shared.jsx`

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `scripts/build-archive.mjs` | Enrichment pass at end — last5 / number / teamName |
| Modify | `src/components/Chrome.astro` | Add Drivers + Teams nav links |
| Modify | `public/css/site.css` | Grid, card, controls, pagination CSS |
| Create | `src/lib/listingUtils.js` | Pure filter / sort / paginate / uniqueNationalities |
| Create | `src/lib/listingUtils.test.js` | Unit tests for listingUtils |
| Create | `src/components/islands/DriversIndexIsland.jsx` | Fetches index JSON, mounts screen |
| Create | `src/components/islands/TeamsIndexIsland.jsx` | Same for teams |
| Create | `src/components/islands/screens/DriversIndexScreen.jsx` | Driver grid + controls |
| Create | `src/components/islands/screens/TeamsIndexScreen.jsx` | Teams grid + controls |
| Create | `src/pages/drivers.astro` | SEO shell for /drivers/ |
| Create | `src/pages/teams.astro` | SEO shell for /teams/ |
| Create | `vitest.config.js` | Vitest config |

---

### Task 1: Set up Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.js`

- [ ] **Install vitest:**
  ```bash
  npm install --save-dev vitest
  ```

- [ ] **Add test scripts to `package.json`** — in the `"scripts"` object, after `"astro": "astro"`:
  ```json
  "test": "vitest run",
  "test:watch": "vitest"
  ```

- [ ] **Create `vitest.config.js`:**
  ```javascript
  import { defineConfig } from 'vitest/config';
  export default defineConfig({ test: { environment: 'node' } });
  ```

- [ ] **Verify vitest works:**
  ```bash
  npx vitest --version
  ```
  Expected: prints a version number like `3.x.x`

- [ ] **Commit:**
  ```bash
  git add package.json vitest.config.js package-lock.json
  git commit -m "chore: add vitest for unit tests"
  ```

---

### Task 2: Create listingUtils.js with tests (TDD)

**Files:**
- Create: `src/lib/listingUtils.js`
- Create: `src/lib/listingUtils.test.js`

- [ ] **Write the failing tests first — create `src/lib/listingUtils.test.js`:**

```javascript
import { describe, it, expect } from 'vitest';
import { filterItems, sortItems, paginateItems, uniqueNationalities } from './listingUtils.js';

const DRIVERS = [
  { driverRef: 'hamilton', forename: 'Lewis', surname: 'Hamilton', nationality: 'British', firstYear: 2007, championships: 7, wins: 103 },
  { driverRef: 'schumacher', forename: 'Michael', surname: 'Schumacher', nationality: 'German', firstYear: 1991, championships: 7, wins: 91 },
  { driverRef: 'norris', forename: 'Lando', surname: 'Norris', nationality: 'British', firstYear: 2019, championships: 0, wins: 4 },
  { driverRef: 'albon', forename: 'Alexander', surname: 'Albon', nationality: 'Thai', firstYear: 2019, championships: 0, wins: 0 },
];

const TEAMS = [
  { constructorRef: 'ferrari', name: 'Ferrari', nationality: 'Italian', championships: 16, wins: 243 },
  { constructorRef: 'mclaren', name: 'McLaren', nationality: 'British', championships: 8, wins: 183 },
  { constructorRef: 'williams', name: 'Williams', nationality: 'British', championships: 7, wins: 114 },
];

describe('filterItems', () => {
  it('returns all items when no filters set', () => {
    expect(filterItems(DRIVERS, { search: '', nationality: '' })).toHaveLength(4);
  });
  it('filters drivers by name case-insensitively', () => {
    const result = filterItems(DRIVERS, { search: 'hamilton', nationality: '' });
    expect(result).toHaveLength(1);
    expect(result[0].driverRef).toBe('hamilton');
  });
  it('filters teams by name', () => {
    const result = filterItems(TEAMS, { search: 'mclaren', nationality: '' });
    expect(result).toHaveLength(1);
    expect(result[0].constructorRef).toBe('mclaren');
  });
  it('filters by nationality', () => {
    expect(filterItems(DRIVERS, { search: '', nationality: 'British' })).toHaveLength(2);
  });
  it('applies search and nationality together (AND logic)', () => {
    const result = filterItems(DRIVERS, { search: 'norris', nationality: 'British' });
    expect(result).toHaveLength(1);
    expect(result[0].driverRef).toBe('norris');
  });
  it('returns empty when no match', () => {
    expect(filterItems(DRIVERS, { search: 'zzz', nationality: '' })).toHaveLength(0);
  });
});

describe('sortItems', () => {
  it('sorts by championships desc', () => {
    const result = sortItems(DRIVERS, { field: 'championships', dir: 'desc' });
    expect(result[0].championships).toBeGreaterThanOrEqual(result[1].championships);
  });
  it('sorts by wins asc', () => {
    const result = sortItems(DRIVERS, { field: 'wins', dir: 'asc' });
    expect(result[0].wins).toBeLessThanOrEqual(result[1].wins);
  });
  it('sorts by surname alphabetically asc', () => {
    const result = sortItems(DRIVERS, { field: 'surname', dir: 'asc' });
    expect(result[0].surname).toBe('Albon');
  });
  it('sorts teams by name asc', () => {
    const result = sortItems(TEAMS, { field: 'name', dir: 'asc' });
    expect(result[0].name).toBe('Ferrari');
  });
  it('sorts by firstYear desc', () => {
    const result = sortItems(DRIVERS, { field: 'firstYear', dir: 'desc' });
    expect(result[0].firstYear).toBeGreaterThanOrEqual(result[1].firstYear);
  });
  it('does not mutate the original array', () => {
    const copy = [...DRIVERS];
    sortItems(DRIVERS, { field: 'wins', dir: 'asc' });
    expect(DRIVERS).toEqual(copy);
  });
});

describe('paginateItems', () => {
  it('returns first page', () => {
    const { items, totalPages } = paginateItems(DRIVERS, { page: 1, pageSize: 2 });
    expect(items).toHaveLength(2);
    expect(totalPages).toBe(2);
  });
  it('returns correct second page', () => {
    const { items } = paginateItems(DRIVERS, { page: 2, pageSize: 2 });
    expect(items[0].driverRef).toBe('norris');
  });
  it('returns empty array for page beyond total', () => {
    const { items } = paginateItems(DRIVERS, { page: 99, pageSize: 2 });
    expect(items).toHaveLength(0);
  });
  it('returns all items when pageSize exceeds total', () => {
    const { items, totalPages } = paginateItems(DRIVERS, { page: 1, pageSize: 100 });
    expect(items).toHaveLength(4);
    expect(totalPages).toBe(1);
  });
});

describe('uniqueNationalities', () => {
  it('returns sorted unique nationality list', () => {
    expect(uniqueNationalities(DRIVERS)).toEqual(['British', 'German', 'Thai']);
  });
  it('ignores null/undefined nationality values', () => {
    const items = [{ nationality: 'British' }, { nationality: null }, { nationality: undefined }];
    expect(uniqueNationalities(items)).toEqual(['British']);
  });
});
```

- [ ] **Run tests to confirm they fail:**
  ```bash
  npm test
  ```
  Expected: FAIL — "Cannot find module './listingUtils.js'"

- [ ] **Implement `src/lib/listingUtils.js`:**

```javascript
export function filterItems(items, { search, nationality }) {
  const q = search.trim().toLowerCase();
  return items.filter(item => {
    const name = `${item.forename || item.name || ''} ${item.surname || ''}`.toLowerCase();
    const matchesSearch = !q || name.includes(q);
    const matchesNat = !nationality || item.nationality === nationality;
    return matchesSearch && matchesNat;
  });
}

export function sortItems(items, { field, dir }) {
  const mult = dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const av = a[field] ?? (typeof b[field] === 'number' ? -Infinity : '');
    const bv = b[field] ?? (typeof a[field] === 'number' ? -Infinity : '');
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mult;
    return String(av).localeCompare(String(bv)) * mult;
  });
}

export function paginateItems(items, { page, pageSize }) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), totalPages };
}

export function uniqueNationalities(items) {
  return [...new Set(items.map(i => i.nationality).filter(Boolean))].sort();
}
```

- [ ] **Run tests and confirm they pass:**
  ```bash
  npm test
  ```
  Expected: all 16 tests pass

- [ ] **Commit:**
  ```bash
  git add src/lib/listingUtils.js src/lib/listingUtils.test.js
  git commit -m "feat(drivers-teams): listing utility functions with tests"
  ```

---

### Task 3: Enrich build-archive.mjs with last5 data

**Files:**
- Modify: `scripts/build-archive.mjs` (append at end)

The enrichment runs unconditionally at the end of the script, after all driver and team docs are written to disk. It reads each driver doc, computes `last5` (final 5 race points values), `number`, and `teamName`, updates the in-memory `index` array, builds a `teamRaceMap` from the same perRace data, uses it to compute team `last5`, then re-writes both index files.

- [ ] **Open `scripts/build-archive.mjs` and append this block at the very end of the file** (after the closing brace of the `if (postArchiveTeamYears > 0)` block that is currently the last thing in the file):

```javascript
// ─── Enrich index entries with last5 and display data ───────────────────────
{
  const teamRaceMap = new Map(); // constructorRef → Map<'year-round', {points,year,round}>

  for (const entry of index) {
    let doc;
    try {
      doc = JSON.parse(readFileSync(join(OUT, 'drivers', `${entry.driverRef}.json`), 'utf8'));
    } catch { continue; }

    const perRace = doc.perRace || [];
    entry.last5 = perRace.slice(-5).map(r => ({ points: r.points || 0, year: r.year, round: r.round }));
    entry.number = doc.number || null;
    entry.teamName = doc.perSeason?.[0]?.constructorName || null;

    for (const r of perRace) {
      if (!r.constructorRef) continue;
      if (!teamRaceMap.has(r.constructorRef)) teamRaceMap.set(r.constructorRef, new Map());
      const k = `${r.year}-${r.round}`;
      const ex = teamRaceMap.get(r.constructorRef).get(k);
      if (!ex) {
        teamRaceMap.get(r.constructorRef).set(k, { points: r.points || 0, year: r.year, round: r.round });
      } else {
        ex.points += r.points || 0;
      }
    }
  }
  writeFileSync(join(OUT, '_drivers-index.json'), JSON.stringify(index));

  for (const tEntry of teamsIndex) {
    const ref = tEntry.constructorRef;
    const races = teamRaceMap.has(ref)
      ? [...teamRaceMap.get(ref).values()].sort((a, b) => a.year - b.year || a.round - b.round)
      : [];
    tEntry.last5 = races.slice(-5).map(r => ({ points: r.points, year: r.year, round: r.round }));
  }
  writeFileSync(join(OUT, '_teams-index.json'), JSON.stringify(teamsIndex));
  console.log('[archive] enriched driver and team indexes with last5 data');
}
```

- [ ] **Run the archive build:**
  ```bash
  npm run build:archive
  ```
  Expected: completes without errors, last line printed includes "[archive] enriched driver and team indexes with last5 data"

- [ ] **Spot-check driver enrichment:**
  ```bash
  node -e "const d=JSON.parse(require('fs').readFileSync('public/data/archive/_drivers-index.json','utf8')); const h=d.find(x=>x.driverRef==='hamilton'); console.log(JSON.stringify({last5:h.last5,number:h.number,teamName:h.teamName},null,2));"
  ```
  Expected: `last5` is an array of 5 objects each with `points`, `year`, `round`; `number` is `"44"`; `teamName` is a non-null string

- [ ] **Spot-check team enrichment:**
  ```bash
  node -e "const t=JSON.parse(require('fs').readFileSync('public/data/archive/_teams-index.json','utf8')); const rb=t.find(x=>x.constructorRef==='red_bull'); console.log(JSON.stringify({last5:rb.last5},null,2));"
  ```
  Expected: `last5` is an array of up to 5 objects with `points`, `year`, `round`

- [ ] **Commit:**
  ```bash
  git add scripts/build-archive.mjs
  git commit -m "feat(drivers-teams): enrich archive index JSONs with last5, number, teamName"
  ```

---

### Task 4: Add CSS for listing pages

**Files:**
- Modify: `public/css/site.css` (append at end)

- [ ] **Append to the end of `public/css/site.css`:**

```css
/* ─── Drivers / Teams listing pages ──────────────────────────── */
.listing-controls {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.listing-controls input[type="search"],
.listing-controls select {
  padding: 6px 10px;
  border: 1px solid var(--line-1);
  border-radius: 6px;
  background: var(--bg-2);
  color: var(--fg-1);
  font-size: 14px;
}
.listing-controls input[type="search"] { flex: 1; min-width: 160px; }
.sort-bar {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.sort-btn {
  padding: 4px 10px;
  border: 1px solid var(--line-1);
  border-radius: 4px;
  background: none;
  color: var(--fg-2);
  font-size: 12px;
  cursor: pointer;
}
.sort-btn.active { border-color: var(--accent); color: var(--accent); }
.result-count { font-size: 12px; color: var(--fg-3); margin-bottom: 14px; }
.drivers-grid,
.teams-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}
@media (max-width: 720px) {
  .drivers-grid,
  .teams-grid { grid-template-columns: 1fr; }
}
.listing-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border: 1px solid var(--line-1);
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.listing-card:hover {
  border-color: var(--accent);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
}
.listing-card-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.listing-driver-photo {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}
.listing-driver-photo-fallback {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--bg-3);
  flex-shrink: 0;
}
.listing-card-name { font-size: 15px; font-weight: 600; line-height: 1.2; }
.listing-card-sub { font-size: 12px; color: var(--fg-3); }
.listing-stats { display: flex; gap: 16px; font-size: 12px; }
.listing-stats .lbl { color: var(--fg-3); margin-right: 3px; }
.listing-stats .val { font-weight: 600; }
.listing-team-bar { width: 4px; border-radius: 2px; align-self: stretch; flex-shrink: 0; }
.pagination {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
  padding-bottom: 32px;
}
.page-btn {
  padding: 5px 11px;
  border: 1px solid var(--line-1);
  border-radius: 4px;
  background: none;
  color: var(--fg-2);
  font-size: 13px;
  cursor: pointer;
}
.page-btn.active { border-color: var(--accent); color: var(--accent); font-weight: 600; }
.page-btn:disabled { opacity: 0.4; cursor: default; }
```

- [ ] **Commit:**
  ```bash
  git add public/css/site.css
  git commit -m "feat(drivers-teams): CSS for listing grid, cards, controls, pagination"
  ```

---

### Task 5: Create DriversIndexIsland and DriversIndexScreen

**Files:**
- Create: `src/components/islands/DriversIndexIsland.jsx`
- Create: `src/components/islands/screens/DriversIndexScreen.jsx`

- [ ] **Create `src/components/islands/DriversIndexIsland.jsx`:**

```jsx
import { useState, useEffect } from 'react';
import DriversIndexScreen from './screens/DriversIndexScreen.jsx';

export default function DriversIndexIsland() {
  const [drivers, setDrivers] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/data/archive/_drivers-index.json')
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(setDrivers)
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div className="page"><p className="page-sub">Failed to load drivers: {error}</p></div>;
  if (!drivers) return <div className="page"><p className="page-sub">Loading…</p></div>;
  return <DriversIndexScreen drivers={drivers} />;
}
```

- [ ] **Create `src/components/islands/screens/DriversIndexScreen.jsx`:**

```jsx
import { useState } from 'react';
import { MiniChart, urlFor } from '../../../lib/shared.jsx';
import { filterItems, sortItems, paginateItems, uniqueNationalities } from '../../../lib/listingUtils.js';

const PAGE_SIZE = 24;
const SORT_FIELDS = [
  { key: 'surname',       label: 'Name' },
  { key: 'nationality',   label: 'Nationality' },
  { key: 'firstYear',     label: 'First Year' },
  { key: 'championships', label: 'Titles' },
  { key: 'wins',          label: 'Wins' },
];

function DriverPhoto({ driverRef }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="listing-driver-photo-fallback" />;
  return (
    <img
      className="listing-driver-photo"
      src={`/images/drivers/${driverRef}.webp`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function Pagination({ page, totalPages, onPage }) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const visible = pages.filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2);
  return (
    <div className="pagination">
      <button className="page-btn" onClick={() => onPage(page - 1)} disabled={page === 1}>←</button>
      {visible.map((p, i) => {
        const prev = visible[i - 1];
        return (
          <span key={p}>
            {prev && p - prev > 1 && <span style={{ padding: '0 4px', color: 'var(--fg-3)' }}>…</span>}
            <button className={`page-btn${p === page ? ' active' : ''}`} onClick={() => onPage(p)}>{p}</button>
          </span>
        );
      })}
      <button className="page-btn" onClick={() => onPage(page + 1)} disabled={page === totalPages}>→</button>
    </div>
  );
}

export default function DriversIndexScreen({ drivers }) {
  const [search, setSearch] = useState('');
  const [nationality, setNationality] = useState('');
  const [sortField, setSortField] = useState('championships');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);

  const nationalities = uniqueNationalities(drivers);
  const filtered = filterItems(drivers, { search, nationality });
  // championships sort uses wins as tiebreaker (spec default: champs desc, wins desc)
  const sorted = (() => {
    if (sortField === 'championships') {
      const mult = sortDir === 'desc' ? 1 : -1;
      return [...filtered].sort((a, b) => {
        const cd = (b.championships - a.championships) * mult;
        return cd !== 0 ? cd : b.wins - a.wins;
      });
    }
    return sortItems(filtered, { field: sortField, dir: sortDir });
  })();
  const { items, totalPages } = paginateItems(sorted, { page, pageSize: PAGE_SIZE });

  const currentYear = new Date().getFullYear();

  function handleSort(field) {
    if (sortField === field) {
      if (sortDir === 'desc') setSortDir('asc');
      else { setSortField('championships'); setSortDir('desc'); }
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(1);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Drivers</h1>
          <div className="page-sub">{drivers.length} drivers · all time</div>
        </div>
      </div>

      <div className="listing-controls">
        <input
          type="search"
          placeholder="Search drivers…"
          value={search}
          onInput={e => { setSearch(e.target.value); setPage(1); }}
        />
        <select value={nationality} onChange={e => { setNationality(e.target.value); setPage(1); }}>
          <option value="">All nationalities</option>
          {nationalities.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      <div className="sort-bar">
        {SORT_FIELDS.map(({ key, label }) => (
          <button
            key={key}
            className={`sort-btn${sortField === key ? ' active' : ''}`}
            onClick={() => handleSort(key)}
          >
            {label}{sortField === key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
          </button>
        ))}
      </div>

      <p className="result-count">Showing {Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length}</p>

      <div className="drivers-grid">
        {items.map(driver => {
          const lastYear = driver.lastYear >= currentYear ? 'present' : driver.lastYear;
          const activeYears = driver.firstYear === driver.lastYear
            ? String(driver.firstYear)
            : `${driver.firstYear}–${lastYear}`;
          return (
            <a
              key={driver.driverRef}
              className="listing-card"
              href={urlFor({ name: 'driver', ref: driver.driverRef })}
            >
              <div className="listing-card-head">
                <DriverPhoto driverRef={driver.driverRef} />
                <div>
                  <div className="listing-card-name">{driver.forename} {driver.surname}</div>
                  <div className="listing-card-sub">
                    {driver.nationality}
                    {driver.number ? ` · #${driver.number}` : ''}
                  </div>
                  {driver.teamName && <div className="listing-card-sub">{driver.teamName}</div>}
                </div>
              </div>
              <div className="listing-card-sub">{activeYears}</div>
              <div className="listing-stats">
                <span><span className="lbl">🏆</span><span className="val">{driver.championships}</span></span>
                <span><span className="lbl">🏁</span><span className="val">{driver.wins}</span></span>
              </div>
              {driver.last5?.length > 0 && (
                <MiniChart values={driver.last5.map(r => r.points)} color="var(--accent)" width={70} height={20} />
              )}
            </a>
          );
        })}
      </div>

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPage={setPage} />}
    </div>
  );
}
```

- [ ] **Commit:**
  ```bash
  git add src/components/islands/DriversIndexIsland.jsx src/components/islands/screens/DriversIndexScreen.jsx
  git commit -m "feat(drivers): DriversIndexIsland and DriversIndexScreen"
  ```

---

### Task 6: Create TeamsIndexIsland and TeamsIndexScreen

**Files:**
- Create: `src/components/islands/TeamsIndexIsland.jsx`
- Create: `src/components/islands/screens/TeamsIndexScreen.jsx`

- [ ] **Create `src/components/islands/TeamsIndexIsland.jsx`:**

```jsx
import { useState, useEffect } from 'react';
import TeamsIndexScreen from './screens/TeamsIndexScreen.jsx';

export default function TeamsIndexIsland() {
  const [teams, setTeams] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/data/archive/_teams-index.json')
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(setTeams)
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div className="page"><p className="page-sub">Failed to load teams: {error}</p></div>;
  if (!teams) return <div className="page"><p className="page-sub">Loading…</p></div>;
  return <TeamsIndexScreen teams={teams} />;
}
```

- [ ] **Create `src/components/islands/screens/TeamsIndexScreen.jsx`:**

```jsx
import { useState } from 'react';
import { MiniChart, urlFor } from '../../../lib/shared.jsx';
import { filterItems, sortItems, paginateItems, uniqueNationalities } from '../../../lib/listingUtils.js';

const PAGE_SIZE = 24;
const SORT_FIELDS = [
  { key: 'name',          label: 'Name' },
  { key: 'nationality',   label: 'Nationality' },
  { key: 'firstYear',     label: 'First Year' },
  { key: 'championships', label: 'Titles' },
  { key: 'wins',          label: 'Wins' },
];

function Pagination({ page, totalPages, onPage }) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const visible = pages.filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2);
  return (
    <div className="pagination">
      <button className="page-btn" onClick={() => onPage(page - 1)} disabled={page === 1}>←</button>
      {visible.map((p, i) => {
        const prev = visible[i - 1];
        return (
          <span key={p}>
            {prev && p - prev > 1 && <span style={{ padding: '0 4px', color: 'var(--fg-3)' }}>…</span>}
            <button className={`page-btn${p === page ? ' active' : ''}`} onClick={() => onPage(p)}>{p}</button>
          </span>
        );
      })}
      <button className="page-btn" onClick={() => onPage(page + 1)} disabled={page === totalPages}>→</button>
    </div>
  );
}

export default function TeamsIndexScreen({ teams }) {
  const [search, setSearch] = useState('');
  const [nationality, setNationality] = useState('');
  const [sortField, setSortField] = useState('championships');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);

  const nationalities = uniqueNationalities(teams);
  const filtered = filterItems(teams, { search, nationality });
  const sorted = (() => {
    if (sortField === 'championships') {
      const mult = sortDir === 'desc' ? 1 : -1;
      return [...filtered].sort((a, b) => {
        const cd = (b.championships - a.championships) * mult;
        return cd !== 0 ? cd : b.wins - a.wins;
      });
    }
    return sortItems(filtered, { field: sortField, dir: sortDir });
  })();
  const { items, totalPages } = paginateItems(sorted, { page, pageSize: PAGE_SIZE });

  const currentYear = new Date().getFullYear();

  function handleSort(field) {
    if (sortField === field) {
      if (sortDir === 'desc') setSortDir('asc');
      else { setSortField('championships'); setSortDir('desc'); }
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(1);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Teams</h1>
          <div className="page-sub">{teams.length} constructors · all time</div>
        </div>
      </div>

      <div className="listing-controls">
        <input
          type="search"
          placeholder="Search teams…"
          value={search}
          onInput={e => { setSearch(e.target.value); setPage(1); }}
        />
        <select value={nationality} onChange={e => { setNationality(e.target.value); setPage(1); }}>
          <option value="">All nationalities</option>
          {nationalities.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      <div className="sort-bar">
        {SORT_FIELDS.map(({ key, label }) => (
          <button
            key={key}
            className={`sort-btn${sortField === key ? ' active' : ''}`}
            onClick={() => handleSort(key)}
          >
            {label}{sortField === key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
          </button>
        ))}
      </div>

      <p className="result-count">Showing {Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length}</p>

      <div className="teams-grid">
        {items.map(team => {
          const lastYear = team.lastYear >= currentYear ? 'present' : team.lastYear;
          const activeYears = team.firstYear === team.lastYear
            ? String(team.firstYear)
            : `${team.firstYear}–${lastYear}`;
          return (
            <a
              key={team.constructorRef}
              className="listing-card"
              href={urlFor({ name: 'team', ref: team.constructorRef })}
              style={{ borderLeftWidth: 4, borderLeftColor: team.color || 'var(--accent)' }}
            >
              <div className="listing-card-head">
                <div className="listing-team-bar" style={{ background: team.color || 'var(--accent)' }} />
                <div>
                  <div className="listing-card-name">{team.name}</div>
                  <div className="listing-card-sub">{team.nationality}</div>
                </div>
              </div>
              <div className="listing-card-sub">{activeYears}</div>
              <div className="listing-stats">
                <span><span className="lbl">🏆</span><span className="val">{team.championships}</span></span>
                <span><span className="lbl">🏁</span><span className="val">{team.wins}</span></span>
              </div>
              {team.last5?.length > 0 && (
                <MiniChart
                  values={team.last5.map(r => r.points)}
                  color={team.color || 'var(--accent)'}
                  width={70}
                  height={20}
                />
              )}
            </a>
          );
        })}
      </div>

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPage={setPage} />}
    </div>
  );
}
```

- [ ] **Commit:**
  ```bash
  git add src/components/islands/TeamsIndexIsland.jsx src/components/islands/screens/TeamsIndexScreen.jsx
  git commit -m "feat(teams): TeamsIndexIsland and TeamsIndexScreen"
  ```

---

### Task 7: Create Astro pages

**Files:**
- Create: `src/pages/drivers.astro`
- Create: `src/pages/teams.astro`

- [ ] **Create `src/pages/drivers.astro`:**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import DriversIndexIsland from '../components/islands/DriversIndexIsland.jsx';

const title = 'F1 Drivers - All Time | f1gures';
const description = 'Every Formula 1 driver from 1950 to today. Career wins, championships, and active years. Filter by nationality.';
const breadcrumb = [
  { name: 'Home', path: '/' },
  { name: 'Drivers', path: '/drivers/' },
];
---
<BaseLayout
  title={title}
  description={description}
  canonicalPath="/drivers/"
  ogType="website"
  breadcrumb={breadcrumb}
>
  <DriversIndexIsland client:load />
</BaseLayout>
```

- [ ] **Create `src/pages/teams.astro`:**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import TeamsIndexIsland from '../components/islands/TeamsIndexIsland.jsx';

const title = 'F1 Teams - All Time | f1gures';
const description = 'Every Formula 1 constructor from 1950 to today. Championships, wins, and active years. Filter by nationality.';
const breadcrumb = [
  { name: 'Home', path: '/' },
  { name: 'Teams', path: '/teams/' },
];
---
<BaseLayout
  title={title}
  description={description}
  canonicalPath="/teams/"
  ogType="website"
  breadcrumb={breadcrumb}
>
  <TeamsIndexIsland client:load />
</BaseLayout>
```

- [ ] **Commit:**
  ```bash
  git add src/pages/drivers.astro src/pages/teams.astro
  git commit -m "feat(drivers-teams): /drivers/ and /teams/ Astro pages"
  ```

---

### Task 8: Update Chrome.astro nav

**Files:**
- Modify: `src/components/Chrome.astro`

- [ ] **Add route detection** — in the `const route = {` block, add two new entries after `circuits`:
  ```astro
  circuits:    isRoute('/circuits') || isRoute('/circuit.html'),
  drivers:     isRoute('/drivers'),
  teams:       isRoute('/teams') || isRoute('/team.html'),
  ```

- [ ] **Update the `botActive` ternary** — add drivers and teams cases before the final `null`:
  ```astro
  const botActive =
    route.home       ? 'home' :
    route.standings  ? 'standings' :
    route.calendar   ? 'calendar' :
    route.circuits   ? 'circuits' :
    route.drivers    ? 'drivers' :
    route.teams      ? 'teams' : null;
  ```

- [ ] **Add desktop nav links** — after the existing Circuits `<a>` tag (currently the last nav item):
  ```astro
  <a class:list={['nav-item', { active: route.drivers }]} href="/drivers/">Drivers</a>
  <a class:list={['nav-item', { active: route.teams }]} href="/teams/">Teams</a>
  ```

- [ ] **Add mobile bottom nav items** — after the existing Circuits `<a>` botnav item:
  ```astro
  <a class:list={['botnav-item', { active: botActive === 'drivers' }]} href="/drivers/">
    <span class="botnav-icon">◉</span><span>Drivers</span>
  </a>
  <a class:list={['botnav-item', { active: botActive === 'teams' }]} href="/teams/">
    <span class="botnav-icon">◫</span><span>Teams</span>
  </a>
  ```

- [ ] **Commit:**
  ```bash
  git add src/components/Chrome.astro
  git commit -m "feat(nav): add Drivers and Teams links to Chrome nav"
  ```

---

### Task 9: Full build and verify

- [ ] **Run full build:**
  ```bash
  npm run build
  ```
  Expected: exits 0, no Astro errors

- [ ] **Confirm output pages exist:**
  ```bash
  ls dist/drivers/index.html dist/teams/index.html
  ```
  Expected: both files present

- [ ] **Start preview and check both pages render:**
  ```bash
  npm run preview
  ```
  Open http://localhost:4321/drivers/ — expected: page loads, island hydrates, grid of driver cards visible
  Open http://localhost:4321/teams/ — expected: same for teams

- [ ] **Test search:** type "hamilton" — expected: grid narrows to matching driver(s)

- [ ] **Test nationality filter:** select "British" — expected: only British entries shown

- [ ] **Test sort:** click "Wins" — expected: re-orders by wins descending; click again — ascending; click third time — resets to default (championships desc)

- [ ] **Test pagination:** if > 24 results, click page 2 — expected: next 24 shown, page 2 button active

- [ ] **Test card click:** click a driver card — expected: navigates to the `/drivers/<ref>/` detail page

- [ ] **Test nav links:** click Drivers and Teams in the desktop nav and the mobile bottom nav — expected: links active-highlight correctly

- [ ] **Run unit tests one final time:**
  ```bash
  npm test
  ```
  Expected: all tests pass
