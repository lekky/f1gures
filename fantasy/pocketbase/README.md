# f1gures fantasy — PocketBase backend

The database, auth and API for the fantasy game. A single Go binary with an
embedded SQLite file: no separate database server, no ORM, no containers
required for local work.

```
f1gures.app (static Astro)  ──REST──►  PocketBase  ◄──superuser token──  fantasy/scorer
   /fantasy/* islands                  (this dir)                        (nightly + post-race)
```

Everything the server needs lives in this folder and is committed:

| Path | What it is |
|---|---|
| `pb_migrations/*.js` | JS migrations — every `fantasy_*` collection, its fields, unique indexes and API rules. Applied automatically on boot. |
| `pb_hooks/fantasy_picks.pb.js` | The pick-validation hook (auto-loaded; `.pb.js` suffix is what makes it an entrypoint). |
| `pb_hooks/fantasy_picks_validate.js` | Database-facing half of that hook. Required by the entrypoint, not auto-loaded. |
| `pb_hooks/fantasy_rules.js` | Pure rule logic, no PocketBase API. Unit-tested from Node. |
| `dev.ps1` / `dev.sh` | Fetch the pinned binary, migrate, make a dev superuser, serve. |
| `seed-dev.mjs` | Dependency-free dev seeder. |
| `hooks.test.js` | vitest unit tests for `fantasy_rules.js`. |
| `bin/`, `pb_data/` | **gitignored** — the downloaded binary and the local SQLite database. |

**Pinned version: PocketBase v0.40.1** (released 2026-08-24).
`https://github.com/pocketbase/pocketbase/releases/download/v0.40.1/pocketbase_0.40.1_windows_amd64.zip`
(and `..._linux_amd64.zip` for the VPS). To move, bump `$PbVersion` in `dev.ps1`,
`PB_VERSION` in `dev.sh` and the Coolify image tag together. PocketBase's API
changed substantially at v0.23 (superusers replaced admins, request hooks were
renamed) — everything here is written for the post-0.23 API and will not run on
older releases.

---

## Local development

```powershell
cd fantasy/pocketbase
.\dev.ps1                       # downloads v0.40.1 -> ./bin, migrates, serves :8090
```

```bash
cd fantasy/pocketbase
./dev.sh                        # same, Linux/macOS
```

Then, in a second terminal:

```powershell
node seed-dev.mjs               # season 2026, 5 rounds, 20 entries, tiers, 2 users
```

- Dashboard: <http://127.0.0.1:8090/_/> — superuser `dev@f1gures.local` / `fantasy-dev-1234`
- Test players: `fantasy1@example.com` / `fantasy2@example.com`, password `fantasy-dev-1234`, both **verified** (the picks create rule requires it)

Useful flags: `.\dev.ps1 -Reset` wipes `pb_data/` for a clean migrate;
`.\dev.ps1 -NoServe` migrates and exits; `.\dev.ps1 -Port 8791` if 8090 is taken
(pass `PORT=8791 ./dev.sh` on Unix). `node seed-dev.mjs --reset` clears the
`fantasy_*` rows before re-seeding but **deliberately leaves `users` alone**, so
accounts anyone is mid-test with survive; use `-Reset` on `dev.ps1` to drop the
database entirely. All of `PB_URL`, `PB_SUPERUSER_EMAIL` and
`PB_SUPERUSER_PASSWORD` are honoured by the seeder.

`dev.ps1`/`dev.sh` pass absolute `--dir` / `--migrationsDir` / `--hooksDir`
deliberately: PocketBase resolves relative paths against the **binary's**
directory, which is `./bin` here, not the project root.

> `--hooksWatch` has no effect on Windows. After editing anything in `pb_hooks/`
> you must restart the server.

### Running the tests

```
npm test -- --run fantasy/pocketbase/hooks.test.js
```

The repo-root `vitest.config.js` has no `include` override, so vitest's default
glob picks this file up with no extra configuration — it also runs as part of a
plain `npm test`.

---

## Data model

All collections are prefixed `fantasy_`. `users` is PocketBase's built-in auth
collection, with a `displayName` text field added by the first migration.

