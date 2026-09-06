// scripts/social/config.mjs
//
// ── THE KNOBS ────────────────────────────────────────────────────────────────
// Everything you are likely to want to change about the social posts lives in
// this one file. Change a value, commit, done - no other file needs editing.
// The schedules themselves (when the jobs run) are the two crons in
// .github/workflows/social-post.yml.

export const SOCIAL_CONFIG = {
  // ── When posts go out ──────────────────────────────────────────────────────
  // Local time of day for a scheduled post, 24h "HH:MM". Metricool is told this
  // time in `timezone`, so it stays correct across BST/GMT on its own.
  postTime: '10:00',
  timezone: 'Europe/London',

  // ── How far ahead the evergreen batch schedules ────────────────────────────
  // The batch job fills the Metricool calendar this many days forward. Raise it
  // to review a month at a time; lower it to stay nimble. The job is safe to
  // re-run - it skips dates already in the history log.
  batchDays: 14,

  // ── Which Metricool brand ──────────────────────────────────────────────────
  // This account has several brands. Posting f1gures content to the wrong one
  // is the worst failure mode here, so the id is pinned rather than resolved by
  // name at runtime. From getBrandSettings: F1gures, Instagram @f1gures.app,
  // TikTok @f1gures.app, Facebook page 1163379676862979.
  blogId: '6692452',
  brandLabel: 'F1gures',

  // ── Where posts go ─────────────────────────────────────────────────────────
  // Drop a network from this list to stop posting there.
  networks: ['instagram', 'facebook', 'tiktok'],

  // Which card shape each network gets. Instagram and Facebook take the 4:5
  // portrait (most feed real estate); TikTok's photo post wants 9:16.
  formatForNetwork: {
    instagram: 'portrait',
    facebook: 'portrait',
    tiktok: 'story',
  },

  // ── How posts reach Metricool ──────────────────────────────────────────────
  // 'mcp' - CI builds the posts, uploads the cards and writes a hand-off file.
  //         You schedule them from a Claude session with the Metricool MCP
  //         connected (run /social-schedule). Works on ANY Metricool plan,
  //         because the MCP signs in as you rather than using an API token.
  // 'api' - CI schedules them itself over the REST API, fully unattended.
  //         Needs Metricool Advanced or Custom (the API is not on lower plans)
  //         plus the three METRICOOL_* repository secrets.
  publishVia: 'mcp',

  // Where the MCP hand-off file is written. Committed, so the posts waiting to
  // be scheduled are visible in the repo and survive a runner being recycled.
  pendingPath: 'data/social/pending.json',

  // ── Draft vs live ──────────────────────────────────────────────────────────
  // true  = posts land in the Metricool calendar for you to review and approve.
  // false = Metricool publishes them automatically at postTime.
  // Start true. Flip to false when you are happy with a couple of weeks' worth.
  draft: true,

  // ── Race weekends ──────────────────────────────────────────────────────────
  // Result posts (pole, sprint, podium) cannot be scheduled in advance - the
  // result does not exist yet - so the live job owns the days around a race and
  // the batch job leaves them alone. Window is in days either side of race day:
  // -1 = qualifying Saturday, 0 = race day, +1 = the morning after.
  raceWindow: { before: 1, after: 1 },

  // Angles the live job is allowed to post. Everything else is batch-scheduled.
  liveAngles: ['race-result', 'quali-result', 'sprint-result'],

  // ── Link tagging ───────────────────────────────────────────────────────────
  // Only Facebook makes URLs in a post clickable. Instagram and TikTok render
  // them as plain text, so a long ?utm_... string there is unclickable clutter
  // that also looks like spam - those networks get the clean URL, and their
  // performance is read in Metricool's own per-post analytics instead.
  utm: {
    enabled: true,
    networks: ['facebook'],
    source: 'facebook',
    medium: 'social',
    campaign: 'daily-post',
  },
};

/** "10:00" + "2026-09-06" -> "2026-09-06T10:00:00" (no offset; timezone carries it). */
export function publishAtFor(date, cfg = SOCIAL_CONFIG) {
  const [h = '10', m = '00'] = String(cfg.postTime).split(':');
  return `${date}T${h.padStart(2, '0')}:${m.padStart(2, '0')}:00`;
}

/** Append campaign tags to a URL. Existing query strings are preserved. */
export function withUtm(rawUrl, network, cfg = SOCIAL_CONFIG) {
  const { utm } = cfg;
  if (!utm?.enabled || !utm.networks.includes(network)) return rawUrl;
  try {
    const u = new URL(rawUrl);
    u.searchParams.set('utm_source', utm.source || network);
    u.searchParams.set('utm_medium', utm.medium || 'social');
    u.searchParams.set('utm_campaign', utm.campaign || 'daily-post');
    return u.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Dates the live job owns, because a result will exist for them and cannot be
 * known in advance. The batch job skips these.
 */
export function raceOwnedDates(races, cfg = SOCIAL_CONFIG) {
  const owned = new Set();
  const { before, after } = cfg.raceWindow;
  for (const r of races) {
    if (!r.date) continue;
    const base = Date.parse(`${r.date}T00:00:00Z`);
    if (Number.isNaN(base)) continue;
    for (let d = -before; d <= after; d++) {
      owned.add(new Date(base + d * 86400000).toISOString().slice(0, 10));
    }
  }
  return owned;
}
