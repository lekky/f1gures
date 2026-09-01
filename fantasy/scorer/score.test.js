import { describe, it, expect } from 'vitest';
import {
  countUsage, dnsCodes, isRefunded, isVoidRound, pickToLineup, refundsFor, resultFingerprint,
} from './lib/score.js';

describe('resultFingerprint', () => {
  it('is stable under key reordering', () => {
    expect(resultFingerprint({ a: 1, b: [2, 3] })).toBe(resultFingerprint({ b: [2, 3], a: 1 }));
  });

  it('changes when a classification changes — the rescore trigger (§9)', () => {
    const before = { detail: { NOR: { position: '1' }, VER: { position: '2' } } };
    const after = { detail: { NOR: { position: '2' }, VER: { position: '1' } } };
    expect(resultFingerprint(before)).not.toBe(resultFingerprint(after));
  });
});

describe('dnsCodes', () => {
  const entries = [{ code: 'NOR' }, { code: 'VER' }, { code: 'STR' }, { code: 'HUL' }];
  const result = {
    order: ['NOR', 'VER', 'HUL'],
    detail: {
      NOR: { position: '1', status: 'Finished', laps: 72 },
      VER: { position: 'R', status: 'Retired', laps: 1 },
      HUL: { position: 'W', status: 'Did not start', laps: 0 },
    },
    quali: { NOR: { position: 1 }, VER: { position: 2 }, STR: { position: 15 }, HUL: { position: 18 } },
  };

  it('catches an explicit "Did not start"', () => {
    expect(dnsCodes(result, entries).has('HUL')).toBe(true);
  });

  it('catches a driver who qualified but never appears in the race classification', () => {
    expect(dnsCodes(result, entries).has('STR')).toBe(true);
  });

  it('does NOT treat a lap-1 retirement as a DNS — the start was spent', () => {
    expect(dnsCodes(result, entries).has('VER')).toBe(false);
    expect(dnsCodes(result, entries).has('NOR')).toBe(false);
  });
});

describe('isVoidRound', () => {
  it('is true only when nothing at all was classified (§8 cancelled GP)', () => {
    expect(isVoidRound({ order: [], detail: {} })).toBe(true);
    expect(isVoidRound({ order: ['NOR'], detail: { NOR: {} } })).toBe(false);
    expect(isVoidRound(null)).toBe(false);
  });
});

describe('isRefunded', () => {
  it('accepts all three stored shapes', () => {
    expect(isRefunded(['A', 'constructor'], 'A')).toBe(true);
    expect(isRefunded(['e_9'], 'A', 'e_9')).toBe(true);
    expect(isRefunded({ A: true }, 'A')).toBe(true);
    expect(isRefunded({ e_9: true }, 'A', 'e_9')).toBe(true);
    expect(isRefunded(['B'], 'A', 'e_9')).toBe(false);
    expect(isRefunded(null, 'A')).toBe(false);
  });
});

describe('refundsFor', () => {
  const codeOfEntry = { e1: 'NOR', e2: 'HUL', e3: 'GAS', e4: 'STR' };
  const pick = { driverA: 'e1', driverB: 'e2', driverC: 'e3', driverD: '', constructor: 'mclaren' };

  it('refunds only the slots whose driver did not start (§4)', () => {
    expect(refundsFor(pick, codeOfEntry, new Set(['HUL']))).toEqual(['B']);
  });

  it('refunds every slot and the constructor on a void round (§8)', () => {
    expect(refundsFor(pick, codeOfEntry, new Set(), true)).toEqual(['A', 'B', 'C', 'constructor']);
  });

  it('never refunds an empty slot', () => {
    expect(refundsFor(pick, codeOfEntry, new Set(['STR']))).toEqual([]);
  });
});

describe('countUsage', () => {
  const codeOfEntry = { e1: 'NOR', e2: 'HUL' };
  const picks = [
    { round: 'r1', driverA: 'e1', driverD: 'e2', constructor: 'mclaren', refunded: [] },
    { round: 'r2', driverA: 'e1', driverD: 'e2', constructor: 'mclaren', refunded: ['D'] },
    { round: 'r3', driverA: 'e1', constructor: 'ferrari', refunded: [] },
  ];

  it('counts a start per slot the entry occupies', () => {
    const usage = countUsage(picks, () => true, codeOfEntry);
    expect(usage.drivers.NOR).toBe(3);
    expect(usage.constructors).toEqual({ mclaren: 2, ferrari: 1 });
  });

  it('does not count a refunded start (§4 refund rule)', () => {
    expect(countUsage(picks, () => true, codeOfEntry).drivers.HUL).toBe(1);
  });

  it('honours the include predicate — only already-locked rounds count', () => {
    const usage = countUsage(picks, p => p.round !== 'r3', codeOfEntry);
    expect(usage.drivers.NOR).toBe(2);
  });

  it('drops the constructor when it was refunded', () => {
    const voided = [{ round: 'r1', constructor: 'mclaren', refunded: ['constructor'] }];
    expect(countUsage(voided, () => true, codeOfEntry).constructors).toEqual({});
  });
});

describe('pickToLineup', () => {
  it('maps entry ids to codes and defaults the boost to D (§2)', () => {
    const lineup = pickToLineup(
      { driverA: 'e1', driverB: '', driverC: 'e3', driverD: 'e4', constructor: 'mclaren', boost: '', emergency: null },
      { e1: 'NOR', e3: 'GAS', e4: 'STR' }
    );
    expect(lineup).toEqual({ A: 'NOR', B: null, C: 'GAS', D: 'STR', constructor: 'mclaren', boost: 'D', emergency: {} });
  });

  it('keeps an explicit C boost', () => {
    expect(pickToLineup({ boost: 'C' }, {}).boost).toBe('C');
  });
});
