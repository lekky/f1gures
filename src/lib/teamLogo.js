// Build-time team-logo lookup, shared by the race + circuit detail tables.
// Logo files in public/images/teams/ are keyed by the bundle short id
// (redbull.jpg, aston.jpg), so map the Ergast/bundle constructorRef → logo
// basename. Only the ~13 current teams ship a logo; everyone else returns null
// (the cell just shows the team name). Server-only — imported by Astro
// frontmatter, never shipped to the client. Memoized per ref.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const LOGO_FOR_REF = {
  alpine: 'alpine', aston: 'aston', aston_martin: 'aston', audi: 'audi',
  cadillac: 'cadillac', ferrari: 'ferrari', haas: 'haas', mclaren: 'mclaren',
  mercedes: 'mercedes', rb: 'rb', redbull: 'redbull', red_bull: 'redbull',
  williams: 'williams',
};

const cache = new Map();

export function teamLogoPath(ref) {
  if (!ref) return null;
  if (!cache.has(ref)) {
    const base = LOGO_FOR_REF[ref];
    const rel = base ? `images/teams/${base}.jpg` : null;
    cache.set(ref, rel && existsSync(resolve(process.cwd(), 'public', rel)) ? `/${rel}` : null);
  }
  return cache.get(ref);
}
