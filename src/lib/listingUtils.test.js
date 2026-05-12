import { describe, it, expect } from 'vitest';
import { filterItems, sortItems, paginateItems, uniqueNationalities } from './listingUtils.js';

const DRIVERS = [
  { driverRef: 'hamilton', forename: 'Lewis', surname: 'Hamilton', nationality: 'British', firstYear: 2007, championships: 7, wins: 103 },
  { driverRef: 'schumacher', forename: 'Michael', surname: 'Schumacher', nationality: 'German', firstYear: 1991, championships: 7, wins: 91 },
  { driverRef: 'norris', forename: 'Lando', surname: 'Norris', nationality: 'British', firstYear: 2019, championships: 0, wins: 4 },
  { driverRef: 'albon', forename: 'Alexander', surname: 'Albon', nationality: 'Thai', firstYear: 2019, championships: 0, wins: 0 },
];

const TEAMS = [
  { constructorRef: 'ferrari', name: 'Ferrari', nationality: 'Italian', championships: 16, wins: 243 },
  { constructorRef: 'mclaren', name: 'McLaren', nationality: 'British', championships: 8, wins: 183 },
  { constructorRef: 'williams', name: 'Williams', nationality: 'British', championships: 7, wins: 114 },
];

describe('filterItems', () => {
  it('returns all items when no filters set', () => {
    expect(filterItems(DRIVERS, { search: '', nationality: '' })).toHaveLength(4);
  });
  it('filters drivers by name case-insensitively', () => {
    const result = filterItems(DRIVERS, { search: 'hamilton', nationality: '' });
    expect(result).toHaveLength(1);
    expect(result[0].driverRef).toBe('hamilton');
  });
  it('filters teams by name', () => {
    const result = filterItems(TEAMS, { search: 'mclaren', nationality: '' });
    expect(result).toHaveLength(1);
    expect(result[0].constructorRef).toBe('mclaren');
  });
  it('filters by nationality', () => {
    expect(filterItems(DRIVERS, { search: '', nationality: 'British' })).toHaveLength(2);
  });
  it('applies search and nationality together (AND logic)', () => {
    const result = filterItems(DRIVERS, { search: 'norris', nationality: 'British' });
    expect(result).toHaveLength(1);
    expect(result[0].driverRef).toBe('norris');
  });
  it('returns empty when no match', () => {
    expect(filterItems(DRIVERS, { search: 'zzz', nationality: '' })).toHaveLength(0);
  });
});

describe('sortItems', () => {
  it('sorts by championships desc', () => {
    const result = sortItems(DRIVERS, { field: 'championships', dir: 'desc' });
    expect(result[0].championships).toBeGreaterThanOrEqual(result[1].championships);
  });
  it('sorts by wins asc', () => {
    const result = sortItems(DRIVERS, { field: 'wins', dir: 'asc' });
    expect(result[0].wins).toBeLessThanOrEqual(result[1].wins);
  });
  it('sorts by surname alphabetically asc', () => {
    const result = sortItems(DRIVERS, { field: 'surname', dir: 'asc' });
    expect(result[0].surname).toBe('Albon');
  });
  it('sorts teams by name asc', () => {
    const result = sortItems(TEAMS, { field: 'name', dir: 'asc' });
    expect(result[0].name).toBe('Ferrari');
  });
  it('sorts by firstYear desc', () => {
    const result = sortItems(DRIVERS, { field: 'firstYear', dir: 'desc' });
    expect(result[0].firstYear).toBeGreaterThanOrEqual(result[1].firstYear);
  });
  it('does not mutate the original array', () => {
    const copy = [...DRIVERS];
    sortItems(DRIVERS, { field: 'wins', dir: 'asc' });
    expect(DRIVERS).toEqual(copy);
  });
});

describe('paginateItems', () => {
  it('returns first page', () => {
    const { items, totalPages } = paginateItems(DRIVERS, { page: 1, pageSize: 2 });
    expect(items).toHaveLength(2);
    expect(totalPages).toBe(2);
  });
  it('returns correct second page', () => {
    const { items } = paginateItems(DRIVERS, { page: 2, pageSize: 2 });
    expect(items[0].driverRef).toBe('norris');
  });
  it('returns empty array for page beyond total', () => {
    const { items } = paginateItems(DRIVERS, { page: 99, pageSize: 2 });
    expect(items).toHaveLength(0);
  });
  it('returns all items when pageSize exceeds total', () => {
    const { items, totalPages } = paginateItems(DRIVERS, { page: 1, pageSize: 100 });
    expect(items).toHaveLength(4);
    expect(totalPages).toBe(1);
  });
});

describe('uniqueNationalities', () => {
  it('returns sorted unique nationality list', () => {
    expect(uniqueNationalities(DRIVERS)).toEqual(['British', 'German', 'Thai']);
  });
  it('ignores null/undefined nationality values', () => {
    const items = [{ nationality: 'British' }, { nationality: null }, { nationality: undefined }];
    expect(uniqueNationalities(items)).toEqual(['British']);
  });
});
