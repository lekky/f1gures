import { describe, it, expect } from 'vitest';
import { findGridGaps, GRIDDED } from './check-fastf1-grid.mjs';

const drivers = (grids) => grids.map((g, i) => ({ code: `D${i}`, grid: g }));

describe('findGridGaps', () => {
  it('flags a race session where no driver has a grid slot', () => {
    const gaps = findGridGaps([
      { year: 2026, round: 13, session: 'race', drivers: drivers([null, null, null]) },
    ]);
    expect(gaps).toEqual([{ year: 2026, round: 13, session: 'race', drivers: 3 }]);
  });

  it('ignores a session where any driver has a slot', () => {
    // One null is a real pit-lane start, not a publishing gap - it happens in
    // the archive (2021 R22, 2022 R2, 2023 R15) and is not a defect.
    expect(findGridGaps([
      { year: 2022, round: 2, session: 'race', drivers: drivers([1, 2, null]) },
    ])).toEqual([]);
  });

  it('ignores sessions that do not start from a grid', () => {
    expect(findGridGaps([
      { year: 2026, round: 13, session: 'q', drivers: drivers([null, null]) },
      { year: 2026, round: 13, session: 'fp1', drivers: drivers([null, null]) },
    ])).toEqual([]);
  });

  it('covers sprints as well as races', () => {
    const gaps = findGridGaps([
      { year: 2026, round: 12, session: 'sprint', drivers: drivers([null, null]) },
    ]);
    expect(gaps.map((g) => g.session)).toEqual(['sprint']);
    expect(GRIDDED).toContain('sprint');
  });

  it('ignores an empty driver list rather than reporting a phantom gap', () => {
    expect(findGridGaps([{ year: 2026, round: 1, session: 'race', drivers: [] }])).toEqual([]);
    expect(findGridGaps([{ year: 2026, round: 1, session: 'race' }])).toEqual([]);
  });

  it('sorts by year, then round, then session', () => {
    const gaps = findGridGaps([
      { year: 2026, round: 13, session: 'race', drivers: drivers([null]) },
      { year: 2025, round: 4, session: 'race', drivers: drivers([null]) },
      { year: 2026, round: 2, session: 'sprint', drivers: drivers([null]) },
      { year: 2026, round: 2, session: 'race', drivers: drivers([null]) },
    ]);
    expect(gaps.map((g) => `${g.year}/${g.round}/${g.session}`))
      .toEqual(['2025/4/race', '2026/2/race', '2026/2/sprint', '2026/13/race']);
  });

  it('handles no input at all', () => {
    expect(findGridGaps([])).toEqual([]);
    expect(findGridGaps(undefined)).toEqual([]);
  });
});
