# f1gures — F1 Tracking site

A static, multi-page F1 site that pulls live data from the
[Jolpica F1 API](https://github.com/jolpica/jolpica-f1) (a free, no-auth
successor to the old Ergast API). Drop the folder on any web server and it
works — no build step, no install, no backend.

## What's in the box

```
/
├── index.html                     Home / dashboard
├── standings-drivers.html         Driver championship table + chart + H2H
├── standings-constructors.html    Constructor championship table + chart
├── calendar.html                  Full season calendar
├── circuits.html                  Circuit index
├── circuit.html?id=monaco         Circuit profile (?id=… selects circuit)
├── race.html?round=7              Race detail (?round=… selects round)
├── driver.html?id=NOR             Driver profile (?id=…  selects driver)
│
├── css/
│   ├── app.css        Full design system (tokens, layout, components, type)
│   └── site.css       Deployment-only overrides + utilities + Recharts theme
│
├── js/
│   ├── data.js        Static fallback: bundled fictional season + circuit
│   │                  characteristics (length, corners, lap record, blurbs)
│   ├── api.js         Live data loader (Jolpica F1 API)
│   ├── shell.jsx      Top nav, mobile nav, page chrome, shared components
│   └── screens/       One component file per screen
│       ├── home.jsx
│       ├── standings.jsx        (Drivers + Constructors)
│       ├── calendar.jsx
│       ├── circuits.jsx         (Index + Detail)
│       ├── race.jsx
│       └── driver.jsx
│
└── vendor/            Pinned UMD builds of React, ReactDOM, Babel, Recharts
    ├── react.production.min.js
    ├── react-dom.production.min.js
    ├── babel.min.js
    ├── prop-types.min.js
    └── Recharts.js
```

## How to deploy

1. Upload the whole folder to any static web host — Netlify drop, GitHub Pages,
   Vercel, S3, Cloudflare Pages, your own VPS, anything that serves files.
2. Visit `index.html` in a browser. Live data appears as soon as Jolpica
   responds (typically under a second).

## Where the data comes from

**Live data** (drivers, constructors, calendar, race results, qualifying,
sprint results, standings, session schedules):
[Jolpica F1](https://api.jolpi.ca) — free, no API key, no auth, generous rate
limits (≈500/hour). Fetches happen client-side from the user's browser.
Responses are cached in `localStorage` for an hour, so navigating between
pages doesn't re-hit the API.

**Static data** (circuit length, corners, longest straight, DRS zones, tyre
deg, lap record, blurb): bundled in `js/data.js`. These don't change between
seasons, and Jolpica doesn't carry them. If the FIA tweaks a track layout,
edit the `circuits` object in `data.js`.

**Fallback**: if Jolpica is unreachable for any reason (network outage,
rate-limited, browser blocking the request), the site falls back to the
fictional 2026 data bundled in `js/data.js`. Nothing breaks — the site still
renders, just with placeholder data. You can spot the fallback with
`window.F1_DATA._source` (`'api'` vs `'fallback'`) or by looking at the
network tab.

You can also force the fallback path with `?offline=1` in the URL — handy
for screenshots, demos, or when you don't want to hit the API.

## Configuration

### Use a different API server (proxy or self-hosted Jolpica)

Add `data-api` to `<body>` in any HTML file:

```html
<body data-api="https://your-proxy.example.com/ergast/f1">
```

Or set `window.F1_API_BASE` before `api.js` runs:

```html
<script>window.F1_API_BASE = "https://your-proxy.example.com/ergast/f1";</script>
<script src="js/api.js"></script>
```

This is useful if you want to:
- Cache Jolpica responses on your own backend to spare their rate limit
- Add a CDN in front of the API for speed
- Run [your own Jolpica instance](https://github.com/jolpica/jolpica-f1#contributing)
- Fork and tweak the API responses

### Force the bundled fallback

Append `?offline=1` to any URL.

### Change the cache TTL

In `js/api.js`, look for `TTL_MS = 60 * 60 * 1000` near the top. Default is
1 hour. Set to `0` to always fetch fresh, or higher to be gentler on Jolpica.

## How to make design changes

**Want to change colours, fonts, spacing?** Edit `css/app.css`. The tokens
sit at the very top of the file (`:root { --bg-1: …; --accent: …; … }`).
Every component reads from those tokens, so changing one variable updates
the whole site. `css/site.css` holds deployment-specific responsive layouts
(heroes, grids, breakpoints) and Recharts theming.

**Want to change the layout of a single screen?** Edit the matching file in
`js/screens/`. They all call into `shell.jsx` for shared pieces.

**Want to change circuit blurbs / track stats?** Edit the `circuits` object
in `js/data.js`.

**Want to swap in different driver silhouettes / circuit maps?** Replace the
placeholder boxes in `js/shell.jsx` (`DriverSilhouette`) and
`js/screens/circuits.jsx` (`.img-placeholder`) with real `<img>` tags.

## How it works under the hood

- Each page is its own React render — no SPA router. Pages link to each
  other with plain `<a href="…">` links, which is what makes the site work
  on any static host without configuration (no rewrites, no fallbacks).
- JSX is compiled in the browser at runtime by `@babel/standalone`. Fine
  for a small site. To precompile for production, run the screen files
  through esbuild/swc/babel-cli and change `<script type="text/babel">` to
  plain `<script>`.
- React, ReactDOM, Babel, prop-types, and Recharts are bundled in `vendor/`,
  so the site has no CDN dependencies for its libraries.
- `data.js` runs first and synchronously sets `window.F1_DATA` to the
  bundled fallback, so the page has *something* to render against
  immediately. `api.js` then fetches from Jolpica in parallel; once the
  fetch resolves, it replaces `window.F1_DATA` with live data and resolves
  `window.F1_READY`. Each page waits for `window.F1_READY` before rendering,
  so the user only sees the final, live-data version.

## API endpoints used

The live loader hits these Jolpica endpoints (all under
`https://api.jolpi.ca/ergast/f1/current/`):

| Endpoint | Purpose |
|---|---|
| `/current/` | Season schedule with practice/quali/sprint times per round |
| `/current/drivers/` | Driver list (name, code, number, nationality) |
| `/current/constructors/` | Constructor list (name, nationality) |
| `/current/driverstandings/` | Driver→team mapping + last completed round |
| `/current/{round}/results/` | Race results for one completed round |
| `/current/{round}/qualifying/` | Qualifying times for one completed round |
| `/current/{round}/sprint/` | Sprint results (sprint weekends only) |

If you want richer per-session data (tyre stints, sector times, telemetry,
weather, race control messages), [OpenF1](https://openf1.org) covers that
ground for 2023+ — also free, also no auth. The current loader doesn't use
it, but `js/api.js` is small enough (~400 lines) that adding OpenF1 calls
to enrich existing screens or feed a new screen is straightforward.

## Notes

- Jolpica's terms ask you to be respectful of their rate limit (≈500
  req/hour, with burst). The 1-hour cache means a typical user generates
  fewer than 30 requests per session, so this isn't a real concern unless
  you have heavy traffic — in which case put a CDN/proxy between you and
  Jolpica with `data-api`.
- `localStorage` is per-origin per-browser; clearing it forces a fresh
  fetch on next load.
- Tested in Chromium-based browsers. Should work in Firefox and Safari too,
  but Babel's in-browser transform is the slowest part of first paint —
  precompiling for production is recommended if you care about Lighthouse
  scores.
