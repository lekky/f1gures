# Next-race Weather Indicators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-session weather indicators (icon + temp + precip %) to the homepage next-race hero, with build-time forecast bake via Open-Meteo, climatological fallback for races >14 days out, and a click-to-expand hourly panel.

**Architecture:** A pure-data module (`src/lib/weather.js`) maps Open-Meteo WMO codes to glyphs and provides formatting/selection helpers; an inline-SVG icon component renders the glyph at the row level. Two build-time scripts populate `src/data/weather-next.json` (nightly, in `prebuild`) and `src/data/climate/<circuitRef>.json` (manual, via `npm run build:climate`). Both files are gitignored and statically imported via `import.meta.glob` so missing files don't break the build. `NextRacePanel` in [HomeScreen.jsx](src/components/islands/screens/HomeScreen.jsx) grows a fifth column and a small expand-on-click panel.

**Tech Stack:** Astro 4 SSG, React 18 islands, Node 20+ `fetch` (no new deps), Open-Meteo free APIs (`/v1/archive` for climate, `/v1/forecast` for live), Vitest 2 for unit tests.

**Spec:** [docs/superpowers/specs/2026-05-16-next-race-weather-design.md](../specs/2026-05-16-next-race-weather-design.md)

**Deviation from spec:** Spec mentions `public/data/weather-next.json` and `public/data/climate/`. Implementation puts them under `src/data/` instead, mirroring the existing `src/data/currentSeason.json` pattern - this lets the islands `import` them via Vite's static + glob handling rather than `fetch()` at runtime, which keeps the homepage zero-runtime-dependency.

---

## File map

**Create:**
- `src/lib/weather.js` - WMO code → glyph map, WMO → description map, `formatTemp(c, useFahrenheit)`, `pickSessionHours(hourlyArray, sessionMs)`, `summarizeHourly(hourlyEntries)`, `wmoFromMeans(cloud, precip)`, `useTempUnit()` hook.
- `src/lib/weather.test.js` - vitest unit tests for the helpers above.
- `src/components/islands/screens/WeatherIcon.jsx` - inline-SVG icon component, 8 glyphs.
- `src/components/islands/screens/SessionWeatherCell.jsx` - row-level icon + inline temp/precip button.
- `src/components/islands/screens/SessionWeatherExpand.jsx` - per-row hourly/climate breakdown panel.
- `scripts/circuit-latlng.json` - hand-edited circuitRef → { lat, lng } map for current-season circuits, seeded from Ergast `circuits.csv`.
- `scripts/build-climate.mjs` - one-shot script, fetches ERA5 10-year means per circuit, writes `src/data/climate/<circuitRef>.json`.
- `scripts/fetch-weather.mjs` - nightly script, fetches the forecast for the next race, writes `src/data/weather-next.json`.

**Modify:**
- `package.json` - add `build:climate` script; add `fetch:weather` to `prebuild`.
- `.gitignore` - ignore `src/data/weather-next.json` and `src/data/climate/`.
- `src/data/currentSeason.js` - attach `D.weather` + `D.climate` from the generated files.
- `src/components/islands/screens/HomeScreen.jsx` - new state in `NextRacePanel`, new grid column in the session row, render `<SessionWeatherCell>` and conditional `<SessionWeatherExpand>`.
- `public/css/site.css` - one mobile media-query rule for the weather column width.
- `scripts/fetch-season.mjs` - capture `Circuit.Location.lat`/`long` from Jolpica so new venues' lat/lng can be copied into `circuit-latlng.json` later.

---

## Task 1: weather.js pure helpers + tests

**Files:**
- Create: `src/lib/weather.js`
- Create: `src/lib/weather.test.js`

- [ ] **Step 1: Write failing tests for the WMO glyph map**

