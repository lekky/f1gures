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

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { computeStandings as computeBundleSeasonStandings, sprintPointsMap } from '../src/lib/seasonStats.mjs';
import { NATIONALITY, natInfo } from '../src/lib/nationality.js';

// ─── Static lookups ───────────────────────────────────────────────────
// Hand-curated mappings that the Ergast CSVs don't carry - keep small.

// Nationality → flag map + natInfo() live in src/lib/nationality.js (imported
// above) so the race pages can reuse the same demonym lookup.

// Constructor → team color (hex). Active modern teams use their canonical
// livery; historic teams default to grey. Display only - doesn't block render.
const TEAM_COLORS = {
  alpine: '#0093CC', aston_martin: '#229971', ferrari: '#E80020',
  haas: '#B6BABD', mclaren: '#FF8000', mercedes: '#27F4D2',
  rb: '#6692FF', red_bull: '#3671C6', sauber: '#52E252', williams: '#64C4FF',
  alphatauri: '#2B4562', alfa: '#900000', renault: '#FFF500',
  toro_rosso: '#0000FF', force_india: '#FF80C7', racing_point: '#F596C8',
  toyota: '#FF0000', bmw_sauber: '#5C7BB0', honda: '#CCCCCC', super_aguri: '#990000',
  brawn: '#80FF80', lotus: '#FFB800', lotus_f1: '#FFB800',
  caterham: '#005030', marussia: '#6E0000', virgin: '#CD2D3D', hrt: '#3A1B1B',
  manor: '#FF6699', minardi: '#191970', jaguar: '#0F4D2A', jordan: '#FFCC00',
  midland: '#C8102E', spyker: '#FF6600', prost: '#0033A0',
  arrows: '#F58025', stewart: '#FFFFFF', tyrrell: '#0033A0', ligier: '#0055A4',
  benetton: '#1F8FFF', brabham: '#7FB069', cooper: '#3CB371', lotus_racing: '#FFB800',
  brm: '#013220', ensign: '#0072CE', ats: '#A7A7A7', shadow: '#000000',
  surtees: '#C1272D', march: '#FFD700', wolf: '#000000', hesketh: '#FF0080',
  fittipaldi: '#F5C518', osella: '#000000',
};
function teamColor(constructorRef) {
  return (constructorRef && TEAM_COLORS[constructorRef]) || '#888888';
}

// 3-letter driver code: prefer the CSV's `code` field; otherwise derive from
// surname (first 3 letters uppercased) so screens that expect a non-empty
// code still render. Older drivers (~1950s-2000s) often have no code.
function deriveCode(driver) {
  if (driver.code && driver.code !== '\\N' && driver.code.trim()) return driver.code.trim();
  const surname = (driver.surname || driver.driverRef || '').replace(/[^A-Za-z]/g, '');
  return surname.slice(0, 3).toUpperCase() || (driver.driverRef || '???').slice(0, 3).toUpperCase();
}

// Country (name) → { code (ISO), flag }. Used to render circuit-country
// flags on the calendar/circuits pages. CSV's `circuits.country` uses
// country names (Italy, USA, …) not adjectives, so we can't reuse the
// nationality map directly.
const COUNTRY = {
  'Argentina': { code: 'AR', flag: '🇦🇷' },
  'Australia': { code: 'AU', flag: '🇦🇺' },
  'Austria': { code: 'AT', flag: '🇦🇹' },
  'Azerbaijan': { code: 'AZ', flag: '🇦🇿' },
  'Bahrain': { code: 'BH', flag: '🇧🇭' },
  'Belgium': { code: 'BE', flag: '🇧🇪' },
  'Brazil': { code: 'BR', flag: '🇧🇷' },
  'Canada': { code: 'CA', flag: '🇨🇦' },
  'China': { code: 'CN', flag: '🇨🇳' },
  'France': { code: 'FR', flag: '🇫🇷' },
  'Germany': { code: 'DE', flag: '🇩🇪' },
  'Hungary': { code: 'HU', flag: '🇭🇺' },
  'India': { code: 'IN', flag: '🇮🇳' },
  'Italy': { code: 'IT', flag: '🇮🇹' },
  'Japan': { code: 'JP', flag: '🇯🇵' },
  'Korea': { code: 'KR', flag: '🇰🇷' },
  'Malaysia': { code: 'MY', flag: '🇲🇾' },
  'Mexico': { code: 'MX', flag: '🇲🇽' },
  'Monaco': { code: 'MC', flag: '🇲🇨' },
  'Morocco': { code: 'MA', flag: '🇲🇦' },
  'Netherlands': { code: 'NL', flag: '🇳🇱' },
  'Portugal': { code: 'PT', flag: '🇵🇹' },
  'Qatar': { code: 'QA', flag: '🇶🇦' },
  'Russia': { code: 'RU', flag: '🇷🇺' },
  'Saudi Arabia': { code: 'SA', flag: '🇸🇦' },
  'Singapore': { code: 'SG', flag: '🇸🇬' },
  'South Africa': { code: 'ZA', flag: '🇿🇦' },
  'South Korea': { code: 'KR', flag: '🇰🇷' },
  'Spain': { code: 'ES', flag: '🇪🇸' },
  'Sweden': { code: 'SE', flag: '🇸🇪' },
  'Switzerland': { code: 'CH', flag: '🇨🇭' },
  'Turkey': { code: 'TR', flag: '🇹🇷' },
  'UAE': { code: 'AE', flag: '🇦🇪' },
  'UK': { code: 'GB', flag: '🇬🇧' },
  'United Kingdom': { code: 'GB', flag: '🇬🇧' },
  'USA': { code: 'US', flag: '🇺🇸' },
  'United States': { code: 'US', flag: '🇺🇸' },
  'Vietnam': { code: 'VN', flag: '🇻🇳' },
};
function countryInfo(name) {
  if (!name) return { code: '', flag: '🏳' };
  return COUNTRY[name.trim()] || { code: '', flag: '🏳' };
}

