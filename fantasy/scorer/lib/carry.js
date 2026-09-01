// Rulebook §5 carry-forward.
//
//   "if you miss the deadline, your most recent locked lineup rolls over
//    automatically wherever caps allow. A slot that can't legally carry over
//    stays empty and scores 0. The Boost carries to the same driver if still
//    eligible, otherwise it defaults to your Tier D pick."
//
// Pure: no PocketBase, no clock. The caller supplies the source pick, the
// round's published tiers, and the usage already spent before this round.

import { SLOTS } from './score.js';

/**
 * Plan one player's carried lineup for one round.
 *
 * A slot carries only when the driver is *legally* pickable this round, which
 * is both halves of the pick rules: they must still sit in that tier (form
 * moves people between tiers week to week) and be under the usage cap.
 * Anything else leaves the slot empty — the rulebook's explicit choice, so a
 * missed deadline never produces an illegal lineup.
 *
 * Emergency flags are deliberately NOT carried: an emergency pick is a
 * conscious decision to take half points, and the engine rejects one that
 * isn't needed. A capped driver simply drops out of the carried lineup.
 *
 * @param {object} args
 * @param {object|null} args.source most recent locked pick record, or null
 * @param {Record<string, string>} args.tierOfEntry entry id → 'A'|'B'|'C'|'D' for THIS round
 * @param {Record<string, string>} args.codeOfEntry entry id → driver code
 * @param {{drivers?: Record<string, number>, constructors?: Record<string, number>}} args.usage starts spent before this round
 * @param {{capDriver: number, capConstructor: number}} args.caps
 * @returns {object|null} fantasy_picks fields (entry ids), or null when there is nothing to carry
 */
export function planCarry({ source, tierOfEntry, codeOfEntry, usage = {}, caps }) {
  // Rulebook §5: "A brand-new player with no previous lineup scores 0 for
  // weekends before their first lock." No source, no row.
  if (!source) return null;

  const driverUsage = usage.drivers || {};
  const constructorUsage = usage.constructors || {};
  const out = { driverA: '', driverB: '', driverC: '', driverD: '', constructor: '', emergency: {}, carriedForward: true, refunded: [] };
  let carriedAny = false;

  for (const slot of SLOTS) {
    const entryId = source[`driver${slot}`];
    if (!entryId) continue;
    // Still in this slot's tier this round?
    if (tierOfEntry[entryId] !== slot) continue;
    // Still under the season cap?
    const code = codeOfEntry[entryId];
    if (!code) continue;
    if ((driverUsage[code] || 0) >= caps.capDriver) continue;
    out[`driver${slot}`] = entryId;
    carriedAny = true;
  }

  if (source.constructor && (constructorUsage[source.constructor] || 0) < caps.capConstructor) {
    out.constructor = source.constructor;
    carriedAny = true;
  }

  // The Boost follows the same driver when that slot carried; otherwise it
  // falls back to Tier D, which is the rulebook's stated default.
  const sourceBoost = source.boost === 'C' ? 'C' : 'D';
  out.boost = out[`driver${sourceBoost}`] ? sourceBoost : 'D';

  return carriedAny ? out : null;
}

/**
 * The pick to carry from: the player's latest pick in a round that had already
 * locked before this one.
 *
 * @param {object[]} picks the user's pick records
 * @param {Record<string, number>} roundNumberOf round id → round number
 * @param {number} round the round being filled
 * @returns {object|null}
 */
export function latestPickBefore(picks, roundNumberOf, round) {
  let best = null;
  let bestRound = -Infinity;
  for (const pick of picks) {
    const n = roundNumberOf[pick.round];
    if (!Number.isFinite(n) || n >= round) continue;
    if (n > bestRound) { bestRound = n; best = pick; }
  }
  return best;
}
