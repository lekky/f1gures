# Features

f1gures is an Astro 4 static site: every route below is prerendered to HTML at
build time. Navigation is plain `<a href>` links between prerendered pages
(trailing slash always, e.g. `/drivers/norris/`). Interactivity comes from
React islands hydrated with explicit `client:*` directives; pages without an
island ship no React at all.

URL helpers (`urlFor`, `navigate`, `getParam`) live in
[src/lib/shared.jsx](../src/lib/shared.jsx).

## Chrome (every page)

[src/components/Chrome.astro](../src/components/Chrome.astro) renders static
markup; active-route highlighting is computed at build time from
`Astro.url.pathname`. Routes are grouped into buckets: **Grid** =
drivers/teams/circuits, **Stats** = /stats + /records + /compare, **Read** =
/read + /guide + /blog.

- **Desktop top nav**: Home · Standings (dropdown island) · Calendar · Grid
  (dropdown island → Drivers / Teams / Circuits) · Stats · Read, plus a
  search trigger, `ThemeToggle` island and `YearPicker` island on the right.
- **Mobile top bar**: logo, search trigger, theme toggle, compact year picker.
- **Mobile bottom nav** (5 items): Home · Standings · Calendar · Stats ·
  More.
- **"More" bottom sheet** (vanilla `is:inline` script, not an island):
  Grid (Drivers, Teams, Circuits) · Read (Guide, Blog) · More (Feedback).
- **SearchPalette island** mounted once: Cmd/Ctrl+K or `/` opens a command
  palette that lazy-fetches the four archive index JSONs on first open and
  ranks substring matches across drivers, teams, circuits and races. Any
  `[data-search-trigger]` element opens it.

## View transitions

`BaseLayout.astro` mounts Astro's `<ViewTransitions fallback="none" />`.
Same-origin link clicks are intercepted by Astro's client router, which
fetches the next page and swaps `<head>` and `<body>` in place, so the chrome
stays still and only the page body changes. `fallback="none"` means browsers
without the native View Transitions API keep plain full-page loads (smallest
blast radius: the rules below only have to hold where the swap happens).
Astro's own `viewtransitions.css` disables every `::view-transition-*`
animation under `prefers-reduced-motion`. Enabling the router also turns on
Astro's `prefetch` (`prefetchAll: true`, hover strategy) for same-origin links.

What the swap does, and what that means for anything you add:

- **Every `<html>` attribute is replaced** with the incoming page's, so the
  `html.light` theme class and the `year-pending` guard are re-applied from
  `astro:after-swap` listeners in `BaseLayout.astro`. That event fires inside
  the swap, before the new page paints — the right place for anything that
  must be true before first paint. (`astro:page-load` fires after the swap,
  the URL and `<title>` update and the scripts run — on the initial load too.)
- **The whole `<body>` is replaced**, except elements with `transition:persist`.
  The `SeasonStrip` island is persisted (`transition:persist="season-strip"`)
  so it keeps its React state and never re-mounts or blinks; the nav, mobile
  top bar and bottom nav carry `transition:name` + `transition:animate="none"`
  so they are captured as their own still groups. `SearchPalette` is
  deliberately not persisted (its index cache is module-level, and a persisted
  portal would point at the discarded body). Non-persisted islands unmount
  cleanly (`astro:unmount` → `root.unmount()`) and the incoming page's islands
  hydrate as normal, including `RaceCountdown`, which re-reads the new
  `<race-countdown>` markup on mount. Anything a third-party script injected
  into `<body>` is lost unless carried over on `astro:before-swap` — see the
  Buy Me a Coffee hand-off in `BaseLayout.astro`.
- **Inline scripts do not re-run by default.** The router dedupes any
  `<script is:inline>` whose text (or `src`) matches one already in the
  document, so a script that is identical on every page runs exactly once per
  session. That is the rule to design around:
  - A script that **binds listeners to page elements** (expand/collapse
    buttons, the records era toggle, the waffle sort toggle, hero flag-wash
    wipes, mobile table cards, the guide scroll-spy, the 404 helper) needs
    `data-astro-rerun`, otherwise the second page of the same type gets a dead
    UI. It then re-runs after every swap (after paint — fine for wiring).
  - A script that should run **once per session** (the GA4 tag, the BMC
    loader, the history-state guard, delegated document-level handlers like
    the More sheet and `MobileBarRows`) must NOT get `data-astro-rerun`, and
    must not assume the body it saw at load is the current one — look elements
    up at event time (delegation) or re-apply on `astro:after-swap`.
  - Bundled `<script>` (no `is:inline`) modules also run once; use an
    `astro:page-load` listener if they touch per-page DOM.
- **GA4** sends a `page_view` per client-side navigation (on `astro:page-load`
  when the pathname changed). If the property's Enhanced Measurement "page
  changes based on browser history events" is on, that would double-count —
  keep it off.
- **History state**: the router stores `{ index, scrollX, scrollY }` in
  `history.state` and ignores popstate events whose state is `null`. Islands
  that write in-page state (`?session=`, `?viz=`, `?vs=`, `?e=`) go through a
  small guard in `BaseLayout.astro` that merges those fields in, so Back keeps
  working; prefer spreading `history.state` when adding new pushes anyway.
  Back from an island-pushed entry (closing the viz modal) currently triggers
  a same-page refetch/swap rather than an in-place close — harmless, but a
  known follow-up.
- Year changes (`SeasonStrip.pick()`) and search-palette selections still
  navigate via `location.href` — full loads on purpose.

