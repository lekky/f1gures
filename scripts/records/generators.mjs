// scripts/records/generators.mjs
//
// One function per record. Each takes the relevant pre-aggregated data
// (driver/team docs etc.) plus an era flag and returns an array of unsorted,
// unranked entries. The orchestrator sorts, caps, and assigns ranks.
//
// Each driver doc passed in is expected to have:
//   driverRef, forename, surname, code, nationality, dob
//   natInfo: { country, flag }   (the importer's natInfo() result, pre-attached)
//   perRace[]: { year, round, position, grid, fastestLapRank, constructorRef, constructorName, circuitId, date, statusId }
//   finalStandingByYear: { [year]: { position } }   (championship lookup)

import { filterPerRaceByEra, formatYearsRange, compareEntries, assignRanksWithTies, formatAge } from './helpers.mjs';

function shortName(d) {
  const first = (d.forename || '').trim();
  const last = (d.surname || '').trim();
  if (!first) return last;
  return `${first[0]}. ${last}`;
}

function primaryTeamFromRows(rows) {
  const counts = new Map();
  const lastIndexByTeam = new Map();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.constructorRef) continue;
    counts.set(r.constructorRef, (counts.get(r.constructorRef) || 0) + 1);
    lastIndexByTeam.set(r.constructorRef, i);
  }
  let topRef = null, topCount = 0, topLastIndex = -1, topName = null;
  for (const [ref, count] of counts) {
    const lastIdx = lastIndexByTeam.get(ref);
    if (count > topCount || (count === topCount && lastIdx > topLastIndex)) {
      topCount = count;
      topRef = ref;
      topLastIndex = lastIdx;
      topName = rows[lastIdx]?.constructorName || null;
    }
  }
  return { ref: topRef, name: topName };
}

const STAT_FORMAT = {
  wins: 'wins',
  podiums: 'podiums',
  poles: 'poles',
  championships: 'titles',
  starts: 'starts',
  'fastest-laps': 'fastest laps',
};

function countStat(rows, stat, finalStandingByYear, era, currentYear) {
  switch (stat) {
    case 'wins':         return rows.filter(r => r.position === 1).length;
    case 'podiums':      return rows.filter(r => r.position != null && r.position <= 3).length;
    case 'poles':        return rows.filter(r => r.grid === 1).length;
    case 'starts':       return rows.length;
    case 'fastest-laps': return rows.filter(r => r.fastestLapRank === 1).length;
    case 'championships': {
      let n = 0;
      for (const yearStr of Object.keys(finalStandingByYear || {})) {
        const year = Number(yearStr);
        if (year === currentYear) continue;
        if (era === 'modern' && year < 1981) continue;
        if (era === 'classic' && year >= 1981) continue;
        if (finalStandingByYear[yearStr]?.position === 1) n++;
      }
      return n;
    }
    default: return 0;
  }
}

export function generateDriverCareerEntries(drivers, stat, era, currentYear) {
  const entries = [];
  for (const d of drivers) {
    // Count completed current-year races: championships still self-guard the
    // in-progress year inside countStat, so this only affects event counts.
    const rows = filterPerRaceByEra(d.perRace || [], era, currentYear, { includeCurrentYear: true });

    const value = countStat(rows, stat, d.finalStandingByYear, era, currentYear);
    if (value === 0) continue;

    const team = primaryTeamFromRows(rows);
    const years = rows.map(r => r.year);
    const firstYear = years.length ? Math.min(...years) : null;
    const lastYear = years.length ? Math.max(...years) : null;
    const context = formatYearsRange(firstYear, lastYear, currentYear);

    entries.push({
      value,
      valueLabel: `${value} ${STAT_FORMAT[stat]}`,
      races: rows.length,
      firstYear,
      driverRef: d.driverRef,
      name: `${d.forename || ''} ${d.surname || ''}`.trim(),
      first: d.forename || null,
      last: d.surname || null,
      shortName: shortName(d),
      code: d.code || null,
      flag: d.natInfo?.flag || null,
      country: d.natInfo?.country || null,
      teamRef: team.ref,
      teamName: team.name,
      teamColor: null,            // populated by orchestrator from team-color map
      context,
    });
  }
  entries.sort(compareEntries);
  assignRanksWithTies(entries);
  return entries;
}

