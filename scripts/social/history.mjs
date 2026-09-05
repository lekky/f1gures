// scripts/social/history.mjs
//
// The committed log of what has already been posted. This is what stops the
// feed repeating itself: angles.mjs reads it to apply the key/subject/angle
// cooldowns, and the publish step appends to it.
//
// It lives in the repo (not on the server) so the anti-repetition state is
// versioned, reviewable, and survives a runner being recycled.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './sources.mjs';

export const HISTORY_PATH = path.join(ROOT, 'data/social/history.json');

/** Newest-first list of prior posts. Missing file = empty history. */
export function readHistory(file = HISTORY_PATH) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed?.posts) ? parsed.posts : [];
  } catch {
    return [];
  }
}

/**
 * Append one post and write the file back.
 *
 * Entries are trimmed to what selection actually needs plus enough to audit a
 * post after the fact - deliberately not the whole candidate, which carries
 * entire race documents.
 */
export function appendHistory(entry, file = HISTORY_PATH) {
  const posts = readHistory(file);
  const record = {
    date: entry.date,
    angle: entry.angle,
    key: entry.key,
    subject: entry.subject,
    headline: entry.headline,
    link: entry.link,
    platforms: entry.platforms || {},
    postedAt: entry.postedAt || new Date().toISOString(),
  };
  // Same-day re-runs replace rather than duplicate, so a retried workflow does
  // not double-count against the cooldowns.
  const next = posts.filter((p) => !(p.date === record.date && p.key === record.key));
  next.push(record);
  next.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ posts: next }, null, 2)}\n`);
  return record;
}

/** True when this date already has a logged post (guards double-posting). */
export function hasPostFor(date, file = HISTORY_PATH) {
  return readHistory(file).some((p) => p.date === date);
}
