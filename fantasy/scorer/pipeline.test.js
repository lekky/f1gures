// End-to-end tests for the scorer pipeline, driven against the in-memory
// PocketBase double. A synthetic 8-car, 3-round season keeps the tier cut
// (2/2/2/2) small enough to reason about by hand, so every assertion here is
// about the pipeline's behaviour rather than the engine's arithmetic.

import { describe, it, expect } from 'vitest';
import { runScorer } from './run.mjs';
import { MemoryPb } from './lib/memoryPb.js';

const CODES = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'];
const TEAM_OF = { D1: 't1', D2: 't1', D3: 't2', D4: 't2', D5: 't3', D6: 't3', D7: 't4', D8: 't4' };

const ROUND_DATES = {
  1: { q: '2026-03-07', race: '2026-03-08' },
  2: { q: '2026-03-21', race: '2026-03-22' },
  3: { q: '2026-04-04', race: '2026-04-05' },
};

function calendarEntry(round) {
  const d = ROUND_DATES[round];
  return {
    round,
    name: `Round ${round}`,
    sprint: false,
    sessions: {
      q: { date: d.q, time: '14:00:00Z' },
      race: { date: d.race, time: '13:00:00Z' },
    },
  };
}

/**
 * A round result: `order` is the finishing order (codes), `dns` never started.
 */
function result(order, { dns = [], fastest = null } = {}) {
  const detail = {};
  const quali = {};
  order.forEach((code, i) => {
    detail[code] = { position: String(i + 1), grid: i + 1, points: 0, laps: 50, status: 'Finished', team: TEAM_OF[code] };
  });
  for (const code of dns) {
    detail[code] = { position: 'W', grid: 0, points: 0, laps: 0, status: 'Did not start', team: TEAM_OF[code] };
  }
  CODES.forEach((code, i) => { quali[code] = { position: i + 1 }; });
  return { pole: order[0], fastest: fastest || order[0], order, grid: order, dnfs: [], detail, quali };
}

function makeBundle(resultRounds) {
  return {
    seasonYear: 2026,
    teams: [{ id: 't1', name: 'Team One' }, { id: 't2', name: 'Team Two' }, { id: 't3', name: 'Team Three' }, { id: 't4', name: 'Team Four' }],
    drivers: CODES.map(code => ({ id: code, jolpicaId: code.toLowerCase(), first: 'Driver', last: code, team: TEAM_OF[code] })),
    calendar: [1, 2, 3].map(calendarEntry),
    results: resultRounds,
  };
}

const R1 = result(CODES);
// Round 2: D5 wins from the back, D2 never starts.
const R2 = result(['D5', 'D1', 'D3', 'D4', 'D6', 'D7', 'D8'], { dns: ['D2'] });

const bundleAfterR1 = () => makeBundle({ 1: R1 });
const bundleAfterR2 = () => makeBundle({ 1: R1, 2: R2 });

const AFTER_R1 = '2026-03-10T00:00:00Z';   // inside round 1's provisional window
const AFTER_R2_LOCK = '2026-03-21T15:00:00Z'; // round 2 locked, race not yet run
const AFTER_R2 = '2026-03-24T00:00:00Z';   // round 2 raced, still provisional
const AFTER_R3_LOCK = '2026-04-04T15:00:00Z'; // round 2's window has closed at round 3's lock

const run = (pb, bundle, now) => runScorer({ pb, bundle, prevBundle: null, year: 2026, now, log: () => {} });

async function makeUser(pb, id) {
  await pb.create('users', { id, email: `${id}@example.com` });
  return id;
}

/** The round record for a round number. */
const roundRec = async (pb, n) => (await pb.listAll('fantasy_rounds', `round=${n}`))[0];
const entryOf = async (pb, code) => (await pb.listAll('fantasy_entries', `code="${code}"`))[0];

/** Write a pick the way a player would, using ids the pipeline created. */
async function addPick(pb, { user, round, slots, constructor, boost = 'D' }) {
  const r = await roundRec(pb, round);
  const data = { user, round: r.id, constructor, boost, emergency: {}, carriedForward: false, refunded: [] };
  for (const [slot, code] of Object.entries(slots)) data[`driver${slot}`] = (await entryOf(pb, code)).id;
  return pb.create('fantasy_picks', data);
}

