// f1gures - 2026 season data (speculative / illustrative)
// Note: this is fan-made fictional data for design purposes.

import { circuitProfiles } from './circuitProfiles.js';

export function buildFallback() {

  const teams = [
    { id: 'mclaren',  name: 'McLaren',          short: 'MCL', color: '#FF8000' },
    { id: 'ferrari',  name: 'Ferrari',          short: 'FER', color: '#E80020' },
    { id: 'mercedes', name: 'Mercedes',         short: 'MER', color: '#27F4D2' },
    { id: 'redbull',  name: 'Red Bull Racing',  short: 'RBR', color: '#3671C6' },
    { id: 'aston',    name: 'Aston Martin',     short: 'AST', color: '#229971' },
    { id: 'alpine',   name: 'Alpine',           short: 'ALP', color: '#0093CC' },
    { id: 'williams', name: 'Williams',         short: 'WIL', color: '#64C4FF' },
    { id: 'rb',       name: 'Racing Bulls',     short: 'RBL', color: '#6692FF' },
    { id: 'sauber',   name: 'Kick Sauber',      short: 'SAU', color: '#52E252' },
    { id: 'haas',     name: 'Haas',             short: 'HAA', color: '#B6BABD' },
  ];

  // Drivers - 2026 speculative grid. Names/numbers are illustrative.
  // jolpicaId matches Jolpica/Ergast's driverId - used by api.js to fetch live
  // career stats. Keep in sync if a driver is added/replaced.
  const drivers = [
    { id: 'NOR', num: 4,  first: 'Lando',     last: 'Norris',     code: 'NOR', country: 'GB',  flag: '🇬🇧', team: 'mclaren',  jolpicaId: 'norris'         },
    { id: 'PIA', num: 81, first: 'Oscar',     last: 'Piastri',    code: 'PIA', country: 'AU',  flag: '🇦🇺', team: 'mclaren',  jolpicaId: 'piastri'        },
    { id: 'LEC', num: 16, first: 'Charles',   last: 'Leclerc',    code: 'LEC', country: 'MC',  flag: '🇲🇨', team: 'ferrari',  jolpicaId: 'leclerc'        },
    { id: 'HAM', num: 44, first: 'Lewis',     last: 'Hamilton',   code: 'HAM', country: 'GB',  flag: '🇬🇧', team: 'ferrari',  jolpicaId: 'hamilton'       },
    { id: 'RUS', num: 63, first: 'George',    last: 'Russell',    code: 'RUS', country: 'GB',  flag: '🇬🇧', team: 'mercedes', jolpicaId: 'russell'        },
    { id: 'ANT', num: 12, first: 'Andrea K.', last: 'Antonelli',  code: 'ANT', country: 'IT',  flag: '🇮🇹', team: 'mercedes', jolpicaId: 'antonelli'      },
    { id: 'VER', num: 1,  first: 'Max',       last: 'Verstappen', code: 'VER', country: 'NL',  flag: '🇳🇱', team: 'redbull',  jolpicaId: 'max_verstappen' },
    { id: 'TSU', num: 22, first: 'Yuki',      last: 'Tsunoda',    code: 'TSU', country: 'JP',  flag: '🇯🇵', team: 'redbull',  jolpicaId: 'tsunoda'        },
    { id: 'ALO', num: 14, first: 'Fernando',  last: 'Alonso',     code: 'ALO', country: 'ES',  flag: '🇪🇸', team: 'aston',    jolpicaId: 'alonso'         },
    { id: 'STR', num: 18, first: 'Lance',     last: 'Stroll',     code: 'STR', country: 'CA',  flag: '🇨🇦', team: 'aston',    jolpicaId: 'stroll'         },
    { id: 'GAS', num: 10, first: 'Pierre',    last: 'Gasly',      code: 'GAS', country: 'FR',  flag: '🇫🇷', team: 'alpine',   jolpicaId: 'gasly'          },
    { id: 'DOO', num: 7,  first: 'Jack',      last: 'Doohan',     code: 'DOO', country: 'AU',  flag: '🇦🇺', team: 'alpine',   jolpicaId: 'doohan'         },
    { id: 'ALB', num: 23, first: 'Alex',      last: 'Albon',      code: 'ALB', country: 'TH',  flag: '🇹🇭', team: 'williams', jolpicaId: 'albon'          },
    { id: 'SAI', num: 55, first: 'Carlos',    last: 'Sainz',      code: 'SAI', country: 'ES',  flag: '🇪🇸', team: 'williams', jolpicaId: 'sainz'          },
    { id: 'LAW', num: 30, first: 'Liam',      last: 'Lawson',     code: 'LAW', country: 'NZ',  flag: '🇳🇿', team: 'rb',       jolpicaId: 'lawson'         },
    { id: 'HAD', num: 6,  first: 'Isack',     last: 'Hadjar',     code: 'HAD', country: 'FR',  flag: '🇫🇷', team: 'rb',       jolpicaId: 'hadjar'         },
    { id: 'HUL', num: 27, first: 'Nico',      last: 'Hülkenberg', code: 'HUL', country: 'DE',  flag: '🇩🇪', team: 'sauber',   jolpicaId: 'hulkenberg'     },
    { id: 'BOR', num: 5,  first: 'Gabriel',   last: 'Bortoleto',  code: 'BOR', country: 'BR',  flag: '🇧🇷', team: 'sauber',   jolpicaId: 'bortoleto'      },
    { id: 'OCO', num: 31, first: 'Esteban',   last: 'Ocon',       code: 'OCO', country: 'FR',  flag: '🇫🇷', team: 'haas',     jolpicaId: 'ocon'           },
    { id: 'BEA', num: 87, first: 'Oliver',    last: 'Bearman',    code: 'BEA', country: 'GB',  flag: '🇬🇧', team: 'haas',     jolpicaId: 'bearman'        },
  ];

  // 2026 calendar - partial set, 24 rounds. First 6 completed.
  const calendar = [
    { round: 1,  name: 'Bahrain Grand Prix',        circuit: 'bahrain',   country: 'BH', flag: '🇧🇭', date: '2026-03-08', sprint: false, status: 'completed' },
    { round: 2,  name: 'Saudi Arabian Grand Prix',  circuit: 'jeddah',    country: 'SA', flag: '🇸🇦', date: '2026-03-15', sprint: false, status: 'completed' },
    { round: 3,  name: 'Australian Grand Prix',     circuit: 'albert',    country: 'AU', flag: '🇦🇺', date: '2026-03-29', sprint: false, status: 'completed' },
    { round: 4,  name: 'Japanese Grand Prix',       circuit: 'suzuka',    country: 'JP', flag: '🇯🇵', date: '2026-04-12', sprint: false, status: 'completed' },
    { round: 5,  name: 'Chinese Grand Prix',        circuit: 'shanghai',  country: 'CN', flag: '🇨🇳', date: '2026-04-19', sprint: true,  status: 'completed' },
    { round: 6,  name: 'Miami Grand Prix',          circuit: 'miami',     country: 'US', flag: '🇺🇸', date: '2026-05-03', sprint: true,  status: 'completed' },
    { round: 7,  name: 'Emilia Romagna Grand Prix', circuit: 'imola',     country: 'IT', flag: '🇮🇹', date: '2026-05-17', sprint: false, status: 'next' },
    { round: 8,  name: 'Monaco Grand Prix',         circuit: 'monaco',    country: 'MC', flag: '🇲🇨', date: '2026-05-24', sprint: false, status: 'upcoming' },
    { round: 9,  name: 'Spanish Grand Prix',        circuit: 'catalunya', country: 'ES', flag: '🇪🇸', date: '2026-06-07', sprint: false, status: 'upcoming' },
    { round: 10, name: 'Canadian Grand Prix',       circuit: 'montreal',  country: 'CA', flag: '🇨🇦', date: '2026-06-14', sprint: false, status: 'upcoming' },
    { round: 11, name: 'Austrian Grand Prix',       circuit: 'spielberg', country: 'AT', flag: '🇦🇹', date: '2026-06-28', sprint: true,  status: 'upcoming' },
    { round: 12, name: 'British Grand Prix',        circuit: 'silverstone', country: 'GB', flag: '🇬🇧', date: '2026-07-05', sprint: false, status: 'upcoming' },
    { round: 13, name: 'Belgian Grand Prix',        circuit: 'spa',       country: 'BE', flag: '🇧🇪', date: '2026-07-26', sprint: true,  status: 'upcoming' },
    { round: 14, name: 'Hungarian Grand Prix',      circuit: 'hungaroring', country: 'HU', flag: '🇭🇺', date: '2026-08-02', sprint: false, status: 'upcoming' },
    { round: 15, name: 'Dutch Grand Prix',          circuit: 'zandvoort', country: 'NL', flag: '🇳🇱', date: '2026-08-23', sprint: false, status: 'upcoming' },
    { round: 16, name: 'Italian Grand Prix',        circuit: 'monza',     country: 'IT', flag: '🇮🇹', date: '2026-09-06', sprint: false, status: 'upcoming' },
    { round: 17, name: 'Azerbaijan Grand Prix',     circuit: 'baku',      country: 'AZ', flag: '🇦🇿', date: '2026-09-20', sprint: false, status: 'upcoming' },
    { round: 18, name: 'Singapore Grand Prix',      circuit: 'marina',    country: 'SG', flag: '🇸🇬', date: '2026-10-04', sprint: false, status: 'upcoming' },
    { round: 19, name: 'United States Grand Prix',  circuit: 'cota',      country: 'US', flag: '🇺🇸', date: '2026-10-25', sprint: true,  status: 'upcoming' },
    { round: 20, name: 'Mexico City Grand Prix',    circuit: 'rodriguez', country: 'MX', flag: '🇲🇽', date: '2026-11-01', sprint: false, status: 'upcoming' },
    { round: 21, name: 'São Paulo Grand Prix',      circuit: 'interlagos', country: 'BR', flag: '🇧🇷', date: '2026-11-08', sprint: true,  status: 'upcoming' },
    { round: 22, name: 'Las Vegas Grand Prix',      circuit: 'lasvegas',  country: 'US', flag: '🇺🇸', date: '2026-11-21', sprint: false, status: 'upcoming' },
    { round: 23, name: 'Qatar Grand Prix',          circuit: 'losail',    country: 'QA', flag: '🇶🇦', date: '2026-11-29', sprint: true,  status: 'upcoming' },
    { round: 24, name: 'Abu Dhabi Grand Prix',      circuit: 'yas',       country: 'AE', flag: '🇦🇪', date: '2026-12-06', sprint: false, status: 'upcoming' },
  ];

  // Circuit details - hand-curated metadata (length, corners, lapRecord,
  // blurb). Sourced from src/data/circuitProfiles.js so the same data is
  // shared with CircuitPage.astro without round-tripping through this
  // function. Keep the local `circuits` name so existing usages below
  // (computeStandings, screens) don't change shape.
  const circuits = circuitProfiles;

  // Helper for points: 25/18/15/12/10/8/6/4/2/1
  const POINTS = [25,18,15,12,10,8,6,4,2,1];

  // Race results - completed rounds only.
  // Each entry: round, polesitter (driver code), fastestLap (driver), winner (driver), order (driver codes p1..p20), grid (driver codes start order), dnfs ['XYZ'], q (qualifying times), sprintWinner
  const results = {
    1: { // Bahrain
      pole: 'NOR', fastest: 'PIA',
      order: ['NOR','PIA','VER','LEC','RUS','HAM','ANT','ALO','SAI','TSU','ALB','HAD','GAS','BEA','HUL','OCO','LAW','BOR','STR','DOO'],
      grid:  ['NOR','PIA','VER','LEC','RUS','HAM','ANT','SAI','ALO','TSU','HAD','ALB','GAS','HUL','BEA','OCO','LAW','BOR','DOO','STR'],
      dnfs: [],
    },
    2: { // Jeddah
      pole: 'PIA', fastest: 'NOR',
      order: ['PIA','NOR','LEC','VER','HAM','RUS','ANT','SAI','ALB','TSU','ALO','GAS','HAD','LAW','HUL','BEA','BOR','OCO','DOO','STR'],
      grid:  ['PIA','VER','LEC','NOR','HAM','RUS','SAI','ALB','ANT','ALO','TSU','GAS','HAD','BEA','HUL','LAW','OCO','BOR','STR','DOO'],
      dnfs: [],
    },
    3: { // Australia
      pole: 'NOR', fastest: 'VER',
      order: ['VER','NOR','PIA','LEC','HAM','RUS','ANT','ALO','SAI','GAS','TSU','ALB','HUL','HAD','BEA','LAW','BOR','OCO','DOO','STR'],
      grid:  ['NOR','PIA','VER','LEC','HAM','RUS','ANT','ALO','SAI','GAS','TSU','ALB','HAD','HUL','BEA','LAW','OCO','BOR','DOO','STR'],
      dnfs: [],
    },
    4: { // Japan
      pole: 'VER', fastest: 'LEC',
      order: ['VER','PIA','NOR','LEC','HAM','RUS','ANT','TSU','ALB','SAI','ALO','GAS','HAD','BEA','LAW','HUL','BOR','OCO','DOO','STR'],
      grid:  ['VER','NOR','PIA','LEC','HAM','RUS','ANT','TSU','SAI','ALB','GAS','ALO','HAD','BEA','HUL','LAW','BOR','OCO','DOO','STR'],
      dnfs: [],
    },
    5: { // China - Sprint weekend
      pole: 'PIA', fastest: 'NOR',
      sprintWinner: 'NOR',
      order: ['PIA','NOR','LEC','HAM','VER','RUS','ANT','ALO','SAI','ALB','TSU','GAS','HAD','BEA','HUL','LAW','BOR','OCO','DOO','STR'],
      grid:  ['PIA','NOR','LEC','HAM','VER','RUS','ANT','ALO','SAI','ALB','TSU','GAS','HAD','BEA','HUL','LAW','BOR','OCO','STR','DOO'],
      dnfs: [],
    },
    6: { // Miami - Sprint weekend
      pole: 'NOR', fastest: 'PIA',
      sprintWinner: 'PIA',
      order: ['NOR','PIA','VER','LEC','RUS','HAM','ANT','SAI','ALB','ALO','TSU','GAS','HAD','BEA','HUL','LAW','BOR','OCO','STR','DOO'],
      grid:  ['NOR','VER','PIA','LEC','HAM','RUS','ANT','SAI','ALO','ALB','TSU','GAS','HAD','BEA','HUL','OCO','LAW','BOR','DOO','STR'],
      dnfs: [],
    },
  };

  // Generate qualifying times (illustrative). q3 has top 10, q2 top 15, q1 all 20.
  function genQuali(round) {
    const r = results[round];
    if (!r) return null;
    // Pole base time per circuit (rough)
    const baseByRound = { 1: 89.5, 2: 87.2, 3: 75.8, 4: 86.5, 5: 89.9, 6: 87.0 };
    const base = baseByRound[round] || 88.0;
    const grid = r.grid;
    const out = {};
    grid.forEach((code, i) => {
      const q1 = base + 0.6 + i * 0.06 + (Math.random() * 0.05);
      const q2 = i < 15 ? base + 0.25 + i * 0.045 : null;
      const q3 = i < 10 ? base + i * 0.058 : null;
      out[code] = {
        q1: fmtLap(q1),
        q2: q2 != null ? fmtLap(q2) : null,
        q3: q3 != null ? fmtLap(q3) : null,
      };
    });
    return out;
  }

  function fmtLap(secs) {
    const m = Math.floor(secs / 60);
    const s = (secs - m * 60).toFixed(3);
    return `${m}:${s.padStart(6, '0')}`;
  }

  function fmtGap(idx, baseSecs) {
    if (idx === 0) {
      // race time, ~ baseSecs * laps but we'll synthesise
      return `1:32:${(baseSecs % 60).toFixed(3).padStart(6,'0')}`;
    }
    const gap = idx * 1.85 + Math.random() * 1.5 + (idx > 6 ? idx * 0.3 : 0);
    return `+${gap.toFixed(3)}s`;
  }

  // Expose helpers - always return an object so screens don't crash on
  // unknown ids (historic data, transient API states, etc.).
  function driverById(code) {
    return drivers.find(d => d.id === code) ||
      { id: code, code: code || '-', first: '', last: code || 'Unknown', num: 0, flag: '🏳', team: '' };
  }
  function teamById(id) {
    return teams.find(t => t.id === id) ||
      { id: id || 'unknown', name: '-', short: '-', color: '#888888' };
  }

  // Compute season standings from results
  function computeStandings() {
    const driverPts = {};
    const driverWins = {};
    const driverPodiums = {};
    const driverFastest = {};
    const driverPoles = {};
    const driverDnfs = {};
    const lastRoundPos = {}; // for change indicator: position after round N-1

    drivers.forEach(d => {
      driverPts[d.id] = 0;
      driverWins[d.id] = 0;
      driverPodiums[d.id] = 0;
      driverFastest[d.id] = 0;
      driverPoles[d.id] = 0;
      driverDnfs[d.id] = 0;
    });

    const completedRounds = Object.keys(results).map(Number).sort((a,b)=>a-b);
    const lastRound = completedRounds[completedRounds.length - 1];
    const prevRound = completedRounds[completedRounds.length - 2];

    // Snapshots after each round
    const snapshots = {}; // round -> {code: cumPoints}

    completedRounds.forEach(r => {
      const res = results[r];
      res.order.forEach((code, i) => {
        if (i < 10) driverPts[code] += POINTS[i];
        if (i === 0) driverWins[code] += 1;
        if (i < 3) driverPodiums[code] += 1;
      });
      if (res.fastest && res.order.indexOf(res.fastest) < 10) driverPts[res.fastest] += 1;
      driverFastest[res.fastest] = (driverFastest[res.fastest] || 0) + 1;
      driverPoles[res.pole] = (driverPoles[res.pole] || 0) + 1;
      // Sprint points (1-8 -> 8,7,6,5,4,3,2,1) - for simplicity approximate top 4 from race order
      if (res.sprintWinner) {
        const sp = [res.sprintWinner];
        // Add sprint points to winner only for now, and a couple of others
        const sprintPoints = { [res.sprintWinner]: 8 };
        // Take next two from order excluding winner
        const others = res.order.filter(c => c !== res.sprintWinner).slice(0,7);
        others.forEach((c, i) => sprintPoints[c] = 7 - i);
        Object.entries(sprintPoints).forEach(([c, p]) => driverPts[c] += p);
      }
      (res.dnfs || []).forEach(c => driverDnfs[c] += 1);
      snapshots[r] = { ...driverPts };
    });

    // Compute current rankings
    const ranked = drivers.map(d => ({
      driver: d,
      points: driverPts[d.id],
      wins: driverWins[d.id],
      podiums: driverPodiums[d.id],
      fastestLaps: driverFastest[d.id],
      poles: driverPoles[d.id],
      dnfs: driverDnfs[d.id],
    })).sort((a,b) => b.points - a.points || b.wins - a.wins);

    // Compute prev round rankings for change indicator
    const prevPts = prevRound ? snapshots[prevRound] : null;
    const prevRanked = prevPts ? drivers.map(d => ({ id: d.id, points: prevPts[d.id] })).sort((a,b)=>b.points - a.points) : null;
    const prevRankMap = {};
    if (prevRanked) prevRanked.forEach((r, i) => prevRankMap[r.id] = i + 1);

    ranked.forEach((row, i) => {
      row.position = i + 1;
      const prevP = prevRankMap[row.driver.id];
      row.change = prevP ? prevP - row.position : 0;
    });

    // Constructor standings
    const teamPts = {}; const teamWins = {}; const teamPodiums = {};
    teams.forEach(t => { teamPts[t.id] = 0; teamWins[t.id] = 0; teamPodiums[t.id] = 0; });
    ranked.forEach(r => {
      teamPts[r.driver.team] += r.points;
      teamWins[r.driver.team] += r.wins;
      teamPodiums[r.driver.team] += r.podiums;
    });
    const teamRanked = teams.map(t => ({
      team: t,
      points: teamPts[t.id],
      wins: teamWins[t.id],
      podiums: teamPodiums[t.id],
      drivers: drivers.filter(d => d.team === t.id),
    })).sort((a,b)=> b.points - a.points || b.wins - a.wins);
    teamRanked.forEach((t,i) => t.position = i+1);

    // Per-round driver points progression
    const progression = {};
    drivers.forEach(d => progression[d.id] = []);
    completedRounds.forEach(r => {
      drivers.forEach(d => {
        progression[d.id].push({ round: r, points: snapshots[r][d.id] });
      });
    });

    // Per-round team progression
    const teamProgression = {};
    teams.forEach(t => teamProgression[t.id] = []);
    completedRounds.forEach(r => {
      const snap = snapshots[r];
      teams.forEach(t => {
        const pts = drivers.filter(d => d.team === t.id).reduce((sum, d) => sum + (snap[d.id] || 0), 0);
        teamProgression[t.id].push({ round: r, points: pts });
      });
    });

    return { drivers: ranked, teams: teamRanked, progression, teamProgression, completedRounds, lastRound };
  }

  return {
    teams, drivers, calendar, circuits, results, POINTS,
    driverById, teamById, computeStandings, genQuali, fmtLap, fmtGap,
    seasonYear: '2026',
    // Marker so screens can tell live data from bundled fallback.
    _source: 'fallback',
    // Static lookups & helpers that api.js re-uses.
    __statics: {
      circuits,        // hand-curated track characteristics (length, corners, lapRecord, blurb)
      teams,           // for color/short-code mapping when API doesn't have this team
      POINTS,
      fmtLap,
      fmtGap,
    },
    // Raw season payload for the fallback path - same shape api.js produces
    // from Jolpica responses.
    __rawSeason: { teams, drivers, calendar, results },
  };
}

