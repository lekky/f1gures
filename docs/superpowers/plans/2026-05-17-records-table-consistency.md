# Records Table Style Consistency - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/records/<record>/` tables visually consistent with `/drivers/<driverRef>/` and `/races/<year>/<round>/` tables by adopting the site-wide `.data-table` class. Also add a back-button to the records hub on `[topic].astro`.

**Architecture:** Promote the `.data-table` rules currently duplicated in DriverPage/RacePage `<style>` blocks into `public/css/app.css` as a single canonical block. Switch `RecordsTable.astro` to use it. Keep records-specific column tweaks (rank/value/context column treatments, flags, team chips, era toggle, note callout) under a `.records-table-wrap` scope.

**Tech Stack:** Astro 4 SSG, plain CSS, no JS changes.

**Spec:** [docs/superpowers/specs/2026-05-17-records-table-consistency-design.md](../specs/2026-05-17-records-table-consistency-design.md)

---

## Task ordering and concurrency

Tasks are grouped into phases. Phase 1 must complete first. Within phases 2 and 3, tasks operate on disjoint files and may be dispatched concurrently to separate subagents. Phase 4 is verification only.

- **Phase 1 (single task):** Promote/cleanup `public/css/app.css`
- **Phase 2 (2 tasks, concurrent):** RecordsTable markup + back-button on [topic].astro
- **Phase 3 (2 tasks, concurrent):** DriverPage scoped-CSS cleanup + RacePage scoped-CSS cleanup
- **Phase 4 (single task):** Visual verification on dev server

---

## Phase 1: Promote `.data-table` to app.css

### Task 1: Update `public/css/app.css`

**Files:**
- Modify: `public/css/app.css` (three edits: add `.data-table` block, remove old `.records-table` block, add `.records-table-wrap` scoped rules)

- [ ] **Step 1: Add the canonical `.data-table` block**

Open `public/css/app.css`. Locate the inline-link affordance section at line 838 (the line beginning `.inline-link { color: inherit; text-decoration: underline; ...`). Immediately AFTER that line and its companion `.inline-link:hover { ... }` and `html.light .inline-link { ... }` rules (line 840), but BEFORE the PR #96 affordance section that starts at line 842 with `/* ============================================================` `CONTENT LINK AFFORDANCE`, insert a new section:

```css

/* ============================================================
   DATA TABLE (shared)
   Used by DriverPage, RacePage, RecordsTable. The inline-link
   affordance section below targets `.data-table a` via :where()
   and overrides the dotted border-bottom with the consistent
   underline pattern.
   ============================================================ */
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

The exact insertion point: after the existing `html.light .inline-link { ... }` rule on line 840, before the comment block starting `/* ============================================================` on line 842.

- [ ] **Step 2: Remove the old `.records-table` block**

Still in `public/css/app.css`, locate the `/* Top-50 table */` comment at line 1629 and the rules below it (line 1630 through line 1642 inclusive). Delete those lines entirely:

```css
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

Replace the deleted block with the records-specific column tweaks (`.records-table-wrap` scope):

```css
/* Records sub-page column tweaks (sit on top of .data-table) */
.records-table-wrap .col-rank { width: 44px; font-variant-numeric: tabular-nums; color: var(--fg-3); }
.records-table-wrap .col-value { font-variant-numeric: tabular-nums; font-weight: 700; }
.records-table-wrap .col-context { color: var(--fg-3); }

@media (max-width: 720px) {
  .records-table-wrap .col-context { display: none; }
}
```

The `/* Sub-page era toggle */`, `.records-era-toggle`, `.records-note` and `.records-flag*` / `.records-team-chip*` rules above and below stay untouched.

- [ ] **Step 3: Verify the file parses**

Run: `node --check public/css/app.css 2>&1 || echo "(node can't lint CSS, that's fine)"` then check the new content by grepping for both new selectors:

```
rg -n "^\.data-table " public/css/app.css
rg -n "^\.records-table-wrap " public/css/app.css
rg -n "^\.records-table " public/css/app.css
```