export function generateWinsInSeasonEntries(drivers, era, currentYear) {
  const entries = [];
  for (const d of drivers) {
    const rows = filterPerRaceByEra(d.perRace || [], era, currentYear);
    if (!rows.length) continue;

    // Group by year, count wins
    const byYear = new Map();
    for (const r of rows) {
      if (!byYear.has(r.year)) byYear.set(r.year, []);
      byYear.get(r.year).push(r);
    }
    let bestYear = null, bestWins = 0, bestRows = null;
    for (const [year, list] of byYear) {
      const w = list.filter(r => r.position === 1).length;
      if (w > bestWins) { bestWins = w; bestYear = year; bestRows = list; }
    }
    if (bestWins === 0) continue;

    const team = primaryTeamFromRows(bestRows);
    entries.push({
      value: bestWins,
      valueLabel: `${bestWins} wins`,
      races: bestRows.length,
      firstYear: bestYear,
      driverRef: d.driverRef,
      name: `${d.forename || ''} ${d.surname || ''}`.trim(),
      first: d.forename || null,
      last: d.surname || null,
      shortName: shortName(d),
      code: d.code || null,
      flag: d.natInfo?.flag || null,
      country: d.natInfo?.country || null,
      teamRef: team.ref,
      teamName: team.name,
      teamColor: null,
      context: team.name ? `${bestYear} - ${team.name}` : String(bestYear),
    });
  }
  entries.sort(compareEntries);
  assignRanksWithTies(entries);
  return entries;
}

// kind: 'win' (position === 1) | 'podium' (position != null && position <= 3)
export function generateStreakEntries(drivers, kind, era, currentYear) {
  const predicate = kind === 'win'
    ? (r) => r.position === 1
    : (r) => r.position != null && r.position <= 3;
  const stat = kind === 'win' ? 'wins' : 'podiums';

  const entries = [];
  for (const d of drivers) {
    const filteredAll = filterPerRaceByEra(d.perRace || [], era, currentYear, { includeCurrentYear: true });
    if (!filteredAll.length) continue;

    // Sort chronologically (perRace already mostly is, but be safe)
    const rows = filteredAll.slice().sort((a, b) => (a.year - b.year) || ((a.round || 0) - (b.round || 0)));

    let current = 0, best = 0;
    let currentStart = null, bestStart = null, bestEnd = null;
    for (const r of rows) {
      if (predicate(r)) {
        if (current === 0) currentStart = r;
        current++;
        if (current > best) {
          best = current;
          bestStart = currentStart;
          bestEnd = r;
        }
      } else {
        current = 0;
        currentStart = null;
      }
    }
    if (best === 0) continue;

    const team = primaryTeamFromRows([bestStart, bestEnd].filter(Boolean));
    const context = bestStart.year === bestEnd.year
      ? `${bestStart.year}`
      : `${bestStart.year}-${bestEnd.year}`;

    entries.push({
      value: best,
      valueLabel: `${best} ${stat}`,
      races: rows.length,
      firstYear: bestStart.year,
      driverRef: d.driverRef,
      name: `${d.forename || ''} ${d.surname || ''}`.trim(),
      first: d.forename || null,
      last: d.surname || null,
      shortName: shortName(d),
      code: d.code || null,
      flag: d.natInfo?.flag || null,
      country: d.natInfo?.country || null,
      teamRef: team.ref,
      teamName: team.name,
      teamColor: null,
      context,
    });
  }
  entries.sort(compareEntries);
  assignRanksWithTies(entries);
  return entries;
}

