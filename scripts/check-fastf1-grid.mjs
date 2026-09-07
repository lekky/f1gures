#!/usr/bin/env node
// Watchdog for FastF1 race sessions written before the grid was published.
//
// FastF1 serves timing within minutes of the flag but leaves GridPosition
// empty until the official results are up, which can be hours later. A race
// session fetched in that window produces a file that looks complete - laps,
// positions, stints, pit stops - with no grid slot for any driver. Charts that
// key off the grid then have nothing real to say (see docs/fastf1-pipeline.md).
//
// `fetch-fastf1.py --auto` now re-fetches such a file for a week, which fixes
// it whenever the local bot runs. This exists because that bot is a scheduled
// task on one Windows machine and does not always run: 2026 R12 was fetched
// six days late, and 2026 R11 sat with 22 null grids from 26 July to
// 7 September because nothing ever looked.
//
// Flag-only, like check-principals.mjs. Node built-ins only, so CI needs no
// npm install. Exits 1 when something needs a human (and a re-fetch on a
// residential IP - F1's API refuses datacenter ones).

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FASTF1 = join(ROOT, 'public', 'data', 'fastf1');

// Sessions that start from a grid. Quali and practice have no grid slots, so
// a null there means nothing.
export const GRIDDED = ['race', 'sprint'];

/**
 * Pure core: given session entries, return the ones with no grid at all.
 * @param {Array<{year:number, round:number, session:string, drivers:Array<{grid:?number}>}>} entries
 */
export function findGridGaps(entries) {
  const out = [];
  for (const e of entries || []) {
    if (!GRIDDED.includes(e.session)) continue;
    const drivers = e.drivers || [];
    if (drivers.length === 0) continue;
    if (drivers.some((d) => d && d.grid != null)) continue;
    out.push({ year: e.year, round: e.round, session: e.session, drivers: drivers.length });
  }
  return out.sort((a, b) => a.year - b.year || a.round - b.round || a.session.localeCompare(b.session));
}

export function readSessions(rootDir = FASTF1) {
  const entries = [];
  if (!existsSync(rootDir)) return entries;
  for (const year of readdirSync(rootDir).filter((d) => /^\d{4}$/.test(d)).sort()) {
    const yearDir = join(rootDir, year);
    for (const round of readdirSync(yearDir).filter((d) => /^\d+$/.test(d)).sort((a, b) => a - b)) {
      for (const session of GRIDDED) {
        const p = join(yearDir, round, `${session}.json`);
        if (!existsSync(p)) continue;
        try {
          const data = JSON.parse(readFileSync(p, 'utf8'));
          entries.push({ year: +year, round: +round, session, drivers: data.drivers || [] });
        } catch {
          // A corrupt file is a different failure; the fetch script owns it.
        }
      }
    }
  }
  return entries;
}

function main() {
  const entries = readSessions();
  const gaps = findGridGaps(entries);
  if (gaps.length === 0) {
    console.log(`FastF1 grid check: ${entries.length} race/sprint session(s), all carry grid positions.`);
    return 0;
  }
  console.log('## FastF1 sessions with no grid positions\n');
  console.log('These were fetched before the official results were published, so every');
  console.log('driver has a null grid slot. Charts keyed off the grid are hidden until');
  console.log('this is repaired.\n');
  for (const g of gaps) {
    console.log(`- **${g.year} R${g.round} ${g.session}** — ${g.drivers} drivers, 0 with a grid slot`);
  }
  console.log('\n### Fix\n');
  console.log('Re-fetch on a **residential IP** (F1 refuses datacenter ones, so not from CI):\n');
  console.log('```');
  for (const g of gaps) console.log(`python scripts/fetch-fastf1.py ${g.year} ${g.round} --session ${g.session} --force`);
  console.log('```\n');
  console.log('Then commit the changed `race.json`/`sprint.json`. See docs/fastf1-pipeline.md.');
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
