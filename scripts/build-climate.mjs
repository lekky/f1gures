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
