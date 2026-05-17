# Records table style consistency

Date: 2026-05-17
Status: spec, awaiting implementation
Scope: PR 1 of 2. The Classic-era toggle (1950-1980) is a separate follow-up spec/PR.

## Problem

The leaderboard tables on `/records/<record>/` use a bespoke `.records-table` style that diverges from every other data table on the site. The reference style is `.data-table`, used by `/drivers/<driverRef>/` and `/races/<year>/<round>/`.

Concrete differences today:

| Aspect            | `.records-table` (records pages)                              | `.data-table` (drivers/races pages)                                          |
|-------------------|---------------------------------------------------------------|------------------------------------------------------------------------------|
| Wrapper           | none                                                          | `<div class="panel" style="padding: 0; overflow-x: auto;">`                  |
| Header font       | `var(--f-mono)`                                               | `var(--f-display)` weight 600                                                |
| Header background | none, not sticky                                              | `var(--bg-2)`, `position: sticky; top: 0;`                                   |
| Padding / size    | 8px 10px / 14px                                               | 8px 12px / 13px                                                              |
| Anchor affordance | `border-bottom: 1px dashed transparent`, solid `--fg-3` hover | PR #96 inline-link pattern: underline at 35% currentColor, hover bumps width |

The `.data-table` rules are currently duplicated as scoped `<style>` blocks inside `src/components/DriverPage.astro` and `src/components/RacePage.astro`. A third copy on the records page would add to that duplication.

## Goal

Make `/records/<record>/` tables visually identical to `/drivers/<driverRef>/` and `/races/<year>/<round>/` tables, by adopting `.data-table` site-wide. Also bring the page chrome into line with other detail pages by adding a back-button to the records hub.

Records-specific elements stay: rank/value/context column treatments, driver-flag emoji prefix, team-color chip, era toggle, sub-page note callout.

## Approach

Promote `.data-table` from per-page scoped styles to `public/css/app.css`. Switch `RecordsTable.astro` to use it. Strip the now-redundant per-page copies. Keep records-specific column tweaks scoped under `.records-table-wrap`.

## Changes

### 1. `public/css/app.css` - promote `.data-table` to a global rule

Add a new `.data-table` block. Same selectors and values as the existing scoped definitions in DriverPage/RacePage:

```css
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th, .data-table td { padding: 8px 12px; border-bottom: 1px solid var(--line-1); text-align: left; }
.data-table th {
  font-family: var(--f-display);
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
  background: var(--bg-2);
  position: sticky;
  top: 0;
}
.data-table tr:last-child td { border-bottom: 0; }
.data-table .right { text-align: right; }
.data-table .is-champ-cell,
.data-table .is-win-cell { color: var(--accent); font-weight: 700; }
.data-table a { color: inherit; text-decoration: none; border-bottom: 1px dotted var(--line-2); }

@media (max-width: 720px) {
  .data-table th, .data-table td { padding: 6px 8px; }
}
```

The `:where(.data-table a, ...)` rule introduced by PR #96 (already in `public/css/app.css:984`) overrides the `border-bottom` rule above with `!important` and applies the consistent inline-link affordance. No further work needed for that.

### 2. `public/css/app.css` - remove the old `.records-table` block

Delete lines `1630-1642`:

```
.records-table { ... }
.records-table th, .records-table td { ... }
.records-table th { ... }
.records-table .col-rank { ... }
.records-table .col-value { ... }
.records-table a { ... }
.records-table a:hover { ... }
.records-table .text-muted { ... }

@media (max-width: 720px) {
  .records-table .col-context { ... }
  .records-table th, .records-table td { ... }
}
```

Keep `.records-flag`, `.records-flag-sm`, `.records-team-chip`, `.records-team-chip-sm`, `.records-era-toggle`, `.records-note`, `.records-page*` - those are orthogonal to the table style.

### 3. `public/css/app.css` - records-specific column tweaks

Add a small `.records-table-wrap` scoped block for the leaderboard-only column treatments that don't belong on every data-table:

```css
.records-table-wrap .col-rank { width: 44px; font-variant-numeric: tabular-nums; color: var(--fg-3); }
.records-table-wrap .col-value { font-variant-numeric: tabular-nums; font-weight: 700; }
.records-table-wrap .col-context { color: var(--fg-3); }

@media (max-width: 720px) {
  .records-table-wrap .col-context { display: none; }
}
```

`.text-muted` usages inside the table become `.col-context` (already the column class) - no separate `.text-muted` selector needed.

