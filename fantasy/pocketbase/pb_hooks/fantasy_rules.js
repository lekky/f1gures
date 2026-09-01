/**
 * Pure pick-validation logic for the f1gures fantasy game (rules v0.2).
 *
 * This file touches NO PocketBase API. It takes a plain "context" object that
 * `fantasy_picks_validate.js` assembles from the database, and returns a list
 * of errors. That split exists so the interesting logic can be unit-tested in
 * Node (`fantasy/pocketbase/hooks.test.js`) instead of only inside Goja.
 *
 * Written in the ES5+ subset PocketBase's JS VM (Goja) accepts: `var`, no
 * arrow functions, no template literals, no destructuring, CommonJS exports.
 */

var SLOTS = ['A', 'B', 'C', 'D'];

/**
 * `own(obj, key)` — plain-object property read that is safe for the key
 * "constructor" (a bare `obj.constructor` inherits `Object` from the
 * prototype, which would silently poison every constructor-slot check).
 */
function own(obj, key) {
  if (!obj) return undefined;
  return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

/** Collection field name backing a slot letter. */
function slotField(slot) {
  return 'driver' + slot;
}

/**
 * Was this slot/entity refunded on a past pick?
 *
 * `refunded` is scorer-written. Three shapes are accepted so the scorer is not
 * boxed in:
 *   - array of slot letters or entry ids/codes:  ["A", "VER"]
 *   - object keyed by slot letter:               { "A": true }
 *   - object keyed by entry id / code:           { "VER": true }
 * Anything else (null, "", garbage) counts as "not refunded".
 */
function isRefunded(refunded, slot, key) {
  if (!refunded) return false;

  if (Object.prototype.toString.call(refunded) === '[object Array]') {
    for (var i = 0; i < refunded.length; i++) {
      var v = refunded[i];
      if (v === slot || (key && v === key)) return true;
    }
    return false;
  }

  if (typeof refunded === 'object') {
    if (own(refunded, slot) === true) return true;
    if (key && own(refunded, key) === true) return true;
  }

  return false;
}

/**
 * Tally how many starts each entry / constructor a user has already spent.
 *
 * @param picks array of plain objects:
 *        { driverA, driverB, driverC, driverD, constructor, refunded }
 *        where the driver values are entry ids ('' / null when the slot was empty)
 * @returns { drivers: {entryId: n}, constructors: {teamId: n} }
 */
function tallyUsage(picks) {
  var drivers = {};
  var constructors = {};

  for (var i = 0; i < picks.length; i++) {
    var p = picks[i] || {};
    var refunded = p.refunded;

    for (var s = 0; s < SLOTS.length; s++) {
      var slot = SLOTS[s];
      var entryId = own(p, slotField(slot));
      if (!entryId) continue;
      if (isRefunded(refunded, slot, entryId)) continue;
      drivers[entryId] = (own(drivers, entryId) || 0) + 1;
    }

    var teamId = own(p, 'constructor');
    if (teamId && !isRefunded(refunded, 'constructor', teamId)) {
      constructors[teamId] = (own(constructors, teamId) || 0) + 1;
    }
  }

  return { drivers: drivers, constructors: constructors };
}

/**
 * Is every entry in `tierEntries` already at the driver cap for this user?
 * An empty tier is never "exhausted" (there is nothing to be blocked by).
 */
function isTierExhausted(tierEntries, usageByEntry, capDriver) {
  if (!tierEntries || !tierEntries.length) return false;
  if (!(capDriver > 0)) return false;

  for (var i = 0; i < tierEntries.length; i++) {
    var id = tierEntries[i];
    if ((own(usageByEntry, id) || 0) < capDriver) return false;
  }
  return true;
}

function label(slotCtx, slot) {
  if (slotCtx && slotCtx.name) return slotCtx.name;
  if (slotCtx && slotCtx.code) return slotCtx.code;
  return 'the slot ' + slot + ' driver';
}

/**
 * The five contract checks.
 *
 * ctx = {
 *   now:   <ms>,
 *   round: { number: 4, lockAt: <ms|null> },
 *   caps:  { driver: 5, constructor: 4 },
 *   boost: 'C' | 'D' | '' ,
 *   protectedFields: ['carriedForward', 'refunded'],   // keys the CLIENT sent
 *   constructor: { teamId: 'mclaren', usage: 2 },      // teamId '' when unset
 *   slots: {
 *     A: { entryId, code, name, tier, usage, emergency, tierExhausted },
 *     ... B, C, D (a slot may be null/absent = left empty)
 *   }
 * }
 *
 * @returns { ok: bool, errors: [{ slot, field, code, message }] }
 */
function validatePickSubmission(ctx) {
  var errors = [];

  function fail(slot, field, code, message) {
    errors.push({ slot: slot, field: field, code: code, message: message });
  }

  var caps = ctx.caps || {};
  var round = ctx.round || {};
  var roundLabel = round.number ? 'Round ' + round.number : 'This round';

  // ---------------------------------------------------------------- 1. lock
  // A locked round is fatal on its own — nothing else about the submission
  // matters, so return immediately with a single clear message.
  if (round.lockAt !== null && round.lockAt !== undefined && ctx.now >= round.lockAt) {
    fail(
      'round',
      'round',
      'lockPassed',
      roundLabel + ' is locked — picks closed at the start of qualifying.'
    );
    return { ok: false, errors: errors };
  }

  // ------------------------------------------------- 5. scorer-only fields
  // Checked early so a client poking at them always hears about it.
  var protectedFields = ctx.protectedFields || [];
  for (var p = 0; p < protectedFields.length; p++) {
    fail(
      null,
      protectedFields[p],
      'readOnlyField',
      '"' + protectedFields[p] + '" is set by the scorer and cannot be submitted.'
    );
  }

  // --------------------------------------------------------------- 4. boost
  var boost = ctx.boost;
  if (boost && boost !== 'C' && boost !== 'D') {
    fail(
      'boost',
      'boost',
      'invalidBoostSlot',
      'Boost must be on your Tier C or Tier D driver (got "' + boost + '").'
    );
  }

  // ------------------------------------------------- 2 + 3. per-slot checks
  var slots = ctx.slots || {};

  for (var i = 0; i < SLOTS.length; i++) {
    var slot = SLOTS[i];
    var s = slots[slot];
    var field = slotField(slot);

    // An empty slot is legal (carry-forward may leave one blank; it scores 0).
    if (!s || !s.entryId) continue;

    var who = label(s, slot);

    // --- 2. tier match ----------------------------------------------------
    if (!s.tier) {
      fail(
        slot,
        field,
        'noTier',
        who +
          ' has no published tier for ' +
          (round.number ? 'round ' + round.number : 'this round') +
          ', so they cannot be used in slot ' +
          slot +
          '.'
      );
      continue; // usage checks are meaningless without a tier
    }

    if (s.tier !== slot) {
      fail(
        slot,
        field,
        'wrongTier',
        who + ' is a Tier ' + s.tier + ' driver this round — slot ' + slot + ' needs a Tier ' + slot + ' driver.'
      );
      continue;
    }

    // --- 3. usage cap -----------------------------------------------------
    var cap = caps.driver;
    var usage = s.usage || 0;
    var emergency = s.emergency === true;

    if (!(cap > 0)) continue; // no cap configured — nothing to enforce

    if (usage >= cap) {
      if (!emergency) {
        fail(
          slot,
          field,
          'capReached',
          'You have already started ' +
            who +
            ' ' +
            usage +
            ' time' +
            (usage === 1 ? '' : 's') +
            ' this season (cap ' +
            cap +
            '). Pick another Tier ' +
            slot +
            ' driver, or use an emergency pick if every Tier ' +
            slot +
            ' driver is capped.'
        );
      } else if (!s.tierExhausted) {
        fail(
          slot,
          field,
          'emergencyNotAvailable',
          'Emergency pick not available in slot ' +
            slot +
            ': you still have starts left on other Tier ' +
            slot +
            ' drivers, so ' +
            who +
            ' cannot be played at half points.'
        );
      }
      // usage >= cap + emergency + tier exhausted => legal (scores x0.5)
    } else if (emergency) {
      // Guard against a client halving its own score for no reason. The
      // engine's validatePicks rejects this too — keep the wording in step.
      var left = cap - usage;
      fail(
        slot,
        field,
        'emergencyNotNeeded',
        'Emergency pick not allowed: ' +
          (s.code || who) +
          ' has ' +
          left +
          ' start' +
          (left === 1 ? '' : 's') +
          ' left (slot ' +
          slot +
          ').'
      );
    }
  }

  // --------------------------------------------- 3b. constructor usage cap
  var con = own(ctx, 'constructor') || {};
  var capConstructor = own(caps, 'constructor');
  if (con.teamId && capConstructor > 0) {
    var cUsage = con.usage || 0;
    if (cUsage >= capConstructor) {
      fail(
        'constructor',
        'constructor',
        'capReached',
        'You have already started ' +
          (con.name || con.teamId) +
          ' ' +
          cUsage +
          ' time' +
          (cUsage === 1 ? '' : 's') +
          ' this season (cap ' +
          capConstructor +
          '). Pick a different constructor.'
      );
    }
  }

  return { ok: errors.length === 0, errors: errors };
}

/**
 * Map the error list to the ApiError `data` payload — field name -> detail.
 *
 * NOTE: PocketBase normalises whatever it is handed here into its own
 * `{code: "validation_invalid_value", message: "Invalid value."}` shape, so
 * the *keys* are what survives and matter (they tell a client which inputs to
 * highlight). The human reason lives in the top-level message from
 * `summarise()` — see README, "Error shape".
 */
function toFieldErrors(errors) {
  var out = {};
  for (var i = 0; i < errors.length; i++) {
    var e = errors[i];
    var key = e.field || e.slot || 'pick';
    if (own(out, key) === undefined) out[key] = { code: e.code, message: e.message };
  }
  return out;
}

/**
 * Top-level ApiError message. Every reason is included — a lineup can fail
 * several checks at once and the player needs to see all of them, not just
 * the first.
 */
function summarise(errors) {
  if (!errors.length) return 'Invalid pick.';
  if (errors.length === 1) return errors[0].message;

  var parts = [];
  for (var i = 0; i < errors.length; i++) parts.push(errors[i].message);
  return parts.join(' · ');
}

module.exports = {
  SLOTS: SLOTS,
  own: own,
  slotField: slotField,
  isRefunded: isRefunded,
  tallyUsage: tallyUsage,
  isTierExhausted: isTierExhausted,
  validatePickSubmission: validatePickSubmission,
  toFieldErrors: toFieldErrors,
  summarise: summarise,
};