Create `src/lib/weather.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  wmoToGlyph,
  wmoToDescription,
  formatTemp,
  pickSessionHours,
  summarizeHourly,
  wmoFromMeans,
} from './weather.js';

describe('wmoToGlyph', () => {
  it('maps clear sky', () => {
    expect(wmoToGlyph(0)).toBe('clear');
  });
  it('maps partly cloudy (1, 2)', () => {
    expect(wmoToGlyph(1)).toBe('partly-cloudy');
    expect(wmoToGlyph(2)).toBe('partly-cloudy');
  });
  it('maps overcast (3) to cloudy', () => {
    expect(wmoToGlyph(3)).toBe('cloudy');
  });
  it('maps fog codes (45, 48)', () => {
    expect(wmoToGlyph(45)).toBe('fog');
    expect(wmoToGlyph(48)).toBe('fog');
  });
  it('maps drizzle (51, 53, 55, 56, 57)', () => {
    [51, 53, 55, 56, 57].forEach(c => expect(wmoToGlyph(c)).toBe('drizzle'));
  });
  it('maps rain codes (61, 63, 65, 66, 67, 80, 81, 82)', () => {
    [61, 63, 65, 66, 67, 80, 81, 82].forEach(c => expect(wmoToGlyph(c)).toBe('rain'));
  });
  it('maps snow codes (71, 73, 75, 77, 85, 86)', () => {
    [71, 73, 75, 77, 85, 86].forEach(c => expect(wmoToGlyph(c)).toBe('snow'));
  });
  it('maps thunderstorm codes (95, 96, 99)', () => {
    [95, 96, 99].forEach(c => expect(wmoToGlyph(c)).toBe('storm'));
  });
  it('defaults to cloudy for unknown codes', () => {
    expect(wmoToGlyph(999)).toBe('cloudy');
    expect(wmoToGlyph(null)).toBe('cloudy');
    expect(wmoToGlyph(undefined)).toBe('cloudy');
  });
});

describe('wmoToDescription', () => {
  it('returns a human-readable string', () => {
    expect(wmoToDescription(0)).toMatch(/clear/i);
    expect(wmoToDescription(95)).toMatch(/thunder/i);
  });
  it('returns "Unknown" for unknown codes', () => {
    expect(wmoToDescription(999)).toBe('Unknown');
  });
});

describe('formatTemp', () => {
  it('rounds Celsius', () => {
    expect(formatTemp(22.4, false)).toBe('22°');
    expect(formatTemp(22.6, false)).toBe('23°');
  });
  it('converts to Fahrenheit and rounds', () => {
    expect(formatTemp(0, true)).toBe('32°');
    expect(formatTemp(100, true)).toBe('212°');
    expect(formatTemp(22, true)).toBe('72°');
  });
  it('returns dash for null', () => {
    expect(formatTemp(null, false)).toBe('-');
    expect(formatTemp(undefined, true)).toBe('-');
  });
});

describe('pickSessionHours', () => {
  const hourly = Array.from({ length: 24 }, (_, i) => ({
    tISO: `2026-05-24T${String(i).padStart(2, '0')}:00:00Z`,
    tempC: 20 + i * 0.1,
    precipProbPct: 0,
    precipMm: 0,
    wmo: 0,
  }));

  it('returns 7 entries centred on the session start', () => {
    const sessionMs = new Date('2026-05-24T15:00:00Z').getTime();
    const result = pickSessionHours(hourly, sessionMs);
    expect(result).toHaveLength(7);
    expect(result[3].tISO).toBe('2026-05-24T15:00:00Z');
    expect(result[0].tISO).toBe('2026-05-24T12:00:00Z');
    expect(result[6].tISO).toBe('2026-05-24T18:00:00Z');
  });

  it('clamps to start when session is in first hours', () => {
    const sessionMs = new Date('2026-05-24T01:00:00Z').getTime();
    const result = pickSessionHours(hourly, sessionMs);
    expect(result).toHaveLength(7);
    expect(result[0].tISO).toBe('2026-05-24T00:00:00Z');
  });

  it('clamps to end when session is near last hours', () => {
    const sessionMs = new Date('2026-05-24T23:00:00Z').getTime();
    const result = pickSessionHours(hourly, sessionMs);
    expect(result).toHaveLength(7);
    expect(result[6].tISO).toBe('2026-05-24T23:00:00Z');
  });

  it('returns [] when array is empty', () => {
    expect(pickSessionHours([], Date.now())).toEqual([]);
  });
});

describe('summarizeHourly', () => {
  it('describes clear-throughout', () => {
    const hours = Array.from({ length: 7 }, () => ({ wmo: 0, precipProbPct: 5, tempC: 22 }));
    expect(summarizeHourly(hours)).toMatch(/clear|dry/i);
  });
  it('describes rain-throughout', () => {
    const hours = Array.from({ length: 7 }, () => ({ wmo: 63, precipProbPct: 80, tempC: 18 }));
    expect(summarizeHourly(hours)).toMatch(/rain/i);
  });
  it('describes rain-then-clear', () => {
    const hours = [
      { wmo: 63, precipProbPct: 80, tempC: 18 },
      { wmo: 63, precipProbPct: 70, tempC: 18 },
      { wmo: 63, precipProbPct: 60, tempC: 19 },
      { wmo: 2, precipProbPct: 30, tempC: 20 },
      { wmo: 1, precipProbPct: 10, tempC: 21 },
      { wmo: 0, precipProbPct: 5, tempC: 22 },
      { wmo: 0, precipProbPct: 5, tempC: 22 },
    ];
    const s = summarizeHourly(hours);
    expect(s).toMatch(/rain/i);
    expect(s).toMatch(/clear|dry|easing/i);
  });
  it('returns empty string for empty input', () => {
    expect(summarizeHourly([])).toBe('');
  });
});

describe('wmoFromMeans', () => {
  it('returns clear for low cloud + zero precip', () => {
    expect(wmoFromMeans(10, 0)).toBe(0);
  });
  it('returns partly-cloudy code for moderate cloud + zero precip', () => {
    expect(wmoFromMeans(45, 0)).toBe(2);
  });
  it('returns cloudy code for high cloud + zero precip', () => {
    expect(wmoFromMeans(85, 0)).toBe(3);
  });
  it('returns rain code for any cloud + significant precip', () => {
    expect(wmoFromMeans(60, 5)).toBe(63);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- weather`
Expected: all tests fail with `Cannot find module './weather.js'`.

- [ ] **Step 3: Implement weather.js**

Create `src/lib/weather.js`:

```js
import { useEffect, useState } from 'react';

// WMO weather code → glyph id (see WeatherIcon.jsx for the SVG set).
// Codes come from Open-Meteo. Anything unmapped falls back to 'cloudy'.
const WMO_GLYPH = {
  0: 'clear',
  1: 'partly-cloudy', 2: 'partly-cloudy',
  3: 'cloudy',
  45: 'fog', 48: 'fog',
  51: 'drizzle', 53: 'drizzle', 55: 'drizzle',
  56: 'drizzle', 57: 'drizzle',
  61: 'rain', 63: 'rain', 65: 'rain',
  66: 'rain', 67: 'rain',
  71: 'snow', 73: 'snow', 75: 'snow', 77: 'snow',
  80: 'rain', 81: 'rain', 82: 'rain',
  85: 'snow', 86: 'snow',
  95: 'storm', 96: 'storm', 99: 'storm',
};

const WMO_DESCRIPTION = {
  0: 'Clear sky',
  1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
  61: 'Light rain', 63: 'Moderate rain', 65: 'Heavy rain',
  66: 'Light freezing rain', 67: 'Heavy freezing rain',
  71: 'Light snow', 73: 'Moderate snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
  85: 'Light snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with light hail', 99: 'Thunderstorm with heavy hail',
};

export function wmoToGlyph(code) {
  return WMO_GLYPH[code] || 'cloudy';
}

export function wmoToDescription(code) {
  return WMO_DESCRIPTION[code] || 'Unknown';
}

export function formatTemp(celsius, useFahrenheit) {
  if (celsius == null) return '-';
  const v = useFahrenheit ? (celsius * 9) / 5 + 32 : celsius;
  return `${Math.round(v)}°`;
}

// Returns 7 hourly entries: 3 before, the session-start hour, 3 after.
// Clamps at array boundaries so the slice is always full-width when possible.
export function pickSessionHours(hourly, sessionMs) {
  if (!hourly || hourly.length === 0) return [];
  let idx = 0, best = Infinity;
  for (let i = 0; i < hourly.length; i++) {
    const d = Math.abs(new Date(hourly[i].tISO).getTime() - sessionMs);
    if (d < best) { best = d; idx = i; }
  }
  let start = Math.max(0, idx - 3);
  let end = Math.min(hourly.length, start + 7);
  start = Math.max(0, end - 7);
  return hourly.slice(start, end);
}

// One-sentence prose given the 7 hourly entries.
export function summarizeHourly(hours) {
  if (!hours || hours.length === 0) return '';
  const wet = hours.filter(h => (h.wmo >= 51 && h.wmo <= 67) || (h.wmo >= 80 && h.wmo <= 82) || (h.wmo >= 95 && h.wmo <= 99));
  const dryCount = hours.length - wet.length;
  if (wet.length === 0) return 'Clear and dry throughout the session window.';
  if (wet.length === hours.length) return 'Rain expected across the full session window.';
  const firstWetIdx = hours.findIndex(h => wet.includes(h));
  const lastWetIdx = hours.length - 1 - [...hours].reverse().findIndex(h => wet.includes(h));
  if (firstWetIdx <= 1 && lastWetIdx < hours.length - 2) {
    return 'Rain at the start of the window, easing later.';
  }
  if (firstWetIdx > 1 && lastWetIdx >= hours.length - 2) {
    return 'Dry early, with rain developing later in the window.';
  }
  if (dryCount >= 3) return 'Intermittent showers across the session window.';
  return 'Mostly wet across the session window.';
}

// Reduce climate normal means (cloud %, precip mm) to a representative WMO code.
export function wmoFromMeans(meanCloudPct, meanPrecipMm) {
  if (meanPrecipMm >= 2) return 63;
  if (meanPrecipMm >= 0.5) return 61;
  if (meanCloudPct >= 70) return 3;
  if (meanCloudPct >= 30) return 2;
  return 0;
}

// SSR-safe Celsius/Fahrenheit unit hook.
// Initial render: 'C' (matches prerendered HTML for everyone).
// After hydration: 'F' if navigator.language starts with 'en-US', else 'C'.
export function useTempUnit() {
  const [unit, setUnit] = useState('C');
  useEffect(() => {
    try {
      const lang = (navigator && navigator.language) || '';
      if (lang.startsWith('en-US')) setUnit('F');
    } catch { /* navigator unavailable */ }
  }, []);
  return unit;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- weather`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/weather.js src/lib/weather.test.js
