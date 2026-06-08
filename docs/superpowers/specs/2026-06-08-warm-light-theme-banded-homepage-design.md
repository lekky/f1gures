# Warm light theme + banded homepage — design

**Date:** 2026-06-08
**Branch:** `feat/warm-home` (worktree off `origin/main`)
**Source of truth for the look:** the user's `Home Amended (standalone).html` mockup.

## Goal

Two related changes, derived from the amended homepage mockup:

1. **Part A — Warm light palette, site-wide.** Replace the current cool light-theme
   palette (blue-grey `#f5f5f8`) with the mockup's warm palette (cream `#f0eee9`).
   Applies to every page via token remap; dark theme is untouched.
2. **Part B — Banded homepage.** Restructure the homepage into full-bleed
   alternating "bands" with bolder section headers and a new dark "Form Guide"
   ticker, reusing existing components rather than introducing new card variants.

These ship as **two commits on one branch** so Part A is reviewable/revertable
independently of Part B.

## Decisions locked during brainstorming

- Homepage fidelity: **"look, reuse components"** — adopt the banded look but
  reuse existing card classes; do not add the mockup's parallel `.stcard` style.
- Light palette scope: **full warm palette site-wide** (page, tint, lines, muted
  text all warmed — not just the page background).
- Form Guide ticker: **include it**.

## Part A — Warm light palette

Pure token remap inside `html.light` in `public/css/app.css`. Same token names,
so all ~2,310 prerendered pages pick it up with zero per-component edits.
`:root` (dark) is unchanged.

| Token | Now (cool) | → Warm | Role |
|---|---|---|---|
| `--bg-1` | `#f5f5f8` | `#f0eee9` | page background (cream) |
| `--bg-0` | `#eeeef2` | `#e7e5de` | recessed / tint band |
| `--bg-2` | `#ffffff` | `#ffffff` | cards (stay white, lift off cream) |
| `--bg-3` | `#ededf1` | `#ebe7df` | subtle fills, table headers |
| `--bg-hover` | `#e6e6ea` | `#e7e2d8` | row hover |
| `--bg-elevated` | `#ffffff` | `#ffffff` | unchanged |
| `--line-1` | `#e0e1e6` | `#e1ded6` | warm hairline |
| `--line-2` | `#cccdd4` | `#cbc7bb` | warm hairline |
| `--line-3` | `#b2b3bc` | `#b4afa1` | warm hairline |
| `--fg-3` | `#6a6b75` | `#84857f` | warm muted text |
| `--fg-4` | `#9a9ba6` | `#ada99e` | warm faint text |

Unchanged: `--accent`, `--fg-1` (`#0d0e12`), `--fg-2` (`#3d3e48`), all team
colours, all semantic colours. So none of the documented team-colour collisions
(`--accent`/Ferrari, `--pos`/Sauber, Williams↔Racing Bulls) change.