// yearStandings: { [year]: { p1: {driverRef,name,surname,points}, p2: {driverRef,name,surname,points} } }
// driversByRef: Map<driverRef, driverDoc>  (for flag/short-name/team lookup)
export function generateTitleMarginEntries(yearStandings, driversByRef, era, currentYear) {
  const entries = [];
  for (const yearStr of Object.keys(yearStandings)) {
    const year = Number(yearStr);
    if (year === currentYear) continue;
    if (era === 'modern' && year < 1981) continue;
    if (era === 'classic' && year >= 1981) continue;

    const row = yearStandings[yearStr];
    if (!row?.p1 || !row?.p2) continue;
    const margin = (row.p1.points || 0) - (row.p2.points || 0);
    if (margin <= 0) continue;

    const champ = driversByRef.get(row.p1.driverRef);
    const champTeam = champ ? primaryTeamFromRows((champ.perRace || []).filter(r => r.year === year)) : { ref: null, name: null };
    const champFirst = champ?.forename || null;
    const champLast = champ?.surname || row.p1.surname || null;
    entries.push({
      value: margin,
      valueLabel: `${margin} pts`,
      races: 0,
      firstYear: year,
      driverRef: row.p1.driverRef,
      name: row.p1.name,
      first: champFirst,
      last: champLast,
      shortName: champ ? shortName(champ) : row.p1.name,
      code: champ?.code || null,
      flag: champ?.natInfo?.flag || null,
      country: champ?.natInfo?.country || null,
      teamRef: champTeam.ref,
      teamName: champTeam.name,
      teamColor: null,        // filled by orchestrator from teamColorByRef
      context: `${year} - beat ${row.p2.surname}`,
    });
  }
  entries.sort(compareEntries);
  assignRanksWithTies(entries);
  return entries;
}

// Age in days as the leaderboard's `value` so sort comparator works naturally.
// `valueLabel` is the human "Xy Yd" string.
function ageInDays(dobIso, eventIso) {
  if (!dobIso || !eventIso) return null;
  const dob = new Date(dobIso + 'T00:00:00Z');
  const evt = new Date(eventIso + 'T00:00:00Z');
  if (isNaN(dob) || isNaN(evt)) return null;
  return Math.floor((evt - dob) / (24 * 60 * 60 * 1000));
}

export function generateYoungestChampionEntries(drivers, finalRoundDateByYear, era, currentYear) {
  const entries = [];
  for (const d of drivers) {
    if (!d.dob) continue;
    const champYears = Object.keys(d.finalStandingByYear || {})
      .filter(y => d.finalStandingByYear[y]?.position === 1)
      .map(Number)
      .filter(y => y !== currentYear
        && (era !== 'modern' || y >= 1981)
        && (era !== 'classic' || y < 1981));
    if (!champYears.length) continue;
    const firstChampYear = Math.min(...champYears);
    const eventDate = finalRoundDateByYear[firstChampYear];
    if (!eventDate) continue;
    const ageDays = ageInDays(d.dob, eventDate);
    if (ageDays == null) continue;

    const team = primaryTeamFromRows((d.perRace || []).filter(r => r.year === firstChampYear));
    entries.push({
      value: ageDays,
      valueLabel: formatAge(d.dob, eventDate) || `${ageDays}d`,
      races: 0,
      firstYear: firstChampYear,
      driverRef: d.driverRef,
      name: `${d.forename || ''} ${d.surname || ''}`.trim(),
      first: d.forename || null,
      last: d.surname || null,
      shortName: shortName(d),
      code: d.code || null,
      flag: d.natInfo?.flag || null,
      country: d.natInfo?.country || null,
      teamRef: team.ref,
      teamName: team.name,
      teamColor: null,
      context: `${firstChampYear}${team.name ? ` - ${team.name}` : ''}`,
    });
  }
  // Youngest = smallest age in days. Override default sort.
  entries.sort((a, b) => a.value - b.value);
  // assignRanksWithTies expects descending sort. Use a sentinel: temporarily
  // flip sign for ranking, then restore.
  entries.forEach(e => { e.value = -e.value; });
  assignRanksWithTies(entries);
  entries.forEach(e => { e.value = -e.value; });
  return entries;
}

