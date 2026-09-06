---
description: Schedule the queued f1gures social posts into Metricool via the Metricool MCP, then mark them done.
argument-hint: "[optional] 'dry' to preview without scheduling"
---

# Schedule the queued social posts

The workflow builds the posts, renders the cards, uploads them to
`f1gures.app/social/` and parks them in **`data/social/pending.json`**. It
cannot schedule them itself: the Metricool MCP signs in as a person, and a cron
job has no browser session. That last step is this command.

**Prerequisite:** the Metricool connector must be enabled in this session. If
`createScheduledPost` is not available, stop and say so — do not fall back to
the REST API (this account's plan does not include it) and do not schedule any
other way.

## 1. Read the queue

```bash
git pull                      # the workflow commits the queue; get the latest
cat data/social/pending.json
```

The file carries the brand at the top level and the posts under `posts`:

```
blogId        Metricool brand id — pass verbatim, never look it up by name
brandLabel    "F1gures", for the sanity check in step 2
timezone      IANA zone, e.g. "Europe/London"
posts[]
  date          the calendar day  e.g. "2026-09-10"
  publishAt     local datetime, NO offset  e.g. "2026-09-10T19:00:00"
  draft         true = park in the calendar, false = let it publish
  tiktokTitle   short title for TikTok (≤90 chars)
  alt           alt text
  groups[]      one Metricool post each:
    networks[]    e.g. ["instagram"] / ["facebook"] / ["tiktok"]
    format        portrait (IG+FB) or story (TikTok)
    imageUrl      public URL of the card, already uploaded
    caption       the exact text to post
```

**Do not rewrite any of it.** The captions are generated from the archive and
their numbers are verified; hand-editing is how a wrong stat reaches a live
account.

**Why three groups per date:** Metricool takes one media set per post.
Instagram and Facebook take the 4:5 portrait card, TikTok takes the 9:16 story
card, and Facebook's caption carries UTM-tagged links the other two do not
(only Facebook makes URLs clickable).

## 2. Check the brand, then the cards

This account has several brands — House On The Fairway, BBM, HelloWebDesign,
F1gures, Frontdeskly. **Posting F1 content to the wrong one is the worst
failure here.** Call `getBrandSettings` once and confirm the queue's `blogId`
is the brand whose label matches `brandLabel`. If it does not match, stop.

Then spot-check one `imageUrl` per run actually resolves. Instagram, TikTok and
Facebook all *pull* the image from that URL — a 404 fails at Metricool's end,
after the post is already in the calendar.

**If the URLs are dead, stop and schedule nothing.** Two causes, and the fix
differs:

- **`updatedAt` is recent** → the workflow's upload step failed. Report it; the
  posts need rebuilding, not rescheduling.
- **`updatedAt` is old, or the dates are in the past** → the queue is stale,
  most likely left over from a local test run that never uploaded anything. Say
  so and suggest clearing it rather than trying to schedule it.

## 3. Schedule each group

For every post, for every group, call **`createScheduledPost`**:

- `blogId` — from the queue, as a string
- `date` — `publishAt` **with the UTC offset for that date appended**
  (`Europe/London` is `+01:00` in BST, `+00:00` in GMT — check which applies)
- `info` — a **JSON string** with:

```json
{
  "autoPublish": true,
  "draft": <the post's draft flag>,
  "text": "<the group's caption>",
  "media": ["<the group's imageUrl>"],
  "mediaAltText": ["<the post's alt>"],
  "providers": [{"network": "<each network in the group>"}],
  "publicationDate": {"dateTime": "<publishAt>", "timezone": "<the queue's timezone>"},
  "<network>Data": { ... }
}
```

`networkData` per network:

- `"instagramData": {"type": "POST"}` — a still image is a POST, not a REEL
- `"facebookData": {"type": "POST"}`
- `"tiktokData": {"title": "<tiktokTitle>", "photoCoverIndex": 0, "privacyOption": "PUBLIC_TO_EVERYONE"}`

**`autoPublish` is not the draft flag.** `autoPublish: false` means "send a push
notification to the mobile app so a human publishes it by hand" — not a draft.
Keep `autoPublish: true` and use the separate `draft` field for review.

Work in date order. If a call fails, **keep going with the rest** — one bad day
should not block the other thirteen — and collect what failed.

If `$ARGUMENTS` is `dry`, print the payloads you would send and stop. Schedule
nothing, confirm nothing.

## 4. Confirm only what actually landed

`data/social/history.json` is what stops the feed repeating itself, so it must
record what was *really* scheduled — never what was attempted.

```bash
node scripts/publish-social-post.mjs --confirm --dates=2026-09-10,2026-09-11
```

Pass **only the dates that succeeded**. Anything omitted stays queued for next
time. Then commit both files:

```bash
git add data/social/history.json data/social/pending.json
git commit -m "chore(social): schedule N post(s) via Metricool MCP"
git push
```

`deploy.yml` ignores commits touching only `data/social/`, so this will not
trigger a site rebuild.

## 5. Report

How many scheduled, for which dates, draft or live, and anything that failed
with its reason. If posts remain queued, say so and why.

## Notes

- **Plan limits.** Metricool caps how many posts can sit scheduled at once. If a
  call is rejected for hitting the cap, stop, report it, and suggest lowering
  `batchDays` in `scripts/social/config.mjs`.
- **Never invent a post.** If the queue is empty, say so — do not compose one.
  Everything here is generated from `public/data/archive/`, which is what makes
  it safe to run unattended.
- **Instagram needs media.** Every queued post has a card, but if `media` is
  ever empty the call will be rejected — that is a bug upstream, not something
  to work around by dropping Instagram.
- **Race results are time-sensitive.** If the queue holds a pole or podium card
  from more than a day or two ago, mention it rather than scheduling stale news.
