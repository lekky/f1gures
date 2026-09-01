import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  RULES,
  tierSizes,
  entryList,
  seedHistory,
  buildContext,
  scoreRound,
  computeTiers,
  applyMultipliers,
  scorePicks,
  validatePicks,
  replaySeason,
} from './fantasyScoring.mjs';

// ---------------------------------------------------------------------------
// hand-built fixtures
// ---------------------------------------------------------------------------

// Two two-car teams plus a practice-only call-up, so teammate logic, the
// entry-list exclusion and constructor sums all have something to bite on.
const ROSTER = [
  { id: 'AAA', team: 'red' },
  { id: 'BBB', team: 'red' },
  { id: 'CCC', team: 'blue' },
  { id: 'DDD', team: 'blue' },
  { id: 'PRC', team: '' },
];

// Build a round result from a compact per-driver spec.
// spec: { CODE: {pos, grid, laps, q, sprint} }
function mkResult(spec, extra = {}) {
  const detail = {};
  const quali = {};
  const order = [];
  const sprintDetail = {};
  for (const [code, s] of Object.entries(spec)) {
    if (s.pos !== undefined) {
      detail[code] = { position: String(s.pos), grid: s.grid ?? 0, laps: s.laps ?? 0, points: 0 };
      order.push(code);
    }
    if (s.q !== undefined) quali[code] = { position: s.q };
    if (s.sprint !== undefined) sprintDetail[code] = { position: String(s.sprint) };
  }
  // Classification order: classified by position, then everyone else.
  order.sort((a, b) => {
    const pa = Number(detail[a].position), pb = Number(detail[b].position);
    const na = Number.isFinite(pa), nb = Number.isFinite(pb);
    if (na && nb) return pa - pb;
    if (na) return -1;
    if (nb) return 1;
    return 0;
  });
  const out = { order, detail, quali, dnfs: [] };
  if (Object.keys(sprintDetail).length) out.sprintResults = { order: [], detail: sprintDetail };
  return { ...out, ...extra };
}

function mkBundle(resultsBySpec, roster = ROSTER) {
  const results = {};
  for (const [round, entry] of Object.entries(resultsBySpec)) {
    results[round] = Array.isArray(entry) ? mkResult(entry[0], entry[1]) : mkResult(entry);
  }
  return { drivers: roster, results };
}

// Score one hand-built round with no previous-season seeding.
function scoreOne(spec, extra = {}, roster = ROSTER) {
  const bundle = mkBundle({ 1: [spec, extra] }, roster);
  return scoreRound(bundle, 1, buildContext(bundle, 1, null));
}

const bundlePath = year => resolve(process.cwd(), 'public', 'data', `${year}.json`);
const loadBundle = year => JSON.parse(readFileSync(bundlePath(year), 'utf8'));
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;

// ---------------------------------------------------------------------------

describe('RULES', () => {
  it('is the frozen v0.2 constant set', () => {
    expect(RULES.version).toBe('0.2');
    expect(Object.isFrozen(RULES)).toBe(true);
    expect(RULES.RACE_PTS[0]).toBe(50);
    expect(RULES.RACE_PTS).toHaveLength(22);
    expect(RULES.QUALI_PTS).toEqual([15, 12, 10, 8, 6, 5, 4, 3, 2, 1]);
    expect(RULES.SPRINT_PTS).toEqual([15, 12, 10, 8, 7, 6, 5, 4, 3, 2]);
  });
});

describe('tierSizes', () => {
  it('splits evenly when the grid divides by four', () => {
    expect(tierSizes(20)).toEqual([5, 5, 5, 5]);
    expect(tierSizes(24)).toEqual([6, 6, 6, 6]);
  });

  it('sends the extras to the LOWER tiers', () => {
    expect(tierSizes(22)).toEqual([5, 5, 6, 6]);
    expect(tierSizes(21)).toEqual([5, 5, 5, 6]);
    expect(tierSizes(23)).toEqual([5, 6, 6, 6]);
  });

  it('always sums to the grid size, for any grid', () => {
    for (let n = 0; n <= 40; n++) {
      const sizes = tierSizes(n);
      expect(sizes).toHaveLength(4);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(n);
      // Never more than one apart, and never a bigger tier above a smaller one.
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    }
  });

  it('honours a non-default tier count', () => {
    expect(tierSizes(10, 3)).toEqual([3, 3, 4]);
  });
});

describe('entryList', () => {
  it('takes everyone in the round quali or race classification', () => {
    const bundle = mkBundle({ 1: { AAA: { pos: 1, q: 1 }, BBB: { pos: 2, q: 2 } } });
    expect(entryList(bundle, 1)).toEqual([
      { code: 'AAA', teamId: 'red' },
      { code: 'BBB', teamId: 'red' },
    ]);
  });

  it('keeps a driver who qualified but did not start', () => {
    const bundle = mkBundle({ 1: { AAA: { pos: 1, q: 2 }, BBB: { q: 1 } } });
    expect(entryList(bundle, 1).map(e => e.code)).toEqual(['AAA', 'BBB']);
  });

  it('excludes practice-only roster entries (empty team, no session data)', () => {
    const bundle = mkBundle({ 1: { AAA: { pos: 1 }, BBB: { pos: 2 } } });
    expect(entryList(bundle, 1).map(e => e.code)).not.toContain('PRC');
  });

  it('prefers the per-round team on the result detail over the season roster', () => {
    const bundle = mkBundle({ 1: { AAA: { pos: 1 } } });
    bundle.results['1'].detail.AAA.team = 'blue';
    expect(entryList(bundle, 1)).toEqual([{ code: 'AAA', teamId: 'blue' }]);
  });

  it('falls back to the pending-qualifying holding record before the race runs', () => {
    const bundle = { drivers: ROSTER, results: {}, pendingQuali: { 5: { quali: { AAA: { position: 1 } } } } };
    expect(entryList(bundle, 5)).toEqual([{ code: 'AAA', teamId: 'red' }]);
  });

  it('returns nothing for a round with no data', () => {
    expect(entryList(mkBundle({}), 3)).toEqual([]);
  });
});

