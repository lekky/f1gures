// Single source for the "current / latest season" data object that the
// 5 listing-page islands use as their SSR fallback.
//
// Pipeline:
//   1. Nightly GitHub Action runs scripts/fetch-season.mjs <year> → writes
//      public/data/<year>.json (Jolpica API).
//   2. prebuild runs scripts/sync-current-season.mjs which copies the
//      highest-numbered bundle to ./currentSeason.json.
//   3. This module imports that JSON and reshapes it via buildFromYearJson
//      so the prerendered HTML reflects real, current standings.
//
// If no bundle exists (fresh clone, API down, year not yet started), the
// JSON is `{}` and we fall back to the speculative grid in buildFallback().

import json from './currentSeason.json';
import { buildFallback, buildFromYearJson } from './buildFallback.js';

const fallback = buildFallback();

const hasBundle = json && json.seasonYear && Array.isArray(json.drivers) && json.drivers.length > 0;

const currentSeason = hasBundle
  ? buildFromYearJson(json, fallback.circuits)
  : fallback;

export default currentSeason;
