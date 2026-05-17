// scripts/records/index.mjs
//
// Top-level entry point. Called once from build-archive.mjs after all driver/
// team archive docs are written.
//
// buildRecords({ driverDocs, teamDocs, yearStandings, finalRoundDateByYear,
//                allResults, teamColorByRef, currentYear })
//   returns { index, byTopic } — JSON-serialisable shapes per the spec.

import { RECORD_CONFIGS, GROUPS, TOP5, TOP50 } from './configs.mjs';
import {
  generateDriverCareerEntries,
  generateWinsInSeasonEntries,
  generateStreakEntries,
  generateTitleMarginEntries,
  generateYoungestChampionEntries,
  generateOldestWinnerEntries,
  generateTeamCareerEntries,
  generateTeam12FinishesEntries,
  generateDriverAtCircuitEntries,
} from './generators.mjs';

function dispatch(configId, driverDocs, teamDocs, yearStandings, finalRoundDateByYear, allResults, era, currentYear) {
  const driversByRef = new Map(driverDocs.map(d => [d.driverRef, d]));
  const teamsByRef = new Map(teamDocs.map(t => [t.constructorRef, t]));

  switch (configId) {
    case 'wins':
    case 'podiums':
    case 'poles':
    case 'championships':
    case 'starts':
    case 'fastest-laps':
      return generateDriverCareerEntries(driverDocs, configId, era, currentYear);
    case 'wins-in-season':
      return generateWinsInSeasonEntries(driverDocs, era, currentYear);
    case 'podium-streak':
      return generateStreakEntries(driverDocs, 'podium', era, currentYear);
    case 'win-streak':
      return generateStreakEntries(driverDocs, 'win', era, currentYear);
    case 'title-margin':
      return generateTitleMarginEntries(yearStandings, driversByRef, era, currentYear);
    case 'youngest-champion':
      return generateYoungestChampionEntries(driverDocs, finalRoundDateByYear, era, currentYear);
    case 'oldest-winner':
      return generateOldestWinnerEntries(driverDocs, era, currentYear);
    case 'team-titles':
      return generateTeamCareerEntries(teamDocs, 'titles', era, currentYear);
    case 'team-wins':
      return generateTeamCareerEntries(teamDocs, 'wins', era, currentYear);
    case 'team-1-2-finishes':
      return generateTeam12FinishesEntries(allResults, teamsByRef, era, currentYear);
    case 'wins-at-circuit':
      return generateDriverAtCircuitEntries(driverDocs, 'wins', era, currentYear);
    case 'poles-at-circuit':
      return generateDriverAtCircuitEntries(driverDocs, 'poles', era, currentYear);
    default:
      throw new Error(`Unknown record id: ${configId}`);
  }
}

function attachTeamColor(entries, teamColorByRef) {
  for (const e of entries) {
    if (e.teamColor) continue;
    if (e.teamRef && teamColorByRef.has(e.teamRef)) e.teamColor = teamColorByRef.get(e.teamRef);
  }
}

function strip(entry) {
  // Drop internal fields not needed in JSON output
  const { ...rest } = entry;
  delete rest.firstYear;
  delete rest.races;
  return rest;
}

export function buildRecords({
  driverDocs,
  teamDocs,
  yearStandings,
  finalRoundDateByYear,
  allResults,
  teamColorByRef,
  currentYear,
}) {
  const byTopic = {};
  const indexRecordsByGroup = new Map(GROUPS.map(g => [g.id, []]));

  for (const cfg of RECORD_CONFIGS) {
    const allTime = dispatch(cfg.id, driverDocs, teamDocs, yearStandings, finalRoundDateByYear, allResults, 'all-time', currentYear);
    const modern  = dispatch(cfg.id, driverDocs, teamDocs, yearStandings, finalRoundDateByYear, allResults, 'modern',   currentYear);
    const classic = dispatch(cfg.id, driverDocs, teamDocs, yearStandings, finalRoundDateByYear, allResults, 'classic',  currentYear);

    attachTeamColor(allTime, teamColorByRef);
    attachTeamColor(modern,  teamColorByRef);
    attachTeamColor(classic, teamColorByRef);

    const top5 = allTime.slice(0, TOP5).map(strip);
    const modernTop5 = modern.slice(0, TOP5).map(strip);
    const classicTop5 = classic.slice(0, TOP5).map(strip);

    byTopic[cfg.id] = {
      id: cfg.id,
      title: cfg.title,
      blurb: cfg.blurb,
      subjectType: cfg.subjectType,
      valueFormat: cfg.valueFormat,
      note: cfg.note || null,
      allTime: { top50: allTime.slice(0, TOP50).map(strip) },
      modern:  { top50: modern.slice(0, TOP50).map(strip) },
      classic: { top50: classic.slice(0, TOP50).map(strip) },
    };

    indexRecordsByGroup.get(cfg.group).push({
      id: cfg.id,
      title: cfg.title,
      blurb: cfg.blurb,
      stat: cfg.id,
      valueFormat: cfg.valueFormat,
      subjectType: cfg.subjectType,
      allTime: { top5 },
      modern:  { top5: modernTop5 },
      classic: { top5: classicTop5 },
    });
  }

  const index = {
    generatedAt: new Date().toISOString(),
    groups: GROUPS.map(g => ({
      id: g.id,
      label: g.label,
      records: indexRecordsByGroup.get(g.id),
    })),
  };

  return { index, byTopic };
}