/** code → tier letter for a round. */
async function tiersOf(pb, round) {
  const r = await roundRec(pb, round);
  const rows = await pb.listAll('fantasy_tiers', `round="${r.id}"`);
  const out = {};
  for (const row of rows) {
    const entry = [...pb.data.get('fantasy_entries').values()].find(e => e.id === row.entry);
    out[entry.code] = row.tier;
  }
  return out;
}

describe('runScorer — reference sync', () => {
  it('creates the season, rounds and entries from the bundle', async () => {
    const pb = new MemoryPb();
    const summary = await run(pb, bundleAfterR1(), AFTER_R1);

    expect(summary).toMatchObject({ rounds: 3, entries: 8, roundsScored: [1] });
    const season = await pb.findOne('fantasy_seasons', 'year=2026');
    expect(season).toMatchObject({ status: 'active', capDriver: 1, capConstructor: 1, splitLength: 6, rulesVersion: '0.2' });

    const r1 = await roundRec(pb, 1);
    expect(r1).toMatchObject({ name: 'Round 1', isSprint: false, status: 'provisional' });
    expect(r1.lockAt).toBe('2026-03-07 14:00:00.000Z');
    expect(r1.raceAt).toBe('2026-03-08 13:00:00.000Z');
    // Round 1's window is race + 7 days; round 2's lock is later still (§9).
    expect(r1.finalAt).toBe('2026-03-15 13:00:00.000Z');
    expect((await roundRec(pb, 3)).status).toBe('upcoming');
  });

  it('publishes an equal-sized tier cut for the scored round and the next one (§3)', async () => {
    const pb = new MemoryPb();
    await run(pb, bundleAfterR1(), AFTER_R1);
    for (const round of [1, 2]) {
      const tiers = await tiersOf(pb, round);
      expect(Object.keys(tiers)).toHaveLength(8);
      for (const letter of ['A', 'B', 'C', 'D']) {
        expect(Object.values(tiers).filter(t => t === letter)).toHaveLength(2);
      }
    }
    // Round 3 has no history path yet — it is not the "next" round.
    expect(await tiersOf(pb, 3)).toEqual({});
  });

  it('is idempotent: a second identical run writes nothing', async () => {
    const pb = new MemoryPb();
    await run(pb, bundleAfterR1(), AFTER_R1);
    pb.resetStats();
    await run(pb, bundleAfterR1(), AFTER_R1);
    expect(pb.writes).toBe(0);
    expect(pb.stats.unchanged).toBeGreaterThan(0);
  });
});

describe('runScorer — scoring picks', () => {
  async function seeded() {
    const pb = new MemoryPb();
    await run(pb, bundleAfterR1(), AFTER_R1);
    const u1 = await makeUser(pb, 'u1');
    const u2 = await makeUser(pb, 'u2');
    const t1 = await tiersOf(pb, 1);
    const byTier = letter => CODES.filter(c => t1[c] === letter);
    await addPick(pb, { user: u1, round: 1, constructor: 't1', slots: { A: byTier('A')[0], B: byTier('B')[0], C: byTier('C')[0], D: byTier('D')[0] } });
    await addPick(pb, { user: u2, round: 1, constructor: 't2', slots: { A: byTier('A')[1], B: byTier('B')[1], C: byTier('C')[1], D: byTier('D')[1] } });
    return { pb, u1, u2, byTier };
  }

  it('scores every pick in the round and rolls it into the standings', async () => {
    const { pb, u1 } = await seeded();
    // The picks were written after round 1 was first scored; the round is
    // pulled through again because two picks have no score yet.
    const summary = await run(pb, bundleAfterR1(), AFTER_R1);
    expect(summary.roundsScored).toEqual([1]);
    expect(summary.pickScores).toBe(2);

    const r1 = await roundRec(pb, 1);
    const score = (await pb.listAll('fantasy_pick_scores', `round="${r1.id}" && user="${u1}"`))[0];
    expect(score.total).toBeGreaterThan(0);
    expect(score.breakdown.A.code).toBeTruthy();
    expect(score.breakdown.constructor.teamId).toBe('t1');

    const standings = await pb.listAll('fantasy_standings', `user="${u1}"`);
    expect(standings.map(s => s.scope).sort()).toEqual(['season', 'split-1']);
    expect(standings[0].points).toBe(score.total);
    expect(standings[0].bestWeekend).toBe(score.total);
  });

  it('re-scores a provisional round when a stewards\' decision changes it (§9)', async () => {
    const { pb } = await seeded();
    await run(pb, bundleAfterR1(), AFTER_R1);
    const before = (await pb.listAll('fantasy_pick_scores'))[0].total;
    // Same round, reversed classification — the fingerprint moves, so does the score.
    const summary = await run(pb, makeBundle({ 1: result([...CODES].reverse()) }), AFTER_R1);
    expect(summary.roundsScored).toEqual([1]);
    expect((await pb.listAll('fantasy_pick_scores'))[0].total).not.toBe(before);
  });

  it('leaves an unchanged, fully-scored round completely alone', async () => {
    const { pb } = await seeded();
    await run(pb, bundleAfterR1(), AFTER_R1);
    pb.resetStats();
    const summary = await run(pb, bundleAfterR1(), AFTER_R1);
    expect(summary.roundsScored).toEqual([]);
    expect(pb.writes).toBe(0);
  });
});

