#!/usr/bin/env node
/**
 * The f1gures fantasy scorer.
 *
 * Reads the season bundle the site already publishes
 * (`https://f1gures.app/data/<year>.json`), runs the scoring engine
 * (`src/lib/fantasyScoring.mjs` — never a second copy of the maths), and
 * writes the result into PocketBase with a superuser token. It is the only
 * writer of tiers, scores, standings, carry-forward picks and refunds.
 *
 * Runs on a schedule (Coolify scheduled task; see README.md). Every step is
 * idempotent: a second run over unchanged data issues zero writes.
 *
 * Usage:
 *   node run.mjs
 *   node run.mjs --dry-run
 *   node run.mjs --bundle ../../public/data/2026.json --now 2026-08-23T16:00:00Z
 *
 * Env:
 *   PB_URL                 PocketBase base URL            (required)
 *   PB_SUPERUSER_TOKEN     superuser token                (or the two below)
 *   PB_SUPERUSER_EMAIL     superuser identity
 *   PB_SUPERUSER_PASSWORD  superuser password
 *   SEASON_YEAR            default: the year of "now"
 *   DATA_BASE              default: https://f1gures.app/data
 *
 * Exit codes: 0 success · 1 failure (bad config, network, PocketBase error).
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { RULES, scorePicks, validatePicks } from '../../src/lib/fantasyScoring.mjs';
import { PbClient, pbDate, quote, indexBy } from './lib/pb.js';
import { advanceStatus, planEntries, planRounds, planSeason, scoredRoundsOf } from './lib/sync.js';
import { countUsage, dnsCodes, isVoidRound, pickToLineup, refundsFor, resultFingerprint, SLOTS } from './lib/score.js';
import { latestPickBefore, planCarry } from './lib/carry.js';
import { buildStandings } from './lib/standings.js';
import { nextRoundNumber, replay, tiersForNextRound } from './lib/tiers.js';

const DEFAULT_DATA_BASE = 'https://f1gures.app/data';

// ---------------------------------------------------------------------------
// argument + bundle plumbing
// ---------------------------------------------------------------------------

/**
 * @param {string[]} argv
 * @returns {{dryRun: boolean, bundle: string|null, now: string|null, year: number|null, verbose: boolean}}
 */
export function parseArgs(argv) {
  const out = { dryRun: false, bundle: null, now: null, year: null, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--verbose' || arg === '-v') out.verbose = true;
    else if (arg === '--bundle') out.bundle = argv[++i];
    else if (arg === '--now') out.now = argv[++i];
    else if (arg === '--year') out.year = Number(argv[++i]);
    else if (arg.startsWith('--bundle=')) out.bundle = arg.slice(9);
    else if (arg.startsWith('--now=')) out.now = arg.slice(6);
    else if (arg.startsWith('--year=')) out.year = Number(arg.slice(7));
  }
  return out;
}

/**
 * Load a season bundle, from disk when `--bundle` points at one (tests and
 * backfills) or over HTTP from the live site (the scheduled run).
 *
 * `--bundle` also implies the previous season is a sibling file, so a backfill
 * gets the same §3 seeding as production without a network round trip.
 *
 * @returns {Promise<object|null>} null when the season simply doesn't exist yet
 */
