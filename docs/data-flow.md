# Data flow

Every page boots through the same sequence:

1. **Vendor scripts** - React, ReactDOM, Babel-standalone, prop-types, Recharts.
2. **[js/data.js](../js/data.js)** runs synchronously and assigns `window.F1_DATA` to a hardcoded 2026 fallback (20 drivers, 10 teams, 24-round calendar, circuit metadata). This means screens always have *something* to read at first paint, even before the network resolves.
3. **[js/api.js](../js/api.js)** runs and immediately defines `window.F1_READY` as a Promise. It then kicks off the live load (or skips it; see decision tree below). Whatever the outcome, when it finishes it **replaces** `window.F1_DATA` with the loaded payload and resolves `F1_READY`.
4. **[js/shell.jsx](../js/shell.jsx)** and the **screen** file are loaded as `text/babel` and compiled in-browser.
5. The page's inline boot script awaits `F1_READY` and then calls `ReactDOM.render(<Chrome><Screen /></Chrome>, root)`.

> Babel evaluates module-level code before `F1_READY` resolves. So **never read `window.F1_DATA` at module scope** - always inside the component body, otherwise you capture the static fallback.

## When does the API get hit?

The decision is in `load()` near the bottom of [js/api.js](../js/api.js):

```
?offline=1                        → static fallback only (zero requests)
SELECTED_YEAR === 'current'       → loadFromAPI()         (Jolpica)
SELECTED_YEAR is "1950".."2025"   → loadFromLocal()       (data/<year>.json)
                                  → on 404, falls through to loadFromAPI()
```

`SELECTED_YEAR` comes from `?year=YYYY` first, then `localStorage.f1-year`, then defaults to `'current'`.

So in normal use:

- **Current season** is always live. Fresh data each cache window.
- **Past seasons that we've snapshotted** load from the bundled `data/<year>.json`. **Zero API calls.** This is the preferred state for any year that's done.
- **Past seasons that we haven't snapshotted yet** fall through to the API. Use `node scripts/fetch-season.mjs <year>` to commit a bundle and convert that year to the zero-API path.

The Jolpica base URL defaults to `https://api.jolpi.ca/ergast/f1`. Override with `window.F1_API_BASE = '...'` or `<body data-api="...">`.

## What `loadFromAPI` actually fetches

For the current season, `loadFromAPI()` makes:

- `/{year}/?limit=100` - schedule
- `/{year}/drivers/?limit=100` - drivers
- `/{year}/constructors/?limit=100` - constructors
- `/{year}/driverstandings/?limit=100` - standings (also tells us the latest completed round)
- For each completed round: `/{year}/{round}/results/`, `/{year}/{round}/qualifying/`, and `/{year}/{round}/sprint/` if the round was a sprint weekend

That's about 4 + 2N + (sprint count) requests on a cold cache. They go through `fetchJSON` which handles caching, concurrency, and retry.

## Cache

All Jolpica responses go through one `fetchJSON(path)` helper in [js/api.js](../js/api.js). Behaviour:

- **localStorage**, key `f1gures.api.v1.<path>`, value `{ t: timestamp, v: response }`.
- **TTL: 1 hour.** If the entry is older than that, it's treated as a miss.
- Quota exceeded or private-mode failures are caught silently - the cache is best-effort.
- Cache key is the request path, so the same endpoint shared between screens (e.g. driver standings on home and on the standings page) only hits the network once per hour.

To invalidate by hand:

```js
Object.keys(localStorage).filter(k => k.startsWith('f1gures.api.')).forEach(k => localStorage.removeItem(k));
```

Other localStorage keys the app uses:

- `f1-year` - the year picker's selection (`'current'` or `"YYYY"`).
- `f1-theme` - `'light'` or `'dark'`.

## Concurrency gate

Jolpica rate-limits aggressive bursts (HTTP 429). To avoid that, `fetchJSON` runs through a 4-deep concurrency gate (`MAX_INFLIGHT = 4`). Excess requests queue and acquire a slot when one frees up. Both the boot fetches and the driver-career fan-out share this gate.

