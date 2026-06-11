// f1gures - season data factory.
//
// buildFromYearJson(json) turns a /data/<year>.json bundle into the data
// object the islands and Astro pages consume. When no bundle exists the
// caller passes {} and gets an empty-but-valid shape (currentSeason.js does
// this and sets _empty: true so screens can render explicit placeholders).
//
// The speculative hand-written grid that used to live here is gone on
// purpose: prerendered HTML must only ever contain real results.

import { computeStandings as computeSeasonStandings } from '../lib/seasonStats.mjs';

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

  // Single shared implementation - see src/lib/seasonStats.mjs.
  function computeStandings() {
    return computeSeasonStandings({ drivers, teams, results });
  }

  return {
    teams, drivers, calendar, circuits: staticCircuits, results, POINTS, seasonYear,
    driverById, teamById, computeStandings,
    _source: 'year-json',
    __rawSeason: { teams, drivers, calendar, results },
  };
}
