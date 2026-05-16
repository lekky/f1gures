// scripts/records/generators.test.js
import { describe, it, expect } from 'vitest';
import { generateDriverCareerEntries, generateWinsInSeasonEntries, generateStreakEntries, generateTitleMarginEntries, generateYoungestChampionEntries, generateOldestWinnerEntries, generateTeamCareerEntries, generateTeam12FinishesEntries } from './generators.mjs';

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

describe('generateTitleMarginEntries', () => {
  // yearStandings[year] = { p1: {driverRef, name, points, surname}, p2: {...} }
  const yearStandings = {
    1992: { p1: { driverRef: 'mansell', name: 'Nigel Mansell', surname: 'Mansell', points: 108 },
            p2: { driverRef: 'patrese', name: 'Riccardo Patrese', surname: 'Patrese', points: 56 } },
    2023: { p1: { driverRef: 'max_verstappen', name: 'Max Verstappen', surname: 'Verstappen', points: 575 },
            p2: { driverRef: 'perez', name: 'Sergio Perez', surname: 'Pérez', points: 285 } },
    1976: { p1: { driverRef: 'hunt', name: 'James Hunt', surname: 'Hunt', points: 69 },
            p2: { driverRef: 'lauda', name: 'Niki Lauda', surname: 'Lauda', points: 68 } },
  };
  const driversByRef = new Map([
    ['mansell',        { driverRef: 'mansell',        forename: 'Nigel', surname: 'Mansell',  code: 'MAN', natInfo: { country: 'GB', flag: 'X' } }],
    ['max_verstappen', { driverRef: 'max_verstappen', forename: 'Max',   surname: 'Verstappen', code: 'VER', natInfo: { country: 'NL', flag: 'Y' } }],
    ['hunt',           { driverRef: 'hunt',           forename: 'James', surname: 'Hunt',     code: 'HUN', natInfo: { country: 'GB', flag: 'Z' } }],
  ]);

  it('returns one entry per year, sorted by margin desc', () => {
    const entries = generateTitleMarginEntries(yearStandings, driversByRef, 'all-time', 2026);
    expect(entries[0].driverRef).toBe('max_verstappen');
    expect(entries[0].value).toBe(290);
    expect(entries[0].context).toBe('2023 - beat Pérez');
    expect(entries[1].driverRef).toBe('mansell');
  });

  it('modern era drops 1976', () => {
    const entries = generateTitleMarginEntries(yearStandings, driversByRef, 'modern', 2026);
    expect(entries.find(e => e.context.startsWith('1976'))).toBeUndefined();
  });
});

describe('generateYoungestChampionEntries', () => {
  const drivers = [{
    driverRef: 'max_verstappen', forename: 'Max', surname: 'Verstappen', code: 'VER',
    dob: '1997-09-30', natInfo: { country: 'NL', flag: 'X' },
    perRace: [{ year: 2021, round: 22, position: 1, date: '2021-12-12', constructorRef: 'red_bull', constructorName: 'Red Bull' }],
    finalStandingByYear: { 2021: { position: 1 } },
  }];
  const finalRoundDateByYear = { 2021: '2021-12-12' };

  it('uses age at final-round date of the first championship', () => {
    const entries = generateYoungestChampionEntries(drivers, finalRoundDateByYear, 'all-time', 2026);
    expect(entries[0].driverRef).toBe('max_verstappen');
    expect(entries[0].value).toBeLessThan(25 * 365); // value is age in days
    expect(entries[0].valueLabel).toMatch(/24y \d+d/);
  });
});

