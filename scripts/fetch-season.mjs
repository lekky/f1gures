// Fetch a complete F1 season from the Jolpica API and write it as a static
// JSON bundle under data/<year>.json. Once saved, api.js will load the local
// file instead of hitting the network for that year.
//
// Usage:
//   node scripts/fetch-season.mjs 2024
//   node scripts/fetch-season.mjs 2023
//
// Requires Node 18+ (native fetch). Add --no-warnings if you see ESM warnings.

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://api.jolpi.ca/ergast/f1';

const year = process.argv[2];
if (!year || !/^\d{4}$/.test(year)) {
  console.error('Usage: node scripts/fetch-season.mjs <year>   e.g. 2024');
  process.exit(1);
}

// ── ID / flag maps (mirrors of api.js) ───────────────────────
const TEAM_ID_MAP = {
  mclaren: 'mclaren', ferrari: 'ferrari', mercedes: 'mercedes',
  red_bull: 'redbull', aston_martin: 'aston', alpine: 'alpine',
  williams: 'williams', rb: 'rb', racing_bulls: 'rb',
  sauber: 'sauber', haas: 'haas',
};
const TEAM_COLORS = {
  mclaren: '#FF8000', ferrari: '#E80020', mercedes: '#27F4D2',
  redbull: '#3671C6', aston: '#229971',   alpine: '#0093CC',
  williams: '#64C4FF', rb: '#6692FF',     sauber: '#52E252', haas: '#B6BABD',
};
const TEAM_SHORT = {
  mclaren: 'MCL', ferrari: 'FER', mercedes: 'MER', redbull: 'RBR',
  aston: 'AST',   alpine: 'ALP', williams: 'WIL', rb: 'RBL',
  sauber: 'SAU',  haas: 'HAA',
};
const COUNTRY_BY_NATIONALITY = {
  'British': 'GB', 'Dutch': 'NL', 'Spanish': 'ES', 'Monégasque': 'MC',
  'Monegasque': 'MC', 'French': 'FR', 'German': 'DE', 'Italian': 'IT',
  'Australian': 'AU', 'Japanese': 'JP', 'American': 'US', 'Canadian': 'CA',
  'Mexican': 'MX', 'Brazilian': 'BR', 'Finnish': 'FI', 'Danish': 'DK',
  'Thai': 'TH', 'Chinese': 'CN', 'New Zealander': 'NZ', 'Argentine': 'AR',
  'Belgian': 'BE', 'Polish': 'PL', 'Russian': 'RU', 'Swiss': 'CH', 'Austrian': 'AT',
};
const FLAG_BY_COUNTRY = {
  GB:'🇬🇧', NL:'🇳🇱', ES:'🇪🇸', MC:'🇲🇨', FR:'🇫🇷', DE:'🇩🇪', IT:'🇮🇹',
  AU:'🇦🇺', JP:'🇯🇵', US:'🇺🇸', CA:'🇨🇦', MX:'🇲🇽', BR:'🇧🇷', FI:'🇫🇮',
  DK:'🇩🇰', TH:'🇹🇭', CN:'🇨🇳', NZ:'🇳🇿', AR:'🇦🇷', BE:'🇧🇪', PL:'🇵🇱',
  RU:'🇷🇺', CH:'🇨🇭', AT:'🇦🇹', BH:'🇧🇭', SA:'🇸🇦', AZ:'🇦🇿', SG:'🇸🇬',
  AE:'🇦🇪', QA:'🇶🇦', HU:'🇭🇺',
};
const ISO_BY_COUNTRY_NAME = {
  'Bahrain':'BH', 'Saudi Arabia':'SA', 'Australia':'AU', 'Japan':'JP',
  'China':'CN', 'United States':'US', 'USA':'US', 'Italy':'IT', 'Monaco':'MC',
  'Spain':'ES', 'Canada':'CA', 'Austria':'AT', 'United Kingdom':'GB', 'UK':'GB',
  'Belgium':'BE', 'Hungary':'HU', 'Netherlands':'NL', 'Azerbaijan':'AZ',
  'Singapore':'SG', 'Mexico':'MX', 'Brazil':'BR', 'Qatar':'QA',
  'United Arab Emirates':'AE', 'UAE':'AE',
};
const CIRCUIT_ID_ALIASES = {
  bahrain:'bahrain', jeddah:'jeddah', albert_park:'albert', suzuka:'suzuka',
  shanghai:'shanghai', miami:'miami', imola:'imola', monaco:'monaco',
  catalunya:'catalunya', villeneuve:'montreal', red_bull_ring:'spielberg',
  silverstone:'silverstone', spa:'spa', hungaroring:'hungaroring',
  zandvoort:'zandvoort', monza:'monza', baku:'baku', marina_bay:'marina',
  americas:'cota', rodriguez:'rodriguez', interlagos:'interlagos',
  vegas:'lasvegas', losail:'losail', yas_marina:'yas',
};

