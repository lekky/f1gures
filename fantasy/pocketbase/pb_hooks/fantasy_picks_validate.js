/// <reference path="../pb_data/types.d.ts" />

/**
 * PocketBase-aware half of the fantasy_picks validation.
 *
 * Reads everything the check needs out of the database, flattens it into a
 * plain context object, and hands that to the pure logic in
 * `fantasy_rules.js`. On failure it throws a 400 with per-field messages.
 *
 * NOT auto-loaded (no `.pb.js` suffix) — `fantasy_picks.pb.js` requires it.
 * Goja/ES5+ subset: `var`, no arrows, no template literals, CommonJS.
 */

var MAX_PRIOR_PICKS = 100; // a season is <= 24 rounds; 100 is a safe ceiling
var MAX_TIER_ROWS = 200; // <= ~24 entries per round

/** Relation values come back as a string (maxSelect 1) or an array. */
function relId(record, field) {
  var v = record.get(field);
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Array]') {
    return v.length ? String(v[0]) : '';
  }
  return String(v);
}

/** JSON fields come back as types.JSONRaw; normalise to a JS value. */
function jsonVal(record, field) {
  var v;
  try {
    v = record.get(field);
  } catch (err) {
    return null;
  }
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'object' && typeof v.string !== 'function') return v;

  var raw;
  if (typeof v === 'string') raw = v;
  else if (typeof v.string === 'function') raw = v.string();
  else raw = String(v);

  if (!raw || raw === 'null') return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

/** DateTime field -> epoch ms, or null when unset. */
function dateMs(record, field) {
  var v;
  try {
    v = record.get(field);
  } catch (err) {
    return null;
  }
  if (!v) return null;

  var s = typeof v === 'string' ? v : typeof v.string === 'function' ? v.string() : String(v);
  if (!s) return null;

  // PocketBase serialises as "2026-03-06 14:00:00.000Z"
  var iso = s.replace(' ', 'T');
  var ms = Date.parse(iso);
  return isNaN(ms) ? null : ms;
}

/** The scorer authenticates as a superuser; it is allowed to write anything. */
function isSuperuser(e) {
  try {
    if (typeof e.hasSuperuserAuth === 'function' && e.hasSuperuserAuth()) return true;
  } catch (err) {
    /* fall through */
  }
  try {
    if (e.auth && e.auth.collection().name === '_superusers') return true;
  } catch (err) {
    /* fall through */
  }
  return false;
}

/** Raw request body keys, so we can spot client-set scorer-only fields. */
function requestBody(e) {
  try {
    var info = e.requestInfo();
    return (info && info.body) || {};
  } catch (err) {
    return {};
  }
}