export function generateOldestWinnerEntries(drivers, era, currentYear) {
  const entries = [];
  for (const d of drivers) {
    if (!d.dob) continue;
    const rows = filterPerRaceByEra(d.perRace || [], era, currentYear, { includeCurrentYear: true })
      .filter(r => r.position === 1 && r.date);
    if (!rows.length) continue;
    let oldestRow = rows[0], oldestDays = ageInDays(d.dob, rows[0].date) ?? -1;
    for (const r of rows) {
      const days = ageInDays(d.dob, r.date);
      if (days != null && days > oldestDays) { oldestDays = days; oldestRow = r; }
    }
    if (oldestDays < 0) continue;

    entries.push({
      value: oldestDays,
      valueLabel: formatAge(d.dob, oldestRow.date) || `${oldestDays}d`,
      races: 0,
      firstYear: oldestRow.year,
      driverRef: d.driverRef,
      name: `${d.forename || ''} ${d.surname || ''}`.trim(),
      first: d.forename || null,
      last: d.surname || null,
      shortName: shortName(d),
      code: d.code || null,
      flag: d.natInfo?.flag || null,
      country: d.natInfo?.country || null,
      teamRef: oldestRow.constructorRef || null,
      teamName: oldestRow.constructorName || null,
      teamColor: null,
      context: `${oldestRow.year} ${oldestRow.raceName || ''}`.trim(),
    });
  }
  entries.sort(compareEntries); // value desc - oldest is largest
  assignRanksWithTies(entries);
  return entries;
}

// stat: 'wins' | 'titles'
// Team-boss leaderboards. Team docs carry `principals` (per-tenure stats
// attached by scripts/principals.mjs via build-archive); this aggregates the
// tenures BY PERSON across every team they ran, so Briatore's Benetton and
// Renault eras count as one career. Era splits use the per-tenure `classic`
// sub-bucket (pre-1981 share): classic = classic bucket, modern = total minus
// classic. stat: 'wins' | 'titles' | 'seasons'.
function pickPrincipalEraStats(p, era) {
  const zero = { seasons: 0, races: 0, wins: 0, titles: 0 };
  const classic = p.classic || zero;
  if (era === 'classic') return classic;
  if (era === 'modern') {
    return {
      seasons: p.seasons - (classic.seasons || 0),
      races: p.races - (classic.races || 0),
      wins: p.wins - (classic.wins || 0),
      titles: p.titles - (classic.titles || 0),
    };
  }
  return p;
}

