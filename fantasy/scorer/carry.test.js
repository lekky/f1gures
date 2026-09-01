import { describe, it, expect } from 'vitest';
import { latestPickBefore, planCarry } from './lib/carry.js';

const codeOfEntry = { a1: 'NOR', b1: 'HAM', c1: 'GAS', d1: 'STR', a2: 'VER' };
const tierOfEntry = { a1: 'A', b1: 'B', c1: 'C', d1: 'D', a2: 'A' };
const caps = { capDriver: 5, capConstructor: 4 };
const source = { driverA: 'a1', driverB: 'b1', driverC: 'c1', driverD: 'd1', constructor: 'mclaren', boost: 'C' };

describe('planCarry', () => {
  it('rolls the whole lineup over when everything is still legal (§5)', () => {
    expect(planCarry({ source, tierOfEntry, codeOfEntry, usage: {}, caps })).toMatchObject({
      driverA: 'a1', driverB: 'b1', driverC: 'c1', driverD: 'd1',
      constructor: 'mclaren', boost: 'C', carriedForward: true,
    });
  });

  it('leaves a capped driver\'s slot empty rather than carrying an illegal pick', () => {
    const out = planCarry({ source, tierOfEntry, codeOfEntry, usage: { drivers: { NOR: 5 } }, caps });
    expect(out.driverA).toBe('');
    expect(out.driverB).toBe('b1');
  });

  it('leaves the slot empty when the driver has moved tier since the last lock', () => {
    const moved = { ...tierOfEntry, c1: 'B' };
    const out = planCarry({ source, tierOfEntry: moved, codeOfEntry, usage: {}, caps });
    expect(out.driverC).toBe('');
  });

  it('drops a capped constructor', () => {
    const out = planCarry({ source, tierOfEntry, codeOfEntry, usage: { constructors: { mclaren: 4 } }, caps });
    expect(out.constructor).toBe('');
    expect(out.driverA).toBe('a1');
  });

  it('falls the Boost back to Tier D when the boosted slot could not carry (§5)', () => {
    const out = planCarry({ source, tierOfEntry, codeOfEntry, usage: { drivers: { GAS: 5 } }, caps });
    expect(out.driverC).toBe('');
    expect(out.boost).toBe('D');
  });

  it('never carries emergency flags — an emergency pick is a deliberate act', () => {
    const flagged = { ...source, emergency: { A: true } };
    expect(planCarry({ source: flagged, tierOfEntry, codeOfEntry, usage: {}, caps }).emergency).toEqual({});
  });

  it('returns null for a brand-new player with no previous lineup (§5)', () => {
    expect(planCarry({ source: null, tierOfEntry, codeOfEntry, usage: {}, caps })).toBeNull();
  });

  it('returns null when nothing at all could carry', () => {
    const out = planCarry({
      source, tierOfEntry, codeOfEntry, caps,
      usage: { drivers: { NOR: 5, HAM: 5, GAS: 5, STR: 5 }, constructors: { mclaren: 4 } },
    });
    expect(out).toBeNull();
  });
});

describe('latestPickBefore', () => {
  const roundNumberOf = { r1: 1, r2: 2, r3: 3 };
  const picks = [{ round: 'r1', tag: 'first' }, { round: 'r3', tag: 'third' }];

  it('picks the most recent earlier round', () => {
    expect(latestPickBefore(picks, roundNumberOf, 4).tag).toBe('third');
    expect(latestPickBefore(picks, roundNumberOf, 3).tag).toBe('first');
  });

  it('returns null when there is nothing earlier', () => {
    expect(latestPickBefore(picks, roundNumberOf, 1)).toBeNull();
  });
});
