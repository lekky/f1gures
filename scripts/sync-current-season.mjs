// Pick the highest-numbered public/data/<year>.json bundle and copy it to
// src/data/currentSeason.json so the listing-page islands can import it
// at build time and prerender real data into HTML (instead of the
// speculative grid in buildFallback.js).
//
// Writes an empty object if no bundle exists, so the import never fails on
// fresh clones / first-ever build.

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC  = join(ROOT, 'public', 'data');
const DEST = join(ROOT, 'src', 'data', 'currentSeason.json');

mkdirSync(dirname(DEST), { recursive: true });

let payload = {};
let pickedYear = null;

if (existsSync(SRC)) {
  const years = readdirSync(SRC)
    .map(f => f.match(/^(\d{4})\.json$/))
    .filter(Boolean)
    .map(m => parseInt(m[1], 10))
    .sort((a, b) => b - a);

  if (years.length) {
    pickedYear = years[0];
    payload = JSON.parse(readFileSync(join(SRC, `${pickedYear}.json`), 'utf8'));
  }
}

writeFileSync(DEST, JSON.stringify(payload));

if (pickedYear) {
  const rounds = payload.results ? Object.keys(payload.results).length : 0;
  console.log(`✓  src/data/currentSeason.json  ← public/data/${pickedYear}.json  (${rounds} rounds)`);
} else {
  console.log(`ℹ  src/data/currentSeason.json  ← {} (no public/data/<year>.json found, falling back to speculative grid)`);
}
