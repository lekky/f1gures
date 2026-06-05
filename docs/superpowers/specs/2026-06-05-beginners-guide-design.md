# f1gures Beginner's Guide — Design

**Date:** 2026-06-05
**Status:** Approved (pending implementation plan)

## Goal

Add a beginner's guide to F1 aimed at newcomers who want to **follow the
strategy chatter** — after reading, a reader should be able to watch a race
broadcast and understand Crofty + Brundle commentary (tyre compounds,
undercut/overcut, safety car vs VSC, DRS, penalties, etc.).

The guide is a hub of short, skimmable sub-pages mirroring the existing
`/records/` pattern: pure server-rendered Astro, no React island, no client
JS beyond one small inline toggle for the new mobile "More" menu.

## Non-goals (out of scope)

- Glossary hover/tap tooltips anywhere jargon appears (a JS-island approach we
  explicitly deferred).
- Year-aware content. Regulations change; the first cut is framed for the
  **current era (~2024–2026)** and is not wired to the year picker.
- Deep regulations content (cost cap, parc fermé, power-unit allocations,
  sporting vs technical regs) — that is the "anorak" tier, deferred.
- Migrating any existing site copy into the guide.
- Sprinkling DRS/tyre/safety-car links across every race page. Only a minimal
  inline-link set ships in this cut (see below); broader cross-linking is a
  follow-up PR.

## Content model

New Astro content collection `guide`, defined in `src/content/config.ts`
alongside the existing `blog` collection. One MDX file per topic in
`src/content/guide/`.

Schema:

```ts
const guide = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string().max(120),       // "DRS"
    order: z.number(),                 // reading order; drives hub list + prev/next pager
    summary: z.string().min(40).max(200), // reused as <meta description> + hub card subtitle
    related: z.array(z.string()).default([]), // slugs for the "Related" footer
    updatedAt: z.coerce.date().optional(),
    draft: z.boolean().default(false),
  }),
});
```

`collections` export becomes `{ blog, guide }`.

- `order` drives both the "Start here" reading-order list on the hub and the
  prev/next pager on each sub-page.
- `related` drives the cross-links footer (3-up cards). Slugs that point at a
  non-existent or `draft` page are filtered out at build time rather than
  rendering a dead card.
- `summary` is the single source of truth for the meta description and the hub
  card subtitle.

## Routes

Pure Astro markup, no React island, no client JS (other than the shared
`BaseLayout` theme pre-hydration script). Mirrors `src/pages/records/`.

### `src/pages/guide/index.astro` — hub

Two sections, both built from existing `.card-*` classes (no new card/table
variants — per the design-system rules in CLAUDE.md):

1. **Start here** — short intro paragraph + an ordered (numbered) list of all
   non-draft sub-pages sorted by `order`, each showing title + summary. This is
   the "read it cover to cover" path.
2. **Browse by topic** — the same pages as an alpha-sorted card grid, for the
   "I just want to look up DRS" lookup path.

Passes `title`, `description`, `canonicalPath: '/guide/'`, and breadcrumb to
`BaseLayout`.

### `src/pages/guide/[slug].astro` — sub-page

`getStaticPaths` reads the `guide` collection (filtering `draft`) and emits one
page per entry. Layout, top to bottom:

1. Breadcrumb (Home → Guide → `title`)
2. `<h1>` = `title`
3. Summary callout (the `summary` field, styled as an intro lede)
4. MDX body (`<Content />`)
5. **Related** footer — 3-up cards resolved from `related[]` (each card =
   title + summary + link)
6. Prev/next pager based on `order`

`BaseLayout` provides SEO meta + `BreadcrumbList` and `Article` JSON-LD.
`canonicalPath` = `/guide/<slug>/`. Origin stays `https://f1gures.app`.

Astro frontmatter that reads the collection uses `getCollection('guide')`
(content-collection API), not manual `fs` reads — so the `resolve(process.cwd(),
…)` gotcha doesn't apply here.

## The 10 sub-pages

Drafted by Claude, reviewed by the user. Current-era framing.