describe('scoreRound - race classification (6.1)', () => {
  it('pays the published table and 1 point beyond P22', () => {
    const spec = {};
    for (let p = 1; p <= 24; p++) spec[`D${String(p).padStart(2, '0')}`] = { pos: p, grid: p };
    const s = scoreRound(mkBundle({ 1: spec }, []), 1, undefined);
    expect(s.drivers.D01.race).toBe(50);
    expect(s.drivers.D10.race).toBe(13);
    expect(s.drivers.D22.race).toBe(1);
    expect(s.drivers.D23.race).toBe(1);
    expect(s.drivers.D24.race).toBe(1);
  });

  it('pays nothing to an unclassified finisher', () => {
    const s = scoreOne({ AAA: { pos: 'R', grid: 1, laps: 10 }, BBB: { pos: 1, grid: 2, laps: 50 } });
    expect(s.drivers.AAA.race).toBe(0);
    expect(s.drivers.AAA.classified).toBe(false);
    expect(s.drivers.BBB.classified).toBe(true);
  });

  it('treats a disqualification as unclassified', () => {
    const s = scoreOne({ AAA: { pos: 'D', grid: 1, laps: 50, q: 1 }, BBB: { pos: 1, grid: 2, laps: 50, q: 2 } });
    expect(s.drivers.AAA.race).toBe(0);
    expect(s.drivers.AAA.gained).toBe(0);
    expect(s.drivers.AAA.classified).toBe(false);
    // §8: the DSQ keeps qualifying points and takes the laps consolation instead.
    expect(s.drivers.AAA.quali).toBe(15);
    expect(s.drivers.AAA.laps).toBe(10);
  });
});

describe('scoreRound - qualifying (6.2)', () => {
  it('pays the top ten only', () => {
    const s = scoreOne({ AAA: { pos: 1, grid: 1, q: 1 }, BBB: { pos: 2, grid: 2, q: 10 }, CCC: { pos: 3, grid: 3, q: 11 }, DDD: { pos: 4, grid: 4 } });
    expect(s.drivers.AAA.quali).toBe(15);
    expect(s.drivers.BBB.quali).toBe(1);
    expect(s.drivers.CCC.quali).toBe(0);
    expect(s.drivers.DDD.quali).toBe(0);
  });
});

describe('scoreRound - positions gained (6.3)', () => {
  it('pays 2 per place and nothing for places lost', () => {
    const s = scoreOne({ AAA: { pos: 1, grid: 4, laps: 50 }, BBB: { pos: 2, grid: 1, laps: 50 } });
    expect(s.drivers.AAA.gained).toBe(6);
    expect(s.drivers.BBB.gained).toBe(0);
  });

  it('caps the bonus at +20', () => {
    const spec = {};
    for (let p = 1; p <= 20; p++) spec[`D${String(p).padStart(2, '0')}`] = { pos: p, grid: 21 - p };
    const s = scoreRound(mkBundle({ 1: spec }, []), 1, undefined);
    expect(s.drivers.D01.gained).toBe(20); // 19 places is worth 38, capped
  });

  it('treats a pit-lane start (grid 0) as the back of the field', () => {
    const spec = { AAA: { pos: 1, grid: 0 }, BBB: { pos: 2, grid: 1 }, CCC: { pos: 3, grid: 2 }, DDD: { pos: 4, grid: 3 } };
    const s = scoreOne(spec);
    expect(s.drivers.AAA.gained).toBe(6); // from P4 (four entries) to P1
  });

  it('pays nothing to the unclassified', () => {
    const s = scoreOne({ AAA: { pos: 'R', grid: 20, laps: 5 }, BBB: { pos: 1, grid: 1, laps: 50 } });
    expect(s.drivers.AAA.gained).toBe(0);
  });
});

describe('scoreRound - laps consolation (6.4)', () => {
  it('pays 1 per full 10% of the race distance, to the unclassified only', () => {
    const s = scoreOne({ AAA: { pos: 1, grid: 1, laps: 50 }, BBB: { pos: 'R', grid: 2, laps: 25 } });
    expect(s.drivers.AAA.laps).toBe(0);
    expect(s.drivers.BBB.laps).toBe(5);
  });

  it('rounds down and bottoms out at 0 for a lap-1 crash', () => {
    const s = scoreOne({ AAA: { pos: 1, grid: 1, laps: 50 }, BBB: { pos: 'R', grid: 2, laps: 1 }, CCC: { pos: 'R', grid: 3, laps: 44 } });
    expect(s.drivers.BBB.laps).toBe(0);
    expect(s.drivers.CCC.laps).toBe(8); // 88% → 8
  });

  it('caps at 10 and copes with missing lap counts', () => {
    const s = scoreOne({ AAA: { pos: 1, grid: 1, laps: 50 }, BBB: { pos: 'R', grid: 2, laps: 50 }, CCC: { pos: 'R', grid: 3 } });
    expect(s.drivers.BBB.laps).toBe(10);
    expect(s.drivers.CCC.laps).toBe(0);
  });

  it('uses the winner s distance, so a shortened race still pays out fully', () => {
    const s = scoreOne({ AAA: { pos: 1, grid: 1, laps: 20 }, BBB: { pos: 'R', grid: 2, laps: 10 } });
    expect(s.raceLaps).toBe(20);
    expect(s.drivers.BBB.laps).toBe(5);
  });
});

