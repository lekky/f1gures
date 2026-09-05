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
| `scripts/social/publish/metricool.mjs` | Metricool scheduler client |
| `scripts/build-social-post.mjs` | Pick + render + write `.social-out/` |
| `scripts/publish-social-post.mjs` | Upload manifest → Metricool → append history |

## Angles

Thirteen, in descending topicality. Race-weekend angles outrank everything, so
the single daily slot covers Saturday's pole and Sunday's podium without extra
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
| Runs | 1st and 15th, 09:00 UTC | daily, 10:00 UTC |
| Posts | everything except results | pole, sprint, podium only |
| Horizon | next `config.batchDays` (14) | that day |
| On a quiet day | n/a | exits in seconds, posts nothing |

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

The cards use the brand's real faces — Barlow Condensed, Barlow, JetBrains
Mono — fetched from the Fontsource CDN and cached in
`node_modules/.cache/og-fonts/`. If the CDN is unreachable the renderer falls
back to a system face and warns rather than failing the post. To preview with
specific faces on a machine without CDN access, drop TTFs into a directory and
point `SOCIAL_FONT_DIR` at it (filenames per `FONT_SPECS` in `cardkit.mjs`).

---

## Why Metricool rather than the platform APIs

Instagram, TikTok and Facebook are the three hardest networks to post to
unattended:

- **Instagram** needs a Business/Creator account linked to a Facebook Page, and
  a two-step create-container-then-publish call.
- **TikTok**'s direct-post API requires the app to pass audit — until then posts
  can only land as private — and its access token expires every 24 hours.
- **Meta** long-lived tokens expire every 60 days.

Metricool already holds those connections, so the pipeline sends it one request
and lets it own the OAuth, the token rotation and the per-network quirks. The
adapter is a single file (`publish/metricool.mjs`); swapping in direct platform
clients later means replacing only that.

### Setup

1. In Metricool: **Account Settings → API**, copy the access token. API access
   is a paid-plan feature — if the endpoint 401s, that is the first thing to
   check.
2. Find your `userId` and `blogId` (the `blogId` identifies the brand; one
   token covers every brand on the account).
3. Add three repository secrets:

   | Secret | Value |
   |---|---|
   | `METRICOOL_USER_TOKEN` | the access token |
   | `METRICOOL_USER_ID` | your user id |
   | `METRICOOL_BLOG_ID` | the f1gures brand id |

4. Connect Instagram, TikTok and Facebook inside Metricool (once).
5. Run the workflow by hand with **draft = true** first. Posts land in the
   Metricool calendar for review instead of going out. When the first few look
   right, let the schedule run.

### API contract, and what to check if a call starts failing

Confirmed from Metricool's API documentation:

- token goes in an **`X-Mc-Auth`** header (not `Authorization: Bearer`)
- **`userId`** and **`blogId`** are query parameters on *every* call
- schedule endpoint: `POST https://app.metricool.com/api/v2/scheduler/posts`
- media normalize: `GET https://app.metricool.com/api/actions/normalize/image/url?url=…`
- `publicationDate` is `{ dateTime, timezone }` with an ISO datetime carrying
  **no offset** (the timezone field supplies it)

The exact request-body field names for `providers`, `draft`/`autoPublish` and
the per-network option objects were taken from the same docs but have **not yet
been exercised against a live account**. If a call starts returning 400, that is
the likely cause: `publish/metricool.mjs` logs the response body verbatim for
exactly this reason. Check the current schema at
<https://app.metricool.com/resources/apidocs/index.html> and adjust
`schedulePost()` — nothing else needs to change.

---

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
