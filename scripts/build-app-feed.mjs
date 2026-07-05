// Builds the versioned mobile-app data feed: public/data/app/v1/
//
//   manifest.json        tiny index the apps poll first (schemaVersion, per-file
//                        sha256 hashes, latestSeason, minAppVersion, notice)
//   seasons/<year>.json  one file per season, 1950..current — the app data
//                        contract (see figures-app/docs/data-contract.md and
//                        figures-app/design/season-2026.js for the reference
//                        shape). Standings/stats are PRECOMPUTED here so the
//                        apps ship no scoring rules.
//   content.json         guide chapters, blog index, records, trivia facts —
//                        editorial that must refresh without an app-store release.
//
// Contract rules (f1gures-app depends on these):
//   - The /app/v1/ URL path IS the schema version. Changes within v1 must be
//     additive-only; breaking shape changes require generating /app/v2/
//     alongside v1 for a deprecation window.
//   - Season + content files are DETERMINISTIC (no timestamps) so unchanged
//     data produces byte-identical files: the FTP deploy skips them and
//     HTTP ETags stay stable. Only manifest.json carries generatedAt.
//   - This script runs at the END of prebuild (after build:archive, which
//     produces the records payloads it reads). A hard failure exits non-zero
//     ON PURPOSE: the FTP deploy deletes remote files missing from dist/, so
//     shipping a build without the feed would delete it from production and
//     strand the mobile apps. Blocking the deploy is the safer failure.
//     A single bad season is skipped with a warning instead (apps tolerate
//     missing seasons); only "no seasons at all / no content" is fatal.
//
// Run: npm run build:appfeed   (wired into prebuild)

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { computeStandings, roundPointsMap } from '../src/lib/seasonStats.mjs';
import { circuitProfiles } from '../src/data/circuitProfiles.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'public', 'data');
const OUT = join(DATA, 'app', 'v1');
const SITE = 'https://f1gures.app';

const SCHEMA_VERSION = 1;
// Full history: emit every season bundle we have (1950..current). The apps'
// season picker is manifest-driven and extends automatically. Seasons that fail
// validation (sparse pre-war-era data) are skipped with a warning, not fatal.
const FIRST_APP_SEASON = 1950;

