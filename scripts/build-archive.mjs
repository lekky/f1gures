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