// Constructor short code (3-letter). CSV doesn't have one, so derive from
// constructorRef.
function constructorShort(constructorRef, name) {
  const SHORT = {
    alpine: 'ALP', aston_martin: 'AST', ferrari: 'FER', haas: 'HAA',
    mclaren: 'MCL', mercedes: 'MER', rb: 'RBL', red_bull: 'RBR',
    sauber: 'SAU', williams: 'WIL', alphatauri: 'AT', alfa: 'ALF',
    renault: 'REN', toro_rosso: 'TR', force_india: 'FI', racing_point: 'RP',
  };
  if (SHORT[constructorRef]) return SHORT[constructorRef];
  const src = (name || constructorRef || '').replace(/[^A-Za-z]/g, '');
  return src.slice(0, 3).toUpperCase();
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = join(ROOT, 'data', 'history');
// Output into public/ so the legacy redirect (public/driver.html) can fetch
// _driver-codes.json at runtime, AND so Astro getStaticPaths can read the
// per-driver JSONs at build time. Gitignored.
const OUT = join(ROOT, 'public', 'data', 'archive');

function readCsv(name) {
  const text = readFileSync(join(SRC, `${name}.csv`), 'utf8');
  // Ergast uses \N for NULL - convert to empty so csv-parse treats consistently.
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
const constructorStandings = readCsv('constructor_standings');
const status = readCsv('status');
const circuits = readCsv('circuits');

const circuitsById = new Map(circuits.map(c => [c.circuitId, c]));
const racesById = new Map(races.map(r => [r.raceId, r]));
const constructorsById = new Map(constructors.map(c => [c.constructorId, c]));
const statusById = new Map(status.map(s => [s.statusId, s.status]));

console.log(`[archive] ${drivers.length} drivers, ${races.length} races, ${results.length} results, ${constructors.length} constructors`);

// Group results by driverId once - O(N) instead of O(D*R)
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

// A driver's final championship standing position for a given (Ergast) year -
// used to annotate each driver in the team perSeason driver lists.
function driverFinalPosForYear(driverId, year) {
  const final = finalRaceIdByYear.get(year);
  if (!final) return null;
  for (const s of (standingsByDriver.get(driverId) || [])) {
    if (s.raceId === final.raceId) return toInt(s.position);
  }
  return null;
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
      const circuit = race ? circuitsById.get(race.circuitId) : null;
      const cInfo = circuit ? countryInfo(circuit.country) : null;
      return {
        raceId: r.raceId,
        year,
        round: race ? toInt(race.round) : null,
        raceName: race ? race.name : null,
        date: race ? race.date : null,
        circuitId: race ? race.circuitId : null,
        country: cInfo && cInfo.code ? cInfo.code : null,
        flag: cInfo && cInfo.flag && cInfo.flag !== '🏳' ? cInfo.flag : null,
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

  // Championships (WDC titles) - find years where this driver finished P1
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
    // Keep the most recent driver - they're most likely the one bookmarks
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

// ─── Per-year season bundles ─────────────────────────────────────────────
// Generate /public/data/<year>.json for years that don't already have a
// hand-curated bundle (2020–2025 are kept untouched; they have richer
// session schedules + circuit metadata than the CSVs carry). Listing-page
// islands fetch /data/<year>.json on year-picker click; without these
// generated bundles, anything pre-2020 silently falls back to the 2026
// fallback, which makes the year picker mostly cosmetic for old seasons.

const SEASONS_OUT = join(ROOT, 'public', 'data');
const driversById = new Map(drivers.map(d => [d.driverId, d]));

// Group races by year for fast iteration
const racesByYear = new Map();
for (const r of races) {
  const year = toInt(r.year);
  if (!racesByYear.has(year)) racesByYear.set(year, []);
  racesByYear.get(year).push(r);
}

// Group results by raceId for per-round assembly
const resultsByRace = new Map();
for (const r of results) {
  if (!resultsByRace.has(r.raceId)) resultsByRace.set(r.raceId, []);
  resultsByRace.get(r.raceId).push(r);
}

// Group championship-snapshot rows by raceId. Ergast/FIA's
// driver_standings + constructor_standings tables store the post-drop
// championship totals (with era-specific "best N results" rules already
// applied) snapshotted after every race. Summing per-race points from
// results.csv overcounts for drop-rule seasons (1950-1990); reading
// these snapshots gives exact FIA totals.
const driverStandingsByRace = new Map();
for (const s of driverStandings) {
  if (!driverStandingsByRace.has(s.raceId)) driverStandingsByRace.set(s.raceId, []);
  driverStandingsByRace.get(s.raceId).push(s);
}
const constructorStandingsByRace = new Map();
for (const s of constructorStandings) {
  if (!constructorStandingsByRace.has(s.raceId)) constructorStandingsByRace.set(s.raceId, []);
  constructorStandingsByRace.get(s.raceId).push(s);
}

const allYears = [...racesByYear.keys()].sort((a, b) => a - b);
let seasonsWritten = 0, seasonsSkipped = 0;

for (const year of allYears) {
  const outPath = join(SEASONS_OUT, `${year}.json`);
  if (existsSync(outPath)) { seasonsSkipped++; continue; }

  const yearRaces = racesByYear.get(year).slice().sort((a, b) => toInt(a.round) - toInt(b.round));

  // Drivers who raced this year - derived from results, not from the global
  // drivers table (which would also include drivers who never raced this year)
  const yearDriverIds = new Set();
  const yearConstructorIds = new Set();
  for (const race of yearRaces) {
    for (const res of (resultsByRace.get(race.raceId) || [])) {
      yearDriverIds.add(res.driverId);
      if (res.constructorId) yearConstructorIds.add(res.constructorId);
    }
  }

  // For each driver this year, find their primary constructor (most races driven for)
  const driverPrimaryConstructor = new Map();
  for (const driverId of yearDriverIds) {
    const counts = new Map();
    for (const race of yearRaces) {
      for (const res of (resultsByRace.get(race.raceId) || [])) {
        if (res.driverId !== driverId) continue;
        if (!res.constructorId) continue;
        counts.set(res.constructorId, (counts.get(res.constructorId) || 0) + 1);
      }
    }
    let top = null, topCount = 0;
    for (const [cid, c] of counts) if (c > topCount) { top = cid; topCount = c; }
    driverPrimaryConstructor.set(driverId, top);
  }

  // Build teams[]
  const yearTeams = [...yearConstructorIds].map(cid => {
    const c = constructorsById.get(cid);
    if (!c) return null;
    return {
      id: c.constructorRef,
      jolpicaId: c.constructorRef,
      name: c.name,
      short: constructorShort(c.constructorRef, c.name),
      color: teamColor(c.constructorRef),
      nationality: c.nationality,
    };
  }).filter(Boolean);

  // Build drivers[]
  const yearDrivers = [...yearDriverIds].map(driverId => {
    const d = driversById.get(driverId);
    if (!d) return null;
    const code = deriveCode(d);
    const nat = natInfo(d.nationality);
    const primaryCid = driverPrimaryConstructor.get(driverId);
    const primaryConstructor = primaryCid ? constructorsById.get(primaryCid) : null;
    return {
      // `id` must be unique within a season - used as the key in
      // computeStandings.progression and as the dataKey in PointsChart.
      // The 3-letter `code` collides for surnames like Hill / Schumacher
      // / Brabham / Andretti when multiple drivers from the same family
      // raced together (1961 had Phil Hill + Graham Hill, etc.), which
      // caused undefined-array-access crashes in the chart. Use the
      // always-unique driverRef instead. `code` stays for display only.
      id: d.driverRef,
      jolpicaId: d.driverRef,
      num: toInt(d.number),
      first: d.forename,
      last: d.surname,
      code,
      country: nat.country,
      flag: nat.flag,
      team: primaryConstructor ? primaryConstructor.constructorRef : null,
      nationality: d.nationality && d.nationality.trim(),
      dateOfBirth: d.dob,
    };
  }).filter(Boolean);

  // Map driverId → display code (matches drivers[].id) for results lookups
  // Map Ergast driverId → driverRef (unique). Used as the `id` in the
  // season's results.order/grid arrays so they match drivers[].id.
  const driverIdToRef = new Map();
  for (const driverId of yearDriverIds) {
    const d = driversById.get(driverId);
    if (d) driverIdToRef.set(driverId, d.driverRef);
  }

  // Build calendar[] + results{}
  const calendar = [];
  const resultsObj = {};
  for (const race of yearRaces) {
    const round = toInt(race.round);
    const circuit = circuitsById.get(race.circuitId);
    const circuitRef = circuit ? circuit.circuitRef : null;
    const cInfo = circuit ? countryInfo(circuit.country) : { code: '', flag: '🏳' };
    calendar.push({
      round,
      name: race.name,
      circuit: circuitRef,
      circuitId: circuitRef,
      country: cInfo.code,
      flag: cInfo.flag,
      date: race.date,
      time: race.time,
      sprint: false,
      status: 'completed',
    });

    const raceResults = (resultsByRace.get(race.raceId) || []).slice()
      .sort((a, b) => (toInt(a.positionOrder) || 9999) - (toInt(b.positionOrder) || 9999));

    if (raceResults.length === 0) continue;

    // Order: finishing order by positionOrder
    const order = raceResults.map(r => driverIdToRef.get(r.driverId)).filter(Boolean);
    // Grid: starting order; drivers with grid 0 (pit-lane / didn't qualify) tail
    const gridSorted = raceResults.slice().sort((a, b) => {
      const ga = toInt(a.grid) || 99;
      const gb = toInt(b.grid) || 99;
      return ga - gb;
    });
    const grid = gridSorted.map(r => driverIdToRef.get(r.driverId)).filter(Boolean);
    // Pole: grid === 1
    const poleRow = raceResults.find(r => toInt(r.grid) === 1);
    const pole = poleRow ? driverIdToRef.get(poleRow.driverId) : null;
    // Fastest lap: rank === 1 (CSV's "rank" column = fastest-lap rank)
    const flRow = raceResults.find(r => toInt(r.rank) === 1);
    const fastest = flRow ? driverIdToRef.get(flRow.driverId) : null;
    // DNFs: status not "Finished" or +N Lap(s)
    const finishedStatuses = new Set(['Finished']);
    const dnfs = raceResults
      .filter(r => {
        const s = statusById.get(r.statusId) || '';
        return !finishedStatuses.has(s) && !/^\+\d+ Lap/.test(s);
      })
      .map(r => driverIdToRef.get(r.driverId))
      .filter(Boolean);

    // Per-driver detail map. Mirrors the shape hand-curated bundles ship
    // (position, grid, points, laps, status, time, fastestLap*) so the
    // shared computeStandings can read `detail[code].points` directly —
    // critical for historic seasons whose points system was NOT modern
    // 25-18-15-12-10-8-6-4-2-1 + FL +1. Without this the legacy
    // approximation in buildFallback inflates pre-2010 totals badly and
    // gives the fastest-lap point in eras it was never awarded.
    const detail = {};
    for (const r of raceResults) {
      const ref = driverIdToRef.get(r.driverId);
      if (!ref) continue;
      const pts = Number(r.points);
      detail[ref] = {
        position: r.positionText || null,
        grid: toInt(r.grid),
        points: Number.isFinite(pts) ? pts : 0,
        laps: toInt(r.laps),
        status: statusById.get(r.statusId) || null,
        time: r.time && r.time !== '\\N' ? r.time : null,
        fastestLap: r.fastestLapTime && r.fastestLapTime !== '\\N' ? r.fastestLapTime : null,
        fastestLapNumber: r.fastestLap && r.fastestLap !== '\\N' ? toInt(r.fastestLap) : null,
      };
    }

    // Post-drop championship snapshot after THIS race. Lets the listing
    // standings render the official FIA total even for "best N of M"
    // years (1950-1990) where summing per-race points overcounts.
    const driverSnap = {};
    for (const s of (driverStandingsByRace.get(race.raceId) || [])) {
      const ref = driverIdToRef.get(s.driverId);
      if (!ref) continue;
      const pts = Number(s.points);
      driverSnap[ref] = {
        points: Number.isFinite(pts) ? pts : 0,
        position: toInt(s.position),
        wins: toInt(s.wins),
      };
    }
    const constructorSnap = {};
    for (const s of (constructorStandingsByRace.get(race.raceId) || [])) {
      const c = constructorsById.get(s.constructorId);
      if (!c) continue;
      const pts = Number(s.points);
      constructorSnap[c.constructorRef] = {
        points: Number.isFinite(pts) ? pts : 0,
        position: toInt(s.position),
        wins: toInt(s.wins),
      };
    }

    const round_entry = { pole, fastest, order, grid, dnfs, detail };
    if (Object.keys(driverSnap).length) round_entry.driverStandings = driverSnap;
    if (Object.keys(constructorSnap).length) round_entry.constructorStandings = constructorSnap;
    resultsObj[round] = round_entry;
  }

  const seasonDoc = {
    seasonYear: String(year),
    teams: yearTeams,
    drivers: yearDrivers,
    calendar,
    results: resultsObj,
  };
  writeFileSync(outPath, JSON.stringify(seasonDoc));
  seasonsWritten++;
}

console.log(`[archive] wrote ${seasonsWritten} season bundles to ${SEASONS_OUT}, skipped ${seasonsSkipped} (hand-curated)`);

// ─── Per-race + per-circuit detail bundles ───────────────────────────────
// PR 2b: prerender /races/<year>/<round>/ and /circuits/<circuitRef>/
// from the Ergast archive. Each race gets a JSON with full results,
// qualifying, sprint (where applicable), navigation neighbours. Each
// circuit gets a JSON with its full race history.

mkdirSync(join(OUT, 'races'), { recursive: true });
mkdirSync(join(OUT, 'circuits'), { recursive: true });

const qualifying = readCsv('qualifying');
const sprintResults = readCsv('sprint_results');

// Group qualifying + sprint results by raceId
const qualifyingByRace = new Map();
for (const q of qualifying) {
  if (!qualifyingByRace.has(q.raceId)) qualifyingByRace.set(q.raceId, []);
  qualifyingByRace.get(q.raceId).push(q);
}
const sprintByRace = new Map();
for (const s of sprintResults) {
  if (!sprintByRace.has(s.raceId)) sprintByRace.set(s.raceId, []);
  sprintByRace.get(s.raceId).push(s);
}

// Helper: build a result-row entry for race detail tables
function buildResultRow(r) {
  const d = driversById.get(r.driverId);
  const c = constructorsById.get(r.constructorId);
  return {
    position: toInt(r.position),
    positionText: r.positionText,
    positionOrder: toInt(r.positionOrder),
    driverRef: d ? d.driverRef : null,
    driverName: d ? `${d.forename} ${d.surname}` : null,
    code: d ? deriveCode(d) : null,
    constructorRef: c ? c.constructorRef : null,
    constructorName: c ? c.name : null,
    constructorColor: c ? teamColor(c.constructorRef) : null,
    grid: toInt(r.grid),
    points: toFloat(r.points) || 0,
    laps: toInt(r.laps),
    time: r.time || null,
    status: statusById.get(r.statusId) || null,
    fastestLapTime: r.fastestLapTime || null,
    fastestLapRank: toInt(r.rank),
  };
}

// Sort races by year+round once for navigation
const racesSorted = races.slice().sort((a, b) => {
  const ya = toInt(a.year), yb = toInt(b.year);
  if (ya !== yb) return ya - yb;
  return toInt(a.round) - toInt(b.round);
});
const raceIndexByRaceId = new Map();
racesSorted.forEach((r, i) => raceIndexByRaceId.set(r.raceId, i));

const racesIndex = [];
let racesWritten = 0;
for (const race of racesSorted) {
  const year = toInt(race.year);
  const round = toInt(race.round);
  const circuit = circuitsById.get(race.circuitId);
  const cInfo = circuit ? countryInfo(circuit.country) : { code: '', flag: '🏳' };

  // Race results - sorted by positionOrder (handles DNFs, finished-by-laps, etc.)
  const raceResultsRaw = (resultsByRace.get(race.raceId) || []).slice()
    .sort((a, b) => (toInt(a.positionOrder) || 9999) - (toInt(b.positionOrder) || 9999));
  const raceResults = raceResultsRaw.map(buildResultRow);

  // Qualifying - sorted by position
  const qualiRaw = (qualifyingByRace.get(race.raceId) || []).slice()
    .sort((a, b) => (toInt(a.position) || 9999) - (toInt(b.position) || 9999));
  const qualifyingRows = qualiRaw.map(q => {
    const d = driversById.get(q.driverId);
    const c = constructorsById.get(q.constructorId);
    return {
      position: toInt(q.position),
      driverRef: d ? d.driverRef : null,
      driverName: d ? `${d.forename} ${d.surname}` : null,
      code: d ? deriveCode(d) : null,
      constructorRef: c ? c.constructorRef : null,
      constructorName: c ? c.name : null,
      q1: q.q1 || null, q2: q.q2 || null, q3: q.q3 || null,
    };
  });

  // Sprint results (where applicable)
  const sprintRaw = (sprintByRace.get(race.raceId) || []).slice()
    .sort((a, b) => (toInt(a.positionOrder) || 9999) - (toInt(b.positionOrder) || 9999));
  const sprint = sprintRaw.length === 0 ? null : sprintRaw.map(s => {
    const d = driversById.get(s.driverId);
    const c = constructorsById.get(s.constructorId);
    return {
      position: toInt(s.position),
      positionText: s.positionText,
      driverRef: d ? d.driverRef : null,
      driverName: d ? `${d.forename} ${d.surname}` : null,
      code: d ? deriveCode(d) : null,
      constructorRef: c ? c.constructorRef : null,
      constructorName: c ? c.name : null,
      grid: toInt(s.grid),
      points: toFloat(s.points) || 0,
      time: s.time || null,
      status: statusById.get(s.statusId) || null,
    };
  });

  // Pole / winner / fastest
  const poleRow = raceResultsRaw.find(r => toInt(r.grid) === 1);
  const flRow = raceResultsRaw.find(r => toInt(r.rank) === 1);
  const winnerRow = raceResultsRaw.find(r => toInt(r.position) === 1);
  const refOf = (row) => row && driversById.get(row.driverId)?.driverRef;

  // Prev/next navigation by global race order
  const idx = raceIndexByRaceId.get(race.raceId);
  const prev = idx > 0 ? racesSorted[idx - 1] : null;
  const next = idx < racesSorted.length - 1 ? racesSorted[idx + 1] : null;

  const raceDoc = {
    raceId: race.raceId,
    year, round,
    name: race.name,
    date: race.date,
    time: race.time,
    url: race.url,
    circuit: circuit ? {
      circuitRef: circuit.circuitRef,
      circuitId: circuit.circuitId,
      name: circuit.name,
      location: circuit.location,
      country: cInfo.code,
      countryName: circuit.country,
      flag: cInfo.flag,
    } : null,
    pole: refOf(poleRow),
    fastest: refOf(flRow),
    fastestLapTime: flRow ? flRow.fastestLapTime : null,
    winner: refOf(winnerRow),
    results: raceResults,
    qualifying: qualifyingRows,
    sprint,
    prev: prev ? { year: toInt(prev.year), round: toInt(prev.round), name: prev.name } : null,
    next: next ? { year: toInt(next.year), round: toInt(next.round), name: next.name } : null,
  };

  const yearDir = join(OUT, 'races', String(year));
  mkdirSync(yearDir, { recursive: true });
  writeFileSync(join(yearDir, `${round}.json`), JSON.stringify(raceDoc));
  racesIndex.push({ year, round, name: race.name, date: race.date, circuitRef: circuit ? circuit.circuitRef : null, completed: true });
  racesWritten++;
}

writeFileSync(join(OUT, '_races-index.json'), JSON.stringify(racesIndex));
console.log(`[archive] wrote ${racesWritten} race detail bundles → ${join(OUT, 'races')}`);

// ─── Post-2024 bundle → race archive entries ─────────────────────────────
// For years after the Ergast CSV dump (> 2024), read public/data/<year>.json
// and emit archive race JSONs for completed rounds (those with results).
// These are appended to racesIndex so getStaticPaths prerenders /races/<y>/<r>/.

const BUNDLE_TEAM_ALIAS = { redbull: 'red_bull', aston: 'aston_martin' };

const DATA_DIR = join(ROOT, 'public', 'data');
const bundleYears = readdirSync(DATA_DIR)
  .filter(f => /^\d{4}\.json$/.test(f))
  .map(f => parseInt(f, 10))
  .filter(y => y > 2024)
  .sort((a, b) => a - b);

// Collect all completed rounds across all bundle years, sorted by year+round
const allBundleRounds = [];
for (const bYear of bundleYears) {
  const bundle = JSON.parse(readFileSync(join(DATA_DIR, `${bYear}.json`), 'utf8'));
  if (!bundle.calendar || !bundle.results) continue;
  for (const calEntry of bundle.calendar.slice().sort((a, b) => a.round - b.round)) {
    const rData = bundle.results[String(calEntry.round)];
    if (rData) allBundleRounds.push({ year: bYear, round: calEntry.round, calEntry, rData, bundle });
  }
}

// circuits.csv uses numeric circuitId; bundles use circuitRef slugs - build a ref map
const circuitsByRef = new Map(circuits.map(c => [c.circuitRef, c]));

let bundleRacesWritten = 0;
for (let i = 0; i < allBundleRounds.length; i++) {
  const { year: bYear, round, calEntry, rData, bundle } = allBundleRounds[i];
  const driverByCode = new Map(bundle.drivers.map(d => [d.id, d]));
  const teamById = new Map(bundle.teams.map(t => [t.id, t]));

  const circuitId = calEntry.circuitId;
  const ergCircuit = circuitsByRef.get(circuitId);
  const cInfo = ergCircuit
    ? countryInfo(ergCircuit.country)
    : { code: calEntry.country || '', flag: calEntry.flag || '' };

  const results = (rData.order || []).map(code => {
    const d = driverByCode.get(code);
    const det = (rData.detail || {})[code] || {};
    const tId = d?.team;
    const cRef = BUNDLE_TEAM_ALIAS[tId] || tId || null;
    const isFastest = rData.fastest === code;
    return {
      position: det.position != null ? parseInt(det.position, 10) : null,
      positionText: det.position != null ? String(det.position) : null,
      driverRef: d?.jolpicaId || null,
      driverName: d ? `${d.first} ${d.last}` : code,
      code,
      constructorRef: cRef,
      constructorName: (tId ? teamById.get(tId) : null)?.name || cRef || null,
      constructorColor: teamColor(cRef),
      grid: det.grid ?? null,
      points: det.points ?? 0,
      laps: det.laps ?? null,
      time: det.time || null,
      status: det.status || null,
      fastestLapTime: isFastest ? (det.fastestLap || null) : null,
      fastestLapRank: isFastest ? 1 : null,
    };
  });

  const qualifying = Object.entries(rData.quali || {})
    .sort((a, b) => (a[1].position || 99) - (b[1].position || 99))
    .map(([code, q]) => {
      const d = driverByCode.get(code);
      const tId = d?.team;
      const cRef = BUNDLE_TEAM_ALIAS[tId] || tId || null;
      return {
        position: q.position ?? null,
        driverRef: d?.jolpicaId || null,
        driverName: d ? `${d.first} ${d.last}` : code,
        code,
        constructorRef: cRef,
        constructorName: (tId ? teamById.get(tId) : null)?.name || cRef || null,
        q1: q.q1 || null,
        q2: q.q2 || null,
        q3: q.q3 || null,
      };
    });

  let sprint = null;
  if (rData.sprintResults?.order) {
    sprint = rData.sprintResults.order.map(code => {
      const d = driverByCode.get(code);
      const det = (rData.sprintResults.detail || {})[code] || {};
      const tId = d?.team;
      const cRef = BUNDLE_TEAM_ALIAS[tId] || tId || null;
      const cName = teamById.get(tId)?.name || cRef || null;
      return {
        position: det.position != null ? parseInt(det.position, 10) : null,
        positionText: det.position != null ? String(det.position) : null,
        driverRef: d?.jolpicaId || null,
        driverName: d ? `${d.first} ${d.last}` : code,
        code,
        constructorRef: cRef,
        constructorName: cName,
        grid: det.grid ?? null,
        points: det.points ?? 0,
        time: det.time || null,
        status: det.status || null,
      };
    });
  }

  // Prev: previous bundle round, or last Ergast race for round 1 of first year
  const prevEntry = i > 0 ? allBundleRounds[i - 1] : null;
  const nextEntry = i < allBundleRounds.length - 1 ? allBundleRounds[i + 1] : null;
  const prev = prevEntry
    ? { year: prevEntry.year, round: prevEntry.round, name: prevEntry.calEntry.name }
    : (racesIndex.length > 0
        ? { year: racesIndex[racesIndex.length - 1].year, round: racesIndex[racesIndex.length - 1].round, name: racesIndex[racesIndex.length - 1].name }
        : null);
  const next = nextEntry
    ? { year: nextEntry.year, round: nextEntry.round, name: nextEntry.calEntry.name }
    : null;

  const fastCode = rData.fastest;
  const fastDet = (rData.detail || {})[fastCode] || {};
  const raceDoc = {
    raceId: `${bYear}_${round}`,
    year: bYear, round,
    name: calEntry.name,
    date: calEntry.date || null,
    time: calEntry.time || null,
    url: null,
    circuit: {
      circuitRef: circuitId,
      circuitId,
      name: ergCircuit?.name || calEntry.name,
      location: ergCircuit?.location || '',
      country: cInfo.code,
      countryName: ergCircuit?.country || '',
      flag: calEntry.flag || '',
    },
    pole: driverByCode.get(rData.pole)?.jolpicaId || null,
    fastest: driverByCode.get(fastCode)?.jolpicaId || null,
    fastestLapTime: fastDet.fastestLap || null,
    winner: driverByCode.get(rData.order?.[0])?.jolpicaId || null,
    results,
    qualifying,
    sprint,
    prev,
    next,
  };

  const yearDir = join(OUT, 'races', String(bYear));
  mkdirSync(yearDir, { recursive: true });
  writeFileSync(join(yearDir, `${round}.json`), JSON.stringify(raceDoc));
  racesIndex.push({ year: bYear, round, name: calEntry.name, date: calEntry.date || null, circuitRef: circuitId, completed: true });
  bundleRacesWritten++;
}

if (allBundleRounds.length > 0) {
  writeFileSync(join(OUT, '_races-index.json'), JSON.stringify(racesIndex));
  console.log(`[archive] +${bundleRacesWritten} bundle race detail bundles (${bundleYears.join(', ')})`);
}

// ─── Upcoming bundle rounds → holding-page archive entries ───────────────
// For rounds in post-Ergast bundles (year > 2024) that have NOT been run yet
// (no results in bundle.results) but have session timetable data populated,
// emit a holding-page archive JSON. The Astro route renders these via
// RaceUpcomingBody.astro instead of RaceResultsBody.astro.
//
// Schema differs from completed races: results/qualifying/sprint are empty
// arrays/null, sessions is populated, lastHeldHere holds the most recent
// completed race at the same circuitRef (any year), circuitFirstTime is true
// when no completed race ever exists at this circuitRef.

// IMPORTANT: build completedByCircuit BEFORE the upcoming loop appends to
// racesIndex, otherwise lastHeldHere could resolve to a not-yet-run race.

// Index completed races by circuitRef so we can compute lastHeldHere quickly.
// racesIndex now contains both Ergast (1950–2024) and post-2024 completed
// bundle rounds - that's everything we need.
const completedByCircuit = new Map();
for (const entry of racesIndex) {
  if (!entry.circuitRef) continue;
  const list = completedByCircuit.get(entry.circuitRef) || [];
  list.push(entry);
  completedByCircuit.set(entry.circuitRef, list);
}
for (const list of completedByCircuit.values()) {
  list.sort((a, b) => b.year - a.year || b.round - a.round); // newest first
}

// Walk every bundle year × round; emit archive JSON for rounds with no result
// but with sessions populated. Track upcoming rounds in chronological order so
// prev/next nav links work cross-bundle and cross-completion.
const allBundleCalendars = [];
for (const bYear of bundleYears) {
  const bundle = JSON.parse(readFileSync(join(DATA_DIR, `${bYear}.json`), 'utf8'));
  if (!bundle.calendar) continue;
  for (const calEntry of bundle.calendar.slice().sort((a, b) => a.round - b.round)) {
    allBundleCalendars.push({ year: bYear, round: calEntry.round, calEntry, bundle });
  }
}

let upcomingRacesWritten = 0;
for (let i = 0; i < allBundleCalendars.length; i++) {
  const { year: bYear, round, calEntry, bundle } = allBundleCalendars[i];
  // Skip rounds that already have a completed archive entry (handled above).
  const hasResult = bundle.results && bundle.results[String(round)];
  if (hasResult) continue;
  // Skip rounds with no session data - falls through to legacy /race.html redirect.
  if (!calEntry.sessions || Object.values(calEntry.sessions).every(v => !v)) continue;

  const circuitId = calEntry.circuitId;
  const ergCircuit = circuitsByRef.get(circuitId);
  const cInfo = ergCircuit
    ? countryInfo(ergCircuit.country)
    : { code: calEntry.country || '', flag: calEntry.flag || '' };

  // lastHeldHere: most recent completed race at this circuitRef, any year.
  const completedHere = completedByCircuit.get(circuitId) || [];
  let lastHeldHere = null;
  let circuitFirstTime = true;
  if (completedHere.length > 0) {
    circuitFirstTime = false;
    const newest = completedHere[0];
    try {
      const past = JSON.parse(readFileSync(
        join(OUT, 'races', String(newest.year), `${newest.round}.json`),
        'utf8'
      ));
      const podium = (past.results || [])
        .filter(r => r.position != null && r.position <= 3)
        .sort((a, b) => a.position - b.position)
        .map(r => ({
          position: r.position,
          driverRef: r.driverRef,
          driverName: r.driverName,
          constructorRef: r.constructorRef,
          constructorName: r.constructorName,
        }));
      if (podium.length > 0) {
        lastHeldHere = { year: newest.year, round: newest.round, podium };
      }
    } catch {
      // Past race file missing - treat as no lastHeldHere data, but still not first time.
      lastHeldHere = null;
    }
  }

  // prev/next: pair with immediate neighbours in allBundleCalendars (which spans
  // completed AND upcoming rounds across all bundle years, in chronological order).
  // For the first upcoming round, prevEntry is automatically the most recently
  // completed round. For the last, nextEntry is null. The boundary patch below
  // fixes the symmetric direction (completed → upcoming) since the completed
  // pass wrote its `next` based on the completed-only list.
  const prevEntry = i > 0 ? allBundleCalendars[i - 1] : null;
  const nextEntry = i < allBundleCalendars.length - 1 ? allBundleCalendars[i + 1] : null;
  const prev = prevEntry
    ? { year: prevEntry.year, round: prevEntry.round, name: prevEntry.calEntry.name }
    : null;
  const next = nextEntry
    ? { year: nextEntry.year, round: nextEntry.round, name: nextEntry.calEntry.name }
    : null;

  // Boundary patch: when this upcoming round's prev is a completed round, that
  // completed round's JSON was written earlier with next: null (or pointing at
  // the next *completed* round, which is wrong). Update its next field to point
  // at this upcoming round so prev/next nav is symmetric across the boundary.
  if (prevEntry && prevEntry.bundle.results && prevEntry.bundle.results[String(prevEntry.round)]) {
    const prevPath = join(OUT, 'races', String(prevEntry.year), `${prevEntry.round}.json`);
    if (existsSync(prevPath)) {
      const prevDoc = JSON.parse(readFileSync(prevPath, 'utf8'));
      const desiredNext = { year: bYear, round, name: calEntry.name };
      if (!prevDoc.next || prevDoc.next.year !== bYear || prevDoc.next.round !== round) {
        prevDoc.next = desiredNext;
        writeFileSync(prevPath, JSON.stringify(prevDoc));
      }
    }
  }

  // Pending sessions: qualifying (and, on a sprint weekend, the sprint) have run
  // but the race hasn't, so this round is still a holding page. fetch-season
  // stashes them under bundle.pendingQuali / bundle.pendingSprint (kept out of
  // bundle.results so the standings / win-count passes still treat the round as
  // un-run). Map them to the same shapes the completed pass emits so
  // RaceUpcomingBody can render the quali and sprint tables.
  let qualifying = [];
  let sprintRows = null;
  const pendingQ = bundle.pendingQuali && bundle.pendingQuali[String(round)];
  const pendingS = bundle.pendingSprint && bundle.pendingSprint[String(round)];
  if (pendingQ || pendingS?.order) {
    const driverByCode = new Map(bundle.drivers.map(d => [d.id, d]));
    const teamById = new Map(bundle.teams.map(t => [t.id, t]));
    if (pendingQ) {
      qualifying = Object.entries(pendingQ)
        .sort((a, b) => (a[1].position || 99) - (b[1].position || 99))
        .map(([code, q]) => {
          const d = driverByCode.get(code);
          const tId = d?.team;
          const cRef = BUNDLE_TEAM_ALIAS[tId] || tId || null;
          return {
            position: q.position ?? null,
            driverRef: d?.jolpicaId || null,
            driverName: d ? `${d.first} ${d.last}` : code,
            code,
            constructorRef: cRef,
            constructorName: (tId ? teamById.get(tId) : null)?.name || cRef || null,
            q1: q.q1 || null,
            q2: q.q2 || null,
            q3: q.q3 || null,
          };
        });
    }
    if (pendingS?.order) {
      sprintRows = pendingS.order.map(code => {
        const d = driverByCode.get(code);
        const det = (pendingS.detail || {})[code] || {};
        const tId = d?.team;
        const cRef = BUNDLE_TEAM_ALIAS[tId] || tId || null;
        return {
          position: det.position != null ? parseInt(det.position, 10) : null,
          positionText: det.position != null ? String(det.position) : null,
          driverRef: d?.jolpicaId || null,
          driverName: d ? `${d.first} ${d.last}` : code,
          code,
          constructorRef: cRef,
          constructorName: (tId ? teamById.get(tId) : null)?.name || cRef || null,
          grid: det.grid ?? null,
          points: det.points ?? 0,
          time: det.time || null,
          status: det.status || null,
        };
      });
    }
  }

  const raceDoc = {
    raceId: `${bYear}_${round}`,
    year: bYear,
    round,
    name: calEntry.name,
    date: calEntry.date || null,
    time: calEntry.time || null,
    url: null,
    circuit: {
      circuitRef: circuitId,
      circuitId,
      name: ergCircuit?.name || calEntry.name,
      location: ergCircuit?.location || '',
      country: cInfo.code,
      countryName: ergCircuit?.country || '',
      flag: calEntry.flag || '',
    },
    sprint: !!calEntry.sprint,
    sessions: calEntry.sessions, // { fp1, fp2, fp3, q, sprint, sprintQuali, race } | each null or { date, time }
    status: calEntry.status || 'upcoming',
    lastHeldHere,
    circuitFirstTime,
    pole: qualifying.length ? (qualifying[0].driverRef || null) : null,
    fastest: null,
    fastestLapTime: null,
    winner: null,
    results: [],
    qualifying,
    sprint_results: sprintRows,
    prev,
    next,
  };

  const yearDir = join(OUT, 'races', String(bYear));
  mkdirSync(yearDir, { recursive: true });
  writeFileSync(join(yearDir, `${round}.json`), JSON.stringify(raceDoc));
  racesIndex.push({
    year: bYear,
    round,
    name: calEntry.name,
    date: calEntry.date || null,
    circuitRef: circuitId,
    completed: false,
  });
  upcomingRacesWritten++;
}

if (upcomingRacesWritten > 0) {
  writeFileSync(join(OUT, '_races-index.json'), JSON.stringify(racesIndex));
  console.log(`[archive] +${upcomingRacesWritten} upcoming race holding bundles`);
}

// ─── Circuits ─────────────────────────────────────────────────────────
const circuitsIndex = [];
let circuitsWritten = 0;
for (const c of circuits) {
  const cInfo = countryInfo(c.country);
  const circuitRaces = racesSorted.filter(r => r.circuitId === c.circuitId);

  const racesAtCircuit = circuitRaces.map(race => {
    const raceResultsRaw = (resultsByRace.get(race.raceId) || []);
    const winnerRow = raceResultsRaw.find(r => toInt(r.position) === 1);
    const poleRow = raceResultsRaw.find(r => toInt(r.grid) === 1);
    const flRow = raceResultsRaw.find(r => toInt(r.rank) === 1);
    const refOf = (row) => row && driversById.get(row.driverId)?.driverRef;
    const nameOf = (row) => {
      if (!row) return null;
      const d = driversById.get(row.driverId);
      return d ? `${d.forename} ${d.surname}` : null;
    };
    const teamOf = (row) => {
      if (!row) return null;
      const k = constructorsById.get(row.constructorId);
      return k ? k.name : null;
    };
    const teamRefOf = (row) => {
      if (!row) return null;
      const k = constructorsById.get(row.constructorId);
      return k ? k.constructorRef : null;
    };
    return {
      year: toInt(race.year),
      round: toInt(race.round),
      name: race.name,
      date: race.date,
      winnerRef: refOf(winnerRow),
      winnerName: nameOf(winnerRow),
      winnerTeam: teamOf(winnerRow),
      winnerTeamRef: teamRefOf(winnerRow),
      poleRef: refOf(poleRow),
      poleName: nameOf(poleRow),
      fastestLapRef: refOf(flRow),
      fastestLapTime: flRow ? flRow.fastestLapTime : null,
    };
  });

  // Tally most wins / poles by driver
  const winCounts = new Map();
  const poleCounts = new Map();
  for (const r of racesAtCircuit) {
    if (r.winnerRef) winCounts.set(r.winnerRef, (winCounts.get(r.winnerRef) || 0) + 1);
    if (r.poleRef) poleCounts.set(r.poleRef, (poleCounts.get(r.poleRef) || 0) + 1);
  }
  const tallyTop = (m) => [...m.entries()]
    .map(([driverRef, count]) => {
      const d = drivers.find(dr => dr.driverRef === driverRef);
      return { driverRef, count, name: d ? `${d.forename} ${d.surname}` : driverRef };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const circuitDoc = {
    circuitRef: c.circuitRef,
    circuitId: c.circuitId,
    name: c.name,
    location: c.location,
    country: cInfo.code,
    countryName: c.country,
    flag: cInfo.flag,
    lat: toFloat(c.lat),
    lng: toFloat(c.lng),
    alt: toInt(c.alt),
    url: c.url,
    raceCount: racesAtCircuit.length,
    firstYear: racesAtCircuit.length ? Math.min(...racesAtCircuit.map(r => r.year)) : null,
    lastYear: racesAtCircuit.length ? Math.max(...racesAtCircuit.map(r => r.year)) : null,
    races: racesAtCircuit.sort((a, b) => b.year - a.year || b.round - a.round),
    mostWins: tallyTop(winCounts),
    mostPoles: tallyTop(poleCounts),
  };

  writeFileSync(join(OUT, 'circuits', `${c.circuitRef}.json`), JSON.stringify(circuitDoc));
  circuitsIndex.push({
    circuitRef: c.circuitRef,
    name: c.name,
    location: c.location,
    country: cInfo.code,
    countryName: c.country,
    flag: cInfo.flag,
    raceCount: racesAtCircuit.length,
    firstYear: circuitDoc.firstYear,
    lastYear: circuitDoc.lastYear,
  });
  circuitsWritten++;
}

// ─── Merge hand-curated post-Ergast seasons into circuit history ─────
// The Ergast dump ends at 2024. Hand-curated public/data/<year>.json
// bundles for 2025+ have race calendars + results with the same shape;
// merge their entries into the per-circuit JSONs so circuit pages don't
// stop at "2024".

const HAND_CIRCUIT_ALIAS = {
  albert: 'albert_park',
  marina: 'marina_bay',
  lasvegas: 'vegas',
  yas: 'yas_marina',
  montreal: 'villeneuve',
  cota: 'americas',
  spielberg: 'red_bull_ring',
  imola: 'imola',
  monaco: 'monaco',
  monza: 'monza',
  silverstone: 'silverstone',
  spa: 'spa',
  suzuka: 'suzuka',
  shanghai: 'shanghai',
  hungaroring: 'hungaroring',
  interlagos: 'interlagos',
  bahrain: 'bahrain',
  jeddah: 'jeddah',
  miami: 'miami',
  baku: 'baku',
  catalunya: 'catalunya',
  losail: 'losail',
  zandvoort: 'zandvoort',
  rodriguez: 'rodriguez',
};
const ARCHIVE_MAX_YEAR = Math.max(...allYears);

const seasonFiles = readdirSync(SEASONS_OUT)
  .filter(f => /^\d{4}\.json$/.test(f))
  .map(f => ({ year: parseInt(f.slice(0, 4), 10), path: join(SEASONS_OUT, f) }))
  .filter(e => e.year > ARCHIVE_MAX_YEAR)
  .sort((a, b) => a.year - b.year);

let postArchiveRacesAdded = 0;
for (const { year, path } of seasonFiles) {
  const season = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(season.calendar)) continue;
  for (const race of season.calendar) {
    // Only merge rounds that have actually been run - inserting future
    // calendar entries gave circuit pages empty winner rows and pushed
    // sitemap lastmod dates into the future (raceCount/lastYear too).
    const result = season.results &&
      (season.results[race.round] ?? season.results[String(race.round)]);
    if (!result) continue;

    const refRaw = race.circuitId || race.circuit;
    if (!refRaw) continue;
    const cref = HAND_CIRCUIT_ALIAS[refRaw] || refRaw;
    const circuitJsonPath = join(OUT, 'circuits', `${cref}.json`);
    if (!existsSync(circuitJsonPath)) continue;

    const doc = JSON.parse(readFileSync(circuitJsonPath, 'utf8'));
    // Skip if this race is already present (idempotent re-runs)
    if (doc.races.some(r => r.year === year && r.round === race.round)) continue;

    let winnerRef = null, poleRef = null, fastestRef = null;
    let winnerName = null, poleName = null, winnerTeam = null, winnerTeamRef = null;
    {
      const winnerId = result.order?.[0];
      const poleId = result.pole;
      const fastestId = result.fastest;
      const driverByCode = (id) => season.drivers?.find(d => d.id === id || d.jolpicaId === id);
      const TEAM_ALIAS = { redbull: 'red_bull', aston: 'aston_martin' };
      const teamByDriverCode = (id) => {
        const d = driverByCode(id);
        if (!d) return null;
        const t = season.teams?.find(t => t.id === d.team);
        return t ? t.name : null;
      };
      const teamRefByDriverCode = (id) => {
        const d = driverByCode(id);
        if (!d) return null;
        const t = season.teams?.find(t => t.id === d.team);
        return t?.jolpicaId || (d.team && TEAM_ALIAS[d.team]) || d.team || null;
      };
      const refOf = (id) => driverByCode(id)?.jolpicaId || null;
      const nameOf = (id) => {
        const d = driverByCode(id);
        return d ? `${d.first} ${d.last}` : null;
      };
      winnerRef = refOf(winnerId); winnerName = nameOf(winnerId);
      winnerTeam = teamByDriverCode(winnerId); winnerTeamRef = teamRefByDriverCode(winnerId);
      poleRef = refOf(poleId); poleName = nameOf(poleId);
      fastestRef = refOf(fastestId);
    }

    doc.races.unshift({
      year,
      round: race.round,
      name: race.name,
      date: race.date,
      winnerRef, winnerName, winnerTeam, winnerTeamRef,
      poleRef, poleName,
      fastestLapRef: fastestRef,
      fastestLapTime: null,
    });
    doc.raceCount = doc.races.length;
    doc.lastYear = Math.max(doc.lastYear || year, year);

    // Refresh tallies (most wins / most poles)
    const winCounts = new Map();
    const poleCounts = new Map();
    const driverNames = new Map();
    for (const r of doc.races) {
      if (r.winnerRef) {
        winCounts.set(r.winnerRef, (winCounts.get(r.winnerRef) || 0) + 1);
        if (r.winnerName) driverNames.set(r.winnerRef, r.winnerName);
      }
      if (r.poleRef) {
        poleCounts.set(r.poleRef, (poleCounts.get(r.poleRef) || 0) + 1);
        if (r.poleName) driverNames.set(r.poleRef, r.poleName);
      }
    }
    const tallyTop = (m) => [...m.entries()]
      .map(([driverRef, count]) => ({ driverRef, count, name: driverNames.get(driverRef) || driverRef }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    doc.mostWins = tallyTop(winCounts);
    doc.mostPoles = tallyTop(poleCounts);

    writeFileSync(circuitJsonPath, JSON.stringify(doc));
    postArchiveRacesAdded++;
  }
}
if (postArchiveRacesAdded > 0) {
  console.log(`[archive] merged ${postArchiveRacesAdded} post-Ergast races (${seasonFiles.map(s => s.year).join(', ')}) into circuit history`);
}

writeFileSync(join(OUT, '_circuits-index.json'), JSON.stringify(circuitsIndex));
console.log(`[archive] wrote ${circuitsWritten} circuit detail bundles → ${join(OUT, 'circuits')}`);

// ─── Merge post-Ergast seasons into driver history ────────────────────
// Same idea as the circuit merge above - open each driver JSON, append
// per-race entries from the hand-curated 2025+ bundles, then refresh
// career totals and per-season rollups so the driver pages don't stop at
// the Ergast 2024 cutoff. Championships stay as Ergast computed them
// (final-standing data isn't available for in-progress seasons).

// Bundle team ids → Ergast constructorRef. Buildfallback uses short
// slugs; Ergast uses longer ones in a few cases. Brand-new manufacturers
// (audi, cadillac) don't have Ergast entries yet - pass through their
// short id; the team page may 404 until Ergast catches up.
const HAND_CONSTRUCTOR_ALIAS = {
  aston: 'aston_martin',
  redbull: 'red_bull',
  rb: 'rb',
  alphatauri: 'alphatauri',
};

const driverDocCache = new Map(); // driverRef → mutable doc
const newlyCreatedDrivers = new Set(); // refs synthesised from bundles
function loadDriverDoc(driverRef, bundleDriver) {
  if (driverDocCache.has(driverRef)) return driverDocCache.get(driverRef);
  const p = join(OUT, 'drivers', `${driverRef}.json`);
  if (existsSync(p)) {
    const doc = JSON.parse(readFileSync(p, 'utf8'));
    driverDocCache.set(driverRef, doc);
    return doc;
  }
  // No Ergast row for this driver - they debuted post-2024. Synthesize a
  // shell doc from the bundle entry so the post-archive merge has somewhere
  // to append per-race entries. Career totals get filled in by the
  // recompute pass below.
  if (!bundleDriver) return null;
  const doc = {
    driverRef,
    driverId: null,
    code: bundleDriver.code || null,
    number: bundleDriver.num != null ? String(bundleDriver.num) : null,
    forename: bundleDriver.first || '',
    surname: bundleDriver.last || '',
    dob: bundleDriver.dateOfBirth || null,
    nationality: bundleDriver.nationality || null,
    url: null,
    career: {
      seasons: 0, firstYear: null, lastYear: null,
      races: 0, wins: 0, podiums: 0, poles: 0, fastestLaps: 0,
      championships: 0,
    },
    perSeason: [],
    perRace: [],
  };
  driverDocCache.set(driverRef, doc);
  newlyCreatedDrivers.add(driverRef);
  return doc;
}

let postArchiveDriverEntries = 0;
for (const { year, path } of seasonFiles) {
  const season = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(season.calendar) || !season.results) continue;

  const driverByCode = new Map();
  for (const d of season.drivers || []) {
    if (d.id && d.jolpicaId) driverByCode.set(d.id, d);
  }
  const teamById = new Map();
  for (const t of season.teams || []) teamById.set(t.id, t);

  for (const race of season.calendar) {
    const round = toInt(race.round);
    if (round == null) continue;
    const result = season.results[round] || season.results[String(round)];
    if (!result) continue;

    const detail = result.detail || {};
    const order = result.order || [];
    // Sprint points are stored separately from race points in the bundle
    // (sprintResults.detail) - carry them on the perRace row so season
    // totals include them. Sprint-only participants get a row too.
    const sprintPts = sprintPointsMap(result);
    const codes = new Set([...order, ...Object.keys(detail), ...Object.keys(sprintPts)]);

    for (const code of codes) {
      const d = driverByCode.get(code);
      if (!d) continue;
      const doc = loadDriverDoc(d.jolpicaId, d);
      if (!doc) continue;
      // Idempotent re-runs: skip if this race is already merged
      if (doc.perRace.some(r => r.year === year && r.round === round)) continue;

      const det = detail[code] || {};
      // Per-race team when the bundle ships it (mid-season swaps), else the
      // driver's season-level team. Bundles carry the Ergast ref as
      // jolpicaId - prefer it; the alias map is only a fallback for bundles
      // that predate the field.
      const teamId = det.team || d.team;
      const team = teamById.get(teamId);
      const constructorRef = team?.jolpicaId || HAND_CONSTRUCTOR_ALIAS[teamId] || teamId || null;
      const constructorName = team ? team.name : null;

      const positionText = det.position != null ? String(det.position) : null;
      const positionNum = positionText && /^\d+$/.test(positionText) ? parseInt(positionText, 10) : null;
      const grid = det.grid != null ? toInt(det.grid) : (order.includes(code) ? null : null);

      doc.perRace.push({
        raceId: null,
        year,
        round,
        raceName: race.name,
        date: race.date,
        circuitId: race.circuitId || race.circuit || null,
        country: race.country || null,
        flag: race.flag || null,
        constructorId: null,
        constructorRef,
        constructorName,
        grid,
        position: positionNum,
        positionText,
        positionOrder: positionNum,
        points: toFloat(det.points) || 0,
        sprintPoints: sprintPts[code] || 0,
        laps: det.laps != null ? toInt(det.laps) : null,
        fastestLapRank: result.fastest === code ? 1 : null,
        fastestLapTime: det.fastestLap || null,
        statusId: null,
        status: det.status || null,
      });
      postArchiveDriverEntries++;
    }
  }
}

// Pre-compute championship standings per bundle year via the shared scoring
// engine (sprint-aware, wins countback on points ties - the same standings
// the islands render). Used below to fill position for post-Ergast perSeason
// rows instead of null.
const bundleStandings = new Map(); // year → Map<driverRef, champPosition>
for (const { year, path } of seasonFiles) {
  const season = JSON.parse(readFileSync(path, 'utf8'));
  if (!season.results) continue;
  const driverByCode = new Map();
  for (const d of season.drivers || []) {
    if (d.id && d.jolpicaId) driverByCode.set(d.id, d);
  }
  const posMap = new Map();
  for (const row of computeBundleSeasonStandings(season).drivers) {
    const d = driverByCode.get(row.driver.id);
    if (d) posMap.set(d.jolpicaId, row.position);
  }
  bundleStandings.set(year, posMap);
}

// Count championships from completed bundle years (any year before the current
// calendar year is definitively over; current year may still be in progress).
const currentCalendarYear = new Date().getFullYear();
const bundleChampionships = new Map(); // driverRef → additional titles
for (const [year, posMap] of bundleStandings) {
  if (year >= currentCalendarYear) continue;
  for (const [driverRef, pos] of posMap) {
    if (pos === 1) bundleChampionships.set(driverRef, (bundleChampionships.get(driverRef) || 0) + 1);
  }
}

// Refresh career totals + perSeason for any driver we touched, then
// rewrite the per-driver JSON. _drivers-index.json gets the same updates
// in-place so the listing reflects new totals.
const driverIndexByRef = new Map();
for (const entry of index) driverIndexByRef.set(entry.driverRef, entry);

for (const [driverRef, doc] of driverDocCache) {
  doc.perRace.sort((a, b) => (a.year - b.year) || ((a.round || 0) - (b.round || 0)));

  const wins = doc.perRace.filter(r => r.position === 1).length;
  const podiums = doc.perRace.filter(r => r.position != null && r.position <= 3).length;
  const poles = doc.perRace.filter(r => r.grid === 1).length;
  const fastestLaps = doc.perRace.filter(r => r.fastestLapRank === 1).length;
  const seasonsSet = new Set(doc.perRace.map(r => r.year));
  doc.career = {
    ...doc.career,
    seasons: seasonsSet.size,
    firstYear: seasonsSet.size ? Math.min(...seasonsSet) : null,
    lastYear: seasonsSet.size ? Math.max(...seasonsSet) : null,
    races: doc.perRace.length,
    wins, podiums, poles, fastestLaps,
    championships: doc.career.championships + (bundleChampionships.get(driverRef) || 0),
  };

  // perSeason rebuild: keep Ergast's final-standing position+points for
  // years that already had them; derive new years from perRace sums.
  const oldPerSeason = new Map(doc.perSeason.map(s => [s.year, s]));
  const byYear = new Map();
  for (const r of doc.perRace) {
    if (!byYear.has(r.year)) byYear.set(r.year, []);
    byYear.get(r.year).push(r);
  }
  doc.perSeason = [...byYear.entries()].map(([year, rows]) => {
    const teamCounts = new Map();
    for (const r of rows) if (r.constructorRef) teamCounts.set(r.constructorRef, (teamCounts.get(r.constructorRef) || 0) + 1);
    let primaryRef = null, primaryName = null, top = 0;
    for (const r of rows) {
      const c = teamCounts.get(r.constructorRef) || 0;
      if (c > top) { top = c; primaryRef = r.constructorRef; primaryName = r.constructorName; }
    }
    const bestFinish = rows.reduce(
      (best, r) => (r.position != null && (best == null || r.position < best)) ? r.position : best,
      null,
    );
    const seasonWins = rows.filter(r => r.position === 1).length;
    const existing = oldPerSeason.get(year);
    if (existing && existing.position != null) {
      // Year was in Ergast - preserve final-standing rank and points.
      return { ...existing, races: rows.length, bestFinish, wins: seasonWins };
    }
    // Post-Ergast year - sum race + sprint points from per-race rows;
    // derive position from bundleStandings (shared scoring engine).
    return {
      year,
      constructorRef: primaryRef,
      constructorName: primaryName,
      position: bundleStandings.get(year)?.get(driverRef) ?? null,
      points: rows.reduce((s, r) => s + (r.points || 0) + (r.sprintPoints || 0), 0),
      wins: seasonWins,
      races: rows.length,
      bestFinish,
    };
  }).sort((a, b) => b.year - a.year);

  writeFileSync(join(OUT, 'drivers', `${driverRef}.json`), JSON.stringify(doc));

  if (newlyCreatedDrivers.has(driverRef)) {
    // First time we've seen this driver - give them an index entry so
    // /drivers/<ref>/ gets prerendered, and add a code → ref mapping for
    // the legacy /driver.html?id=ANT redirect.
    index.push({
      driverRef,
      code: doc.code,
      forename: doc.forename,
      surname: doc.surname,
      nationality: doc.nationality,
      firstYear: doc.career.firstYear,
      lastYear: doc.career.lastYear,
      races: doc.career.races,
      wins: doc.career.wins,
      championships: doc.career.championships,
    });
    if (doc.code) codeToRef[doc.code] = driverRef;
  } else {
    const idx = driverIndexByRef.get(driverRef);
    if (idx) {
      idx.firstYear = doc.career.firstYear;
      idx.lastYear = doc.career.lastYear;
      idx.races = doc.career.races;
      idx.wins = doc.career.wins;
      idx.championships = doc.career.championships;
    }
  }
}

if (postArchiveDriverEntries > 0) {
  // Re-sort the index after appending new drivers; same comparator as
  // the initial sort so order is stable across reruns.
  index.sort((a, b) =>
    (a.surname || '').localeCompare(b.surname || '') ||
    (a.forename || '').localeCompare(b.forename || '')
  );
  writeFileSync(join(OUT, '_drivers-index.json'), JSON.stringify(index));
  if (newlyCreatedDrivers.size > 0) {
    writeFileSync(join(OUT, '_driver-codes.json'), JSON.stringify(codeToRef));
  }
  console.log(`[archive] merged ${postArchiveDriverEntries} post-Ergast race entries (${seasonFiles.map(s => s.year).join(', ')}) into ${driverDocCache.size} driver docs (${newlyCreatedDrivers.size} new)`);
}

// ─── Teams (constructors) ────────────────────────────────────────────
mkdirSync(join(OUT, 'teams'), { recursive: true });

// Best-season selection: pick the single most impressive season from a
// team's perSeason array. Sort key, ascending priority:
//   1. WCC position (lower better; null sorts last)
//   2. win-rate descending (normalises 16-race vs 24-race eras)
//   3. points descending (final stat tiebreaker)
//   4. year ascending (earliest of ties — "they did it first")
function pickBestSeason(perSeason) {
  const currentYear = new Date().getFullYear();
  // Exclude the current (in-progress) season — small sample sizes early in
  // the year would otherwise let a 1-or-2-win streak masquerade as the
  // team's all-time peak via win-rate.
  const eligible = perSeason.filter(s => s.races > 0 && s.year < currentYear);
  if (!eligible.length) return null;
  const ranked = [...eligible].sort((a, b) => {
    const pa = a.position == null ? Infinity : a.position;
    const pb = b.position == null ? Infinity : b.position;
    if (pa !== pb) return pa - pb;
    const wra = a.races ? a.wins / a.races : 0;
    const wrb = b.races ? b.wins / b.races : 0;
    if (wrb !== wra) return wrb - wra;
    const ptsa = a.points || 0;
    const ptsb = b.points || 0;
    if (ptsb !== ptsa) return ptsb - ptsa;
    return a.year - b.year;
  });
  const s = ranked[0];
  const winRate = s.races ? s.wins / s.races : 0;
  return {
    year: s.year,
    position: s.position,
    points: s.points,
    wins: s.wins,
    races: s.races,
    winRate,
    tagline: taglineFor(s.position, winRate, s.wins),
    drivers: s.drivers.map(d => ({ driverRef: d.driverRef, name: d.name })),
  };
}

function taglineFor(position, winRate, wins) {
  if (position === 1 && winRate >= 0.75) return 'Total Dominance';
  if (position === 1 && winRate >= 0.50) return 'Championship Year';
  if (position === 1) return 'Champions';
  if (position === 2) return 'Runners-Up';
  if (position === 3) return 'Third Place';
  if (position != null && position <= 5) return 'Top-Five Finish';
  if (position != null && position <= 10) return 'Top-Ten Finish';
  if (wins > 0) return 'Race Winners';
  return 'Best Result';
}

const standingsByConstructor = new Map();
for (const s of constructorStandings) {
  if (!standingsByConstructor.has(s.constructorId)) standingsByConstructor.set(s.constructorId, []);
  standingsByConstructor.get(s.constructorId).push(s);
}

// Group results by constructor for fast iteration
const resultsByConstructor = new Map();
for (const r of results) {
  if (!r.constructorId) continue;
  if (!resultsByConstructor.has(r.constructorId)) resultsByConstructor.set(r.constructorId, []);
  resultsByConstructor.get(r.constructorId).push(r);
}

const teamsIndex = [];
let teamsWritten = 0;
for (const c of constructors) {
  const teamResults = (resultsByConstructor.get(c.constructorId) || [])
    .map(r => {
      const race = racesById.get(r.raceId);
      if (!race) return null;
      return {
        raceId: r.raceId,
        year: toInt(race.year),
        round: toInt(race.round),
        raceName: race.name,
        date: race.date,
        driverId: r.driverId,
        position: toInt(r.position),
        positionText: r.positionText,
        points: toFloat(r.points) || 0,
        statusId: r.statusId,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.year - b.year) || (a.round - b.round));

  // Career totals
  const wins = teamResults.filter(r => r.position === 1).length;
  const podiums = teamResults.filter(r => r.position != null && r.position <= 3).length;
  const yearsSet = new Set(teamResults.map(r => r.year));
  const seasons = yearsSet.size;
  const racesEntered = new Set(teamResults.map(r => r.raceId)).size;
  const driverIds = new Set(teamResults.map(r => r.driverId));

  // Constructors' championships - final-round position === 1 in each year's standings
  let championships = 0;
  const finalStandingByYear = new Map();
  for (const s of standingsByConstructor.get(c.constructorId) || []) {
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
  for (const r of teamResults) {
    if (!byYear.has(r.year)) byYear.set(r.year, []);
    byYear.get(r.year).push(r);
  }
  const perSeason = [...byYear.entries()]
    .map(([year, rows]) => {
      const seasonDrivers = [...new Set(rows.map(r => r.driverId))]
        .map(driverId => {
          const d = driversById.get(driverId);
          if (!d) return null;
          const nat = natInfo(d.nationality);
          return {
            driverRef: d.driverRef,
            name: `${d.forename} ${d.surname}`,
            code: deriveCode(d),
            country: nat.country || null,
            flag: nat.flag || null,
            position: driverFinalPosForYear(driverId, year),
          };
        })
        .filter(Boolean);
      const seasonWins = rows.filter(r => r.position === 1).length;
      const final = finalStandingByYear.get(year) || { position: null, points: null };
      return {
        year,
        drivers: seasonDrivers,
        position: final.position,
        points: final.points,
        wins: seasonWins,
        races: new Set(rows.map(r => r.raceId)).size,
      };
    })
    .sort((a, b) => b.year - a.year);

  // Top drivers (ever raced for this constructor) by wins
  const driverWinCounts = new Map();
  const driverRaceCounts = new Map();
  for (const r of teamResults) {
    driverRaceCounts.set(r.driverId, (driverRaceCounts.get(r.driverId) || 0) + 1);
    if (r.position === 1) driverWinCounts.set(r.driverId, (driverWinCounts.get(r.driverId) || 0) + 1);
  }
  const topDrivers = [...driverIds]
    .map(driverId => {
      const d = driversById.get(driverId);
      if (!d) return null;
      const nat = natInfo(d.nationality);
      return {
        driverRef: d.driverRef,
        name: `${d.forename} ${d.surname}`,
        country: nat.country || null,
        flag: nat.flag || null,
        races: driverRaceCounts.get(driverId) || 0,
        wins: driverWinCounts.get(driverId) || 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.wins - a.wins || b.races - a.races)
    .slice(0, 10);

  const firstYear = yearsSet.size ? Math.min(...yearsSet) : null;
  const lastYear = yearsSet.size ? Math.max(...yearsSet) : null;

  const teamDoc = {
    constructorRef: c.constructorRef,
    constructorId: c.constructorId,
    name: c.name,
    nationality: c.nationality && c.nationality.trim(),
    url: c.url,
    color: teamColor(c.constructorRef),
    short: constructorShort(c.constructorRef, c.name),
    career: {
      seasons,
      firstYear,
      lastYear,
      races: racesEntered,
      wins,
      podiums,
      championships,
      driverCount: driverIds.size,
    },
    perSeason,
    topDrivers,
    bestSeason: pickBestSeason(perSeason),
  };

  writeFileSync(join(OUT, 'teams', `${c.constructorRef}.json`), JSON.stringify(teamDoc));
  teamsIndex.push({
    constructorRef: c.constructorRef,
    name: c.name,
    nationality: c.nationality && c.nationality.trim(),
    firstYear, lastYear, races: racesEntered, wins, championships,
    color: teamColor(c.constructorRef),
  });
  teamsWritten++;
}

teamsIndex.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
writeFileSync(join(OUT, '_teams-index.json'), JSON.stringify(teamsIndex));
console.log(`[archive] wrote ${teamsWritten} team detail bundles → ${join(OUT, 'teams')}`);

// ─── Merge post-Ergast bundle seasons into team docs ─────────────────
// Append bundle-year perSeason rows to existing team docs and synthesize
// new docs for teams that don't exist in Ergast yet (Audi, Cadillac, etc).
// Then refresh career totals + bestSeason and update the teams index.

const teamDocCache = new Map();
const newlyCreatedTeams = new Set();

function loadTeamDoc(constructorRef, bundleTeam) {
  if (teamDocCache.has(constructorRef)) return teamDocCache.get(constructorRef);
  const p = join(OUT, 'teams', `${constructorRef}.json`);
  if (existsSync(p)) {
    const doc = JSON.parse(readFileSync(p, 'utf8'));
    teamDocCache.set(constructorRef, doc);
    return doc;
  }
  if (!bundleTeam) return null;
  const doc = {
    constructorRef,
    constructorId: null,
    name: bundleTeam.name,
    nationality: bundleTeam.nationality || null,
    url: null,
    color: teamColor(constructorRef) !== '#888888'
      ? teamColor(constructorRef)
      : (bundleTeam.color || '#888888'),
    short: constructorShort(constructorRef, bundleTeam.name),
    career: {
      seasons: 0, firstYear: null, lastYear: null,
      races: 0, wins: 0, podiums: 0, championships: 0, driverCount: 0,
    },
    perSeason: [],
    topDrivers: [],
    bestSeason: null,
  };
  teamDocCache.set(constructorRef, doc);
  newlyCreatedTeams.add(constructorRef);
  return doc;
}

let postArchiveTeamYears = 0;
for (const { year, path } of seasonFiles) {
  const season = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(season.calendar) || !season.results) continue;

  const driverByCode = new Map();
  for (const d of season.drivers || []) {
    if (d.id && d.jolpicaId) driverByCode.set(d.id, d);
  }
  const teamByBundleId = new Map();
  for (const t of season.teams || []) teamByBundleId.set(t.id, t);

  // Per-team aggregate for this year
  const byTeam = new Map();
  for (const race of season.calendar) {
    const round = toInt(race.round);
    if (round == null) continue;
    const result = season.results[round] || season.results[String(round)];
    if (!result) continue;
    const detail = result.detail || {};
    const sprintPts = sprintPointsMap(result);

    for (const code of new Set([...Object.keys(detail), ...Object.keys(sprintPts)])) {
      const d = driverByCode.get(code);
      const det = detail[code] || {};
      // Per-race team when shipped (mid-season swaps), else season-level.
      const teamId = det.team || d?.team;
      if (!d || !teamId) continue;
      const posStr = det.position != null ? String(det.position) : '';
      const pos = /^\d+$/.test(posStr) ? parseInt(posStr, 10) : null;

      let agg = byTeam.get(teamId);
      if (!agg) {
        agg = {
          drivers: new Map(),
          wins: 0, podiums: 0, points: 0,
          rounds: new Set(),
          driverRaceCounts: new Map(),
          driverWinCounts: new Map(),
        };
        byTeam.set(teamId, agg);
      }
      const ref = d.jolpicaId;
      agg.drivers.set(ref, { name: `${d.first} ${d.last}`, code: d.code || null, country: d.country || null, flag: d.flag || null });
      agg.points += (toFloat(det.points) || 0) + (sprintPts[code] || 0);
      agg.rounds.add(round);
      agg.driverRaceCounts.set(ref, (agg.driverRaceCounts.get(ref) || 0) + 1);
      if (pos === 1) {
        agg.wins += 1;
        agg.driverWinCounts.set(ref, (agg.driverWinCounts.get(ref) || 0) + 1);
      }
      if (pos != null && pos <= 3) agg.podiums += 1;
    }
  }

  // Year standings: highest points = P1, wins countback on ties (FIA rule)
  const sorted = [...byTeam.entries()].sort((a, b) =>
    b[1].points - a[1].points || b[1].wins - a[1].wins);
  const positions = new Map(sorted.map(([tId], i) => [tId, i + 1]));

  for (const [tId, agg] of byTeam) {
    const bundleTeam = teamByBundleId.get(tId);
    const constructorRef = bundleTeam?.jolpicaId || HAND_CONSTRUCTOR_ALIAS[tId] || tId;
    const doc = loadTeamDoc(constructorRef, bundleTeam);
    if (!doc) continue;
    if (doc.perSeason.some(s => s.year === year)) continue;

    doc.perSeason.push({
      year,
      drivers: [...agg.drivers.entries()].map(([ref, info]) => ({
        driverRef: ref, name: info.name, code: info.code,
        country: info.country || null, flag: info.flag || null,
        position: bundleStandings.get(year)?.get(ref) ?? null,
      })),
      position: positions.get(tId) ?? null,
      points: agg.points,
      wins: agg.wins,
      races: agg.rounds.size,
    });
    doc._bundleAggs = doc._bundleAggs || [];
    doc._bundleAggs.push({ year, agg });
    postArchiveTeamYears++;
  }
}

// Recompute career, topDrivers, bestSeason; rewrite docs + index entries
const currentYearForTeams = new Date().getFullYear();
const teamsIndexByRef = new Map();
for (const e of teamsIndex) teamsIndexByRef.set(e.constructorRef, e);

for (const [constructorRef, doc] of teamDocCache) {
  doc.perSeason.sort((a, b) => b.year - a.year);

  let addWins = 0, addPodiums = 0, addRaces = 0, addChamps = 0;
  const addDriverInfo = new Map();
  const addDriverRaces = new Map();
  const addDriverWins = new Map();
  for (const { year, agg } of doc._bundleAggs || []) {
    addWins += agg.wins;
    addPodiums += agg.podiums;
    addRaces += agg.rounds.size;
    const seasonRow = doc.perSeason.find(s => s.year === year);
    if (year < currentYearForTeams && seasonRow?.position === 1) addChamps += 1;
    for (const [ref, info] of agg.drivers) addDriverInfo.set(ref, { name: info.name, country: info.country || null, flag: info.flag || null });
    for (const [ref, c] of agg.driverRaceCounts) addDriverRaces.set(ref, (addDriverRaces.get(ref) || 0) + c);
    for (const [ref, c] of agg.driverWinCounts) addDriverWins.set(ref, (addDriverWins.get(ref) || 0) + c);
  }
  delete doc._bundleAggs;

  const yearsSet = new Set(doc.perSeason.map(s => s.year));

  if (newlyCreatedTeams.has(constructorRef)) {
    doc.career = {
      seasons: yearsSet.size,
      firstYear: yearsSet.size ? Math.min(...yearsSet) : null,
      lastYear: yearsSet.size ? Math.max(...yearsSet) : null,
      races: addRaces,
      wins: addWins,
      podiums: addPodiums,
      championships: addChamps,
      driverCount: addDriverInfo.size,
    };
    doc.topDrivers = [...addDriverInfo.entries()]
      .map(([ref, info]) => ({
        driverRef: ref, name: info.name,
        country: info.country || null,
        flag: info.flag || null,
        races: addDriverRaces.get(ref) || 0,
        wins: addDriverWins.get(ref) || 0,
      }))
      .sort((a, b) => b.wins - a.wins || b.races - a.races)
      .slice(0, 10);
  } else {
    doc.career.seasons = yearsSet.size;
    doc.career.firstYear = Math.min(doc.career.firstYear ?? Infinity, ...yearsSet);
    doc.career.lastYear = Math.max(doc.career.lastYear ?? -Infinity, ...yearsSet);
    doc.career.races += addRaces;
    doc.career.wins += addWins;
    doc.career.podiums += addPodiums;
    doc.career.championships += addChamps;
    const driverSet = new Set(doc.topDrivers?.map(d => d.driverRef) || []);
    for (const ref of addDriverInfo.keys()) driverSet.add(ref);
    doc.career.driverCount = Math.max(doc.career.driverCount || 0, driverSet.size);

    const merged = new Map((doc.topDrivers || []).map(d => [d.driverRef, { ...d }]));
    for (const [ref, info] of addDriverInfo) {
      const cur = merged.get(ref) || { driverRef: ref, name: info.name, country: info.country || null, flag: info.flag || null, races: 0, wins: 0 };
      cur.races += addDriverRaces.get(ref) || 0;
      cur.wins += addDriverWins.get(ref) || 0;
      cur.name = info.name;
      if (info.country) cur.country = info.country;
      if (info.flag) cur.flag = info.flag;
      merged.set(ref, cur);
    }
    doc.topDrivers = [...merged.values()]
      .sort((a, b) => b.wins - a.wins || b.races - a.races)
      .slice(0, 10);
  }

  doc.bestSeason = pickBestSeason(doc.perSeason);
  writeFileSync(join(OUT, 'teams', `${constructorRef}.json`), JSON.stringify(doc));

  if (newlyCreatedTeams.has(constructorRef)) {
    teamsIndex.push({
      constructorRef: doc.constructorRef,
      name: doc.name,
      nationality: doc.nationality,
      firstYear: doc.career.firstYear,
      lastYear: doc.career.lastYear,
      races: doc.career.races,
      wins: doc.career.wins,
      championships: doc.career.championships,
      color: doc.color,
    });
  } else {
    const idx = teamsIndexByRef.get(constructorRef);
    if (idx) {
      idx.firstYear = doc.career.firstYear;
      idx.lastYear = doc.career.lastYear;
      idx.races = doc.career.races;
      idx.wins = doc.career.wins;
      idx.championships = doc.career.championships;
    }
  }
}

if (postArchiveTeamYears > 0) {
  teamsIndex.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  writeFileSync(join(OUT, '_teams-index.json'), JSON.stringify(teamsIndex));
  console.log(`[archive] merged ${postArchiveTeamYears} post-Ergast team-year entries into ${teamDocCache.size} team docs (${newlyCreatedTeams.size} new)`);
}

// ─── Attach lineage to team docs in any curated chain ─────────────────
{
  const { lineages, validateLineages, buildLineageAttachment } = await import('./lineages.mjs');
  validateLineages(lineages, teamsIndex);

  const teamDocsByRef = new Map();
  function loadTeamDoc(ref) {
    if (teamDocsByRef.has(ref)) return teamDocsByRef.get(ref);
    const p = join(OUT, 'teams', `${ref}.json`);
    if (!existsSync(p)) {
      teamDocsByRef.set(ref, null);
      return null;
    }
    const doc = JSON.parse(readFileSync(p, 'utf8'));
    teamDocsByRef.set(ref, doc);
    return doc;
  }

  const allChainRefs = new Set();
  for (const chain of lineages) {
    for (const node of chain.nodes) allChainRefs.add(node.ref);
  }

  let lineageRefsTouched = 0;
  for (const ref of allChainRefs) {
    const doc = loadTeamDoc(ref);
    if (!doc) continue;
    buildLineageAttachment(doc, lineages, loadTeamDoc);
    writeFileSync(join(OUT, 'teams', `${ref}.json`), JSON.stringify(doc));
    lineageRefsTouched += 1;
  }
  console.log(`[archive] attached lineage to ${lineageRefsTouched} team docs across ${lineages.length} chains`);
}

// ─── Enrich index entries with last5 and display data ───────────────────────
{
  const teamRaceMap = new Map(); // constructorRef → Map<'year-round', {points,year,round}>
  const teamColorByRef = new Map(teamsIndex.map(t => [t.constructorRef, t.color || null]));

  for (const entry of index) {
    let doc;
    try {
      doc = JSON.parse(readFileSync(join(OUT, 'drivers', `${entry.driverRef}.json`), 'utf8'));
    } catch { continue; }

    const perRace = doc.perRace || [];
    // last5 is weekend form - include sprint points where the row has them.
    entry.last5 = perRace.slice(-5).map(r => ({ points: (r.points || 0) + (r.sprintPoints || 0), year: r.year, round: r.round }));
    entry.number = doc.number || null;
    entry.teamName = doc.perSeason?.[0]?.constructorName || null;
    const latestTeamRef = doc.perSeason?.[0]?.constructorRef || null;
    entry.teamRef = latestTeamRef;
    entry.teamColor = latestTeamRef ? (teamColorByRef.get(latestTeamRef) || null) : null;
    entry.currentSeasonYear = doc.perSeason?.[0]?.year ?? null;
    entry.currentSeasonPoints = doc.perSeason?.[0]?.points ?? 0;

    for (const r of perRace) {
      if (!r.constructorRef) continue;
      if (!teamRaceMap.has(r.constructorRef)) teamRaceMap.set(r.constructorRef, new Map());
      const k = `${r.year}-${r.round}`;
      const ex = teamRaceMap.get(r.constructorRef).get(k);
      const weekendPts = (r.points || 0) + (r.sprintPoints || 0);
      if (!ex) {
        teamRaceMap.get(r.constructorRef).set(k, { points: weekendPts, year: r.year, round: r.round });
      } else {
        ex.points += weekendPts;
      }
    }
  }
  writeFileSync(join(OUT, '_drivers-index.json'), JSON.stringify(index));

  for (const tEntry of teamsIndex) {
    const ref = tEntry.constructorRef;
    const races = teamRaceMap.has(ref)
      ? [...teamRaceMap.get(ref).values()].sort((a, b) => a.year - b.year || a.round - b.round)
      : [];
    tEntry.last5 = races.slice(-5).map(r => ({ points: r.points, year: r.year, round: r.round }));
  }
  writeFileSync(join(OUT, '_teams-index.json'), JSON.stringify(teamsIndex));
  console.log('[archive] enriched driver and team indexes with last5 data');
}

// ─── Records & milestones pass ────────────────────────────────────
// Computes 17 curated leaderboards (top-5 for the hub, top-50 for sub-pages)
// across all-time and modern (>= 1981) eras. Reads per-driver / per-team docs
// written above (which already include hand-curated bundle years).

{
  const { buildRecords } = await import('./records/index.mjs');

  console.log('[archive] building records...');

  // For per-race circuit-name lookup: bundle rows store circuitRef (string),
  // Ergast rows store numeric circuitId (string). We need both maps.
  const circuitsByRef = new Map(circuits.map(c => [c.circuitRef, c]));

  // Load all driver docs we just wrote, attach derived fields the records
  // library expects (natInfo, finalStandingByYear).
  const driverFiles = readdirSync(join(OUT, 'drivers'));
  const driverDocs = [];
  for (const f of driverFiles) {
    if (!f.endsWith('.json')) continue;
    const doc = JSON.parse(readFileSync(join(OUT, 'drivers', f), 'utf8'));
    doc.natInfo = natInfo(doc.nationality);
    // finalStandingByYear: { year: {position} } - rebuilt from doc.perSeason.
    doc.finalStandingByYear = {};
    for (const s of doc.perSeason || []) {
      if (s.position != null) doc.finalStandingByYear[s.year] = { position: s.position };
    }
    // Normalise circuitRef + circuitName on perRace. Ergast rows store numeric
    // circuitId in the CSV-keyed map; bundle rows store the circuitRef directly.
    for (const r of doc.perRace || []) {
      if (r.circuitId && circuitsById.has(r.circuitId)) {
        const c = circuitsById.get(r.circuitId);
        r.circuitRef = c.circuitRef;
        r.circuitName = c.name;
      } else if (typeof r.circuitId === 'string') {
        r.circuitRef = r.circuitId;
        const c = circuitsByRef.get(r.circuitRef);
        if (c) r.circuitName = c.name;
      }
    }
    driverDocs.push(doc);
  }

  // Load all team docs
  const teamFiles = readdirSync(join(OUT, 'teams'));
  const teamDocs = [];
  for (const f of teamFiles) {
    if (!f.endsWith('.json')) continue;
    const doc = JSON.parse(readFileSync(join(OUT, 'teams', f), 'utf8'));
    // Synthesise perRace / finalStandingByYear from perSeason for the team generator.
    doc.perRace = [];
    doc.finalStandingByYear = {};
    for (const s of doc.perSeason || []) {
      if (s.position != null) doc.finalStandingByYear[s.year] = { position: s.position };
      for (let i = 0; i < (s.wins || 0); i++) {
        doc.perRace.push({ year: s.year, round: null, position: 1 });
      }
      // Tail of races as non-wins so era filter still treats the year as active
      const nonWins = Math.max(0, (s.races || 0) - (s.wins || 0));
      for (let i = 0; i < nonWins; i++) {
        doc.perRace.push({ year: s.year, round: null, position: null });
      }
    }
    teamDocs.push(doc);
  }

  // yearStandings: per year, the P1 and P2 final standing (driverRef, name, surname, points)
  const yearStandings = {};
  for (const [year, final] of finalRaceIdByYear) {
    const top2 = [];
    for (const s of driverStandings) {
      if (s.raceId !== final.raceId) continue;
      const pos = toInt(s.position);
      if (pos === 1 || pos === 2) {
        const d = driversById.get(s.driverId);
        if (!d) continue;
        top2.push({ pos, driverRef: d.driverRef, name: `${d.forename} ${d.surname}`.trim(), surname: d.surname, points: toFloat(s.points) || 0 });
      }
    }
    const p1 = top2.find(x => x.pos === 1);
    const p2 = top2.find(x => x.pos === 2);
    if (p1 && p2) yearStandings[year] = { p1, p2 };
  }

  // finalRoundDateByYear from races.csv
  const finalRoundDateByYear = {};
  for (const [year, final] of finalRaceIdByYear) {
    const race = racesById.get(final.raceId);
    if (race?.date) finalRoundDateByYear[year] = race.date;
  }

  // allResults for team-1-2: read raw results CSV, keep only P1/P2 rows with
  // year+round resolved. Synthesised team perRace lacks round info and would
  // collapse all year-N rows into one bucket.
  const allResults = [];
  for (const r of results) {
    const race = racesById.get(r.raceId);
    if (!race) continue;
    const constructor = constructorsById.get(r.constructorId);
    if (!constructor) continue;
    const pos = toInt(r.position);
    if (pos !== 1 && pos !== 2) continue;
    allResults.push({
      year: toInt(race.year),
      round: toInt(race.round),
      constructorRef: constructor.constructorRef,
      position: pos,
    });
  }

  // teamColorByRef
  const teamColorByRef = new Map(teamDocs.map(t => [t.constructorRef, t.color || null]));

  const currentYear = new Date().getFullYear();

  // Extend the CSV-sourced inputs with completed post-Ergast bundle years.
  // Without this, title-margin and team-1-2 silently stop at the Ergast
  // cutoff while every other record includes bundle years.
  for (const { year, path } of seasonFiles) {
    if (year >= currentYear) continue; // in-progress season - no final standings yet
    const season = JSON.parse(readFileSync(path, 'utf8'));
    if (!season.results || !Array.isArray(season.calendar)) continue;
    const driverByCode = new Map();
    for (const d of season.drivers || []) if (d.id && d.jolpicaId) driverByCode.set(d.id, d);
    const teamByBundleId = new Map();
    for (const t of season.teams || []) teamByBundleId.set(t.id, t);
    const teamRefOf = (code) => {
      const d = driverByCode.get(code);
      const t = d ? teamByBundleId.get(d.team) : null;
      return t?.jolpicaId || (d?.team ? (HAND_CONSTRUCTOR_ALIAS[d.team] || d.team) : null);
    };

    // yearStandings P1/P2 (title-margin input), sprint-aware via the engine
    const ranked = computeBundleSeasonStandings(season).drivers;
    const toEntry = (row, pos) => {
      const d = driverByCode.get(row.driver.id);
      if (!d) return null;
      return { pos, driverRef: d.jolpicaId, name: `${d.first} ${d.last}`.trim(), surname: d.last, points: row.points };
    };
    const p1 = ranked[0] && toEntry(ranked[0], 1);
    const p2 = ranked[1] && toEntry(ranked[1], 2);
    if (p1 && p2 && !yearStandings[year]) yearStandings[year] = { p1, p2 };

    const completedRaces = season.calendar.filter(r => season.results[r.round] || season.results[String(r.round)]);
    const lastRace = completedRaces[completedRaces.length - 1];
    if (lastRace?.date && !finalRoundDateByYear[year]) finalRoundDateByYear[year] = lastRace.date;

    // P1/P2 rows for team-1-2
    for (const race of completedRaces) {
      const result = season.results[race.round] || season.results[String(race.round)];
      const order = (result && result.order) || [];
      for (let i = 0; i < 2 && i < order.length; i++) {
        const cref = teamRefOf(order[i]);
        if (!cref) continue;
        allResults.push({ year, round: toInt(race.round), constructorRef: cref, position: i + 1 });
      }
    }
  }

  const { index, byTopic } = buildRecords({
    driverDocs,
    teamDocs,
    yearStandings,
    finalRoundDateByYear,
    allResults,
    teamColorByRef,
    currentYear,
  });

  mkdirSync(join(OUT, 'records'), { recursive: true });
  writeFileSync(join(OUT, '_records-index.json'), JSON.stringify(index));
  for (const [id, payload] of Object.entries(byTopic)) {
    writeFileSync(join(OUT, 'records', `${id}.json`), JSON.stringify(payload));
  }
  console.log(`[archive] wrote records index + ${Object.keys(byTopic).length} topic files`);
}