describe('scoreRound - form beat (6.5)', () => {
  // Three prior rounds where AAA finishes 8th, 8th and 8th → baseline 8.
  const priors = {
    1: { AAA: { pos: 8, grid: 8 }, BBB: { pos: 1, grid: 1 } },
    2: { AAA: { pos: 8, grid: 8 }, BBB: { pos: 1, grid: 1 } },
    3: { AAA: { pos: 8, grid: 8 }, BBB: { pos: 1, grid: 1 } },
  };
  const withFinish = pos => {
    const bundle = mkBundle({ ...priors, 4: { AAA: { pos, grid: pos }, BBB: { pos: pos === 1 ? 2 : 1, grid: 1 } } });
    return scoreRound(bundle, 4, buildContext(bundle, 4, null)).drivers.AAA.form;
  };

  it('walks the published ladder', () => {
    expect(withFinish(7)).toBe(0);  // 1 place better
    expect(withFinish(6)).toBe(3);  // 2
    expect(withFinish(5)).toBe(6);  // 3
    expect(withFinish(4)).toBe(9);  // 4
    expect(withFinish(3)).toBe(12); // 5
    expect(withFinish(2)).toBe(15); // 6
    expect(withFinish(1)).toBe(15); // 7+ still 15
  });

  it('pays nothing for finishing at or below the average', () => {
    expect(withFinish(8)).toBe(0);
    expect(withFinish(9)).toBe(0);
  });

  it('pays nothing to the unclassified', () => {
    const bundle = mkBundle({ ...priors, 4: { AAA: { pos: 'R', grid: 8, laps: 5 }, BBB: { pos: 1, grid: 1, laps: 50 } } });
    expect(scoreRound(bundle, 4, buildContext(bundle, 4, null)).drivers.AAA.form).toBe(0);
  });

  it('pays nothing to a rookie with no baseline at all', () => {
    const s = scoreOne({ AAA: { pos: 1, grid: 20 }, BBB: { pos: 2, grid: 1 } });
    expect(s.drivers.AAA.form).toBe(0);
  });
});

describe('buildContext - baselines', () => {
  it('averages this season s prior rounds only', () => {
    const bundle = mkBundle({
      1: { AAA: { pos: 2, grid: 2 }, BBB: { pos: 1, grid: 1 } },
      2: { AAA: { pos: 4, grid: 4 }, BBB: { pos: 1, grid: 1 } },
      3: { AAA: { pos: 6, grid: 6 }, BBB: { pos: 1, grid: 1 } },
      4: { AAA: { pos: 1, grid: 1 }, BBB: { pos: 2, grid: 2 } },
    });
    expect(buildContext(bundle, 4, null).baselines.AAA).toBe(4);
    // Round 2 only has round 1 behind it.
    expect(buildContext(bundle, 2, null).baselines.AAA).toBe(2);
  });

  it('counts a DNF at its classification-order slot, not as a blank', () => {
    const bundle = mkBundle({
      1: { AAA: { pos: 'R', grid: 1, laps: 1 }, BBB: { pos: 1, grid: 2, laps: 50 } },
      2: { AAA: { pos: 1, grid: 1 }, BBB: { pos: 2, grid: 2 } },
    });
    // AAA is last in the classification order of a two-car round → slot 2.
    expect(buildContext(bundle, 2, null).baselines.AAA).toBe(2);
  });

  it('tops up from the previous season until the driver has three starts', () => {
    const prev = mkBundle({
      1: { AAA: { pos: 10, grid: 10 }, BBB: { pos: 1, grid: 1 } },
      2: { AAA: { pos: 10, grid: 10 }, BBB: { pos: 1, grid: 1 } },
    });
    const bundle = mkBundle({
      1: { AAA: { pos: 2, grid: 2 }, BBB: { pos: 1, grid: 1 } },
      2: { AAA: { pos: 2, grid: 2 }, BBB: { pos: 1, grid: 1 } },
      3: { AAA: { pos: 2, grid: 2 }, BBB: { pos: 1, grid: 1 } },
      4: { AAA: { pos: 2, grid: 2 }, BBB: { pos: 1, grid: 1 } },
    });
    // Two starts of its own → topped up with the previous season's 10s.
    expect(buildContext(bundle, 3, prev).baselines.AAA).toBe(6);
    // Three starts → the previous season drops out entirely.
    expect(buildContext(bundle, 4, prev).baselines.AAA).toBe(2);
  });

  it('accepts a pre-computed seed in place of the previous bundle', () => {
    const prev = mkBundle({ 1: { AAA: { pos: 10, grid: 10 }, BBB: { pos: 1, grid: 1 } } });
    const bundle = mkBundle({ 1: { AAA: { pos: 2, grid: 2 }, BBB: { pos: 1, grid: 1 } } });
    const seed = seedHistory(prev);
    expect(buildContext(bundle, 1, seed).baselines.AAA)
      .toBe(buildContext(bundle, 1, prev).baselines.AAA);
  });

  it('leaves a driver with no history at all on a null baseline', () => {
    const bundle = mkBundle({ 1: { AAA: { pos: 1, grid: 1 }, BBB: { pos: 2, grid: 2 } } });
    expect(buildContext(bundle, 1, null).baselines.AAA).toBeNull();
  });
});

