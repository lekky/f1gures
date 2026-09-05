# Fantasy — architecture

The f1gures fantasy game: pick 4 drivers and a constructor each weekend, locked
at qualifying, scored from what actually happened on track. Rules are public and
authoritative in the **Rulebook** (`/fantasy/rules/`, edition 1 / rules v0.2);
this document is the technical map.

Ops detail for the backend lives in **`fantasy/pocketbase/README.md`** — this
page is the overview and the pointer.

## The three pieces

```
                    public JSON, rebuilt by the normal deploy
  public/data/<year>.json ─────────────────────────────────┐
  (season bundles, already                                 │
   the site's source of truth)                             ▼
                                              ┌────────────────────────┐
  f1gures.app  ── REST + auth ───────────────►│      PocketBase        │
  static Astro + React islands                │  fantasy/pocketbase/   │
  /fantasy/{,pick,standings,league,account}   │  SQLite + JS hooks     │
                                              └───────────▲────────────┘
                                                          │ superuser token
                                              ┌───────────┴────────────┐
                                              │        scorer          │
                                              │   fantasy/scorer/      │
                                              │ Coolify scheduled task │
                                              └────────────────────────┘
```

**The site** stays a static SSG build. Nothing about fantasy is prerendered per
user: the `/fantasy/` pages are shells with React islands that talk to
PocketBase from the browser using the `pocketbase` SDK. `src/data/fantasyConfig.js`
holds the deployment URL; when it is empty every fantasy page renders a "not
configured" notice, the same pattern as `src/data/feedbackConfig.js`. That keeps
the backend's availability decoupled from the site build.

**PocketBase** (`fantasy/pocketbase/`) is a single Go binary with an embedded
SQLite database, self-hosted on the Coolify VPS. It owns accounts, picks,
leagues and every computed score. It is the only stateful component. Migrations
and hooks are committed and applied on boot.

**The scorer** (`fantasy/scorer/`) is a Node job on a schedule. It reads the live
season bundle from `https://f1gures.app/data/<year>.json`, runs the scoring
engine, and writes results back to PocketBase with a superuser token. It is the
only writer of scores, tiers, standings, carry-forward and refunds.

**The engine** (`src/lib/fantasyScoring.mjs`) is plain ESM in the main source
tree, imported by the scorer and covered by vitest. It has no PocketBase
dependency at all, which is what lets the season be replayed and validated
offline against the 2024/2025 archives.

## Why PocketBase

The site is a static build deployed over SFTP to shared hosting; there is no
server-side runtime to bolt a database onto. Fantasy needs accounts, per-user
writes and a deadline that cannot be forged client-side, so it needs a real
backend — but a small one. PocketBase gives auth (password + Google OAuth),
row-level API rules, an admin UI and one-file backups in a single binary, which
is the right size for a free, glory-only side game. The alternative shapes
(Postgres + a Node API, or a hosted BaaS) are more moving parts or more vendor.

## Data flow across a weekend

1. **Tiers published.** After the previous round is scored, the scorer ranks
   entries on their last-6-round average and writes `fantasy_tiers` rows for the
   next round. Tiers are public before picks open — the formula has nothing
   hidden in it.
2. **Picks open.** Players write one `fantasy_picks` row per round. The
   `fantasy_picks` hook enforces tier match, usage caps, the emergency-pick rule,
   the boost slot and the lock; the API rules enforce ownership and verification.
3. **Lock** at the start of qualifying (sprint qualifying on sprint weekends).
   Enforced by the API rule `round.lockAt > @now`, so it is server-side and not
   a UI courtesy. At the lock, league members can see each other's picks — the
   same rule flips read access open.
4. **Carry-forward.** For locked rounds where a player made no pick, the scorer
   copies their last locked lineup where caps allow and flags `carriedForward`.
   Clients can never set that field.
5. **Scoring.** As results land, the scorer computes per-entry `fantasy_scores`,
   per-team `fantasy_constructor_scores`, per-user `fantasy_pick_scores` and
   rolls up `fantasy_standings` for the season and each split.
6. **Provisional → final.** Rounds stay `provisional` for 7 days (or until the
   next lock) and are rescored on any stewards' decision, then go `final`.

Every step is idempotent; re-running the scorer over a scored round produces the
same rows.

## Where things live

| Concern | Path |
|---|---|
| Rules of the game (player-facing) | `src/pages/fantasy/rules.astro` |
| Scoring maths | `src/lib/fantasyScoring.mjs` (+ `.test.js`) |
| Collections, API rules, pick validation | `fantasy/pocketbase/pb_migrations/`, `pb_hooks/` |
| Local backend dev | `fantasy/pocketbase/dev.ps1`, `dev.sh`, `seed-dev.mjs` |
| Deployment / SMTP / OAuth / backups | `fantasy/pocketbase/README.md` |
| Scheduled scoring | `fantasy/scorer/run.mjs` |
| Site pages and islands | `src/pages/fantasy/`, `src/components/islands/fantasy/` |
| Backend URL + auth toggles | `src/data/fantasyConfig.js` |

## Boundaries worth keeping

- **The engine never imports PocketBase, and PocketBase never computes scores.**
  The hook validates a submission; it does not score one. Keeping the maths in
  one plain-ESM module is the same discipline `src/lib/seasonStats.mjs` enforces
  for championship points, and for the same reason: three copies of a scoring
  rule become three different answers.
- **Only the scorer holds a superuser token.** Reference data is public-read and
  superuser-write; the browser never gets a credential that can write a score.
- **`carriedForward` and `refunded` are server-only.** The hook rejects them
  outright when a client sends them.
- **Season data still comes from the existing pipeline.** Fantasy reads
  `public/data/<year>.json` — the same bundle the site and the mobile apps use.
  No second source of race results.
