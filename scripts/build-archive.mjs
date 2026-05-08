#!/usr/bin/env node
// Builds per-entity JSON files from the Ergast CSV dump in data/history/
// for use by Astro getStaticPaths at build time. Run as `npm run prebuild`.
//
// Output:
//   data/archive/_drivers-index.json    [{ driverRef, code, forename, surname, ... }]
//   data/archive/_driver-codes.json     { CODE: driverRef } for legacy URL redirects
//   data/archive/drivers/<driverRef>.json
//
// PR 2a (this script): drivers only. Subsequent PRs will add races/circuits/teams.

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = join(ROOT, 'data', 'history');
// Output into public/ so the legacy redirect (public/driver.html) can fetch
// _driver-codes.json at runtime, AND so Astro getStaticPaths can read the
// per-driver JSONs at build time. Gitignored.
const OUT = join(ROOT, 'public', 'data', 'archive');

function readCsv(name) {
  const text = readFileSync(join(SRC, `${name}.csv`), 'utf8');
  // Ergast uses \N for NULL — convert to empty so csv-parse treats consistently.
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    cast: (value) => (value === '\\N' ? null : value),
  });
}

function toInt(v) {
  if (v == null || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}
function toFloat(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

console.log('[archive] reading CSVs…');
const drivers = readCsv('drivers');
const races = readCsv('races');
const results = readCsv('results');
const constructors = readCsv('constructors');
const driverStandings = readCsv('driver_standings');
const status = readCsv('status');

const racesById = new Map(races.map(r => [r.raceId, r]));
const constructorsById = new Map(constructors.map(c => [c.constructorId, c]));
const statusById = new Map(status.map(s => [s.statusId, s.status]));

console.log(`[archive] ${drivers.length} drivers, ${races.length} races, ${results.length} results, ${constructors.length} constructors`);

// Group results by driverId once — O(N) instead of O(D*R)
const resultsByDriver = new Map();
for (const r of results) {
  if (!resultsByDriver.has(r.driverId)) resultsByDriver.set(r.driverId, []);
  resultsByDriver.get(r.driverId).push(r);
}

// Group driver-standings rows by driverId. We use the LAST race of each year
// to determine that year's championship position (final standing).
const standingsByDriver = new Map();
for (const s of driverStandings) {
  if (!standingsByDriver.has(s.driverId)) standingsByDriver.set(s.driverId, []);
  standingsByDriver.get(s.driverId).push(s);
}

// For each year, the raceId of its final round (highest round). Used to pick
// the "final" driver_standings row for that year per driver.
const finalRaceIdByYear = new Map();
for (const r of races) {
  const year = toInt(r.year);
  const round = toInt(r.round);
  const cur = finalRaceIdByYear.get(year);
  if (!cur || cur.round < round) finalRaceIdByYear.set(year, { raceId: r.raceId, round });
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'drivers'), { recursive: true });

const index = [];
const codeToRef = {};

for (const d of drivers) {
  const driverResults = (resultsByDriver.get(d.driverId) || [])
    .map(r => {
      const race = racesById.get(r.raceId);
      const year = race ? toInt(race.year) : null;
      const constructor = constructorsById.get(r.constructorId);
      return {
        raceId: r.raceId,
        year,
        round: race ? toInt(race.round) : null,
        raceName: race ? race.name : null,
        date: race ? race.date : null,
        circuitId: race ? race.circuitId : null,
        constructorId: r.constructorId,
        constructorRef: constructor ? constructor.constructorRef : null,
        constructorName: constructor ? constructor.name : null,
        grid: toInt(r.grid),
        position: toInt(r.position),                      // null = DNF/DNS/etc
        positionText: r.positionText,                     // "1", "R", "DSQ", "W", etc
        positionOrder: toInt(r.positionOrder),
        points: toFloat(r.points) || 0,
        laps: toInt(r.laps),
        fastestLapRank: toInt(r.rank),                    // 1 = fastest of race
        fastestLapTime: r.fastestLapTime || null,
        statusId: r.statusId,
        status: statusById.get(r.statusId) || null,
      };
    })
    .filter(r => r.year != null)
    .sort((a, b) => (a.year - b.year) || (a.round - b.round));

  // Career totals
  const wins = driverResults.filter(r => r.position === 1).length;
  const podiums = driverResults.filter(r => r.position != null && r.position <= 3).length;
  const poles = driverResults.filter(r => r.grid === 1).length;
  const fastestLaps = driverResults.filter(r => r.fastestLapRank === 1).length;
  const seasonsSet = new Set(driverResults.map(r => r.year));
  const seasons = seasonsSet.size;
  const racesEntered = driverResults.length;

  // Championships (WDC titles) — find years where this driver finished P1
  // in the final-round driver_standings.
  const driverStandingsRows = standingsByDriver.get(d.driverId) || [];
  let championships = 0;
  const finalStandingByYear = new Map(); // year -> { position, points, wins }
  for (const s of driverStandingsRows) {
    const race = racesById.get(s.raceId);
    if (!race) continue;
    const year = toInt(race.year);
    const final = finalRaceIdByYear.get(year);
    if (!final || final.raceId !== s.raceId) continue;
    const pos = toInt(s.position);
    finalStandingByYear.set(year, {
      position: pos,
      points: toFloat(s.points) || 0,
      wins: toInt(s.wins) || 0,
    });
    if (pos === 1) championships += 1;
  }

  // Per-season summary
  const byYear = new Map();
  for (const r of driverResults) {
    if (!byYear.has(r.year)) byYear.set(r.year, []);
    byYear.get(r.year).push(r);
  }
  const perSeason = [...byYear.entries()]
    .map(([year, rows]) => {
      // Pick the constructor the driver raced for most that year
      const teamCounts = new Map();
      for (const r of rows) if (r.constructorRef) teamCounts.set(r.constructorRef, (teamCounts.get(r.constructorRef) || 0) + 1);
      let primaryRef = null, primaryName = null, top = 0;
      for (const r of rows) {
        const c = teamCounts.get(r.constructorRef) || 0;
        if (c > top) { top = c; primaryRef = r.constructorRef; primaryName = r.constructorName; }
      }
      const final = finalStandingByYear.get(year) || { position: null, points: null, wins: 0 };
      return {
        year,
        constructorRef: primaryRef,
        constructorName: primaryName,
        position: final.position,
        points: final.points,
        wins: final.wins,
        races: rows.length,
        bestFinish: rows.reduce((best, r) => (r.position != null && (best == null || r.position < best)) ? r.position : best, null),
      };
    })
    .sort((a, b) => b.year - a.year);

  const firstYear = seasonsSet.size ? Math.min(...seasonsSet) : null;
  const lastYear = seasonsSet.size ? Math.max(...seasonsSet) : null;

  const driverDoc = {
    driverRef: d.driverRef,
    driverId: d.driverId,
    code: d.code,
    number: d.number,
    forename: d.forename,
    surname: d.surname,
    dob: d.dob,
    nationality: d.nationality && d.nationality.trim(),
    url: d.url,
    career: {
      seasons,
      firstYear,
      lastYear,
      races: racesEntered,
      wins,
      podiums,
      poles,
      fastestLaps,
      championships,
    },
    perSeason,
    perRace: driverResults,
  };

  writeFileSync(join(OUT, 'drivers', `${d.driverRef}.json`), JSON.stringify(driverDoc));

  index.push({
    driverRef: d.driverRef,
    code: d.code,
    forename: d.forename,
    surname: d.surname,
    nationality: d.nationality && d.nationality.trim(),
    firstYear,
    lastYear,
    races: racesEntered,
    wins,
    championships,
  });

  if (d.code && d.code !== '\\N') {
    // A code might have been reused by multiple drivers historically (rare).
    // Keep the most recent driver — they're most likely the one bookmarks
    // refer to. driverId is monotonically increasing (newer = higher).
    const existingRef = codeToRef[d.code];
    if (!existingRef) {
      codeToRef[d.code] = d.driverRef;
    } else {
      const existing = drivers.find(x => x.driverRef === existingRef);
      if (existing && toInt(existing.driverId) < toInt(d.driverId)) {
        codeToRef[d.code] = d.driverRef;
      }
    }
  }
}

// Sort index alphabetically by surname for deterministic output
index.sort((a, b) => (a.surname || '').localeCompare(b.surname || '') || (a.forename || '').localeCompare(b.forename || ''));

writeFileSync(join(OUT, '_drivers-index.json'), JSON.stringify(index));
writeFileSync(join(OUT, '_driver-codes.json'), JSON.stringify(codeToRef));

console.log(`[archive] wrote ${index.length} drivers + index + code-map → ${OUT}`);
