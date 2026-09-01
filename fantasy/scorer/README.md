# f1gures fantasy — the scorer

The scheduled job that turns race results into fantasy points. It is the **only
writer** of tiers, scores, standings, carry-forward picks and refunds; players
write nothing but their own `fantasy_picks` row.

```
public/data/<year>.json ──►  run.mjs  ──► PocketBase (superuser token)
 (the same season bundle    (this dir)     fantasy/pocketbase/
  the site and the apps        │
  already read)                └── src/lib/fantasyScoring.mjs  (the maths, shared with the site)
```

Zero dependencies. Node 20+ built-ins only (global `fetch`), so it runs as a
plain `node run.mjs` with no `npm install` on the box that runs it.

| Path | What it is |
|---|---|
| `run.mjs` | Entrypoint + the pipeline (`runScorer`, exported for tests) |
| `lib/pb.js` | Tiny PocketBase REST client: auth, paginated list, diffing upsert, dry-run |
| `lib/sync.js` | Bundle → season / rounds / entries (lock times, statuses, caps) |
| `lib/score.js` | Rescore triggers, DNS detection, refunds, usage accounting |
| `lib/carry.js` | Rulebook §5 carry-forward |
| `lib/standings.js` | Season + Split standings and the §11 tie-break fields |
| `lib/tiers.js` | Season replay and the next round's published tier cut |
| `lib/memoryPb.js` | In-memory stand-in for the client, used by the tests |
| `*.test.js` | vitest — 90 tests, picked up by the repo-root `npm test` |
| `.local/` | **gitignored** scratch space for local integration runs |

Everything under `lib/` is pure except `pb.js`; the scoring arithmetic itself is
never re-implemented here — see the boundary note in `docs/fantasy.md`.

---

## Running it

```bash
# live, against production
PB_URL=https://fantasy.f1gures.app \
PB_SUPERUSER_EMAIL=scorer@f1gures.app \
PB_SUPERUSER_PASSWORD='…' \
node run.mjs

# see what it would do, write nothing
node run.mjs --dry-run

# a specific moment, and a bundle from disk (tests, backfills)
node run.mjs --bundle ../../public/data/2026.json --now 2026-08-23T16:00:00Z
```

### Environment

| Var | Default | Notes |
|---|---|---|
| `PB_URL` | — | **required.** PocketBase base URL, no trailing slash |
| `PB_SUPERUSER_TOKEN` | — | a token, if you have one |
| `PB_SUPERUSER_EMAIL` | — | used when there is no token |
| `PB_SUPERUSER_PASSWORD` | — | ditto. Auth tokens expire, so prefer credentials and let each run exchange them |
| `SEASON_YEAR` | the year of "now" | |
| `DATA_BASE` | `https://f1gures.app/data` | where `<year>.json` is fetched from |
| `SCORER_DEBUG` | unset | print the stack on failure |

### Flags

| Flag | Effect |
|---|---|
| `--dry-run` | Reads everything, writes nothing, prints each planned write |
| `--bundle <path>` | Read the bundle from disk; the previous season is taken from the sibling `<year-1>.json` |
| `--now <iso>` | Clock override — what "locked", "provisional" and "final" mean |
| `--year <n>` | Same as `SEASON_YEAR` |

### Output and exit codes

One `[scorer] …` line per notable event (carry-forward, refund, validation
warning), then two summary lines: what the run did, and how many records it
created / updated / deleted / left alone. **Exit 0** on success, **exit 1** on
any failure — bad config, an unreachable bundle, a PocketBase error. Nothing is
retried internally; the schedule is the retry.

A healthy no-op run looks like this:

```
[scorer] 2026 · now 2026-08-23T16:00:00.000Z · live · https://f1gures.app/data
[scorer] rounds 23 · entries 23 · scored [—] · tiers 0 · carried 0 · refunds 0 · pick scores 0 · standings 0 · finalised [—]
[scorer] writes: 0 created, 0 updated, 0 deleted, 338 unchanged (10 requests)
```

**Idempotency is the contract.** Running twice over unchanged data must produce
`0 created, 0 updated, 0 deleted`. Every write goes through a field-level diff,
so a run that changes nothing costs ten reads.

---

## The pipeline

Per run, in order:

1. **Season.** Upsert `fantasy_seasons` for the year. Caps, `splitLength` and
   `tierCount` are written **only on creation** — an operator may tune them in
   the admin UI and the scorer will not stomp on that. Defaults come from the
   rulebook (5 driver starts / 4 constructor starts on a 24-round calendar),
   scaled if the real calendar is materially shorter (§4).
2. **Rounds.** One row per calendar entry. `lockAt` is the start of qualifying,
   or of **sprint qualifying** on a sprint weekend (§5); `raceAt` is the race;
   `finalAt` is race + 7 days or the next round's lock, whichever is first (§9).
   Statuses only ever move forward — `upcoming → locked → provisional → final`.
3. **Entries.** Every driver who appears in any round's qualifying or race
   classification, including a round whose qualifying has run but whose race
   has not. `active` marks the most recent grid. Practice-only call-ups never
   appear, because they are not in a classification.
4. **Tiers.** The season is replayed with the engine, which computes each
   round's cut from everything *before* that round; the next, unraced round is
   cut from the whole history so far plus the previous season's tail (§3). Rows
   for a driver who has left the grid are deleted.
5. **Carry-forward** for every locked round a player has no pick in: their most
   recent locked lineup rolls over, slot by slot, wherever the driver is still
   in that tier and still under cap. Anything else stays empty and scores 0
   (§5). The Boost follows its driver, or falls back to Tier D. Emergency flags
   are never carried.
