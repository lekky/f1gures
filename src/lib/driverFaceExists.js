// Build-time check for whether a curated driver headshot exists in
// public/images/drivers/<ref>.webp. Only ~32 modern drivers ship one; the rest
// fall back to a flag/silhouette. Memoized so repeated lookups across a page
// (results + podium) hit the filesystem once per ref. Server-only — imported by
// Astro frontmatter, never shipped to the client.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const cache = new Map();

export function hasDriverFace(ref) {
  if (!ref) return false;
  if (!cache.has(ref)) {
    cache.set(ref, existsSync(resolve(process.cwd(), 'public', 'images', 'drivers', `${ref}.webp`)));
  }
  return cache.get(ref);
}
