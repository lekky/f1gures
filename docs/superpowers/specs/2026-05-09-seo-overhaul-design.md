# SEO Overhaul - Design Spec
**Date:** 2026-05-09  
**Branch:** `feat/seo-overhaul`  
**Scope:** Full-stack SEO for f1gures.app - structured data, OG images, natural-language content, internal linking, off-page strategy

---

## Context

f1gures.app is a new site with ~2,310 prerendered static pages (Astro 4 SSG). It has a solid technical baseline: canonical URLs, meta descriptions, OG tags, JSON-LD on detail pages, a sitemap, and robots.txt. The goal is to reach page 1 on Google for F1 fans searching across all four content types: race results, driver career stats, current standings, and the race calendar.

---

## Section 1 - Structured Data & Meta Fixes

### Global (BaseLayout.astro)
- Add `<meta property="og:image:alt" content={...} />` - derive from page title
- Add `<meta name="twitter:site" content="@f1gures" />` (update if handle differs)
- Fix Google Fonts `<link>` to include `&display=swap` in the URL so font loading doesn't block rendering (prevents render-blocking resource warning in Core Web Vitals)

### Race pages (`src/pages/races/[year]/[round].astro`)
- Add `<meta property="article:published_time" content={race.date} />` to `<head>` via BaseLayout (new optional prop: `publishedTime`)
- Add `<meta property="article:modified_time" content={BUILD_DATE} />` (ISO string, generated at build time in frontmatter)
- Expand `SportsEvent` JSON-LD:
  - Add `winner: { "@type": "Person", name: winnerName }` when `winnerName` exists
  - Add `superEvent: { "@type": "SportsEventSeries", name: "FIA Formula One World Championship" }`
  - Add `performer` array: top 3 finishers as `{ "@type": "Person", name }` references

### Driver pages (`src/pages/drivers/[driverRef].astro`)
- Expand `Person` JSON-LD:
  - Add `hasOccupation: { "@type": "Occupation", name: "Formula 1 Racing Driver", occupationLocation: { "@type": "Country", name: driver.nationality } }`
  - Add `description` field built from career stats summary string

### Team pages (`src/pages/teams/[constructorRef].astro`)
- Fix `ogType` from `"article"` → `"website"`
- Expand `SportsTeam` JSON-LD:
  - Add `memberOf: { "@type": "SportsOrganization", name: "FIA Formula One World Championship" }`
  - Add `sport: "Formula 1"` (already present - verify)
  - Add `foundingDate` if `team.career.firstYear` is available

### Listing pages - add JSON-LD (currently missing or bare BreadcrumbList)
All data for these comes from `currentSeason` (the prerendered SSR data):

**`standings-drivers.astro`** - add `ItemList` JSON-LD:
```json
{
  "@type": "ItemList",
  "name": "2026 F1 Driver Championship Standings",
  "itemListElement": [top 10 drivers as ListItem with driverRef URL + position]
}
```

**`standings-constructors.astro`** - same pattern for constructors.

**`calendar.astro`** - add `ItemList` of all race events:
```json
{
  "@type": "ItemList",
  "name": "2026 Formula 1 Race Calendar",
  "itemListElement": [each race as ListItem with name, date, circuit]
}
```

**`circuits.astro`** - add `ItemList` of all circuits with their URLs.

---

## Section 2 - Per-Type OG Images (Build-Time Generation)

### Overview
A new prebuild script `scripts/generate-og-images.mjs` runs after `build-archive.mjs`. It uses **Satori** + **@resvg/resvg-js** (both Node-compatible, no browser needed) to render JSX templates to PNG and write them to `public/images/og/<type>/<slug>.png`.

The 5 listing pages retain the existing hand-crafted `og-default.png`.

### Templates (4 total)

**Race** (`/images/og/races/<year>-<round>.png`):
- Background: dark gradient matching site theme
- Large text: race name + year
- Sub-line: winner name, constructor, flag emoji
- Bottom right: circuit name
- f1gures wordmark bottom left

**Driver** (`/images/og/drivers/<driverRef>.png`):
- Driver full name (large)
- Nationality flag + country
- Career headline: `"3× Champion · 41 wins · 65 poles"`
- Years active range
- f1gures wordmark

**Circuit** (`/images/og/circuits/<circuitRef>.png`):
- Circuit name (large)
- Location + country flag
- `"X Formula 1 races · YYYY–YYYY"`
- f1gures wordmark

**Team** (`/images/og/teams/<constructorRef>.png`):
- Team name (large)
- Nationality
- `"X races · Y wins · Z championships"`
- f1gures wordmark