git commit -m "feat(weather): add WMO mapping and helpers for next-race forecast"
```

---

## Task 2: WeatherIcon SVG component

**Files:**
- Create: `src/components/islands/screens/WeatherIcon.jsx`

- [ ] **Step 1: Create the component**

Each glyph is an inline SVG using `currentColor` so it inherits the row's text colour and respects light/dark mode. Strokes only (no fills) to keep the line-art aesthetic of the site.

Create `src/components/islands/screens/WeatherIcon.jsx`:

```jsx
import { wmoToGlyph, wmoToDescription } from '../../../lib/weather.js';

const PATHS = {
  clear: (
    <>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="3" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="21" />
      <line x1="3" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="21" y2="12" />
      <line x1="5.6" y1="5.6" x2="7" y2="7" />
      <line x1="17" y1="17" x2="18.4" y2="18.4" />
      <line x1="5.6" y1="18.4" x2="7" y2="17" />
      <line x1="17" y1="7" x2="18.4" y2="5.6" />
    </>
  ),
  'partly-cloudy': (
    <>
      <circle cx="8" cy="9" r="3" />
      <path d="M10 18a4 4 0 0 1 0-8 5 5 0 0 1 9.8 1.5A3.5 3.5 0 0 1 18 18z" />
    </>
  ),
  cloudy: (
    <path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.8 1.5A3.5 3.5 0 0 1 15 18z" />
  ),
  fog: (
    <>
      <path d="M5 11h14" />
      <path d="M5 15h14" />
      <path d="M7 7h10" />
      <path d="M7 19h10" />
    </>
  ),
  drizzle: (
    <>
      <path d="M7 14a4 4 0 0 1 0-8 5 5 0 0 1 9.8 1.5A3.5 3.5 0 0 1 15 14z" />
      <line x1="9" y1="17" x2="9" y2="19" />
      <line x1="13" y1="17" x2="13" y2="19" />
    </>
  ),
  rain: (
    <>
      <path d="M7 12a4 4 0 0 1 0-8 5 5 0 0 1 9.8 1.5A3.5 3.5 0 0 1 15 12z" />
      <line x1="8" y1="16" x2="7" y2="20" />
      <line x1="12" y1="16" x2="11" y2="20" />
      <line x1="16" y1="16" x2="15" y2="20" />
    </>
  ),
  storm: (
    <>
      <path d="M7 12a4 4 0 0 1 0-8 5 5 0 0 1 9.8 1.5A3.5 3.5 0 0 1 15 12z" />
      <polyline points="11 14 9 18 12 18 10 22" />
    </>
  ),
  snow: (
    <>
      <path d="M7 12a4 4 0 0 1 0-8 5 5 0 0 1 9.8 1.5A3.5 3.5 0 0 1 15 12z" />
      <line x1="9" y1="16" x2="9" y2="20" />
      <line x1="7" y1="18" x2="11" y2="18" />
      <line x1="14" y1="16" x2="14" y2="20" />
      <line x1="12" y1="18" x2="16" y2="18" />
    </>
  ),
};

