/**
 * Unit tests for the pure half of the fantasy_picks hook
 * (`pb_hooks/fantasy_rules.js`).
 *
 * That file is CommonJS because PocketBase's Goja runtime has no ESM, so it is
 * pulled in with createRequire rather than a bare `import`.
 *
 * Run with the repo suite:  npm test -- --run fantasy/pocketbase/hooks.test.js
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rules = require('./pb_hooks/fantasy_rules.js');

const {
  SLOTS,
  slotField,
  isRefunded,
  tallyUsage,
  isTierExhausted,
  validatePickSubmission,
  toFieldErrors,
} = rules;

const NOW = Date.UTC(2026, 2, 6, 12, 0, 0); // 2026-03-06T12:00:00Z
const FUTURE = NOW + 3 * 24 * 3600 * 1000;
const PAST = NOW - 3 * 24 * 3600 * 1000;

/** A legal baseline submission; override pieces per test. */
function ctx(over = {}) {
  const base = {
    now: NOW,
    round: { number: 4, lockAt: FUTURE },
    caps: { driver: 3, constructor: 2 },
    boost: 'D',
    protectedFields: [],
    slots: {
      A: { entryId: 'e_pia', code: 'PIA', name: 'Oscar Piastri', tier: 'A', usage: 0, emergency: false, tierExhausted: false },
      B: { entryId: 'e_sai', code: 'SAI', name: 'Carlos Sainz', tier: 'B', usage: 1, emergency: false, tierExhausted: false },
      C: { entryId: 'e_hul', code: 'HUL', name: 'Nico Hulkenberg', tier: 'C', usage: 0, emergency: false, tierExhausted: false },
      D: { entryId: 'e_bor', code: 'BOR', name: 'Gabriel Bortoleto', tier: 'D', usage: 2, emergency: false, tierExhausted: false },
    },
  };
  const merged = { ...base, ...over };
  if (over.slots) merged.slots = { ...base.slots, ...over.slots };
  if (!Object.prototype.hasOwnProperty.call(merged, 'constructor')) {
    merged.constructor = { teamId: 'ferrari', usage: 1 };
  }
  return merged;
}

const codes = (res) => res.errors.map((e) => e.code);

describe('slot helpers', () => {
  it('names the four slots and their fields', () => {
    expect(SLOTS).toEqual(['A', 'B', 'C', 'D']);
    expect(SLOTS.map(slotField)).toEqual(['driverA', 'driverB', 'driverC', 'driverD']);
  });
});

describe('isRefunded', () => {
  it('is false for empty/garbage refund payloads', () => {
    expect(isRefunded(null, 'A', 'e1')).toBe(false);
    expect(isRefunded('', 'A', 'e1')).toBe(false);
    expect(isRefunded(0, 'A', 'e1')).toBe(false);
    expect(isRefunded([], 'A', 'e1')).toBe(false);
    expect(isRefunded({}, 'A', 'e1')).toBe(false);
  });

  it('matches an array of slot letters or entry keys', () => {
    expect(isRefunded(['A'], 'A', 'e1')).toBe(true);
    expect(isRefunded(['e1'], 'A', 'e1')).toBe(true);
    expect(isRefunded(['B'], 'A', 'e1')).toBe(false);
  });

  it('matches an object keyed by slot or entry', () => {
    expect(isRefunded({ A: true }, 'A', 'e1')).toBe(true);
    expect(isRefunded({ e1: true }, 'A', 'e1')).toBe(true);
    expect(isRefunded({ A: false }, 'A', 'e1')).toBe(false);
  });

  it('does not trip over the inherited "constructor" key', () => {
    expect(isRefunded({}, 'constructor', 'mclaren')).toBe(false);
    expect(isRefunded({ constructor: true }, 'constructor', 'mclaren')).toBe(true);
  });
});

