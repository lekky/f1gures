# f1gures — F1 stats site

A multi-page F1 stats site built with **Astro 4 SSG + React 18 islands**,
live at [f1gures.app](https://f1gures.app). Every page (~2,300+ HTMLs) is
prerendered at build time — listing pages plus per-driver / per-race /
per-circuit / per-team detail pages from the Ergast 1950–2024 archive and
hand-curated 2025/2026 bundles, a records hub, a head-to-head Compare tool,
an MDX blog, and a beginner's guide. React only hydrates the interactive
bits (theme toggle, year picker, sortable standings, charts, search palette,
Compare Mode). The site is FTP-deployed from `dist/` by GitHub Actions, and
also generates a versioned JSON feed consumed by the native mobile apps.

> **Working on the code?** [CLAUDE.md](CLAUDE.md) is the canonical
> contributor reference (build pipeline, key files, conventions).
> Higher-level docs live in [docs/](docs/README.md), including the
> [mobile app data feed contract](docs/app-data-feed.md) and the
> [tech-debt register](docs/tech-debt.md).

## What's in the box

```
/
├── src/
│   ├── pages/                    Astro routes (listing pages, dynamic
│   │                             detail routes, records, compare, stats,
│   │                             read, feedback, blog + guide MDX, 404)
│   ├── layouts/BaseLayout.astro  Shared <head>: SEO meta, OG, JSON-LD,
│   │                             pre-hydration theme script, GA4
│   ├── components/
│   │   ├── Chrome.astro          Desktop nav + mobile bars + "More" sheet
│   │   ├── *.astro               Server-rendered page bodies (DriverPage,
│   │   │                         RacePage, CircuitPage, TeamPage, Records*)
│   │   ├── blog/                 MDX-embeddable blog components
│   │   └── islands/              React islands + screens/ (the actual UI)
│   ├── lib/                      Shared logic — seasonStats.mjs is the
│   │                             single source of truth for points math
│   ├── content/                  MDX collections: blog/ + guide/
│   └── data/                     Data factories, static metadata, and
│                                 generated JSON (currentSeason, weather)
│
├── public/
│   ├── css/{app,site}.css        Design tokens + global styles
│   ├── data/<year>.json          Season bundles (2020–2026 committed)
│   ├── data/archive/             (generated) per-entity archive JSONs
│   ├── data/app/v1/              (generated) mobile-app data feed
│   ├── images/                   Driver headshots, track SVGs, OG images
│   └── {driver,race,...}.html    Legacy query-string URL redirect shims
│
├── data/history/                 Ergast CSV dump 1950–2024 (build-time
│                                 only, never served)
├── scripts/                      Prebuild pipeline (archive importer, OG
│                                 images, season sync, weather, .htaccess,
│                                 app feed) + records/ library
├── design-system/                Canonical design reference (TOKENS.md)
├── docs/                         Feature/data-flow/app-feed/tech-debt docs
├── feedback-worker/              Cloudflare Worker: feedback form →
│                                 GitHub issues (deployed separately)
└── .github/workflows/            deploy.yml + refresh-current-season.yml
```

## Develop

```
npm install
npm run dev        # dev server with HMR at http://localhost:4321/
                   # (predev runs the archive importer + season sync)
npm run build      # production build → dist/ (prebuild runs 6 scripts)
npm run preview    # serve dist/ for a production-shape preview
npm test           # vitest — covers src/lib/ and scripts/
```

`prebuild` runs six scripts in order — archive importer, OG-image
generator, current-season sync, weather fetch, `.htaccess` generator,
mobile-app feed builder. See [CLAUDE.md](CLAUDE.md#build-pipeline) for what
each does. All steps are idempotent.

## Where the data comes from

- **1950–2024 history**: the Ergast Database CSV dump in `data/history/`,
  parsed at build time by `scripts/build-archive.mjs` into per-entity
  JSONs under `public/data/archive/`.
- **2020–2026 season bundles**: hand-curated / API-fetched
  `public/data/<year>.json` files with rich session metadata. The current
  year is refreshed from the [Jolpica F1 API](https://api.jolpi.ca)
  (Ergast's successor) by a scheduled workflow — nightly, plus every 10
  minutes over race weekends — which commits the bundle and redeploys.
- **Weather**: next-race forecasts from Open-Meteo at build time
  (`scripts/fetch-weather.mjs`), with baked per-circuit climate normals
  (`npm run build:climate`) as the fallback.
- **Static lookup data**: circuit profiles, driver bios, trivia and
  constructor lineages live in `src/data/` and `scripts/lineages.mjs`.

There are **no runtime API calls** to third parties from the browser. The
client only ever fetches the site's own prerendered JSON (season bundles
and archive indexes) for the year picker, the `/drivers/` + `/teams/`
listings, the search palette, and Compare Mode.

## Deploy

Two GitHub Actions workflows (shared `concurrency: deploy` group):

- **`deploy.yml`** — on push to `main`: `npm ci && npm run build`, then
  FTP-syncs `dist/` to the live server. OG images are restored from a
  content-hashed cache to keep builds fast.
- **`refresh-current-season.yml`** — nightly at 04:00 UTC and every 10
  minutes Fri–Mon (race weekends): fetches the current season from
  Jolpica, commits the bundle if changed, rebuilds and deploys. Because
  the mobile-app feed is regenerated on every deploy, the native apps
  pick up new results within minutes without an app release.

The feedback Cloudflare Worker in `feedback-worker/` is deployed
**separately and manually** with `npx wrangler deploy` — see its README.

## Mobile apps

The native Android/iOS apps ([github.com/lekky/figures-app](https://github.com/lekky/figures-app))
consume the versioned JSON feed this repo generates at
`public/data/app/v1/` (manifest + per-season files + content + archive).
The contract is additive-only within v1 — **read
[docs/app-data-feed.md](docs/app-data-feed.md) before touching
`scripts/build-app-feed.mjs`**.

## Useful URL flags

- `?year=YYYY` on any year-aware listing page (home, calendar, circuits,
  both standings) overrides `localStorage.f1-year` — e.g.
  `https://f1gures.app/calendar/?year=1990`.
- Legacy `?id=` / `?round=` URLs (`/driver.html?id=NOR`, …) still resolve:
  server-side via generated `.htaccess` 301s on Apache, client-side via
  the redirect shims in `public/*.html` everywhere else.
