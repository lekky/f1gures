// Round scoring, DNS refunds and usage accounting.
//
// The scoring maths itself lives in `src/lib/fantasyScoring.mjs` and is never
// re-implemented here — this module only decides WHICH rounds need scoring,
// WHICH picks earned a cap refund, and how many starts a player has spent.

import { createHash } from 'node:crypto';
import { canonical } from './pb.js';

export const SLOTS = ['A', 'B', 'C', 'D'];

/**
 * A stable fingerprint of one round's result data.
 *
 * The scorer rescoring decision hangs off this: a stewards' decision that
 * changes a classification changes the hash, which re-scores the round (§9);
 * an unchanged bundle leaves it identical and the run writes nothing.
 *
 * @param {object|null} result the bundle's `results[round]` (or pending record)
 * @returns {string} 16 hex chars
 */
export function resultFingerprint(result) {
  return createHash('sha256').update(canonical(result ?? null)).digest('hex').slice(0, 16);
}

/**
 * Statuses the bundle uses for a car that never took the start. `position`
 * "W" (withdrawn) means the same thing when the status text is missing.
 */
const DNS_STATUS = /^(did not start|withdrew|withdrawn|did not qualify|excluded)/i;

/**
 * Rulebook §4/§8: a driver you picked who did not start the Grand Prix has the
 * start refunded to your cap — while keeping whatever they scored in earlier
 * sessions.
 *
 * Three ways the bundle says "did not start":
 *   1. they qualified but never appear in the race classification at all;
 *   2. an explicit "Did not start" / "Withdrew" status;
 *   3. a `position` of "W".
 *
 * A lap-1 retirement is NOT a DNS — they started, so the start is spent.
 *
 * @param {object|null} result bundle result record for the round
 * @param {{code: string}[]} entries the round's entry list
 * @returns {Set<string>} driver codes that did not start
 */
export function dnsCodes(result, entries = []) {
  const out = new Set();
  const detail = (result && result.detail) || {};
  const quali = (result && result.quali) || {};
  const codes = new Set([...entries.map(e => e.code), ...Object.keys(detail), ...Object.keys(quali)]);
  for (const code of codes) {
    const det = detail[code];
    if (!det) { out.add(code); continue; }
    if (String(det.position) === 'W') { out.add(code); continue; }
    if (det.status && DNS_STATUS.test(String(det.status))) out.add(code);
  }
  return out;
}

/**
 * Rulebook §8: "If the Grand Prix itself is cancelled, the round is void: no
 * points, all starts refunded." A bundle expresses that as a results record
 * with nothing classified in it.
 *
 * @param {object|null} result
 * @returns {boolean}
 */
export function isVoidRound(result) {
  if (!result) return false;
  const order = (result.order || []).length;
  const detail = Object.keys(result.detail || {}).length;
  return order === 0 && detail === 0;
}

/**
 * `fantasy_picks.refunded` accepts three shapes (see the backend README): an
 * array of slot letters and/or entry ids, an object keyed by slot, or an object
 * keyed by entry id. `"constructor"` is a valid key for the void-race case.
 *
 * @param {*} refunded stored value
 * @param {string} slot 'A'..'D' or 'constructor'
 * @param {string} [entryId]
 * @returns {boolean}
 */
export function isRefunded(refunded, slot, entryId) {
  if (!refunded) return false;
  if (Array.isArray(refunded)) return refunded.includes(slot) || (!!entryId && refunded.includes(entryId));
  if (typeof refunded === 'object') {
    if (refunded[slot] === true) return true;
    if (entryId && refunded[entryId] === true) return true;
  }
  return false;
}

/**
 * The slots to refund on one pick for one round.
 *
 * @param {object} pick a fantasy_picks record (driverA..D are entry ids)
 * @param {Record<string, string>} codeOfEntry entry id → driver code
 * @param {Set<string>} dns codes that did not start
 * @param {boolean} voidRound whole round cancelled
 * @returns {string[]} slot letters, plus 'constructor' on a void round
 */
export function refundsFor(pick, codeOfEntry, dns, voidRound = false) {
  const out = [];
  for (const slot of SLOTS) {
    const entryId = pick[`driver${slot}`];
    if (!entryId) continue;
    if (voidRound || dns.has(codeOfEntry[entryId])) out.push(slot);
  }
  if (voidRound && pick.constructor) out.push('constructor');
  return out;
}

/**
 * How many starts a player has spent, counted the way the picks hook counts
 * them: over already-locked rounds of the season, every slot the entry
 * occupies, minus anything `refunded`.
 *
 * @param {object[]} picks the user's fantasy_picks records
 * @param {(pick: object) => boolean} include predicate, e.g. "round already locked"
 * @param {Record<string, string>} codeOfEntry entry id → driver code
 * @returns {{drivers: Record<string, number>, constructors: Record<string, number>}}
 */
export function countUsage(picks, include, codeOfEntry) {
  const drivers = {};
  const constructors = {};
  for (const pick of picks) {
    if (!include(pick)) continue;
    for (const slot of SLOTS) {
      const entryId = pick[`driver${slot}`];
      if (!entryId) continue;
      if (isRefunded(pick.refunded, slot, entryId)) continue;
      const code = codeOfEntry[entryId];
      if (!code) continue;
      drivers[code] = (drivers[code] || 0) + 1;
    }
    if (pick.constructor && !isRefunded(pick.refunded, 'constructor')) {
      constructors[pick.constructor] = (constructors[pick.constructor] || 0) + 1;
    }
  }
  return { drivers, constructors };
}

/**
 * A stored pick record → the plain `{A,B,C,D,constructor,boost,emergency}`
 * shape the engine's `scorePicks` / `validatePicks` expect.
 *
 * @param {object} pick
 * @param {Record<string, string>} codeOfEntry entry id → driver code
 * @returns {object}
 */
export function pickToLineup(pick, codeOfEntry) {
  const lineup = {
    constructor: pick.constructor || null,
    boost: pick.boost === 'C' ? 'C' : 'D',
    emergency: pick.emergency && typeof pick.emergency === 'object' && !Array.isArray(pick.emergency)
      ? pick.emergency
      : {},
  };
  for (const slot of SLOTS) {
    const entryId = pick[`driver${slot}`];
    lineup[slot] = entryId ? (codeOfEntry[entryId] || null) : null;
  }
  return lineup;
}