| order | slug | covers |
|-------|------|--------|
| 1 | `race-weekend-format` | FP1/2/3, Qualifying (Q1/Q2/Q3), Sprint weekends, the Grand Prix |
| 2 | `points-system` | Race points (25→1), sprint points, fastest-lap rule (and that it was dropped) |
| 3 | `flags-and-signals` | Yellow / double-yellow / red / blue / green / white / black / chequered |
| 4 | `pit-stops-and-strategy` | Stop mechanics, the pit window, intro to undercut/overcut |
| 5 | `tyres` | C1–C5 dry compounds, slicks vs inters vs wets, mandatory-compound rule, degradation |
| 6 | `overtaking` | Slipstream, DRS trains, dive-bomb vs switchback, undercut in detail |
| 7 | `drs` | Activation zones, the 1-second detection rule, when DRS is disabled |
| 8 | `safety-cars` | Safety Car vs Virtual Safety Car vs red flag, restart procedure, "free" pit stops |
| 9 | `hybrid-power-unit` | ICE + ERS-K + ERS-H at a light touch — no engineering depth |
| 10 | `penalties` | 5s / 10s time penalties, drive-through, stop-go, grid drops, licence points |

`related[]` wiring (cross-links footer), e.g.:

- `tyres` ↔ `pit-stops-and-strategy`, `overtaking`
- `drs` ↔ `overtaking`, `race-weekend-format`
- `safety-cars` ↔ `pit-stops-and-strategy`, `penalties`
- `overtaking` ↔ `drs`, `tyres`

(Exact pairings finalised during authoring; the build filters any that resolve
to a missing/draft page.)

## Navigation changes (`src/components/Chrome.astro`)

### Route detection

Add `guide: isRoute('/guide')` to the `route` map. Add `'guide'` as a possible
value of `botActive` — and `more` becomes active when the current route is one
of the More-menu members (circuits, drivers, teams, standings-records, guide,
blog) that isn't already a top-slot.

### Desktop top nav

Add a top-level `Guide` link (after `Teams`, before/after `Blog` — placement
finalised in implementation; ~8th item). Active when `route.guide`.

The desktop **Standings dropdown is left untouched** — Records stays inside it
as "Records & milestones". (Decision: don't restructure the desktop dropdown in
this cut.)

### Mobile bottom nav — 4 slots

Change from `Home · Standings · Calendar · Blog` to:

**Home · Standings · Calendar · More**

Blog moves into the More menu. No 5th slot is added (per user constraint: no
more bottom-nav items).

### Mobile "More" bottom-sheet

Tapping **More** opens a slide-up panel (bottom sheet) over a dimmed backdrop.
The panel lists the sections not in the four slots:

**Circuits · Drivers · Teams · Records · Guide · Blog**

- Implemented as static markup + a **~15-line inline `<script is:inline>`**
  that toggles an `open` class — the same no-island approach used by the
  records era toggle. No React island, no new npm dependency.
- Closes on: backdrop tap, any link tap (navigation), and the Escape key.
- The More slot shows the `active` state when the current route is one of the
  menu's members.
- Panel, backdrop, and open/close transition styled in `public/css/app.css`
  using existing design tokens (no hardcoded hex; verify dark + `html.light`).
- Accessibility: the More trigger is a `<button>` with `aria-expanded`
  reflecting state and `aria-controls` pointing at the panel; the panel is
  labelled. Focus is not trapped in v1 (simple disclosure), but Escape closes
  and returns focus to the trigger.

## Inline links from existing pages (minimal first cut)

Keep the surface area small to avoid touching many files:

1. **Sprint badge** (race pages + calendar) → `/guide/race-weekend-format/`
2. **Standings "Pts" column header** → `/guide/points-system/`
3. **Homepage**: a "New to F1?" link → `/guide/`

Broader inline cross-linking (DRS / tyres / safety-car terms across race pages)
is explicitly a follow-up PR.

## Testing / verification

- `npm run build` succeeds; `/guide/` and all 10 `/guide/<slug>/` pages emit to
  `dist/` with trailing slashes.
- Hub lists all non-draft pages in both sections; reading-order list matches
  `order`.
- Each sub-page renders breadcrumb, summary, body, related footer (no dead
  cards), and a correct prev/next pager.
- Mobile bottom nav shows the 4 new slots; tapping More opens/closes the sheet
  (backdrop tap, link tap, Escape). Active states correct for a page reachable
  only via More (e.g. a circuit page → More active).
- Desktop nav shows Guide; active state correct on guide pages.
- Both themes verified (dark + `html.light`) for the new hub, sub-page, and the
  More sheet.
- Sitemap auto-includes the new pages (via `@astrojs/sitemap`, no manual step).

## Design-system compliance

- No new card/table variants — reuse the five card classes / two table classes.
- No hardcoded hex; use CSS custom properties from `public/css/app.css`.
- Condensed uppercase labels, mono numerics, `--accent` used at most once per
  screen.
- Internal links end with `/` (trailing-slash config).
