---
description: Schedule the queued f1gures social posts into Metricool via the Metricool MCP, then mark them done.
argument-hint: "[optional] 'dry' to preview without scheduling"
---

# Schedule the queued social posts

The daily/fortnightly workflow builds the posts, renders the cards, uploads them
to `f1gures.app/social/` and parks them in **`data/social/pending.json`**. It
cannot schedule them itself: the Metricool MCP signs in as a person, and a cron
job has no browser session. That last step is this command.

**Prerequisite:** the Metricool MCP must be connected in this session. If no
`post_schedule_post` tool is available, stop and tell the user to add
`https://ai.metricool.com/mcp` as a connector and authorise it — do not try to
schedule any other way, and never fall back to the REST API (this account's plan
does not include it).

## 1. Read the queue

```bash
git pull                      # the workflow commits the queue; get the latest
cat data/social/pending.json
```

Each entry carries everything needed, already composed — **do not rewrite any of
it**. The captions are generated from the archive and the numbers in them are
verified; editing them by hand is how a wrong stat reaches a live account.

```
date          the calendar day the post is for
publishAt     local datetime, no offset  e.g. "2026-09-08T10:00:00"
timezone      the zone publishAt is expressed in  e.g. "Europe/London"
draft         true = park in the calendar for review, false = let it publish
groups[]      one entry per Metricool post:
  networks[]    which networks this group goes to
  format        which card shape (portrait / story)
  imageUrl      the public URL of the card, already uploaded
  caption       the exact text to post
tiktokTitle   short title for TikTok (max 90 chars)
alt           alt text
```

**Why groups, not one post per date:** Metricool takes one media URL per post.
Instagram and Facebook take the 4:5 portrait card, TikTok takes the 9:16 story
card, and Facebook's caption carries UTM-tagged links the other two do not (only
Facebook makes URLs clickable). So one date is typically three Metricool posts.

## 2. Check the cards are actually live

Spot-check one `imageUrl` per run. Instagram, TikTok and Facebook all *pull*
the image from that URL — if it 404s, the post fails at Metricool's end, not
ours. If the URLs are dead, stop: the workflow's upload step failed and the
posts need rebuilding, not rescheduling.

## 3. Schedule each group

For every entry, for every group, call **`post_schedule_post`** with the
caption, the image URL, the networks, and `publishAt` + `timezone` exactly as
given. Set draft/autopublish to match the entry's `draft` field.

Work through them in date order. If a call fails, **keep going with the rest** —
a failure on one day should not block the other thirteen — and collect what
failed.

If `$ARGUMENTS` is `dry`, print what you would schedule and stop here. Schedule
nothing, confirm nothing.

## 4. Confirm only what actually landed

This is the step that keeps the pipeline honest. `data/social/history.json` is
what stops the feed repeating itself, so it must record what was *really*
scheduled — never what was attempted.

```bash
node scripts/publish-social-post.mjs --confirm --dates=2026-09-08,2026-09-10
```

Pass **only the dates that succeeded**. Anything omitted stays in the queue and
gets picked up next time. Then commit both files:

```bash
git add data/social/history.json data/social/pending.json
git commit -m "chore(social): schedule N post(s) via Metricool MCP"
git push
```

`deploy.yml` ignores commits that only touch `data/social/`, so this will not
trigger a site rebuild.

## 5. Report

Tell the user: how many were scheduled, for which dates, whether they went in as
drafts or live, and anything that failed with the reason. If posts remain in the
queue, say so and why.

## Notes

- **Plan limits.** Metricool caps how many posts can sit scheduled at once. If a
  call is rejected for hitting the cap, stop scheduling, report it, and suggest
  lowering `batchDays` in `scripts/social/config.mjs`.
- **Never invent a post.** If the queue is empty, say so — do not compose one.
  Everything posted here is generated from `public/data/archive/`, which is what
  makes it safe to run unattended.
- **Race results** (pole, sprint, podium) are queued by the daily job on race
  weekends and are time-sensitive. If the queue holds one from more than a day
  or two ago, mention it rather than scheduling stale news.
