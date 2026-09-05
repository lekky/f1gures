/// <reference path="../pb_data/types.d.ts" />

// Everything the scorer writes and the site reads: per-entry round scores,
// per-constructor round scores, per-user weekend totals, and the season /
// split standings.
//
// All public-read, superuser-write (createRule/updateRule/deleteRule = null).
migrate(
  (app) => {
    function ensure(config) {
      try {
        app.findCollectionByNameOrId(config.name);
        return;
      } catch (err) {
        /* create below */
      }
      app.save(new Collection(config));
    }

    const seasonsId = app.findCollectionByNameOrId('fantasy_seasons').id;
    const roundsId = app.findCollectionByNameOrId('fantasy_rounds').id;
    const entriesId = app.findCollectionByNameOrId('fantasy_entries').id;
    const usersId = app.findCollectionByNameOrId('users').id;

    const AUTODATE = [
      { type: 'autodate', name: 'created', onCreate: true },
      { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
    ];

    const PUBLIC_READ = {
      listRule: '',
      viewRule: '',
      createRule: null,
      updateRule: null,
      deleteRule: null,
    };

    function rel(name, collectionId) {
      return {
        type: 'relation',
        name: name,
        required: true,
        maxSelect: 1,
        cascadeDelete: true,
        collectionId: collectionId,
      };
    }

    // --------------------------------------------- per-entry round scores
    ensure(
      Object.assign({ type: 'base', name: 'fantasy_scores' }, PUBLIC_READ, {
        fields: [
          rel('round', roundsId),
          rel('entry', entriesId),
          // { race, quali, gained, laps, form, teammate, fastestLap, sprint, classified }
          { type: 'json', name: 'components', maxSize: 20000 },
          { type: 'number', name: 'total' },
        ].concat(AUTODATE),
        indexes: [
          'CREATE UNIQUE INDEX `idx_fantasy_scores_round_entry` ON `fantasy_scores` (`round`, `entry`)',
        ],
      })
    );

    // ---------------------------------------- per-constructor round scores
    ensure(
      Object.assign(
        { type: 'base', name: 'fantasy_constructor_scores' },
        PUBLIC_READ,
        {
          fields: [
            rel('round', roundsId),
            { type: 'text', name: 'teamId', required: true, max: 40 },
            { type: 'number', name: 'total' },
          ].concat(AUTODATE),
          indexes: [
            'CREATE UNIQUE INDEX `idx_fantasy_cscores_round_team` ON `fantasy_constructor_scores` (`round`, `teamId`)',
          ],
        }
      )
    );

    // ------------------------------------------- per-user weekend totals
    ensure(
      Object.assign({ type: 'base', name: 'fantasy_pick_scores' }, PUBLIC_READ, {
        fields: [
          rel('user', usersId),
          rel('round', roundsId),
          // { A:{code,base,final}, ..., constructor:{teamId,total} }
          { type: 'json', name: 'breakdown', maxSize: 20000 },
          { type: 'number', name: 'total' },
        ].concat(AUTODATE),
        indexes: [
          'CREATE UNIQUE INDEX `idx_fantasy_pick_scores_user_round` ON `fantasy_pick_scores` (`user`, `round`)',
          'CREATE INDEX `idx_fantasy_pick_scores_round_total` ON `fantasy_pick_scores` (`round`, `total`)',
        ],
      })
    );

    // ------------------------------------------------------- standings
    // scope is "season" or "split-1", "split-2", ... (rulebook §11).
    ensure(
      Object.assign({ type: 'base', name: 'fantasy_standings' }, PUBLIC_READ, {
        fields: [
          rel('season', seasonsId),
          { type: 'text', name: 'scope', required: true, max: 20 },
          rel('user', usersId),
          { type: 'number', name: 'points' },
          { type: 'number', name: 'bestWeekend' },
          { type: 'number', name: 'weeksTop', onlyInt: true },
          { type: 'number', name: 'splitWins', onlyInt: true },
        ].concat(AUTODATE),
        indexes: [
          'CREATE UNIQUE INDEX `idx_fantasy_standings_season_scope_user` ON `fantasy_standings` (`season`, `scope`, `user`)',
          'CREATE INDEX `idx_fantasy_standings_scope_points` ON `fantasy_standings` (`season`, `scope`, `points`)',
        ],
      })
    );
  },
  (app) => {
    const names = [
      'fantasy_standings',
      'fantasy_pick_scores',
      'fantasy_constructor_scores',
      'fantasy_scores',
    ];

    for (let i = 0; i < names.length; i++) {
      try {
        app.delete(app.findCollectionByNameOrId(names[i]));
      } catch (err) {
        /* already gone */
      }
    }
  }
);