// Build a data object from a /data/<year>.json bundle (same shape as
// scripts/fetch-season.mjs writes). Only the home page's historic view
// (SeasonAtGlance) consumes this currently - other listing pages still
// use buildFallback's 2026 data. PR 2 wires year-aware data more broadly.
//
// Helper closures (driverById/teamById/computeStandings) are duplicated
// from buildFallback above rather than shared, to keep this change low-risk
// to the (working) fallback path. Worth deduplicating in PR 2 / 3.
export function buildFromYearJson(json, staticCircuits = {}) {
  const teams = (json && json.teams) || [];
  const drivers = (json && json.drivers) || [];
  const calendar = (json && json.calendar) || [];
  const results = (json && json.results) || {};
  const seasonYear = (json && json.seasonYear) || '';
  const POINTS = [25,18,15,12,10,8,6,4,2,1];

  function driverById(code) {
    return drivers.find(d => d.id === code) ||
      { id: code, code: code || '-', first: '', last: code || 'Unknown', num: 0, flag: '🏳', team: '' };
  }
  function teamById(id) {
    return teams.find(t => t.id === id) ||
      { id: id || 'unknown', name: '-', short: '-', color: '#888888' };
  }

  function computeStandings() {
    const driverPts = {}, driverWins = {}, driverPodiums = {}, driverFastest = {}, driverPoles = {}, driverDnfs = {};
    drivers.forEach(d => {
      driverPts[d.id] = 0; driverWins[d.id] = 0; driverPodiums[d.id] = 0;
      driverFastest[d.id] = 0; driverPoles[d.id] = 0; driverDnfs[d.id] = 0;
    });
    const completedRounds = Object.keys(results).map(Number).sort((a,b)=>a-b);
    const lastRound = completedRounds[completedRounds.length - 1];
    const prevRound = completedRounds[completedRounds.length - 2];
    const snapshots = {};

    completedRounds.forEach(r => {
      const res = results[r];
      const ensure = (code) => {
        if (driverPts[code] === undefined) {
          driverPts[code] = 0; driverWins[code] = 0; driverPodiums[code] = 0;
          driverFastest[code] = 0; driverPoles[code] = 0; driverDnfs[code] = 0;
        }
      };

      // Prefer canonical per-driver points from the bundle's detail map -
      // it's the authoritative value (correct sprint scoring, no
      // fastest-lap +1 from 2025 onward, etc.). Fall back to the
      // 25-18-15-12-10-8-6-4-2-1 + FL approximation only for older
      // bundles that don't ship `detail[code].points`.
      const detail = res.detail || null;
      const hasCanonicalRacePts = detail && (res.order || []).some(c => detail[c] && typeof detail[c].points === 'number');
      (res.order || []).forEach((code, i) => {
        ensure(code);
        if (hasCanonicalRacePts) {
          driverPts[code] += (detail[code] && typeof detail[code].points === 'number') ? detail[code].points : 0;
        } else {
          if (i < 10) driverPts[code] += POINTS[i];
        }
        if (i === 0) driverWins[code] += 1;
        if (i < 3) driverPodiums[code] += 1;
      });
      // Legacy FL +1 bonus only when we're already using the legacy
      // approximation - canonical points already include it (or don't,
      // per current FIA rules).
      if (!hasCanonicalRacePts && res.fastest && (res.order || []).indexOf(res.fastest) < 10) {
        driverPts[res.fastest] = (driverPts[res.fastest] || 0) + 1;
      }
      if (res.fastest) { ensure(res.fastest); driverFastest[res.fastest] += 1; }
      if (res.pole) { ensure(res.pole); driverPoles[res.pole] += 1; }

      // Sprint: prefer the per-driver `sprintResults.detail[code].points`
      // from the bundle. The previous fallback inferred sprint placings
      // from the main race finishing order, which is just wrong - sprint
      // order and race order are different sessions.
      const sprint = res.sprintResults || null;
      if (sprint && sprint.detail) {
        Object.entries(sprint.detail).forEach(([code, info]) => {
          if (info && typeof info.points === 'number') {
            ensure(code);
            driverPts[code] += info.points;
          }
        });
      } else if (sprint && Array.isArray(sprint.order)) {
        const SPRINT_POINTS = [8,7,6,5,4,3,2,1];
        sprint.order.slice(0, 8).forEach((code, i) => {
          ensure(code);
          driverPts[code] += SPRINT_POINTS[i];
        });
      } else if (res.sprintWinner) {
        // Last-resort approximation kept for bundles that only carry the
        // sprint winner (very old / hand-curated). Known to be wrong for
        // anyone other than the winner; preserved to avoid regressing
        // historic data with no sprint detail at all.
        const sprintPoints = { [res.sprintWinner]: 8 };
        const others = (res.order || []).filter(c => c !== res.sprintWinner).slice(0, 7);
        others.forEach((c, i) => sprintPoints[c] = 7 - i);
        Object.entries(sprintPoints).forEach(([c, p]) => {
          ensure(c);
          driverPts[c] += p;
        });
      }

      (res.dnfs || []).forEach(c => { ensure(c); driverDnfs[c] += 1; });
      snapshots[r] = { ...driverPts };
    });

    // Post-drop championship snapshot. For seasons that used "best N of
    // M results" rules (every year from 1950-1990 except a handful),
    // summing per-race points overcounts the championship. The CSV
    // importer ships `results[r].driverStandings[ref] = { points,
    // position, wins }` taken from Ergast's driver_standings table,
    // which is the FIA's official post-drop number snapshotted after
    // each race. Prefer that for the final season totals; fall back to
    // the per-race sum when the snapshot isn't shipped (hand-curated
    // bundles, Jolpica current-season bundles - both already use modern
    // all-rounds-count scoring, so the sum IS the FIA total).
    const lastRoundSnap = lastRound != null && results[lastRound] && results[lastRound].driverStandings
      ? results[lastRound].driverStandings
      : null;
    const ranked = drivers.filter(d => d.team).map(d => {
      const snap = lastRoundSnap && lastRoundSnap[d.id];
      return {
        driver: d,
        // Snapshot wins are championship wins (= same number); prefer
        // them when present so the leader-by-points-then-by-wins
        // tiebreak agrees with the FIA's recorded total.
        points: snap ? snap.points : (driverPts[d.id] || 0),
        wins: snap ? snap.wins : (driverWins[d.id] || 0),
        podiums: driverPodiums[d.id] || 0,
        fastestLaps: driverFastest[d.id] || 0,
        poles: driverPoles[d.id] || 0,
        dnfs: driverDnfs[d.id] || 0,
      };
    }).sort((a,b) => b.points - a.points || b.wins - a.wins);

    // Position-change indicator: compare each driver's current rank to
    // their rank after the previous round. Prefer the championship
    // snapshot (which already encodes era-specific drop rules) over the
    // per-race cumulative sum.
    const prevSnap = prevRound != null && results[prevRound] && results[prevRound].driverStandings
      ? results[prevRound].driverStandings
      : null;
    const prevPts = prevRound != null ? snapshots[prevRound] : null;
    const prevPointsFor = (id) => prevSnap && prevSnap[id]
      ? prevSnap[id].points
      : (prevPts ? (prevPts[id] || 0) : 0);
    const prevRanked = (prevSnap || prevPts)
      ? drivers.map(d => ({ id: d.id, points: prevPointsFor(d.id) })).sort((a,b) => b.points - a.points)
      : null;
    const prevRankMap = {};
    if (prevRanked) prevRanked.forEach((r, i) => prevRankMap[r.id] = i + 1);
    ranked.forEach((row, i) => {
      row.position = i + 1;
      const prevP = prevRankMap[row.driver.id];
      row.change = prevP ? prevP - row.position : 0;
    });

    // Constructor totals - same story as drivers. Prefer the FIA's
    // post-drop snapshot when shipped; fall back to summing per-driver
    // points (which is correct for modern seasons).
    const lastRoundCSnap = lastRound != null && results[lastRound] && results[lastRound].constructorStandings
      ? results[lastRound].constructorStandings
      : null;
    const teamPts = {}, teamWins = {}, teamPodiums = {};
    teams.forEach(t => { teamPts[t.id] = 0; teamWins[t.id] = 0; teamPodiums[t.id] = 0; });
    ranked.forEach(r => {
      teamPts[r.driver.team] = (teamPts[r.driver.team] || 0) + r.points;
      teamWins[r.driver.team] = (teamWins[r.driver.team] || 0) + r.wins;
      teamPodiums[r.driver.team] = (teamPodiums[r.driver.team] || 0) + r.podiums;
    });
    const teamRanked = teams.map(t => {
      const snap = lastRoundCSnap && lastRoundCSnap[t.id];
      return {
        team: t,
        points: snap ? snap.points : (teamPts[t.id] || 0),
        wins: snap ? snap.wins : (teamWins[t.id] || 0),
        podiums: teamPodiums[t.id] || 0,
        drivers: drivers.filter(d => d.team === t.id),
      };
    }).sort((a,b)=> b.points - a.points || b.wins - a.wins);
    teamRanked.forEach((t,i) => t.position = i+1);

    // Per-round championship progression. Use the FIA snapshot per
    // round if shipped (drop-rule-correct); fall back to the cumulative
    // per-race sum otherwise.
    const driverPointsAtRound = (id, r) => {
      const snap = results[r] && results[r].driverStandings;
      if (snap && snap[id]) return snap[id].points;
      return (snapshots[r] && snapshots[r][id]) || 0;
    };
    const teamPointsAtRound = (tid, r) => {
      const snap = results[r] && results[r].constructorStandings;
      if (snap && snap[tid]) return snap[tid].points;
      const raceSnap = snapshots[r] || {};
      return drivers.filter(d => d.team === tid).reduce((sum, d) => sum + (raceSnap[d.id] || 0), 0);
    };
    const progression = {};
    drivers.forEach(d => progression[d.id] = []);
    completedRounds.forEach(r => {
      drivers.forEach(d => {
        progression[d.id].push({ round: r, points: driverPointsAtRound(d.id, r) });
      });
    });
    const teamProgression = {};
    teams.forEach(t => teamProgression[t.id] = []);
    completedRounds.forEach(r => {
      teams.forEach(t => {
        teamProgression[t.id].push({ round: r, points: teamPointsAtRound(t.id, r) });
      });
    });

    return { drivers: ranked, teams: teamRanked, progression, teamProgression, completedRounds, lastRound };
  }

  return {
    teams, drivers, calendar, circuits: staticCircuits, results, POINTS, seasonYear,
    driverById, teamById, computeStandings,
    _source: 'year-json',
    __rawSeason: { teams, drivers, calendar, results },
  };
}