function validatePickRequest(e) {
  var rules = require(__hooks + '/fantasy_rules.js');

  // The scorer (superuser token) writes carriedForward / refunded / lineups for
  // already-locked rounds. Everything below is player-facing validation.
  if (isSuperuser(e)) return;

  var app = e.app || $app;
  var rec = e.record;
  var now = Date.now();

  // ---------------------------------------------------------------- round
  var roundId = relId(rec, 'round');
  if (!roundId) {
    throw new BadRequestError('A pick must name a round.', {
      round: { code: 'missingRound', message: 'A pick must name a round.' },
    });
  }

  var round;
  try {
    round = app.findRecordById('fantasy_rounds', roundId);
  } catch (err) {
    throw new BadRequestError('Unknown round.', {
      round: { code: 'unknownRound', message: 'That round does not exist.' },
    });
  }

  var seasonId = relId(round, 'season');
  var season = null;
  try {
    season = app.findRecordById('fantasy_seasons', seasonId);
  } catch (err) {
    /* caps stay unset -> cap checks skipped */
  }

  var caps = {
    driver: season ? season.getInt('capDriver') : 0,
    constructor: season ? season.getInt('capConstructor') : 0,
  };

  // ---------------------------------------------------- tiers for the round
  var tierRows = app.findRecordsByFilter(
    'fantasy_tiers',
    'round = {:round}',
    'rank',
    MAX_TIER_ROWS,
    0,
    { round: roundId }
  );

  var tierByEntry = {}; // entryId -> 'A'|'B'|'C'|'D'
  var entriesByTier = { A: [], B: [], C: [], D: [] };
  for (var t = 0; t < tierRows.length; t++) {
    var eid = relId(tierRows[t], 'entry');
    var letter = tierRows[t].getString('tier');
    if (!eid || !letter) continue;
    tierByEntry[eid] = letter;
    if (entriesByTier[letter]) entriesByTier[letter].push(eid);
  }

  // ------------------------------------------- the user's spent starts
  // Every pick this user has made in a round of the same season that has
  // already locked. `@now` is a PocketBase filter macro, so no param needed.
  var userId = relId(rec, 'user');
  var priorRecords = [];
  if (userId && seasonId) {
    priorRecords = app.findRecordsByFilter(
      'fantasy_picks',
      'user = {:user} && round.season = {:season} && round.lockAt < @now && id != {:self}',
      '-created',
      MAX_PRIOR_PICKS,
      0,
      { user: userId, season: seasonId, self: rec.id || '__none__' }
    );
  }

  var priorPicks = [];
  for (var i = 0; i < priorRecords.length; i++) {
    var pr = priorRecords[i];
    priorPicks.push({
      driverA: relId(pr, 'driverA'),
      driverB: relId(pr, 'driverB'),
      driverC: relId(pr, 'driverC'),
      driverD: relId(pr, 'driverD'),
      constructor: pr.getString('constructor'),
      refunded: jsonVal(pr, 'refunded'),
    });
  }

  var usage = rules.tallyUsage(priorPicks);

  // ------------------------------------------------------------ this pick
  var emergency = jsonVal(rec, 'emergency') || {};
  var slots = {};

  for (var s = 0; s < rules.SLOTS.length; s++) {
    var slot = rules.SLOTS[s];
    var entryId = relId(rec, rules.slotField(slot));
    if (!entryId) {
      slots[slot] = null;
      continue;
    }

    var name = '';
    var code = '';
    try {
      var entry = app.findRecordById('fantasy_entries', entryId);
      name = entry.getString('name');
      code = entry.getString('code');
    } catch (err) {
      /* unknown entry — the relation field validator will catch it */
    }

    var tier = rules.own(tierByEntry, entryId) || null;

    slots[slot] = {
      entryId: entryId,
      code: code,
      name: name || code,
      tier: tier,
      usage: rules.own(usage.drivers, entryId) || 0,
      emergency: rules.own(emergency, slot) === true,
      tierExhausted: rules.isTierExhausted(
        entriesByTier[slot] || [],
        usage.drivers,
        caps.driver
      ),
    };
  }

  // ------------------------------------------------- scorer-only fields
  var body = requestBody(e);
  var protectedFields = [];
  if (Object.prototype.hasOwnProperty.call(body, 'carriedForward')) {
    protectedFields.push('carriedForward');
  }
  if (Object.prototype.hasOwnProperty.call(body, 'refunded')) {
    protectedFields.push('refunded');
  }

  // ------------------------------------------------------ boost default
  var boost = rec.getString('boost');
  if (!boost) {
    // Rulebook §2: "If you don't choose, the Boost defaults to your Tier D driver."
    boost = 'D';
    rec.set('boost', 'D');
  }

  // ----------------------------------------------------------- validate
  var teamId = rec.getString('constructor');
  var ctx = {
    now: now,
    round: { number: round.getInt('round'), lockAt: dateMs(round, 'lockAt') },
    caps: caps,
    boost: boost,
    protectedFields: protectedFields,
    slots: slots,
  };
  ctx['constructor'] = {
    teamId: teamId,
    usage: rules.own(usage.constructors, teamId) || 0,
  };

  var result = rules.validatePickSubmission(ctx);
  if (!result.ok) {
    throw new BadRequestError(
      rules.summarise(result.errors),
      rules.toFieldErrors(result.errors)
    );
  }
}

module.exports = {
  validatePickRequest: validatePickRequest,
  // exported for ad-hoc debugging from other hooks
  relId: relId,
  jsonVal: jsonVal,
  dateMs: dateMs,
};