export default function WeatherIcon({ wmo, size = 18, strokeWidth = 1.5, title }) {
  const glyph = wmoToGlyph(wmo);
  const ttl = title || wmoToDescription(wmo);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={ttl}
    >
      <title>{ttl}</title>
      {PATHS[glyph] || PATHS.cloudy}
    </svg>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/islands/screens/WeatherIcon.jsx
git commit -m "feat(weather): add inline-SVG icon component"
```

---

## Task 3: Seed circuit-latlng.json from Ergast

**Files:**
- Create: `scripts/circuit-latlng.json`

- [ ] **Step 1: Generate the seed data**

Run this one-off script in a terminal to extract every circuit from `data/history/circuits.csv`:

```bash
node -e "
const fs = require('fs');
const parse = require('csv-parse/sync').parse;
const csv = fs.readFileSync('data/history/circuits.csv', 'utf8');
const rows = parse(csv, { columns: true, skip_empty_lines: true });
const out = {};
for (const r of rows) {
  out[r.circuitRef] = { lat: parseFloat(r.lat), lng: parseFloat(r.lng) };
}
// Aliases that show up in season bundles but not in Ergast circuits.csv:
out.albert = out.albert_park;
out.marina = out.marina_bay;
out.lasvegas = out.vegas;
out.yas = out.yas_marina;
out.montreal = out.villeneuve;
out.cota = out.americas;
out.spielberg = out.red_bull_ring;
fs.writeFileSync('scripts/circuit-latlng.json', JSON.stringify(out, null, 2));
console.log('wrote', Object.keys(out).length, 'circuits');
"
```

Expected output: `wrote 80+ circuits`.

- [ ] **Step 2: Verify the file has key circuits**

Run: `node -e "const j=require('./scripts/circuit-latlng.json'); console.log(j.villeneuve, j.silverstone, j.monaco);"`
Expected: each entry shows `{ lat: <num>, lng: <num> }` with sensible coordinates.

- [ ] **Step 3: Commit**

```bash
git add scripts/circuit-latlng.json
git commit -m "feat(weather): seed circuit lat/lng map from Ergast + aliases"
```

---

## Task 4: build-climate.mjs - one-shot climate bake

**Files:**
- Create: `scripts/build-climate.mjs`

- [ ] **Step 1: Write the script**

Create `scripts/build-climate.mjs`:

```js
// scripts/build-climate.mjs - one-shot climate normals bake.
//
// For each circuit in the current-season calendar, fetch 10 years of ERA5
// historical weather around that circuit's race-week window from Open-Meteo,
// compute mean temperature / precipitation / cloud cover, derive a WMO
// representative code, and write src/data/climate/<circuitRef>.json.
//
// Run manually with `npm run build:climate` when:
//   - the calendar adds a new circuit
//   - a circuit's race date shifts by more than ~2 weeks
//   - you want to re-baseline (climate normals don't change overnight,
//     so this is not in the nightly path)
//
// All errors are non-fatal; circuits that fail are logged and skipped.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'src', 'data', 'climate');
const LATLNG_PATH = join(__dirname, 'circuit-latlng.json');
const SEASON_PATH = join(ROOT, 'src', 'data', 'currentSeason.json');

const YEARS_BACK = 10;
const WINDOW_DAYS = 3;
const FETCH_DELAY_MS = 300;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function wmoFromMeans(meanCloudPct, meanPrecipMm) {
  if (meanPrecipMm >= 2) return 63;
  if (meanPrecipMm >= 0.5) return 61;
  if (meanCloudPct >= 70) return 3;
  if (meanCloudPct >= 30) return 2;
  return 0;
}

async function fetchArchive(lat, lng, startDate, endDate) {
  const url = new URL('https://archive-api.open-meteo.com/v1/archive');
  url.searchParams.set('latitude', lat);
  url.searchParams.set('longitude', lng);
  url.searchParams.set('start_date', startDate);
  url.searchParams.set('end_date', endDate);
  url.searchParams.set('daily', 'temperature_2m_mean,precipitation_sum,cloud_cover_mean');
  url.searchParams.set('timezone', 'UTC');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status} ${res.statusText} for ${lat},${lng} ${startDate}..${endDate}`);
  return res.json();
}

function windowDates(raceDateIso, windowDays) {
  const d = new Date(raceDateIso + 'T00:00:00Z');
  const start = new Date(d); start.setUTCDate(d.getUTCDate() - windowDays);
  const end = new Date(d); end.setUTCDate(d.getUTCDate() + windowDays);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

function mean(arr) {
  const xs = arr.filter(x => Number.isFinite(x));
  if (!xs.length) return null;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

async function climateForCircuit(circuitRef, lat, lng, raceDateIso) {
  const raceDate = new Date(raceDateIso + 'T00:00:00Z');
  const currentYear = raceDate.getUTCFullYear();
  const allTemps = [], allPrecip = [], allCloud = [];
  for (let i = 1; i <= YEARS_BACK; i++) {
    const y = currentYear - i;
    const refDate = new Date(Date.UTC(y, raceDate.getUTCMonth(), raceDate.getUTCDate()));
    const [start, end] = windowDates(refDate.toISOString().slice(0, 10), WINDOW_DAYS);
    try {
      const json = await fetchArchive(lat, lng, start, end);
      const d = json.daily || {};
      (d.temperature_2m_mean || []).forEach(v => allTemps.push(v));
      (d.precipitation_sum || []).forEach(v => allPrecip.push(v));
      (d.cloud_cover_mean || []).forEach(v => allCloud.push(v));
    } catch (err) {
      console.warn(`[climate] ${circuitRef} ${y}: ${err.message}`);
    }
    await sleep(FETCH_DELAY_MS);
  }
  const tempC = mean(allTemps);
  const precipMm = mean(allPrecip);
  const cloud = mean(allCloud);
  if (tempC == null) return null;
  return {
    tempC: Math.round(tempC * 10) / 10,
    precipMm: Math.round((precipMm || 0) * 10) / 10,
    precipProbPct: Math.min(100, Math.round((precipMm || 0) * 25)),
    wmo: wmoFromMeans(cloud || 0, precipMm || 0),
    samples: YEARS_BACK,
  };
}

async function main() {
  if (!existsSync(SEASON_PATH)) {
    console.error('[climate] src/data/currentSeason.json missing - run `npm run sync:current` first.');
    process.exit(1);
  }
  if (!existsSync(LATLNG_PATH)) {
    console.error('[climate] scripts/circuit-latlng.json missing.');
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const season = JSON.parse(readFileSync(SEASON_PATH, 'utf8'));
  const latlng = JSON.parse(readFileSync(LATLNG_PATH, 'utf8'));
  const calendar = season.calendar || [];
  if (!calendar.length) {
    console.log('[climate] empty calendar, nothing to bake.');
    return;
  }
  let ok = 0, skipped = 0;
  for (const race of calendar) {
    const ref = race.circuit;
    const ll = latlng[ref];
    if (!ll) {
      console.warn(`[climate] no lat/lng for circuit "${ref}", skipping`);
      skipped++;
      continue;
    }
    if (!race.date) { skipped++; continue; }
    const data = await climateForCircuit(ref, ll.lat, ll.lng, race.date);
    if (!data) { skipped++; continue; }
    writeFileSync(join(OUT_DIR, `${ref}.json`), JSON.stringify(data, null, 2));
    ok++;
    console.log(`[climate] ${ref}: ${data.tempC}°C, ${data.precipMm}mm, wmo=${data.wmo}`);
  }
  console.log(`[climate] done. wrote ${ok}, skipped ${skipped}`);
}

main().catch(err => {
  console.error('[climate] fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm script and run once**

In `package.json`, add to `scripts`:

```json
"build:climate": "node scripts/build-climate.mjs",
```

- [ ] **Step 3: Run the bake to generate the JSON files**

Run: `npm run sync:current && npm run build:climate`
Expected: console output showing each circuit's mean values; ~20 files written to `src/data/climate/`.

- [ ] **Step 4: Spot-check one file**

Run: `cat src/data/climate/villeneuve.json` (or whichever circuit is in the current season).
Expected: a JSON object like `{ "tempC": 18.4, "precipMm": 2.1, "precipProbPct": 53, "wmo": 61, "samples": 10 }`.

- [ ] **Step 5: Commit the script (NOT the generated JSONs - those are gitignored in Task 6)**

```bash
git add scripts/build-climate.mjs package.json
git commit -m "feat(weather): add climate bake script using Open-Meteo ERA5"
```

---

## Task 5: fetch-weather.mjs - nightly forecast script

**Files:**
- Create: `scripts/fetch-weather.mjs`

- [ ] **Step 1: Write the script**

Create `scripts/fetch-weather.mjs`:

```js
// scripts/fetch-weather.mjs - nightly forecast fetch for the next race.
//
// Runs from `prebuild`. Picks the first race in src/data/currentSeason.json
// whose date is >= today. If that race is >14 days out, writes an
// out-of-window marker. Otherwise calls Open-Meteo /v1/forecast once for the
// circuit's lat/lng, requesting hourly weather through race day + 1, and
// extracts the hour buckets bracketing each session's start time.
//
// Output: src/data/weather-next.json (gitignored).
//
// Best-effort: any API failure logs a warning and exits 0 without writing,
// so the build never fails because of weather. On CI the file simply won't
// exist; the island falls through to climate or empty.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SEASON_PATH = join(ROOT, 'src', 'data', 'currentSeason.json');
const LATLNG_PATH = join(__dirname, 'circuit-latlng.json');
const OUT_PATH = join(ROOT, 'src', 'data', 'weather-next.json');

const WINDOW_DAYS = 14;
const SESSION_IDS = ['fp1', 'fp2', 'fp3', 'q', 'sprintQuali', 'sprint', 'race'];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(aIso, bIso) {
  const a = new Date(aIso + 'T00:00:00Z').getTime();
  const b = new Date(bIso + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000);
}

function nextRace(calendar) {
  const t = todayIso();
  return calendar.find(r => r.date && r.date >= t) || null;
}

function sessionMs(session) {
  if (!session || !session.date) return null;
  return new Date(`${session.date}T${session.time || '00:00:00Z'}`).getTime();
}

async function fetchForecast(lat, lng, startDate, endDate) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat);
  url.searchParams.set('longitude', lng);
  url.searchParams.set('start_date', startDate);
  url.searchParams.set('end_date', endDate);
  url.searchParams.set('hourly', 'temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m');
  url.searchParams.set('timezone', 'UTC');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status} ${res.statusText}`);
  return res.json();
}

function hourlyFromJson(json) {
  const h = json.hourly || {};
  const t = h.time || [];
  return t.map((tIso, i) => ({
    tISO: tIso.endsWith('Z') ? tIso : `${tIso}:00Z`,
    tempC: h.temperature_2m?.[i] ?? null,
    precipProbPct: h.precipitation_probability?.[i] ?? null,
    precipMm: h.precipitation?.[i] ?? null,
    wmo: h.weather_code?.[i] ?? null,
    windKph: h.wind_speed_10m?.[i] ?? null,
  }));
}

function pickHours(hourly, startMs) {
  if (!hourly.length) return [];
  let idx = 0, best = Infinity;
  for (let i = 0; i < hourly.length; i++) {
    const d = Math.abs(new Date(hourly[i].tISO).getTime() - startMs);
    if (d < best) { best = d; idx = i; }
  }
  let start = Math.max(0, idx - 3);
  let end = Math.min(hourly.length, start + 7);
  start = Math.max(0, end - 7);
  return hourly.slice(start, end);
}

function buildSessionsBucket(race, hourly) {
  const out = {};
  const src = race.sessions || {};
  for (const id of SESSION_IDS) {
    const ms = sessionMs(src[id]);
    if (ms == null) continue;
    const hours = pickHours(hourly, ms);
    if (!hours.length) continue;
    let at = hours[0];
    let bestDelta = Infinity;
    for (const h of hours) {
      const d = Math.abs(new Date(h.tISO).getTime() - ms);
      if (d < bestDelta) { bestDelta = d; at = h; }
    }
    out[id] = { at, hourly: hours };
  }
  return out;
}

async function main() {
  if (!existsSync(SEASON_PATH)) {
    console.log('[weather] currentSeason.json missing, skipping');
    return;
  }
  const season = JSON.parse(readFileSync(SEASON_PATH, 'utf8'));
  const next = nextRace(season.calendar || []);
  if (!next) {
    console.log('[weather] no upcoming race');
    return;
  }
  const days = daysBetween(todayIso(), next.date);
  const out = { generatedAt: new Date().toISOString(), round: next.round, year: season.seasonYear };

  if (days > WINDOW_DAYS) {
    out.status = 'out-of-window';
    out.circuitRef = next.circuit;
    mkdirSync(dirname(OUT_PATH), { recursive: true });
    writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
    console.log(`[weather] next race in ${days}d, beyond forecast window`);
    return;
  }

  if (!existsSync(LATLNG_PATH)) {
    console.warn('[weather] circuit-latlng.json missing, skipping');
    return;
  }
  const latlng = JSON.parse(readFileSync(LATLNG_PATH, 'utf8'));
  const ll = latlng[next.circuit];
  if (!ll) {
    console.warn(`[weather] no lat/lng for "${next.circuit}", skipping`);
    return;
  }

  try {
    const json = await fetchForecast(ll.lat, ll.lng, todayIso(), next.date);
    const hourly = hourlyFromJson(json);
    out.status = 'ok';
    out.circuitRef = next.circuit;
    out.sessions = buildSessionsBucket(next, hourly);
    mkdirSync(dirname(OUT_PATH), { recursive: true });
    writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
    console.log(`[weather] wrote forecast for round ${next.round} (${next.circuit}), ${Object.keys(out.sessions).length} sessions`);
  } catch (err) {
    console.warn(`[weather] fetch failed: ${err.message}`);
  }
}

main().catch(err => {
  console.warn('[weather] non-fatal:', err.message || err);
  process.exit(0);
});
```

