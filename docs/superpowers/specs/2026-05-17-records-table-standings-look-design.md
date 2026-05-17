# Records table standings-row look

Date: 2026-05-17
Status: spec, awaiting implementation
Scope: PR 2 on this branch (PR 1 was the data-table consistency baseline).

## Problem

The records leaderboard tables now use `.data-table` (PR 1), which gave them visual parity with `/drivers/<ref>/` and `/races/<y>/<r>/`. The user wants a richer look modelled on `/standings-drivers/`:

- 28x28 rounded driver headshot
- Lipis flag image (not the regional-indicator emoji)
- Team-color left border strip on the name cell
- "First **Last**" with the surname bolded
- Mono code badge after the name
- Gold/silver/bronze position colours for ranks 1/2/3
- Whole-row clickable with a chevron at the end of the last cell
- Hover background and even-row striping

The standings page achieves this with `class="tbl"` and a React `DriverCell` island; the records pages are pure server-rendered Astro.

## Goal

Switch `RecordsTable.astro` to render rows that look identical to standings rows, in static Astro markup, while keeping records-specific features (rank ties, value/context columns, era toggle, sub-page note, team subject type, driver-at-circuit subject type).

## Data shape change

Update `scripts/records/generators.mjs` so every entry carries `first` and `last` (sourced from `d.forename` / `d.surname`) in addition to the existing `name`. Eight generator functions emit driver entries:

1. `generateDriverCareerEntries`
2. `generateWinsInSeasonEntries`
3. `generateStreakEntries`
4. `generateTitleMarginEntries`
5. `generateYoungestChampionEntries`
6. `generateOldestWinnerEntries`
7. `generateDriverAtCircuitEntries`
8. Anywhere else `name: \`${d.forename} ${d.surname}\`` appears

Each becomes:

```js
{
  ...
  name: `${d.forename} ${d.surname}`,
  first: d.forename,
  last: d.surname,
  ...
}
```

Team-subject generators (`generateTeamCareerEntries`, `generateTeam12FinishesEntries`) do not need `first`/`last`.

Update `src/components/RecordsTable.astro` `Entry` interface to declare `first?: string` and `last?: string`.

Update `scripts/records/generators.test.js` to assert the new fields appear on driver entries.

Regeneration: `npm run build:archive` (run automatically by `npm run dev` / `npm run build` predev hook).

## Markup

### `src/components/RecordsTable.astro`

The frontmatter stays the same shape, plus one helper import for flag-cc-from-emoji fallback. The template is rewritten.

#### Frontmatter additions

```ts
import { ccFromFlag } from '../lib/shared.jsx';  // pure function, safe to import in Astro frontmatter
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

interface Entry {
  rank: number;
  value: number;
  valueLabel: string;
  driverRef?: string;
  constructorRef?: string;
  name: string;
  first?: string;          // NEW
  last?: string;           // NEW
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

function flagCode(e: Entry): string | null {
  if (e.country) return e.country.toLowerCase();
  const fromEmoji = ccFromFlag(e.flag);
  return fromEmoji ? fromEmoji.toLowerCase() : null;
}

function headshotExists(driverRef?: string): boolean {
  if (!driverRef) return false;
  return existsSync(resolve(process.cwd(), 'public', 'images', 'drivers', `${driverRef}.webp`));
}

function rowHref(e: Entry, subjectType: string): string | null {
  if (subjectType === 'team') return e.constructorRef ? `/teams/${e.constructorRef}/` : null;
  return e.driverRef ? `/drivers/${e.driverRef}/` : null;
}
```

#### Template

```astro
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
          const href = rowHref(e, subjectType);
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

Key points:

- Outer wrapper is still `<div class="panel">` (matches PR 1), but with an additional `records-table-panel` class for records-specific scoping and the existing `data-era-table` / `hidden` attributes for the era toggle.
- Inside, `<div class="tbl-wrap">` wraps the table so it can scroll horizontally — standings does the same.
- The table is `<table class="tbl">` not `.data-table`.
- Each row is `<tr class="clickable" onclick="...">`. The inline `onclick` is fine for static HTML — no event listener wiring needed.
- The `--team-color` CSS custom property is set on the `<tr>` via inline style. Sub-elements (the `.col-name` `border-left`, the silhouette tint) read it via `var(--team-color)`.
- Inner `<a>` elements still exist for SEO and accessibility; they call `event.stopPropagation()` to prevent double-navigation when the row click fires too.
- The `<th class="col-value">` and `<td class="col-value">` add the `right` class to right-align values.
- The flag uses `<img class="flag-img">` directly (the existing `.flag-img` rule in app.css already styles it).
- Code badge `<span class="driver-code">` uses the existing class (already styled in app.css).

### `src/pages/records/[topic].astro`

No change needed. The script that flips `hidden` on `[data-era-table]` still works — the attribute is on the wrapping `<div class="panel records-table-panel">`.

## CSS

### Add to `public/css/app.css`

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

### Remove from `public/css/app.css`

The block added by PR 1 of this branch:

```css
/* Records sub-page column tweaks (sit on top of .data-table) */
.records-table-wrap .col-rank { width: 44px; font-variant-numeric: tabular-nums; color: var(--fg-3); }
.records-table-wrap .col-value { font-variant-numeric: tabular-nums; font-weight: 700; }
.records-table-wrap .col-context { color: var(--fg-3); }

@media (max-width: 720px) {
  .records-table-wrap .col-context { display: none; }
}
```

is replaced by the new `.tbl`-scoped equivalent above.

## Out of scope

- Sortable column headers (records have a fixed sort by value)
- Δ change indicator (records are all-time, no change concept)
- "Last N" sparkline column (standings-specific)
- New driver headshots for historic drivers (silhouette fallback covers them)
- Classic-era (1950-1980) toggle — still a separate follow-up

## Risk and verification

- `min-width: 720px` on `.tbl` introduces horizontal scroll on mobile records pages. Matches existing `.tbl` behaviour on standings.
- Whole-row clickable with inline `onclick`: works without JS bundle, no event-listener wiring needed. Inner anchors call `event.stopPropagation()` to prevent double-navigation.
- Records data without `country` and without a decodable `flag` (very rare in modern data) renders no flag image. Same fallback behaviour as before.
- The team subject type has no headshot/flag/code (correctly), only the existing color chip and team name + the new team-color border-left strip on the name cell for visual parity.
- Silhouette fallback is a flat team-color disc at 60% opacity. At 28x28 the row still has the right shape weight without trying to draw a face.

Verification steps after implementation:

1. `npm run dev` → http://localhost:4322/records/wins/ — confirm headshot for modern drivers (Hamilton, Verstappen), silhouette for historic (Fangio, Stewart), lipis flag image (🇬🇧 → `gb.svg`), "Lewis **Hamilton**" with bolded surname, `HAM` code badge, gold P1 / silver P2 / bronze P3 position colours, hover bg, row striping, chevron at the right end of each row, whole-row click navigating.
2. http://localhost:4322/records/team-wins/ — confirm team-color chip + team-color border-left strip on name cell; rank colours; row click navigates to team page.
3. http://localhost:4322/records/wins-at-circuit/ — confirm driver treatment + circuit column.
4. http://localhost:4322/drivers/hamilton/ and http://localhost:4322/races/2024/1/ — confirm zero visual regression (these still use `.data-table`).
5. Era toggle — confirm both era tables render with the new look.
6. Mobile width (375px) — horizontal scroll, context column hidden.
7. Light mode — confirm header bg, flag border, silhouette tint all readable.