## Retry

Inside the gate, each request will retry up to **5 attempts** for transient failures:

| Failure | Retry? | Backoff |
|---|---|---|
| `TypeError: Failed to fetch` (network drop) | yes | exponential, capped at 4s |
| HTTP 429 (rate limited) | yes | `Retry-After` header if present, else exponential |
| HTTP 503 (service unavailable) | yes | same as 429 |
| HTTP 4xx (other) | **no** | throws immediately |
| HTTP 5xx (other) | **no** | throws immediately |

Backoff schedule: `min(500 * 2^attempt, 4000)` ms - i.e. 0.5s, 1s, 2s, 4s, 4s.

This was added because cold-cache loads on mobile networks were occasionally seeing one fetch in the parallel fan-out reject with `TypeError: Failed to fetch`, which without retry was enough to tank the whole driver-career panel.

## Live driver career stats

The per-driver Career Stats panel on `driver.html` is **never hardcoded**. It tries a static cross-user cache first, then falls back to live Jolpica.

`window.F1_API.fetchDriverCareer(jolpicaId)` (in [js/api.js](../js/api.js)):

1. **Static cross-user cache** - `fetch('data/careers/<jolpicaId>.json')`. Same origin, browser-cached, zero Jolpica calls. The file is one of ~25 pre-fetched payloads committed to the repo, refreshed nightly by [.github/workflows/refresh-careers.yml](../.github/workflows/refresh-careers.yml). This is the path 99% of visitors take.
2. **Live fan-out** - only if the static file is missing or malformed (e.g. a brand-new driver not yet in the curated list). Two phases:
   - **Phase A** - eight cheap `total`-count endpoints in parallel:
     - `/drivers/{id}/seasons/?limit=1`
     - `/drivers/{id}/races/?limit=1`
     - `/drivers/{id}/results/{1,2,3}/?limit=1` (wins, P2s, P3s - podiums = sum)
     - `/drivers/{id}/qualifying/1/?limit=1` (poles)
     - `/drivers/{id}/fastest/1/results/?limit=1` (fastest laps)
     - `/drivers/{id}/seasons/?limit=100` (the full list of years they've raced)
   - **Phase B** - one `/{year}/drivers/{id}/driverstandings/?limit=1` per participating season, in parallel. Counts seasons where `position === '1'` to derive the championship total. Jolpica diverges from classic Ergast by requiring `season_year` for cross-season standings, so this fan-out is necessary.

For Hamilton (the heaviest live case, 20 seasons) that's 8 + 1 + 20 ≈ 29 requests. The concurrency gate keeps it polite; the in-memory cache makes repeat visits free for an hour.

The driver page waits for `F1_READY` to resolve before kicking off the career fetch, so it doesn't compete with the boot fan-out for slots in the gate.

## Nightly refresh

[.github/workflows/refresh-careers.yml](../.github/workflows/refresh-careers.yml) runs at 05:00 UTC each night and on `workflow_dispatch`. It checks out the repo, runs `node scripts/fetch-careers.mjs`, and commits any changes to `data/careers/` - which the existing `deploy.yml` then FTPs to production.

[scripts/fetch-careers.mjs](../scripts/fetch-careers.mjs) processes drivers **sequentially** (one at a time, with an 750ms pause between drivers) to be polite to Jolpica's rate limit. Within each driver, the same fan-out as the client runs in parallel through a 4-deep concurrency gate. Driver IDs are the union of `js/data.js` (current grid) and every `data/<year>.json` (recent seasons), deduped.

If the new payload matches the existing file (excluding `updatedAt`), the file is left alone - no noisy commits when nothing changed. To run by hand: `node scripts/fetch-careers.mjs`.

## Failure modes

If the live load fails (network down, Jolpica unreachable, etc.), `F1_READY` still resolves - it just resolves with whatever `window.F1_DATA` already was, i.e. the bundled fallback. The site stays functional offline.

The career-stats panel is independent: if Jolpica is unreachable when the user opens a driver page, that panel shows `-` placeholders but the rest of the page still renders fine using `F1_DATA`.
