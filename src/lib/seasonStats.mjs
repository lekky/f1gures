// Single source of truth for season points/standings math.
//
// Computes per-driver and per-team championship standings from a season
// bundle's `results` map (the shape public/data/<year>.json ships and
// scripts/fetch-season.mjs writes). Canonical per-driver points from
// `detail[code].points` and `sprintResults.detail[code].points` are always
// preferred; position-based approximations only kick in for old bundles
// that don't carry them.
//
// Consumers (keep it that way - do NOT re-implement scoring elsewhere):
//   - src/data/buildFallback.js     buildFromYearJson → island standings
//   - src/lib/shared.jsx            driverPointsForRound / teamPointsForRound
//   - src/pages/teams/[constructorRef].astro  current-season driver cards
//   - scripts/build-archive.mjs     post-Ergast driver/team/records merges
//
// Plain ESM with zero dependencies so both Vite (islands, Astro frontmatter)
// and Node scripts can import it.

const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];

// Countback tiebreak (FIA sporting regs): when points are equal, the driver
// (or team) with more 1st places ranks higher; if still tied, more 2nd
// places, then 3rd, and so on down the finishing order until it breaks.
// `fa`/`fb` are per-position finish tallies (index p-1 = count of pth places).
function countback(fa, fb) {
  const a = fa || [], b = fb || [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const diff = (b[i] || 0) - (a[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

// Race points earned per driver code in one round. Canonical detail points
// when the bundle ships them; otherwise the modern 25-18-... approximation
// plus the legacy fastest-lap +1 (canonical points already encode the
// era's actual FL rule, so the bonus only applies on the approximation
// path).
export function racePointsMap(result) {
  const out = {};
  if (!result) return out;
  const order = result.order || [];
  const detail = result.detail || null;
  const hasCanonical = detail && order.some(c => detail[c] && typeof detail[c].points === 'number');
  if (hasCanonical) {
    for (const code of order) {
      const det = detail[code];
      out[code] = det && typeof det.points === 'number' ? det.points : 0;
    }
    // Classified scorers missing from `order` (defensive - shouldn't happen)
    for (const [code, det] of Object.entries(detail)) {
      if (!(code in out) && det && typeof det.points === 'number') out[code] = det.points;
    }
  } else {
    order.forEach((code, i) => { out[code] = i < 10 ? POINTS[i] : 0; });
    if (result.fastest && order.indexOf(result.fastest) < 10) {
      out[result.fastest] = (out[result.fastest] || 0) + 1;
    }
  }
  return out;
}

// Sprint points earned per driver code in one round. Prefers per-driver
// sprint detail, falls back to the sprint finishing order, and only as a
// last resort approximates from the *race* order for bundles that carry
// nothing but the sprint winner (known-wrong for everyone but the winner;
// kept so historic hand-curated data doesn't regress).
export function sprintPointsMap(result) {
  const out = {};
  if (!result) return out;
  const sprint = result.sprintResults || null;
  if (sprint && sprint.detail) {
    for (const [code, info] of Object.entries(sprint.detail)) {
      if (info && typeof info.points === 'number') out[code] = info.points;
    }
  } else if (sprint && Array.isArray(sprint.order)) {
    sprint.order.slice(0, 8).forEach((code, i) => { out[code] = SPRINT_POINTS[i]; });
  } else if (result.sprintWinner) {
    out[result.sprintWinner] = 8;
    const others = (result.order || []).filter(c => c !== result.sprintWinner).slice(0, 7);
    others.forEach((c, i) => { out[c] = 7 - i; });
  }
  return out;
}

// Total championship points (race + sprint) per driver code for one round.
// Memoized per result object - render loops call this per row per round.
const _roundCache = new WeakMap();
export function roundPointsMap(result) {
  if (!result || typeof result !== 'object') return {};
  let m = _roundCache.get(result);
  if (m) return m;
  m = racePointsMap(result);
  for (const [code, pts] of Object.entries(sprintPointsMap(result))) {
    m[code] = (m[code] || 0) + pts;
  }
  _roundCache.set(result, m);
  return m;
}

// Full season standings: ranked drivers + teams, per-round progression,
// position-change indicators. `season` needs { drivers, teams, results }
// (extra fields are ignored, so a full bundle or F1 data object works).
export function computeStandings(season) {
  const drivers = (season && season.drivers) || [];
  const teams = (season && season.teams) || [];
  const results = (season && season.results) || {};

  const driverPts = {}, driverWins = {}, driverPodiums = {}, driverFastest = {}, driverPoles = {}, driverDnfs = {};
  // driverFinishes[code][p-1] = number of times this driver finished pth.
  // Drives the countback tiebreak (most 1sts, then 2nds, then 3rds, ...).
  const driverFinishes = {};
  drivers.forEach(d => {
    driverPts[d.id] = 0; driverWins[d.id] = 0; driverPodiums[d.id] = 0;
    driverFastest[d.id] = 0; driverPoles[d.id] = 0; driverDnfs[d.id] = 0;
    driverFinishes[d.id] = [];
  });
  const completedRounds = Object.keys(results).map(Number).sort((a, b) => a - b);
  const lastRound = completedRounds[completedRounds.length - 1];
  const prevRound = completedRounds[completedRounds.length - 2];
  const snapshots = {};

  completedRounds.forEach(r => {
    const res = results[r];
    const ensure = (code) => {
      if (driverPts[code] === undefined) {
        driverPts[code] = 0; driverWins[code] = 0; driverPodiums[code] = 0;
        driverFastest[code] = 0; driverPoles[code] = 0; driverDnfs[code] = 0;
        driverFinishes[code] = [];
      }
    };

    for (const [code, pts] of Object.entries(roundPointsMap(res))) {
      ensure(code);
      driverPts[code] += pts;
    }
    (res.order || []).forEach((code, i) => {
      ensure(code);
      if (i === 0) driverWins[code] += 1;
      if (i < 3) driverPodiums[code] += 1;
      driverFinishes[code][i] = (driverFinishes[code][i] || 0) + 1;
    });
    if (res.fastest) { ensure(res.fastest); driverFastest[res.fastest] += 1; }
    if (res.pole) { ensure(res.pole); driverPoles[res.pole] += 1; }
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
      finishes: driverFinishes[d.id] || [],
    };
  }).sort((a, b) => b.points - a.points || countback(a.finishes, b.finishes));

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
    ? drivers.map(d => ({ id: d.id, points: prevPointsFor(d.id) })).sort((a, b) => b.points - a.points)
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
  const teamPts = {}, teamWins = {}, teamPodiums = {}, teamFinishes = {};
  teams.forEach(t => { teamPts[t.id] = 0; teamWins[t.id] = 0; teamPodiums[t.id] = 0; teamFinishes[t.id] = []; });
  ranked.forEach(r => {
    const tid = r.driver.team;
    teamPts[tid] = (teamPts[tid] || 0) + r.points;
    teamWins[tid] = (teamWins[tid] || 0) + r.wins;
    teamPodiums[tid] = (teamPodiums[tid] || 0) + r.podiums;
    const tf = teamFinishes[tid] || (teamFinishes[tid] = []);
    (r.finishes || []).forEach((c, i) => { tf[i] = (tf[i] || 0) + (c || 0); });
  });
  const teamRanked = teams.map(t => {
    const snap = lastRoundCSnap && lastRoundCSnap[t.id];
    return {
      team: t,
      points: snap ? snap.points : (teamPts[t.id] || 0),
      wins: snap ? snap.wins : (teamWins[t.id] || 0),
      podiums: teamPodiums[t.id] || 0,
      finishes: teamFinishes[t.id] || [],
      drivers: drivers.filter(d => d.team === t.id),
    };
  }).sort((a, b) => b.points - a.points || countback(a.finishes, b.finishes));
  teamRanked.forEach((t, i) => t.position = i + 1);

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
