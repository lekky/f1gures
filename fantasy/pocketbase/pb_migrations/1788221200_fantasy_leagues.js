/// <reference path="../pb_data/types.d.ts" />

// Private leagues (rulebook §10): a name, a 6-character join code, an owner,
// and a membership join table.
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

    const usersId = app.findCollectionByNameOrId('users').id;

    const AUTODATE = [
      { type: 'autodate', name: 'created', onCreate: true },
      { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
    ];

    ensure({
      type: 'base',
      name: 'fantasy_leagues',
      listRule: '',
      viewRule: '',
      // Authenticated users may create a league, but only one they own —
      // without the `owner` clause anyone could plant a league on someone
      // else's account (see README "Deviations from the contract").
      createRule: '@request.auth.id != "" && owner = @request.auth.id',
      updateRule: 'owner = @request.auth.id',
      deleteRule: 'owner = @request.auth.id',
      fields: [
        { type: 'text', name: 'name', required: true, max: 40, presentable: true },
        { type: 'text', name: 'code', required: true, min: 6, max: 6 },
        {
          type: 'relation',
          name: 'owner',
          required: true,
          maxSelect: 1,
          cascadeDelete: true,
          collectionId: usersId,
        },
      ].concat(AUTODATE),
      indexes: [
        'CREATE UNIQUE INDEX `idx_fantasy_leagues_code` ON `fantasy_leagues` (`code`)',
      ],
    });

    const leaguesId = app.findCollectionByNameOrId('fantasy_leagues').id;

    ensure({
      type: 'base',
      name: 'fantasy_league_members',
      listRule: '',
      viewRule: '',
      createRule: 'user = @request.auth.id',
      updateRule: null,
      deleteRule: 'user = @request.auth.id || league.owner = @request.auth.id',
      fields: [
        {
          type: 'relation',
          name: 'league',
          required: true,
          maxSelect: 1,
          cascadeDelete: true,
          collectionId: leaguesId,
        },
        {
          type: 'relation',
          name: 'user',
          required: true,
          maxSelect: 1,
          cascadeDelete: true,
          collectionId: usersId,
        },
      ].concat(AUTODATE),
      indexes: [
        'CREATE UNIQUE INDEX `idx_fantasy_league_members` ON `fantasy_league_members` (`league`, `user`)',
      ],
    });
  },
  (app) => {
    const names = ['fantasy_league_members', 'fantasy_leagues'];

    for (let i = 0; i < names.length; i++) {
      try {
        app.delete(app.findCollectionByNameOrId(names[i]));
      } catch (err) {
        /* already gone */
      }
    }
  }
);