| Collection | Key fields | Unique on |
|---|---|---|
| `fantasy_seasons` | `year` `status` `capDriver` `capConstructor` `splitLength` `tierCount` `rulesVersion` `seedYear` | `year` |
| `fantasy_rounds` | `season` `round` `name` `isSprint` `lockAt` `raceAt` `status` `finalAt` `scored` | `(season, round)` |
| `fantasy_entries` | `season` `code` `driverRef` `name` `teamId` `teamName` `active` | `(season, code)` |
| `fantasy_tiers` | `round` `entry` `tier` `rank` `avgPts` | `(round, entry)` |
| `fantasy_picks` | `user` `round` `driverA..D` `constructor` `boost` `emergency` `carriedForward` `refunded` | `(user, round)` |
| `fantasy_scores` | `round` `entry` `components` `total` | `(round, entry)` |
| `fantasy_constructor_scores` | `round` `teamId` `total` | `(round, teamId)` |
| `fantasy_pick_scores` | `user` `round` `breakdown` `total` | `(user, round)` |
| `fantasy_standings` | `season` `scope` `user` `points` `bestWeekend` `weeksTop` `splitWins` | `(season, scope, user)` |
| `fantasy_leagues` | `name` `code` `owner` | `code` |
| `fantasy_league_members` | `league` `user` | `(league, user)` |
| `fantasy_profiles` | *(view)* `id` `displayName` | — |

Notes worth knowing before you build against it:

- **`constructor` is a `teamId` string, not a relation.** Constructors live in
  the season bundle (`public/data/<year>.json`), not in PocketBase. Use that
  bundle's `teams[].id` vocabulary verbatim — `alpine`, `aston`, `audi`,
  `cadillac`, `ferrari`, `haas`, `mclaren`, `mercedes`, `rb`, `redbull`,
  `williams` for 2026. It is what the scorer writes, so an invented id (e.g.
  `red_bull`, `sauber`) produces picks that silently score zero. `seed-dev.mjs`
  mirrors the bundle, driver→team pairings included.
- **`driverA..D` are optional.** Rulebook §5 carry-forward: "a slot that can't
  legally carry over stays empty and scores 0", so the scorer must be able to
  write a partial lineup.
