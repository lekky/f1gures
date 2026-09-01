/// <reference path="../pb_data/types.d.ts" />

// Adds `displayName` to the built-in `users` auth collection so the fantasy
// leaderboards have something to render that isn't an email address.
//
// Idempotent: re-running finds the field already present and no-ops.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');

    if (!users.fields.getByName('displayName')) {
      users.fields.add(
        new TextField({
          name: 'displayName',
          max: 40,
          presentable: true,
        })
      );
      app.save(users);
    }
  },
  (app) => {
    let users;
    try {
      users = app.findCollectionByNameOrId('users');
    } catch (err) {
      return; // collection already gone — nothing to revert
    }

    if (users.fields.getByName('displayName')) {
      users.fields.removeByName('displayName');
      app.save(users);
    }
  }
);
