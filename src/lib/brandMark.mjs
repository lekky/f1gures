// Geometry of the brand wordmark PNGs in public/images/logo/, baked from the
// source kit by scripts/build-brand-assets.mjs.
//
// The lockup is letters plus the speed streaks that sweep above and below
// them, so the letterforms are only about a third of the file's height - where
// the wordmark this replaced was a plate whose letters filled 54% of it. Drawn
// at the same height, the new art therefore reads noticeably smaller.
//
// Every surface that draws the wordmark reserves a vertical band for it. Rather
// than re-tune each of those layouts, we keep the band as it was and let the
// artwork overdraw it: the extra height is transparent glow, so it can sit over
// the padding on either side without touching anything. wordmarkRect() does
// that centring.
//
// Plain ESM with no imports, so the canvas share cards, the islands and the
// Node-side OG templates can all read the same numbers.

/** Letter cap height as a fraction of the wordmark PNG's height. */
export const WORDMARK_CAP_RATIO = 0.327;

/** The same fraction for the pre-2026 wordmark, kept as the sizing reference. */
const LEGACY_CAP_RATIO = 0.539;

/** Multiplier that makes the new art's letters match the old art's at a given band height. */
export const WORDMARK_DRAW_SCALE = LEGACY_CAP_RATIO / WORDMARK_CAP_RATIO; // ≈ 1.648

/**
 * Where to draw the wordmark so its letters stay centred on an existing layout band.
 *
 * @param {{ width: number, height: number }} img  the loaded wordmark image
 * @param {number} bandTop     top of the band the layout reserved for it
 * @param {number} bandHeight  height of that band (i.e. the old drawn height)
 * @returns {{ y: number, w: number, h: number }} draw box; `y` may sit above `bandTop`
 */
export function wordmarkRect(img, bandTop, bandHeight) {
  const h = bandHeight * WORDMARK_DRAW_SCALE;
  const w = (img.width / img.height) * h;
  return { y: bandTop - (h - bandHeight) / 2, w, h };
}
