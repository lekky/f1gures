import { describe, it, expect } from 'vitest';
import {
  compareDrivers, compareTeams, driverContext, teamContext, isClassified, fmtVal,
} from './compareStats.js';

// ── minimal driver-doc factory ───────────────────────────────────
function driver(ref, over = {}) {
  return {
    driverRef: ref,
    forename: ref[0].toUpperCase() + ref.slice(1),
    surname: ref[0].toUpperCase() + ref.slice(1),
    code: ref.slice(0, 3).toUpperCase(),
    dob: '1990-01-01',
    nationality: 'British',
    career: { seasons: 5, firstYear: 2015, lastYear: 2019, races: 100, wins: 10, podiums: 30, poles: 8, fastestLaps: 5, championships: 1 },
    perSeason: [{ year: 2019, constructorRef: 'mercedes', constructorName: 'Mercedes', position: 1, points: 400, wins: 5, races: 20 }],
    perRace: [],
    teammates: { quali: { wins: 0, losses: 0 }, race: { wins: 0, losses: 0 }, byMate: [] },
    ...over,
  };
}

describe('isClassified', () => {
  it('accepts numeric finishes and rejects letter-coded retirements', () => {
    expect(isClassified({ position: 3, positionText: '3' })).toBe(true);
    expect(isClassified({ position: 5, positionText: null })).toBe(true);
    expect(isClassified({ position: null, positionText: 'R' })).toBe(false);
    expect(isClassified({ position: 12, positionText: 'R' })).toBe(false);
  });
});

describe('compareDrivers — rows + winners', () => {
  const a = driver('alpha', { career: { seasons: 7, firstYear: 2010, lastYear: 2016, races: 120, wins: 40, podiums: 70, poles: 35, fastestLaps: 20, championships: 4 } });
  const b = driver('bravo', { career: { seasons: 5, firstYear: 2012, lastYear: 2016, races: 90, wins: 20, podiums: 40, poles: 15, fastestLaps: 10, championships: 1 } });
  const cmp = compareDrivers(a, b);

  it('marks the higher career total as the winner', () => {
    const wins = cmp.groups[0].rows.find((r) => r.key === 'wins');
    expect(wins.a).toBe(40);
    expect(wins.b).toBe(20);
    expect(wins.winner).toBe('a');
  });

  it('treats avg finish as lower-is-better', () => {
    const av = driver('av', { perRace: [{ year: 2015, round: 1, position: 2, positionText: '2' }, { year: 2015, round: 2, position: 4, positionText: '4' }] });
    const bv = driver('bv', { perRace: [{ year: 2015, round: 1, position: 8, positionText: '8' }] });
    const c = compareDrivers(av, bv);
    const avg = c.groups[1].rows.find((r) => r.key === 'avgFinish');
    expect(avg.better).toBe('lo');
    expect(avg.winner).toBe('a'); // 3.0 avg beats 8.0
  });

  it('produces a verdict tally that favours the stronger driver', () => {
    expect(cmp.verdict.a).toBeGreaterThan(cmp.verdict.b);
    expect(cmp.verdict.lead).toBe('a');
  });
});

