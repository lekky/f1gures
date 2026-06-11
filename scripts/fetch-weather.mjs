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
import { pickSessionHours } from '../src/lib/weather.js';

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

function buildSessionsBucket(race, hourly) {
  const out = {};
  const src = race.sessions || {};
  for (const id of SESSION_IDS) {
    const ms = sessionMs(src[id]);
    if (ms == null) continue;
    const hours = pickSessionHours(hourly, ms);
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
    // End the range one day after the race so late-UTC session windows
    // (Vegas ~04:00-06:00Z next day, Abu Dhabi evening +7h spans) aren't
    // truncated at midnight on race day.
    const endDate = new Date(new Date(next.date + 'T00:00:00Z').getTime() + 86400000)
      .toISOString().slice(0, 10);
    const json = await fetchForecast(ll.lat, ll.lng, todayIso(), endDate);
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