describe('tallyUsage', () => {
  const picks = [
    { driverA: 'nor', driverB: 'ham', driverC: 'gas', driverD: 'str', constructor: 'mclaren' },
    { driverA: 'nor', driverB: 'ant', driverC: 'tsu', driverD: 'col', constructor: 'mclaren' },
    { driverA: 'nor', driverB: 'alo', driverC: 'had', driverD: 'law', constructor: 'ferrari' },
  ];

  it('counts every non-empty slot across rounds', () => {
    const u = tallyUsage(picks);
    expect(u.drivers.nor).toBe(3);
    expect(u.drivers.ham).toBe(1);
    expect(u.constructors.mclaren).toBe(2);
    expect(u.constructors.ferrari).toBe(1);
  });

  it('skips empty slots', () => {
    const u = tallyUsage([{ driverA: '', driverB: null, driverC: 'gas', constructor: '' }]);
    expect(u.drivers).toEqual({ gas: 1 });
    expect(u.constructors).toEqual({});
  });

  it('does not credit a start that was refunded (rulebook §4 DNS refund)', () => {
    const u = tallyUsage([
      ...picks,
      { driverA: 'nor', constructor: 'mclaren', refunded: ['A', 'constructor'] },
    ]);
    expect(u.drivers.nor).toBe(3); // 4th start refunded
    expect(u.constructors.mclaren).toBe(2);
  });

  it('accepts the object refund shape too', () => {
    const u = tallyUsage([{ driverA: 'nor', refunded: { A: true } }]);
    expect(u.drivers.nor).toBeUndefined();
  });

  it('never invents a "constructor" key from the prototype', () => {
    const u = tallyUsage([{ driverA: 'nor' }]);
    expect(Object.keys(u.constructors)).toEqual([]);
  });
});

describe('isTierExhausted', () => {
  it('is true only when every entry in the tier is at cap', () => {
    expect(isTierExhausted(['a', 'b'], { a: 3, b: 3 }, 3)).toBe(true);
    expect(isTierExhausted(['a', 'b'], { a: 3, b: 2 }, 3)).toBe(false);
    expect(isTierExhausted(['a', 'b'], { a: 4, b: 3 }, 3)).toBe(true);
  });

  it('treats an empty tier and a missing cap as not exhausted', () => {
    expect(isTierExhausted([], { a: 3 }, 3)).toBe(false);
    expect(isTierExhausted(['a'], { a: 3 }, 0)).toBe(false);
  });
});

describe('validatePickSubmission — happy path', () => {
  it('accepts a legal lineup', () => {
    const res = validatePickSubmission(ctx());
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it('accepts an empty slot (carry-forward may leave one blank)', () => {
    const res = validatePickSubmission(ctx({ slots: { B: null } }));
    expect(res.ok).toBe(true);
  });

  it('accepts no constructor', () => {
    const res = validatePickSubmission(ctx({ constructor: { teamId: '', usage: 0 } }));
    expect(res.ok).toBe(true);
  });
});

describe('check 1 — lock', () => {
  it('rejects once lockAt has passed and reports nothing else', () => {
    const res = validatePickSubmission(
      ctx({
        round: { number: 1, lockAt: PAST },
        boost: 'A', // would also be an error, but lock short-circuits
        protectedFields: ['refunded'],
      })
    );
    expect(res.ok).toBe(false);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].code).toBe('lockPassed');
    expect(res.errors[0].message).toContain('Round 1 is locked');
  });

  it('rejects exactly at the lock instant', () => {
    const res = validatePickSubmission(ctx({ round: { number: 4, lockAt: NOW } }));
    expect(codes(res)).toEqual(['lockPassed']);
  });

  it('allows a round with no lockAt set', () => {
    const res = validatePickSubmission(ctx({ round: { number: 4, lockAt: null } }));
    expect(res.ok).toBe(true);
  });
});