## Pages

### Year-aware listing pages (React island bodies)

These five wrap their screen in `useYearAwareData(currentSeason)`: the
prerendered HTML shows the current season (for SEO), and after hydration the
year picker / `?year=YYYY` / `localStorage.f1-year` can swap in any season
bundle from 1950 onwards.

| URL | File | What it shows |
|---|---|---|
| `/` | `src/pages/index.astro` → `HomeIsland` | Next-race hero with session schedule + weather (or a season-at-a-glance panel for historic years), form guide, title race chart, season progress, trivia |
| `/standings-drivers/` | `standings-drivers.astro` → `DriverStandingsIsland` | Sortable driver standings, podium block, points-progression chart, head-to-head |
| `/standings-constructors/` | `standings-constructors.astro` → `ConstructorStandingsIsland` | Constructor standings + team progression chart |
| `/calendar/` | `calendar.astro` → `CalendarIsland` | All rounds as race cards (completed rounds link to race pages) |
| `/circuits/` | `circuits.astro` → `CircuitsIndexIsland` | Grid of the selected season's circuits |

### All-time listing pages (archive-backed islands, not year-aware)

| URL | File | What it shows |
|---|---|---|
| `/drivers/` | `drivers.astro` → `DriversIndexIsland` | Every driver 1950–now; fetches `/data/archive/_drivers-index.json` client-side, with search + nationality filters |
| `/teams/` | `teams.astro` → `TeamsIndexIsland` | Every constructor, same pattern via `_teams-index.json` |

### Prerendered detail pages (static Astro bodies)

Generated by `getStaticPaths` from the archive JSONs; no React island for the
body (upcoming race pages mount the small `RaceCountdown` island).

| URL | Body component | Notes |
|---|---|---|
| `/drivers/[driverRef]/` | `DriverPage.astro` | Bio, career stats, form chart, career-outcome mosaic, teammate duels, season-by-season table, Compare CTA |
| `/teams/[constructorRef]/` | `TeamPage.astro` | Team profile, lineage strip, current car, drivers, season history, Compare CTA |
| `/circuits/[circuitRef]/` | `CircuitPage.astro` | Animated track map, characteristics, historic winners, did-you-know trivia |
| `/races/[year]/[round]/` | `RacePage.astro` | Podium, results/qualifying/sprint tables with gap bars; upcoming rounds get a holding page with countdown + any pending quali/sprint results |

### Hubs and tools

| URL | File | What it shows |
|---|---|---|
| `/stats/` | `stats.astro` | Static hub for the "numbers" bucket: featured record leaderboards + links to `/records/` and `/compare/` |
| `/records/` | `records/index.astro` | Records hub: most-decorated hero, timeline, 17 leaderboard cards in 5 groups |
| `/records/[topic]/` | `records/[topic].astro` | One page per leaderboard (top 50); All-time / Modern / Classic era toggle is a small `is:inline` script over prerendered tables |
| `/compare/` | `compare.astro` → `CompareLauncher` island | Head-to-head Compare Mode for any two drivers or teams (all-time archive data); state deep-links via `?type=&a=&b=`; results can be exported as a 1080×1080 share-card PNG. A `CompareCta` island on driver/team pages opens the same experience pre-seeded |
| `/read/` | `read.astro` | Static hub for the "words" bucket: guide pillars + latest blog posts |
| `/feedback/` | `feedback.astro` → `FeedbackForm` island | Feedback form (category, message, optional email) with Cloudflare Turnstile; submits to the `feedback-worker/` Cloudflare Worker, which opens a GitHub issue. Renders a "not configured" notice if `src/data/feedbackConfig.js` is empty |

### Content collections (MDX)

| URL | File | What it shows |
|---|---|---|
| `/blog/` (+ `/blog/2/` …) | `blog/[...page].astro` | Paginated index (14/page); page 1 gets a two-post lede + `TriviaBoard` island |
| `/blog/[slug]/` | `blog/[...slug].astro` | Post body (MDX with embedded blog components), read time, newer/older nav |
| `/blog/category/[category]/` | `blog/category/[category]/[...page].astro` | Paginated category pages |
| `/blog/rss.xml` | `blog/rss.xml.ts` | RSS feed |
| `/guide/` | `guide/index.astro` | Beginner's guide hub, grouped by category |
| `/guide/[slug]/` | `guide/[slug].astro` | Guide topic with TOC scroll-spy (`is:inline` IntersectionObserver), prev/next + related |

### Everything else

- `/404` — static, noindex, link list.
- Legacy redirect shims in `public/` (`driver.html`, `race.html`, …) keep old
  query-string URLs working — see [data-flow.md](data-flow.md#legacy-urls).

## Shell widgets

- **Year picker** — "Current Season" plus every year back to 1950. Writes
  `localStorage.f1-year`; year-aware islands react without a reload.
- **Theme toggle** — light/dark, persists `localStorage.f1-theme`, toggles
  `html.light`. A pre-hydration inline script in `BaseLayout.astro` applies
  the stored theme before first paint.
- **Search palette** — see Chrome above.

## URL flags

- `?year=YYYY` — overrides `localStorage.f1-year` on the five year-aware
  listing pages (e.g. `/calendar/?year=1990`). Not applicable to `/drivers/`
  and `/teams/`, which are all-time listings.
- Legacy `?id=` / `?round=` params on the `public/*.html` shims resolve to
  the prerendered routes (client-side JS, plus server-side `.htaccess` 301s
  on Apache).
