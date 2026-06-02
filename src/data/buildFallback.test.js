import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildFromYearJson } from './buildFallback.js';

// Regression test for the standings bug where computeStandings ignored the
// authoritative per-driver points the bundle ships in `results[r].detail`
// and `results[r].sprintResults.detail`, and instead approximated both
// (race FL +1 bonus that the FIA dropped in 2025; sprint points derived
// from main race finishing order rather than the actual sprint result).
//
// The numbers below are the real 2026 World Championship standings after
// 5 rounds, taken from the official F1 standings table. If these drift,
// the bundle has been refreshed and the expectations need updating - but
// the home page Top 3 and the standings page MUST always agree, so any
// change here should be matched by re-checking both screens.

const bundle = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/2026.json'), 'utf8')
);

describe('buildFromYearJson computeStandings (2026 bundle)', () => {
  const D = buildFromYearJson(bundle);
  const { drivers, teams } = D.computeStandings();
  const byCode = Object.fromEntries(drivers.map(r => [r.driver.id, r]));
  const byTeam = Object.fromEntries(teams.map(r => [r.team.id, r]));

  it('uses canonical race points from results[r].detail.<code>.points', () => {
    // ANT was P1 in 4 of 5 rounds. Without the canonical-points fix the
    // old code paid an extra +1 FL bonus on rounds where ANT had the
    // fastest lap, inflating the total.
    expect(byCode.ANT.points).toBe(131);
    expect(byCode.ANT.wins).toBe(4);
  });

  it('uses canonical sprint points from sprintResults.detail.<code>.points', () => {
    // RUS scored 0 race points at R5 (P11) but won the R5 sprint (8 pts).
    // The old code would have given him a phantom 7 pts because he was
    // also not in the main race top 8 - the only reliable signal is
    // sprintResults.
    expect(byCode.RUS.points).toBe(88);
    expect(byCode.HAM.points).toBe(72);
    expect(byCode.LEC.points).toBe(75);
  });

  it('constructor standings = sum of each constructor\'s driver points', () => {
    // The site cross-checks visually: the Top 3 panel on / and the
    // /standings-constructors/ page both read computeStandings, so
    // these have to add up correctly.
    expect(byTeam.mercedes.points).toBe(byCode.ANT.points + byCode.RUS.points);
    expect(byTeam.mercedes.points).toBe(219);
    expect(byTeam.ferrari.points).toBe(byCode.LEC.points + byCode.HAM.points);
    expect(byTeam.ferrari.points).toBe(147);
  });

  it('ranks drivers in the order the official standings show', () => {
    const top5 = drivers.slice(0, 5).map(r => r.driver.id);
    expect(top5).toEqual(['ANT', 'RUS', 'LEC', 'HAM', 'NOR']);
  });

  it('ranks constructors in the order the official standings show', () => {
    const top3 = teams.slice(0, 3).map(r => r.team.id);
    expect(top3).toEqual(['mercedes', 'ferrari', 'mclaren']);
  });
});

describe('buildFromYearJson computeStandings (legacy fallback)', () => {
  // Older bundles (pre-detail) only carry `order`, `fastest`,
  // `sprintWinner`. Make sure those still produce a non-zero
  // championship table via the legacy 25-18-15... approximation, so we
  // don't regress historic seasons.
  const legacy = {
    seasonYear: '1999',
    teams: [
      { id: 't1', name: 'Alpha', short: 'AL', color: '#000' },
      { id: 't2', name: 'Beta',  short: 'BE', color: '#111' },
    ],
    drivers: [
      { id: 'AA', first: 'Ann',  last: 'Apple',  team: 't1', num: 1 },
      { id: 'BB', first: 'Bob',  last: 'Berry',  team: 't1', num: 2 },
      { id: 'CC', first: 'Cal',  last: 'Cherry', team: 't2', num: 3 },
      { id: 'DD', first: 'Dee',  last: 'Date',   team: 't2', num: 4 },
    ],
    calendar: [{ round: 1, name: 'Race', circuit: 'x', date: '1999-01-01' }],
    results: {
      1: {
        order: ['AA', 'BB', 'CC', 'DD'],
        fastest: 'AA',
        pole: 'AA',
        dnfs: [],
      },
    },
  };
  const { drivers } = buildFromYearJson(legacy).computeStandings();
  const byCode = Object.fromEntries(drivers.map(r => [r.driver.id, r]));

  it('uses 25-18-15-12 + 1 FL when bundle has no detail map', () => {
    expect(byCode.AA.points).toBe(25 + 1); // P1 + FL
    expect(byCode.BB.points).toBe(18);
    expect(byCode.CC.points).toBe(15);
    expect(byCode.DD.points).toBe(12);
  });
});
