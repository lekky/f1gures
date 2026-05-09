# f1gures — SEO Strategy & Off-Page Playbook

This is a living playbook for off-page SEO work. The technical/on-page changes
shipped in `feat/seo-overhaul` cover what code can do; this doc covers what
needs to happen outside the codebase.

## Google Search Console setup

1. Go to https://search.google.com/search-console
2. Add a property for **`f1gures.app`** — choose "Domain property" (covers
   all subdomains and protocols). URL prefix property is fine if domain
   property fails for any reason.
3. Verify via DNS TXT record. FTP-deploy means HTML file verification is
   unreliable; the static file may not survive the next deploy. The TXT
   record persists.
4. Once verified:
   - **Sitemaps tab:** submit `https://f1gures.app/sitemap.xml` (auto-generated
     by `@astrojs/sitemap` at build time).
   - **URL Inspection tool:** submit the 5 listing pages (`/`, `/calendar/`,
     `/standings-drivers/`, `/standings-constructors/`, `/circuits/`) for
     immediate indexing. Google then discovers the rest via the sitemap.
   - **Settings → Users and permissions:** add a backup owner if appropriate.
   - **Email preferences:** turn on alerts for coverage errors, manual
     actions, and security issues.

## Initial indexing expectations

- New site, ~2,310 pages: full indexing typically takes 2–8 weeks.
- The sitemap accelerates discovery but does not guarantee inclusion.
- Listing pages index first (highest internal link count). Detail pages
  follow as Google crawls outward through the internal links shipped in
  Phase E.
- Watch the **Coverage** tab weekly. "Discovered – currently not indexed"
  is normal for the first few weeks; "Crawl anomaly" is not — investigate.

## Monitoring cadence

| Frequency | Tool | What to check |
|---|---|---|
| Weekly | GSC Coverage | Excluded pages, crawl errors. Aim for >90% indexed within 8 weeks. |
| Weekly | Rich Results Test (https://search.google.com/test/rich-results) | Spot-check one race, one driver, one circuit page after each deploy. Verify FAQ + SportsEvent + Person schemas render. |
| Monthly | GSC Performance | Filter by URL pattern (`/races/`, `/drivers/`, etc.) — track impressions + CTR by page type. |
| Per-deploy | GSC Page Experience | Confirm Core Web Vitals stay green after the `font-display: swap` fix. |

## Link building playbook

F1 is a link-rich vertical: fans share results, debate stats, and link out
constantly. Every link below is on-policy — no paid links, no spam.

### Reddit (`r/formula1`, ~5.4M members)
- Allowed: fan-built tools, original analysis, "I made this" posts.
- Forbidden: low-effort affiliate-style spam, repeated self-promotion.
- Strategy: **one quality post per week, max.** Lead with a stat — e.g.
  "Most podiums without a win, all-time" — and link the relevant page
  as supporting evidence.
- Reply organically to "Who won X race?" or "Career stats for Y?" threads
  with a direct link to the specific page. Do not reply unless your link
  actually answers the question better than alternatives.

### Twitter / X
- Tweet results within 30 minutes of the chequered flag. Format:
  > "[Winner] wins the [Race]! Full results, fastest lap and pit-stop pace
  > → f1gures.app/races/[year]/[round]/"
- Tag `@F1` for visibility. Use `#F1` and `#Formula1`.
- Pin the tweet for the first 24 hours after a race.

### Wikipedia
- F1 driver and race articles often have an "External links" section that
  cites stats sources (statsf1.com, f1.com, etc.). Where f1gures has
  accurate, comprehensive data, it qualifies as a notable fan stats site
  per WP:ELYES (and WP:ELNO does not exclude it).
- Start with high-traffic articles: Lewis Hamilton, Michael Schumacher,
  Ayrton Senna, Max Verstappen, Sebastian Vettel, current championship
  leader.
- Always disclose your conflict of interest on the talk page if you're
  the site owner. Wikipedia editors enforce this.

### F1 enthusiast communities
- **autosport.com forums** — long-form fan discussion. Answer historical
  stat queries with links.
- **f1technical.net forums** — more engineering-focused but receptive to
  data sources.
- **Large F1 Discord servers** — share in #stats / #history channels.
  Discord links are nofollow but drive traffic + rankings indirectly via
  user behaviour signals.

### Content angle for organic shares
The natural-language race summaries (Phase D) are quotable. The driver
career summaries support side-by-side comparison content. After deploy,
the strongest social hook is historical comparisons:

- "Hamilton vs Schumacher head-to-head" linking both driver pages
- "Every race winner at Monaco since 1950" linking the circuit page
- "Most championships without a fastest lap" — pure stat curiosities

These hooks travel well on Twitter and Reddit because they answer a
question someone might already be asking.

## What NOT to do

- Don't buy links, list-swap, or join PBNs. Google will catch it eventually
  and a penalty is fatal for a new site.
- Don't keyword-stuff race summaries or descriptions. Google's spam filters
  flag this and the existing data-driven summaries already include all the
  relevant keywords naturally.
- Don't submit to "F1 directories" — they are almost universally low quality
  and Google ignores or penalises them.
- Don't request indexing of the same URL repeatedly in GSC. Once is enough.

## Review schedule

Re-read this doc every 8 weeks. Update with what's working, what isn't,
and any new platform-policy changes.
