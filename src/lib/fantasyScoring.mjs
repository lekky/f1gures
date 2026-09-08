// Single source of truth for the f1gures fantasy game's scoring maths.
//
// Ports the simulation-validated v0.2 ruleset (see the Fantasy Rulebook,
// edition 1) into a pure, dependency-free library: given a season bundle
// (the shape `public/data/<year>.json` ships), it scores every driver and
// constructor for a round, cuts the grid into form tiers, applies the
// Boost / Emergency multipliers, validates a user's picks and scores them.
//
// Consumers (keep it that way - do NOT re-implement fantasy scoring
// anywhere else, the same mistake seasonStats.mjs exists to prevent):
//   - fantasy/scorer/run.mjs        the scheduled scorer that writes PocketBase
//   - src/components/islands/fantasy/*  pick board + tier table previews
//
// Everything here is grid-size agnostic (20, 22, 24 cars all work) and
// deliberately defensive: missing/odd bundle fields degrade to 0 points
// rather than throwing, because a live bundle is fetched mid-weekend and
// half-populated rounds are normal.
//
// Plain ESM with zero imports so Node scripts, Vite islands and Astro
// frontmatter can all consume it.

/**
 * The frozen v0.2 rule constants. Every number a player can see traces back
 * to one of these tables; nothing is computed from a hidden parameter.
 *
 * @type {Readonly<object>}
 */
export const RULES = Object.freeze({
  version: '0.2',
  // Race classification, P1..P22. P23+ falls through to 1 (RACE_TAIL).
  RACE_PTS: Object.freeze([50, 40, 34, 29, 25, 22, 19, 17, 15, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1]),
  RACE_TAIL: 1,
  // Qualifying classification, P1..P10. P11+ scores nothing - making Q3 is the prize.
  QUALI_PTS: Object.freeze([15, 12, 10, 8, 6, 5, 4, 3, 2, 1]),
  // Sprint classification, P1..P10. P11+ falls through to 1 (SPRINT_TAIL).
  SPRINT_PTS: Object.freeze([15, 12, 10, 8, 7, 6, 5, 4, 3, 2]),
  SPRINT_TAIL: 1,
  GAINED_PER_PLACE: 2,
  GAINED_CAP: 20,
  LAPS_CAP: 10,
  // Form beat ladder: places better than the season-to-date average finish
  // → bonus. Anything under 2 places pays nothing.
  FORM_LADDER: Object.freeze({ 2: 3, 3: 6, 4: 9, 5: 12, 6: 15 }),
  TEAMMATE_RACE: 5,
  TEAMMATE_QUALI: 2,
  FASTEST_LAP: 5,
  BOOST_MULTIPLIER: 1.5,
  EMERGENCY_MULTIPLIER: 0.5,
  // Baseline pool: this season's prior rounds, topped up from the previous
  // season's tail until the driver has this many starts of their own.
  FORM_MIN_STARTS: 3,
  // Rolling window (in rounds) behind the tier ranking, and how many ranking
  // places from a boundary a driver is held in their previous tier.
  TIER_WINDOW: 6,
  TIER_HYSTERESIS: 2,
  TIER_LETTERS: Object.freeze(['A', 'B', 'C', 'D']),
  // Season defaults for a 24-round calendar; a season record may override.
  CAP_DRIVER: 5,
  CAP_CONSTRUCTOR: 4,
});

const TIER_LETTERS = RULES.TIER_LETTERS;

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

// Bundle `position` is a string: a numeral means classified, the letter codes
// ("R" retired, "D" disqualified, "W" withdrawn, "E" excluded, "N" not
// classified) mean the driver scores nothing position-dependent.
function numPos(value) {
  const p = Number(value);
  return Number.isFinite(p) && p > 0 ? p : null;
}

