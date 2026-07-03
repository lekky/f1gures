// Build-time team-logo lookup, shared by the race + circuit detail tables.
// Logo files in public/images/teams/ are keyed by the Ergast/bundle
// constructorRef (brabham.jpg, alfa.jpg, ...) with two aliases where the
// bundle short id diverges (red_bull → redbull, aston_martin → aston, matching
// TEAM_LOGO_ALIAS in shared.jsx). We resolve by file existence, so any ref with
// a logo on disk lights up and refs without one return null (the cell just
// shows the team name). Server-only — imported by Astro frontmatter, never
// shipped to the client. Memoized per ref.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const LOGO_ALIAS = { red_bull: 'redbull', aston_martin: 'aston', team_lotus: 'lotus' };

const cache = new Map();

// Resolve a logo basename to its public path, or null when the file is absent.
function fileFor(slug) {
  const rel = `images/teams/${slug}.jpg`;
  return existsSync(resolve(process.cwd(), 'public', rel)) ? `/${rel}` : null;
}

export function teamLogoPath(ref) {
  if (!ref) return null;
  if (!cache.has(ref)) {
    // 1. exact ref (via alias where the bundle short id diverges)
    // 2. engine-suffixed constructorRef → base marque (cooper-climax → cooper,
    //    lotus-ford → lotus). Ergast splits one team into many refs by engine;
    //    they share the constructor's logo.
    const base = ref.includes('-') ? ref.slice(0, ref.indexOf('-')) : null;
    const found = fileFor(LOGO_ALIAS[ref] || ref)
      || (base ? fileFor(LOGO_ALIAS[base] || base) : null);
    cache.set(ref, found);
  }
  return cache.get(ref);
}