- [ ] **Step 2: Run it once to verify**

Run: `npm run sync:current && node scripts/fetch-weather.mjs`
Expected: either `[weather] wrote forecast for round N (<circuit>), 5 sessions` or `[weather] next race in Nd, beyond forecast window`. No errors thrown.

- [ ] **Step 3: Spot-check the output (if not out-of-window)**

Run: `cat src/data/weather-next.json | head -40`
Expected: JSON with `status`, `round`, `year`, `circuitRef`, and `sessions` containing per-session `at` + 7-entry `hourly` arrays.

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-weather.mjs
git commit -m "feat(weather): add nightly forecast fetch script"
```

---

## Task 6: Wire fetch-weather into prebuild and gitignore generated files

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Update package.json prebuild**

Find this line in `package.json`:

```json
"prebuild": "npm run build:archive && npm run build:og && npm run sync:current",
```

Replace with:

```json
"prebuild": "npm run build:archive && npm run build:og && npm run sync:current && npm run fetch:weather",
"fetch:weather": "node scripts/fetch-weather.mjs",
```

(Add `fetch:weather` as a top-level script entry alongside the others; reference it from `prebuild`.)

- [ ] **Step 2: Update .gitignore**

Open `.gitignore` and add these lines at the bottom (above the trailing blank line):

```
# Generated by scripts/fetch-weather.mjs (nightly via prebuild)
src/data/weather-next.json

