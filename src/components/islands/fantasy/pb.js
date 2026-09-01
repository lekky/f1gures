// Shared PocketBase client + data helpers for the /fantasy/ islands.
//
// Everything the fantasy UI knows about the backend lives here: the singleton
// SDK instance, the auth store bridge, the handful of reads each screen needs,
// and the two bits of logic that must mirror the server exactly —
//   * usage tallying (`computeUsage`), which mirrors `tallyUsage` /
//     `isRefunded` in fantasy/pocketbase/pb_hooks/fantasy_rules.js, and
//   * error unpacking (`pbError`), which follows the error contract documented
//     in fantasy/pocketbase/README.md ("Error shape"): the human reason is the
//     top-level `message` (several joined with " · "), while the `data` keys
//     name the inputs to highlight.
//
// The server is authoritative for all of it; the client copies exist only so
// the board can grey out illegal options before a round-trip.

import PocketBase from 'pocketbase';
import {
  FANTASY_PB_URL,
  FANTASY_GOOGLE_AUTH,
  fantasyConfigured,
} from '../../../data/fantasyConfig.js';

export { FANTASY_PB_URL, FANTASY_GOOGLE_AUTH, fantasyConfigured };

export const SLOTS = ['A', 'B', 'C', 'D'];
export const SLOT_FIELD = { A: 'driverA', B: 'driverB', C: 'driverC', D: 'driverD' };

// ─── client ───────────────────────────────────────────────────────────────
let _pb = null;

/**
 * The singleton client. Returns null when the build has no backend configured,
 * and during SSR — every fantasy read happens after hydration, and the SDK's
 * default auth store wants `localStorage`.
 */
export function pb() {
  if (typeof window === 'undefined') return null;
  if (!fantasyConfigured()) return null;
  if (!_pb) {
    _pb = new PocketBase(FANTASY_PB_URL);
    // Islands fire several reads in parallel and re-fire them on refresh; the
    // SDK's per-"request key" auto-cancellation would abort the earlier ones.
    _pb.autoCancellation(false);
  }
  return _pb;
}

