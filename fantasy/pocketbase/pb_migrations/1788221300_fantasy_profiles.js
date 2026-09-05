/// <reference path="../pb_data/types.d.ts" />

// A public, read-only projection of `users` exposing ONLY id + displayName.
//
// Why it exists: `users` keeps the default auth viewRule (`id = @request.auth.id`),
// so `?expand=user` on a standings or pick-scores row resolves for the signed-in
// player and nobody else — leaderboards would show one real name and a column of
// blanks. Loosening the `users` rule would leak email, verified and the auth
// timestamps along with it.
//
// A view collection is the right shape here: PocketBase derives its fields from
// the SELECT, so email/verified/tokenKey are not merely hidden, they are not in
// the collection at all. View collections are inherently read-only — PocketBase
// rejects create/update/delete rules on them — so there is nothing to lock down
// beyond the two read rules.
//
// Frontend joins on `fantasy_standings.user` / `fantasy_pick_scores.user`, which
// hold the same ids.
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('fantasy_profiles');
      return; // already there
    } catch (err) {
      /* create below */
    }

    app.save(
      new Collection({
        type: 'view',
        name: 'fantasy_profiles',
        listRule: '',
        viewRule: '',
        viewQuery: 'SELECT id, displayName FROM users',
      })
    );
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('fantasy_profiles'));
    } catch (err) {
      /* already gone */
    }
  }
);