Expected:
- 4-5 hits for `.data-table` (the new block)
- 3 hits for `.records-table-wrap`
- 0 hits for `.records-table` (old block gone)

- [ ] **Step 4: Commit**

```bash
git add public/css/app.css
git commit -m "feat(records): promote .data-table to global rule, retire .records-table

Promote the .data-table styles (currently duplicated as scoped <style>
blocks in DriverPage.astro and RacePage.astro) into public/css/app.css
as a single canonical rule. Retire the bespoke .records-table block;
the records sub-pages adopt .data-table in a follow-up commit and the
duplicate scoped copies in DriverPage/RacePage are removed in their
own commits.

Records-specific column treatments (rank, value, context) move under
a .records-table-wrap scope. Flag / team-chip / era-toggle / note
classes are unchanged."
```

---

## Phase 2: Update records markup (2 concurrent tasks)

### Task 2: Update `src/components/RecordsTable.astro`

Operates on a different file from Task 3. May be dispatched concurrently with Task 3.

**Files:**
- Modify: `src/components/RecordsTable.astro`

- [ ] **Step 1: Update the type signature (no era restriction needed)**

No type changes needed for this PR. The `era: 'all-time' | 'modern'` prop stays as-is; the third-era addition is a follow-up PR.

- [ ] **Step 2: Rewrite the template**

Replace the entire frontmatter-after section (lines 35-81) with:

```astro
<div class="panel" data-era-table={era} hidden={!isDefault} style="padding: 0; overflow-x: auto;">
  <table class="data-table">
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
              ) : <span>-</span>}
            </td>
          )}
          <td class="col-value">{e.valueLabel}</td>
          <td class="col-context">{e.context || ''}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

Key changes from the previous version:
- Outermost element is now `<div class="panel" data-era-table=... hidden=... style="padding: 0; overflow-x: auto;">`, with the table inside. The era toggle script in `[topic].astro` flips the `hidden` attribute by selecting `[data-era-table]`, so moving that attribute from the `<table>` to the wrapping `<div>` works without script changes.
- `<table class="records-table">` becomes `<table class="data-table">`.
- The missing-team fallback `<span class="text-muted">—</span>` becomes `<span>-</span>` (drops the orphaned `text-muted` class and replaces the em-dash with an ASCII hyphen per project preference).
- The context cell `<td class="col-context text-muted">` becomes `<td class="col-context">` (the `.records-table-wrap .col-context` rule from Phase 1 supplies the grey color).
- Comment in the file header `// The sub-page includes two copies of this component (one per era); the era toggle script flips `hidden` between them.` stays correct.

- [ ] **Step 3: Verify the file parses**

Run: `npx astro check 2>&1 | head -40` if available, or just `rg -n "records-table|text-muted|—" src/components/RecordsTable.astro`.

Expected: no hits for any of `records-table`, `text-muted`, em-dash `—`.

- [ ] **Step 4: Commit**

```bash
git add src/components/RecordsTable.astro
git commit -m "feat(records): adopt site-wide .data-table style on records sub-page tables

- Switch outer wrapper to a <div class=\"panel\"> (matches DriverPage /
  RacePage pattern: padding: 0; overflow-x: auto;).
- Move the data-era-table / hidden attributes from <table> to the
  wrapping <div> so the era toggle script keeps working.
- <table class=\"records-table\"> -> <table class=\"data-table\">.
- Drop the orphaned .text-muted class on the missing-team fallback
  span; replace the em-dash with an ASCII hyphen.
- Drop .text-muted from the context cell; .records-table-wrap
  .col-context supplies the grey colour."
```

---

### Task 3: Add back-button to `src/pages/records/[topic].astro`

Operates on a different file from Task 2. May be dispatched concurrently with Task 2.

**Files:**
- Modify: `src/pages/records/[topic].astro`

- [ ] **Step 1: Add the back-button at the top of `<main>`**

Find the `<main class="records-page records-sub">` line (currently line 55 of [src/pages/records/[topic].astro](../../src/pages/records/[topic].astro)) and insert a back-button as its first child, before `<header class="records-page-head">`.

