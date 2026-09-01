// Replaying a season and publishing the next round's tiers.
//
// The engine's `replaySeason` already does the hard part: for each scored
// round it computes the tiers from everything BEFORE that round, then scores
// the round. This module adds the one thing a live scorer needs that a replay
// doesn't — tiers for the round that hasn't happened yet, published before
// picks open (rulebook §3).

import { RULES, computeTiers, replaySeason, seedHistory } from '../../../src/lib/fantasyScoring.mjs';

/**
 * Replay every scored round of a season.
 *
 * @param {object} bundle season bundle
 * @param {object|null} prevBundle previous season's bundle (tier + form seeding, §3)
 * @param {{tierCount?: number, window?: number}} [opts]
 * @returns {{round: number, scores: object, tiers: object[], context: object}[]}
 */
export function replay(bundle, prevBundle, opts = {}) {
  return replaySeason(bundle, prevBundle, {
    tierCount: opts.tierCount ?? RULES.TIER_LETTERS.length,
    window: opts.window ?? RULES.TIER_WINDOW,
  });
}

/**
 * Tiers for the next, unraced round.
 *
 * Two judgement calls the engine can't make on its own:
 *  - **Entry list.** `entryList` reads a round's classification, which an
 *    unraced round has none of. The grid that raced last weekend is the best
 *    available forecast of who is entered next weekend, so that is what the
 *    published tiers use. The scorer re-publishes on every run, so a driver
 *    change is picked up as soon as the bundle carries it.
 *  - **prevTiers.** The stability rule (§3) needs the previous round's
 *    published cut; that is the last replayed round's tiers.
 *
 * @param {object} args
 * @param {{round: number, scores: object, tiers: object[], context: object}[]} args.replayed
 * @param {object|null} args.prevBundle
 * @param {{window?: number, hysteresis?: number, tierCount?: number}} [args.opts]
 * @returns {{code: string, tier: string, rank: number, avgPts: number}[]}
 */
export function tiersForNextRound({ replayed, prevBundle, opts = {} }) {
  if (!replayed.length) return [];
  const window = opts.window ?? RULES.TIER_WINDOW;
  const hysteresis = opts.hysteresis ?? RULES.TIER_HYSTERESIS;
  const tierCount = opts.tierCount ?? RULES.TIER_LETTERS.length;

  // History = the previous season's tail (§3 season start) plus every round
  // scored so far this season, oldest first.
  const seed = prevBundle ? seedHistory(prevBundle, window) : { history: {} };
  const history = {};
  for (const [code, totals] of Object.entries(seed.history)) history[code] = totals.slice();
  for (const step of replayed) {
    for (const [code, s] of Object.entries(step.scores.drivers)) {
      (history[code] || (history[code] = [])).push(s.total);
    }
  }

  const last = replayed[replayed.length - 1];
  const prevTiers = Object.fromEntries(last.tiers.map(t => [t.code, t.tier]));
  return computeTiers({
    entries: last.context.entries,
    history,
    prevTiers,
    hysteresis,
    window,
    tierCount,
  });
}

/**
 * The first calendar round after the last scored one — the round whose tiers
 * and carry-forward the scorer is working towards.
 *
 * @param {object} bundle
 * @param {number} lastScoredRound
 * @returns {number|null}
 */
export function nextRoundNumber(bundle, lastScoredRound) {
  const rounds = ((bundle && bundle.calendar) || [])
    .map(c => Number(c.round))
    .filter(n => Number.isFinite(n) && n > lastScoredRound)
    .sort((a, b) => a - b);
  return rounds.length ? rounds[0] : null;
}