export function generatePrincipalEntries(teams, stat, era, currentYear) {
  const byPerson = new Map();
  for (const t of teams) {
    for (const p of t.principals || []) {
      if (!byPerson.has(p.name)) byPerson.set(p.name, []);
      byPerson.get(p.name).push({ ...p, teamRef: t.constructorRef, teamName: t.name, teamColor: t.color || null });
    }
  }

  const entries = [];
  for (const [name, tenures] of byPerson) {
    let value = 0;
    let races = 0;
    let seasonsSum = 0;
    let bestTenure = null;
    let bestKey = [-1, -1, -1];
    const rangeYearCounts = new Map(); // year → number of tenures claiming it
    const eraTeamRefs = new Set();
    let firstYear = null;
    let lastYear = null;

    for (const p of tenures) {
      const s = pickPrincipalEraStats(p, era);
      // Era-clamp the tenure's year range (used for the years context, the
      // seasons overlap correction, and skipping out-of-era tenures). An
      // open-ended tenure clamps to currentYear, which formatYearsRange
      // renders as "present".
      const from = Math.max(p.from, era === 'modern' ? 1981 : -Infinity);
      const to = Math.min(p.to ?? currentYear, currentYear, era === 'classic' ? 1980 : Infinity);
      if (from > to) continue;

      races += s.races || 0;
      seasonsSum += s.seasons || 0;
      if (stat === 'wins') value += s.wins || 0;
      else if (stat === 'titles') value += s.titles || 0;

      for (let y = from; y <= to; y++) rangeYearCounts.set(y, (rangeYearCounts.get(y) || 0) + 1);
      if (firstYear == null || from < firstYear) firstYear = from;
      if (lastYear == null || to > lastYear) lastYear = to;
      eraTeamRefs.add(p.teamRef);

      // Primary team = the tenure with the most era wins, then seasons, then
      // the most recent - drives the entry's team colour / logo / link.
      const key = [s.wins || 0, s.seasons || 0, to];
      if (key[0] > bestKey[0] || (key[0] === bestKey[0] && (key[1] > bestKey[1] || (key[1] === bestKey[1] && key[2] > bestKey[2])))) {
        bestKey = key;
        bestTenure = p;
      }
    }

    if (stat === 'seasons') {
      // Attached seasons are actual raced years, but a same-year cross-team
      // handover (Mekies: Racing Bulls → Red Bull in 2025) would count that
      // year twice - subtract range overlaps.
      let overlap = 0;
      for (const count of rangeYearCounts.values()) if (count > 1) overlap += count - 1;
      value = seasonsSum - overlap;
    }
    if (value === 0 || !bestTenure) continue;

    const parts = name.trim().split(/\s+/);
    const last = parts.at(-1);
    const first = parts.slice(0, -1).join(' ') || null;
    const teamCount = eraTeamRefs.size;
    const yearsRange = formatYearsRange(firstYear, lastYear, currentYear);
    const context = teamCount > 1 ? `${yearsRange} · ${teamCount} teams` : yearsRange;

    entries.push({
      value,
      valueLabel: `${value} ${stat === 'wins' ? 'win' : stat === 'titles' ? 'title' : 'season'}${value === 1 ? '' : 's'}`,
      races,
      firstYear,
      name,
      first,
      last,
      shortName: first ? `${first[0]}. ${last}` : last,
      teamRef: bestTenure.teamRef,
      teamName: bestTenure.teamName,
      teamColor: bestTenure.teamColor,
      context,
    });
  }
  entries.sort(compareEntries);
  assignRanksWithTies(entries);
  return entries;
}

export function generateTeamCareerEntries(teams, stat, era, currentYear) {
  const entries = [];
  for (const t of teams) {
    // team-wins counts completed current-year races; team-titles loops
    // finalStandingByYear with its own current-year guard below.
    const rows = filterPerRaceByEra(t.perRace || [], era, currentYear, { includeCurrentYear: true });
    let value = 0;
    if (stat === 'wins') {
      value = rows.filter(r => r.position === 1).length;
    } else {
      // titles
      for (const yearStr of Object.keys(t.finalStandingByYear || {})) {
        const year = Number(yearStr);
        if (year === currentYear) continue;
        if (era === 'modern' && year < 1981) continue;
        if (era === 'classic' && year >= 1981) continue;
        if (t.finalStandingByYear[yearStr]?.position === 1) value++;
      }
    }
    if (value === 0) continue;

    const years = rows.map(r => r.year);
    const firstYear = years.length ? Math.min(...years) : null;
    const lastYear = years.length ? Math.max(...years) : null;

    entries.push({
      value,
      valueLabel: stat === 'wins' ? `${value} wins` : `${value} titles`,
      races: rows.length,
      firstYear,
      constructorRef: t.constructorRef,
      name: t.name,
      nationality: t.nationality || null,
      teamColor: t.color || null,
      context: formatYearsRange(firstYear, lastYear, currentYear),
    });
  }
  entries.sort(compareEntries);
  assignRanksWithTies(entries);
  return entries;
}