export async function loadBundle({ year, bundlePath, dataBase }) {
  if (bundlePath) {
    const dir = dirname(resolve(bundlePath));
    const path = resolve(bundlePath).endsWith(`${year}.json`) ? resolve(bundlePath) : resolve(dir, `${year}.json`);
    try {
      return JSON.parse(await readFile(path, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }
  const res = await fetch(`${dataBase}/${year}.json`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${dataBase}/${year}.json → ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// the pipeline
// ---------------------------------------------------------------------------

/**
 * @param {object} args
 * @param {PbClient} args.pb authenticated client (or a fake, in tests)
 * @param {object} args.bundle season bundle
 * @param {object|null} [args.prevBundle] previous season, for §3 seeding
 * @param {number} args.year
 * @param {Date|string|number} [args.now]
 * @param {(msg: string) => void} [args.log]
 * @returns {Promise<object>} a summary of what the run did
 */
export async function runScorer({ pb, bundle, prevBundle = null, year, now = Date.now(), log = console.log }) {
  const at = new Date(now).getTime();
  const nowIso = new Date(at).toISOString();
  const summary = {
    year, now: nowIso,
    rounds: 0, entries: 0, tiersPublished: 0, roundsScored: [], carriedForward: 0,
    refunds: 0, pickScores: 0, standings: 0, violations: [], finalised: [],
  };

  // ---------------------------------------------------------------- season
  const seasonRow = await pb.findOne('fantasy_seasons', `year=${year}`);
  const defaults = planSeason(bundle, year);
  // Caps, split length and tier count are operator-tunable in the admin UI, so
  // they are written on creation and never overwritten afterwards.
  const seasonFields = seasonRow
    ? { status: seasonStatus(bundle), rulesVersion: RULES.version, seedYear: year - 1 }
    : { ...defaults, status: seasonStatus(bundle) };
  const { record: season } = await pb.upsert('fantasy_seasons', seasonRow, seasonFields);
  const caps = {
    capDriver: numberOr(season.capDriver, defaults.capDriver),
    capConstructor: numberOr(season.capConstructor, defaults.capConstructor),
  };
  const splitLength = numberOr(season.splitLength, defaults.splitLength);
  const tierCount = numberOr(season.tierCount, defaults.tierCount);
  const seasonFilter = `season=${quote(season.id)}`;

  // ---------------------------------------------------------------- rounds
  const plans = planRounds(bundle, { now: at });
  summary.rounds = plans.length;
  const roundRows = indexBy(await pb.listAll('fantasy_rounds', { filter: seasonFilter }), r => String(r.round));
  /** @type {Map<number, object>} round number → PocketBase record */
  const rounds = new Map();
  for (const plan of plans) {
    const existing = roundRows.get(String(plan.round)) || null;
    // Statuses only advance, and only as far as "locked" here: the scoring
    // pass below owns the promotion to provisional/final, so a round is never
    // advertised as scored before its scores exist.
    const status = advanceStatus(existing && existing.status, plan.locked ? 'locked' : 'upcoming');
    const { record } = await pb.upsert('fantasy_rounds', existing, {
      season: season.id,
      round: plan.round,
      name: plan.name,
      isSprint: plan.isSprint,
      lockAt: pbDate(plan.lockAt),
      raceAt: pbDate(plan.raceAt),
      finalAt: pbDate(plan.finalAt),
      status,
    });
    rounds.set(plan.round, record);
  }
  const roundNumberOf = Object.fromEntries([...rounds].map(([n, r]) => [r.id, n]));

  // --------------------------------------------------------------- entries
  const scoredRounds = scoredRoundsOf(bundle);
  const entryPlans = planEntries(bundle, scoredRounds);
  summary.entries = entryPlans.length;
  const entryRows = indexBy(await pb.listAll('fantasy_entries', { filter: seasonFilter }), r => r.code);
  /** @type {Map<string, object>} driver code → entry record */
  const entries = new Map();
  for (const plan of entryPlans) {
    const { record } = await pb.upsert('fantasy_entries', entryRows.get(plan.code) || null, {
      season: season.id, ...plan,
    });
    entries.set(plan.code, record);
  }
  const entryIdOf = Object.fromEntries([...entries].map(([code, r]) => [code, r.id]));
  const codeOfEntry = Object.fromEntries([...entries].map(([code, r]) => [r.id, code]));

  // ------------------------------------------------------ replay + tiering
  const replayed = replay(bundle, prevBundle, { tierCount });
  /** @type {Map<number, {code: string, tier: string, rank: number, avgPts: number}[]>} */
  const tierPlans = new Map(replayed.map(step => [step.round, step.tiers]));
  const lastScored = scoredRounds.length ? scoredRounds[scoredRounds.length - 1] : 0;
  const upcoming = nextRoundNumber(bundle, lastScored);
  if (upcoming != null) {
    const next = tiersForNextRound({ replayed, prevBundle, opts: { tierCount } });
    if (next.length) tierPlans.set(upcoming, next);
  }

  // Load the mutable collections once; everything below works in memory and
  // writes through `pb.upsert`, which no-ops when nothing changed.
  const roundIds = [...rounds.values()].map(r => r.id);
  const inRounds = roundIds.length ? `(${roundIds.map(id => `round=${quote(id)}`).join(' || ')})` : 'round=""';
  const tierRows = await pb.listAll('fantasy_tiers', { filter: inRounds });
  const tierIndex = indexBy(tierRows, r => `${r.round}|${r.entry}`);
  const pickRows = await pb.listAll('fantasy_picks', { filter: inRounds });
  const scoreIndex = indexBy(await pb.listAll('fantasy_scores', { filter: inRounds }), r => `${r.round}|${r.entry}`);
  const cScoreIndex = indexBy(await pb.listAll('fantasy_constructor_scores', { filter: inRounds }), r => `${r.round}|${r.teamId}`);
  const pickScoreIndex = indexBy(await pb.listAll('fantasy_pick_scores', { filter: inRounds }), r => `${r.round}|${r.user}`);

  /** @type {Map<string, object[]>} user id → their pick records, this season */
  const picksByUser = new Map();
  for (const pick of pickRows) {
    if (!picksByUser.has(pick.user)) picksByUser.set(pick.user, []);
    picksByUser.get(pick.user).push(pick);
  }
  const pickIndex = indexBy(pickRows, r => `${r.round}|${r.user}`);
  /** @type {Map<string, {user: string, round: number, total: number}>} */
  const pickTotals = new Map();
  for (const row of pickScoreIndex.values()) {
    const n = roundNumberOf[row.round];
    if (Number.isFinite(n)) pickTotals.set(`${n}|${row.user}`, { user: row.user, round: n, total: row.total || 0 });
  }

  // ------------------------------------------------ one pass, round by round
  for (const plan of plans) {
    const roundRec = rounds.get(plan.round);
    const tiers = tierPlans.get(plan.round);

    // 1. publish tiers (§3: public, before picks open)
    /** @type {Record<string, string>} entry id → tier letter */
    const tierOfEntry = {};
    if (tiers && tiers.length) {
      const wanted = new Set();
      for (const t of tiers) {
        const entryId = entryIdOf[t.code];
        if (!entryId) continue;
        wanted.add(entryId);
        tierOfEntry[entryId] = t.tier;
        const { action } = await pb.upsert('fantasy_tiers', tierIndex.get(`${roundRec.id}|${entryId}`) || null, {
          round: roundRec.id, entry: entryId, tier: t.tier, rank: t.rank,
          avgPts: Math.round((t.avgPts || 0) * 100) / 100,
        });
        if (action !== 'noop') summary.tiersPublished++;
      }
      // A driver who left the grid must not keep a published tier row.
      for (const row of tierRows) {
        if (row.round === roundRec.id && !wanted.has(row.entry)) await pb.delete('fantasy_tiers', row.id);
      }
    } else {
      for (const row of tierRows) {
        if (row.round === roundRec.id) tierOfEntry[row.entry] = row.tier;
      }
    }

    if (!plan.locked) continue; // picks are still open — nothing else to do

    // 2. carry-forward (§5) for players who missed this lock
    for (const [userId, userPicks] of picksByUser) {
      if (pickIndex.has(`${roundRec.id}|${userId}`)) continue;
      const source = latestPickBefore(userPicks, roundNumberOf, plan.round);
      const usage = countUsage(
        userPicks,
        p => (roundNumberOf[p.round] ?? Infinity) < plan.round,
        codeOfEntry
      );
      const carried = planCarry({ source, tierOfEntry, codeOfEntry, usage, caps });
      if (!carried) continue;
      const record = await pb.create('fantasy_picks', { user: userId, round: roundRec.id, ...carried });
      userPicks.push(record);
      pickIndex.set(`${roundRec.id}|${userId}`, record);
      summary.carriedForward++;
      log(`carry-forward round ${plan.round} user ${userId} → ${SLOTS.map(s => codeOfEntry[record[`driver${s}`]] || '—').join('/')} + ${record.constructor || '—'}`);
    }

    if (!plan.hasResults) continue;

    // 3. score the round, unless it is settled and unchanged (§9)
    const result = bundle.results[String(plan.round)];
    const fingerprint = resultFingerprint(result);
    const stored = roundRec.scored && typeof roundRec.scored === 'object' ? roundRec.scored : null;
    const settled = roundRec.status === 'final';
    const unchanged = stored && stored.fingerprint === fingerprint && stored.rulesVersion === RULES.version;
    const roundScores = (replayed.find(s => s.round === plan.round) || {}).scores;
    if (!roundScores) continue;

    const wantStatus = advanceStatus(roundRec.status, plan.status);
    if (settled || unchanged) {
      // Still let a settled round's status catch up (provisional → final).
      if (wantStatus !== roundRec.status) {
        const { record } = await pb.upsert('fantasy_rounds', roundRec, { status: wantStatus });
        rounds.set(plan.round, record);
        if (wantStatus === 'final') summary.finalised.push(plan.round);
      }
      continue;
    }

    summary.roundsScored.push(plan.round);
    const voidRound = isVoidRound(result);
    const dns = dnsCodes(result, (replayed.find(s => s.round === plan.round) || {}).context?.entries || []);

    // 3a. per-entry and per-constructor scores
    for (const [code, s] of Object.entries(roundScores.drivers)) {
      const entryId = entryIdOf[code];
      if (!entryId) continue;
      const { race, quali, gained, laps, form, teammate, fastestLap, sprint, classified } = s;
      await pb.upsert('fantasy_scores', scoreIndex.get(`${roundRec.id}|${entryId}`) || null, {
        round: roundRec.id, entry: entryId, total: s.total,
        components: { race, quali, gained, laps, form, teammate, fastestLap, sprint, classified, dns: dns.has(code) },
      });
    }
    for (const [teamId, total] of Object.entries(roundScores.constructors)) {
      await pb.upsert('fantasy_constructor_scores', cScoreIndex.get(`${roundRec.id}|${teamId}`) || null, {
        round: roundRec.id, teamId, total,
      });
    }

    // 3b. per-user pick scores, refunds and a re-validation pass
    const tierMap = Object.fromEntries(
      Object.entries(tierOfEntry).map(([entryId, tier]) => [codeOfEntry[entryId], tier])
    );
    for (const [userId, userPicks] of picksByUser) {
      const pick = pickIndex.get(`${roundRec.id}|${userId}`);
      if (!pick) continue;

      // Refunds first (§4): they change the usage every later round sees.
      const refunds = refundsFor(pick, codeOfEntry, dns, voidRound);
      if (JSON.stringify(refunds) !== JSON.stringify(pick.refunded || [])) {
        const { record } = await pb.upsert('fantasy_picks', pick, { refunded: refunds });
        Object.assign(pick, record);
        if (refunds.length) {
          summary.refunds += refunds.length;
          log(`refund round ${plan.round} user ${userId} → ${refunds.join(', ')}`);
        }
      }

      const lineup = pickToLineup(pick, codeOfEntry);
      // Re-validate against the tiers and the usage as they stood at the lock.
      // Violations are logged, never enforced: a lineup that was legal when it
      // was submitted stays scored (§9 is about results, not re-litigation).
      const usage = countUsage(userPicks, p => (roundNumberOf[p.round] ?? Infinity) < plan.round, codeOfEntry);
      const check = validatePicks(lineup, { tiers: tierMap, usage, caps });
      if (!check.ok) {
        for (const e of check.errors) {
          const msg = `round ${plan.round} user ${userId} slot ${e.slot}: ${e.message}`;
          summary.violations.push(msg);
          log(`WARN validate ${msg}`);
        }
      }

      const scored = voidRound
        ? { breakdown: { A: null, B: null, C: null, D: null, constructor: { teamId: pick.constructor || null, total: 0 }, void: true }, total: 0 }
        : scorePicks(lineup, roundScores, tierMap);
      await pb.upsert('fantasy_pick_scores', pickScoreIndex.get(`${roundRec.id}|${userId}`) || null, {
        user: userId, round: roundRec.id, breakdown: scored.breakdown, total: scored.total,
      });
      pickTotals.set(`${plan.round}|${userId}`, { user: userId, round: plan.round, total: scored.total });
      summary.pickScores++;
    }

    // 3c. mark the round scored
    const { record } = await pb.upsert('fantasy_rounds', roundRec, {
      status: wantStatus,
      scored: { fingerprint, rulesVersion: RULES.version, scoredAt: nowIso, entries: Object.keys(roundScores.drivers).length },
    });
    rounds.set(plan.round, record);
    if (wantStatus === 'final') summary.finalised.push(plan.round);
  }

  // ------------------------------------------------------------- standings
  const completeRounds = plans.filter(p => p.hasResults).map(p => p.round);
  const rows = buildStandings({
    results: [...pickTotals.values()],
    scoredRounds: completeRounds,
    completeRounds: plans.filter(p => (rounds.get(p.round) || {}).status === 'final').map(p => p.round),
    splitLength,
  });
  const standingRows = indexBy(
    await pb.listAll('fantasy_standings', { filter: seasonFilter }),
    r => `${r.scope}|${r.user}`
  );
  const wanted = new Set();
  for (const row of rows) {
    wanted.add(`${row.scope}|${row.user}`);
    const { action } = await pb.upsert('fantasy_standings', standingRows.get(`${row.scope}|${row.user}`) || null, {
      season: season.id, scope: row.scope, user: row.user,
      points: row.points, bestWeekend: row.bestWeekend, weeksTop: row.weeksTop, splitWins: row.splitWins,
    });
    if (action !== 'noop') summary.standings++;
  }
  // A player whose only scored round was voided drops out of a scope entirely.
  for (const [key, row] of standingRows) {
    if (!wanted.has(key)) await pb.delete('fantasy_standings', row.id);
  }

  return summary;
}

/**
 * `active` while the calendar still has an unraced round or the last race is
 * inside its provisional window; `finished` once the season is done.
 */
function seasonStatus(bundle) {
  const calendar = (bundle && bundle.calendar) || [];
  if (!calendar.length) return 'upcoming';
  const results = (bundle && bundle.results) || {};
  return calendar.every(c => results[String(c.round)]) ? 'finished' : 'active';
}

function numberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = args.now ? new Date(args.now) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`--now is not a date: ${args.now}`);
  const year = args.year || Number(process.env.SEASON_YEAR) || now.getUTCFullYear();
  const dataBase = (process.env.DATA_BASE || DEFAULT_DATA_BASE).replace(/\/+$/, '');

  const url = process.env.PB_URL;
  if (!url) throw new Error('PB_URL is required');

  const pb = new PbClient({ url, token: process.env.PB_SUPERUSER_TOKEN || '', dryRun: args.dryRun });
  if (!pb.token) {
    const email = process.env.PB_SUPERUSER_EMAIL;
    const password = process.env.PB_SUPERUSER_PASSWORD;
    if (!email || !password) throw new Error('set PB_SUPERUSER_TOKEN, or PB_SUPERUSER_EMAIL + PB_SUPERUSER_PASSWORD');
    await pb.authWithPassword(email, password);
  }

  const bundle = await loadBundle({ year, bundlePath: args.bundle, dataBase });
  if (!bundle) throw new Error(`no season bundle for ${year} (${args.bundle || dataBase})`);
  const prevBundle = await loadBundle({ year: year - 1, bundlePath: args.bundle, dataBase }).catch(() => null);

  console.log(`[scorer] ${year} · now ${now.toISOString()} · ${args.dryRun ? 'DRY RUN' : 'live'} · ${args.bundle || dataBase}`);
  if (!prevBundle) console.log(`[scorer] no ${year - 1} bundle — round 1 tiers will have no previous-season seed`);

  const summary = await runScorer({ pb, bundle, prevBundle, year, now, log: m => console.log(`[scorer] ${m}`) });

  console.log(`[scorer] rounds ${summary.rounds} · entries ${summary.entries} · scored [${summary.roundsScored.join(', ') || '—'}]`
    + ` · tiers ${summary.tiersPublished} · carried ${summary.carriedForward} · refunds ${summary.refunds}`
    + ` · pick scores ${summary.pickScores} · standings ${summary.standings} · finalised [${summary.finalised.join(', ') || '—'}]`);
  console.log(`[scorer] writes: ${pb.stats.created} created, ${pb.stats.updated} updated, ${pb.stats.deleted} deleted, ${pb.stats.unchanged} unchanged (${pb.stats.requests} requests)`);
  if (summary.violations.length) console.log(`[scorer] ${summary.violations.length} pick validation warning(s) — see above`);
  if (args.dryRun && pb.planned.length) {
    for (const w of pb.planned) console.log(`[scorer] would ${w.op} ${w.collection}${w.id ? ` ${w.id}` : ''} ${JSON.stringify(w.data || {})}`);
  }
}

// Run only when executed directly — importing this file (the tests do) must
// not fire the CLI. `pathToFileURL` is what makes that work on Windows too.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error(`[scorer] FAILED: ${err.message}`);
    if (process.env.SCORER_DEBUG) console.error(err);
    process.exit(1);
  });
}
