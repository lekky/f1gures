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