describe('scoreRound - teammate head-to-head (6.6)', () => {
  it('pays 5 for the race and 2 for qualifying', () => {
    const s = scoreOne({
      AAA: { pos: 1, grid: 1, q: 1 }, BBB: { pos: 2, grid: 2, q: 2 },
      CCC: { pos: 3, grid: 3, q: 4 }, DDD: { pos: 4, grid: 4, q: 3 },
    });
    expect(s.drivers.AAA.teammate).toBe(7);
    expect(s.drivers.BBB.teammate).toBe(0);
    expect(s.drivers.CCC.teammate).toBe(5); // ahead in the race, out-qualified
    expect(s.drivers.DDD.teammate).toBe(2);
  });

  it('withholds the race leg unless both cars are classified', () => {
    const s = scoreOne({
      AAA: { pos: 1, grid: 1, q: 1, laps: 50 }, BBB: { pos: 'R', grid: 2, q: 2, laps: 10 },
      CCC: { pos: 2, grid: 3, q: 3 }, DDD: { pos: 3, grid: 4, q: 4 },
    });
    expect(s.drivers.AAA.teammate).toBe(2); // quali leg only
    expect(s.drivers.BBB.teammate).toBe(0);
  });

  it('still pays the quali leg to a driver who then retires', () => {
    const s = scoreOne({
      AAA: { pos: 'R', grid: 1, q: 1, laps: 10 }, BBB: { pos: 1, grid: 2, q: 2, laps: 50 },
      CCC: { pos: 2, grid: 3 }, DDD: { pos: 3, grid: 4 },
    });
    expect(s.drivers.AAA.teammate).toBe(2);
  });

  it('pays nothing when a driver has no teammate that weekend', () => {
    const s = scoreOne({ AAA: { pos: 1, grid: 1, q: 1 }, CCC: { pos: 2, grid: 2, q: 2 }, DDD: { pos: 3, grid: 3, q: 3 } });
    expect(s.drivers.AAA.teammate).toBe(0);
    expect(s.drivers.CCC.teammate).toBe(5 + 2);
  });

  it('pays nothing when a team fields three entries', () => {
    const roster = [...ROSTER, { id: 'EEE', team: 'red' }];
    const s = scoreOne({ AAA: { pos: 1, grid: 1, q: 1 }, BBB: { pos: 2, grid: 2, q: 2 }, EEE: { pos: 3, grid: 3, q: 3 } }, {}, roster);
    expect(s.drivers.AAA.teammate).toBe(0);
    expect(s.drivers.BBB.teammate).toBe(0);
  });

  it('needs both drivers to have a qualifying position', () => {
    const s = scoreOne({ AAA: { pos: 1, grid: 1, q: 1 }, BBB: { pos: 2, grid: 2 } });
    expect(s.drivers.AAA.teammate).toBe(5);
  });
});

describe('scoreRound - fastest lap (6.7) and sprint (6.8)', () => {
  it('pays 5 for the fastest lap regardless of finishing position', () => {
    const s = scoreOne({ AAA: { pos: 1, grid: 1 }, BBB: { pos: 'R', grid: 2, laps: 40 } }, { fastest: 'BBB' });
    expect(s.drivers.BBB.fastestLap).toBe(5);
    expect(s.drivers.AAA.fastestLap).toBe(0);
  });

  it('pays the sprint table, with 1 point for everyone past P10', () => {
    const spec = {};
    for (let p = 1; p <= 12; p++) spec[`D${String(p).padStart(2, '0')}`] = { pos: p, grid: p, sprint: p };
    const s = scoreRound(mkBundle({ 1: spec }, []), 1, undefined);
    expect(s.drivers.D01.sprint).toBe(15);
    expect(s.drivers.D10.sprint).toBe(2);
    expect(s.drivers.D11.sprint).toBe(1);
    expect(s.drivers.D12.sprint).toBe(1);
  });

  it('pays nothing for a sprint the driver did not finish, or did not contest', () => {
    const s = scoreOne({ AAA: { pos: 1, grid: 1, sprint: 'R' }, BBB: { pos: 2, grid: 2 } });
    expect(s.drivers.AAA.sprint).toBe(0);
    expect(s.drivers.BBB.sprint).toBe(0);
  });
});

describe('scoreRound - constructors (7)', () => {
  it('sums the race and qualifying points of both cars, and nothing else', () => {
    const s = scoreOne({
      AAA: { pos: 1, grid: 10, q: 1 },  // 50 race + 15 quali (+18 gained, excluded)
      BBB: { pos: 4, grid: 4, q: 5 },   // 29 race + 6 quali
      CCC: { pos: 2, grid: 2, q: 2 },
      DDD: { pos: 'R', grid: 3, q: 3, laps: 5 },
    }, { fastest: 'AAA' });
    expect(s.constructors.red).toBe(50 + 15 + 29 + 6);
    // A retirement simply earns its team nothing for that car.
    expect(s.constructors.blue).toBe(40 + 12 + 0 + 10);
  });

  it('leaves teamless entries out of the constructor totals', () => {
    const s = scoreOne({ AAA: { pos: 1, grid: 1 } }, {}, [{ id: 'AAA', team: '' }]);
    expect(s.constructors).toEqual({});
  });
});