# Generated by scripts/build-climate.mjs (npm run build:climate)
src/data/climate/
```

- [ ] **Step 3: Verify the files are now ignored**

Run: `git status --ignored | grep -E "weather-next|climate"` (or PowerShell equivalent).
Expected: both files listed under "Ignored files".

- [ ] **Step 4: Commit**

```bash
git add package.json .gitignore
git commit -m "chore(weather): wire fetch into prebuild, ignore generated data"
```

---

## Task 7: Attach D.weather and D.climate in currentSeason.js

**Files:**
- Modify: `src/data/currentSeason.js`

- [ ] **Step 1: Read the current file**

The current shape:

```js
import json from './currentSeason.json';
import { buildFromYearJson } from './buildFallback.js';
import { circuitProfiles } from './circuitProfiles.js';

const hasBundle = json && json.seasonYear && Array.isArray(json.drivers) && json.drivers.length > 0;
const currentSeason = buildFromYearJson(hasBundle ? json : {}, circuitProfiles);
if (!hasBundle) currentSeason._empty = true;
export default currentSeason;
```

- [ ] **Step 2: Add weather + climate imports via import.meta.glob**

`import.meta.glob` with `eager: true` returns `{}` if no files match, so missing files don't break the build. Replace the contents of `src/data/currentSeason.js` with:

```js
// Single source for the "current / latest season" data object that the
// 5 listing-page islands use as their SSR fallback.
//
// Pipeline:
//   1. Nightly GitHub Action runs scripts/fetch-season.mjs <year> → writes
//      public/data/<year>.json (Jolpica API).
//   2. prebuild runs scripts/sync-current-season.mjs which copies the
//      highest-numbered bundle to ./currentSeason.json.
//   3. prebuild runs scripts/fetch-weather.mjs → ./weather-next.json.
//   4. (manual) scripts/build-climate.mjs writes ./climate/<circuitRef>.json.
//   5. This module imports them all and attaches weather + climate to D.
//
// If no bundle exists (fresh clone, API down, year not yet started), the
// JSON is `{}` and we hand the islands an empty-but-valid shape with
// `_empty: true`. Weather/climate missing → fields just absent.

import json from './currentSeason.json';
import { buildFromYearJson } from './buildFallback.js';
import { circuitProfiles } from './circuitProfiles.js';

// import.meta.glob('./path', { eager: true }) returns {} when nothing matches,
// so a missing weather-next.json or empty climate/ dir doesn't break the build.
const weatherModule = import.meta.glob('./weather-next.json', { eager: true, import: 'default' });
const climateModules = import.meta.glob('./climate/*.json', { eager: true, import: 'default' });

const hasBundle = json && json.seasonYear && Array.isArray(json.drivers) && json.drivers.length > 0;
const currentSeason = buildFromYearJson(hasBundle ? json : {}, circuitProfiles);
if (!hasBundle) currentSeason._empty = true;

const weather = weatherModule['./weather-next.json'] || null;
if (weather) currentSeason.weather = weather;

const climate = {};
for (const path in climateModules) {
  const ref = path.replace('./climate/', '').replace('.json', '');
  climate[ref] = climateModules[path];
}
if (Object.keys(climate).length) currentSeason.climate = climate;

export default currentSeason;
```

- [ ] **Step 3: Verify dev server builds without errors**

Run: `npm run dev` (briefly, in a separate terminal or background).
Expected: server starts, prints "ready" without errors. `Ctrl+C` to stop.

- [ ] **Step 4: Verify D.weather and D.climate are attached**

In a Node REPL or one-shot:
```bash
node -e "
import('./src/data/currentSeason.js').then(m => {
  const d = m.default;
  console.log('weather?', !!d.weather, d.weather && d.weather.status);
  console.log('climate?', !!d.climate, d.climate && Object.keys(d.climate).length, 'entries');
});
"
```
Expected: depending on prebuild state, weather may be null or a forecast/out-of-window object; climate should have entries if `build:climate` was run, else empty.

- [ ] **Step 5: Commit**

```bash
git add src/data/currentSeason.js
git commit -m "feat(weather): attach weather + climate to currentSeason data"
```

---

## Task 8: SessionWeatherCell component

**Files:**
- Create: `src/components/islands/screens/SessionWeatherCell.jsx`

- [ ] **Step 1: Create the component**

This is the per-row right-column cell. It receives a `forecast` object (forecast OR climate-derived OR null), the `useFahrenheit` boolean, and an `onClick` callback to toggle the expand panel. Mobile shows icon only; desktop adds inline temp and precip%.

Create `src/components/islands/screens/SessionWeatherCell.jsx`:

```jsx
import WeatherIcon from './WeatherIcon.jsx';
import { formatTemp, wmoToDescription } from '../../../lib/weather.js';

export default function SessionWeatherCell({ forecast, isClimate, useFahrenheit, expanded, mob, onClick }) {
  if (!forecast) return <span aria-hidden="true" />;
  const { wmo, tempC, precipProbPct } = forecast;
  const title = wmoToDescription(wmo);
  const showPrecip = !isClimate && typeof precipProbPct === 'number' && precipProbPct >= 20;
  return (
    <button
      type="button"
      title={title}
      aria-label={`${title}, ${formatTemp(tempC, useFahrenheit)}${showPrecip ? `, ${precipProbPct}% chance of rain` : ''}. Click for hourly breakdown.`}
      aria-expanded={!!expanded}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        color: expanded ? 'var(--accent)' : 'var(--fg-2)',
        fontFamily: 'var(--f-mono)',
        fontSize: 11,
      }}
    >
      <WeatherIcon wmo={wmo} size={mob ? 18 : 16} />
      {!mob && (
        <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
          <span>{formatTemp(tempC, useFahrenheit)}</span>
          {showPrecip && <span style={{ color: 'var(--fg-3)', fontSize: 10 }}>{precipProbPct}%</span>}
          {isClimate && <span style={{ color: 'var(--fg-4)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase' }}>climate</span>}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/islands/screens/SessionWeatherCell.jsx
git commit -m "feat(weather): add SessionWeatherCell component for row icon"
```

---

## Task 9: SessionWeatherExpand component

**Files:**
- Create: `src/components/islands/screens/SessionWeatherExpand.jsx`

- [ ] **Step 1: Create the component**

Two render branches: forecast (7-cell hourly bar + prose) and climate (single tile + note).

Create `src/components/islands/screens/SessionWeatherExpand.jsx`:

```jsx
import WeatherIcon from './WeatherIcon.jsx';
import { formatTemp, wmoToDescription, summarizeHourly } from '../../../lib/weather.js';

function HourCell({ entry, useFahrenheit }) {
  const t = new Date(entry.tISO);
  const hh = String(t.getUTCHours()).padStart(2, '0');
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      padding: '8px 6px', minWidth: 48, color: 'var(--fg-2)',
    }}>
      <span className="t-mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>{hh}:00</span>
      <WeatherIcon wmo={entry.wmo} size={20} />
      <span className="t-mono" style={{ fontSize: 11, color: 'var(--fg-1)' }}>{formatTemp(entry.tempC, useFahrenheit)}</span>
      {typeof entry.precipProbPct === 'number' && entry.precipProbPct >= 10 && (
        <span className="t-mono" style={{ fontSize: 9, color: 'var(--fg-3)' }}>{entry.precipProbPct}%</span>
      )}
    </div>
  );
}

