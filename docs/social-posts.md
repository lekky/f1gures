# Automated daily social posts

One post a day to Instagram, TikTok and Facebook, assembled from the same
archive the site renders and scheduled through Metricool.

- **What it posts** — a branded card plus a caption, built from
  `public/data/archive/`. Every number comes from the archive; nothing is
  generated prose, which is what makes unattended posting safe.
- **Design** — see [`social-card-design.md`](./social-card-design.md).
- **Cadence** — two jobs in `.github/workflows/social-post.yml`: a fortnightly
  **batch** that fills the calendar ahead, and a daily **live** job for results.
- **Settings** — [`scripts/social/config.mjs`](../scripts/social/config.mjs) is the
  one file to edit: post time, timezone, networks, draft mode, how far ahead to
  schedule, and link tagging.

---

## The pieces

| File | Role |
|---|---|
| `scripts/social/config.mjs` | **All the knobs** — time, networks, draft, horizon |
| `scripts/social/sources.mjs` | Memoized read-only accessors over the archive |
| `scripts/social/angles.mjs` | The 13 angles + deterministic daily selection |
| `scripts/social/caption.mjs` | Caption, hashtags, alt text per angle |
| `scripts/social/cardkit.mjs` | Satori primitives: brand type, palette, rows, texture |
| `scripts/social/card.mjs` | The four layouts and the angle → layout mapping |
| `scripts/social/history.mjs` | `data/social/history.json`, the anti-repetition log |
| `scripts/social/pending.mjs` | `data/social/pending.json`, the MCP hand-off queue |
| `scripts/social/publish/metricool.mjs` | Metricool REST client (the `api` route) |
| `.claude/commands/social-schedule.md` | `/social-schedule` — places the queue via the MCP |
| `scripts/build-social-post.mjs` | Pick + render + write `.social-out/` |
| `scripts/publish-social-post.mjs` | Upload manifest → Metricool → append history |

## Angles

Thirteen, in descending topicality. Race-weekend angles outrank everything, so
the live job covers Saturday's pole and Sunday's podium without extra
schedules.

| Angle | Fires when | Layout |
|---|---|---|
| `race-result` | A grand prix finished in the last 3 days | podium |
| `quali-result` | Qualifying is in and the race is ≤ 2 days out | podium |
| `sprint-result` | Sprint results exist on a sprint weekend | podium |
| `race-preview` | Next race is ≤ 4 days out | hero |
| `on-this-day` | A grand prix ran on this calendar day (301 of 366 days have one) | leaderboard |
| `driver-birthday` | A notable driver was born on this day | hero |
| `record-board` | Always — one of the 20 leaderboards | leaderboard |
| `standings-snapshot` | Mid-season, ≥ 3 rounds done | leaderboard |
| `driver-spotlight` | Always — champions and multiple winners | hero |
| `head-to-head` | Always — from the Compare tool's suggestion pool | versus |
| `circuit-spotlight` | Always — circuits with ≥ 5 races | hero |
| `team-spotlight` | Always — constructors with ≥ 40 races or a win | hero |
| `trivia` | Always — the hand-verified fact pool | fact |

Selection is a **deterministic two-stage weighted draw** seeded by the date:
pick the angle by topicality, then a candidate within it. Same date + same
history always gives the same post, so a dry run tells you exactly what will go
out. Repetition is held off by three cooldowns in `angles.mjs`:

- the same **key** is hard-blocked for `KEY_COOLDOWN_DAYS` (400)
- the same **subject** (driver/team/circuit) is damped ×0.1 for 21 days
- the same **angle** is damped ×0.12 for 3 days

If everything in an angle is on cooldown it falls back to the raw weights
rather than failing — the workflow always produces a post.

## Two jobs, because results cannot be scheduled ahead

Most posts are knowable weeks in advance: an on-this-day, a record leaderboard, a
driver's birthday, even a race preview (the calendar is fixed). A podium is not —
it does not exist until the race ends.

So the work splits:

