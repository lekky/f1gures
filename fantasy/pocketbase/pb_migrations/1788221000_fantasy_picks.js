/// <reference path="../pb_data/types.d.ts" />

// The player-writable collection: one pick row per (user, round).
//
// API rules (from the build contract):
//   list/view : own row always, everyone else's only once the round has locked
//   create    : verified, authenticated, for yourself, before the lock
//   update/del: your own row, before the lock
//
// The heavy validation (tier match, usage caps, emergency picks, boost slot,
// scorer-only fields) lives in `pb_hooks/fantasy_picks.pb.js` — rules alone
// cannot express it.
//
// The four driver slots are deliberately NOT required: rulebook §5
// carry-forward says "a slot that can't legally carry over stays empty and
// scores 0", so the scorer needs to be able to write a partial lineup.
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('fantasy_picks');
      return; // already there
    } catch (err) {
      /* create below */
    }

    const roundsId = app.findCollectionByNameOrId('fantasy_rounds').id;
    const entriesId = app.findCollectionByNameOrId('fantasy_entries').id;
    const usersId = app.findCollectionByNameOrId('users').id;

    function driverSlot(letter) {
      return {
        type: 'relation',
        name: 'driver' + letter,
        required: false,
        maxSelect: 1,
        cascadeDelete: false,
        collectionId: entriesId,
      };
    }

    app.save(
      new Collection({
        type: 'base',
        name: 'fantasy_picks',

        listRule: 'user = @request.auth.id || round.lockAt < @now',
        viewRule: 'user = @request.auth.id || round.lockAt < @now',
        createRule:
          '@request.auth.id != "" && @request.auth.verified = true && user = @request.auth.id && round.lockAt > @now',
        updateRule: 'user = @request.auth.id && round.lockAt > @now',
        deleteRule: 'user = @request.auth.id && round.lockAt > @now',

        fields: [
          {
            type: 'relation',
            name: 'user',
            required: true,
            maxSelect: 1,
            cascadeDelete: true,
            collectionId: usersId,
          },
          {
            type: 'relation',
            name: 'round',
            required: true,
            maxSelect: 1,
            cascadeDelete: true,
            collectionId: roundsId,
          },
          driverSlot('A'),
          driverSlot('B'),
          driverSlot('C'),
          driverSlot('D'),
          // teamId string rather than a relation: constructors live in the
          // season bundle, not in a PocketBase collection.
          { type: 'text', name: 'constructor', max: 40 },
          // "default D" is applied by the hook when the client leaves it blank
          // (PocketBase select fields have no default-value setting).
          { type: 'select', name: 'boost', maxSelect: 1, values: ['C', 'D'] },
          // { "A": true, "C": true } — slots played as emergency picks.
          { type: 'json', name: 'emergency', maxSize: 2000 },
          // scorer-only, rejected when a client sends them:
          { type: 'bool', name: 'carriedForward' },
          { type: 'json', name: 'refunded', maxSize: 2000 },
          { type: 'autodate', name: 'created', onCreate: true },
          { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
        ],

        indexes: [
          'CREATE UNIQUE INDEX `idx_fantasy_picks_user_round` ON `fantasy_picks` (`user`, `round`)',
          'CREATE INDEX `idx_fantasy_picks_round` ON `fantasy_picks` (`round`)',
        ],
      })
    );
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('fantasy_picks'));
    } catch (err) {
      /* already gone */
    }
  }
);
