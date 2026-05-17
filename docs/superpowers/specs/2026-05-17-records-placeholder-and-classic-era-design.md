# Records placeholder restyle + Classic-era toggle

Date: 2026-05-17
Status: spec, awaiting implementation
Scope: PR 3 on this branch. Two related changes bundled.

## Section A: striped placeholder (silhouette restyle)

Replace the flat team-color disc fallback for drivers without curated headshots with a diagonal-stripe pattern in a rounded square. Real WebP headshots stay circular; the shape change to placeholders signals "no photo, not a real headshot."

**`public/css/app.css`** — replace the existing `.records-row-headshot.silhouette` rule:

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

Notes:
- 135° diagonal stripes, 4px stripe / 4px gap, tinted to the row's team color.
- 6px radius distinguishes placeholders from circular real photos (`border-radius: 50%` on the parent rule).
- 0.7 opacity keeps the muted-vs-real-photo visual hierarchy.

No markup change — `RecordsTable.astro` already renders `<div class="records-row-headshot silhouette">` for drivers without WebPs.

## Section B: Classic era (1950-1980) toggle

Add a third era bucket on `/records/<topic>/` sub-pages, mirroring the existing `all-time` / `modern` pattern.

### B1. Data pipeline

**`scripts/records/helpers.mjs`** — extend `filterPerRaceByEra` to handle the inverse cutoff:

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

**`scripts/records/generators.mjs`** — add the inverse year guard at every place the modern check appears inline (not through `filterPerRaceByEra`):

- `countStat` championship branch — after `if (era === 'modern' && year < 1981) continue;` add `if (era === 'classic' && year >= 1981) continue;`
- `generateTitleMarginEntries` — same near `if (era === 'modern' && year < 1981) continue;`
- `generateYoungestChampionEntries` champYears filter — change `.filter(y => y !== currentYear && (era !== 'modern' || y >= 1981))` to `.filter(y => y !== currentYear && (era !== 'modern' || y >= 1981) && (era !== 'classic' || y < 1981))`
- `generateTeamCareerEntries` titles branch — same as countStat
- `generateTeam12FinishesEntries` — `if (era === 'classic' && r.year >= 1981) continue;` after the modern check

**`scripts/records/index.mjs`** — dispatch a third era. Inside the `for (const cfg of RECORD_CONFIGS)` loop, add `const classic = dispatch(cfg.id, ..., 'classic', currentYear);`, attach team color, and emit two new keys:

- `byTopic[cfg.id].classic = { top50: classic.slice(0, TOP50).map(strip) }`
- `indexRecordsByGroup.get(cfg.group).push({ ..., classic: { top5: classicTop5 } })`

### B2. Tests

**`scripts/records/generators.test.js`** — add one assertion verifying the classic-era filter on `generateDriverCareerEntries`. The existing "modern-era filter drops a pre-1981 row" test uses Lauda with 1975 + 1984 rows; add a sibling test that runs the same setup with `era: 'classic'` and expects `value` to be 1 (only the 1975 win counts).

### B3. UI

**`src/components/RecordsTable.astro`** — extend the prop type union:

```ts
era: 'all-time' | 'modern' | 'classic';
```

No other change. `const isDefault = era === 'all-time';` stays correct (only the all-time table renders visible by default; era-toggle script handles flipping).

**`src/pages/records/[topic].astro`** — add the third toggle button and third `RecordsTable` component.

- In `.records-era-toggle`, add a third button after the modern one:

  ```astro
  <button data-era-toggle="classic" aria-pressed="false">Classic era (1950-1980)</button>
  ```

- In `.records-table-wrap`, add a third `<RecordsTable>` after the modern one:

  ```astro
  <RecordsTable entries={data.classic?.top50 || []} subjectType={data.subjectType} era="classic" />
  ```

  Using `?.` because old records JSON (gitignored cache) might not have `classic` yet; `npm run build:archive` will regenerate.

The era-toggle inline script in `[topic].astro` already does `wrap.querySelectorAll('[data-era-table]').forEach(...)` — it handles any number of era panels without modification.

## Risks

- Records with zero qualifying classic entries render an empty `<tbody>`. Visually fine — just a panel with headers and no rows. No special-case needed.
- Three side-by-side era buttons may wrap on narrow screens. The existing `.records-era-toggle` uses `inline-flex` without `flex-wrap`. Acceptable on mobile (page already scrolls horizontally for the table).
- Existing tests assert `era === 'modern'` outcomes. The new classic filter shouldn't change any of them — it only matters when `era === 'classic'` is passed, which is a new code path.

## Out of scope

- Hub-level era filtering on `/records/` (cards stay all-time).
- CircuitPage / TeamPage `.data-table` cleanup (still deferred).
- No new generator types or record topics — pre-1981 just gets the same 17 topics as the other two eras.