Before:

```astro
  <main class="records-page records-sub">
    <header class="records-page-head">
      <h1>{data.title}</h1>
      <p class="page-sub">{data.blurb}</p>
    </header>
```

After:

```astro
  <main class="records-page records-sub">
    <a class="btn btn-ghost btn-sm" style="margin-bottom: 12px" href="/records/">← Records</a>
    <header class="records-page-head">
      <h1>{data.title}</h1>
      <p class="page-sub">{data.blurb}</p>
    </header>
```

This mirrors the back-button on every other detail page (DriverPage, TeamPage, RacePage, CircuitPage). The `.btn .btn-ghost .btn-sm` classes are already defined in `public/css/app.css`; no CSS work.

- [ ] **Step 2: Verify**

Run: `rg -n "btn-ghost.*Records" src/pages/records/[topic].astro`.
Expected: one hit on the inserted line.

- [ ] **Step 3: Commit**

```bash
git add "src/pages/records/[topic].astro"
git commit -m "feat(records): add back-button to records hub on sub-pages

Matches the DriverPage/TeamPage/RacePage/CircuitPage pattern of a
.btn.btn-ghost.btn-sm \"← Parent\" link as the first element in
<main>. Breadcrumbs already cover the same nav semantically; this is
the visual affordance."
```

---

## Phase 3: Remove redundant scoped `.data-table` rules (2 concurrent tasks)

### Task 4: `src/components/DriverPage.astro` - delete scoped `.data-table` rules

Operates on a different file from Task 5. May be dispatched concurrently with Task 5.

**Files:**
- Modify: `src/components/DriverPage.astro` (delete lines 368-391)

- [ ] **Step 1: Delete the scoped `.data-table` block**

Open `src/components/DriverPage.astro`. Find the `<style>` block at the bottom of the file. Delete the entire `.data-table` rule group at lines 368-391:

```css
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .data-table th, .data-table td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--line-1);
    text-align: left;
  }
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
  .data-table .is-champ-cell, .data-table .is-win-cell { color: var(--accent); font-weight: 700; }
```

Keep the preceding `.stat-accent { ... }` rules at lines 365-366 and the closing `</style>` at line 392.

- [ ] **Step 2: Verify**

Run: `rg -n "\.data-table" src/components/DriverPage.astro`.
Expected: only hits should be in the page template (e.g. `<table class="data-table">`), not in the `<style>` block. Run `rg -n "is-champ-cell|is-win-cell" src/components/DriverPage.astro` — both are still used as inline classes in the template; that's expected.

- [ ] **Step 3: Commit**

```bash
git add src/components/DriverPage.astro
git commit -m "refactor(driver): drop scoped .data-table CSS, use global rule from app.css

Site-wide .data-table rule lives in public/css/app.css now (added in
a prior commit). This scoped copy is byte-identical and redundant;
removing it removes duplication. Visual output unchanged."
```

---

### Task 5: `src/components/RacePage.astro` - delete scoped `.data-table` rules

Operates on a different file from Task 4. May be dispatched concurrently with Task 4.

**Files:**
- Modify: `src/components/RacePage.astro` (delete lines 180-186)

- [ ] **Step 1: Delete the scoped `.data-table` block**

Open `src/components/RacePage.astro`. Find the `<style>` block. Delete lines 180-186:

```css
  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table th, .data-table td { padding: 8px 12px; border-bottom: 1px solid var(--line-1); text-align: left; }
  .data-table th { font-family: var(--f-display); font-weight: 600; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--fg-3); background: var(--bg-2); position: sticky; top: 0; }
  .data-table tr:last-child td { border-bottom: 0; }
  .data-table .right { text-align: right; }
  .data-table .is-win-cell { color: var(--accent); font-weight: 700; }
  .data-table a { color: inherit; text-decoration: none; border-bottom: 1px dotted var(--line-2); }
```

