// scripts/social/publish/metricool.mjs
//
// Publishes through Metricool's scheduler rather than talking to each network
// directly.
//
// Why: Instagram, TikTok and Facebook are the three hardest APIs to run
// unattended. Instagram needs a Business account, a linked Page and a
// container-then-publish dance; TikTok's direct-post API needs app audit and
// rotates its access token every 24 hours; Meta's long-lived tokens expire
// every 60 days. Metricool already holds those connections, so this pipeline
// hands it one request and lets it own the OAuth, the rotation and the
// per-network quirks.
//
// All three still need the image on a public URL - none of them accept raw
// bytes from us here - which is why the workflow uploads the rendered cards to
// f1gures.app before this runs.
//
// API shape (token in an X-Mc-Auth header; userId + blogId as query params on
// every call) is per Metricool's API docs - see docs/social-posts.md for which
// fields are verified and how to re-check them if a call starts 400ing.

const BASE = 'https://app.metricool.com/api';

/** Networks this pipeline targets, in Metricool's own naming. */
export const NETWORKS = ['instagram', 'facebook', 'tiktok'];

export class MetricoolError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'MetricoolError';
    this.status = status;
    this.body = body;
  }
}

/** Read credentials from the environment. Returns null when unconfigured. */
export function readConfig(env = process.env) {
  const token = env.METRICOOL_USER_TOKEN;
  const userId = env.METRICOOL_USER_ID;
  const blogId = env.METRICOOL_BLOG_ID;
  if (!token || !userId || !blogId) return null;
  return { token, userId, blogId, timezone: env.SOCIAL_TIMEZONE || 'Europe/London' };
}

function url(cfg, pathname, params = {}) {
  const u = new URL(`${BASE}${pathname}`);
  u.searchParams.set('userId', cfg.userId);
  u.searchParams.set('blogId', cfg.blogId);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  }
  return u.toString();
}

async function request(cfg, pathname, { method = 'GET', params, body } = {}) {
  const resp = await fetch(url(cfg, pathname, params), {
    method,
    headers: {
      'X-Mc-Auth': cfg.token,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await resp.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!resp.ok) {
    // Surface the body verbatim: a rejected field name is the most likely
    // cause of a failure here, and the response says which one.
    throw new MetricoolError(
      `Metricool ${method} ${pathname} failed: ${resp.status} ${resp.statusText}`,
      { status: resp.status, body: parsed },
    );
  }
  return parsed;
}

/**
 * Hand Metricool a public image URL and get back the URL it wants referenced
 * in a post. Non-fatal: if normalisation is unavailable the original URL is
 * used, which is already publicly reachable.
 */
export async function normalizeImage(cfg, imageUrl) {
  try {
    const res = await request(cfg, '/actions/normalize/image/url', { params: { url: imageUrl } });
    if (typeof res === 'string' && res.startsWith('http')) return res;
    return res?.url || res?.data?.url || imageUrl;
  } catch (err) {
    console.warn(`[social] media normalize failed (${err.message}); using the original URL.`);
    return imageUrl;
  }
}

/**
 * Schedule (or immediately publish) one post.
 *
 * @param {object}   cfg
 * @param {object}   post
 * @param {string}   post.text        caption, hashtags included
 * @param {string}   post.imageUrl    public URL of the card
 * @param {string[]} post.networks    subset of NETWORKS
 * @param {string}   post.publishAt   local ISO datetime, no offset (e.g. 2026-09-05T10:00:00)
 * @param {string}   post.timezone    IANA zone the datetime is expressed in
 * @param {boolean}  post.draft       true = lands in the calendar for review, never auto-publishes
 * @param {string}   [post.tiktokTitle]
 */
export async function schedulePost(cfg, post) {
  const media = await normalizeImage(cfg, post.imageUrl);

  const body = {
    text: post.text,
    providers: post.networks.map((network) => ({ network })),
    publicationDate: {
      dateTime: post.publishAt,
      timezone: post.timezone || cfg.timezone,
    },
    media: [media],
    // draft:true parks the post in Metricool's calendar instead of sending it.
    draft: Boolean(post.draft),
    autoPublish: !post.draft,
  };

  if (post.networks.includes('tiktok') && post.tiktokTitle) {
    body.tiktokData = { title: post.tiktokTitle };
  }
  if (post.networks.includes('instagram')) {
    body.instagramData = { type: 'POST' };
  }

  const res = await request(cfg, '/v2/scheduler/posts', { method: 'POST', body });
  return { id: res?.id ?? res?.data?.id ?? null, request: body, response: res };
}