| | **batch** | **live** |
|---|---|---|
| Runs | 1st and 15th, 09:00 UTC | twice daily, 17:00 and 23:00 UTC |
| Posts | everything except results | pole, sprint, podium only |
| Publishes at | `config.postTime` (19:00 London) | `config.livePostTime` (`asap`) |
| Horizon | next `config.batchDays` (14) | that day |
| On a quiet day | n/a | exits in seconds, posts nothing |

The live job runs twice because "after the session" is not one time of day.
**17:00 UTC** covers Europe, the Middle East and Asia-Pacific; **23:00 UTC**
catches the Americas the same night (Austin, Mexico, Miami, Interlagos and Las
Vegas all finish between 21:00 and 06:00 UTC). A date already queued or already
in the history log is skipped downstream, so the overlap costs a build, never a
duplicate post.

Result posts publish `asap` rather than at the evening slot: a podium card built
ten minutes after the flag is news, and waiting until 19:00 the next day would
throw that away. Evergreen posts get the 19:00 London slot instead — something
to scroll past after work.

The batch job **skips the days around a race** (`config.raceWindow`, ±1 day) and
leaves them to the live job, so the two never both post on the same date.

This is why the calendar fills up in two runs a month rather than 30: you review
a fortnight of posts in one sitting in Metricool, and only genuinely time-
sensitive results arrive day-of.

## Running it locally

```bash
npm run build:archive          # the pipeline reads public/data/archive/

npm run social:build -- --days=14             # a fortnight, as the batch job runs it
npm run social:build                          # one post for today
npm run social:build -- --date=2026-09-06
npm run social:build -- --angles=race-result,quali-result,sprint-result
npm run social:build -- --list                # every candidate for the date

npm run social:publish -- --dry-run           # print exactly what would be sent
```

Output lands in `.social-out/` (gitignored): the PNGs plus `batch.json`.

Formats: `portrait` 1080×1350 (Instagram + Facebook), `square` 1080×1080,
`story` 1080×1920 (TikTok). Only the shapes the configured networks need are
rendered.

## Links in captions

**Only Facebook makes a URL in a post clickable.** Instagram and TikTok render
URLs in a caption as plain text, so campaign tags there are unclickable clutter
that also reads as spam.

The pipeline therefore sends Facebook as its own scheduled post, with
`?utm_source=facebook&utm_medium=social&utm_campaign=daily-post` appended to
every f1gures link, while Instagram and TikTok get the clean URL. GA4 will
attribute the Facebook traffic; **Instagram and TikTok performance is read in
Metricool's own per-post analytics**, not in GA4 — expect their referred traffic
to land under direct.

Turn it off, or add networks, under `utm` in `config.mjs`.

### Fonts

The cards use the brand's real faces — Barlow Condensed (display), Barlow
(body), JetBrains Mono (every numeral), per `design-system/TOKENS.md` §1.

They come from `@fontsource` **devDependencies**, read out of `node_modules` at
render time — not fetched from a CDN. That keeps a render reproducible (the
exact faces are pinned by `package-lock.json`), removes a network call from the
daily job, and means a CDN being blocked or moving a path cannot quietly
degrade the typography. Fontsource ships `woff` and `woff2`; Satori parses
`woff`, so that is what is read.

`npm install` is all that is needed. If a face is somehow missing the renderer
falls back to a system font and warns loudly rather than failing the post — if
you ever see `brand faces missing from node_modules`, run `npm install`.

## Publishing: two routes, and why the default is the slower one

Instagram, TikTok and Facebook are the three hardest networks to post to
unattended — Instagram needs a Business account and a container-then-publish
call, TikTok's direct-post API needs app audit and rotates its token every 24
hours, and Meta's long-lived tokens expire every 60 days. Metricool already
holds those connections, so the pipeline hands it the work.

Metricool exposes that two ways, and **they are different products with
different plan requirements**:

| | **MCP** (default) | **REST API** |
|---|---|---|
| Plans | any, including Free | Advanced / Custom only |
| Auth | OAuth — signs in as *you* | `X-Mc-Auth` token |
| Can a cron use it? | **No** — no browser session | Yes |
| Set by | `publishVia: 'mcp'` | `publishVia: 'api'` |