describe('runScorer — carry-forward (§5)', () => {
  async function upToR2Lock() {
    const pb = new MemoryPb();
    await run(pb, bundleAfterR1(), AFTER_R1);
    const u1 = await makeUser(pb, 'u1');
    const t1 = await tiersOf(pb, 1);
    const byTier = letter => CODES.filter(c => t1[c] === letter);
    await addPick(pb, {
      user: u1, round: 1, constructor: 't1', boost: 'C',
      slots: { A: byTier('A')[0], B: byTier('B')[0], C: byTier('C')[0], D: byTier('D')[0] },
    });
    return { pb, u1, byTier };
  }

  it('writes no row at all when nothing may legally carry (§5)', async () => {
    const { pb, u1 } = await upToR2Lock();
    // A 3-round calendar prorates to capDriver 1 / capConstructor 1, so every
    // driver and the constructor in the round 1 lineup are already spent.
    const summary = await run(pb, bundleAfterR1(), AFTER_R2_LOCK);
    expect(summary.carriedForward).toBe(0);
    const r2 = await roundRec(pb, 2);
    expect(await pb.listAll('fantasy_picks', `round="${r2.id}" && user="${u1}"`)).toHaveLength(0);
  });

  it('carries the lineup when the caps still allow it', async () => {
    const { pb, u1 } = await upToR2Lock();
    // Raise the caps the way an operator would, then re-run.
    const season = await pb.findOne('fantasy_seasons', 'year=2026');
    await pb.update('fantasy_seasons', season.id, { capDriver: 5, capConstructor: 4 });

    const summary = await run(pb, bundleAfterR1(), AFTER_R2_LOCK);
    expect(summary.carriedForward).toBe(1);

    const r1 = await roundRec(pb, 1);
    const r2 = await roundRec(pb, 2);
    const source = (await pb.listAll('fantasy_picks', `round="${r1.id}"`))[0];
    const carried = (await pb.listAll('fantasy_picks', `round="${r2.id}"`))[0];
    expect(carried.carriedForward).toBe(true);
    expect(carried.constructor).toBe('t1');
    // Slots carry only where the driver is still in that tier this round.
    const tiers2 = await tiersOf(pb, 2);
    for (const slot of ['A', 'B', 'C', 'D']) {
      if (!carried[`driver${slot}`]) continue;
      expect(carried[`driver${slot}`]).toBe(source[`driver${slot}`]);
      const entry = [...pb.data.get('fantasy_entries').values()].find(e => e.id === carried[`driver${slot}`]);
      expect(tiers2[entry.code]).toBe(slot);
    }
  });

  it('does not carry twice — a second run finds the pick already there', async () => {
    const { pb } = await upToR2Lock();
    const season = await pb.findOne('fantasy_seasons', 'year=2026');
    await pb.update('fantasy_seasons', season.id, { capDriver: 5, capConstructor: 4 });
    await run(pb, bundleAfterR1(), AFTER_R2_LOCK);
    pb.resetStats();
    const summary = await run(pb, bundleAfterR1(), AFTER_R2_LOCK);
    expect(summary.carriedForward).toBe(0);
    expect(pb.writes).toBe(0);
  });

  it('never carries into a round that has not locked yet', async () => {
    const { pb } = await upToR2Lock();
    const season = await pb.findOne('fantasy_seasons', 'year=2026');
    await pb.update('fantasy_seasons', season.id, { capDriver: 5, capConstructor: 4 });
    await run(pb, bundleAfterR1(), AFTER_R1);
    const r2 = await roundRec(pb, 2);
    expect(await pb.listAll('fantasy_picks', `round="${r2.id}"`)).toHaveLength(0);
  });
});

