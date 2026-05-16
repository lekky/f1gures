// scripts/records/helpers.test.js
import { describe, it, expect } from 'vitest';
import { filterPerRaceByEra, assignRanksWithTies, MODERN_ERA_START_YEAR } from './helpers.mjs';

describe('filterPerRaceByEra', () => {
  const rows = [
    { year: 1976, round: 1 },
    { year: 1980, round: 14 },
    { year: 1981, round: 1 },
    { year: 2024, round: 24 },
  ];

  it('returns all rows for "all-time"', () => {
    expect(filterPerRaceByEra(rows, 'all-time', 2026)).toHaveLength(4);
  });

  it('drops pre-1981 rows for "modern"', () => {
    const out = filterPerRaceByEra(rows, 'modern', 2026);
    expect(out).toHaveLength(2);
    expect(out.every(r => r.year >= MODERN_ERA_START_YEAR)).toBe(true);
  });

  it('drops in-progress current year for both eras', () => {
    const withCurrent = [...rows, { year: 2026, round: 5 }];
    expect(filterPerRaceByEra(withCurrent, 'all-time', 2026)).toHaveLength(4);
    expect(filterPerRaceByEra(withCurrent, 'modern', 2026)).toHaveLength(2);
  });
});

describe('assignRanksWithTies', () => {
  it('assigns 1,2,3 to strict ordering', () => {
    const entries = [{ value: 10 }, { value: 8 }, { value: 5 }];
    assignRanksWithTies(entries);
    expect(entries.map(e => e.rank)).toEqual([1, 2, 3]);
  });

  it('ties share a rank and the next rank skips', () => {
    const entries = [{ value: 10 }, { value: 10 }, { value: 8 }, { value: 8 }, { value: 5 }];
    assignRanksWithTies(entries);
    expect(entries.map(e => e.rank)).toEqual([1, 1, 3, 3, 5]);
  });

  it('empty array is a no-op', () => {
    expect(() => assignRanksWithTies([])).not.toThrow();
  });
});