KEEP the surrounding rules:
- `.race-hero-podium`, `.podium-step`, `.podium-1/2/3`, `.podium-pos`, `.podium-name a`, `.podium-team a` (lines 160-172) - these are RacePage-only.
- `.code-tag` (line 187) - RacePage-only.
- `.race-nav`, `.race-upcoming-grid`, etc. (line 189+).

- [ ] **Step 2: Verify**

Run: `rg -n "\.data-table" src/components/RacePage.astro`.
Expected: only hits in the page template (e.g. `<table class="data-table">`), not in the `<style>` block. Run `rg -n "\.code-tag" src/components/RacePage.astro` - one hit confirming `.code-tag` survived.

- [ ] **Step 3: Commit**

```bash
git add src/components/RacePage.astro
git commit -m "refactor(race): drop scoped .data-table CSS, use global rule from app.css

Site-wide .data-table rule lives in public/css/app.css now. This
scoped copy is byte-identical (modulo the inline-link border-bottom
rule, which PR #96 overrides everywhere with !important anyway).
Removing it removes duplication. Visual output unchanged.

.code-tag and the podium-step / race-nav rules stay - RacePage-only."
```

---

## Phase 4: Visual verification

### Task 6: Dev-server check

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

User runs dev servers per worktree on 4321..4325. Ask the user which port this worktree is on before navigating; do not start a competing server. If asked to verify autonomously, default to checking `npm run dev` has been invoked already and skip if not.

- [ ] **Step 2: Visit `/records/wins/` and inspect**

Confirm:
- Table sits inside a `.panel` (you'll see the panel border).
- Header row has `var(--bg-2)` background and `var(--f-display)` weight 600 typography (matches drivers/races tables).
- Driver-name anchors have a 1px underline at 35% currentColor (PR #96 affordance); hovering doubles thickness.
- Driver-flag emoji still appears before the name (e.g. 🇬🇧 next to "Lewis Hamilton").
- Era toggle buttons still swap between all-time and modern tables.
- Below the H1, the `← Records` back-button is visible and clickable.
- The "Detail" column on the right is grey (`.records-table-wrap .col-context` rule).

- [ ] **Step 3: Regression check on `/drivers/hamilton/`**

Confirm the season-by-season and race-by-race tables look identical to before (panel wrapper, sticky bg-2 header, dotted/underline links). No visual diff.

- [ ] **Step 4: Regression check on `/races/2024/1/`**

Confirm the results / qualifying / fastest-laps tables look identical to before.

- [ ] **Step 5: Mobile width check**

In dev tools, resize to <= 720px. On `/records/wins/`, confirm:
- The "Detail" column is hidden.
- Cell padding shrinks (6px 8px instead of 8px 12px).
- Table still readable inside the panel; horizontal scroll appears only if necessary.

- [ ] **Step 6: Light mode check**

Toggle the theme switch. Confirm sticky header background is still legible and underlines are still visible against `--bg-1`.

- [ ] **Step 7: Report findings**

If everything looks correct, report success and that the work is ready for PR. If any visual regression is found on driver or race pages, that's a bug in one of Phase 1 / Phase 3 - re-check by `git show <commit>` to find a mismatched property and fix in a follow-up commit.

---

## Notes for the implementer

- **No tests.** This project does not have CSS or component tests. Verification is via the dev server.
- **CI as safety net.** Per project convention, locally running `npm run build` is optional; CI catches build failures. If short on time, skip the local build and let CI verify.
- **Commit per task.** Each task above commits its own work. Don't batch commits across tasks.
- **No `--no-verify`.** If a pre-commit hook fails, investigate; don't skip.
- **ASCII hyphens.** Use `-` not `—` in source. Already enforced in this plan.
- **Trailing slash.** All internal links must end with `/`. The `/records/` href in Task 3 already complies.

## Out of scope

- Classic-era (1950-1980) toggle. Separate spec / PR.
- Records hub (`/records/`) styling. Uses different markup (sparkline cards), not in this scope.
- Other `.records-table` consumers - there are none beyond `RecordsTable.astro` (grep verified).