describe('runScorer — DNS refunds (§4)', () => {
  it('refunds the slot of a driver who did not start, and frees the cap', async () => {
    const pb = new MemoryPb();
    await run(pb, bundleAfterR1(), AFTER_R1);
    const season = await pb.findOne('fantasy_seasons', 'year=2026');
    await pb.update('fantasy_seasons', season.id, { capDriver: 1, capConstructor: 4 });
    const u1 = await makeUser(pb, 'u1');

    // Round 2's published tiers decide which slot D2 (the DNS) can occupy.
    const tiers2 = await tiersOf(pb, 2);
    const slots = {};
    for (const letter of ['A', 'B', 'C', 'D']) {
      slots[letter] = CODES.find(c => tiers2[c] === letter && (letter !== tiers2.D2 || c === 'D2'));
    }
    slots[tiers2.D2] = 'D2';
    await addPick(pb, { user: u1, round: 2, constructor: 't1', slots });

    const summary = await run(pb, bundleAfterR2(), AFTER_R2);
    expect(summary.roundsScored).toContain(2);
    expect(summary.refunds).toBe(1);

    const r2 = await roundRec(pb, 2);
    const pick = (await pb.listAll('fantasy_picks', `round="${r2.id}"`))[0];
    expect(pick.refunded).toEqual([tiers2.D2]);

    // §4: points earned before withdrawing are kept — D2 still qualified.
    const d2 = await entryOf(pb, 'D2');
    const score = (await pb.listAll('fantasy_scores', `round="${r2.id}" && entry="${d2.id}"`))[0];
    expect(score.components.dns).toBe(true);
    expect(score.components.quali).toBeGreaterThan(0);
    expect(score.components.race).toBe(0);
  });

  it('leaves the refund alone on a re-run', async () => {
    const pb = new MemoryPb();
    await run(pb, bundleAfterR2(), AFTER_R2);
    pb.resetStats();
    await run(pb, bundleAfterR2(), AFTER_R2);
    expect(pb.writes).toBe(0);
  });
});

describe('runScorer — provisional → final (§9)', () => {
  it('promotes a round once its window closes, and stops rescoring it', async () => {
    const pb = new MemoryPb();
    await run(pb, bundleAfterR2(), AFTER_R2);
    expect((await roundRec(pb, 2)).status).toBe('provisional');

    const summary = await run(pb, bundleAfterR2(), AFTER_R3_LOCK);
    expect(summary.finalised).toContain(2);
    expect((await roundRec(pb, 2)).status).toBe('final');

    // A late stewards' decision after the window must NOT rescore it.
    const late = makeBundle({ 1: R1, 2: result(['D8', 'D7', 'D6', 'D5', 'D4', 'D3', 'D1'], { dns: ['D2'] }) });
    const after = await run(pb, late, AFTER_R3_LOCK);
    expect(after.roundsScored).not.toContain(2);
  });

  it('records what it scored so the next run can tell nothing changed', async () => {
    const pb = new MemoryPb();
    await run(pb, bundleAfterR1(), AFTER_R1);
    const r1 = await roundRec(pb, 1);
    expect(r1.scored).toMatchObject({ rulesVersion: '0.2', entries: 8 });
    expect(r1.scored.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });
});
