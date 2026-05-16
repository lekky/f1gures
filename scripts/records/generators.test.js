// scripts/records/generators.test.js
import { describe, it, expect } from 'vitest';
import { generateDriverCareerEntries, generateWinsInSeasonEntries, generateStreakEntries } from './generators.mjs';

const DRIVERS = [
  {
    driverRef: 'hamilton', forename: 'Lewis', surname: 'Hamilton', code: 'HAM',
    nationality: 'British', dob: '1985-01-07',
    natInfo: { country: 'GB', flag: '🇬🇧' },
    perRace: [
      { year: 2007, round: 1, position: 3, grid: 4, fastestLapRank: null, constructorRef: 'mclaren', constructorName: 'McLaren' },
      { year: 2008, round: 6, position: 1, grid: 1, fastestLapRank: 1, constructorRef: 'mclaren', constructorName: 'McLaren' },
      { year: 2014, round: 1, position: 1, grid: 1, fastestLapRank: null, constructorRef: 'mercedes', constructorName: 'Mercedes' },
      { year: 2020, round: 1, position: 1, grid: 1, fastestLapRank: null, constructorRef: 'mercedes', constructorName: 'Mercedes' },
    ],
    finalStandingByYear: { 2008: { position: 1 }, 2014: { position: 1 }, 2020: { position: 1 } },
  },
  {
    driverRef: 'norris', forename: 'Lando', surname: 'Norris', code: 'NOR',
    nationality: 'British', dob: '1999-11-13',
    natInfo: { country: 'GB', flag: '🇬🇧' },
    perRace: [
      { year: 2024, round: 5, position: 1, grid: 1, fastestLapRank: null, constructorRef: 'mclaren', constructorName: 'McLaren' },
      { year: 2024, round: 7, position: 2, grid: 2, fastestLapRank: null, constructorRef: 'mclaren', constructorName: 'McLaren' },
    ],
    finalStandingByYear: {},
  },
];

describe('generateDriverCareerEntries - wins', () => {
  it('all-time: hamilton has 3 wins, norris 1', () => {
    const entries = generateDriverCareerEntries(DRIVERS, 'wins', 'all-time', 2026);
    expect(entries[0].driverRef).toBe('hamilton');
    expect(entries[0].value).toBe(3);
    expect(entries[1].driverRef).toBe('norris');
    expect(entries[1].value).toBe(1);
  });

  it('current-year rows excluded - norris drops to 0 wins and is filtered out', () => {
    const entries = generateDriverCareerEntries(DRIVERS, 'wins', 'all-time', 2024);
    const norris = entries.find(e => e.driverRef === 'norris');
    expect(norris).toBeUndefined();
  });

  it('modern-era filter drops a pre-1981 row', () => {
    const drivers = [{
      driverRef: 'lauda', forename: 'Niki', surname: 'Lauda', code: 'LAU',
      dob: '1949-02-22', natInfo: { country: 'AT', flag: 'X' },
      perRace: [
        { year: 1975, round: 1, position: 1, grid: 1, fastestLapRank: null, constructorRef: 'ferrari', constructorName: 'Ferrari' },
        { year: 1984, round: 1, position: 1, grid: 1, fastestLapRank: null, constructorRef: 'mclaren', constructorName: 'McLaren' },
      ],
      finalStandingByYear: { 1975: { position: 1 }, 1984: { position: 1 } },
    }];
    expect(generateDriverCareerEntries(drivers, 'wins', 'all-time', 2026)[0].value).toBe(2);
    expect(generateDriverCareerEntries(drivers, 'wins', 'modern',   2026)[0].value).toBe(1);
  });

  it('attaches teamRef / context / flag / shortName / valueLabel', () => {
    const entries = generateDriverCareerEntries(DRIVERS, 'wins', 'all-time', 2026);
    const ham = entries.find(e => e.driverRef === 'hamilton');
    expect(ham.teamRef).toBe('mercedes'); // most-raced team
    expect(ham.flag).toBe('🇬🇧');
    expect(ham.shortName).toBe('L. Hamilton');
    expect(ham.context).toBe('2007-2020');
    expect(ham.valueLabel).toBe('3 wins');
  });
});

describe('generateDriverCareerEntries - other stats', () => {
  it('podiums counts position <= 3', () => {
    const entries = generateDriverCareerEntries(DRIVERS, 'podiums', 'all-time', 2026);
    expect(entries[0].driverRef).toBe('hamilton');
    expect(entries[0].value).toBe(4); // P3, P1, P1, P1
  });

  it('poles counts grid === 1', () => {
    const entries = generateDriverCareerEntries(DRIVERS, 'poles', 'all-time', 2026);
    expect(entries[0].value).toBe(3); // hamilton: 2008, 2014, 2020
  });

  it('championships counts finalStandingByYear with position === 1, era-aware', () => {
    expect(generateDriverCareerEntries(DRIVERS, 'championships', 'all-time', 2026)[0].value).toBe(3);
    // currentYear excludes 2020
    expect(generateDriverCareerEntries(DRIVERS, 'championships', 'all-time', 2020)[0].value).toBe(2);
  });

  it('starts counts every perRace row', () => {
    const entries = generateDriverCareerEntries(DRIVERS, 'starts', 'all-time', 2026);
    expect(entries[0].value).toBe(4); // hamilton
  });

  it('fastest-laps counts fastestLapRank === 1', () => {
    const entries = generateDriverCareerEntries(DRIVERS, 'fastest-laps', 'all-time', 2026);
    expect(entries[0].value).toBe(1); // hamilton, 2008 only
  });
});

