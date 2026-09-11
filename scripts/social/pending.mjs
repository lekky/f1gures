// scripts/social/pending.mjs
//
// The MCP hand-off queue.
//
// On plans without REST API access, CI cannot schedule posts itself - the
// Metricool MCP signs in as a person, and a cron job has no browser session.
// So CI does everything up to the last step and parks the finished posts here;
// a Claude session with the Metricool MCP connected picks them up and calls
// post_schedule_post for each (see .claude/commands/social-schedule.md).
//
// The file is committed for the same reason the history log is: it is state,
// not an artefact. A runner being recycled must not lose a fortnight of posts.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './sources.mjs';
import { SOCIAL_CONFIG } from './config.mjs';

export const pendingPath = (cfg = SOCIAL_CONFIG) => path.join(ROOT, cfg.pendingPath);

/** Posts waiting to be scheduled. Missing file = nothing waiting. */
export function readPending(file = pendingPath()) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed?.posts) ? parsed.posts : [];
  } catch {
    return [];
  }
}

/**
 * Replace the queue.
 *
 * Writing an empty list leaves an empty file rather than deleting it, so the
 * queue's existence is never ambiguous in a diff.
 */
export function writePending(posts, file = pendingPath(), cfg = SOCIAL_CONFIG) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // The brand is written into the file so whoever places these posts does not
  // have to look it up - this account has several brands and picking the wrong
  // one puts F1 content on someone else's feed.
  const body = {
    updatedAt: new Date().toISOString(),
    blogId: cfg.blogId,
    brandLabel: cfg.brandLabel,
    timezone: cfg.timezone,
    posts,
  };
  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
  return posts;
}

/**
 * A post's identity: the date it goes out plus the candidate it was drawn from.
 *
 * It used to be the date alone, which meant one post per day full stop - a
 * second queued post for a date silently replaced the first. A race weekend
 * wants several (FP1, FP2, qualifying, the race), so the key joins it.
 *
 * Derived rather than stored, so queues written before this still resolve.
 */
export const slotOf = (p) => `${p?.date}:${p?.key ?? ''}`;

/**
 * Add posts to the queue, replacing any entry for the same slot so a re-run of
 * the build does not double-queue the same post. Different sessions on one date
 * are different slots and all survive.
 */
export function queuePending(posts, file = pendingPath()) {
  const existing = readPending(file);
  const slots = new Set(posts.map(slotOf));
  const merged = [...existing.filter((p) => !slots.has(slotOf(p))), ...posts]
    .sort((a, b) => slotOf(a).localeCompare(slotOf(b)));
  return writePending(merged, file);
}

/**
 * Push stale publish times forward, pure.
 *
 * A result post is built with publishAt = "as soon as the scheduler will take
 * it", but on the mcp route nothing is placed until a person (or the Routine)
 * runs /social-schedule. By then that time has usually gone, and Metricool
 * either rejects the post or fires it the instant it is created.
 *
 * Anything at or behind `earliest` moves to it; anything still comfortably
 * ahead - every batch-scheduled evening slot on a future date - is returned
 * untouched, same object identity, so a no-op run rewrites nothing.
 *
 * @param {Array} posts    the queue
 * @param {string} earliest local wall clock, "YYYY-MM-DDTHH:MM:SS"
 * @returns {{posts: Array, moved: Array<{date, from, to}>}}
 */
export function reslotPending(posts, earliest) {
  const moved = [];
  const next = posts.map((post) => {
    if (String(post.publishAt) >= earliest) return post;
    moved.push({ date: post.date, from: post.publishAt, to: earliest });
    return { ...post, publishAt: earliest };
  });
  return { posts: next, moved };
}

/**
 * Drop the given slots from the queue - called once they are scheduled.
 *
 * Accepts a bare date too ("2026-09-11"), which clears every post on that date.
 * That keeps `--confirm --dates=` working, and it is what a caller means when
 * it names a day rather than a session.
 */
export function clearPending(slots, file = pendingPath()) {
  const drop = new Set(slots);
  const kept = readPending(file).filter((p) => !drop.has(slotOf(p)) && !drop.has(p.date));
  writePending(kept, file);
  return kept;
}