// ── Reshape helpers (same logic as api.js) ────────────────────
function driverCode(d) {
  if (d.code) return d.code;
  const src = d.familyName || d.driverId || 'XXX';
  return src.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3) || 'XXX';
}

function reshapeDrivers(driversData, teamByCode) {
  return driversData.MRData.DriverTable.Drivers.map(d => {
    const cc = COUNTRY_BY_NATIONALITY[d.nationality] || '';
    const code = driverCode(d);
    return {
      id: code, jolpicaId: d.driverId,
      num: parseInt(d.permanentNumber, 10) || 0,
      first: d.givenName, last: d.familyName, code,
      country: cc, flag: FLAG_BY_COUNTRY[cc] || '🏳',
      team: teamByCode[code] || '',
      nationality: d.nationality, dateOfBirth: d.dateOfBirth,
    };
  });
}

function reshapeTeams(constructorsData) {
  return constructorsData.MRData.ConstructorTable.Constructors.map(c => {
    const ourId = TEAM_ID_MAP[c.constructorId] || c.constructorId;
    return {
      id: ourId, jolpicaId: c.constructorId, name: c.name,
      short: TEAM_SHORT[ourId] || c.name.slice(0, 3).toUpperCase(),
      color: TEAM_COLORS[ourId] || '#888888',
      nationality: c.nationality,
    };
  });
}

function buildCircuitsFromSchedule(scheduleData) {
  const out = {};
  scheduleData.MRData.RaceTable.Races.forEach(r => {
    const key = CIRCUIT_ID_ALIASES[r.Circuit.circuitId] || r.Circuit.circuitId;
    if (out[key]) return;
    const loc = r.Circuit.Location || {};
    out[key] = {
      name: r.Circuit.circuitName || r.Circuit.circuitId,
      city: loc.locality || '—', country: loc.country || '—',
      firstYear: 0, races: 0, length: 0, laps: 0, corners: 0,
      longestStraight: 0, drsZones: 0, type: '—', tyreDeg: '—',
      overtaking: '—', weather: '—',
      lapRecord: { driver: '—', time: '—', year: 0 }, blurb: '',
    };
  });
  return out;
}

function reshapeCalendar(scheduleData) {
  return scheduleData.MRData.RaceTable.Races.map(r => {
    const round = parseInt(r.round, 10);
    const circuitKey = CIRCUIT_ID_ALIASES[r.Circuit.circuitId] || r.Circuit.circuitId;
    const cc = ISO_BY_COUNTRY_NAME[r.Circuit.Location.country] || '';
    return {
      round, name: r.raceName, circuit: circuitKey,
      circuitId: r.Circuit.circuitId, country: cc,
      flag: FLAG_BY_COUNTRY[cc] || '🏳', date: r.date, time: r.time || null,
      sprint: !!r.Sprint, status: 'completed',
      sessions: {
        fp1: r.FirstPractice || null, fp2: r.SecondPractice || null,
        fp3: r.ThirdPractice || null, q: r.Qualifying || null,
        sprint: r.Sprint || null, sprintQuali: r.SprintQualifying || null,
        race: r.date ? { date: r.date, time: r.time || null } : null,
      },
    };
  }).sort((a, b) => a.round - b.round);
}

function reshapeRaceResults(raceTable) {
  const races = raceTable.MRData.RaceTable.Races;
  if (!races?.length || !races[0].Results?.length) return null;
  const sorted = races[0].Results.slice().sort((a, b) => {
    const ap = parseInt(a.position, 10), bp = parseInt(b.position, 10);
    return (isNaN(ap) ? 99 : ap) - (isNaN(bp) ? 99 : bp);
  });
  const detail = {};
  sorted.forEach(r => {
    detail[driverCode(r.Driver)] = {
      position: r.positionText, grid: parseInt(r.grid, 10) || null,
      points: parseFloat(r.points) || 0, laps: parseInt(r.laps, 10) || null,
      status: r.status, time: r.Time?.time || null,
      fastestLap: r.FastestLap?.Time?.time || null,
      fastestLapNumber: r.FastestLap ? parseInt(r.FastestLap.lap, 10) : null,
    };
  });
  const polesitter = sorted.find(r => parseInt(r.grid, 10) === 1);
  const fastestLap = sorted.find(r => r.FastestLap?.rank === '1');
  return {
    pole: polesitter ? driverCode(polesitter.Driver) : null,
    fastest: fastestLap ? driverCode(fastestLap.Driver) : null,
    order: sorted.map(r => driverCode(r.Driver)),
    grid: sorted.slice().sort((a, b) => parseInt(a.grid,10) - parseInt(b.grid,10)).map(r => driverCode(r.Driver)),
    dnfs: sorted.filter(r => r.positionText === 'R' || r.positionText === 'D').map(r => driverCode(r.Driver)),
    detail,
  };
}