Also warm three hardcoded `rgba(245,245,248,…)` values that the light chrome uses
(they predate the token system and can't read `--bg-1`):

- `html.light .nav` → `rgba(240,238,233,0.92)`
- `html.light .botnav` → `rgba(240,238,233,0.96)`
- `html.light .topbar-mobile` → `rgba(240,238,233,0.96)`

**Cost:** changing `app.css` re-hashes the CSS `?v=` cache-bust, so every HTML's
asset URL changes and the first deploy is the heavy ~20-min kind (per CLAUDE.md).
Expected and acceptable.

## Part B — Banded homepage

### Layout shell

`HomeScreen` (`src/components/islands/screens/HomeScreen.jsx`) currently renders
its content inside `<div className="page">`, which caps width at 1280px and
centers it. The Astro shell (`Chrome.astro`) renders `<slot/>` as a **direct
child of `.f1-app`** with no intervening max-width wrapper — so the 1280px cap
comes only from `.page`.

Change: the homepage root stops using `.page` and instead emits a sequence of
full-bleed `<section class="home-band">` elements. Each band paints a full-width
background and centers its content in an inner wrapper:

```
.home-band        { width: 100%; border-bottom: 1px solid var(--line-1); }
.home-band-inner  { max-width: 1280px; margin: 0 auto; padding: 40px 20px; }
```

Band sequence and backgrounds (all via existing tokens):

| Band | Content | Light bg | Dark bg |
|---|---|---|---|
| Hero | `NextRacePanel` or `SeasonAtGlance` | `--bg-1` | `--bg-1` |
| Season Summary | `SummaryWidget` ×3 | `--bg-0` (tint) | `--bg-0` |
| Form Guide | new ticker (below) | `--band-ink` | `--band-ink` |
| Top 3 · Drivers | `.card-accent` ×3 | `--bg-1` | `--bg-1` |
| Top 3 · Constructors | `.card-accent` ×3 | `--bg-0` (tint) | `--bg-0` |

The mobile variant (`page-mob`) keeps its existing bottom padding behaviour;
bands stack and span full width on mobile too. Band vertical padding shrinks on
`@media (max-width: 720px)`.

### New token: `--band-ink`

Add `--band-ink: #0c0c0d` to `:root` **only** — it deliberately does NOT get an
`html.light` override, because the Form Guide band is meant to read as a constant
dark strip in both themes. This is the legitimate exception to "never hardcode a
theme colour": a surface that is constant-by-design, expressed as a token so it's
named and reusable rather than an inline literal.

### Components — reused, not rebuilt

Per the "reuse components" decision:

- **Hero**: `NextRacePanel` / `SeasonAtGlance` kept as-is, dropped into the hero
  band. No internal restyle beyond what the band wrapper provides.
- **Season Summary**: existing `SummaryWidget` cards unchanged (they already
  match the mockup's `.sumcard`: left accent border, kicker, who-row, foot).
- **Top 3 (drivers + constructors)**: existing `.card-accent` + `.card-bars`
  pattern unchanged — already the design-system's blessed "colourful and dynamic"
  leaderboard pattern. The mockup's parallel `.stcard` style is **not** added.
- **Section headers**: add a `variant="band"` modifier to the shared
  `SectionHead` component (in `src/lib/shared.jsx`) for the bolder mockup header
  (solid red square mark + heavy uppercase title + flex rule + inline "View Full
  Standings →"). Default `SectionHead` rendering is untouched, so other screens
  that use it are unaffected. If `SectionHead`'s current API can't cleanly carry
  the red mark + inline action, fall back to a small homepage-local header
  component rather than restyling the shared one globally.

### Form Guide ticker (the one net-new element)

A self-contained homepage component: a full-width dark band (`--band-ink`)
containing a horizontally scrolling marquee of the last ~6 completed rounds.

- Data: built from the screen's already-computed results
  (`lastNCompletedRounds` / `D.results` / winner lookup) — no new data plumbing.
- Each item: round number (`R06`), country flag, GP name, optional sprint badge,
  and the race winner's surname, with a team-colour strip.
- A fixed red `▸ Form Guide` label sits at the left edge; the track scrolls behind
  a left/right fade mask.
- Marquee duplicates its items and translates `-50%` on a CSS keyframe loop.
- **Pauses on hover** and respects `@media (prefers-reduced-motion: reduce)`
  (animation disabled → static, horizontally scrollable strip).
- Additive component, not a card/table variant — does not touch the
  design-system card rules.

### Scope guardrails

- Homepage-only. No other route, screen, or the `.page` class changes.
- New CSS lives in `public/css/app.css` under a clearly-commented
  `HOME BANDS / FORM GUIDE` section.
- Verified in **both** dark and `html.light` before completion.

## Testing / verification

- `npm run dev` in the worktree; load `/` and toggle the theme.
- Verify in light: cream page, white cards lift, warm hairlines, dark Form Guide
  band reads as intended.
- Verify in dark: bands still differentiate (plain `--bg-1` vs tint `--bg-0`),
  Form Guide band consistent, no regressions to hero/summary/top-3.
- Spot-check a non-home page (e.g. a driver page) in light theme to confirm the
  warm palette reads well site-wide and nothing relied on the old cool greys.
- `prefers-reduced-motion`: confirm ticker animation is disabled.
- Mobile width (≤720px): bands stack, ticker remains usable, bottom nav clearance
  intact.
- `npm run build` (or rely on CI per the "CI as safety net" convention if
  session-constrained).

## Out of scope

- Dark-theme palette changes (untouched).
- The mockup's `.stcard` standings style (explicitly rejected in favour of
  reusing `.card-accent`).
- Any redesign of detail pages (driver/race/circuit/team/records) beyond the
  automatic warm-palette inheritance from Part A.
