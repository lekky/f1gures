// scripts/social/angles.mjs
//
// The editorial brain of the daily social post.
//
// Every "angle" is a provider that looks at a date and returns zero or more
// *candidates* - concrete, fully-sourced post ideas built only from data that
// already exists in public/data/archive. Nothing here writes prose from
// nothing: a candidate carries the numbers, and caption.mjs phrases them.
//
// Selection is a deterministic two-stage weighted draw seeded by the post
// date, so the same date + same history always yields the same post (easy to
// dry-run, easy to test), while the history log keeps the feed from repeating
// itself.
//
//   stage 1: pick the ANGLE     (topicality-weighted, with a recency penalty)
//   stage 2: pick the CANDIDATE (interest-weighted, with key/subject cooldowns)
//
// A single-stage draw over all candidates would let whichever pool happened to
// be biggest (drivers, ~250 entries) drown out the pools that matter most on a
// given day (a race result, of which there is exactly one). Hence two stages.

import {
  racesIndex, raceDoc, driversIndex, driverDoc, teamsIndex, teamDoc,
  circuitsIndex, circuitDoc, recordConfigs, recordDoc, compareSuggestions,
  trivia, seasons, racesByMonthDay, driverIndexMap, circuitIndexMap, seasonBundle,
} from './sources.mjs';
import { computeStandings } from '../../src/lib/seasonStats.mjs';
import { yearsBetween, daysBetween } from './format.mjs';

// ── cooldowns (days) ──
export const KEY_COOLDOWN_DAYS = 400;     // never repeat the exact same post within ~13 months
export const SUBJECT_COOLDOWN_DAYS = 21;  // space out the same driver/team/circuit
export const ANGLE_COOLDOWN_DAYS = 3;     // avoid three "on this day" posts in a row

// Base topicality of each angle. Higher = more likely to be chosen on a day
// where it has any candidates at all. Race weekends deliberately dominate.
export const ANGLE_WEIGHTS = {
  'race-result': 100,
  'quali-result': 92,
  'sprint-result': 88,
  'race-preview': 70,
  'on-this-day': 34,
  'driver-birthday': 26,
  'record-board': 16,
  'standings-snapshot': 14,
  'driver-spotlight': 12,
  'head-to-head': 12,
  'circuit-spotlight': 10,
  'team-spotlight': 10,
  trivia: 8,
};

export const ANGLE_IDS = Object.keys(ANGLE_WEIGHTS);

