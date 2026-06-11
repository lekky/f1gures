import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { racePointsMap, sprintPointsMap, roundPointsMap, computeStandings } from './seasonStats.mjs';

describe('racePointsMap', () => {
  it('prefers canonical detail points when present', () => {
    const result = {
      order: ['AAA', 'BBB'],
      detail: { AAA: { points: 25 }, BBB: { points: 18 } },
    };
    expect(racePointsMap(result)).toEqual({ AAA: 25, BBB: 18 });
  });

  it('does not add the legacy FL +1 on the canonical path', () => {
    const result = {
      order: ['AAA', 'BBB'],
      fastest: 'AAA',
      detail: { AAA: { points: 25 }, BBB: { points: 18 } },
    };
    expect(racePointsMap(result).AAA).toBe(25);
  });

  it('falls back to 25-18-... + FL bonus when detail is missing', () => {
    const result = { order: ['AAA', 'BBB', 'CCC'], fastest: 'BBB' };
    expect(racePointsMap(result)).toEqual({ AAA: 25, BBB: 19, CCC: 15 });
  });

  it('gives 0 (not approximation) to drivers missing from an otherwise-canonical detail map', () => {
    const result = {
      order: ['AAA', 'BBB'],
      detail: { AAA: { points: 25 } },
    };
    expect(racePointsMap(result)).toEqual({ AAA: 25, BBB: 0 });
  });
});

describe('sprintPointsMap', () => {
  it('prefers canonical sprint detail', () => {
    const result = {
      order: ['BBB', 'AAA'], // race order differs from sprint result
      sprintResults: { detail: { AAA: { points: 8 }, BBB: { points: 7 } } },
    };
    expect(sprintPointsMap(result)).toEqual({ AAA: 8, BBB: 7 });
  });

  it('falls back to sprint order 8-7-6-...', () => {
    const result = { sprintResults: { order: ['AAA', 'BBB', 'CCC'] } };
    expect(sprintPointsMap(result)).toEqual({ AAA: 8, BBB: 7, CCC: 6 });
  });

  it('last-resort approximation from race order when only sprintWinner is known', () => {
    const result = { order: ['BBB', 'AAA', 'CCC'], sprintWinner: 'AAA' };
    expect(sprintPointsMap(result)).toEqual({ AAA: 8, BBB: 7, CCC: 6 });
  });

  it('returns empty map when the round had no sprint', () => {
    expect(sprintPointsMap({ order: ['AAA'] })).toEqual({});
  });
});

describe('roundPointsMap', () => {
  it('sums race and sprint points per driver', () => {
    const result = {
      order: ['AAA', 'BBB'],
      detail: { AAA: { points: 25 }, BBB: { points: 18 } },
      sprintResults: { detail: { AAA: { points: 7 }, BBB: { points: 8 } } },
    };
    expect(roundPointsMap(result)).toEqual({ AAA: 32, BBB: 26 });
  });

  it('memoizes per result object', () => {
    const result = { order: ['AAA'], detail: { AAA: { points: 25 } } };
    expect(roundPointsMap(result)).toBe(roundPointsMap(result));
  });
});

describe('computeStandings sprint awareness', () => {
  const season = {
    drivers: [
      { id: 'AAA', team: 't1' },
      { id: 'BBB', team: 't2' },
    ],
    teams: [
      { id: 't1' },
      { id: 't2' },
    ],
    results: {
      1: {
        pole: 'AAA', fastest: 'AAA',
        order: ['AAA', 'BBB'],
        detail: { AAA: { points: 25 }, BBB: { points: 18 } },
        sprintResults: { detail: { AAA: { points: 7 }, BBB: { points: 8 } } },
      },
    },
  };

  it('includes sprint points in driver totals', () => {
    const st = computeStandings(season);
    expect(st.drivers[0].driver.id).toBe('AAA');
    expect(st.drivers[0].points).toBe(32);
    expect(st.drivers[1].points).toBe(26);
  });

  it('includes sprint points in team totals', () => {
    const st = computeStandings(season);
    expect(st.teams.find(t => t.team.id === 't1').points).toBe(32);
    expect(st.teams.find(t => t.team.id === 't2').points).toBe(26);
  });

  it('breaks points ties by wins', () => {
    const tied = {
      drivers: [
        { id: 'AAA', team: 't1' },
        { id: 'BBB', team: 't2' },
      ],
      teams: [{ id: 't1' }, { id: 't2' }],
      results: {
        1: { order: ['AAA', 'BBB'], detail: { AAA: { points: 25 }, BBB: { points: 18 } } },
        2: { order: ['BBB', 'CCC', 'AAA'], detail: { BBB: { points: 25 }, CCC: { points: 18 }, AAA: { points: 18 } } },
      },
    };
    const st = computeStandings(tied);
    // AAA 43 (1 win) vs BBB 43 (1 win) - stable; CCC ensure()'d but unranked (no team)
    expect(st.drivers[0].points).toBe(43);
    expect(st.drivers[1].points).toBe(43);
    expect(st.drivers.length).toBe(2);
  });
});

// Regression against the real committed bundle: 2025 championship totals
// must include sprint points (NOR 423 vs VER 421, not 394 vs 389).
describe('computeStandings on the 2025 bundle', () => {
  const bundlePath = resolve(process.cwd(), 'public', 'data', '2025.json');
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
  const st = computeStandings(bundle);
  const byCode = Object.fromEntries(st.drivers.map(r => [r.driver.id, r]));

  it('matches the official top-3 with sprint points included', () => {
    expect(byCode.NOR.points).toBe(423);
    expect(byCode.VER.points).toBe(421);
    expect(byCode.PIA.points).toBe(410);
    expect(byCode.NOR.position).toBe(1);
  });

  it('ranks Hamilton ahead of Antonelli (sprint points flip the race-only order)', () => {
    expect(byCode.HAM.position).toBeLessThan(byCode.ANT.position);
  });
});
