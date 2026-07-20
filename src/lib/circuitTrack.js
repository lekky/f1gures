// Server-only helpers shared by CircuitPage.astro and RaceUpcomingBody.astro:
// resolve a circuit's curated profile, extract its animated track-map path from
// the curated SVG, and build the track-characteristics bar rows. Keeping the
// ref→id alias maps and the extraction logic in ONE place matters - the same
// maps were previously copied into CircuitPage, and CLAUDE.md flags these alias
// maps as a documented drift hazard.
//
// Imported by Astro frontmatter only (uses node:fs) - never ship to the client.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { circuitProfiles } from '../data/circuitProfiles.js';

// Track-map SVGs in public/images/circuits/{black,white}-outline/ use the
// site's internal ids (albert, marina, lasvegas, …) which diverge from
// Ergast's circuitRef in a handful of cases. Circuits without a curated SVG
// (the historic 50+) are absent → callers skip the map.
export const SVG_FOR_REF = {
  albert_park: 'albert',
  americas: 'cota',
  bahrain: 'bahrain',
  baku: 'baku',
  catalunya: 'catalunya',
  hungaroring: 'hungaroring',
  imola: 'imola',
  interlagos: 'interlagos',
  jeddah: 'jeddah',
  losail: 'losail',
  marina_bay: 'marina',
  miami: 'miami',
  monaco: 'monaco',
  monza: 'monza',
  red_bull_ring: 'spielberg',
  rodriguez: 'rodriguez',
  shanghai: 'shanghai',
  silverstone: 'silverstone',
  spa: 'spa',
  suzuka: 'suzuka',
  vegas: 'lasvegas',
  villeneuve: 'montreal',
  yas_marina: 'yas',
  zandvoort: 'zandvoort',
};

// Curated track characteristics + blurb live in src/data/circuitProfiles.js,
// keyed by the short ids the 2026 fallback grid uses (bahrain, albert, marina,
// …). This is the inverse of HAND_CIRCUIT_ALIAS in scripts/build-archive.mjs,
// which maps back from Ergast circuitRefs.
export const PROFILE_FOR_REF = {
  albert_park: 'albert',
  americas: 'cota',
  marina_bay: 'marina',
  red_bull_ring: 'spielberg',
  vegas: 'lasvegas',
  villeneuve: 'montreal',
  yas_marina: 'yas',
};

export const RATING_FILL = { Low: 33, Medium: 66, High: 100 };

// Resolve a curated circuit profile from an Ergast circuitRef (null when the
// historic circuit has no hand-curated entry).
export function getCircuitProfile(circuitRef) {
  const key = PROFILE_FOR_REF[circuitRef] || circuitRef;
  return circuitProfiles[key] || null;
}

// Pull the main racing-line path out of the curated SVG so callers can re-draw
// it inline (themed red line + a dot lapping the circuit) instead of swapping a
// flat <img>. The first <path> in every track SVG is the outline; the rest are
// start/finish-line ticks. Returns hasTrackPath:false (with svgName still set)
// when extraction fails, so callers can fall back to the flat-img swap.
export function getTrackMap(circuitRef) {
  const svgName = SVG_FOR_REF[circuitRef] || null;
  const svgPath = svgName
    ? resolve(process.cwd(), 'public', 'images', 'circuits', 'black-outline', `${svgName}.svg`)
    : null;
  const hasMap = !!svgPath && existsSync(svgPath);

  let trackD = '';
  let trackVB = '0 0 500 500';
  let trackStart = null;
  if (hasMap && svgPath) {
    try {
      const raw = readFileSync(svgPath, 'utf8');
      const dMatch = raw.match(/<path[^>]*\sd="([^"]+)"/);
      if (dMatch) trackD = dMatch[1];
      const vb = raw.match(/viewBox="([^"]+)"/);
      const w = raw.match(/\bwidth="(\d+)"/);
      const h = raw.match(/\bheight="(\d+)"/);
      if (vb) trackVB = vb[1];
      else if (w && h) trackVB = `0 0 ${w[1]} ${h[1]}`;
      const m = trackD.match(/^[Mm]\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/);
      if (m) trackStart = { x: parseFloat(m[1]), y: parseFloat(m[2]) };
    } catch {
      // leave trackD empty → hasTrackPath false → flat-img fallback
    }
  }
  return { svgName, hasMap, hasTrackPath: hasMap && !!trackD, trackD, trackVB, trackStart };
}

// Proportional fill for the value bars - each metric scaled against a rough
// real-world maximum so bar lengths read meaningfully against each other (a
// 7 km lap looks long, a 14-corner circuit looks short, etc).
const BAR_MAX = {
  Length: 7.1, Laps: 78, Corners: 27, 'Longest Straight': 2200, 'DRS Zones': 4,
};
function barPct(lbl, v) {
  const max = BAR_MAX[lbl] || v || 1;
  return Math.max(10, Math.min(100, (v / max) * 100));
}

// Build the track-characteristics bar rows from a curated profile. Rows are
// either { type: 'val', lbl, val, fill } or { type: 'rating', lbl, val }.
// firstRatingIdx marks where the rating group starts (for the divider rule).
export function buildCharacteristics(profile) {
  if (!profile) return { stats: [], firstRatingIdx: -1 };
  const stats = [
    profile.length          && { lbl: 'Length',           val: `${profile.length.toFixed(3)} km`, fill: barPct('Length', profile.length),                    type: 'val' },
    profile.laps            && { lbl: 'Laps',             val: profile.laps,                       fill: barPct('Laps', profile.laps),                        type: 'val' },
    profile.corners         && { lbl: 'Corners',          val: profile.corners,                    fill: barPct('Corners', profile.corners),                  type: 'val' },
    profile.longestStraight && { lbl: 'Longest Straight', val: `${profile.longestStraight} m`,     fill: barPct('Longest Straight', profile.longestStraight), type: 'val' },
    profile.drsZones        && { lbl: 'DRS Zones',        val: profile.drsZones,                   fill: barPct('DRS Zones', profile.drsZones),               type: 'val' },
    RATING_FILL[profile.tyreDeg]    && { lbl: 'Tyre Degradation', val: profile.tyreDeg,    type: 'rating' },
    RATING_FILL[profile.overtaking] && { lbl: 'Overtaking',       val: profile.overtaking, type: 'rating' },
  ].filter(Boolean);
  return { stats, firstRatingIdx: stats.findIndex(s => s.type === 'rating') };
}

// The outright lap record for a profile, or null when unset ('-' placeholder).
export function getLapRecord(profile) {
  return profile && profile.lapRecord && profile.lapRecord.driver !== '-' ? profile.lapRecord : null;
}