### Integration
- `[driverRef].astro` frontmatter: `ogImage = /images/og/drivers/${driver.driverRef}.png`
- `[year]/[round].astro` frontmatter: `ogImage = /images/og/races/${race.year}-${race.round}.png`
- `[circuitRef].astro` frontmatter: `ogImage = /images/og/circuits/${circuit.circuitRef}.png`
- `[constructorRef].astro` frontmatter: `ogImage = /images/og/teams/${team.constructorRef}.png`
- `BaseLayout.astro` already accepts `ogImage` - no changes needed there
- Fallback: if the PNG file doesn't exist at the expected path, the page falls back to `/images/og-default.png` (existing behaviour)

### Performance
- Satori renders at ~100ms/image; 2,310 images parallelised in batches of 20 → ~12 seconds added to prebuild
- Output PNGs are written to `public/` (gitignored like other generated assets), regenerated on every build
- `package.json` prebuild chain: `build-archive.mjs && generate-og-images.mjs && sync-current-season.mjs`

### Dependencies to add
```
satori
@resvg/resvg-js
```
Both are devDependencies (build-time only).

---

## Section 3 - Natural-Language Summaries & FAQ Schema

### Race page summaries
A `buildRaceSummary(race)` function in `RacePage.astro` frontmatter generates a 2–3 sentence paragraph from existing data:

**Template:**
> "[Winner] won the [race.name] [race.year] at [circuit.name] on [fmtDateLong(race.date)], starting from [pole position / Pn on the grid]. [P2 name] finished second for [P2 team], with [P3 name] completing the podium for [P3 team]. [Winner] set the fastest lap with a time of [fastestLapTime]."

**Edge cases:**
- No results yet (future race): no summary rendered
- Fewer than 3 classified finishers: sentence truncates gracefully
- Sprint weekend: add "It was a sprint weekend, with [sprint winner] winning the sprint race."
- No fastest lap data: omit that sentence

Rendered as `<p class="race-summary">` inside `RacePage.astro`, above the results table. Visible to users and crawlers.

### Race page FAQ schema
Added to `[year]/[round].astro` as an additional entry in the JSON-LD graph (alongside `SportsEvent`):
```json
{
  "@type": "FAQPage",
  "mainEntity": [
    { "@type": "Question", "name": "Who won the [race] [year]?",
      "acceptedAnswer": { "@type": "Answer", "text": "[winner], driving for [team]." } },
    { "@type": "Question", "name": "Who was on pole position at the [race] [year]?",
      "acceptedAnswer": { "@type": "Answer", "text": "[pole sitter], driving for [team]." } },
    { "@type": "Question", "name": "What is the lap record at [circuit]?",
      "acceptedAnswer": { "@type": "Answer", "text": "[fastestLapTime], set by [fastest] in [year]." } }
  ]
}
```
FAQ schema only added when `race.results.length > 0` (completed races only).

### Driver page summaries
A `buildDriverSummary(driver)` function in `DriverPage.astro` frontmatter:

**Template:**
> "[forename] [surname] is/was a [nationality] Formula 1 driver who competed between [firstYear] and [lastYear]. [He/She] won [N] World Drivers' Championship[s] ([years list]) across [races] races, taking [wins] wins, [podiums] podiums and [poles] pole positions. [If championships > 0: surname is widely considered one of the greatest drivers in the sport's history.]"

- Uses "is" for drivers whose `lastYear` = current year, "was" for retired
- Championship years derived from `driver.perSeason` where `position === 1`
- No summary if `driver.career.races === 0`

Rendered as `<p class="driver-summary">` in `DriverPage.astro`, above the career stats grid.

### Driver page FAQ schema
Added to `[driverRef].astro`:
```json
{
  "@type": "FAQPage",
  "mainEntity": [
    { "name": "How many championships did [driver] win?", "text": "[N] ([years])" },
    { "name": "How many races did [driver] win?", "text": "[wins] wins from [races] starts" },
    { "name": "What team did [driver] drive for?", "text": "[comma-separated list of teams]" }
  ]
}
```
FAQ schema only added when `driver.career.races > 0`.

---

## Section 4 - Internal Linking

All changes are data-driven link wraps on existing text nodes. No new UI components. Links use `color: inherit` and underline on hover (existing site `a` styles).

### Race pages (`RacePage.astro`)
Add a "Key links" row beneath the results table:
- Winner name → `/drivers/<winnerRef>/`
- Pole sitter → `/drivers/<ref>/` - use `race.qualifying[0]?.driverRef` (not `race.pole` which is a name string, not a ref)  
- Circuit name → `/circuits/<circuitRef>/`
- Winning constructor → `/teams/<constructorRef>/`

Data already available in `race` object. Use existing `ARCHIVE_MAX_YEAR` guard for driver/team links (always available; only race links need the guard).

### Driver pages (`DriverPage.astro`)
- Per-season table: wrap each `constructorName` cell in `<a href="/teams/<constructorRef>/">` (constructorRef already in `perSeason` entries)
- Per-race table: wrap each `raceName` cell in `<a href={raceUrl(r.year, r.round)}>` using the existing `raceUrl()` helper

