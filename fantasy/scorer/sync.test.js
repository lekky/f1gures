import { describe, it, expect } from 'vitest';
import {
  advanceStatus, finalInstant, isSprintWeekend, lockInstant, planEntries, planRounds,
  planSeason, raceInstant, scoredRoundsOf, sessionInstant,
} from './lib/sync.js';

const sessions = (over = {}) => ({
  fp1: { date: '2026-08-21', time: '10:30:00Z' },
  q: { date: '2026-08-22', time: '14:00:00Z' },
  race: { date: '2026-08-23', time: '13:00:00Z' },
  ...over,
});

describe('sessionInstant', () => {
  it('combines date and time into an ISO instant', () => {
    expect(sessionInstant({ date: '2026-08-22', time: '14:00:00Z' })).toBe('2026-08-22T14:00:00.000Z');
  });

  it('assumes UTC when the time carries no zone', () => {
    expect(sessionInstant({ date: '2026-08-22', time: '14:00:00' })).toBe('2026-08-22T14:00:00.000Z');
  });

  it('returns null for a missing session', () => {
    expect(sessionInstant(null)).toBeNull();
    expect(sessionInstant({ time: '14:00:00Z' })).toBeNull();
  });
});

describe('lockInstant', () => {
  it('locks at qualifying on a normal weekend (§5)', () => {
    expect(lockInstant({ sessions: sessions() })).toBe('2026-08-22T14:00:00.000Z');
  });

  it('locks at sprint qualifying on a sprint weekend (§5)', () => {
    const cal = { sprint: true, sessions: sessions({ sprintQuali: { date: '2026-08-21', time: '14:30:00Z' }, sprint: { date: '2026-08-22', time: '10:00:00Z' } }) };
    expect(lockInstant(cal)).toBe('2026-08-21T14:30:00.000Z');
  });

  it('falls back to the first session actually held when quali is missing (§8)', () => {
    const cal = { sessions: { fp1: { date: '2026-08-21', time: '10:30:00Z' }, race: { date: '2026-08-23', time: '13:00:00Z' } } };
    expect(lockInstant(cal)).toBe('2026-08-21T10:30:00.000Z');
  });

  it('falls back to the race when there are no sessions at all', () => {
    expect(lockInstant({ date: '2026-08-23', time: '13:00:00Z' })).toBe('2026-08-23T13:00:00.000Z');
  });
});

describe('isSprintWeekend', () => {
  it('reads the flag or the sessions', () => {
    expect(isSprintWeekend({ sprint: true, sessions: {} })).toBe(true);
    expect(isSprintWeekend({ sessions: { sprintQuali: { date: '2026-08-21' } } })).toBe(true);
    expect(isSprintWeekend({ sprint: false, sessions: sessions() })).toBe(false);
  });
});

describe('raceInstant', () => {
  it('prefers the race session and falls back to the calendar stamp', () => {
    expect(raceInstant({ sessions: sessions() })).toBe('2026-08-23T13:00:00.000Z');
    expect(raceInstant({ date: '2026-08-23', time: '13:00:00Z', sessions: {} })).toBe('2026-08-23T13:00:00.000Z');
  });
});

describe('finalInstant', () => {
  it('is race + 7 days when the next lock is later (§9)', () => {
    expect(finalInstant('2026-08-23T13:00:00Z', '2026-09-05T14:00:00Z')).toBe('2026-08-30T13:00:00.000Z');
  });

  it('is the next round\'s lock when that comes first (§9)', () => {
    expect(finalInstant('2026-08-23T13:00:00Z', '2026-08-28T14:00:00Z')).toBe('2026-08-28T14:00:00.000Z');
  });

  it('is null without a race', () => {
    expect(finalInstant(null, null)).toBeNull();
  });
});