function reshapeQualifying(raceTable) {
  const races = raceTable.MRData.RaceTable.Races;
  if (!races?.length || !races[0].QualifyingResults?.length) return null;
  const out = {};
  races[0].QualifyingResults.forEach(q => {
    out[driverCode(q.Driver)] = {
      q1: q.Q1 || null, q2: q.Q2 || null, q3: q.Q3 || null,
      position: parseInt(q.position, 10) || null,
    };
  });
  return out;
}

function reshapeSprint(raceTable) {
  const races = raceTable.MRData.RaceTable.Races;
  if (!races?.length || !races[0].SprintResults?.length) return null;
  const sorted = races[0].SprintResults.slice().sort((a, b) => parseInt(a.position,10) - parseInt(b.position,10));
  const detail = {};
  sorted.forEach(r => {
    detail[driverCode(r.Driver)] = {
      position: r.positionText, grid: parseInt(r.grid,10) || null,
      points: parseFloat(r.points) || 0, time: r.Time?.time || null, status: r.status,
    };
  });
  return { winner: driverCode(sorted[0].Driver), order: sorted.map(r => driverCode(r.Driver)), detail };
}

// ── HTTP helper ───────────────────────────────────────────────
async function get(path) {
  process.stdout.write(`  GET ${path} ... `);
  const res = await fetch(BASE + path, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  console.log('ok');
  return json;
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log(`\nFetching ${year} season from Jolpica...\n`);

  const scheduleData = await get(`/${year}/?limit=100`);
  const [driversData, constructorsData, standingsData] = await Promise.all([
    get(`/${year}/drivers/?limit=100`),
    get(`/${year}/constructors/?limit=100`),
    get(`/${year}/driverstandings/?limit=100`),
  ]);

  const seasonYear = scheduleData.MRData.RaceTable.season;
  const calendarRaw = reshapeCalendar(scheduleData);
  const circuitsFromAPI = buildCircuitsFromSchedule(scheduleData);

  const standingsList0 = standingsData.MRData.StandingsTable.StandingsLists[0];
  const lastCompletedRound = standingsList0 ? parseInt(standingsList0.round, 10) : 0;
  const todayISO = new Date().toISOString().slice(0, 10);
  const completedRounds = calendarRaw
    .filter(r => r.date < todayISO && r.round <= lastCompletedRound)
    .map(r => r.round);

  console.log(`\n${completedRounds.length} completed rounds to fetch...\n`);

  const resultsByRound = {};
  for (const round of completedRounds) {
    resultsByRound[round] = {};
    try {
      const r = reshapeRaceResults(await get(`/${year}/${round}/results/`));
      if (r) Object.assign(resultsByRound[round], r);
    } catch (e) { console.warn(`  ⚠ round ${round} race: ${e.message}`); }

    try {
      const q = reshapeQualifying(await get(`/${year}/${round}/qualifying/`));
      if (q) resultsByRound[round].quali = q;
    } catch (e) { console.warn(`  ⚠ round ${round} quali: ${e.message}`); }

    if (calendarRaw.find(r => r.round === round && r.sprint)) {
      try {
        const s = reshapeSprint(await get(`/${year}/${round}/sprint/`));
        if (s) { resultsByRound[round].sprintWinner = s.winner; resultsByRound[round].sprintResults = s; }
      } catch (e) { console.warn(`  ⚠ round ${round} sprint: ${e.message}`); }
    }

    await new Promise(r => setTimeout(r, 150)); // be gentle with the API
  }

  const results = {};
  Object.keys(resultsByRound).forEach(k => {
    if (resultsByRound[k].order?.length) results[k] = resultsByRound[k];
  });

  // Driver → team mapping from standings
  const teamByCode = {};
  (standingsList0?.DriverStandings || []).forEach(ds => {
    const code = driverCode(ds.Driver);
    const c = ds.Constructors?.[ds.Constructors.length - 1];
    if (c) teamByCode[code] = TEAM_ID_MAP[c.constructorId] || c.constructorId;
  });

  const drivers = reshapeDrivers(driversData, teamByCode);
  const teams = reshapeTeams(constructorsData);

  const bundle = { seasonYear, teams, drivers, calendar: calendarRaw, results, circuitsFromAPI };

  mkdirSync(join(ROOT, 'data'), { recursive: true });
  const outPath = join(ROOT, 'data', `${year}.json`);
  writeFileSync(outPath, JSON.stringify(bundle));

  const kb = Math.round(Buffer.byteLength(JSON.stringify(bundle)) / 1024);
  console.log(`\n✓  data/${year}.json  (${kb} KB, ${Object.keys(results).length}/${completedRounds.length} rounds)\n`);
}

main().catch(e => { console.error('\n✗', e.message); process.exit(1); });