### 3a. `src/pages/records/[topic].astro` - add back link to records hub

Other detail pages on the site have a ghost back-button to their parent listing as the first element in `<main>`:

- DriverPage: `← Standings` -> `/standings-drivers/`
- TeamPage: `← Constructors` -> `/standings-constructors/`
- RacePage: `← Calendar` -> `/calendar/`
- CircuitPage: `← Circuits` -> `/circuits/`

`[topic].astro` is missing one. Add the same pattern as the first element inside `<main class="records-page records-sub">`, before `<header class="records-page-head">`:

```astro
<a class="btn btn-ghost btn-sm" style="margin-bottom: 12px" href="/records/">← Records</a>
```

The `.btn .btn-ghost .btn-sm` classes already exist in `public/css/app.css`. No new CSS. Breadcrumb in `<head>` already covers the same nav semantically; this is the visual affordance.

### 4. `src/components/RecordsTable.astro` - swap class, wrap in panel

- Wrap the `<table>` in `<div class="panel" style="padding: 0; overflow-x: auto;">`.
- Change `class="records-table"` to `class="data-table"`.
- Keep the existing flag span: `{e.flag && <span class="records-flag">{e.flag}</span>}` immediately before the driver-name anchor. This is records-only context not present on driver/race tables.
- Keep the team-color chip the same way for `subjectType === 'team'`.
- Drop the inline `style={e.teamColor ? \`border-left: 3px solid ${e.teamColor}; padding-left: 6px;\` : ''}` on the team-column anchor for driver-subject rows. (Optional - keep if the team accent line is wanted; remove for cleaner consistency with DriverPage's team column. Decision: **keep**, it's a useful team-tint signal and doesn't conflict with the data-table style.)
- Replace `<td class="col-context text-muted">` with `<td class="col-context">` (`.col-context` already sets `color: var(--fg-3)` via the new rule).
- For the missing-team fallback on driver rows, change `<span class="text-muted">—</span>` to `<span>-</span>`. Drops the now-orphaned `text-muted` class (records was its only consumer; rule deleted in change 2) and switches the em-dash to an ASCII hyphen per project preference. Visually: a normal-coloured `-` instead of a grey em-dash. Consistent with DriverPage / RacePage which use plain `-` for empty cells.

The `data-era-table` attribute and `hidden={!isDefault}` flip stay - era toggle behaviour is unchanged.

### 5. `src/components/DriverPage.astro` - delete redundant scoped rules

Remove the `.data-table` rules from the component's `<style>` block (currently around lines 368-391). Other scoped rules in that block stay.

### 6. `src/components/RacePage.astro` - delete redundant scoped rules

Remove the `.data-table` rules from its `<style>` block (currently around lines 180-186). Keep `.code-tag` and any other RacePage-specific rules.

## Non-changes

- Era toggle UI and its inline `<script>` are untouched.
- `public/data/archive/records/*.json` shape unchanged.
- `scripts/records/*` untouched.
- `src/pages/records/index.astro` (the hub) - tables there use a different layout (top-5 sparkline cards); not in scope.
- DriverPage/RacePage other styles untouched.
- The records page-header (`.records-page-head`, `.records-sub`) stays.

## Risk and verification

- CSS hash bumps once (`?v=<hash>` cache-bust handles propagation).
- Visual diff on driver and race pages should be **zero** - the `.data-table` rules in app.css are byte-identical to what currently lives in their scoped styles.
- Visual diff on records pages: new panel wrapper, different header typography, table padding shrinks by 2px horizontally and font-size drops 14px to 13px, link underline pattern changes (PR #96 style).
- No JS changes. No data-shape changes. No new dependencies.

Verification steps after implementation:
1. `npm run dev` -> http://localhost:4321/records/wins/ - confirm panel wrap, sticky header background, PR #96 underline on driver-name links.
2. http://localhost:4321/drivers/hamilton/ - confirm no visual regression.
3. http://localhost:4321/races/2024/1/ - confirm no visual regression.
4. Toggle era buttons on a records page - confirm both tables render identically.
5. Light-mode toggle - confirm sticky header and link underline still legible.
6. Mobile (resize <= 720px) - confirm context column hides, padding shrinks.

## Out of scope (follow-up PR)

Classic era (1950-1980) toggle on records pages. Adds a third bucket to the records JSON (`classic.top50`), a third button on the `[topic].astro` era-toggle, an inverted era filter in `scripts/records/generators.mjs`, and corresponding test cases. Separate spec.
