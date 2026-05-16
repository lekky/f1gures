# Next-race weather indicators

**Date:** 2026-05-16
**Status:** Design - pending implementation plan

## Problem

The homepage's next-race hero card (`NextRacePanel` in [HomeScreen.jsx](src/components/islands/screens/HomeScreen.jsx:157)) shows a per-session schedule (FP1/FP2/FP3/Q/Sprint/Race) with day + time, but no indication of expected conditions. F1 sessions are weather-sensitive - rain transforms strategy, hot tracks degrade tyres - and visitors checking the hero card a few days out have no signal for what to expect.

## Goal

Add a per-session weather indicator (icon + temperature + chance of precipitation) to the schedule rows in the next-race hero. Clicking a row's indicator expands a small panel with an hourly breakdown bracketing the session start. When the race is far enough out that no live forecast exists, fall back to climatological averages for that circuit and calendar week.

## Non-goals

- Weather on past-race pages or upcoming holding pages other than the homepage hero.
- Track surface temperature (Open-Meteo doesn't model it, and air temp is the more useful proxy).
- Wind direction / racing-line implications.
- Rain-delay or red-flag prediction.
- Driver-portrait-style imagery or animated weather.
- A user-facing °C/°F toggle (units are locale-driven only).

## User-facing behaviour

### Visual

Each session row in the schedule gains a fifth column on the right: a small monochrome weather glyph plus inline temperature and (when ≥20%) precipitation %. On mobile the row only renders the glyph; the numbers appear in the expand panel after a tap.

```
Desktop row (forecast available):
  01  PRACTICE 1     Fri   14:30   ☁ 22° 30%
  02  QUALIFYING     Sat   16:00   🌧 19° 70%

Desktop row (climate fallback, >14 days out):
  01  PRACTICE 1     Fri   14:30   ☀
                                   ─ climate
```

A subtle "climate" caption appears under the glyph when the row is showing climatological data rather than a live forecast. Hovering a forecast glyph shows a tooltip with the full text description; clicking opens the expand panel.

### Expand panel

Click the weather cell (or anywhere in the row on mobile) to expand a slim panel directly beneath that row.

**Forecast mode:**
- 7 hourly cells centred on the session start (`start - 3h` ... `start + 3h`).
- Each cell: hour label, WMO icon, temp, precip %.
- One-line prose summary derived from the hourly array, e.g. "Light rain at lights-out, easing in the second half."

**Climate-fallback mode:**
- No hourly cells.
- "Typical conditions for this race week (10-year average)" + climate icon, mean temp, mean precip.
- Footer note: "Live forecast available about 14 days before the race."

Only one row is expanded at a time. Re-clicking the same row closes it. Clicking the panel does not trigger the card-level navigate-to-race-page.

### Units

SSR emits Celsius. On hydration, if `navigator.language` starts with `en-US`, swap to Fahrenheit. No toggle UI.

## Architecture

### Data assets

| File | Source | Cadence | Tracked in git? |
|---|---|---|---|
| `public/data/climate/<circuitRef>.json` | one-shot script `build-climate.mjs` against Open-Meteo ERA5 archive | manual / when circuits change | yes |
| `public/data/weather-next.json` | nightly script `fetch-weather.mjs` against Open-Meteo forecast | runs from `prebuild` | no (gitignored) |
| `scripts/circuit-latlng.json` | hand-edited, single source of truth for circuitRef → lat/lng | manual | yes |

`scripts/circuit-latlng.json` seeds from `data/history/circuits.csv` for circuits covered by the Ergast dump and patches in any circuits the CSV doesn't have (new venues post-2024). Used by both the climate bake and the forecast fetch.

### Climate bake (`scripts/build-climate.mjs`)

Run manually with `npm run build:climate` when adding a circuit. Not in the nightly path - climate normals don't shift overnight.

For each circuit in the current-season calendar:
1. Look up lat/lng from `circuit-latlng.json`. Skip with a warning if absent.
2. Determine the calendar week the race falls on (use current-year `<year>.json`).
3. Call Open-Meteo `/v1/archive` for ±3 days around that week, across the last 10 years, requesting daily `temperature_2m_mean`, `precipitation_sum`, `cloudcover_mean`.
4. Compute means; reduce cloud + precip to a single representative WMO code via a small heuristic in `weather.js`.
5. Write `public/data/climate/<circuitRef>.json`:
   ```json
   { "tempC": 22.4, "precipMm": 1.1, "precipProbPct": 25, "wmo": 2, "samples": 10 }
   ```

### Nightly forecast (`scripts/fetch-weather.mjs`)

Runs from `prebuild`, before Astro build. Sequence: `build-archive.mjs` → `sync-current-season.mjs` → `fetch-weather.mjs`.

1. Pick the next race from `src/data/currentSeason.json` (first round with date ≥ today). "Race date" = Sunday race day; we use it as the latest endpoint of the forecast horizon.
2. If race date is >14 days out, write `weather-next.json` with just `{ generatedAt, round, year, status: "out-of-window" }` and exit 0.
3. Otherwise, look up the circuit's lat/lng. Call Open-Meteo `/v1/forecast` once, requesting hourly `temperature_2m`, `precipitation_probability`, `precipitation`, `weather_code`, `wind_speed_10m`, from `now` through `race_date + 1 day`, in UTC.
4. For each session (`fp1`, `fp2`, `fp3`, `q`, `sprint`, `sprintQuali`, `race`):
   - Find the hour bucket matching the session start time.
   - Capture the 3 hours before and 3 hours after.
5. Write `public/data/weather-next.json`:
   ```json
   {
     "generatedAt": "2026-05-16T04:00:00Z",
     "round": 5,
     "year": 2026,
     "circuitRef": "villeneuve",
     "status": "ok",
     "sessions": {
       "fp1": {
         "at": { "tempC": 22, "precipProbPct": 30, "precipMm": 0.2, "wmo": 3 },
         "hourly": [
           { "tISO": "...", "tempC": 21, "precipProbPct": 20, "precipMm": 0, "wmo": 2 },
           ...7 entries...
         ]
       },
       ...
     }
   }
   ```

**Failure handling:** any non-2xx response, malformed JSON, or network error → log a warning and exit 0 without writing. On CI (clean checkout) the file simply won't exist and the island falls through to climate or no-weather. Local dev keeps the previous successful run's file. The build never fails because of weather.

### Reading in the island

`src/data/currentSeason.js` is the entry point for the home island. After building from `currentSeason.json`:

1. Try to require `public/data/weather-next.json`. If present and `status === "ok"` and `round`/`year` match the next race, attach as `D.weather`.
2. Try to require `public/data/climate/<circuitRef>.json` for the next race. If present, attach as `D.climate`.

Both files are optional. Missing → field absent, no error. Vite will bundle them at build time via dynamic-import-with-vite-glob pattern (similar to how `currentSeason.json` is wired today).

In `NextRacePanel`, for each session, forecast resolution priority:
1. `D.weather.sessions[s.id]` if `D.weather` exists.
2. `D.climate` as a constant fallback (no hourly).
3. Neither → no weather column for that row.

### Components

- `src/lib/weather.js` (pure module): WMO→glyph map, WMO→description map, `formatTemp(c, useFahrenheit)`, `pickSessionHours(hourlyArray, sessionDt)` (returns 7 entries), `summarizeHourly(hourlyEntries)` (one-sentence prose).
- `src/components/islands/screens/WeatherIcon.jsx`: tiny inline-SVG icon set (~8 glyphs: clear, partly-cloudy, cloudy, fog, drizzle, rain, storm, snow). All `currentColor`, single-path where possible. ~1 KB total.
- `src/components/islands/screens/SessionWeatherCell.jsx`: the right-column button rendered in each session row. Receives `forecast | climate | null`, renders glyph + (desktop) inline numbers. Clicking calls a parent-supplied `onToggle(sessionId)`.
- `src/components/islands/screens/SessionWeatherExpand.jsx`: the panel rendered below the active row. Two render branches (forecast / climate). `e.stopPropagation()` on the panel root.

State changes in `NextRacePanel`: one new `useState` for `expandedSessionId`. The existing `sessions.map(...)` rendering grows from one `<div>` per session to a fragment that includes the row and conditionally the expand panel.

### Session row layout

Current grid: `50px 1fr auto auto`. Becomes:

```
Desktop:  50px  1fr  auto  auto  56px      ← icon + inline temp/precip
Mobile:   40px  1fr  auto  auto  28px      ← icon only
```

`css/site.css` gets one matching `@media (max-width: 720px)` rule so the SSR HTML emits the desktop variant and collapses to mobile after paint without JS.

### Locale-driven units

`weather.js` exports `useTempUnit()` hook: SSR + initial render returns `"C"`; an effect post-hydration reads `navigator.language` and returns `"F"` if it starts with `en-US`. No localStorage, no toggle - locale-driven only.

## Edge cases

- **Race weekend in progress:** forecast window includes Sunday, so the race row keeps its glyph. Sessions earlier in the weekend have hours now in the past - Open-Meteo's forecast endpoint returns historical values for those slots, rendered identically.
- **No lat/lng for circuit:** climate bake skips it; forecast fetch falls back to climate (which is also absent), so the column renders nothing. Add to `circuit-latlng.json` to fix.
- **Open-Meteo down at cron time:** CI checkout has no prior file; climate fallback fills the column. Local dev keeps its last successful file.
- **Sessions with `dt === null`:** no weather column for that row (matches existing day/time placeholder behaviour).
- **Year flips at midnight UTC:** `fetch-weather.mjs` reads `currentSeason.json` which `sync-current-season.mjs` has already refreshed - no special handling needed.

## Testing

- `src/lib/weather.test.js` (vitest, since vitest is already in the toolchain):
  - WMO code → glyph mapping covers all documented codes including the deprecated ones (defaults to closest match).
  - `pickSessionHours` returns 7 entries when 7+ are available; handles edge case where the session is in the first/last hours of the forecast window.
  - `formatTemp` rounds correctly and respects unit.
  - `summarizeHourly` produces deterministic prose for fixture arrays (rain-then-clear, clear-throughout, intermittent showers).
- One-off node fixture for `fetch-weather.mjs`: stub `fetch` and assert the written JSON shape matches the schema in this spec.
- Manual visual check in `npm run preview`:
  - Within-window: icons render with temp/precip, expand opens/closes, row click still navigates to race page.
  - Outside-window: climate icons render, expand shows climate copy.
  - Mobile: icon-only column, tap expands.
  - Light + dark mode: icons readable in both (monochrome via `currentColor`).

## Files touched

**New:**
- `scripts/build-climate.mjs`
- `scripts/fetch-weather.mjs`
- `scripts/circuit-latlng.json`
- `src/lib/weather.js`
- `src/lib/weather.test.js`
- `src/components/islands/screens/WeatherIcon.jsx`
- `src/components/islands/screens/SessionWeatherCell.jsx`
- `src/components/islands/screens/SessionWeatherExpand.jsx`
- `public/data/climate/<circuitRef>.json` (one per current-season circuit)

**Modified:**
- `package.json` - add `prebuild` step + `build:climate` script
- `.gitignore` - add `public/data/weather-next.json`
- `src/data/currentSeason.js` - attach `D.weather` + `D.climate`
- `src/components/islands/screens/HomeScreen.jsx` - thread weather data into session rows in `NextRacePanel`
- `scripts/fetch-season.mjs` - capture Jolpica `Circuit.Location.lat/long` so `circuit-latlng.json` can be refreshed for new venues
- `public/css/site.css` - one media-query rule for the mobile weather-column width

## Open questions

None at this stage - all four user decisions captured in the brainstorm (build-time fetch, climate fallback, icon+temp+precip, locale-based units, click-to-expand modal). Implementation can proceed.