describe('check 2 — tier match', () => {
  it('rejects a Tier B driver in slot A, naming both tiers', () => {
    const res = validatePickSubmission(
      ctx({ slots: { A: { entryId: 'e_ham', code: 'HAM', name: 'Lewis Hamilton', tier: 'B', usage: 0 } } })
    );
    expect(codes(res)).toEqual(['wrongTier']);
    expect(res.errors[0].field).toBe('driverA');
    expect(res.errors[0].message).toBe(
      'Lewis Hamilton is a Tier B driver this round — slot A needs a Tier A driver.'
    );
  });

  it('rejects an entry with no published tier for the round', () => {
    const res = validatePickSubmission(
      ctx({ slots: { C: { entryId: 'e_new', code: 'NEW', name: 'Reserve Driver', tier: null, usage: 0 } } })
    );
    expect(codes(res)).toEqual(['noTier']);
    expect(res.errors[0].message).toContain('no published tier for round 4');
  });

  it('reports every wrong slot separately', () => {
    const res = validatePickSubmission(
      ctx({
        slots: {
          A: { entryId: 'x', code: 'X', name: 'X', tier: 'D', usage: 0 },
          D: { entryId: 'y', code: 'Y', name: 'Y', tier: 'A', usage: 0 },
        },
      })
    );
    expect(codes(res)).toEqual(['wrongTier', 'wrongTier']);
    expect(res.errors.map((e) => e.slot)).toEqual(['A', 'D']);
  });

  it('does not run the cap check on a wrong-tier slot', () => {
    const res = validatePickSubmission(
      ctx({ slots: { A: { entryId: 'x', code: 'X', name: 'X', tier: 'B', usage: 99 } } })
    );
    expect(codes(res)).toEqual(['wrongTier']);
  });
});

describe('check 3 — usage caps and emergency picks', () => {
  const capped = (over = {}) => ({
    entryId: 'e_nor', code: 'NOR', name: 'Lando Norris', tier: 'A',
    usage: 3, emergency: false, tierExhausted: false, ...over,
  });

  it('rejects a driver at cap', () => {
    const res = validatePickSubmission(ctx({ slots: { A: capped() } }));
    expect(codes(res)).toEqual(['capReached']);
    expect(res.errors[0].message).toContain('already started Lando Norris 3 times this season (cap 3)');
  });

  it('rejects an emergency pick when the tier is not exhausted', () => {
    const res = validatePickSubmission(ctx({ slots: { A: capped({ emergency: true }) } }));
    expect(codes(res)).toEqual(['emergencyNotAvailable']);
    expect(res.errors[0].message).toContain('starts left on other Tier A drivers');
  });

  it('allows an emergency pick when every Tier A driver is capped', () => {
    const res = validatePickSubmission(
      ctx({ slots: { A: capped({ emergency: true, tierExhausted: true }) } })
    );
    expect(res.ok).toBe(true);
  });

  // Agreed with the engine workstream: a client must not be able to
  // self-inflict a half-score pick on a driver it still has starts on.
  it('rejects a needless emergency flag on an uncapped driver', () => {
    const res = validatePickSubmission(
      ctx({ slots: { A: capped({ usage: 1, emergency: true, tierExhausted: true }) } })
    );
    expect(codes(res)).toEqual(['emergencyNotNeeded']);
    expect(res.errors[0].message).toBe(
      'Emergency pick not allowed: NOR has 2 starts left (slot A).'
    );
  });

  it('singularises the last remaining start', () => {
    const res = validatePickSubmission(
      ctx({ slots: { A: capped({ usage: 2, emergency: true }) } })
    );
    expect(res.errors[0].message).toBe(
      'Emergency pick not allowed: NOR has 1 start left (slot A).'
    );
  });

  it('treats usage above the cap the same as at the cap', () => {
    const res = validatePickSubmission(ctx({ slots: { A: capped({ usage: 5 }) } }));
    expect(codes(res)).toEqual(['capReached']);
  });

  it('skips cap enforcement when the season has no cap configured', () => {
    const res = validatePickSubmission(
      ctx({ caps: { driver: 0, constructor: 0 }, slots: { A: capped({ usage: 99 }) } })
    );
    expect(res.ok).toBe(true);
  });

  it('rejects a constructor at cap', () => {
    const res = validatePickSubmission(ctx({ constructor: { teamId: 'mclaren', usage: 2 } }));
    expect(codes(res)).toEqual(['capReached']);
    expect(res.errors[0].slot).toBe('constructor');
    expect(res.errors[0].message).toContain('already started mclaren 2 times this season (cap 2)');
  });

  it('has no emergency escape hatch for constructors', () => {
    const res = validatePickSubmission(
      ctx({ constructor: { teamId: 'mclaren', usage: 2, emergency: true } })
    );
    expect(codes(res)).toEqual(['capReached']);
  });
});