function mean(values) {
  if (!values.length) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

// Points off a fixed table, with an explicit tail value for anyone past its end.
function fromTable(table, position, tail = 0) {
  if (!position || position < 1) return 0;
  return position <= table.length ? table[position - 1] : tail;
}

// The round's result record - a completed race, or the qualifying-only
// holding record the bundle parks in `pendingQuali` before the race runs.
function resultFor(bundle, round) {
  const key = String(round);
  const results = (bundle && bundle.results) || {};
  if (results[key]) return results[key];
  const pending = (bundle && bundle.pendingQuali) || {};
  if (pending[key]) {
    const sprint = ((bundle && bundle.pendingSprint) || {})[key] || null;
    return { ...pending[key], ...(sprint ? { sprintResults: sprint } : {}) };
  }
  return null;
}

/** Rounds present in a bundle's `results`, ascending. @returns {number[]} */
function roundsOf(bundle) {
  return Object.keys((bundle && bundle.results) || {})
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

// The finishing slot a driver occupies for baseline purposes: their classified
// position when they have one, otherwise their place in the classification
// order (so a lap-1 retirement counts as a last-place result, not a blank).
function finishSlot(result, code) {
  const order = (result && result.order) || [];
  const i = order.indexOf(code);
  if (i < 0) return null;
  const detail = (result.detail || {})[code];
  return numPos(detail && detail.position) ?? i + 1;
}

// ---------------------------------------------------------------------------
// tiers
// ---------------------------------------------------------------------------

/**
 * Split `n` entries into `tierCount` tier sizes, extras going to the LOWER
 * tiers (the rulebook's "22 drivers → 5/5/6/6"). Keeping the crowding at the
 * bottom means Tier A stays the genuinely-scarce pick.
 *
 * @param {number} n entries on the grid this round
 * @param {number} [tierCount=4]
 * @returns {number[]} sizes, tier A first
 */
export function tierSizes(n, tierCount = 4) {
  const total = Math.max(0, Math.floor(n));
  const base = Math.floor(total / tierCount);
  const extra = total % tierCount;
  const sizes = [];
  for (let i = 0; i < tierCount; i++) {
    // The last `extra` tiers each take one more.
    sizes.push(base + (i >= tierCount - extra ? 1 : 0));
  }
  return sizes;
}

// Cumulative start index of each tier, e.g. [5,5,6,6] → [0,5,10,16].
function tierStarts(sizes) {
  const starts = [];
  let acc = 0;
  for (const size of sizes) {
    starts.push(acc);
    acc += size;
  }
  return starts;
}

// Which tier index a 0-based ranking position falls in.
function tierAt(sizes, index) {
  let acc = 0;
  for (let t = 0; t < sizes.length; t++) {
    acc += sizes[t];
    if (index < acc) return t;
  }
  return sizes.length - 1;
}

// ---------------------------------------------------------------------------
// entries + context
// ---------------------------------------------------------------------------

/**
 * The drivers eligible for fantasy purposes in one round: everybody who
 * appears in that round's qualifying or race classification. Bundle
 * `drivers[]` entries with an empty `team` are practice-only call-ups and are
 * never entries, so deriving the list from the session data (rather than the
 * season roster) keeps them out for free - and keeps a qualifier who then
 * failed to start (2025 Spain, Stroll) in, since they still scored.
 *
 * @param {object} bundle season bundle (`public/data/<year>.json`)
 * @param {number|string} round
 * @returns {{code: string, teamId: string|null}[]} sorted by code
 */
export function entryList(bundle, round) {
  const result = resultFor(bundle, round);
  if (!result) return [];
  const seasonTeam = {};
  for (const d of (bundle && bundle.drivers) || []) {
    if (d && d.id && d.team) seasonTeam[d.id] = d.team;
  }
  const codes = new Set([
    ...Object.keys(result.detail || {}),
    ...Object.keys(result.quali || {}),
  ]);
  const out = [];
  for (const code of codes) {
    const det = (result.detail || {})[code];
    // Per-round team from the result detail when the bundle carries it (it
    // survives mid-season driver swaps); season roster otherwise.
    const teamId = (det && det.team) || seasonTeam[code] || null;
    out.push({ code, teamId });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Everything `scoreRound` needs that isn't in the round itself: each driver's
 * season-to-date average finish (the Form Beat baseline), the round's team
 * map, and its entry list.
 *
 * The baseline pool is this season's prior rounds; while a driver has fewer
 * than three starts it is topped up with the previous season's final rounds,
 * so round 1 isn't a blank slate for everyone.
 *
 * @param {object} bundle season bundle
 * @param {number|string} round round being scored
 * @param {object|null} [prevBundle] previous season's bundle, OR a seed from
 *   {@link seedHistory} (detected by its `finishes` field) - pass the seed in
 *   a replay loop so the previous season isn't rescored once per round
 * @returns {{baselines: Record<string, number|null>, teamOf: Record<string, string|null>, entries: {code: string, teamId: string|null}[]}}
 */
export function buildContext(bundle, round, prevBundle) {
  const entries = entryList(bundle, round);
  const teamOf = {};
  for (const e of entries) teamOf[e.code] = e.teamId;

  // Previous-season tail finishes, per driver.
  const seed = prevBundle && prevBundle.finishes
    ? prevBundle
    : (prevBundle ? seedHistory(prevBundle) : { finishes: {} });
  const prevFinishes = seed.finishes || {};

  // This season's finishes before `round`.
  const target = Number(round);
  const thisFinishes = {};
  for (const r of roundsOf(bundle)) {
    if (r >= target) break;
    const res = bundle.results[String(r)];
    for (const code of res.order || []) {
      const slot = finishSlot(res, code);
      if (slot == null) continue;
      (thisFinishes[code] || (thisFinishes[code] = [])).push(slot);
    }
  }

  const baselines = {};
  for (const { code } of entries) {
    const own = thisFinishes[code] || [];
    const pool = own.length >= RULES.FORM_MIN_STARTS
      ? own
      : [...own, ...(prevFinishes[code] || [])];
    baselines[code] = mean(pool);
  }
  return { baselines, teamOf, entries };
}

// ---------------------------------------------------------------------------
// round scoring
// ---------------------------------------------------------------------------

/**
 * Score one round for every entry, component by component. All components are
 * zero or positive - nothing in the ruleset ever subtracts.
 *
 * @param {object} bundle season bundle
 * @param {number|string} round
 * @param {object} [ctx] context from {@link buildContext}; built on demand
 *   (without previous-season top-up) when omitted
 * @returns {{drivers: Record<string, object>, constructors: Record<string, number>, raceLaps: number}}
 */
export function scoreRound(bundle, round, ctx) {
  const result = resultFor(bundle, round);
  const context = ctx || buildContext(bundle, round, null);
  const { baselines, teamOf, entries } = context;
  const out = { drivers: {}, constructors: {}, raceLaps: 0 };
  if (!result) return out;

  const detail = result.detail || {};
  const quali = result.quali || {};
  const sprintDetail = (result.sprintResults && result.sprintResults.detail) || {};
  const order = result.order || [];
  // Race distance for the laps consolation is the longest distance anyone
  // covered - i.e. the winner's laps, including shortened races.
  const raceLaps = Math.max(1, ...entries.map(e => (detail[e.code] && detail[e.code].laps) || 0));
  out.raceLaps = raceLaps;
  // Grid slot for a pit-lane start (grid 0) or a missing grid: back of the field.
  const backOfField = order.length || entries.length || 1;

  // Teammates: the other entry sharing a teamId this round. Exactly one, or
  // no head-to-head points are on offer.
  const byTeam = {};
  for (const { code, teamId } of entries) {
    if (!teamId) continue;
    (byTeam[teamId] || (byTeam[teamId] = [])).push(code);
  }

  for (const { code, teamId } of entries) {
    const det = detail[code] || null;
    const finish = numPos(det && det.position);
    const classified = finish != null;
    const qPos = numPos(quali[code] && quali[code].position);

    // 6.1 race classification
    const race = classified ? fromTable(RULES.RACE_PTS, finish, RULES.RACE_TAIL) : 0;
    // 6.2 qualifying classification (before grid penalties), top 10 only
    const qualiPts = fromTable(RULES.QUALI_PTS, qPos, 0);
    // 6.3 places gained, classified only, losses cost nothing
    const grid = (det && det.grid) || backOfField;
    const gained = classified
      ? Math.min(Math.max(grid - finish, 0) * RULES.GAINED_PER_PLACE, RULES.GAINED_CAP)
      : 0;
    // 6.4 laps consolation, paid ONLY to the unclassified
    const laps = classified
      ? 0
      : Math.min(Math.floor((((det && det.laps) || 0) / raceLaps) * 10), RULES.LAPS_CAP);
    // 6.5 form beat vs the season-to-date average finish, classified only
    const baseline = baselines ? baselines[code] : null;
    const form = classified && baseline != null
      ? formBonus(Math.round(baseline) - finish)
      : 0;
    // 6.6 teammate head-to-head
    let teammate = 0;
    const mates = (byTeam[teamId] || []).filter(c => c !== code);
    if (mates.length === 1) {
      const mate = mates[0];
      const mateFinish = numPos(detail[mate] && detail[mate].position);
      const mateQ = numPos(quali[mate] && quali[mate].position);
      // Race leg needs BOTH cars classified; quali leg needs both to have a time.
      if (classified && mateFinish != null && finish < mateFinish) teammate += RULES.TEAMMATE_RACE;
      if (qPos != null && mateQ != null && qPos < mateQ) teammate += RULES.TEAMMATE_QUALI;
    }
    // 6.7 fastest lap, any finishing position
    const fastestLap = code === result.fastest ? RULES.FASTEST_LAP : 0;
    // 6.8 sprint - table only, classified only
    const sDet = sprintDetail[code];
    const sPos = numPos(sDet && sDet.position);
    const sprint = sDet ? fromTable(RULES.SPRINT_PTS, sPos, RULES.SPRINT_TAIL) : 0;

    const total = race + qualiPts + gained + laps + form + teammate + fastestLap + sprint;
    out.drivers[code] = { race, quali: qualiPts, gained, laps, form, teammate, fastestLap, sprint, total, classified };

    // §7 constructor: race + qualifying points of its cars, nothing else.
    if (teamId) out.constructors[teamId] = (out.constructors[teamId] || 0) + race + qualiPts;
  }
  return out;
}

// Form ladder lookup: places better than the rounded season average → bonus.
function formBonus(delta) {
  if (!Number.isFinite(delta) || delta < 2) return 0;
  const ladder = RULES.FORM_LADDER;
  return delta >= 6 ? ladder[6] : ladder[delta];
}

// ---------------------------------------------------------------------------
// history seeding
// ---------------------------------------------------------------------------

/**
 * Rescore the final `n` rounds of the previous season under these rules, so
 * round 1 of a new season has real tier history and real Form Beat baselines
 * instead of a cold start.
 *
 * The whole previous season is walked (cheap - two dozen rounds) so the tail
 * rounds get correct season-to-date baselines of their own; only the tail is
 * returned.
 *
 * @param {object|null} prevBundle previous season's bundle
 * @param {number} [n=6] rounds of tail to keep
 * @returns {{history: Record<string, number[]>, finishes: Record<string, number[]>}}
 */
export function seedHistory(prevBundle, n = RULES.TIER_WINDOW) {
  const history = {};
  const finishes = {};
  if (!prevBundle) return { history, finishes };
  const rounds = roundsOf(prevBundle);
  const tail = new Set(rounds.slice(-n));
  for (const r of rounds) {
    // Baselines come from within the previous season itself - no recursion
    // into the season before it.
    const scores = scoreRound(prevBundle, r, buildContext(prevBundle, r, null));
    if (!tail.has(r)) continue;
    const res = prevBundle.results[String(r)];
    for (const [code, s] of Object.entries(scores.drivers)) {
      (history[code] || (history[code] = [])).push(s.total);
      const slot = finishSlot(res, code);
      if (slot != null) (finishes[code] || (finishes[code] = [])).push(slot);
    }
  }
  return { history, finishes };
}

// ---------------------------------------------------------------------------
// tier computation
// ---------------------------------------------------------------------------

/**
 * Cut the round's entries into form tiers A–D by their average fantasy points
 * over the rolling window, with the rulebook's stability rule applied.
 *
 * Drivers with no history of their own (rookies, mid-season call-ups) inherit
 * their team's expectation - the mean of their teammates' averages - so a
 * rookie in a front-running car starts high.
 *
 * The stability rule pulls a driver who would move tier, but sits within
 * `hysteresis` ranking places of the boundary they crossed, back toward their
 * previous tier; the field is then re-cut at exact {@link tierSizes}, so the
 * tiers are always the right size even when several drivers are held.
 *
 * @param {object} args
 * @param {{code: string, teamId: string|null}[]} args.entries this round's entries
 * @param {Record<string, number[]>} args.history code → recent round totals, oldest first
 * @param {Record<string, string>|null} [args.prevTiers] code → previous tier letter
 * @param {number} [args.hysteresis=2]
 * @param {number} [args.window=6]
 * @param {number} [args.tierCount=4]
 * @returns {{code: string, tier: string, rank: number, avgPts: number}[]} ranked best first
 */
export function computeTiers({ entries, history = {}, prevTiers = null, hysteresis = RULES.TIER_HYSTERESIS, window = RULES.TIER_WINDOW, tierCount = 4 }) {
  const list = entries || [];
  if (!list.length) return [];

  // Own expectation: mean of the last `window` round totals.
  const own = {};
  for (const { code } of list) {
    const w = (history[code] || []).slice(-window);
    own[code] = w.length ? mean(w) : null;
  }
  // No history → the team's current level (mean over teammates that have one).
  const expectation = {};
  for (const { code, teamId } of list) {
    if (own[code] != null) { expectation[code] = own[code]; continue; }
    const mates = list.filter(e => e.teamId && e.teamId === teamId && e.code !== code);
    const mateExp = mates.map(m => own[m.code]).filter(v => v != null);
    expectation[code] = mateExp.length ? mean(mateExp) : 0;
  }

  const sizes = tierSizes(list.length, tierCount);
  const starts = tierStarts(sizes);
  // Raw ranking: best average first, code as a deterministic tiebreak.
  const ranked = list
    .map(e => e.code)
    .sort((a, b) => expectation[b] - expectation[a] || a.localeCompare(b));

  let final = ranked;
  if (hysteresis > 0 && prevTiers) {
    const rawIndex = Object.fromEntries(ranked.map((c, i) => [c, i]));
    final = ranked
      .map(code => {
        let key = rawIndex[code];
        const prev = TIER_LETTERS.indexOf(prevTiers[code]);
        if (prev >= 0) {
          const next = tierAt(sizes, key);
          if (next !== prev) {
            // The boundary just crossed: the far edge of the old tier.
            const boundary = next > prev
              ? starts[prev] + sizes[prev] - 1
              : starts[prev];
            if (Math.abs(key - boundary) < hysteresis) key += (prev - next) * hysteresis;
          }
        }
        return [code, key];
      })
      .sort((a, b) => a[1] - b[1] || rawIndex[a[0]] - rawIndex[b[0]])
      .map(pair => pair[0]);
  }

  return final.map((code, i) => ({
    code,
    tier: TIER_LETTERS[tierAt(sizes, i)],
    rank: i + 1,
    avgPts: expectation[code],
  }));
}

// ---------------------------------------------------------------------------
// picks
// ---------------------------------------------------------------------------

/**
 * Apply the Boost (×1.5) and Emergency (×0.5) multipliers. They stack before a
 * single final round-up, so a boosted emergency pick is `ceil(pts × 1.5 × 0.5)`
 * and never two separate roundings.
 *
 * @param {number} points a driver's raw weekend total
 * @param {{boost?: boolean, emergency?: boolean}} [flags]
 * @returns {number} integer
 */
export function applyMultipliers(points, { boost = false, emergency = false } = {}) {
  const base = Number.isFinite(points) ? points : 0;
  let factor = 1;
  if (boost) factor *= RULES.BOOST_MULTIPLIER;
  if (emergency) factor *= RULES.EMERGENCY_MULTIPLIER;
  return Math.ceil(base * factor);
}

// Normalise `tiers` (array from computeTiers, or a plain code → letter map).
function tierMap(tiers) {
  if (!tiers) return {};
  if (Array.isArray(tiers)) return Object.fromEntries(tiers.map(t => [t.code, t.tier]));
  return tiers;
}

/**
 * Score one user's lineup for a round.
 *
 * @param {{A?: string, B?: string, C?: string, D?: string, constructor?: string, boost?: string, emergency?: Record<string, boolean>}} pick
 * @param {object} roundScores output of {@link scoreRound}
 * @param {*} [tiers] unused for the maths (slots already carry their tier) but
 *   accepted so callers can pass the round's published tiers through
 * @returns {{breakdown: object, total: number}}
 */
export function scorePicks(pick, roundScores, tiers) { // eslint-disable-line no-unused-vars
  const drivers = (roundScores && roundScores.drivers) || {};
  const constructors = (roundScores && roundScores.constructors) || {};
  const boostSlot = pick && (pick.boost === 'C' || pick.boost === 'D') ? pick.boost : 'D';
  const emergency = (pick && pick.emergency) || {};
  const breakdown = {};
  let total = 0;

  for (const slot of TIER_LETTERS) {
    const code = pick ? pick[slot] : null;
    // An unfilled slot (carry-forward that couldn't legally roll over) is 0.
    const base = code && drivers[code] ? drivers[code].total : 0;
    const final = code
      ? applyMultipliers(base, { boost: slot === boostSlot, emergency: emergency[slot] === true })
      : 0;
    breakdown[slot] = {
      code: code || null,
      base,
      final,
      boost: !!code && slot === boostSlot,
      emergency: !!code && emergency[slot] === true,
    };
    total += final;
  }

  const teamId = (pick && pick.constructor) || null;
  const cTotal = teamId ? (constructors[teamId] || 0) : 0;
  breakdown.constructor = { teamId, total: cTotal };
  total += cTotal;

  return { breakdown, total };
}

/**
 * Validate a lineup against the tier requirement, the season usage caps, the
 * Emergency-pick condition and the lock deadline. Mirrors the PocketBase hook
 * so the UI can show the same specific errors before submitting.
 *
 * @param {object} pick see {@link scorePicks}
 * @param {object} args
 * @param {*} args.tiers this round's tiers (array from {@link computeTiers} or a code → letter map)
 * @param {{drivers?: Record<string, number>, constructors?: Record<string, number>}} [args.usage] starts already spent
 * @param {{driver?: number, constructor?: number, capDriver?: number, capConstructor?: number}} [args.caps]
 * @param {Date|string|number} [args.lockAt]
 * @param {Date|string|number} [args.now]
 * @returns {{ok: boolean, errors: {slot: string, code: string|null, message: string}[]}}
 */
export function validatePicks(pick, { tiers, usage = {}, caps = {}, lockAt, now } = {}) {
  const errors = [];
  const add = (slot, code, message) => errors.push({ slot, code: code || null, message });

  const byCode = tierMap(tiers);
  const capDriver = caps.driver ?? caps.capDriver ?? RULES.CAP_DRIVER;
  const capConstructor = caps.constructor ?? caps.capConstructor ?? RULES.CAP_CONSTRUCTOR;
  const driverUsage = usage.drivers || {};
  const constructorUsage = usage.constructors || {};
  const emergency = (pick && pick.emergency) || {};

  // 1. deadline
  if (lockAt != null) {
    const lock = new Date(lockAt).getTime();
    const at = new Date(now ?? Date.now()).getTime();
    if (Number.isFinite(lock) && Number.isFinite(at) && at >= lock) {
      add('round', null, 'Picks are locked for this round.');
    }
  }

  // 2. one driver per tier, from that tier
  for (const slot of TIER_LETTERS) {
    const code = pick ? pick[slot] : null;
    if (!code) { add(slot, null, `No driver selected for Tier ${slot}.`); continue; }
    const tier = byCode[code];
    if (!tier) { add(slot, code, `${code} is not an entry for this round.`); continue; }
    if (tier !== slot) { add(slot, code, `${code} is in Tier ${tier}, not Tier ${slot}.`); continue; }

    // 3. usage cap, and the Emergency escape hatch
    const used = driverUsage[code] || 0;
    const atCap = used >= capDriver;
    const flagged = emergency[slot] === true;
    if (atCap) {
      // Only legal when EVERY driver in the tier is likewise spent.
      const tierCodes = Object.keys(byCode).filter(c => byCode[c] === slot);
      const tierExhausted = tierCodes.every(c => (driverUsage[c] || 0) >= capDriver);
      if (!flagged) {
        add(slot, code, `${code} is at your season cap (${capDriver} starts). Mark the slot as an emergency pick if every Tier ${slot} driver is spent.`);
      } else if (!tierExhausted) {
        add(slot, code, `Emergency picks are only allowed when every Tier ${slot} driver is at your cap.`);
      }
    } else if (flagged) {
      add(slot, code, `${code} is not at your cap, so Tier ${slot} cannot be an emergency pick.`);
    }
  }

  // 4. constructor - capped too, but no emergency (a legal team always exists)
  const teamId = pick ? pick.constructor : null;
  if (!teamId) {
    add('constructor', null, 'No constructor selected.');
  } else if ((constructorUsage[teamId] || 0) >= capConstructor) {
    add('constructor', teamId, `${teamId} is at your season cap (${capConstructor} starts).`);
  }

  // 5. boost must sit on Tier C or D
  const boost = pick ? pick.boost : undefined;
  if (boost != null && boost !== 'C' && boost !== 'D') {
    add('boost', String(boost), 'The Boost must be on your Tier C or Tier D driver.');
  }

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// replay
// ---------------------------------------------------------------------------

/**
 * Walk a whole season the way the live scorer does: seed history from the
 * previous season's tail, then for each round publish the tiers (computed
 * from everything BEFORE that round) and score it.
 *
 * Used by the tests as a regression harness and by the scorer to backfill.
 *
 * @param {object} bundle season bundle
 * @param {object|null} [prevBundle] previous season's bundle
 * @param {{window?: number, hysteresis?: number, tierCount?: number, rounds?: number[]}} [opts]
 * @returns {{round: number, scores: object, tiers: object[], context: object}[]}
 */
export function replaySeason(bundle, prevBundle, opts = {}) {
  const window = opts.window ?? RULES.TIER_WINDOW;
  const hysteresis = opts.hysteresis ?? RULES.TIER_HYSTERESIS;
  const tierCount = opts.tierCount ?? 4;
  const seed = prevBundle ? seedHistory(prevBundle, window) : { history: {}, finishes: {} };
  // Rolling window of fantasy totals, seeded from the previous season.
  const history = {};
  for (const [code, totals] of Object.entries(seed.history)) history[code] = totals.slice();

  const rounds = opts.rounds || roundsOf(bundle);
  const out = [];
  let prevTiers = null;
  for (const round of rounds) {
    const context = buildContext(bundle, round, seed);
    const tiers = computeTiers({ entries: context.entries, history, prevTiers, hysteresis, window, tierCount });
    const scores = scoreRound(bundle, round, context);
    out.push({ round, scores, tiers, context });
    // Roll forward for the next round.
    for (const [code, s] of Object.entries(scores.drivers)) {
      (history[code] || (history[code] = [])).push(s.total);
    }
    prevTiers = Object.fromEntries(tiers.map(t => [t.code, t.tier]));
  }
  return out;
}