// ---------------------------------------------------------------------------
// small helpers

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const monthShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const shortDate = (iso) => { const d = new Date(iso + 'T00:00:00Z'); return `${monthShort[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const gpShort = (name) => name.replace(/Grand Prix/i, 'GP');
const absUrl = (p) => p ? `${SITE}/${p.replace(/^\/+/, '')}` : null;

// Display names for the app (bundles carry sponsor-length names for some teams).
const TEAM_DISPLAY = {
  mercedes: 'Mercedes', ferrari: 'Ferrari', mclaren: 'McLaren', redbull: 'Red Bull',
  alpine: 'Alpine', rb: 'RB', haas: 'Haas', williams: 'Williams', audi: 'Audi',
  aston: 'Aston Martin', cadillac: 'Cadillac', sauber: 'Sauber', alphatauri: 'AlphaTauri',
  alfa: 'Alfa Romeo', racingpoint: 'Racing Point', renault: 'Renault',
};

// 3-letter round codes for the points-per-round bar labels (keyed by GP name).
const ROUND_CODE = {
  'Australian Grand Prix': 'AUS', 'Chinese Grand Prix': 'CHN', 'Japanese Grand Prix': 'JPN',
  'Bahrain Grand Prix': 'BHR', 'Saudi Arabian Grand Prix': 'SAU', 'Miami Grand Prix': 'MIA',
  'Emilia Romagna Grand Prix': 'EMI', 'Monaco Grand Prix': 'MON', 'Canadian Grand Prix': 'CAN',
  'Spanish Grand Prix': 'ESP', 'Austrian Grand Prix': 'AUT', 'British Grand Prix': 'GBR',
  'Hungarian Grand Prix': 'HUN', 'Belgian Grand Prix': 'BEL', 'Dutch Grand Prix': 'NED',
  'Italian Grand Prix': 'ITA', 'Azerbaijan Grand Prix': 'AZE', 'Singapore Grand Prix': 'SIN',
  'United States Grand Prix': 'USA', 'Mexico City Grand Prix': 'MEX', 'Mexican Grand Prix': 'MEX',
  'São Paulo Grand Prix': 'BRA', 'Brazilian Grand Prix': 'BRA', 'Las Vegas Grand Prix': 'LVG',
  'Qatar Grand Prix': 'QAT', 'Abu Dhabi Grand Prix': 'ABU', 'Madrid Grand Prix': 'MAD',
  'Spanish Grand Prix (Madrid)': 'MAD', 'French Grand Prix': 'FRA', 'Styrian Grand Prix': 'STY',
  'Portuguese Grand Prix': 'POR', 'Turkish Grand Prix': 'TUR', 'Russian Grand Prix': 'RUS',
  'Tuscan Grand Prix': 'TUS', 'Eifel Grand Prix': 'EIF', '70th Anniversary Grand Prix': '70A',
  'Sakhir Grand Prix': 'SAK',
};
// Circuit-keyed overrides beat name lookups: 2026 has BOTH "Barcelona GP"
// (catalunya, traditionally ESP) and "Spanish GP" (the new madring = MAD).
const ROUND_CODE_BY_CIRCUIT = { catalunya: 'ESP', madring: 'MAD' };
const roundCode = (name, circuit) =>
  ROUND_CODE_BY_CIRCUIT[circuit] || ROUND_CODE[name] || name.replace(/Grand Prix/i, '').trim().slice(0, 3).toUpperCase();

const driverImg = (jolpicaId) => {
  if (jolpicaId && existsSync(join(ROOT, 'public', 'images', 'drivers', `${jolpicaId}.webp`))) {
    return absUrl(`images/drivers/${jolpicaId}.webp`);
  }
  return absUrl('images/drivers/_placeholder.svg');
};

const circuitMap = (profileId) => {
  const p = `images/circuits/white-outline/${profileId}.svg`;
  return existsSync(join(ROOT, 'public', p)) ? absUrl(p) : null;
};

const lastName = (code, driversByCode) => {
  const d = driversByCode[code];
  return d ? d.last : code;
};

// Stable JSON: plain stringify (key order = insertion order, which we control).
const writeJson = (path, obj) => {
  mkdirSync(dirname(path), { recursive: true });
  const s = JSON.stringify(obj);
  writeFileSync(path, s);
  return s;
};

// ---------------------------------------------------------------------------
// per-season transform: site bundle -> app season file

function buildSeason(year, bundle) {
  const st = computeStandings(bundle);
  const completed = st.completedRounds;
  const totalRounds = bundle.calendar.length;
  const driversByCode = {};
  for (const d of bundle.drivers) driversByCode[d.code || d.id] = d;
  const teamsById = {};
  for (const t of bundle.teams) teamsById[t.id] = t;
  const teamName = (id) => TEAM_DISPLAY[id] || (teamsById[id] ? teamsById[id].name : id);
  const teamColor = (id) => {
    const c = teamsById[id] ? teamsById[id].color : '#9B9B9B';
    return c === '#888888' ? '#9B9B9B' : c; // neutral rule from the PRD
  };
  const rowFor = (code) => {
    const d = driversByCode[code];
    return { code, name: d ? d.last : code, color: teamColor(d ? d.team : '') };
  };

  // drivers[] — final standings order
  const drivers = st.drivers.map((r, i) => {
    const d = r.driver;
    return {
      pos: i + 1, code: d.code || d.id, name: `${d.first} ${d.last}`, last: d.last,
      num: d.num ?? null, flag: d.flag || '', nat: d.nationality || '', dob: d.dateOfBirth || null,
      team: teamName(d.team), teamId: d.team, teamShort: teamsById[d.team]?.short || '',
      color: teamColor(d.team), pts: r.points, wins: r.wins, podiums: r.podiums,
      poles: r.poles, fastLaps: r.fastestLaps, img: driverImg(d.jolpicaId),
    };
  });

  // teams[] — constructor standings order
  const teams = st.teams.map((t, i) => ({
    pos: i + 1, id: t.team.id, name: teamName(t.team.id), short: t.team.short || '',
    color: teamColor(t.team.id), pts: t.points, wins: t.wins, podiums: t.podiums,
    drivers: t.drivers
      .slice()
      .sort((a, b) => drivers.findIndex(x => x.code === (a.code || a.id)) - drivers.findIndex(x => x.code === (b.code || b.id)))
      .map(d => d.code || d.id).join(' · '),
    nat: t.team.nationality || '',
  }));

  // calendar[] — with app-side additions (dateISO/timeUTC/sessions) for real countdowns
  const nextRound = bundle.calendar.find(c => !bundle.results[String(c.round)]);
  const calendar = bundle.calendar.map(c => {
    const res = bundle.results[String(c.round)];
    return {
      round: c.round, name: c.name, short: gpShort(c.name), flag: c.flag || '',
      date: shortDate(c.date), circuit: c.circuit, sprint: !!c.sprint,
      status: res ? 'completed' : (nextRound && c.round === nextRound.round ? 'next' : 'upcoming'),
      map: circuitMap(c.circuit),
      winner: res && res.order && res.order[0] ? lastName(res.order[0], driversByCode) : null,
      // additive (not in the design sample): real UTC timestamps for countdowns
      dateISO: c.date, timeUTC: c.time || null, sessions: c.sessions || null,
    };
  });

  // circuits[] — profile-enriched, one per calendar round with a known profile
  const circuits = [];
  for (const c of bundle.calendar) {
    const p = circuitProfiles[c.circuit];
    if (!p) continue;
    circuits.push({
      id: c.circuit, gp: gpShort(c.name), name: p.name, city: p.city, country: p.country,
      flag: c.flag || '', length: p.length, laps: p.laps, corners: p.corners,
      firstYear: p.firstYear, races: p.races, tyreDeg: p.tyreDeg, overtaking: p.overtaking,
      weather: p.weather,
      record: p.lapRecord ? { driver: p.lapRecord.driver, time: p.lapRecord.time, year: p.lapRecord.year } : null,
      blurb: p.blurb || '', map: circuitMap(c.circuit), round: c.round, sprint: !!c.sprint,
    });
  }

  // chart[] — top 5 cumulative points per completed round
  const chart = st.drivers.slice(0, 5).map(r => ({
    code: r.driver.code || r.driver.id,
    color: teamColor(r.driver.team),
    pts: (st.progression[r.driver.id] || []).map(p => p.points),
  }));

  // results{round}
  const results = {};
  for (const r of completed) {
    const res = bundle.results[String(r)];
    const cal = bundle.calendar.find(c => c.round === r);
    if (!res || !cal) continue;
    const detail = res.detail || {};
    const order = res.order || [];
    const dnfSet = new Set(res.dnfs || []);
    const classified = order.filter(c => !dnfSet.has(c));
    const winnerDet = detail[order[0]] || {};
    const rows = classified.map((code, i) => {
      const det = detail[code] || {};
      return { pos: i + 1, ...rowFor(code), time: det.time || '', pts: (roundPointsMap(res)[code] || 0) - (sprintPts(res)[code] || 0), grid: det.grid ?? null };
    });
    const dnfRows = (res.dnfs || []).map(code => {
      const det = detail[code] || {};
      return { ...rowFor(code), status: det.status || 'Retired', laps: det.laps ?? null };
    });
    const quali = qualiTop10(res, rowFor);
    const sprintRows = sprintTop8(res, rowFor);
    const fl = res.fastest && detail[res.fastest] ? {
      name: lastName(res.fastest, driversByCode),
      time: detail[res.fastest].fastestLap || '',
      lap: detail[res.fastest].fastestLapNumber ?? null,
    } : null;
    results[String(r)] = {
      round: r, name: cal.name, short: gpShort(cal.name), flag: cal.flag || '',
      sprint: !!cal.sprint, circuit: circuitProfiles[cal.circuit]?.name || cal.circuit,
      map: circuitMap(cal.circuit), date: cal.date,
      pole: res.pole ? lastName(res.pole, driversByCode) : null,
      fastest: fl, winTime: winnerDet.time || '',
      sprintWinner: sprintWinnerName(res, driversByCode),
      rows, dnfRows, quali, sprintRows,
    };
  }

  // driverRounds{code} + driverStats{code} for every driver in the standings
  const driverRounds = {};
  const driverStats = {};
  for (const d of drivers) {
    const pts = [], fin = [], grid = [];
    for (const r of completed) {
      const res = bundle.results[String(r)];
      const det = (res.detail || {})[d.code];
      pts.push(roundPointsMap(res)[d.code] || 0);
      if (!det) { fin.push(null); grid.push(null); continue; }
      const dnf = (res.dnfs || []).includes(d.code);
      const posNum = parseInt(det.position, 10);
      fin.push(dnf || !Number.isFinite(posNum) ? 'DNF' : posNum);
      grid.push(det.grid ?? null);
    }
    driverRounds[d.code] = { pts, fin, grid };

    const finishes = fin.filter(f => typeof f === 'number');
    const grids = grid.filter(g => typeof g === 'number');
    const dnfs = fin.filter(f => f === 'DNF').length;
    const teammates = drivers.filter(x => x.teamId === d.teamId && x.code !== d.code);
    const tm = teammates[0] || null;
    let qW = 0, qL = 0, rW = 0, rL = 0;
    if (tm) {
      for (const r of completed) {
        const res = bundle.results[String(r)];
        const q = res.quali || {};
        const mine = q[d.code], theirs = q[tm.code];
        if (mine && theirs && mine.position && theirs.position) {
          mine.position < theirs.position ? qW++ : qL++;
        }
        const rr = driverRounds[d.code].fin[completed.indexOf(r)];
        const tf = (res.detail || {})[tm.code];
        const theirPos = tf ? parseInt(tf.position, 10) : NaN;
        const theirDnf = (res.dnfs || []).includes(tm.code);
        if (typeof rr === 'number' && !theirDnf && Number.isFinite(theirPos)) {
          rr < theirPos ? rW++ : rL++;
        }
      }
    }
    driverStats[d.code] = {
      avgGrid: grids.length ? (grids.reduce((a, b) => a + b, 0) / grids.length).toFixed(1) : '-',
      avgFinish: finishes.length ? (finishes.reduce((a, b) => a + b, 0) / finishes.length).toFixed(1) : '-',
      dnfs, best: finishes.length ? `P${Math.min(...finishes)}` : '-',
      teammate: tm ? tm.last : '', teammateCode: tm ? tm.code : '',
      qH2H: [qW, qL], rH2H: [rW, rL],
    };
  }

  const leader = drivers[0] || null;
  const season = {
    meta: {
      year: String(year), totalRounds, completed: completed.length,
      champion: completed.length === totalRounds && leader ? leader.last : null,
      leader: leader ? leader.last : null, leaderPts: leader ? leader.pts : 0,
      teamChamp: teams[0] ? teams[0].name : null,
    },
    drivers, teams, calendar, circuits, chart, results, driverRounds, driverStats,
    roundCodes: completed.map(r => {
      const cal = bundle.calendar.find(c => c.round === r);
      return roundCode(cal ? cal.name : '', cal ? cal.circuit : '');
    }),
  };
  validateSeason(season, year);
  return season;
}

// race-only points helper (rows[].pts excludes sprint points, matching the design)
function sprintPts(res) {
  const out = {};
  const sprint = res.sprintResults;
  if (sprint && sprint.detail) {
    for (const [code, info] of Object.entries(sprint.detail)) {
      if (info && typeof info.points === 'number') out[code] = info.points;
    }
  }
  return out;
}

function qualiTop10(res, rowFor) {
  const q = res.quali;
  if (!q || Array.isArray(q)) return [];
  return Object.entries(q)
    .filter(([, v]) => v && v.position)
    .sort((a, b) => a[1].position - b[1].position)
    .slice(0, 10)
    .map(([code, v]) => ({ pos: v.position, ...rowFor(code), time: v.q3 || v.q2 || v.q1 || '' }));
}

function sprintTop8(res, rowFor) {
  const sprint = res.sprintResults;
  if (!sprint) return [];
  const order = Array.isArray(sprint.order) ? sprint.order : [];
  return order.slice(0, 8).map((code, i) => {
    const det = (sprint.detail || {})[code] || {};
    return { pos: i + 1, ...rowFor(code), pts: typeof det.points === 'number' ? det.points : [8,7,6,5,4,3,2,1][i], time: det.time || '' };
  });
}

function sprintWinnerName(res, driversByCode) {
  const sprint = res.sprintResults;
  const code = (sprint && (sprint.winner || (Array.isArray(sprint.order) && sprint.order[0]))) || res.sprintWinner || null;
  return code ? (driversByCode[code] ? driversByCode[code].last : code) : null;
}

function validateSeason(s, year) {
  const fail = (msg) => { throw new Error(`season ${year}: ${msg}`); };
  if (!s.drivers.length) fail('no drivers');
  if (!s.teams.length) fail('no teams');
  if (s.calendar.length !== s.meta.totalRounds) fail('calendar/totalRounds mismatch');
  if (Object.keys(s.results).length !== s.meta.completed) fail('results/completed mismatch');
  if (s.roundCodes.length !== s.meta.completed) fail('roundCodes/completed mismatch');
  for (const c of s.chart) {
    if (c.pts.length !== s.meta.completed) fail(`chart ${c.code} length`);
  }
  for (const d of s.drivers) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(d.color)) fail(`driver ${d.code} bad color ${d.color}`);
    const dr = s.driverRounds[d.code];
    if (!dr || dr.pts.length !== s.meta.completed) fail(`driverRounds ${d.code}`);
    if (!s.driverStats[d.code]) fail(`driverStats ${d.code}`);
  }
  const statuses = s.calendar.map(c => c.status);
  if (s.meta.completed < s.meta.totalRounds && !statuses.includes('next')) fail('no next round marked');
}

// ---------------------------------------------------------------------------
// content.json: guide + blog + records + facts

function stripMdx(body) {
  return body
    .replace(/^import .*$/gm, '')
    // <DriverChip ref="max_verstappen" /> -> the readable last-name-ish token
    .replace(/<DriverChip[^>]*ref="([^"]+)"[^>]*\/>/g, (_, ref) =>
      ref.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' '))
    // drop other block components entirely (RaceResult, StandingsCard, ...)
    .replace(/<[A-Z][A-Za-z]*[^>]*\/>/g, '')
    .replace(/<[A-Z][A-Za-z]*[^>]*>[\s\S]*?<\/[A-Z][A-Za-z]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseFrontMatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { fm: {}, body: src };
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (v.startsWith('[')) { try { v = JSON.parse(v.replace(/'/g, '"')); } catch { /* keep raw */ } }
    else if (/^\d+$/.test(v)) v = parseInt(v, 10);
    fm[kv[1]] = v;
  }
  return { fm, body: src.slice(m[0].length) };
}

function readMdxDir(dir) {
  return readdirSync(dir).filter(f => f.endsWith('.mdx')).sort().map(f => {
    const src = readFileSync(join(dir, f), 'utf8');
    const { fm, body } = parseFrontMatter(src);
    return { id: basename(f, '.mdx'), fm, body: stripMdx(body) };
  });
}

function buildContent() {
  const words = (s) => s.split(/\s+/).length;

  const guide = readMdxDir(join(ROOT, 'src', 'content', 'guide'))
    .map(({ id, fm, body }) => ({
      id, title: fm.title || id, order: fm.order ?? 999, category: fm.category || '',
      readMinutes: fm.readMinutes || Math.max(1, Math.round(words(body) / 200)),
      summary: fm.summary || '', body,
    }))
    .sort((a, b) => a.order - b.order);

  const blog = readMdxDir(join(ROOT, 'src', 'content', 'blog'))
    .map(({ id, fm, body }) => ({
      id, title: fm.title || id, description: fm.description || '',
      category: fm.category || 'analysis', publishedAt: String(fm.publishedAt || ''),
      heroImage: fm.heroImage ? absUrl(String(fm.heroImage)) : null,
      readMinutes: Math.max(1, Math.round(words(body) / 200)), body,
    }))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  // records: reuse the archive-generated payloads (build:archive runs first in
  // prebuild). Strip the timestamp so the file stays deterministic.
  const recordsIndexPath = join(DATA, 'archive', '_records-index.json');
  let records = { groups: [] };
  if (existsSync(recordsIndexPath)) {
    const idx = JSON.parse(readFileSync(recordsIndexPath, 'utf8'));
    records = { groups: idx.groups || [] };
  }

  const trivia = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'trivia.json'), 'utf8'));
  const facts = (trivia.facts || []).map(f => (typeof f === 'string' ? { text: f } : { text: f.text, category: f.category || '' }));

  if (!guide.length) throw new Error('content: no guide chapters');
  if (!blog.length) throw new Error('content: no blog posts');
  if (!facts.length) throw new Error('content: no facts');
  return { guide, blog, records, facts };
}

// ---------------------------------------------------------------------------
// archive.json: compact all-time career data for Compare Mode + career views.
// Reads the full archive docs (public/data/archive/{drivers,teams}) that the
// website's pages consume, and ships a SLIMMED shape — no per-race logs (those
// are 80%+ of each doc). Career avg-finish and DNF-rate are precomputed here
// from perRace so the apps don't need it. Additive within v1.

const n0 = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const isClassifiedRace = (r) =>
  r && r.position != null && (r.positionText == null || /^\d+$/.test(String(r.positionText)));

function buildArchiveDriver(d) {
  const c = d.career || {};
  const perSeason = (d.perSeason || []).map(s => ({
    year: s.year, teamRef: s.constructorRef || '', team: s.constructorName || '',
    pos: s.position ?? null, pts: n0(s.points), wins: n0(s.wins), races: n0(s.races), best: s.bestFinish ?? null,
  }));
  const points = perSeason.reduce((a, s) => a + s.pts, 0);
  const pr = d.perRace || [];
  const classified = pr.filter(isClassifiedRace);
  const avgFinish = classified.length ? +(classified.reduce((a, r) => a + r.position, 0) / classified.length).toFixed(1) : null;
  const dnfPct = pr.length ? +(((pr.length - classified.length) / pr.length) * 100).toFixed(1) : null;
  const teams = new Set(perSeason.map(s => s.teamRef).filter(Boolean)).size;
  const latest = perSeason[0] || null;
  const mates = (d.teammates?.byMate || []).map(m => ({
    ref: m.driverRef, name: m.surname || m.name,
    years: m.firstYear === m.lastYear ? `${m.firstYear}` : `${m.firstYear}–${m.lastYear}`,
    weekends: n0(m.weekends),
    q: [n0(m.quali?.wins), n0(m.quali?.losses)],
    r: [n0(m.race?.wins), n0(m.race?.losses)],
  }));
  return {
    ref: d.driverRef, name: `${d.forename} ${d.surname}`, last: d.surname,
    code: d.code || null, nat: d.nationality || '', dob: d.dob || null,
    from: c.firstYear ?? null, to: c.lastYear ?? null,
    seasons: n0(c.seasons), races: n0(c.races), wins: n0(c.wins), podiums: n0(c.podiums),
    poles: n0(c.poles), fastLaps: n0(c.fastestLaps), titles: n0(c.championships),
    points, avgFinish, dnfPct, teamsCount: teams,
    team: latest?.team || null, teamRef: latest?.teamRef || null,
    perSeason, mates,
  };
}

function buildArchiveTeam(t) {
  const c = t.career || {};
  const perSeason = (t.perSeason || []).map(s => ({
    year: s.year, pos: s.position ?? null, pts: n0(s.points), wins: n0(s.wins), races: n0(s.races),
    drivers: (s.drivers || []).map(dr => ({ ref: dr.driverRef, name: dr.name, code: dr.code || '', flag: dr.flag || '', pos: dr.position ?? null })),
  }));
  const points = perSeason.reduce((a, s) => a + s.pts, 0);
  const positions = perSeason.map(s => s.pos).filter(p => p != null);
  const bestFinish = positions.length ? Math.min(...positions) : null;
  const bs = t.bestSeason ? {
    year: t.bestSeason.year, pos: t.bestSeason.position ?? null, pts: n0(t.bestSeason.points),
    wins: n0(t.bestSeason.wins), races: n0(t.bestSeason.races),
    winRate: t.bestSeason.winRate != null ? +(t.bestSeason.winRate * 100).toFixed(0) : null,
    tagline: t.bestSeason.tagline || '',
    drivers: (t.bestSeason.drivers || []).map(dr => ({ ref: dr.driverRef, name: dr.name })),
  } : null;
  const topDrivers = (t.topDrivers || []).slice(0, 6).map(dr => ({
    ref: dr.driverRef, name: dr.name, flag: dr.flag || '', races: n0(dr.races), wins: n0(dr.wins),
  }));
  return {
    ref: t.constructorRef, name: t.name, short: t.short || '', color: t.color || '#9B9B9B', nat: t.nationality || '',
    from: c.firstYear ?? null, to: c.lastYear ?? null,
    seasons: n0(c.seasons), races: n0(c.races), wins: n0(c.wins), podiums: n0(c.podiums),
    titles: n0(c.championships), driverCount: n0(c.driverCount),
    points, bestFinish, bestSeason: bs, topDrivers, perSeason,
  };
}

function buildArchive() {
  const dDir = join(DATA, 'archive', 'drivers');
  const tDir = join(DATA, 'archive', 'teams');
  if (!existsSync(dDir) || !existsSync(tDir)) {
    console.warn('::warning::app-feed: no archive/ docs — skipping archive.json');
    return null;
  }
  const drivers = readdirSync(dDir).filter(f => f.endsWith('.json'))
    .map(f => { try { return buildArchiveDriver(JSON.parse(readFileSync(join(dDir, f), 'utf8'))); } catch { return null; } })
    .filter(Boolean)
    .filter(d => d.races > 0)
    .sort((a, b) => b.titles - a.titles || b.wins - a.wins || (b.points - a.points));
  const teams = readdirSync(tDir).filter(f => f.endsWith('.json'))
    .map(f => { try { return buildArchiveTeam(JSON.parse(readFileSync(join(tDir, f), 'utf8'))); } catch { return null; } })
    .filter(Boolean)
    .filter(t => t.races > 0)
    .sort((a, b) => b.titles - a.titles || b.wins - a.wins || (b.points - a.points));
  if (!drivers.length || !teams.length) throw new Error('archive: no drivers or teams built');
  return { drivers, teams };
}

// ---------------------------------------------------------------------------
// main

function main() {
  const years = readdirSync(DATA)
    .map(f => f.match(/^(\d{4})\.json$/))
    .filter(Boolean)
    .map(m => parseInt(m[1], 10))
    .filter(y => y >= FIRST_APP_SEASON)
    .sort((a, b) => a - b);
  if (!years.length) throw new Error(`no season bundles >= ${FIRST_APP_SEASON} in public/data/`);

  const seasonEntries = [];
  for (const year of years) {
    try {
      const bundle = JSON.parse(readFileSync(join(DATA, `${year}.json`), 'utf8'));
      const season = buildSeason(year, bundle);
      const json = writeJson(join(OUT, 'seasons', `${year}.json`), season);
      seasonEntries.push({ year, path: `seasons/${year}.json`, sha256: sha256(json) });
      console.log(`app-feed: seasons/${year}.json (${(json.length / 1024).toFixed(0)} KB, ${season.meta.completed}/${season.meta.totalRounds} rounds)`);
    } catch (err) {
      console.warn(`::warning::app-feed: skipping season ${year}: ${err.message}`);
    }
  }
  if (!seasonEntries.length) throw new Error('all seasons failed to build');

  const content = buildContent();
  const contentJson = writeJson(join(OUT, 'content.json'), content);
  console.log(`app-feed: content.json (${(contentJson.length / 1024).toFixed(0)} KB, ${content.guide.length} guide / ${content.blog.length} blog / ${content.facts.length} facts)`);

  // archive.json — optional (Compare Mode / career views). A build failure here
  // is non-fatal: the apps degrade to per-season data if it's absent.
  let archiveEntry = null;
  try {
    const archive = buildArchive();
    if (archive) {
      const archiveJson = writeJson(join(OUT, 'archive.json'), archive);
      archiveEntry = { path: 'archive.json', sha256: sha256(archiveJson) };
      console.log(`app-feed: archive.json (${(archiveJson.length / 1024).toFixed(0)} KB, ${archive.drivers.length} drivers / ${archive.teams.length} teams)`);
    }
  } catch (err) {
    console.warn(`::warning::app-feed: skipping archive.json: ${err.message}`);
  }

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    latestSeason: seasonEntries[seasonEntries.length - 1].year,
    seasons: seasonEntries,
    content: { path: 'content.json', sha256: sha256(contentJson) },
    archive: archiveEntry,
    imagesBase: SITE,
    minAppVersion: { android: 1, ios: 1 },
    notice: null,
  };
  writeJson(join(OUT, 'manifest.json'), manifest);
  console.log(`app-feed: manifest.json (latestSeason ${manifest.latestSeason}, ${seasonEntries.length} seasons)`);
}

try {
  main();
} catch (err) {
  // Fatal on purpose — see the header comment: deploying WITHOUT the feed
  // would delete it from the live server (FTP sync removes missing files).
  console.error(`app-feed: FATAL: ${err.message}`);
  process.exit(1);
}