describe('planRounds', () => {
  const bundle = {
    calendar: [
      { round: 1, name: 'Round One', sessions: sessions() },
      { round: 2, name: 'Round Two', sessions: { q: { date: '2026-08-29', time: '14:00:00Z' }, race: { date: '2026-08-30', time: '13:00:00Z' } } },
      { round: 3, name: 'Round Three', sessions: { q: { date: '2026-09-05', time: '14:00:00Z' }, race: { date: '2026-09-06', time: '13:00:00Z' } } },
    ],
    results: { 1: { order: ['NOR'] }, 2: { order: ['NOR'] } },
  };

  it('marks a scored round provisional inside its window and final after it', () => {
    // Round 1's window ends at round 2's lock (2026-08-29T14:00Z).
    const before = planRounds(bundle, { now: '2026-08-25T00:00:00Z' });
    expect(before[0]).toMatchObject({ status: 'provisional', isSprint: false, locked: true });
    const after = planRounds(bundle, { now: '2026-08-31T00:00:00Z' });
    expect(after[0].status).toBe('final');
  });

  it('marks an unlocked round upcoming and a locked-but-unraced round locked', () => {
    const plans = planRounds(bundle, { now: '2026-09-05T15:00:00Z' });
    expect(plans[2]).toMatchObject({ round: 3, status: 'locked', hasResults: false });
    const earlier = planRounds(bundle, { now: '2026-09-01T00:00:00Z' });
    expect(earlier[2].status).toBe('upcoming');
  });
});

describe('advanceStatus', () => {
  it('only ever moves forward', () => {
    expect(advanceStatus('locked', 'provisional')).toBe('provisional');
    expect(advanceStatus('final', 'locked')).toBe('final');
    expect(advanceStatus(undefined, 'upcoming')).toBe('upcoming');
  });
});

describe('planSeason', () => {
  it('uses the rulebook caps on a 24-round calendar', () => {
    const bundle = { calendar: Array.from({ length: 24 }, (_, i) => ({ round: i + 1 })) };
    expect(planSeason(bundle, 2026)).toMatchObject({ capDriver: 5, capConstructor: 4, splitLength: 6, tierCount: 4, seedYear: 2025 });
  });

  it('scales the caps for a materially different calendar (§4)', () => {
    const bundle = { calendar: Array.from({ length: 12 }, (_, i) => ({ round: i + 1 })) };
    expect(planSeason(bundle, 2026)).toMatchObject({ capDriver: 3, capConstructor: 2 });
  });
});

describe('planEntries', () => {
  const bundle = {
    drivers: [
      { id: 'NOR', jolpicaId: 'norris', first: 'Lando', last: 'Norris', team: 'mclaren' },
      { id: 'VER', jolpicaId: 'max_verstappen', first: 'Max', last: 'Verstappen', team: 'redbull' },
      { id: 'SUB', jolpicaId: 'sub', first: 'Sub', last: 'Driver', team: '' },
    ],
    teams: [{ id: 'mclaren', name: 'McLaren' }, { id: 'redbull', name: 'Red Bull' }],
    results: {
      1: { order: ['NOR', 'VER'], detail: { NOR: { position: '1', team: 'mclaren' }, VER: { position: '2', team: 'redbull' } }, quali: {} },
      2: { order: ['NOR'], detail: { NOR: { position: '1', team: 'mclaren' } }, quali: {} },
    },
  };

  it('collects every driver seen and flags the latest grid active', () => {
    const entries = planEntries(bundle, scoredRoundsOf(bundle));
    expect(entries.map(e => e.code)).toEqual(['NOR', 'VER']);
    expect(entries.find(e => e.code === 'NOR')).toMatchObject({ driverRef: 'norris', name: 'Lando Norris', teamName: 'McLaren', active: true });
    // VER raced round 1 but not round 2 — still an entry, no longer active.
    expect(entries.find(e => e.code === 'VER').active).toBe(false);
  });

  it('excludes practice-only call-ups (no team in the roster, no classification)', () => {
    expect(planEntries(bundle, [1, 2]).some(e => e.code === 'SUB')).toBe(false);
  });
});