// ── deterministic RNG (mulberry32 over a string hash) ──
function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function makeRng(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hashString(String(seed));
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Weighted pick from [{weight}] using rng(). Returns null for an empty/zero-weight list. */
export function weightedPick(items, rng) {
  const pool = items.filter((i) => i.weight > 0);
  if (!pool.length) return null;
  const total = pool.reduce((sum, i) => sum + i.weight, 0);
  let r = rng() * total;
  for (const item of pool) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return pool[pool.length - 1];
}

// ── history lookups ──
function daysSince(history, predicate, date) {
  let best = Infinity;
  for (const post of history) {
    if (!predicate(post)) continue;
    const d = daysBetween(post.date, date);
    if (d !== null && d >= 0 && d < best) best = d;
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Angle providers. Each returns an array of candidates:
//   { angle, key, weight, subject, layout, link, data }
// ─────────────────────────────────────────────────────────────────────────────

/** A grand prix that finished in the last three days. */
function raceResultCandidates({ date }) {
  const out = [];
  for (const r of racesIndex()) {
    if (!r.completed || !r.date) continue;
    const age = daysBetween(r.date, date);
    if (age === null || age < 0 || age > 3) continue;
    const doc = raceDoc(r.year, r.round);
    const podium = (doc?.results || []).filter((x) => x.position >= 1 && x.position <= 3);
    if (podium.length < 3) continue;
    out.push({
      angle: 'race-result',
      key: `race-result:${r.year}-${r.round}`,
      // Freshest result wins; a 3-day-old race is a weak fallback.
      weight: 100 - age * 25,
      subject: `race:${r.year}-${r.round}`,
      layout: 'podium',
      link: `/races/${r.year}/${r.round}/`,
      data: { race: doc, session: 'race', podium, top: (doc.results || []).slice(0, 5) },
    });
  }
  return out;
}

/** Qualifying rows off a race doc, whether the race has run yet or not. */
function qualiRows(doc) {
  return (doc?.qualifying || []).filter((r) => r.position >= 1);
}

/** Sprint rows - completed docs use `sprint`, holding pages use `sprint_results`. */
function sprintRows(doc) {
  const rows = doc?.sprint?.length ? doc.sprint : doc?.sprint_results;
  return (rows || []).filter((r) => r.position >= 1);
}

/**
 * Saturday's qualifying result.
 *
 * build-archive maps a pending round's `pendingQuali` onto the holding page, so
 * this fires on the Saturday of a race weekend - before the race doc is
 * "completed" - and stops once the race result supersedes it.
 */
function qualiResultCandidates({ date }) {
  const out = [];
  for (const r of racesIndex()) {
    if (!r.date) continue;
    const untilRace = daysBetween(date, r.date);
    // From the day after qualifying through to race day itself.
    if (untilRace === null || untilRace < 0 || untilRace > 2) continue;
    const doc = raceDoc(r.year, r.round);
    const rows = qualiRows(doc);
    if (rows.length < 3) continue;
    out.push({
      angle: 'quali-result',
      key: `quali-result:${r.year}-${r.round}`,
      weight: 100 - untilRace * 15,
      subject: `race:${r.year}-${r.round}`,
      layout: 'podium',
      link: `/races/${r.year}/${r.round}/`,
      data: { race: doc, session: 'qualifying', podium: rows.slice(0, 3), top: rows.slice(0, 5) },
    });
  }
  return out;
}

/** The sprint result, on a sprint weekend. */
function sprintResultCandidates({ date }) {
  const out = [];
  for (const r of racesIndex()) {
    if (!r.date) continue;
    const untilRace = daysBetween(date, r.date);
    if (untilRace === null || untilRace < -1 || untilRace > 2) continue;
    const doc = raceDoc(r.year, r.round);
    const rows = sprintRows(doc);
    if (rows.length < 3) continue;
    out.push({
      angle: 'sprint-result',
      key: `sprint-result:${r.year}-${r.round}`,
      weight: 100 - Math.abs(untilRace) * 15,
      subject: `race:${r.year}-${r.round}`,
      layout: 'podium',
      link: `/races/${r.year}/${r.round}/`,
      data: { race: doc, session: 'sprint', podium: rows.slice(0, 3), top: rows.slice(0, 5) },
    });
  }
  return out;
}

/** The next grand prix, when it is within four days. */
function racePreviewCandidates({ date }) {
  const upcoming = racesIndex()
    .filter((r) => r.date && !r.completed)
    .map((r) => ({ r, inDays: daysBetween(date, r.date) }))
    .filter((x) => x.inDays !== null && x.inDays >= 0 && x.inDays <= 4)
    .sort((a, b) => a.inDays - b.inDays);
  if (!upcoming.length) return [];

  const { r, inDays } = upcoming[0];
  const circuit = circuitDoc(r.circuitRef) || circuitIndexMap().get(r.circuitRef) || null;
  // Last time this circuit hosted a race, and who won it.
  const past = (circuit?.races || []).filter((x) => x.year < r.year).sort((a, b) => b.year - a.year);
  const lastWinner = past[0] || null;

  return [{
    angle: 'race-preview',
    key: `race-preview:${r.year}-${r.round}`,
    weight: 100 - inDays * 10,
    subject: `race:${r.year}-${r.round}`,
    layout: 'hero',
    link: `/races/${r.year}/${r.round}/`,
    data: { race: r, circuit, lastWinner, inDays },
  }];
}

/** Grands prix run on this calendar day in earlier years. */
function onThisDayCandidates({ date, monthDay, year }) {
  const list = racesByMonthDay().get(monthDay) || [];
  const seasonMeta = seasons();
  const candidates = [];

  for (const r of list) {
    const age = year - r.year;
    if (age < 1) continue;
    const doc = raceDoc(r.year, r.round);
    if (!doc) continue;
    const podium = (doc.results || []).filter((x) => x.position >= 1 && x.position <= 3);
    if (podium.length < 3) continue;

    // Round-number anniversaries are the whole appeal of an "on this day".
    let weight = 14;
    // "On this day last year" is thin - real history reads better.
    if (age < 3) weight -= 8;
    if (age % 25 === 0) weight += 40;
    else if (age % 10 === 0) weight += 22;
    else if (age % 5 === 0) weight += 10;

    const winnerRow = driverIndexMap().get(doc.winner);
    if (winnerRow?.championships > 0) weight += 6;
    if ((winnerRow?.wins || 0) >= 20) weight += 4;

    // A season finale is a title decider more often than not.
    const meta = seasonMeta[String(r.year)];
    const isFinale = meta && meta.rounds === r.round;
    if (isFinale) weight += 8;

    // A driver's very first win is a story every time.
    const wd = driverDoc(doc.winner);
    const firstWin = (wd?.perRace || []).find((x) => x.position === 1);
    const isFirstWin = Boolean(firstWin && firstWin.year === r.year && firstWin.round === r.round);
    if (isFirstWin) weight += 16;

    candidates.push({
      angle: 'on-this-day',
      key: `on-this-day:${r.year}-${r.round}`,
      weight,
      subject: `driver:${doc.winner}`,
      layout: 'leaderboard',
      link: `/races/${r.year}/${r.round}/`,
      data: {
        race: doc, podium, age, isFirstWin, isFinale,
        champion: isFinale && meta ? meta.champion : null,
        top: (doc.results || []).slice(0, 5),
      },
    });
  }

  // Keep the pool tight so one strong anniversary isn't diluted by six dull ones.
  return candidates.sort((a, b) => b.weight - a.weight).slice(0, 6);
}

/**
 * Drivers born on this calendar day.
 *
 * Framed strictly as "born on this day in YYYY" - Ergast carries no date of
 * death, so we must never phrase this as "turns 96 today".
 */
function driverBirthdayCandidates({ monthDay, year }) {
  const out = [];
  for (const row of driversIndex()) {
    // Cheap notability gate first - avoids loading 800+ docs for nobody.
    const notable = row.championships > 0 || row.wins > 0 || (row.races || 0) >= 60;
    if (!notable) continue;
    const doc = driverDoc(row.driverRef);
    if (!doc?.dob || doc.dob.slice(5, 10) !== monthDay) continue;

    const age = year - Number(doc.dob.slice(0, 4));
    let weight = 10 + (doc.career?.championships || 0) * 10 + Math.min(doc.career?.wins || 0, 25);
    if (age % 10 === 0) weight += 25;
    else if (age % 5 === 0) weight += 8;

    out.push({
      angle: 'driver-birthday',
      key: `driver-birthday:${row.driverRef}`,
      weight,
      subject: `driver:${row.driverRef}`,
      layout: 'hero',
      link: `/drivers/${row.driverRef}/`,
      data: { driver: doc, bornYear: Number(doc.dob.slice(0, 4)), age },
    });
  }
  return out;
}

/** One of the 20 all-time record leaderboards. */
function recordBoardCandidates() {
  const out = [];
  for (const cfg of recordConfigs()) {
    const doc = recordDoc(cfg.id);
    const rows = doc?.allTime?.top50 || doc?.allTime?.top5 || cfg.allTime?.top5 || [];
    if (rows.length < 5) continue;
    out.push({
      angle: 'record-board',
      key: `record-board:${cfg.id}`,
      weight: cfg.subjectType === 'driver' ? 12 : 8,
      subject: `record:${cfg.id}`,
      layout: 'leaderboard',
      link: `/records/${cfg.id}/`,
      data: { config: cfg, rows: rows.slice(0, 5) },
    });
  }
  return out;
}

/** A career card for a driver worth a card. */
function driverSpotlightCandidates() {
  const out = [];
  for (const row of driversIndex()) {
    const c = row.championships || 0;
    const w = row.wins || 0;
    if (c === 0 && w < 3) continue;
    out.push({
      angle: 'driver-spotlight',
      key: `driver-spotlight:${row.driverRef}`,
      weight: 6 + c * 6 + Math.min(w, 20),
      subject: `driver:${row.driverRef}`,
      layout: 'hero',
      link: `/drivers/${row.driverRef}/`,
      data: { driverRef: row.driverRef, index: row },
    });
  }
  return out;
}

/** A constructor card. */
function teamSpotlightCandidates() {
  const out = [];
  for (const row of teamsIndex()) {
    if ((row.races || 0) < 40 && (row.wins || 0) === 0) continue;
    out.push({
      angle: 'team-spotlight',
      key: `team-spotlight:${row.constructorRef}`,
      weight: 5 + (row.championships || 0) * 6 + Math.min(row.wins || 0, 20),
      subject: `team:${row.constructorRef}`,
      layout: 'hero',
      link: `/teams/${row.constructorRef}/`,
      data: { teamRef: row.constructorRef, index: row },
    });
  }
  return out;
}

/** A circuit card, with its all-time win leader. */
function circuitSpotlightCandidates() {
  const out = [];
  for (const row of circuitsIndex()) {
    if ((row.raceCount || 0) < 5) continue;
    out.push({
      angle: 'circuit-spotlight',
      key: `circuit-spotlight:${row.circuitRef}`,
      weight: 5 + Math.min(row.raceCount, 30),
      subject: `circuit:${row.circuitRef}`,
      layout: 'hero',
      link: `/circuits/${row.circuitRef}/`,
      data: { circuitRef: row.circuitRef, index: row },
    });
  }
  return out;
}

/**
 * Current drivers' championship top 5, mid-season only.
 *
 * Race docs carry results, not standings, so points come from the same
 * seasonStats.mjs the site and the OG cards use - never a second scoring
 * implementation (three once disagreed; see CLAUDE.md).
 */
function standingsSnapshotCandidates({ date, year }) {
  const rounds = racesIndex().filter((r) => r.year === year);
  const done = rounds.filter((r) => r.completed);
  // Only interesting once the season has shape, and before it is settled.
  if (done.length < 3 || !rounds.length || done.length >= rounds.length) return [];

  const bundle = seasonBundle(year);
  if (!bundle) return [];
  const standings = computeStandings(bundle);
  const rows = (standings?.drivers || []).slice(0, 5);
  if (rows.length < 5) return [];

  const last = done[done.length - 1];
  return [{
    angle: 'standings-snapshot',
    key: `standings-snapshot:${year}-${done.length}`,
    weight: 100,
    subject: `standings:${year}`,
    layout: 'leaderboard',
    link: '/standings-drivers/',
    data: {
      year,
      afterRound: last.round,
      afterRaceName: last.name,
      roundsDone: done.length,
      roundsTotal: rounds.length,
      rows,
      teams: (standings?.teams || []).slice(0, 3),
      date,
    },
  }];
}

/** A curated or data-derived head-to-head from the Compare tool's pool. */
function headToHeadCandidates() {
  const pool = compareSuggestions();
  const out = [];
  for (const m of pool.driver || []) {
    out.push({
      angle: 'head-to-head',
      key: `head-to-head:driver:${m.a}-${m.b}`,
      weight: 10,
      subject: `driver:${m.a}`,
      layout: 'versus',
      link: `/compare/?type=driver&a=${m.a}&b=${m.b}`,
      data: { type: 'driver', matchup: m },
    });
  }
  return out;
}

/** Evergreen hand-verified facts - the always-available floor. */
function triviaCandidates() {
  const facts = trivia().facts || [];
  return facts.map((f, i) => ({
    angle: 'trivia',
    key: `trivia:${i}`,
    weight: 5,
    subject: `trivia:${f.category || 'general'}`,
    layout: 'fact',
    link: '/',
    data: { fact: f, index: i },
  }));
}

const PROVIDERS = {
  'race-result': raceResultCandidates,
  'quali-result': qualiResultCandidates,
  'sprint-result': sprintResultCandidates,
  'race-preview': racePreviewCandidates,
  'on-this-day': onThisDayCandidates,
  'driver-birthday': driverBirthdayCandidates,
  'record-board': recordBoardCandidates,
  'standings-snapshot': standingsSnapshotCandidates,
  'driver-spotlight': driverSpotlightCandidates,
  'team-spotlight': teamSpotlightCandidates,
  'circuit-spotlight': circuitSpotlightCandidates,
  'head-to-head': headToHeadCandidates,
  trivia: triviaCandidates,
};

/**
 * Run every provider for a date, or just the angles in `only`.
 * @param {string} date
 * @param {{only?: string|string[]|null}} opts  one angle id, or an allowlist
 */
export function collectCandidates(date, { only = null } = {}) {
  const ctx = {
    date,
    year: Number(date.slice(0, 4)),
    monthDay: date.slice(5, 10),
  };
  const allow = only == null ? null : (Array.isArray(only) ? only : [only]);
  const ids = allow ? ANGLE_IDS.filter((id) => allow.includes(id)) : ANGLE_IDS;
  const byAngle = new Map();
  for (const id of ids) {
    const provider = PROVIDERS[id];
    if (!provider) continue;
    let candidates = [];
    try {
      candidates = provider(ctx) || [];
    } catch (err) {
      // One broken angle must never take the day's post down with it.
      console.warn(`[social] angle "${id}" failed: ${err.message}`);
    }
    if (candidates.length) byAngle.set(id, candidates);
  }
  return byAngle;
}

/**
 * The selection maths, separated from data loading so it can be unit-tested
 * against synthetic candidates (the archive is gitignored and absent in CI).
 *
 * Two stages: pick the angle by topicality, then a candidate within it. A
 * single-stage draw over every candidate would let whichever pool happened to
 * be biggest (drivers, ~250 entries) drown out the pools that matter most on a
 * given day (a race result, of which there is exactly one).
 *
 * @param {Map<string, object[]>} byAngle
 * @param {object} opts
 * @param {string} opts.date
 * @param {object[]} opts.history
 * @returns {object|null}
 */
export function selectFromCandidates(byAngle, { date, history = [] }) {
  if (!byAngle || !byAngle.size) return null;
  const rng = makeRng(`f1gures-social:${date}`);

  // Angles still in play. An angle whose every candidate is on key cooldown is
  // dropped and the draw is retried, rather than falling through to a repeat -
  // batch mode builds a fortnight in one run, so a "post it anyway" fallback
  // there yields two identical posts a week apart.
  const remaining = new Map();
  for (const [id, list] of byAngle) {
    if (list?.length) remaining.set(id, list);
  }

  while (remaining.size) {
    // Stage 1 - the angle.
    const angleChoices = [];
    for (const [id, list] of remaining) {
      const sinceAngle = daysSince(history, (p) => p.angle === id, date);
      // A recently-used angle is heavily damped but never excluded outright, so
      // a quiet winter week can still fall back to it rather than post nothing.
      const penalty = sinceAngle < ANGLE_COOLDOWN_DAYS ? 0.12 : 1;
      angleChoices.push({ id, list, weight: (ANGLE_WEIGHTS[id] ?? 5) * penalty });
    }
    const chosenAngle = weightedPick(angleChoices, rng);
    if (!chosenAngle) break;

    // Stage 2 - the candidate.
    const scored = chosenAngle.list.map((c) => {
      const sinceKey = daysSince(history, (p) => p.key === c.key, date);
      const sinceSubject = daysSince(history, (p) => p.subject === c.subject, date);
      let weight = c.weight;
      if (sinceKey < KEY_COOLDOWN_DAYS) weight = 0;                  // hard block
      else if (sinceSubject < SUBJECT_COOLDOWN_DAYS) weight *= 0.1;  // soft space-out
      return { ...c, weight };
    });

    const chosen = weightedPick(scored, rng);
    if (chosen) return { ...chosen, date };

    // Every candidate here is spent - take this angle out and draw again.
    remaining.delete(chosenAngle.id);
  }

  // Nothing anywhere is off cooldown. Rather than post nothing, take the
  // candidate whose key was used longest ago (or never).
  let stalest = null;
  let stalestAge = -1;
  for (const list of byAngle.values()) {
    for (const c of list) {
      const age = daysSince(history, (p) => p.key === c.key, date);
      if (age > stalestAge) {
        stalestAge = age;
        stalest = c;
      }
    }
  }
  return stalest ? { ...stalest, date } : null;
}

/**
 * Choose the post for `date`.
 *
 * @param {object}   opts
 * @param {string}   opts.date     ISO YYYY-MM-DD
 * @param {object[]} opts.history  prior posts: [{ date, angle, key, subject }]
 * @param {string|string[]} [opts.angle]  force an angle, or allow only these
 * @param {string}   [opts.key]    force a specific candidate
 * @returns {object|null} the chosen candidate, with `date` attached
 */
export function pickPost({ date, history = [], angle = null, key = null }) {
  const byAngle = collectCandidates(date, { only: angle });
  if (!byAngle.size) return null;

  // An explicit key short-circuits both stages (used to re-render a past post).
  if (key) {
    for (const list of byAngle.values()) {
      const hit = list.find((c) => c.key === key);
      if (hit) return { ...hit, date };
    }
    return null;
  }

  return selectFromCandidates(byAngle, { date, history });
}

/**
 * Fill in the heavy documents for the chosen candidate only.
 *
 * The spotlight providers deliberately carry just an index row - hydrating 71
 * driver docs during collection would cost more than the whole run. This runs
 * once, after selection.
 */
export function hydrate(candidate) {
  if (!candidate) return candidate;
  const d = { ...candidate.data };
  switch (candidate.angle) {
    case 'driver-spotlight':
      d.driver = driverDoc(d.driverRef);
      break;
    case 'team-spotlight':
      d.team = teamDoc(d.teamRef);
      break;
    case 'circuit-spotlight':
      d.circuit = circuitDoc(d.circuitRef);
      break;
    case 'head-to-head':
      d.a = driverDoc(d.matchup.a);
      d.b = driverDoc(d.matchup.b);
      break;
    default:
      break;
  }
  return { ...candidate, data: d };
}