On this account's plan the API is not available, so the default route is
**MCP**, and that has one real consequence: **CI cannot post by itself.** It
does everything up to the last step — picks the angles, renders the cards,
uploads them, composes the captions — and parks the finished posts in
`data/social/pending.json`. Placing them takes a Claude session with the
Metricool MCP connected.

This is why the fortnightly batch matters: it is about two minutes of your time
every two weeks, not a daily chore.

### Placing the queued posts

1. Connect the MCP once: add `https://ai.metricool.com/mcp` as a connector in
   Claude and authorise it in the browser.
2. Whenever the queue has posts in it, run **`/social-schedule`**
   (`.claude/commands/social-schedule.md`).

That command reads the queue, calls `post_schedule_post` for each group, then
runs `--confirm` for **only the dates that actually landed** — anything that
failed stays queued for next time — and commits the queue and history log.

```bash
node scripts/publish-social-post.mjs --confirm --dates=2026-09-08,2026-09-10
```

### Race results are not unattended either

The daily live job builds and queues pole/sprint/podium cards, but it cannot
place them, so a result post reaches the feed only once you run
`/social-schedule` (or post the PNG by hand — `.social-out/` has all three
formats). On a race weekend that is worth knowing: the card exists within
minutes, but nothing goes out on its own.

### Switching to the unattended route later

If the Metricool plan gains API access, set `publishVia: 'api'` in
`scripts/social/config.mjs` and add three repository secrets —
`METRICOOL_USER_TOKEN`, `METRICOOL_USER_ID`, `METRICOOL_BLOG_ID` (Account
Settings → API). The same workflow then schedules everything itself; no other
change is needed.

The REST client's auth contract is confirmed from Metricool's docs (`X-Mc-Auth`
header, `userId`/`blogId` as query params, `POST /api/v2/scheduler/posts`,
`publicationDate` as `{ dateTime, timezone }` with no offset). The exact
request-body field names have **not been exercised against a live account** —
`publish/metricool.mjs` logs response bodies verbatim so a schema mismatch is a
one-line fix.

## Image hosting

All three networks pull media from a **public URL** rather than accepting an
upload from us, so the workflow uploads the rendered cards to
`f1gures.app/social/` over SFTP (reusing the existing `SSH_PRIVATE_KEY` /
`SSH_PORT` / `SSH_HOST` deploy secrets) before calling Metricool.

**`deploy.yml` excludes `social/` from its `lftp mirror --delete`.** Without
that exclusion every site deploy would delete the image the live post points
at, because the cards are not part of `dist/`. `refresh-current-season.yml`
uses a state-file FTP sync that only removes files it previously uploaded, so
it needs no equivalent guard.

**`deploy.yml`'s "should I deploy?" gate also ignores social-only commits.** The
posting job commits `data/social/history.json`, which ships nothing. Without the
check, each of those commits would look like "main moved" and trigger a full
~2,300-page rebuild and re-upload — undoing the batched-deploy saving that
workflow exists for. The gate now compares the changed files and skips when they
are all under `data/social/`.

The directory is additive and grows by three PNGs a day (~700 KB). Prune it by
hand occasionally, or add a retention step if it ever matters.

---

## The history log

`data/social/history.json` is committed, and the workflow pushes to it after a
successful post. It is **state, not an artefact**: it is what the cooldowns read
to stop the feed repeating itself, so it must survive a runner being recycled.

A partial success (one network failed, another succeeded) still logs, so the
next day does not repeat the same subject.

## Adding an angle

1. Write a provider in `angles.mjs` returning candidates
   (`{ angle, key, weight, subject, layout, link, data }`) and register it in
   `PROVIDERS` + `ANGLE_WEIGHTS`.
2. Add a composer to `COMPOSERS` in `caption.mjs`.
3. Add a `case` to `propsFor()` in `card.mjs` mapping it onto one of the four
   layouts — hero, podium, leaderboard or fact/versus. A new layout is usually
   not needed.
4. Add a fixture to `CASES` in `scripts/social/social.test.js`; a test asserts
   every selectable angle has caption coverage, so this is enforced.
