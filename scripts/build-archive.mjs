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

// ─── Static lookups ───────────────────────────────────────────────────
// Hand-curated mappings that the Ergast CSVs don't carry — keep small.

// Nationality → { country (ISO 3166-1 alpha-2), flag (emoji) }. Covers every
// nationality that's appeared in F1 since 1950. Unknown values fall back to
// a white flag.
const NATIONALITY = {
  'American': { country: 'US', flag: '🇺🇸' },
  'American-Italian': { country: 'US', flag: '🇺🇸' },
  'Argentine': { country: 'AR', flag: '🇦🇷' },
  'Argentine-Italian': { country: 'AR', flag: '🇦🇷' },
  'Argentinian': { country: 'AR', flag: '🇦🇷' },
  'Australian': { country: 'AU', flag: '🇦🇺' },
  'Austrian': { country: 'AT', flag: '🇦🇹' },
  'Belgian': { country: 'BE', flag: '🇧🇪' },
  'Brazilian': { country: 'BR', flag: '🇧🇷' },
  'British': { country: 'GB', flag: '🇬🇧' },
  'Canadian': { country: 'CA', flag: '🇨🇦' },
  'Chilean': { country: 'CL', flag: '🇨🇱' },
  'Chinese': { country: 'CN', flag: '🇨🇳' },
  'Colombian': { country: 'CO', flag: '🇨🇴' },
  'Czech': { country: 'CZ', flag: '🇨🇿' },
  'Danish': { country: 'DK', flag: '🇩🇰' },
  'Dutch': { country: 'NL', flag: '🇳🇱' },
  'East German': { country: 'DE', flag: '🇩🇪' },
  'Finnish': { country: 'FI', flag: '🇫🇮' },
  'French': { country: 'FR', flag: '🇫🇷' },
  'German': { country: 'DE', flag: '🇩🇪' },
  'Hungarian': { country: 'HU', flag: '🇭🇺' },
  'Indian': { country: 'IN', flag: '🇮🇳' },
  'Indonesian': { country: 'ID', flag: '🇮🇩' },
  'Irish': { country: 'IE', flag: '🇮🇪' },
  'Italian': { country: 'IT', flag: '🇮🇹' },
  'Japanese': { country: 'JP', flag: '🇯🇵' },
  'Liechtensteiner': { country: 'LI', flag: '🇱🇮' },
  'Malaysian': { country: 'MY', flag: '🇲🇾' },
  'Mexican': { country: 'MX', flag: '🇲🇽' },
  'Monegasque': { country: 'MC', flag: '🇲🇨' },
  'New Zealander': { country: 'NZ', flag: '🇳🇿' },
  'Polish': { country: 'PL', flag: '🇵🇱' },
  'Portuguese': { country: 'PT', flag: '🇵🇹' },
  'Rhodesian': { country: 'ZW', flag: '🇿🇼' },
  'Russian': { country: 'RU', flag: '🇷🇺' },
  'South African': { country: 'ZA', flag: '🇿🇦' },
  'Spanish': { country: 'ES', flag: '🇪🇸' },
  'Swedish': { country: 'SE', flag: '🇸🇪' },
  'Swiss': { country: 'CH', flag: '🇨🇭' },
  'Thai': { country: 'TH', flag: '🇹🇭' },
  'Uruguayan': { country: 'UY', flag: '🇺🇾' },
  'Venezuelan': { country: 'VE', flag: '🇻🇪' },
};

// Constructor → team color (hex). Active modern teams use their canonical
// livery; historic teams default to grey. Display only — doesn't block render.
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