describe('check 4 — boost slot', () => {
  it('accepts C and D', () => {
    expect(validatePickSubmission(ctx({ boost: 'C' })).ok).toBe(true);
    expect(validatePickSubmission(ctx({ boost: 'D' })).ok).toBe(true);
  });

  it('rejects A and B', () => {
    for (const bad of ['A', 'B']) {
      const res = validatePickSubmission(ctx({ boost: bad }));
      expect(codes(res)).toEqual(['invalidBoostSlot']);
      expect(res.errors[0].message).toContain('Tier C or Tier D');
    }
  });

  it('treats an empty boost as already-defaulted (the hook sets D)', () => {
    expect(validatePickSubmission(ctx({ boost: '' })).ok).toBe(true);
  });
});

describe('check 5 — scorer-only fields', () => {
  it('rejects a client-supplied carriedForward', () => {
    const res = validatePickSubmission(ctx({ protectedFields: ['carriedForward'] }));
    expect(codes(res)).toEqual(['readOnlyField']);
    expect(res.errors[0].field).toBe('carriedForward');
  });

  it('rejects a client-supplied refunded', () => {
    const res = validatePickSubmission(ctx({ protectedFields: ['refunded'] }));
    expect(codes(res)).toEqual(['readOnlyField']);
  });

  it('reports both at once', () => {
    const res = validatePickSubmission(ctx({ protectedFields: ['carriedForward', 'refunded'] }));
    expect(res.errors).toHaveLength(2);
  });
});

describe('error mapping', () => {
  it('collects independent failures across slots, boost and constructor', () => {
    const res = validatePickSubmission(
      ctx({
        boost: 'A',
        protectedFields: ['refunded'],
        slots: { B: { entryId: 'z', code: 'Z', name: 'Z', tier: 'C', usage: 0 } },
        constructor: { teamId: 'mclaren', usage: 2 },
      })
    );
    expect(codes(res).sort()).toEqual(
      ['capReached', 'invalidBoostSlot', 'readOnlyField', 'wrongTier'].sort()
    );
  });

  it('summarises one error verbatim and joins several', () => {
    const one = validatePickSubmission(ctx({ boost: 'A' }));
    expect(rules.summarise(one.errors)).toBe(
      'Boost must be on your Tier C or Tier D driver (got "A").'
    );

    const many = validatePickSubmission(
      ctx({ boost: 'A', constructor: { teamId: 'mclaren', usage: 2 } })
    );
    const text = rules.summarise(many.errors);
    expect(text.split(' · ')).toHaveLength(2);
    expect(text).toContain('Tier C or Tier D');
    expect(text).toContain('Pick a different constructor');
  });

  it('keys field errors the way PocketBase expects', () => {
    const res = validatePickSubmission(
      ctx({
        boost: 'A',
        slots: { A: { entryId: 'x', code: 'X', name: 'X', tier: 'B', usage: 0 } },
        constructor: { teamId: 'mclaren', usage: 2 },
      })
    );
    const fields = toFieldErrors(res.errors);
    expect(Object.keys(fields).sort()).toEqual(['boost', 'constructor', 'driverA']);
    expect(fields.driverA.code).toBe('wrongTier');
    expect(fields.constructor.code).toBe('capReached');
    expect(typeof fields.boost.message).toBe('string');
  });
});
