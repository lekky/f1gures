// Content-hash a file in public/ at build time, return a short hex digest
// for use as a cache-bust query string (`?v=<hash>`). The link URL only
// changes when the file's bytes change, so prerendered HTML stays byte-
// identical across PRs that don't touch the asset - incremental FTP
// deploys then upload only the asset itself, not every HTML.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const cache = new Map();

export function publicAssetHash(relPath) {
  if (cache.has(relPath)) return cache.get(relPath);
  const path = resolve(process.cwd(), 'public', relPath);
  if (!existsSync(path)) {
    // Fall back to '0' if the file is missing - degrades gracefully on
    // build environments where the asset hasn't been generated yet.
    cache.set(relPath, '0');
    return '0';
  }
  const buf = readFileSync(path);
  const hash = createHash('md5').update(buf).digest('hex').slice(0, 8);
  cache.set(relPath, hash);
  return hash;
}
