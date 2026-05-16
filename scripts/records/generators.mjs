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

import { filterPerRaceByEra, formatYearsRange, compareEntries, assignRanksWithTies } from './helpers.mjs';

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