// results: array of all per-race result rows { year, round, constructorRef, position }
export function generateTeam12FinishesEntries(results, teamsByRef, era, currentYear) {
  // Group rows by (year-round)
  // A 1-2 finish is a completed-race fact, so completed current-year races count.
  const byRace = new Map();
  for (const r of results) {
    if (r.year == null) continue;
    if (era === 'modern' && r.year < 1981) continue;
    if (era === 'classic' && r.year >= 1981) continue;
    if (r.position !== 1 && r.position !== 2) continue;
    const key = `${r.year}-${r.round}`;
    if (!byRace.has(key)) byRace.set(key, { p1: null, p2: null, year: r.year });
    if (r.position === 1) byRace.get(key).p1 = r.constructorRef;
    if (r.position === 2) byRace.get(key).p2 = r.constructorRef;
  }

  // Count 1-2s per team
  const countByTeam = new Map();
  const firstYearByTeam = new Map();
  for (const { p1, p2, year } of byRace.values()) {
    if (p1 && p1 === p2) {
      countByTeam.set(p1, (countByTeam.get(p1) || 0) + 1);
      const fy = firstYearByTeam.get(p1);
      if (fy == null || year < fy) firstYearByTeam.set(p1, year);
    }
  }

  const entries = [];
  for (const [ref, value] of countByTeam) {
    const t = teamsByRef.get(ref);
    if (!t) continue;
    entries.push({
      value,
      valueLabel: `${value} 1-2 finishes`,
      races: 0,
      firstYear: firstYearByTeam.get(ref) || null,
      constructorRef: ref,
      name: t.name,
      nationality: t.nationality || null,
      teamColor: t.color || null,
      context: `from ${firstYearByTeam.get(ref) || '?'}`,
    });
  }
  entries.sort(compareEntries);
  assignRanksWithTies(entries);
  return entries;
}

// kind: 'wins' (position === 1) | 'poles' (grid === 1)
export function generateDriverAtCircuitEntries(drivers, kind, era, currentYear) {
  const predicate = kind === 'wins' ? (r) => r.position === 1 : (r) => r.grid === 1;
  const stat = kind === 'wins' ? 'wins' : 'poles';

  const entries = [];
  for (const d of drivers) {
    const rows = filterPerRaceByEra(d.perRace || [], era, currentYear, { includeCurrentYear: true }).filter(predicate);
    if (!rows.length) continue;

    // Group by circuitRef
    const byCircuit = new Map();
    for (const r of rows) {
      const cr = r.circuitRef || r.circuitId;
      if (!cr) continue;
      if (!byCircuit.has(cr)) byCircuit.set(cr, []);
      byCircuit.get(cr).push(r);
    }
    for (const [circuitRef, list] of byCircuit) {
      const years = list.map(r => r.year);
      const firstYear = Math.min(...years);
      const lastYear = Math.max(...years);
      const circuitName = list[0].circuitName || circuitRef;
      const team = primaryTeamFromRows(list);

      entries.push({
        value: list.length,
        valueLabel: `${list.length} ${stat}`,
        races: list.length,
        firstYear,
        driverRef: d.driverRef,
        name: `${d.forename || ''} ${d.surname || ''}`.trim(),
        first: d.forename || null,
        last: d.surname || null,
        shortName: shortName(d),
        code: d.code || null,
        flag: d.natInfo?.flag || null,
        country: d.natInfo?.country || null,
        teamRef: team.ref,
        teamName: team.name,
        teamColor: null,
        circuitRef,
        circuitName,
        context: `${circuitName} - ${formatYearsRange(firstYear, lastYear, currentYear)}`,
      });
    }
  }
  entries.sort(compareEntries);
  assignRanksWithTies(entries);
  return entries;
}
