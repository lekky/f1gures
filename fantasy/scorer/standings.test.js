import { describe, it, expect } from 'vitest';
import { buildStandings, compareStandings, splitOf, splitScope } from './lib/standings.js';

const row = (rows, scope, user) => rows.find(r => r.scope === scope && r.user === user);

describe('splitOf', () => {
  it('cuts the season every 6 rounds (§11)', () => {
    expect([1, 6, 7, 12, 13, 15].map(r => splitOf(r, 6))).toEqual([1, 1, 2, 2, 3, 3]);
    expect(splitScope(3)).toBe('split-3');
  });
});

describe('buildStandings', () => {
  const results = [
    { user: 'u1', round: 6, total: 100 },
    { user: 'u2', round: 6, total: 120 },
    { user: 'u1', round: 7, total: 200 },
    { user: 'u2', round: 7, total: 50 },
  ];

  it('splits the season at the six-round boundary', () => {
    const rows = buildStandings({ results, scoredRounds: [6, 7], splitLength: 6 });
    expect(row(rows, 'split-1', 'u1').points).toBe(100);
    expect(row(rows, 'split-2', 'u1').points).toBe(200);
    expect(row(rows, 'season', 'u1').points).toBe(300);
  });

  it('records the tie-break facts: best weekend and weeks as top scorer (§11)', () => {
    const rows = buildStandings({ results, scoredRounds: [6, 7], splitLength: 6 });
    expect(row(rows, 'season', 'u1')).toMatchObject({ bestWeekend: 200, weeksTop: 1 });
    expect(row(rows, 'season', 'u2')).toMatchObject({ bestWeekend: 120, weeksTop: 1 });
  });

  it('counts a tied round as a top-scoring weekend for everyone tied', () => {
    const tied = [{ user: 'u1', round: 1, total: 90 }, { user: 'u2', round: 1, total: 90 }];
    const rows = buildStandings({ results: tied, scoredRounds: [1], splitLength: 6 });
    expect(row(rows, 'season', 'u1').weeksTop).toBe(1);
    expect(row(rows, 'season', 'u2').weeksTop).toBe(1);
  });

  it('awards a Split win only once every round in the Split is settled', () => {
    const full = [1, 2, 3, 4, 5, 6].flatMap(r => [
      { user: 'u1', round: r, total: 10 },
      { user: 'u2', round: r, total: 5 },
    ]);
    const rounds = [1, 2, 3, 4, 5, 6];
    const partial = buildStandings({ results: full, scoredRounds: rounds, completeRounds: [1, 2, 3], splitLength: 6 });
    expect(row(partial, 'season', 'u1').splitWins).toBe(0);
    const settled = buildStandings({ results: full, scoredRounds: rounds, completeRounds: rounds, splitLength: 6 });
    expect(row(settled, 'season', 'u1').splitWins).toBe(1);
    expect(row(settled, 'season', 'u2').splitWins).toBe(0);
  });

  it('never counts an incomplete Split — round 7 alone is not Split 2 won', () => {
    const rows = buildStandings({ results, scoredRounds: [6, 7], completeRounds: [6, 7], splitLength: 6 });
    expect(row(rows, 'season', 'u1').splitWins).toBe(0);
  });

  it('keeps splitWins at 0 inside a Split scope (§11: season ties only)', () => {
    const full = [1, 2, 3, 4, 5, 6].map(r => ({ user: 'u1', round: r, total: 10 }));
    const rows = buildStandings({ results: full, scoredRounds: [1, 2, 3, 4, 5, 6], completeRounds: [1, 2, 3, 4, 5, 6], splitLength: 6 });
    expect(row(rows, 'split-1', 'u1').splitWins).toBe(0);
    expect(row(rows, 'season', 'u1').splitWins).toBe(1);
  });

  it('ignores results for rounds that have not been scored', () => {
    const rows = buildStandings({ results, scoredRounds: [6], splitLength: 6 });
    expect(row(rows, 'season', 'u1').points).toBe(100);
    expect(row(rows, 'split-2', 'u1')).toBeUndefined();
  });
});

describe('compareStandings', () => {
  it('applies the §11 order: points, Split wins, best weekend, weeks on top', () => {
    const a = { user: 'a', points: 100, splitWins: 0, bestWeekend: 90, weeksTop: 1 };
    const b = { user: 'b', points: 100, splitWins: 1, bestWeekend: 50, weeksTop: 0 };
    expect([a, b].sort(compareStandings)[0].user).toBe('b');

    const c = { user: 'c', points: 100, splitWins: 0, bestWeekend: 95, weeksTop: 0 };
    expect([a, c].sort(compareStandings)[0].user).toBe('c');

    const d = { user: 'd', points: 100, splitWins: 0, bestWeekend: 90, weeksTop: 3 };
    expect([a, d].sort(compareStandings)[0].user).toBe('d');
  });

  it('leaves a genuine tie in a stable, deterministic order (§11 shared position)', () => {
    const a = { user: 'a', points: 10, splitWins: 0, bestWeekend: 10, weeksTop: 0 };
    const b = { user: 'b', points: 10, splitWins: 0, bestWeekend: 10, weeksTop: 0 };
    expect([b, a].sort(compareStandings).map(r => r.user)).toEqual(['a', 'b']);
  });
});