- **`boost` has no stored default** (PocketBase select fields don't have one).
  The hook writes `D` when a client omits it — rulebook §2.
- **`refunded`** is scorer-written and accepts three shapes: an array of slot
  letters or entry ids (`["A","<entryId>"]`), an object keyed by slot
  (`{"A":true}`), or an object keyed by entry id. `"constructor"` is a valid key
  for the void-race case.
- **`scope`** on standings is `"season"` or `"split-1"`, `"split-2"`, … (§11).
- Every relation cascades on delete, so removing a season removes its rounds,
  entries, tiers, picks and scores with it.

### Showing other players' names: `fantasy_profiles`

`users` keeps the default auth `viewRule` of `id = @request.auth.id`, so
`?expand=user` on a standings or pick-scores row resolves **only for the
signed-in player** — a leaderboard built that way shows one real name and a
column of blanks. Do not loosen the `users` rule to fix this: it would publish
email, `verified` and the auth timestamps along with the name.

Read names from the `fantasy_profiles` **view collection** instead. Its fields
are derived from `SELECT id, displayName FROM users`, so email and friends are
not hidden-but-present, they are not in the collection at all. Both read rules
are `""` (public); view collections are read-only by construction, so there is
nothing else to lock down.

```js
const profiles = await pb.collection('fantasy_profiles').getFullList();
const nameById = new Map(profiles.map((p) => [p.id, p.displayName]));
// join against fantasy_standings.user / fantasy_pick_scores.user
```

Ids match `users.id`, so it also works as `?expand=` fodder wherever a relation
points at `fantasy_profiles`.

### API rules

Reference data (`seasons`, `rounds`, `entries`, `tiers`, `scores`,
`constructor_scores`, `pick_scores`, `standings`) is **public-read,
superuser-write** — `listRule`/`viewRule` are `""`, and create/update/delete are
`null`, which in PocketBase means "nobody except a superuser". The scorer holds
the only superuser token.

`fantasy_picks`:

```
list/view  user = @request.auth.id || round.lockAt < @now
create     @request.auth.id != "" && @request.auth.verified = true
           && user = @request.auth.id && round.lockAt > @now
update/del user = @request.auth.id && round.lockAt > @now
```

That is rulebook §5 and §10 in one place: your own picks are yours to see and
edit until the lock; everyone else's become visible the moment the round locks.

`fantasy_leagues`: public read, `owner = @request.auth.id` to create, update or
delete. `fantasy_league_members`: public read, `user = @request.auth.id` to
join, `user = @request.auth.id || league.owner = @request.auth.id` to leave or
be removed.

---

## The picks hook

`pb_hooks/fantasy_picks.pb.js` registers two handlers:

```js
onRecordCreateRequest(fn, 'fantasy_picks')
onRecordUpdateRequest(fn, 'fantasy_picks')
```

Both are request-scoped, so nothing the scorer does through the Go/DB layer
triggers them, and a request carrying a **superuser** token skips validation
entirely — carry-forward and refunds are exactly the writes the hook must not
block. The five checks, in order:

1. **Lock.** `round.lockAt` must still be in the future. Fatal on its own — no
   other error is reported alongside it.
2. **Tier match.** Each non-empty slot's entry must have a `fantasy_tiers` row
   for that round whose `tier` equals the slot letter. An entry with no tier row
   is rejected too.
3. **Usage caps.** Counts the user's picks in already-locked rounds of the same
   season where that entry occupies any slot and `refunded` doesn't list it. At
   or over `season.capDriver`, the pick is legal only when `emergency[slot]` is
   `true` **and** every entry in that tier is likewise at cap. Constructors use
   `capConstructor` and have no emergency escape hatch (with 10+ teams a legal
   pick always exists).
4. **Boost** must be `C` or `D`; blank is defaulted to `D`.
5. **`carriedForward` / `refunded`** are rejected if present in the request body
   at all — they are scorer-only.

### Error shape

```json
{
  "status": 400,
  "message": "Lewis Hamilton is a Tier B driver this round — slot A needs a Tier A driver.",
  "data": { "driverA": { "code": "validation_invalid_value", "message": "Invalid value." } }
}
```

Read it like this:

- **`data` keys** name the fields to highlight (`driverA`…`driverD`,
  `constructor`, `boost`, `carriedForward`, `refunded`, `round`). PocketBase
  normalises the *values* into its own generic validation shape, so don't try to
  read a reason out of them.
- **`message`** carries the human reason. When a lineup breaks several rules at
  once the messages are joined with ` · `, so the whole message is worth showing.

One consequence of defence-in-depth: submitting to a locked round is caught by
the *API rule* before the hook runs, so it returns the generic
`{"message":"Failed to create record."}` rather than the hook's wording. The UI
should hide or disable the form once `lockAt` has passed rather than rely on the
server message there.

### Writing more hooks

PocketBase serialises each handler and runs it in its own Goja context, so a
handler **cannot close over module-level variables**. Every dependency has to be
`require`d inside the function body:

```js
onRecordCreateRequest(function (e) {
  require(__hooks + '/fantasy_rules.js').something();
  e.next();
}, 'fantasy_picks');
```

Goja is an ES5+ subset: `var`, no arrow functions, no template literals, no ESM
`import`, no Node built-ins. `module.exports` / `require` work. Keep anything
worth testing in `fantasy_rules.js`, which is plain CommonJS and therefore
runnable under Node — that is why this folder's `package.json` sets
`"type": "commonjs"` (the repo root is `"type": "module"`).

---

## Deploying on Coolify

### 1. Create the resource

Coolify → your project → **+ New** → **Docker Image**, image
`ghcr.io/muchobien/pocketbase:0.40.1` (pin the tag; never `latest`). If you
prefer running the official binary instead, use a Dockerfile that `COPY`s this
folder in and `ADD`s the release zip — the image above is only a convenience
wrapper around the same binary.

Alternatively, deploy from this Git repo with a `Dockerfile` in
`fantasy/pocketbase/` — the advantage being that `pb_migrations/` and
`pb_hooks/` ship inside the image and versioning stays with the commit.

### 2. Persistent storage

Add a **volume** mounted at `/pb_data`. This is the entire database — without it
every redeploy wipes the game.

```
Volume name : f1gures-fantasy-pbdata
Mount path  : /pb_data
```

Mount `pb_migrations/` and `pb_hooks/` as read-only bind mounts (or bake them
into the image) at `/pb_migrations` and `/pb_hooks`, then set the start command:

```
/usr/local/bin/pocketbase serve --http 0.0.0.0:8090 \
  --dir /pb_data --migrationsDir /pb_migrations --hooksDir /pb_hooks
```

### 3. Networking

- Port: `8090`.
- Domain: e.g. `https://fantasy.f1gures.app` — Coolify provisions the Let's
  Encrypt certificate. **HTTPS is mandatory**: auth tokens travel in headers.
- Once the domain is live, put it in `src/data/fantasyConfig.js` (workstream D).
  An empty URL there makes every `/fantasy/` page render a "not configured"
  notice, so the site never breaks waiting on this.

### 4. Environment variables

| Var | Value |
|---|---|
| `PB_ENCRYPTION_KEY` | 32 random characters. Then start with `--encryptionEnv PB_ENCRYPTION_KEY` so the settings blob (SMTP password, OAuth secrets) is encrypted at rest. |
| `TZ` | `UTC` — keep every `lockAt` unambiguous. |

Nothing else is needed; PocketBase configuration lives in the database, not in
env vars.

### 5. First boot

Migrations run automatically on start (`--automigrate` defaults to true, and the
committed migrations are applied by the migrations runner). Watch the deploy log
for `Applied 1788220800_users_display_name.js` … through
`Applied 1788221300_fantasy_profiles.js`.

Then create the real superuser — once, over the console:

```bash
pocketbase superuser upsert you@example.com '<a long random password>' --dir /pb_data
```

Or visit `https://fantasy.f1gures.app/_/` immediately after the first boot and
use the installer form, which is only available while no superuser exists.

### 6. SMTP (verification + password reset)

The picks create rule requires `@request.auth.verified = true`, so mail must
work before anyone can play. Dashboard → **Settings → Mail settings**:

- **Send emails via an SMTP server**: on. PocketBase's built-in sendmail will be
  binned by every inbox provider — always use a real relay.
- Host/port/credentials from your provider (Resend, Postmark, Brevo, Mailgun,
  Fastmail — anything with SMTP). TLS on, port 587 or 465.
- Sender address on a domain you control with SPF + DKIM published.
- Use **Send test email** before trusting it.

Then Dashboard → **Collections → users → Options**: keep *Require verification*
on, and set the verification / reset redirect URLs to the site's
`/fantasy/account/` route.

### 7. Google OAuth (optional)

1. Google Cloud Console → **APIs & Services → Credentials → Create credentials →
   OAuth client ID → Web application**.
2. Authorised redirect URI:
   `https://fantasy.f1gures.app/api/oauth2-redirect`
3. Copy the client ID and secret.
4. PocketBase Dashboard → **Collections → users → Options → OAuth2** → enable,
   add **Google**, paste both values.
5. Flip `googleAuth: true` in `src/data/fantasyConfig.js`.

Google accounts arrive already verified, which is the main reason to bother.

### 8. Superuser token for the scorer

The scorer authenticates as a superuser on every run:

```bash
curl -X POST https://fantasy.f1gures.app/api/collections/_superusers/auth-with-password \
  -H 'Content-Type: application/json' \
  -d '{"identity":"scorer@f1gures.app","password":"<password>"}'
```

Make it a **dedicated** superuser (`scorer@f1gures.app`), not your personal
login, so it can be rotated without locking you out. Store the credentials as
Coolify secrets on the scorer's scheduled task
(`PB_URL`, `PB_SUPERUSER_EMAIL`, `PB_SUPERUSER_PASSWORD`) and let it exchange
them for a short-lived token each run — auth tokens expire, so caching one in an
env var will silently start failing.

### 9. Backups

`pb_data` is one SQLite file plus uploads, so backup is cheap and there is no
excuse for not having one:

- Dashboard → **Settings → Backups**: turn on the automatic schedule (daily) and
  point it at S3-compatible storage (Backblaze B2, Cloudflare R2, Hetzner
  Storage Box). PocketBase snapshots the database safely while running.
- Also enable Coolify's volume backup as a second copy.
- **Test a restore before the season starts.** A backup you have never restored
  is a hypothesis.

### 10. Updating

Bump the image tag (or `PB_VERSION`) → redeploy. New migrations in
`pb_migrations/` apply on boot. Migrations are additive-only in practice: the
site and the mobile apps read this data, so add fields rather than renaming
them, exactly as `docs/app-data-feed.md` requires of the JSON feed. Read the
PocketBase changelog before crossing a minor version — 0.23 is the precedent for
a release that renamed hooks under everyone's feet.

---

## Deviations from the build contract

1. **Pinned v0.40.1, not a `0.2x` release.** The contract asked for "the latest
   stable 0.2x"; the current stable line is 0.40.x. The intent — post-0.23 API
   with superusers and the renamed request hooks — is satisfied, on the newest
   stable release rather than a two-year-old one.
2. **`fantasy_leagues.createRule` is `@request.auth.id != "" && owner = @request.auth.id`**,
   where the contract said only "authed". Without the `owner` clause any signed-in
   user could create a league owned by somebody else. The extra clause blocks
   nothing legitimate.
3. **A spurious `emergency[slot]` is rejected** (error `emergencyNotNeeded`,
   message `Emergency pick not allowed: NOR has 2 starts left (slot A).`) rather
   than ignored, so a client cannot halve its own score by accident. Agreed with
   the engine workstream, whose `validatePicks` rejects it too.
4. **`seed-dev.mjs` uses Node 18+ global `fetch`, not the `pocketbase` SDK.**
   The contract allowed either. Raw fetch means the seeder runs with no
   `npm install` at all, so this folder ships zero dependencies.
5. **The seeder creates three already-locked rounds and six historical picks**
   on top of the "couple of rounds with future lockAt" the contract asked for.
   Without prior history the usage-cap and emergency-pick paths are unreachable,
   so there would be nothing to test against.
6. **`boost` is stored without a default and defaulted to `D` by the hook.**
   PocketBase select fields have no default-value setting; this is the only
   place the rulebook's "defaults to your Tier D driver" can live.
