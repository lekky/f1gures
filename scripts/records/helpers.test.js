// scripts/records/helpers.test.js
import { describe, it, expect } from 'vitest';
import { filterPerRaceByEra, assignRanksWithTies, MODERN_ERA_START_YEAR, formatAge, formatYearsRange, compareEntries } from './helpers.mjs';

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

describe('formatAge', () => {
  it('returns "<years>y <days>d" for a normal age', () => {
    // 25 years, 100 days from 1990-01-01 to ~2015-04-11
    expect(formatAge('1990-01-01', '2015-04-11')).toBe('25y 100d');
  });

  it('handles February correctly across non-leap years', () => {
    expect(formatAge('2000-02-01', '2001-02-01')).toBe('1y 0d');
  });

  it('returns null on missing input', () => {
    expect(formatAge(null, '2020-01-01')).toBeNull();
    expect(formatAge('2000-01-01', null)).toBeNull();
  });
});

describe('formatYearsRange', () => {
  it('joins first and last with an en-dash equivalent', () => {
    expect(formatYearsRange(2007, 2023)).toBe('2007-2023');
  });

  it('returns just the year when first === last', () => {
    expect(formatYearsRange(1958, 1958)).toBe('1958');
  });

  it('appends "present" when lastYear matches the current year', () => {
    expect(formatYearsRange(2019, 2026, 2026)).toBe('2019-present');
  });
});

describe('compareEntries', () => {
  it('sorts by value descending', () => {
    const out = [{ value: 1 }, { value: 5 }, { value: 3 }].sort(compareEntries);
    expect(out.map(e => e.value)).toEqual([5, 3, 1]);
  });

  it('breaks ties by races ascending', () => {
    const out = [
      { value: 5, races: 100 },
      { value: 5, races: 50 },
      { value: 5, races: 75 },
    ].sort(compareEntries);
    expect(out.map(e => e.races)).toEqual([50, 75, 100]);
  });

  it('falls back to firstYear ascending', () => {
    const out = [
      { value: 5, races: 50, firstYear: 2010 },
      { value: 5, races: 50, firstYear: 1990 },
    ].sort(compareEntries);
    expect(out[0].firstYear).toBe(1990);
  });
});