describe('scoreRound - totals', () => {
  it('sums every component and never goes negative', () => {
    const s = scoreOne({ AAA: { pos: 1, grid: 4, q: 1 }, BBB: { pos: 20, grid: 2, q: 2 } }, { fastest: 'AAA' });
    const d = s.drivers.AAA;
    expect(d.total).toBe(d.race + d.quali + d.gained + d.laps + d.form + d.teammate + d.fastestLap + d.sprint);
    for (const v of Object.values(s.drivers)) expect(v.total).toBeGreaterThanOrEqual(0);
  });

  it('returns an empty shape for a round with no data', () => {
    expect(scoreRound(mkBundle({}), 9, undefined)).toEqual({ drivers: {}, constructors: {}, raceLaps: 0 });
  });
});

describe('seedHistory', () => {
  const prev = mkBundle({
    1: { AAA: { pos: 1, grid: 1 }, BBB: { pos: 2, grid: 2 } },
    2: { AAA: { pos: 1, grid: 1 }, BBB: { pos: 2, grid: 2 } },
    3: { AAA: { pos: 2, grid: 2 }, BBB: { pos: 1, grid: 1 } },
  });

  it('returns the tail rounds only', () => {
    const seed = seedHistory(prev, 2);
    expect(seed.history.AAA).toHaveLength(2);
    expect(seed.finishes.AAA).toEqual([1, 2]);
  });

  it('scores the tail with this engine (totals match scoreRound)', () => {
    const seed = seedHistory(prev, 1);
    const direct = scoreRound(prev, 3, buildContext(prev, 3, null));
    expect(seed.history.AAA).toEqual([direct.drivers.AAA.total]);
  });

  it('is empty for a missing previous season', () => {
    expect(seedHistory(null)).toEqual({ history: {}, finishes: {} });
  });
});

