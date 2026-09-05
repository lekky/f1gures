/// <reference path="../pb_data/types.d.ts" />

// Fantasy core reference data: seasons, rounds, entries (the weekend driver
// list) and tiers (the published A/B/C/D cut for a round).
//
// All four are *read-only to the public and writable only by a superuser*
// (the scorer authenticates with a superuser token). That is expressed as
// listRule/viewRule = "" (public) and create/update/deleteRule = null
// (superuser only — `null` in PocketBase means "no one but a superuser").
//
// Idempotent: each collection is created only if it is missing, so the file is
// safe to re-run (PocketBase also records applied migrations in `_migrations`).
migrate(
  (app) => {
    const created = [];

    function ensure(config) {
      try {
        app.findCollectionByNameOrId(config.name);
        return; // already there
      } catch (err) {
        /* not found — create it below */
      }
      app.save(new Collection(config));
      created.push(config.name);
    }

    function idOf(name) {
      return app.findCollectionByNameOrId(name).id;
    }

    const AUTODATE = [
      { type: 'autodate', name: 'created', onCreate: true },
      { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
    ];

    // ---------------------------------------------------------------- seasons
    ensure({
      type: 'base',
      name: 'fantasy_seasons',
      listRule: '',
      viewRule: '',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: 'number', name: 'year', required: true, onlyInt: true },
        {
          type: 'select',
          name: 'status',
          required: true,
          maxSelect: 1,
          values: ['upcoming', 'active', 'finished'],
        },
        { type: 'number', name: 'capDriver', onlyInt: true },
        { type: 'number', name: 'capConstructor', onlyInt: true },
        { type: 'number', name: 'splitLength', onlyInt: true },
        { type: 'number', name: 'tierCount', onlyInt: true },
        { type: 'text', name: 'rulesVersion', max: 20 },
        { type: 'number', name: 'seedYear', onlyInt: true },
      ].concat(AUTODATE),
      indexes: [
        'CREATE UNIQUE INDEX `idx_fantasy_seasons_year` ON `fantasy_seasons` (`year`)',
      ],
    });

    // ----------------------------------------------------------------- rounds
    ensure({
      type: 'base',
      name: 'fantasy_rounds',
      listRule: '',
      viewRule: '',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          type: 'relation',
          name: 'season',
          required: true,
          maxSelect: 1,
          cascadeDelete: true,
          collectionId: idOf('fantasy_seasons'),
        },
        { type: 'number', name: 'round', required: true, onlyInt: true },
        { type: 'text', name: 'name', max: 120, presentable: true },
        { type: 'bool', name: 'isSprint' },
        { type: 'date', name: 'lockAt' },
        { type: 'date', name: 'raceAt' },
        {
          type: 'select',
          name: 'status',
          required: true,
          maxSelect: 1,
          values: ['upcoming', 'locked', 'provisional', 'final'],
        },
        { type: 'date', name: 'finalAt' },
        { type: 'json', name: 'scored', maxSize: 2000000 },
      ].concat(AUTODATE),
      indexes: [
        'CREATE UNIQUE INDEX `idx_fantasy_rounds_season_round` ON `fantasy_rounds` (`season`, `round`)',
        'CREATE INDEX `idx_fantasy_rounds_lockAt` ON `fantasy_rounds` (`lockAt`)',
      ],
    });

    // ---------------------------------------------------------------- entries
    ensure({
      type: 'base',
      name: 'fantasy_entries',
      listRule: '',
      viewRule: '',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          type: 'relation',
          name: 'season',
          required: true,
          maxSelect: 1,
          cascadeDelete: true,
          collectionId: idOf('fantasy_seasons'),
        },
        { type: 'text', name: 'code', required: true, max: 6 },
        { type: 'text', name: 'driverRef', max: 60 },
        { type: 'text', name: 'name', max: 80, presentable: true },
        { type: 'text', name: 'teamId', max: 40 },
        { type: 'text', name: 'teamName', max: 80 },
        { type: 'bool', name: 'active' },
      ].concat(AUTODATE),
      indexes: [
        'CREATE UNIQUE INDEX `idx_fantasy_entries_season_code` ON `fantasy_entries` (`season`, `code`)',
        'CREATE INDEX `idx_fantasy_entries_season_team` ON `fantasy_entries` (`season`, `teamId`)',
      ],
    });

    // ------------------------------------------------------------------ tiers
    ensure({
      type: 'base',
      name: 'fantasy_tiers',
      listRule: '',
      viewRule: '',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          type: 'relation',
          name: 'round',
          required: true,
          maxSelect: 1,
          cascadeDelete: true,
          collectionId: idOf('fantasy_rounds'),
        },
        {
          type: 'relation',
          name: 'entry',
          required: true,
          maxSelect: 1,
          cascadeDelete: true,
          collectionId: idOf('fantasy_entries'),
        },
        {
          type: 'select',
          name: 'tier',
          required: true,
          maxSelect: 1,
          values: ['A', 'B', 'C', 'D'],
        },
        { type: 'number', name: 'rank', onlyInt: true },
        { type: 'number', name: 'avgPts' },
      ].concat(AUTODATE),
      indexes: [
        'CREATE UNIQUE INDEX `idx_fantasy_tiers_round_entry` ON `fantasy_tiers` (`round`, `entry`)',
        'CREATE INDEX `idx_fantasy_tiers_round_tier` ON `fantasy_tiers` (`round`, `tier`)',
      ],
    });
  },
  (app) => {
    // Reverse creation order so relations unwind cleanly.
    const names = [
      'fantasy_tiers',
      'fantasy_entries',
      'fantasy_rounds',
      'fantasy_seasons',
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