describe('generateWinsInSeasonEntries', () => {
  const drivers = [
    {
      driverRef: 'verstappen', forename: 'Max', surname: 'Verstappen', code: 'VER',
      dob: '1997-09-30', natInfo: { country: 'NL', flag: '🇳🇱' },
      perRace: [
        { year: 2023, round: 1, position: 1, constructorRef: 'red_bull', constructorName: 'Red Bull' },
        { year: 2023, round: 2, position: 1, constructorRef: 'red_bull', constructorName: 'Red Bull' },
        { year: 2023, round: 3, position: 1, constructorRef: 'red_bull', constructorName: 'Red Bull' },
        { year: 2022, round: 1, position: 1, constructorRef: 'red_bull', constructorName: 'Red Bull' },
      ],
    },
  ];

  it('returns the best season per driver', () => {
    const entries = generateWinsInSeasonEntries(drivers, 'all-time', 2026);
    expect(entries[0].value).toBe(3);
    expect(entries[0].context).toBe('2023 - Red Bull');
  });

  it('era filter excludes pre-1981', () => {
    const drivers81 = [{
      ...drivers[0], perRace: [
        { year: 1976, round: 1, position: 1, constructorRef: 'mclaren', constructorName: 'McLaren' },
        { year: 1976, round: 2, position: 1, constructorRef: 'mclaren', constructorName: 'McLaren' },
      ],
    }];
    expect(generateWinsInSeasonEntries(drivers81, 'modern', 2026)).toHaveLength(0);
  });
});

describe('generateStreakEntries - win-streak', () => {
  const drivers = [{
    driverRef: 'vettel', forename: 'Sebastian', surname: 'Vettel', code: 'VET',
    dob: '1987-07-03', natInfo: { country: 'DE', flag: '🇩🇪' },
    perRace: [
      { year: 2013, round: 12, position: 2, constructorRef: 'red_bull', constructorName: 'Red Bull' },
      { year: 2013, round: 13, position: 1, constructorRef: 'red_bull', constructorName: 'Red Bull' },
      { year: 2013, round: 14, position: 1, constructorRef: 'red_bull', constructorName: 'Red Bull' },
      { year: 2013, round: 15, position: 1, constructorRef: 'red_bull', constructorName: 'Red Bull' },
      { year: 2013, round: 16, position: 1, constructorRef: 'red_bull', constructorName: 'Red Bull' },
      { year: 2013, round: 17, position: 2, constructorRef: 'red_bull', constructorName: 'Red Bull' }, // breaks
      { year: 2013, round: 18, position: 1, constructorRef: 'red_bull', constructorName: 'Red Bull' }, // restart
    ],
  }];

  it('finds the longest run of consecutive wins', () => {
    const entries = generateStreakEntries(drivers, 'win', 'all-time', 2026);
    expect(entries[0].value).toBe(4);
    expect(entries[0].context).toMatch(/2013/);
  });

  it('era filter breaks streaks across the boundary', () => {
    const cross = [{
      ...drivers[0], perRace: [
        { year: 1980, round: 14, position: 1, constructorRef: 'mclaren', constructorName: 'McLaren' },
        { year: 1981, round: 1, position: 1, constructorRef: 'mclaren', constructorName: 'McLaren' },
        { year: 1981, round: 2, position: 1, constructorRef: 'mclaren', constructorName: 'McLaren' },
      ],
    }];
    const modern = generateStreakEntries(cross, 'win', 'modern', 2026);
    expect(modern[0].value).toBe(2);
  });
});

describe('generateStreakEntries - podium-streak', () => {
  const drivers = [{
    driverRef: 'hamilton', forename: 'Lewis', surname: 'Hamilton', code: 'HAM',
    natInfo: { country: 'GB', flag: '' },
    perRace: [
      { year: 2014, round: 1, position: 3, constructorRef: 'mercedes', constructorName: 'Mercedes' },
      { year: 2014, round: 2, position: 1, constructorRef: 'mercedes', constructorName: 'Mercedes' },
      { year: 2014, round: 3, position: 2, constructorRef: 'mercedes', constructorName: 'Mercedes' },
      { year: 2014, round: 4, position: 5, constructorRef: 'mercedes', constructorName: 'Mercedes' }, // breaks
      { year: 2014, round: 5, position: 1, constructorRef: 'mercedes', constructorName: 'Mercedes' },
    ],
  }];

  it('counts top-3 streaks', () => {
    const entries = generateStreakEntries(drivers, 'podium', 'all-time', 2026);
    expect(entries[0].value).toBe(3);
  });
});
