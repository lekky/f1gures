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
    const rows = filterPerRaceByEra(d.perRace || [], era, currentYear);

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
    const filteredAll = filterPerRaceByEra(d.perRace || [], era, currentYear);
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

    const row = yearStandings[yearStr];
    if (!row?.p1 || !row?.p2) continue;
    const margin = (row.p1.points || 0) - (row.p2.points || 0);
    if (margin <= 0) continue;

    const champ = driversByRef.get(row.p1.driverRef);
    entries.push({
      value: margin,
      valueLabel: `${margin} pts`,
      races: 0,
      firstYear: year,
      driverRef: row.p1.driverRef,
      name: row.p1.name,
      shortName: champ ? shortName(champ) : row.p1.name,
      code: champ?.code || null,
      flag: champ?.natInfo?.flag || null,
      country: champ?.natInfo?.country || null,
      teamRef: null,        // filled by orchestrator from the per-driver season team
      teamName: null,
      teamColor: null,
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
      .filter(y => y !== currentYear && (era !== 'modern' || y >= 1981));
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
    const rows = filterPerRaceByEra(d.perRace || [], era, currentYear)
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
