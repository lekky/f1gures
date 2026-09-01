// Turning a season bundle (`public/data/<year>.json`) into the reference rows
// PocketBase holds: the season record, one round per calendar entry, and the
// entry list (drivers eligible for fantasy purposes).
//
// Everything here is pure — bundle in, plain objects out — so the whole shape
// of a run can be asserted in a unit test without a database.

import { RULES, entryList } from '../../../src/lib/fantasyScoring.mjs';

/** The calendar length the rulebook's caps (5 driver / 4 constructor) assume. */
export const REFERENCE_ROUNDS = 24;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Rulebook §9: results stay provisional for 7 days after the race. */
export const PROVISIONAL_DAYS = 7;

/**
 * A `{date, time}` session stamp from the bundle → an ISO instant.
 * Bundle times already carry the trailing `Z`; tolerate one that doesn't.
 *
 * @param {{date?: string, time?: string}|null} session
 * @returns {string|null}
 */
export function sessionInstant(session) {
  if (!session || !session.date) return null;
  const raw = session.time || '00:00:00Z';
  const time = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`;
  const t = Date.parse(`${session.date}T${time}`);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/**
 * Does this weekend run a sprint? Bundles flag it on the calendar entry, but a
 * hand-curated one may only carry the sessions, so check both.
 *
 * @param {object} cal calendar entry
 * @returns {boolean}
 */
export function isSprintWeekend(cal) {
  const s = (cal && cal.sessions) || {};
  return !!(cal && (cal.sprint === true || s.sprint || s.sprintQuali));
}

/**
 * Rulebook §5: the lock is the scheduled start of qualifying, or of sprint
 * qualifying on a sprint weekend.
 *
 * §8's cancelled-qualifying case says the lock "moves to the first session
 * actually held" — which, in bundle terms, is what happens when the preferred
 * session simply isn't in the data: we fall back to the earliest session that
 * is, and finally to the race itself.
 *
 * @param {object} cal calendar entry
 * @returns {string|null} ISO instant
 */
export function lockInstant(cal) {
  const s = (cal && cal.sessions) || {};
  const preferred = isSprintWeekend(cal) ? (s.sprintQuali || s.q) : s.q;
  const direct = sessionInstant(preferred);
  if (direct) return direct;
  const all = Object.values(s).map(sessionInstant).filter(Boolean).sort();
  if (all.length) return all[0];
  return raceInstant(cal);
}

/**
 * The race start. Falls back to the calendar entry's own `date`/`time`, which
 * older bundles carry without a `sessions` block.
 *
 * @param {object} cal
 * @returns {string|null}
 */
export function raceInstant(cal) {
  const s = (cal && cal.sessions) || {};
  return sessionInstant(s.race) || sessionInstant(cal);
}

/**
 * Rulebook §9: provisional for 7 days after the race, "or until the next
 * round's lock, whichever comes first".
 *
 * @param {string|null} raceAt ISO
 * @param {string|null} nextLockAt ISO of the following round's lock
 * @returns {string|null} ISO
 */
export function finalInstant(raceAt, nextLockAt) {
  if (!raceAt) return null;
  const window = Date.parse(raceAt) + PROVISIONAL_DAYS * DAY_MS;
  const next = nextLockAt ? Date.parse(nextLockAt) : NaN;
  const at = Number.isFinite(next) ? Math.min(window, next) : window;
  return new Date(at).toISOString();
}

/**
 * The round plan for a whole season: one row per calendar entry, each carrying
 * the lock/race instants, whether the bundle already has results for it, and
 * the status those facts imply.
 *
 * @param {object} bundle season bundle
 * @param {{now?: Date|string|number}} [opts]
 * @returns {{round: number, name: string, isSprint: boolean, lockAt: string|null, raceAt: string|null,
 *            finalAt: string|null, hasResults: boolean, locked: boolean, status: string}[]}
 */
export function planRounds(bundle, { now = Date.now() } = {}) {
  const at = new Date(now).getTime();
  const results = (bundle && bundle.results) || {};
  const calendar = [...((bundle && bundle.calendar) || [])].sort((a, b) => a.round - b.round);

  const base = calendar.map(cal => ({
    round: Number(cal.round),
    name: cal.name || `Round ${cal.round}`,
    isSprint: isSprintWeekend(cal),
    lockAt: lockInstant(cal),
    raceAt: raceInstant(cal),
    hasResults: !!results[String(cal.round)],
  }));

  return base.map((r, i) => {
    const nextLock = base[i + 1] ? base[i + 1].lockAt : null;
    const finalAt = finalInstant(r.raceAt, nextLock);
    const locked = !!r.lockAt && at >= Date.parse(r.lockAt);
    let status = 'upcoming';
    if (r.hasResults) status = finalAt && at >= Date.parse(finalAt) ? 'final' : 'provisional';
    else if (locked) status = 'locked';
    return { ...r, finalAt, locked, status };
  });
}

/**
 * Statuses only ever move forward. A bundle that briefly loses a round (a bad
 * fetch, a hand-edit) must never demote a `final` round back to `locked` and
 * re-open a settled result.
 *
 * @param {string} current status already in PocketBase
 * @param {string} next status the bundle implies
 * @returns {string}
 */
export function advanceStatus(current, next) {
  const rank = { upcoming: 0, locked: 1, provisional: 2, final: 3 };
  const a = rank[current] ?? -1;
  const b = rank[next] ?? -1;
  return b > a ? next : (current || next);
}

/**
 * Season defaults. Caps are the rulebook's 5/4 on a 24-round calendar, scaled
 * when the real calendar is materially different (§4's "adjusted caps").
 *
 * Only used when CREATING the season row — an operator may tune the caps in
 * the admin UI and the scorer must not stomp on that on the next run.
 *
 * @param {object} bundle
 * @param {number} year
 * @returns {object} fantasy_seasons fields
 */
export function planSeason(bundle, year) {
  const rounds = ((bundle && bundle.calendar) || []).length || REFERENCE_ROUNDS;
  const scale = rounds / REFERENCE_ROUNDS;
  return {
    year,
    status: 'active',
    capDriver: Math.max(1, Math.round(RULES.CAP_DRIVER * scale)),
    capConstructor: Math.max(1, Math.round(RULES.CAP_CONSTRUCTOR * scale)),
    splitLength: RULES.TIER_WINDOW,
    tierCount: RULES.TIER_LETTERS.length,
    rulesVersion: RULES.version,
    seedYear: year - 1,
  };
}

/**
 * The season's entry list: every driver who appeared in any scored round's
 * qualifying or race classification, with the team they were driving for most
 * recently (caps follow the person, not the seat — rulebook §4).
 *
 * `active` marks the drivers on the latest round's entry list, which is what
 * the pick board should offer.
 *
 * @param {object} bundle
 * @param {number[]} scoredRounds ascending
 * @returns {{code: string, driverRef: string, name: string, teamId: string, teamName: string, active: boolean}[]}
 */
export function planEntries(bundle, scoredRounds) {
  const drivers = new Map(((bundle && bundle.drivers) || []).map(d => [d.id, d]));
  const teams = new Map(((bundle && bundle.teams) || []).map(t => [t.id, t]));
  const seen = new Map();
  let latest = new Set();

  for (const round of scoredRounds) {
    const list = entryList(bundle, round);
    latest = new Set(list.map(e => e.code));
    for (const { code, teamId } of list) {
      const d = drivers.get(code) || {};
      seen.set(code, {
        code,
        driverRef: d.jolpicaId || d.driverRef || '',
        name: [d.first, d.last].filter(Boolean).join(' ') || code,
        teamId: teamId || '',
        teamName: (teams.get(teamId) || {}).name || teamId || '',
      });
    }
  }

  return [...seen.values()]
    .map(e => ({ ...e, active: latest.has(e.code) }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * The rounds a bundle has results for, ascending.
 * @param {object} bundle
 * @returns {number[]}
 */
export function scoredRoundsOf(bundle) {
  return Object.keys((bundle && bundle.results) || {})
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

/**
 * The rounds that have an entry list: scored rounds, plus a round whose
 * qualifying has run but whose race hasn't (the bundle's `pendingQuali`).
 *
 * That second case is what makes round 1 of a season work at all — before the
 * first race there is no `results` entry to read a grid from, but there is a
 * qualifying classification, and the rulebook needs published tiers before
 * picks open (§3).
 *
 * @param {object} bundle
 * @returns {number[]} ascending
 */
export function entryRoundsOf(bundle) {
  const keys = new Set([
    ...Object.keys((bundle && bundle.results) || {}),
    ...Object.keys((bundle && bundle.pendingQuali) || {}),
  ]);
  return [...keys].map(Number).filter(Number.isFinite).sort((a, b) => a - b);
}