describe('generateOldestWinnerEntries', () => {
  const drivers = [{
    driverRef: 'farina', forename: 'Nino', surname: 'Farina', code: 'FAR',
    dob: '1906-10-30', natInfo: { country: 'IT', flag: 'X' },
    perRace: [
      { year: 1953, round: 7, position: 1, date: '1953-09-13', constructorRef: 'ferrari', constructorName: 'Ferrari' },
      { year: 1955, round: 3, position: 5, date: '1955-05-22', constructorRef: 'ferrari', constructorName: 'Ferrari' },
    ],
  }];

  it('uses the oldest race-winning date', () => {
    const entries = generateOldestWinnerEntries(drivers, 'all-time', 2026);
    expect(entries[0].driverRef).toBe('farina');
    expect(entries[0].valueLabel).toMatch(/46y \d+d/);
  });
});

describe('generateTeamCareerEntries', () => {
  const teams = [
    {
      constructorRef: 'ferrari', name: 'Ferrari', nationality: 'Italian', color: '#E80020',
      perRace: [
        { year: 1979, round: 1, position: 1 },
        { year: 1979, round: 2, position: 1 },
        { year: 2000, round: 3, position: 1 },
      ],
      finalStandingByYear: { 1979: { position: 1 }, 2000: { position: 1 } },
    },
    {
      constructorRef: 'mercedes', name: 'Mercedes', nationality: 'German', color: '#27F4D2',
      perRace: [
        { year: 2014, round: 1, position: 1 },
        { year: 2014, round: 2, position: 1 },
      ],
      finalStandingByYear: { 2014: { position: 1 } },
    },
  ];

  it('team-wins counts position === 1 per result', () => {
    const entries = generateTeamCareerEntries(teams, 'wins', 'all-time', 2026);
    expect(entries[0].constructorRef).toBe('ferrari');
    expect(entries[0].value).toBe(3);
  });

  it('team-titles counts championship years', () => {
    const entries = generateTeamCareerEntries(teams, 'titles', 'all-time', 2026);
    expect(entries[0].value).toBe(2);
  });

  it('modern era drops 1979', () => {
    const entries = generateTeamCareerEntries(teams, 'wins', 'modern', 2026);
    const ferrari = entries.find(e => e.constructorRef === 'ferrari');
    expect(ferrari.value).toBe(1);
  });

  it('attaches teamColor and context', () => {
    const entries = generateTeamCareerEntries(teams, 'wins', 'all-time', 2026);
    expect(entries[0].teamColor).toBe('#E80020');
    expect(entries[0].context).toBe('1979-2000');
  });
});

describe('generateTeam12FinishesEntries', () => {
  // Each result row: { year, round, constructorRef, position }
  const results = [
    { year: 2014, round: 1, constructorRef: 'mercedes', position: 1 },
    { year: 2014, round: 1, constructorRef: 'mercedes', position: 2 },
    { year: 2014, round: 2, constructorRef: 'mercedes', position: 1 },
    { year: 2014, round: 2, constructorRef: 'mercedes', position: 2 },
    { year: 2014, round: 3, constructorRef: 'mercedes', position: 1 },
    { year: 2014, round: 3, constructorRef: 'red_bull', position: 2 },
    { year: 1979, round: 1, constructorRef: 'mclaren', position: 1 },
    { year: 1979, round: 1, constructorRef: 'mclaren', position: 2 },
  ];
  const teamsByRef = new Map([
    ['mercedes', { constructorRef: 'mercedes', name: 'Mercedes', color: '#27F4D2' }],
    ['mclaren',  { constructorRef: 'mclaren',  name: 'McLaren',  color: '#FF8000' }],
  ]);

  it('counts races where the same team holds P1+P2', () => {
    const entries = generateTeam12FinishesEntries(results, teamsByRef, 'all-time', 2026);
    expect(entries[0].constructorRef).toBe('mercedes');
    expect(entries[0].value).toBe(2);
    expect(entries[1].constructorRef).toBe('mclaren');
    expect(entries[1].value).toBe(1);
  });

  it('era filter excludes pre-1981', () => {
    const entries = generateTeam12FinishesEntries(results, teamsByRef, 'modern', 2026);
    expect(entries.find(e => e.constructorRef === 'mclaren')).toBeUndefined();
  });
});
