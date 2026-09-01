// Rulebook §11: the season championship, the six-round Splits, and the stored
// tie-break fields.
//
//   "Season or Split ties are broken in order by: most Split wins (season
//    only) → highest single-weekend score → most weekends as the group's top
//    scorer → shared position."
//
// The scorer stores the tie-break *facts* (`splitWins`, `bestWeekend`,
// `weeksTop`); ordering them is the leaderboard's job, so a league view can
// apply the same comparator to a subset of players without a second write.
// Pure functions, no PocketBase.

/**
 * Which Split a round belongs to. Rulebook §11: "every 6 rounds forms a Split".
 *
 * @param {number} round 1-based
 * @param {number} splitLength
 * @returns {number} 1-based split index
 */
export function splitOf(round, splitLength) {
  const len = Math.max(1, Math.floor(splitLength) || 1);
  return Math.floor((Number(round) - 1) / len) + 1;
}

/** `split-3` — the `scope` value on a `fantasy_standings` row. */
export function splitScope(index) {
  return `split-${index}`;
}

/**
 * Build every standings row for a season from the per-round, per-user totals.
 *
 * @param {object} args
 * @param {{user: string, round: number, total: number}[]} args.results one entry per scored pick
 * @param {number[]} args.scoredRounds every round that has been scored, ascending
 * @param {number[]} [args.completeRounds] rounds whose results are settled (final or
 *   provisional); a Split only counts as won once all of its rounds are here
 * @param {number} args.splitLength
 * @returns {{scope: string, user: string, points: number, bestWeekend: number, weeksTop: number, splitWins: number}[]}
 */
export function buildStandings({ results, scoredRounds, completeRounds, splitLength }) {
  const scored = new Set(scoredRounds);
  const complete = new Set(completeRounds || scoredRounds);

  // Per round: who topped it (ties all count — §11 ends in "shared position").
  const topByRound = new Map();
  for (const round of scored) {
    const inRound = results.filter(r => r.round === round);
    if (!inRound.length) continue;
    const best = Math.max(...inRound.map(r => r.total));
    topByRound.set(round, new Set(inRound.filter(r => r.total === best).map(r => r.user)));
  }

  // Which Splits are finished, so a "Split win" is a settled fact.
  const roundsPerSplit = new Map();
  for (const round of scoredRounds) {
    const s = splitOf(round, splitLength);
    if (!roundsPerSplit.has(s)) roundsPerSplit.set(s, []);
    roundsPerSplit.get(s).push(round);
  }

  /** @type {Map<string, Map<string, {points: number, bestWeekend: number, weeksTop: number}>>} */
  const byScope = new Map();
  const bump = (scope, user, total, topped) => {
    if (!byScope.has(scope)) byScope.set(scope, new Map());
    const rows = byScope.get(scope);
    const row = rows.get(user) || { points: 0, bestWeekend: 0, weeksTop: 0 };
    row.points += total;
    row.bestWeekend = Math.max(row.bestWeekend, total);
    if (topped) row.weeksTop += 1;
    rows.set(user, row);
  };

  for (const r of results) {
    if (!scored.has(r.round)) continue;
    const topped = (topByRound.get(r.round) || new Set()).has(r.user);
    bump('season', r.user, r.total, topped);
    bump(splitScope(splitOf(r.round, splitLength)), r.user, r.total, topped);
  }

  // A Split is "won" once every round in it is settled and you lead it.
  // Ties share the win, matching the shared-position ending of §11.
  const splitWins = new Map();
  for (const [index, rounds] of roundsPerSplit) {
    const expected = splitLength;
    const settled = rounds.every(round => complete.has(round));
    if (!settled || rounds.length < expected) continue;
    const rows = byScope.get(splitScope(index));
    if (!rows || !rows.size) continue;
    const best = Math.max(...[...rows.values()].map(r => r.points));
    for (const [user, row] of rows) {
      if (row.points === best) splitWins.set(user, (splitWins.get(user) || 0) + 1);
    }
  }

  const out = [];
  for (const [scope, rows] of byScope) {
    for (const [user, row] of rows) {
      out.push({
        scope,
        user,
        points: row.points,
        bestWeekend: row.bestWeekend,
        weeksTop: row.weeksTop,
        // §11: Split wins break season ties only, so they are 0 inside a Split.
        splitWins: scope === 'season' ? (splitWins.get(user) || 0) : 0,
      });
    }
  }
  return out.sort((a, b) => a.scope.localeCompare(b.scope) || b.points - a.points || a.user.localeCompare(b.user));
}

/**
 * The §11 comparator, exported so leaderboards (and the tests) order rows the
 * same way the rulebook does. Best first.
 *
 * @param {object} a standings row
 * @param {object} b standings row
 * @returns {number}
 */
export function compareStandings(a, b) {
  return (b.points - a.points)
    || ((b.splitWins || 0) - (a.splitWins || 0))
    || ((b.bestWeekend || 0) - (a.bestWeekend || 0))
    || ((b.weeksTop || 0) - (a.weeksTop || 0))
    || String(a.user).localeCompare(String(b.user));
}
