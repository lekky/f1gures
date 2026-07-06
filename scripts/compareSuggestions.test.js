import { describe, it, expect } from 'vitest';
import { buildCompareSuggestions } from './compareSuggestions.mjs';

const D = (driverRef, forename, surname, o = {}) => ({
  driverRef, forename, surname,
  championships: o.c || 0, wins: o.w || 0, races: o.r || 0,
  firstYear: o.f || 2000, lastYear: o.l || 2005, nationality: o.nat || 'British',
  teamColor: o.color || '#111',
});
const T = (constructorRef, name, o = {}) => ({
  constructorRef, name, championships: o.c || 0, wins: o.w || 0,
  firstYear: o.f || 1990, lastYear: o.l || 2000, color: o.color || '#222', nationality: 'British',
});

const driverIndex = [
  D('senna', 'Ayrton', 'Senna', { c: 3, w: 41, r: 161, nat: 'Brazilian' }),
  D('prost', 'Alain', 'Prost', { c: 4, w: 51, r: 199, nat: 'French' }),
  D('fangio', 'Juan', 'Fangio', { c: 5, w: 24, r: 51, f: 1950, l: 1958, nat: 'Argentine' }),
  D('hamilton', 'Lewis', 'Hamilton', { c: 7, w: 105, r: 350, f: 2007, l: 2024, nat: 'British' }),
  D('button', 'Jenson', 'Button', { c: 1, w: 15, r: 306, f: 2000, l: 2017, nat: 'British' }),
  D('mansell', 'Nigel', 'Mansell', { c: 1, w: 31, r: 187, f: 1980, l: 1995, nat: 'British' }),
  D('noface', 'No', 'Face', { c: 1, w: 10 }),                    // has no face → excluded
];
const driverDocs = [
  { driverRef: 'senna', teammates: { byMate: [
    { driverRef: 'prost', name: 'Alain Prost', surname: 'Prost', firstYear: 1988, lastYear: 1989, weekends: 32 },
    { driverRef: 'button', name: 'Jenson Button', surname: 'Button', firstYear: 1994, lastYear: 1994, weekends: 16 },
    { driverRef: 'noface', name: 'No Face', surname: 'Face', firstYear: 1990, lastYear: 1990, weekends: 16 },
  ] } },
];
const teamsIndex = [
  T('ferrari', 'Ferrari', { c: 16, w: 240 }),
  T('mclaren', 'McLaren', { c: 8, w: 180 }),
  T('williams', 'Williams', { c: 9, w: 114 }),
  T('minnow', 'Minnow', { c: 0, w: 0 }),                          // not notable → excluded
];
const opts = {
  driverIndex, teamsIndex, driverDocs,
  hasDriverFace: (r) => r !== 'noface',
  hasTeamLogo: () => true,
  curatedDrivers: [{ a: 'senna', b: 'prost', tag: 'The rivalry', reason: 'Iconic.' }],
  curatedTeams: [{ a: 'ferrari', b: 'mclaren', tag: 'Big two', reason: 'Rivals.' }],
};

describe('buildCompareSuggestions', () => {
  const out = buildCompareSuggestions(opts);

  it('folds the curated seed in first with its hand-written reason', () => {
    expect(out.driver[0]).toMatchObject({ a: 'senna', b: 'prost', tag: 'The rivalry', reason: 'Iconic.' });
    expect(out.team[0]).toMatchObject({ tag: 'Big two' });
  });

  it('enriches both sides with label, name and colour', () => {
    const c = out.driver[0];
    expect(c.aLabel).toBe('Senna');
    expect(c.aName).toBe('Ayrton Senna');
    expect(c.bColor).toBe('#111');
  });

  it('never emits a face-less driver or a self-pair', () => {
    for (const m of out.driver) {
      expect(m.a).not.toBe('noface');
      expect(m.b).not.toBe('noface');
      expect(m.a).not.toBe(m.b);
    }
  });

  it('excludes non-notable teams (no wins, no titles)', () => {
    const refs = new Set(out.team.flatMap((m) => [m.a, m.b]));
    expect(refs.has('minnow')).toBe(false);
  });

  it('produces no duplicate pairs (curated wins over generated)', () => {
    const keys = out.driver.map((m) => [m.a, m.b].sort().join('|'));
    expect(new Set(keys).size).toBe(keys.length);
    // senna|prost appears once, as the curated entry
    expect(out.driver.filter((m) => [m.a, m.b].sort().join('|') === 'prost|senna')).toHaveLength(1);
  });

  it('generates data-derived reasons (title twins, cross-era, teammates)', () => {
    const reasons = out.driver.map((m) => m.reason).join(' | ');
    expect(reasons).toMatch(/World Champion/);      // title twins / cross-era
    expect(out.driver.some((m) => m.tag === 'Teammates')).toBe(true);
  });

  it('is deterministic — same input yields identical output', () => {
    expect(JSON.stringify(buildCompareSuggestions(opts))).toBe(JSON.stringify(out));
  });

  it('respects the caps', () => {
    const capped = buildCompareSuggestions({ ...opts, caps: { driver: 3, team: 1 } });
    expect(capped.driver).toHaveLength(3);
    expect(capped.team).toHaveLength(1);
  });
});