describe('driverContext — the rivalry join', () => {
  it('detects a teammate duel from the byMate index', () => {
    const a = driver('alpha', {
      teammates: { quali: { wins: 5, losses: 3 }, race: { wins: 4, losses: 4 }, byMate: [
        { driverRef: 'bravo', name: 'Bravo B', firstYear: 2015, lastYear: 2016, weekends: 40, quali: { wins: 22, losses: 18 }, race: { wins: 21, losses: 17 } },
      ] },
    });
    const ctx = driverContext(a, driver('bravo'));
    expect(ctx.type).toBe('teammate');
    expect(ctx.weekends).toBe(40);
    expect(ctx.quali.wins).toBe(22);
  });

  it('computes on-track head-to-head over shared races when never teammates', () => {
    const a = driver('alpha', { perRace: [
      { year: 2018, round: 1, position: 1, positionText: '1' },
      { year: 2018, round: 2, position: 5, positionText: '5' },
      { year: 2018, round: 3, position: null, positionText: 'R' },
    ] });
    const b = driver('bravo', { perRace: [
      { year: 2018, round: 1, position: 3, positionText: '3' },
      { year: 2018, round: 2, position: 2, positionText: '2' },
      { year: 2018, round: 3, position: 4, positionText: '4' },
    ] });
    const ctx = driverContext(a, b);
    expect(ctx.type).toBe('rival');
    expect(ctx.shared).toBe(3);
    expect(ctx.decided).toBe(2); // round 3 undecided (a DNF)
    expect(ctx.aAhead).toBe(1);  // round 1
    expect(ctx.bAhead).toBe(1);  // round 2
  });

  it('falls back to different-eras when there are no shared races', () => {
    const a = driver('alpha', { career: { firstYear: 1988, lastYear: 1994, seasons: 7, races: 100, wins: 40, podiums: 60, poles: 60, fastestLaps: 20, championships: 3 }, perRace: [{ year: 1990, round: 1, position: 1, positionText: '1' }] });
    const b = driver('bravo', { career: { firstYear: 2007, lastYear: 2020, seasons: 14, races: 260, wins: 90, podiums: 160, poles: 90, fastestLaps: 50, championships: 6 }, perRace: [{ year: 2010, round: 1, position: 1, positionText: '1' }] });
    const ctx = driverContext(a, b);
    expect(ctx.type).toBe('era');
    expect(ctx.overlap).toBe(false);
  });
});

describe('compareTeams', () => {
  function team(ref, over = {}) {
    return {
      constructorRef: ref, name: ref, short: ref.slice(0, 3).toUpperCase(), color: '#E80020', nationality: 'Italian',
      career: { seasons: 30, firstYear: 1990, lastYear: 2019, races: 500, wins: 100, podiums: 300, championships: 6, driverCount: 40 },
      perSeason: [{ year: 2019, drivers: [{ driverRef: 'x', name: 'X' }], position: 2, points: 500, wins: 5, races: 21 }],
      bestSeason: { year: 2004, position: 1, points: 262, wins: 15, races: 18, winRate: 0.83, tagline: 'Dominance', drivers: [] },
      ...over,
    };
  }

  it('finds shared-season title record and drivers who raced for both', () => {
    const a = team('ateam', {
      perSeason: [
        { year: 2018, drivers: [{ driverRef: 'nico', name: 'Nico' }], position: 1, points: 600, wins: 10, races: 21 },
        { year: 2019, drivers: [{ driverRef: 'lewis', name: 'Lewis' }], position: 1, points: 700, wins: 12, races: 21 },
      ],
    });
    const b = team('bteam', {
      perSeason: [
        { year: 2018, drivers: [{ driverRef: 'nico', name: 'Nico' }], position: 3, points: 300, wins: 1, races: 21 },
        { year: 2019, drivers: [{ driverRef: 'seb', name: 'Seb' }], position: 2, points: 500, wins: 3, races: 21 },
      ],
    });
    const ctx = teamContext(a, b);
    expect(ctx.shared).toBe(2);
    expect(ctx.aAhead).toBe(2);
    expect(ctx.bAhead).toBe(0);
    expect(ctx.sharedDrivers.map((d) => d.driverRef)).toContain('nico');
    expect(ctx.sharedDrivers.map((d) => d.driverRef)).not.toContain('seb');
  });

  it('builds grouped rows and a verdict', () => {
    const cmp = compareTeams(team('a'), team('b'));
    expect(cmp.kind).toBe('team');
    expect(cmp.groups[0].rows.length).toBeGreaterThan(0);
    expect(cmp.verdict).toHaveProperty('of');
  });
});

describe('fmtVal', () => {
  it('formats by type', () => {
    expect(fmtVal(null, 'int')).toBe('–');
    expect(fmtVal(28.25, 'pct')).toBe('28.3%');
    expect(fmtVal(2.04, 'dec1')).toBe('2.0');
    expect(fmtVal(4980, 'int')).toBe('4980');
    expect(fmtVal(12345, 'int')).toBe('12,345');
  });
});
