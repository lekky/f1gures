/// <reference path="../pb_data/types.d.ts" />

/**
 * fantasy_picks validation hook (rules v0.2).
 *
 * Enforces, on every request-originated create/update of a pick:
 *   1. the round has not locked yet;
 *   2. each driver slot holds an entry whose published tier for that round
 *      matches the slot letter (A/B/C/D);
 *   3. season usage caps — with the emergency-pick escape hatch, which is only
 *      legal when every driver in that tier is already at the player's cap;
 *   4. boost is on the Tier C or Tier D slot (defaults to D when omitted);
 *   5. `carriedForward` and `refunded` are never client-settable (scorer-only).
 *
 * Requests authenticated as a superuser (i.e. the scorer) bypass all of it —
 * carry-forward and refunds are exactly the writes this hook must not block.
 *
 * NOTE ON SCOPE: PocketBase serialises each handler and runs it in its own
 * Goja context, so a handler CANNOT close over module-level variables. Every
 * dependency has to be `require`d inside the function body.
 */

onRecordCreateRequest(function (e) {
  require(__hooks + '/fantasy_picks_validate.js').validatePickRequest(e);
  e.next();
}, 'fantasy_picks');

onRecordUpdateRequest(function (e) {
  require(__hooks + '/fantasy_picks_validate.js').validatePickRequest(e);
  e.next();
}, 'fantasy_picks');