### Circuit pages (`CircuitPage.astro`)
- Historical winners table: wrap `winnerName` → `<a href="/drivers/<winnerRef>/">` (winnerRef already in `circuit.races`)
- Wrap `winnerTeam` → need to confirm if `winnerTeamRef` is available in circuit race data; if not, link text only (no broken links)

### Team pages (`TeamPage.astro`)
- Add a "Drivers" section listing all unique drivers who raced for the team (derived from season data), each linked to `/drivers/<driverRef>/`

### Listing page islands
- `DriverStandingsIsland` / `ConstructorStandingsIsland`: driver/team names already rendered - ensure they link to their detail pages (audit current island screens for missing links)
- `CalendarIsland`: race names for completed rounds already link via `/race.html` redirect - confirm this is working

---

## Section 5 - Off-Page Strategy Guide

Delivered as `docs/seo/strategy.md` committed to the repo.

### Google Search Console setup
1. Add property for `https://f1gures.app` (domain property recommended over URL prefix)
2. Verify via DNS TXT record (FTP deploy means HTML file verification is unreliable)
3. Submit `https://f1gures.app/sitemap.xml` under Sitemaps
4. Use URL Inspection to manually request indexing for the 5 listing pages immediately post-deploy
5. Set up email notifications for coverage errors and manual actions

### Monitoring cadence
- **Weekly:** GSC Coverage tab - look for "Excluded" pages, fix crawl errors
- **Weekly:** Rich Results Test on one race page, one driver page - verify FAQ + SportsEvent schema
- **Monthly:** GSC Performance tab - filter by page type (URL contains `/races/`, `/drivers/`, etc.) to track impressions + CTR growth
- **Post-deploy:** GSC Core Web Vitals report - verify font-display fix improved LCP scores

### Link building playbook

**Reddit (`r/formula1`, 5.4M members)**
- Post "I built a free F1 stats site covering every race back to 1950" with a specific hook (e.g., "Who has the most podiums without a win? Here's the answer")
- Reply to "Who won X race?" threads with a direct link to the race page
- Do not spam - one quality post per week maximum

**Twitter/X**
- Tweet race results within 30 minutes of the chequered flag linking to the race page
- Use: `[Winner] wins the #[RaceName]! Full results → f1gures.app/races/[year]/[round]/`
- Tag `@F1` for visibility; use `#F1`, `#Formula1` hashtags

**Wikipedia**
- F1 driver and race articles often link to external stats sources in the "External links" section
- Where f1gures has accurate historical data, add as an external reference following Wikipedia's WP:ELYES policy (notable, reliable fan stats sites are accepted)
- Start with high-traffic pages: Lewis Hamilton, Michael Schumacher, Ayrton Senna

**F1 communities**
- autosport.com forums: answer historical stat queries with links to specific pages
- f1technical.net: similar approach for technical/historical discussions
- Large F1 Discord servers: share the tool in #stats or #history channels

### Content angle for social
The natural-language summaries (Section 3) make race pages directly shareable. After deploy, the strongest social hook is historical comparisons: "Hamilton vs Schumacher head-to-head - the data" linking to driver pages side by side. f1gures already has the per-race and per-season data to support this narrative.

---

## Files Changed Summary

| File | Change type |
|---|---|
| `src/layouts/BaseLayout.astro` | Add `og:image:alt`, `twitter:site`, `publishedTime` prop, font-display fix |
| `src/pages/races/[year]/[round].astro` | Add `publishedTime`, expand SportsEvent + FAQ JSON-LD |
| `src/pages/drivers/[driverRef].astro` | Expand Person JSON-LD + driver FAQ, set `ogImage` |
| `src/pages/teams/[constructorRef].astro` | Fix ogType, expand SportsTeam JSON-LD, set `ogImage` |
| `src/pages/circuits/[circuitRef].astro` | Set `ogImage` |
| `src/pages/standings-drivers.astro` | Add ItemList JSON-LD |
| `src/pages/standings-constructors.astro` | Add ItemList JSON-LD |
| `src/pages/calendar.astro` | Add ItemList JSON-LD |
| `src/pages/circuits.astro` | Add ItemList JSON-LD |
| `src/components/RacePage.astro` | Add summary paragraph, key links row |
| `src/components/DriverPage.astro` | Add summary paragraph, link per-season/per-race tables |
| `src/components/CircuitPage.astro` | Link winners table |
| `src/components/TeamPage.astro` | Fix ogType, add drivers list with links |
| `scripts/generate-og-images.mjs` | New: build-time OG image generation |
| `package.json` | Add satori + @resvg/resvg-js devDeps, update prebuild chain |
| `docs/seo/strategy.md` | New: off-page strategy guide |

---

## Out of Scope
- Server-side rendering (site is static FTP-deployed, no SSR at request time)
- Programmatic content beyond what the existing data supports (no hallucinated stats)
- Paid link building or advertising
- Per-page sitemap `<lastmod>` dates (Astro sitemap plugin handles this automatically based on build time)
