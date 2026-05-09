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
// JSON is `{}` and we hand the islands an empty-but-valid shape with
// `_empty: true` so screens can render placeholders. We deliberately do
// NOT fall back to buildFallback's speculative driver grid — that data
// drifts from reality and confuses visitors.

import json from './currentSeason.json';
import { buildFromYearJson } from './buildFallback.js';
import { circuitProfiles } from './circuitProfiles.js';

const hasBundle = json && json.seasonYear && Array.isArray(json.drivers) && json.drivers.length > 0;

const currentSeason = buildFromYearJson(hasBundle ? json : {}, circuitProfiles);
if (!hasBundle) currentSeason._empty = true;

export default currentSeason;