describe('computeTiers', () => {
  // Eight entries with clean, descending expectations.
  const CODES = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'];
  const entries = CODES.map((code, i) => ({ code, teamId: `t${Math.floor(i / 2)}` }));
  const history = Object.fromEntries(CODES.map((code, i) => [code, [80 - i * 10]]));

  it('ranks by rolling average and cuts at the exact tier sizes', () => {
    const tiers = computeTiers({ entries, history });
    expect(tiers.map(t => t.code)).toEqual(CODES);
    expect(tiers.map(t => t.tier)).toEqual(['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D']);
    expect(tiers.map(t => t.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(tiers[0].avgPts).toBe(80);
  });

  it('produces exactly tierSizes(n) tiers on an odd grid', () => {
    const n = 22;
    const many = Array.from({ length: n }, (_, i) => ({ code: `C${String(i).padStart(2, '0')}`, teamId: `t${i >> 1}` }));
    const hist = Object.fromEntries(many.map((e, i) => [e.code, [100 - i]]));
    const tiers = computeTiers({ entries: many, history: hist });
    const counts = ['A', 'B', 'C', 'D'].map(l => tiers.filter(t => t.tier === l).length);
    expect(counts).toEqual(tierSizes(n));
  });

  it('averages only the last `window` rounds', () => {
    const tiers = computeTiers({ entries: [{ code: 'X', teamId: 't' }], history: { X: [0, 0, 0, 100, 100] }, window: 2 });
    expect(tiers[0].avgPts).toBe(100);
  });

  it('seeds a no-history driver at their team s level', () => {
    const tiers = computeTiers({
      entries: [{ code: 'VET', teamId: 'red' }, { code: 'ROO', teamId: 'red' }, { code: 'OTH', teamId: 'blue' }],
      history: { VET: [60], OTH: [10] },
    });
    expect(tiers.find(t => t.code === 'ROO').avgPts).toBe(60);
    expect(tiers.map(t => t.code).slice(0, 2).sort()).toEqual(['ROO', 'VET']);
  });

  it('seeds a no-history driver with no history-carrying teammate at zero', () => {
    const tiers = computeTiers({
      entries: [{ code: 'ROO', teamId: 'red' }, { code: 'OTH', teamId: 'blue' }],
      history: { OTH: [10] },
    });
    expect(tiers.find(t => t.code === 'ROO').avgPts).toBe(0);
  });

  it('breaks ties on code, deterministically', () => {
    const tiers = computeTiers({
      entries: [{ code: 'ZZZ', teamId: 't' }, { code: 'AAA', teamId: 'u' }],
      history: { ZZZ: [10], AAA: [10] },
    });
    expect(tiers.map(t => t.code)).toEqual(['AAA', 'ZZZ']);
  });

  it('holds a near-boundary mover in their previous tier, then re-cuts to size', () => {
    // A3 would drop from A to B by one place; the stability rule pulls it back.
    const prevTiers = { A1: 'A', A2: 'A', A3: 'A', A4: 'B', A5: 'C', A6: 'C', A7: 'D', A8: 'D' };
    const tiers = computeTiers({ entries, history, prevTiers });
    expect(tiers.find(t => t.code === 'A3').tier).toBe('A');
    // Re-cut at exact sizes: the driver immediately above the held one makes room.
    const counts = ['A', 'B', 'C', 'D'].map(l => tiers.filter(t => t.tier === l).length);
    expect(counts).toEqual([2, 2, 2, 2]);
    expect(tiers.map(t => t.code)).toEqual(['A1', 'A3', 'A2', 'A4', 'A5', 'A6', 'A7', 'A8']);
    expect(tiers.find(t => t.code === 'A1').tier).toBe('A');
    expect(tiers.find(t => t.code === 'A2').tier).toBe('B');
  });

  it('does not hold a driver who moved well clear of the boundary', () => {
    // A1 collapses to last: five places past the A/B boundary, no reprieve.
    const collapsed = { ...history, A1: [-1] };
    const prevTiers = { A1: 'A', A2: 'A', A3: 'B', A4: 'B', A5: 'C', A6: 'C', A7: 'D', A8: 'D' };
    const tiers = computeTiers({ entries, history: collapsed, prevTiers });
    expect(tiers.find(t => t.code === 'A1').tier).toBe('D');
  });

  it('applies no stability rule with hysteresis 0 or no previous tiers', () => {
    const prevTiers = { A1: 'A', A2: 'A', A3: 'A', A4: 'B', A5: 'C', A6: 'C', A7: 'D', A8: 'D' };
    expect(computeTiers({ entries, history, prevTiers, hysteresis: 0 }).map(t => t.code)).toEqual(CODES);
    expect(computeTiers({ entries, history }).map(t => t.code)).toEqual(CODES);
  });

  it('returns nothing for an empty grid', () => {
    expect(computeTiers({ entries: [] })).toEqual([]);
  });
});

describe('applyMultipliers', () => {
  it('leaves a plain pick alone', () => {
    expect(applyMultipliers(50, {})).toBe(50);
    expect(applyMultipliers(50)).toBe(50);
  });

  it('rounds a boosted score up', () => {
    expect(applyMultipliers(50, { boost: true })).toBe(75);
    expect(applyMultipliers(51, { boost: true })).toBe(77); // 76.5 → 77
  });

  it('rounds a halved emergency pick up', () => {
    expect(applyMultipliers(51, { emergency: true })).toBe(26); // 25.5 → 26
  });

  it('stacks both multipliers before a single round-up', () => {
    // 51 × 1.5 × 0.5 = 38.25 → 39
    expect(applyMultipliers(51, { boost: true, emergency: true })).toBe(39);
  });

  it('handles zero and junk input', () => {
    expect(applyMultipliers(0, { boost: true })).toBe(0);
    expect(applyMultipliers(undefined, { boost: true })).toBe(0);
    expect(applyMultipliers(NaN)).toBe(0);
  });
});

describe('scorePicks', () => {
  const roundScores = {
    drivers: { NOR: { total: 87 }, HAM: { total: 44 }, ALO: { total: 50 }, BOT: { total: 10 } },
    constructors: { mclaren: 95 },
  };

  it('scores the rulebook worked example', () => {
    const { breakdown, total } = scorePicks(
      { A: 'NOR', B: 'HAM', C: 'ALO', D: 'BOT', constructor: 'mclaren', boost: 'C' },
      roundScores,
    );
    expect(breakdown.A).toMatchObject({ code: 'NOR', base: 87, final: 87, boost: false });
    expect(breakdown.C).toMatchObject({ code: 'ALO', base: 50, final: 75, boost: true });
    expect(breakdown.constructor).toEqual({ teamId: 'mclaren', total: 95 });
    expect(total).toBe(87 + 44 + 75 + 10 + 95);
  });

  it('defaults the boost to the tier D driver', () => {
    const { breakdown } = scorePicks({ A: 'NOR', B: 'HAM', C: 'ALO', D: 'BOT', constructor: 'mclaren' }, roundScores);
    expect(breakdown.D.boost).toBe(true);
    expect(breakdown.D.final).toBe(15);
    expect(breakdown.C.boost).toBe(false);
  });

  it('halves an emergency slot and stacks it with the boost', () => {
    const { breakdown } = scorePicks(
      { A: 'NOR', B: 'HAM', C: 'ALO', D: 'BOT', constructor: 'mclaren', boost: 'C', emergency: { C: true } },
      roundScores,
    );
    expect(breakdown.C.final).toBe(38); // ceil(50 × 1.5 × 0.5)
    expect(breakdown.C.emergency).toBe(true);
  });

  it('scores an unfilled or unknown slot as zero', () => {
    const { breakdown, total } = scorePicks({ A: 'NOR', C: 'XXX', constructor: 'nobody' }, roundScores);
    expect(breakdown.B).toMatchObject({ code: null, base: 0, final: 0 });
    expect(breakdown.C).toMatchObject({ code: 'XXX', base: 0, final: 0 });
    expect(breakdown.constructor).toEqual({ teamId: 'nobody', total: 0 });
    expect(total).toBe(87);
  });
});

describe('validatePicks', () => {
  const tiers = [
    { code: 'A1', tier: 'A' }, { code: 'A2', tier: 'A' },
    { code: 'B1', tier: 'B' }, { code: 'B2', tier: 'B' },
    { code: 'C1', tier: 'C' }, { code: 'C2', tier: 'C' },
    { code: 'D1', tier: 'D' }, { code: 'D2', tier: 'D' },
  ];
  const good = { A: 'A1', B: 'B1', C: 'C1', D: 'D1', constructor: 'red', boost: 'D' };
  const base = { tiers, usage: {}, caps: { driver: 5, constructor: 4 } };
  const slots = res => res.errors.map(e => e.slot);

  it('accepts a legal lineup', () => {
    expect(validatePicks(good, base)).toEqual({ ok: true, errors: [] });
  });

  it('accepts a plain code → tier map as well as the computeTiers array', () => {
    const map = Object.fromEntries(tiers.map(t => [t.code, t.tier]));
    expect(validatePicks(good, { ...base, tiers: map }).ok).toBe(true);
  });

  it('rejects a lineup submitted after the lock', () => {
    const res = validatePicks(good, { ...base, lockAt: '2026-08-22T14:00:00Z', now: '2026-08-22T14:00:01Z' });
    expect(res.ok).toBe(false);
    expect(slots(res)).toContain('round');
  });

  it('accepts a lineup submitted before the lock', () => {
    expect(validatePicks(good, { ...base, lockAt: '2026-08-22T14:00:00Z', now: '2026-08-22T13:59:59Z' }).ok).toBe(true);
  });

  it('rejects an empty slot', () => {
    const res = validatePicks({ ...good, B: null }, base);
    expect(res.errors).toContainEqual({ slot: 'B', code: null, message: 'No driver selected for Tier B.' });
  });

  it('rejects a driver who is not entered this round', () => {
    const res = validatePicks({ ...good, A: 'ZZZ' }, base);
    expect(res.errors[0]).toMatchObject({ slot: 'A', code: 'ZZZ' });
    expect(res.errors[0].message).toMatch(/not an entry/);
  });

  it('rejects a driver from the wrong tier', () => {
    const res = validatePicks({ ...good, A: 'B2' }, base);
    expect(res.errors[0].message).toBe('B2 is in Tier B, not Tier A.');
  });

  it('rejects a driver at the season cap', () => {
    const res = validatePicks(good, { ...base, usage: { drivers: { A1: 5 } } });
    expect(slots(res)).toEqual(['A']);
    expect(res.errors[0].message).toMatch(/at your season cap \(5 starts\)/);
  });

  it('allows an emergency pick once every driver in the tier is spent', () => {
    const res = validatePicks(
      { ...good, emergency: { A: true } },
      { ...base, usage: { drivers: { A1: 5, A2: 6 } } },
    );
    expect(res.ok).toBe(true);
  });

  it('rejects an emergency pick while the tier still has a legal driver', () => {
    const res = validatePicks(
      { ...good, emergency: { A: true } },
      { ...base, usage: { drivers: { A1: 5 } } },
    );
    expect(res.errors[0].message).toMatch(/only allowed when every Tier A driver is at your cap/);
  });

  it('rejects an emergency flag on a driver who is not at their cap', () => {
    const res = validatePicks({ ...good, emergency: { C: true } }, base);
    expect(res.errors[0]).toMatchObject({ slot: 'C', code: 'C1' });
    expect(res.errors[0].message).toMatch(/not at your cap/);
  });

  it('rejects a missing constructor', () => {
    const res = validatePicks({ ...good, constructor: null }, base);
    expect(res.errors).toContainEqual({ slot: 'constructor', code: null, message: 'No constructor selected.' });
  });

  it('rejects a constructor at the season cap, with no emergency escape', () => {
    const res = validatePicks(good, { ...base, usage: { constructors: { red: 4 } } });
    expect(slots(res)).toEqual(['constructor']);
    expect(res.errors[0].message).toMatch(/at your season cap \(4 starts\)/);
  });

  it('rejects a boost outside tiers C and D', () => {
    expect(validatePicks({ ...good, boost: 'A' }, base).errors[0])
      .toMatchObject({ slot: 'boost', code: 'A' });
    expect(validatePicks({ ...good, boost: 'C' }, base).ok).toBe(true);
    expect(validatePicks({ ...good, boost: undefined }, base).ok).toBe(true);
  });

  it('reads season-record cap field names too', () => {
    const res = validatePicks(good, { tiers, usage: { drivers: { A1: 3 } }, caps: { capDriver: 3, capConstructor: 4 } });
    expect(res.errors[0].message).toMatch(/\(3 starts\)/);
  });

  it('reports every problem at once, not just the first', () => {
    const res = validatePicks({ A: 'B1', B: null, C: 'C1', D: 'D1', constructor: null, boost: 'B' }, base);
    expect(slots(res).sort()).toEqual(['A', 'B', 'boost', 'constructor']);
  });
});

// ---------------------------------------------------------------------------
// replay over the real season bundles
// ---------------------------------------------------------------------------

describe('replaySeason - 2024 and 2025 regression', () => {
  const seasons = {};
  for (const year of [2024, 2025]) {
    seasons[year] = replaySeason(loadBundle(year), loadBundle(year - 1));
  }

  // "The race winner is (one of) the round's top scorer(s)" - the legibility
  // check the ruleset was tuned against.
  const winnerTopsRate = (year) => {
    const bundle = loadBundle(year);
    let hits = 0;
    for (const { round, scores } of seasons[year]) {
      const codes = Object.keys(scores.drivers);
      const max = Math.max(...codes.map(c => scores.drivers[c].total));
      const winner = bundle.results[String(round)].order[0];
      if (scores.drivers[winner] && scores.drivers[winner].total === max) hits++;
    }
    return hits / seasons[year].length;
  };

  it('scores every round of both seasons', () => {
    expect(seasons[2024]).toHaveLength(24);
    expect(seasons[2025]).toHaveLength(24);
  });

  it('makes the race winner a top scorer in 96% of 2024 rounds', () => {
    expect(Math.round(winnerTopsRate(2024) * 100)).toBe(96);
  });

  it('makes the race winner a top scorer in 100% of 2025 rounds', () => {
    expect(Math.round(winnerTopsRate(2025) * 100)).toBe(100);
  });

  it('keeps the tier season means monotone A > B > C > D', () => {
    for (const year of [2024, 2025]) {
      const byTier = { A: [], B: [], C: [], D: [] };
      for (const { scores, tiers } of seasons[year]) {
        for (const t of tiers) {
          if (scores.drivers[t.code]) byTier[t.tier].push(scores.drivers[t.code].total);
        }
      }
      const means = ['A', 'B', 'C', 'D'].map(l => mean(byTier[l]));
      expect(means[0], `${year} A > B`).toBeGreaterThan(means[1]);
      expect(means[1], `${year} B > C`).toBeGreaterThan(means[2]);
      expect(means[2], `${year} C > D`).toBeGreaterThan(means[3]);
    }
  });

  it('pays a non-classified driver about 5 (2024) / 6.5 (2025) points on average', () => {
    const dnfMean = year => {
      const totals = [];
      for (const { scores } of seasons[year]) {
        for (const s of Object.values(scores.drivers)) if (!s.classified) totals.push(s.total);
      }
      return mean(totals);
    };
    expect(dnfMean(2024)).toBeCloseTo(5.0, 1);
    expect(dnfMean(2025)).toBeGreaterThan(6.3);
    expect(dnfMean(2025)).toBeLessThan(6.7);
  });

  it('never scores a negative component or total', () => {
    for (const year of [2024, 2025]) {
      for (const { scores } of seasons[year]) {
        for (const s of Object.values(scores.drivers)) {
          for (const v of Object.values(s)) if (typeof v === 'number') expect(v).toBeGreaterThanOrEqual(0);
        }
        for (const v of Object.values(scores.constructors)) expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('publishes exactly tierSizes(n) tiers every round', () => {
    for (const year of [2024, 2025]) {
      for (const { round, tiers, context } of seasons[year]) {
        const counts = ['A', 'B', 'C', 'D'].map(l => tiers.filter(t => t.tier === l).length);
        expect(counts, `${year} r${round}`).toEqual(tierSizes(context.entries.length));
      }
    }
  });

  it('seeds round 1 from the previous season, so nobody starts blank', () => {
    const first = seasons[2024][0];
    expect(first.tiers.filter(t => t.tier === 'A').map(t => t.code)).toEqual(['VER', 'NOR', 'LEC', 'RUS', 'PER']);
    expect(first.tiers.filter(t => t.tier === 'D').map(t => t.code)).toEqual(['SAR', 'ZHO', 'HUL', 'BOT', 'MAG']);
  });

  it('keeps a driver who qualified but did not start as a scoring entry', () => {
    // 2025 Spain: Stroll qualified, then withdrew before the race.
    const round9 = seasons[2025].find(r => r.round === 9);
    expect(round9.scores.drivers.STR).toBeDefined();
    expect(round9.scores.drivers.STR.classified).toBe(false);
    expect(round9.scores.drivers.STR.race).toBe(0);
  });
});

describe('replaySeason - 2026 round 12 worked example', () => {
  const bundle = loadBundle(2026);
  const ctx = buildContext(bundle, 12, seedHistory(loadBundle(2025)));
  const scores = scoreRound(bundle, 12, ctx);
  // The rulebook's §13 example is hand-computed from the race weekend only;
  // Zandvoort 2026 is a sprint weekend in the bundle, so the published figures
  // are the totals net of the sprint table (§6.8).
  const netOfSprint = code => scores.drivers[code].total - scores.drivers[code].sprint;

  it('reproduces the published driver totals', () => {
    expect(netOfSprint('NOR')).toBe(87);
    expect(netOfSprint('ANT')).toBe(60);
    expect(netOfSprint('RUS')).toBe(57);
    expect(netOfSprint('ALO')).toBe(50);
    expect(netOfSprint('HUL')).toBe(47);
    expect(netOfSprint('HAM')).toBe(44);
    expect(netOfSprint('BOT')).toBe(10);
    expect(netOfSprint('VER')).toBe(6);
    expect(netOfSprint('BEA')).toBe(0);
  });

  it('breaks the winner s score down the way the rulebook does', () => {
    // Pole, win, big form beat, teammate double.
    expect(scores.drivers.NOR).toMatchObject({ race: 50, quali: 15, form: 15, teammate: 7, gained: 0, laps: 0 });
  });

  it('breaks the boosted midfield charge down the way the rulebook does', () => {
    // P9 from P18: +18 gained, +15 form beat, out-qualified Stroll.
    expect(scores.drivers.ALO).toMatchObject({ race: 15, gained: 18, form: 15, teammate: 2, quali: 0 });
  });

  it('pays the retirement its laps consolation and quali head-to-head only', () => {
    expect(scores.drivers.BOT).toMatchObject({ race: 0, laps: 8, teammate: 2, classified: false });
  });

  it('scores McLaren 95 as its two cars race + quali points', () => {
    expect(scores.constructors.mclaren).toBe(95);
  });

  it('totals the worked-example lineup at 311 net of the sprint', () => {
    const net = { drivers: {}, constructors: scores.constructors };
    for (const [code, s] of Object.entries(scores.drivers)) net.drivers[code] = { ...s, total: s.total - s.sprint };
    const { total } = scorePicks(
      { A: 'NOR', B: 'HAM', C: 'ALO', D: 'BOT', constructor: 'mclaren', boost: 'C' },
      net,
    );
    expect(total).toBe(311);
  });
});
