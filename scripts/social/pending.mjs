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
 * Add posts to the queue, replacing any entry for the same date so a re-run of
 * the build does not double-queue a day.
 */
export function queuePending(posts, file = pendingPath()) {
  const existing = readPending(file);
  const dates = new Set(posts.map((p) => p.date));
  const merged = [...existing.filter((p) => !dates.has(p.date)), ...posts]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return writePending(merged, file);
}

/** Drop the given dates from the queue - called once they are scheduled. */
export function clearPending(dates, file = pendingPath()) {
  const drop = new Set(dates);
  const kept = readPending(file).filter((p) => !drop.has(p.date));
  writePending(kept, file);
  return kept;
}
