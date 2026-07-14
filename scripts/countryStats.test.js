import { describe, it, expect } from 'vitest';
import { buildCountryStats, isRetirement, COUNTRY_METRICS } from './countryStats.mjs';

// Minimal driver-doc factory matching the shape build-archive hands the final
// pass: natInfo attached, career totals, perRace rows with a `status`.
function driver(ref, over = {}) {
  return {
    driverRef: ref,
    forename: ref[0].toUpperCase() + ref.slice(1),
    surname: 'X',
    nationality: 'British',
    natInfo: { country: 'GB', flag: '🇬🇧' },
    career: { wins: 0, poles: 0, podiums: 0, championships: 0 },
    perRace: [],
    ...over,
  };
}

function races(...statuses) {
  return statuses.map((status) => ({ status }));
}

describe('isRetirement', () => {
  it('treats Finished and lapped finishes as classified', () => {
    expect(isRetirement('Finished')).toBe(false);
    expect(isRetirement('+1 Lap')).toBe(false);
    expect(isRetirement('+2 Laps')).toBe(false);
  });
  it('treats mechanical / accident / other statuses as DNFs', () => {
    expect(isRetirement('Engine')).toBe(true);
    expect(isRetirement('Accident')).toBe(true);
    expect(isRetirement('Collision')).toBe(true);
  });
  it('ignores empty/unknown status', () => {
    expect(isRetirement('')).toBe(false);
    expect(isRetirement(null)).toBe(false);
  });
});

describe('buildCountryStats', () => {
  it('exposes the canonical metric list', () => {
    const { metrics } = buildCountryStats([]);
    expect(metrics).toEqual(COUNTRY_METRICS);
  });

  it('groups drivers by ISO country and sums career metrics', () => {
    const docs = [
      driver('hamilton', { career: { wins: 100, poles: 100, podiums: 190, championships: 7 } }),
      driver('stewart', { career: { wins: 27, poles: 17, podiums: 43, championships: 3 } }),
    ];
    const { countries } = buildCountryStats(docs);
    expect(countries.GB.drivers).toBe(2);
    expect(countries.GB.wins).toBe(127);
    expect(countries.GB.poles).toBe(117);
    expect(countries.GB.championships).toBe(10);
    expect(countries.GB.flag).toBe('🇬🇧');
    expect(countries.GB.nationality).toBe('British');
  });

  it('merges different demonyms that resolve to the same ISO code', () => {
    const docs = [
      driver('a', { nationality: 'German', natInfo: { country: 'DE', flag: '🇩🇪' }, career: { wins: 5 } }),
      driver('b', { nationality: 'German', natInfo: { country: 'DE', flag: '🇩🇪' }, career: { wins: 3 } }),
      driver('c', { nationality: 'East German', natInfo: { country: 'DE', flag: '🇩🇪' }, career: { wins: 1 } }),
    ];
    const { countries } = buildCountryStats(docs);
    expect(countries.DE.drivers).toBe(3);
    expect(countries.DE.wins).toBe(9);
    // Representative demonym = the most common one.
    expect(countries.DE.nationality).toBe('German');
  });

  it('counts career DNFs from perRace status', () => {
    const docs = [
      driver('x', { perRace: races('Finished', 'Engine', '+1 Lap', 'Accident', 'Gearbox') }),
    ];
    const { countries } = buildCountryStats(docs);
    expect(countries.GB.dnfs).toBe(3); // Engine, Accident, Gearbox
  });

  it('tracks the top driver per metric', () => {
    // wins leader and titles leader differ, so top must be tracked per metric.
    const docs = [
      driver('hamilton', { career: { wins: 100, championships: 2 } }),
      driver('stewart', { career: { wins: 27, championships: 3 } }),
    ];
    const { countries } = buildCountryStats(docs);
    expect(countries.GB.top.wins).toMatchObject({ driverRef: 'hamilton', value: 100 });
    expect(countries.GB.top.championships).toMatchObject({ driverRef: 'stewart', value: 3, name: 'Stewart X' });
  });

  it('skips drivers with an unknown nationality', () => {
    const docs = [
      driver('nobody', { nationality: null, natInfo: { country: '', flag: '🏳' } }),
      driver('hamilton', { career: { wins: 5 } }),
    ];
    const { countries } = buildCountryStats(docs);
    expect(Object.keys(countries)).toEqual(['GB']);
    expect(countries.GB.drivers).toBe(1);
  });

  it('omits a top entry for a metric no driver has scored', () => {
    const docs = [driver('a', { career: { wins: 0, poles: 0, podiums: 0, championships: 0 } })];
    const { countries } = buildCountryStats(docs);
    expect(countries.GB.top.wins).toBeUndefined();
    expect(countries.GB.drivers).toBe(1);
  });
});
