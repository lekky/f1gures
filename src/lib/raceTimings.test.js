import { describe, it, expect } from 'vitest';
import { parseClock, raceGapSeconds, bestQualiSeconds } from './raceTimings.js';

describe('parseClock', () => {
  it('parses h:mm:ss.sss', () => {
    expect(parseClock('1:31:44.742')).toBeCloseTo(5504.742, 3);
  });
  it('parses m:ss.sss', () => {
    expect(parseClock('1:29.179')).toBeCloseTo(89.179, 3);
  });
  it('parses bare seconds', () => {
    expect(parseClock('44.742')).toBeCloseTo(44.742, 3);
  });
  it('rejects junk and empties', () => {
    expect(parseClock('DNF')).toBeNull();
    expect(parseClock('')).toBeNull();
    expect(parseClock(null)).toBeNull();
    expect(parseClock('+1 Lap')).toBeNull();
  });
});

describe('raceGapSeconds', () => {
  it('returns 0 for the leader absolute time', () => {
    expect(raceGapSeconds('1:31:44.742')).toBe(0);
  });
  it('parses a seconds delta', () => {
    expect(raceGapSeconds('+22.457')).toBeCloseTo(22.457, 3);
  });
  it('parses a minute delta', () => {
    expect(raceGapSeconds('+1:05.200')).toBeCloseTo(65.2, 3);
  });
  it('returns null for lapped cars', () => {
    expect(raceGapSeconds('+1 Lap')).toBeNull();
    expect(raceGapSeconds('+2 Laps')).toBeNull();
  });
  it('returns null for missing / status strings', () => {
    expect(raceGapSeconds(null)).toBeNull();
    expect(raceGapSeconds('Retired')).toBeNull();
  });
});

describe('bestQualiSeconds', () => {
  it('takes the fastest of Q1/Q2/Q3', () => {
    expect(bestQualiSeconds({ q1: '1:30.5', q2: '1:29.8', q3: '1:29.179' }))
      .toBeCloseTo(89.179, 3);
  });
  it('handles a Q1 knockout (only q1 present)', () => {
    expect(bestQualiSeconds({ q1: '1:31.000', q2: '', q3: null }))
      .toBeCloseTo(91.0, 3);
  });
  it('returns null when nothing parses', () => {
    expect(bestQualiSeconds({ q1: '', q2: null, q3: undefined })).toBeNull();
    expect(bestQualiSeconds(null)).toBeNull();
  });
});