/** PocketBase serialises dates as "2026-09-08 21:19:46.560Z". */
export function parseDate(v) {
  if (!v) return null;
  const d = new Date(String(v).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isLocked(round, now = Date.now()) {
  const d = parseDate(round?.lockAt);
  return !d || d.getTime() <= now;
}

// ─── errors ───────────────────────────────────────────────────────────────
/** True when `message` is PocketBase's own contentless rejection wording. */
export function isGenericPbMessage(message) {
  return /^failed to (create|update|delete) record\.?$/i.test(String(message || ''));
}

/**
 * Unpack a PocketBase ApiError into something a form can render.
 *
 * `message` is left exactly as the server sent it — the hook puts the human
 * reason there (several joined with " · "). Callers that can say something
 * better about a generic message check `isGenericPbMessage` themselves;
 * rewriting here would put pick wording on a league error.
 *
 * @returns {{message: string, fields: string[], slots: string[],
 *            codes: Record<string, string>, status: number}}
 */
export function pbError(err, fallback = 'Something went wrong. Please try again.') {
  const status = err?.status || 0;
  const resp = err?.response || err?.data || {};
  const data = resp?.data && typeof resp.data === 'object' ? resp.data : {};
  const fields = Object.keys(data);

  const codes = {};
  for (const f of fields) codes[f] = data[f]?.code || '';

  // driverA…driverD map back to slot letters so the board can flag a column.
  const slots = fields
    .map((f) => (/^driver[ABCD]$/.test(f) ? f.slice(-1) : f === 'constructor' || f === 'boost' ? f : null))
    .filter(Boolean);

  const message = resp?.message || err?.message || fallback;
  return { message, fields, slots, codes, status };
}

// ─── reads ────────────────────────────────────────────────────────────────
const ALL = { perPage: 500, requestKey: null };

/** The season to play: the active one, else the newest. */
export async function loadSeason() {
  const client = pb();
  const seasons = await client.collection('fantasy_seasons').getFullList({ sort: '-year', ...ALL });
  if (!seasons.length) return null;
  return seasons.find((s) => s.status === 'active') || seasons[0];
}

export async function loadRounds(seasonId) {
  return pb().collection('fantasy_rounds').getFullList({
    filter: `season="${seasonId}"`,
    sort: 'round',
    ...ALL,
  });
}

/** The round picks are open for: the first whose lockAt is still in the future. */
export function pickableRound(rounds, now = Date.now()) {
  return rounds.find((r) => !isLocked(r, now)) || null;
}

/** The most recent round that has already locked. */
export function lastLockedRound(rounds, now = Date.now()) {
  const locked = rounds.filter((r) => isLocked(r, now));
  return locked.length ? locked[locked.length - 1] : null;
}

export async function loadEntries(seasonId) {
  return pb().collection('fantasy_entries').getFullList({
    filter: `season="${seasonId}"`,
    sort: 'code',
    ...ALL,
  });
}

/** Tier rows for a round, entry expanded, ordered by rank. */
export async function loadTiers(roundId) {
  return pb().collection('fantasy_tiers').getFullList({
    filter: `round="${roundId}"`,
    sort: 'rank',
    expand: 'entry',
    ...ALL,
  });
}

/** Every pick the signed-in user has made this season (rounds expanded). */
export async function loadMyPicks(seasonId, userId) {
  return pb().collection('fantasy_picks').getFullList({
    filter: `user="${userId}" && round.season="${seasonId}"`,
    expand: 'round,driverA,driverB,driverC,driverD',
    ...ALL,
  });
}

/** Picks of any user for one round. Only visible after that round's lock. */
export async function loadPicksForRound(roundId, userId) {
  const filter = userId ? `round="${roundId}" && user="${userId}"` : `round="${roundId}"`;
  return pb().collection('fantasy_picks').getFullList({
    filter,
    expand: 'driverA,driverB,driverC,driverD',
    ...ALL,
  });
}

export async function loadStandings(seasonId) {
  return pb().collection('fantasy_standings').getFullList({
    filter: `season="${seasonId}"`,
    sort: '-points',
    expand: 'user',
    ...ALL,
  });
}

export async function loadRoundScores(roundId) {
  return pb().collection('fantasy_pick_scores').getFullList({
    filter: `round="${roundId}"`,
    sort: '-total',
    expand: 'user',
    ...ALL,
  });
}

/** My weekend scores, newest round first. */
export async function loadMyPickScores(userId) {
  return pb().collection('fantasy_pick_scores').getFullList({
    filter: `user="${userId}"`,
    expand: 'round',
    ...ALL,
  });
}

// ─── usage / caps ─────────────────────────────────────────────────────────
// Mirrors fantasy_rules.js. `refunded` is scorer-written and accepts three
// shapes: an array of slot letters or entry ids, an object keyed by slot, or
// an object keyed by entry id. "constructor" is a valid key (void race).
function isRefunded(refunded, slot, key) {
  if (!refunded) return false;
  if (Array.isArray(refunded)) {
    return refunded.some((v) => v === slot || (key && v === key));
  }
  if (typeof refunded === 'object') {
    if (Object.prototype.hasOwnProperty.call(refunded, slot) && refunded[slot] === true) return true;
    if (key && Object.prototype.hasOwnProperty.call(refunded, key) && refunded[key] === true) return true;
  }
  return false;
}

/**
 * Starts spent, counted exactly the way the hook counts them: over the user's
 * picks in rounds of this season that have ALREADY LOCKED.
 *
 * @param picks  records from loadMyPicks (round expanded)
 * @returns {{drivers: Record<string, number>, constructors: Record<string, number>}}
 */
export function computeUsage(picks, now = Date.now()) {
  const drivers = {};
  const constructors = {};

  for (const p of picks || []) {
    const round = p.expand?.round;
    if (!round || !isLocked(round, now)) continue; // open rounds don't spend a start

    for (const slot of SLOTS) {
      const entryId = p[SLOT_FIELD[slot]];
      if (!entryId) continue;
      if (isRefunded(p.refunded, slot, entryId)) continue;
      drivers[entryId] = (drivers[entryId] || 0) + 1;
    }

    const teamId = p.constructor;
    if (teamId && !isRefunded(p.refunded, 'constructor', teamId)) {
      constructors[teamId] = (constructors[teamId] || 0) + 1;
    }
  }

  return { drivers, constructors };
}

/** Starts left for an entry (never negative). */
export function startsLeft(cap, used) {
  if (!(cap > 0)) return Infinity;
  return Math.max(0, cap - (used || 0));
}

/** True when every entry in the tier has spent the driver cap. */
export function tierExhausted(tierRows, usageDrivers, capDriver) {
  if (!tierRows?.length || !(capDriver > 0)) return false;
  return tierRows.every((t) => (usageDrivers[t.entry] || 0) >= capDriver);
}

// ─── team colours ─────────────────────────────────────────────────────────
// Team colour is data, not a design token, so it comes from the season bundle
// the rest of the site already ships. Missing teams fall back to a neutral
// line token — colour only ever lands on a dot or a 3px strip.
const TEAM_ID_ALIAS = {
  red_bull: 'redbull',
  aston_martin: 'aston',
  racing_bulls: 'rb',
  alphatauri: 'rb',
  kick_sauber: 'sauber',
  sauber: 'audi', // Kick Sauber became Audi for 2026
};

const _teamMetaCache = new Map();

/** { [teamId]: { name, short, color } } for a season year, from /data/<year>.json. */
export async function loadTeamMeta(year) {
  const key = String(year || '');
  if (_teamMetaCache.has(key)) return _teamMetaCache.get(key);
  const promise = (async () => {
    const out = {};
    try {
      const res = await fetch(`/data/${key}.json`);
      if (!res.ok) return out;
      const bundle = await res.json();
      for (const t of bundle.teams || []) {
        const meta = { name: t.name, short: t.short, color: t.color };
        if (t.id) out[t.id] = meta;
        if (t.jolpicaId) out[t.jolpicaId] = meta;
      }
    } catch {
      /* offline / no bundle for this year — colours degrade to neutral */
    }
    return out;
  })();
  _teamMetaCache.set(key, promise);
  return promise;
}

function teamMeta(meta, teamId) {
  if (!teamId) return null;
  return meta?.[teamId] || meta?.[TEAM_ID_ALIAS[teamId]] || null;
}

export function teamColor(meta, teamId) {
  return teamMeta(meta, teamId)?.color || 'var(--line-3)';
}

/** Display name for a teamId, falling back to the id itself. */
export function teamName(meta, teamId) {
  return teamMeta(meta, teamId)?.name || teamId || '—';
}

// ─── display names ────────────────────────────────────────────────────────
// The `users` collection ships with `viewRule: id = @request.auth.id`, so an
// `expand=user` only resolves for the signed-in player. Everyone else gets a
// stable pseudonym derived from their record id — never an email.
export function displayNameFor(record, myId) {
  const user = record?.expand?.user;
  const uid = record?.user || record?.id;
  if (user) {
    return user.displayName || (uid === myId ? 'You' : `Player ${shortId(uid)}`);
  }
  if (uid && uid === myId) return 'You';
  return `Player ${shortId(uid)}`;
}

export function shortId(id) {
  return String(id || '------').slice(-4).toUpperCase();
}

// ─── misc ─────────────────────────────────────────────────────────────────
/** 6-character league join code, ambiguous glyphs (0/O/1/I) removed. */
export function makeLeagueCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = new Uint32Array(6);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 6; i++) bytes[i] = Math.floor(Math.random() * 0xffffffff);
  }
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/** "2d 04h" / "04h 12m" / "12m 30s" — compact enough for an inline countdown. */
export function formatRemaining(ms) {
  if (ms <= 0) return 'Locked';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${String(h).padStart(2, '0')}h`;
  if (h > 0) return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
  return `${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`;
}

export function formatDateTime(v) {
  const d = parseDate(v);
  if (!d) return '—';
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