6. **Scoring** for rounds that have results. A round is scored when its result
   fingerprint or the rules version has changed, or when a pick in it has no
   score yet; a `final` round is never scored again (§9). Writes
   `fantasy_scores` (per entry, with the component breakdown),
   `fantasy_constructor_scores`, and `fantasy_pick_scores` per player.
7. **Refunds.** A driver in a lineup who did not start the race has that slot
   added to `refunded`, which removes the start from every later usage count
   (§4) while keeping the points they earned in qualifying or the sprint (§8).
   A void round refunds every slot and the constructor.
8. **Re-validation.** Each pick is re-checked with the engine's `validatePicks`.
   Violations are **logged, never enforced**: a lineup that was legal when it
   was submitted stays scored. Empty slots on a carried lineup are not reported
   — that is §5 working as designed.
9. **Standings** for `season` and each `split-N`, with the §11 tie-break facts:
   `bestWeekend`, `weeksTop`, and `splitWins` (season scope only, and only for
   Splits whose every round is settled). Ordering them is the leaderboard's
   job — `compareStandings` in `lib/standings.js` is the shared comparator.

---

## Scheduling on Coolify

Two scheduled tasks on the same resource, both running the command below with
the env vars above:

```
node /app/fantasy/scorer/run.mjs
```

| Task | Cron | Why |
|---|---|---|
| Race weekend | `*/10 * * * 5-7` | Every 10 minutes Friday–Sunday. Catches the lock (carry-forward), qualifying, the sprint and the race within minutes, and keeps rescoring while the round is provisional. |
| Daily | `20 4 * * *` | Picks up stewards' decisions during the week, promotes rounds to `final`, and publishes the next round's tiers on a quiet Tuesday. |

Times are UTC — keep `TZ=UTC` on the container, the same as PocketBase, so
`lockAt` is never ambiguous.

The two can overlap harmlessly: the worst case is one run writing what the other
just wrote, and the diffing upsert turns that into a no-op. Give the scorer its
own dedicated superuser (`scorer@f1gures.app`) so the credential can be rotated
without locking anyone out — see `fantasy/pocketbase/README.md` §8.

---

## Recipes

### Backfill a season

Point the scorer at a bundle on disk and walk the clock forward. Because every
step is idempotent you can jump straight to the end:

```bash
PB_URL=… PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… \
node run.mjs --bundle ../../public/data/2025.json --year 2025 --now 2026-01-01T00:00:00Z
```

Everything with results is scored in one pass, and every round whose provisional
window has closed goes straight to `final`. Run it with `--dry-run` first.

Carry-forward is the one thing a single jump gets *differently* from a live
season: it can only work from picks that exist, so a backfill of a season that
was played live must replay the clock round by round (`--now` set just after
each lock) if you want the carried lineups to match what players actually got.

### After a stewards' decision

1. The site's own pipeline refreshes `public/data/<year>.json` (the
   `refresh-current-season` workflow, or a manual `fetch-season.mjs` run).
2. The next scorer run notices the round's fingerprint has moved and rescores
   it — scores, pick scores, refunds and standings all follow. Nothing to do by
   hand, provided the round is still `provisional`.
3. If the round has already gone `final`, the scorer will leave it alone: that
   is §9, deliberately. To override, set the round's `status` back to
   `provisional` and clear its `scored` field in the admin UI, then run the
   scorer. Do that only for a genuine correction, and tell the players.

### Round 1 of a season

Tiers for round 1 come entirely from the previous season's final six rounds,
rescored under these rules (§3) — so make sure `<year-1>.json` is reachable.
The entry list needs a classification to exist, which first appears once
qualifying has run and the bundle carries a `pendingQuali` record for round 1.
Before then the scorer creates the season and the calendar and stops; there is
nothing to publish tiers over yet.

---

## Local development

```powershell
# 1. a PocketBase of your own (never share pb_data with another agent/session)
mkdir fantasy/scorer/.local
copy -r fantasy/pocketbase/{bin,pb_migrations,pb_hooks,seed-dev.mjs} fantasy/scorer/.local/
cd fantasy/scorer/.local
.\bin\pocketbase.exe superuser upsert dev@f1gures.local fantasy-dev-1234 --dir .\pb_data --migrationsDir .\pb_migrations --hooksDir .\pb_hooks
.\bin\pocketbase.exe serve --http 127.0.0.1:8797 --dir <abs>\pb_data --migrationsDir <abs>\pb_migrations --hooksDir <abs>\pb_hooks

# 2. seed it
node seed-dev.mjs

# 3. run the scorer against it
cd ..
$env:PB_URL="http://127.0.0.1:8797"
$env:PB_SUPERUSER_EMAIL="dev@f1gures.local"; $env:PB_SUPERUSER_PASSWORD="fantasy-dev-1234"
node run.mjs --bundle ../../public/data/2026.json --now 2026-08-23T16:00:00Z --dry-run
```

`seed-dev.mjs` deliberately sets tiny dev caps (3 driver / 2 constructor) so the
backend's cap and emergency-pick paths are easy to hit by hand. Patch the season
to `capDriver: 5, capConstructor: 4` if you want carry-forward to behave the way
a real season does.

### Tests

```
npm test -- --run fantasy/scorer
```

vitest's default glob picks these up, so they also run as part of a plain
`npm test` at the repo root. `lib/memoryPb.js` is the in-memory double the
end-to-end tests in `pipeline.test.js` drive the whole pipeline against — no
database needed.