function natInfo(nationality) {
  if (!nationality) return { country: '', flag: '🏳' };
  const trimmed = nationality.trim();
  return NATIONALITY[trimmed] || { country: '', flag: '🏳' };
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

// ─── Per-year season bundles ─────────────────────────────────────────────
// Generate /public/data/<year>.json for years that don't already have a
// hand-curated bundle (2020–2025 are kept untouched; they have richer
// session schedules + circuit metadata than the CSVs carry). Listing-page
// islands fetch /data/<year>.json on year-picker click; without these
// generated bundles, anything pre-2020 silently falls back to the 2026
// fallback, which makes the year picker mostly cosmetic for old seasons.

const SEASONS_OUT = join(ROOT, 'public', 'data');
const driversById = new Map(drivers.map(d => [d.driverId, d]));
const circuits = readCsv('circuits');
const circuitsById = new Map(circuits.map(c => [c.circuitId, c]));

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

const allYears = [...racesByYear.keys()].sort((a, b) => a - b);
let seasonsWritten = 0, seasonsSkipped = 0;

for (const year of allYears) {
  const outPath = join(SEASONS_OUT, `${year}.json`);
  if (existsSync(outPath)) { seasonsSkipped++; continue; }

  const yearRaces = racesByYear.get(year).slice().sort((a, b) => toInt(a.round) - toInt(b.round));

  // Drivers who raced this year — derived from results, not from the global
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
      // `id` must be unique within a season — used as the key in
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

    resultsObj[round] = { pole, fastest, order, grid, dnfs };
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

  // Race results — sorted by positionOrder (handles DNFs, finished-by-laps, etc.)
  const raceResultsRaw = (resultsByRace.get(race.raceId) || []).slice()
    .sort((a, b) => (toInt(a.positionOrder) || 9999) - (toInt(b.positionOrder) || 9999));
  const raceResults = raceResultsRaw.map(buildResultRow);

  // Qualifying — sorted by position
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
  racesIndex.push({ year, round, name: race.name, date: race.date, circuitRef: circuit ? circuit.circuitRef : null });
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

// circuits.csv uses numeric circuitId; bundles use circuitRef slugs — build a ref map
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
  racesIndex.push({ year: bYear, round, name: calEntry.name, date: calEntry.date || null, circuitRef: circuitId });
  bundleRacesWritten++;
}

if (allBundleRounds.length > 0) {
  writeFileSync(join(OUT, '_races-index.json'), JSON.stringify(racesIndex));
  console.log(`[archive] +${bundleRacesWritten} bundle race detail bundles (${bundleYears.join(', ')})`);
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
    return {
      year: toInt(race.year),
      round: toInt(race.round),
      name: race.name,
      date: race.date,
      winnerRef: refOf(winnerRow),
      winnerName: nameOf(winnerRow),
      winnerTeam: teamOf(winnerRow),
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
    const refRaw = race.circuit || race.circuitId;
    if (!refRaw) continue;
    const cref = HAND_CIRCUIT_ALIAS[refRaw] || refRaw;
    const circuitJsonPath = join(OUT, 'circuits', `${cref}.json`);
    if (!existsSync(circuitJsonPath)) continue;

    const doc = JSON.parse(readFileSync(circuitJsonPath, 'utf8'));
    // Skip if this race is already present (idempotent re-runs)
    if (doc.races.some(r => r.year === year && r.round === race.round)) continue;

    const result = season.results && season.results[race.round];
    let winnerRef = null, poleRef = null, fastestRef = null;
    let winnerName = null, poleName = null, winnerTeam = null;
    if (result) {
      const winnerId = result.order?.[0];
      const poleId = result.pole;
      const fastestId = result.fastest;
      const driverByCode = (id) => season.drivers?.find(d => d.id === id || d.jolpicaId === id);
      const teamByDriverCode = (id) => {
        const d = driverByCode(id);
        if (!d) return null;
        const t = season.teams?.find(t => t.id === d.team);
        return t ? t.name : null;
      };
      const refOf = (id) => driverByCode(id)?.jolpicaId || null;
      const nameOf = (id) => {
        const d = driverByCode(id);
        return d ? `${d.first} ${d.last}` : null;
      };
      winnerRef = refOf(winnerId); winnerName = nameOf(winnerId); winnerTeam = teamByDriverCode(winnerId);
      poleRef = refOf(poleId); poleName = nameOf(poleId);
      fastestRef = refOf(fastestId);
    }

    doc.races.unshift({
      year,
      round: race.round,
      name: race.name,
      date: race.date,
      winnerRef, winnerName, winnerTeam,
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
// Same idea as the circuit merge above — open each driver JSON, append
// per-race entries from the hand-curated 2025+ bundles, then refresh
// career totals and per-season rollups so the driver pages don't stop at
// the Ergast 2024 cutoff. Championships stay as Ergast computed them
// (final-standing data isn't available for in-progress seasons).

// Bundle team ids → Ergast constructorRef. Buildfallback uses short
// slugs; Ergast uses longer ones in a few cases. Brand-new manufacturers
// (audi, cadillac) don't have Ergast entries yet — pass through their
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
  // No Ergast row for this driver — they debuted post-2024. Synthesize a
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
    const codes = new Set([...order, ...Object.keys(detail)]);

    for (const code of codes) {
      const d = driverByCode.get(code);
      if (!d) continue;
      const doc = loadDriverDoc(d.jolpicaId, d);
      if (!doc) continue;
      // Idempotent re-runs: skip if this race is already merged
      if (doc.perRace.some(r => r.year === year && r.round === round)) continue;

      const det = detail[code] || {};
      const team = teamById.get(d.team);
      const constructorRef = HAND_CONSTRUCTOR_ALIAS[d.team] || d.team || null;
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
        constructorId: null,
        constructorRef,
        constructorName,
        grid,
        position: positionNum,
        positionText,
        positionOrder: positionNum,
        points: toFloat(det.points) || 0,
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

// Pre-compute championship standings per bundle year by summing race points.
// Used below to fill position for post-Ergast perSeason rows instead of null.
const bundleStandings = new Map(); // year → Map<driverRef, champPosition>
for (const { year, path } of seasonFiles) {
  const season = JSON.parse(readFileSync(path, 'utf8'));
  if (!season.results) continue;
  const driverByCode = new Map();
  for (const d of season.drivers || []) {
    if (d.id && d.jolpicaId) driverByCode.set(d.id, d);
  }
  const totals = new Map(); // driverRef → totalPoints
  for (const rData of Object.values(season.results)) {
    for (const [code, det] of Object.entries(rData.detail || {})) {
      const d = driverByCode.get(code);
      if (!d) continue;
      const pts = parseFloat(det.points) || 0;
      totals.set(d.jolpicaId, (totals.get(d.jolpicaId) || 0) + pts);
    }
  }
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const posMap = new Map(sorted.map(([ref], i) => [ref, i + 1]));
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
      // Year was in Ergast — preserve final-standing rank and points.
      return { ...existing, races: rows.length, bestFinish, wins: seasonWins };
    }
    // Post-Ergast year — sum points from per-race detail; derive position
    // from bundleStandings (computed above from race result points totals).
    return {
      year,
      constructorRef: primaryRef,
      constructorName: primaryName,
      position: bundleStandings.get(year)?.get(driverRef) ?? null,
      points: rows.reduce((s, r) => s + (r.points || 0), 0),
      wins: seasonWins,
      races: rows.length,
      bestFinish,
    };
  }).sort((a, b) => b.year - a.year);

  writeFileSync(join(OUT, 'drivers', `${driverRef}.json`), JSON.stringify(doc));

  if (newlyCreatedDrivers.has(driverRef)) {
    // First time we've seen this driver — give them an index entry so
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

const constructorStandings = readCsv('constructor_standings');
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

  // Constructors' championships — final-round position === 1 in each year's standings
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
          return {
            driverRef: d.driverRef,
            name: `${d.forename} ${d.surname}`,
            code: deriveCode(d),
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
      return {
        driverRef: d.driverRef,
        name: `${d.forename} ${d.surname}`,
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