export default function SessionWeatherExpand({ forecast, isClimate, useFahrenheit }) {
  if (!forecast) return null;
  const stopAll = (e) => e.stopPropagation();
  if (isClimate) {
    return (
      <div onClick={stopAll}
           style={{
             padding: '12px 16px',
             background: 'var(--bg-3)',
             borderBottom: '1px solid var(--line-1)',
             display: 'flex', alignItems: 'center', gap: 16,
           }}>
        <WeatherIcon wmo={forecast.wmo} size={28} />
        <div>
          <div className="t-mono" style={{ fontSize: 12, color: 'var(--fg-1)', marginBottom: 2 }}>
            {wmoToDescription(forecast.wmo)} · {formatTemp(forecast.tempC, useFahrenheit)} · {forecast.precipMm || 0}mm avg precip
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>
            Typical conditions for this race week (10-year average). Live forecast available about 14 days before the race.
          </div>
        </div>
      </div>
    );
  }
  const summary = summarizeHourly(forecast.hourly || []);
  return (
    <div onClick={stopAll}
         style={{
           padding: '10px 14px',
           background: 'var(--bg-3)',
           borderBottom: '1px solid var(--line-1)',
         }}>
      <div style={{ display: 'flex', overflowX: 'auto', gap: 4, marginBottom: 8 }}>
        {(forecast.hourly || []).map((h, i) => (
          <HourCell key={i} entry={h} useFahrenheit={useFahrenheit} />
        ))}
      </div>
      {summary && (
        <div style={{ fontSize: 11, color: 'var(--fg-2)', lineHeight: 1.4 }}>{summary}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/islands/screens/SessionWeatherExpand.jsx
git commit -m "feat(weather): add SessionWeatherExpand panel for hourly/climate detail"
```

---

## Task 10: Wire weather into NextRacePanel

**Files:**
- Modify: `src/components/islands/screens/HomeScreen.jsx`

- [ ] **Step 1: Add imports**

At the top of `src/components/islands/screens/HomeScreen.jsx`, just below the existing imports from `../../../lib/shared.jsx`, add:

```jsx
import { useTempUnit } from '../../../lib/weather.js';
import SessionWeatherCell from './SessionWeatherCell.jsx';
import SessionWeatherExpand from './SessionWeatherExpand.jsx';
```

- [ ] **Step 2: Add a helper for resolving session weather**

Just below the existing `buildSessions` function (around line 98), add a new helper:

```js
function sessionWeather(D, next, sessionId) {
  const w = D.weather;
  if (w && w.status === 'ok' && w.round === next.round && w.year === D.seasonYear && w.sessions && w.sessions[sessionId]) {
    const slot = w.sessions[sessionId];
    return { forecast: { ...slot.at, hourly: slot.hourly }, isClimate: false };
  }
  const climate = D.climate && D.climate[next.circuit];
  if (climate) {
    return { forecast: { wmo: climate.wmo, tempC: climate.tempC, precipMm: climate.precipMm, precipProbPct: climate.precipProbPct }, isClimate: true };
  }
  return { forecast: null, isClimate: false };
}
```

- [ ] **Step 3: Add state and unit-hook usage inside NextRacePanel**

Find `function NextRacePanel({ data, cal, next, mob }) {` and after the `useState`/`useEffect` block for `tzMode` (around line 178), add:

```jsx
  const [expandedSessionId, setExpandedSessionId] = useState(null);
  const unit = useTempUnit();
  const useF = unit === 'F';
  const toggleExpand = (id) => setExpandedSessionId(curr => curr === id ? null : id);
```

- [ ] **Step 4: Update the session row layout**

Find the session rows block (around line 263), which currently looks like:

```jsx
<div style={{ border: '1px solid var(--line-1)' }}>
  {sessions.map((s, i) => (
    <div key={s.id} style={{
      display: 'grid', gridTemplateColumns: '50px 1fr auto auto',
      gap: 12, padding: '10px 14px', alignItems: 'center',
      borderBottom: i < sessions.length - 1 ? '1px solid var(--line-1)' : '0',
      background: nextSession && s.id === nextSession.id ? 'rgba(232,0,45,0.04)' : 'transparent',
    }}>
      <span className="t-mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{String(i + 1).padStart(2, '0')}</span>
      <span style={{ fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{s.name}</span>
      <span className="t-mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{s.day}</span>
      <span className="t-mono" style={{ fontSize: 12, color: 'var(--fg-1)' }}>{s.time}</span>
    </div>
  ))}
</div>
```

Replace it with:

```jsx
<div style={{ border: '1px solid var(--line-1)' }} className="next-race-sessions">
  {sessions.map((s, i) => {
    const { forecast, isClimate } = sessionWeather(D, next, s.id);
    const isExpanded = expandedSessionId === s.id;
    return (
      <div key={s.id}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: mob ? '40px 1fr auto auto 28px' : '50px 1fr auto auto 56px',
          gap: mob ? 8 : 12, padding: '10px 14px', alignItems: 'center',
          borderBottom: (isExpanded || i < sessions.length - 1) ? '1px solid var(--line-1)' : '0',
          background: nextSession && s.id === nextSession.id ? 'rgba(232,0,45,0.04)' : 'transparent',
        }}>
          <span className="t-mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{String(i + 1).padStart(2, '0')}</span>
          <span style={{ fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{s.name}</span>
          <span className="t-mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{s.day}</span>
          <span className="t-mono" style={{ fontSize: 12, color: 'var(--fg-1)' }}>{s.time}</span>
          <SessionWeatherCell
            forecast={forecast}
            isClimate={isClimate}
            useFahrenheit={useF}
            expanded={isExpanded}
            mob={mob}
            onClick={() => toggleExpand(s.id)}
          />
        </div>
        {isExpanded && forecast && (
          <SessionWeatherExpand forecast={forecast} isClimate={isClimate} useFahrenheit={useF} />
        )}
      </div>
    );
  })}
</div>
```

- [ ] **Step 5: Run the dev server and check the homepage**

Run: `npm run dev`
Open: http://localhost:4321/ (or whichever port the user has configured for this worktree - ask the user)
Expected behaviour:
- Each session row shows a weather icon on the right edge.
- If a forecast is available, the icon has a temperature (and a precip % when ≥20%) next to it on desktop.
- If only climate is available, a "climate" caption appears under the temperature on desktop.
- Clicking the weather icon expands a panel under that row with either the 7-hour bar (forecast) or a single climate tile.
- Clicking the icon a second time closes the panel.
- Clicking the icon does NOT navigate to the race page; clicking elsewhere on the row still does.
- Only one session row can be expanded at a time.

If any of these fail, stop and diagnose before committing.

- [ ] **Step 6: Commit**

```bash
git add src/components/islands/screens/HomeScreen.jsx
git commit -m "feat(weather): show per-session weather in next-race hero"
```

---

## Task 11: Mobile column-width refinement in site.css

**Files:**
- Modify: `public/css/site.css`

The inline grid already responds to `mob`, but a CSS rule guarantees the small column on screens that don't have JS running yet (SSR HTML).

- [ ] **Step 1: Locate the existing 720px media query and add a rule**

Open `public/css/site.css` and locate the existing `@media (max-width: 720px)` block (search for `720px`). Add this rule inside that block:

```css
.next-race-sessions > div > div[style*='grid-template-columns'] {
  /* The inline style above already collapses to the mobile grid via the `mob` flag,
     but for SSR HTML (when JS hasn't run yet on a narrow viewport) the desktop
     5-column grid is too wide. This forces the rightmost column to a thin icon. */
  grid-template-columns: 40px 1fr auto auto 28px !important;
  gap: 8px !important;
}
```

- [ ] **Step 2: Verify in the dev server with a narrow viewport**

In the dev server (still running from Task 10 step 5), use preview tools or browser devtools to simulate 375px viewport width.
Expected: weather column collapses to icon-only; rows don't horizontally overflow.

- [ ] **Step 3: Commit**

```bash
git add public/css/site.css
git commit -m "fix(weather): SSR-safe narrow grid for session weather column"
```

---

## Task 12: Capture lat/lng in fetch-season.mjs for new venues

**Files:**
- Modify: `scripts/fetch-season.mjs`

This change ensures that when Jolpica adds a new circuit not in `data/history/circuits.csv`, we can copy its coordinates into `scripts/circuit-latlng.json` without a manual lookup.

- [ ] **Step 1: Add lat/lng to the circuit shape**

Open `scripts/fetch-season.mjs` and locate `buildCircuitsFromSchedule` (around line 108). It currently produces objects without lat/lng:

```js
out[key] = {
  name: r.Circuit.circuitName || r.Circuit.circuitId,
  city: loc.locality || '-', country: loc.country || '-',
  firstYear: 0, races: 0, length: 0, laps: 0, corners: 0,
  longestStraight: 0, drsZones: 0, type: '-', tyreDeg: '-',
  overtaking: '-', weather: '-',
  lapRecord: { driver: '-', time: '-', year: 0 }, blurb: '',
};
```

Update it to capture coordinates from `r.Circuit.Location.lat` and `r.Circuit.Location.long` (note: Jolpica uses `long`, not `lng`):

```js
out[key] = {
  name: r.Circuit.circuitName || r.Circuit.circuitId,
  city: loc.locality || '-', country: loc.country || '-',
  lat: parseFloat(loc.lat) || null,
  lng: parseFloat(loc.long) || null,
  firstYear: 0, races: 0, length: 0, laps: 0, corners: 0,
  longestStraight: 0, drsZones: 0, type: '-', tyreDeg: '-',
  overtaking: '-', weather: '-',
  lapRecord: { driver: '-', time: '-', year: 0 }, blurb: '',
};
```

- [ ] **Step 2: Run fetch-season for current year and verify**

Run: `npm run fetch:current` (which runs `node scripts/fetch-season.mjs $(date +%Y)`).

Then inspect:

```bash
node -e "
const d = require('./public/data/2026.json');
const k = Object.keys(d.circuitsFromAPI)[0];
console.log(k, d.circuitsFromAPI[k]);
"
```

Expected: the printed object now includes `lat` and `lng` numeric values.

- [ ] **Step 3: Commit**

```bash
git add scripts/fetch-season.mjs
git commit -m "chore(weather): capture circuit lat/lng from Jolpica for new venues"
```

---

## Task 13: End-to-end manual verification

**Files:** none modified.

- [ ] **Step 1: Run the full prebuild**

Run: `npm run prebuild`
Expected: completes without errors; either writes a forecast or logs `beyond forecast window`.

- [ ] **Step 2: Run the Astro build**

Run: `npm run build`
Expected: build succeeds, ~2,310 HTMLs emitted as usual, no new warnings.

- [ ] **Step 3: Preview the built site**

Run: `npm run preview` (background) and open the homepage.
Expected: NextRacePanel shows the weather column. Reload the page; if `weather-next.json` is present and `status: ok`, icons should have temperatures from real forecast data.

- [ ] **Step 4: Locale swap check**

In the browser devtools, set the language to `en-US` (some browsers require restart; alternatively run with `navigator.language` overridden via console). Reload.
Expected: temperatures render in °F.

- [ ] **Step 5: Light / dark mode check**

Toggle the theme via the existing site control.
Expected: weather icons remain readable in both modes (they use `currentColor` and inherit `--fg-2`).

- [ ] **Step 6: Climate fallback check**

If the current next-race is within 14 days, force the fallback path temporarily:
- Edit `src/data/weather-next.json` and change `"status": "ok"` to `"status": "out-of-window"`, then reload the preview.
Expected: rows show the "climate" caption under the icon, expand shows the climate tile with the "Typical conditions ..." copy.
- Revert the file change.

- [ ] **Step 7: Mobile responsiveness**

Resize the browser to 375px width or use the responsive devtools view.
Expected: session rows show icon-only; tapping the icon opens the expand panel; row text doesn't overflow.

- [ ] **Step 8: Final test run**

Run: `npm test`
Expected: all tests pass, including the weather suite from Task 1.

- [ ] **Step 9: No commit needed - this task is verification only**

If anything in this task fails, return to the relevant earlier task to fix.

---

## Self-review checklist

Before handing off to execution, the writer (or executor's first action) should sanity-check:

- [ ] Every spec requirement (icon + temp + precip, click-to-expand modal, climate fallback, locale-driven units, build-time fetch) is implemented somewhere in tasks 1-12.
- [ ] No "TODO" / "TBD" / "handle errors appropriately" placeholders in any step.
- [ ] Function names referenced across tasks (`wmoToGlyph`, `formatTemp`, `pickSessionHours`, `summarizeHourly`, `useTempUnit`, `sessionWeather`) match between definition and usage.
- [ ] All file paths are absolute project-relative paths the executor can copy directly.
- [ ] Commit boundaries are sensible - each commit leaves the repo in a working state (the WeatherIcon + Cell + Expand sequence in tasks 2/8/9 are unused until task 10 wires them, but they don't break anything).
