#!/usr/bin/env node
/**
 * Brand-asset bake. MANUAL (not in prebuild) - run it only when the artwork in
 * design-system/brand/source/ changes:
 *
 *   npm run build:brand
 *
 * The source kit is three flat rasters supplied by the designer: the wordmark
 * on a black plate, the same wordmark on a white plate, and the square "F1."
 * icon on black. This script derives every asset the site actually ships:
 *
 *   public/images/logo/f1gures-wordmark-{dark,light}.png  transparent wordmarks
 *   public/images/logo/icon-{192,512}.png                 maskable app icons
 *   public/favicon.png, favicon-{32x32,16x16}.png         browser icons
 *   public/apple-touch-icon.png                           iOS home screen
 *
 * Two things make this more than a resize:
 *
 * 1. TRANSPARENCY. The source plates are opaque, but the nav, the footer and
 *    every share card draw the wordmark over their own background. The glow
 *    around the speed streaks is a gradient to the plate colour, so a simple
 *    colour-key would leave a halo. Instead we treat the plate as the zero
 *    point of an alpha ramp and un-premultiply against it: on black,
 *    alpha = max(r,g,b); on white, alpha = 1 - min(r,g,b). Both recover the
 *    original ink colour at every alpha, so the streaks fade out cleanly on
 *    any background rather than into a black or white smudge.
 *
 * 2. CAP-HEIGHT NORMALISATION. The two wordmark sources are cropped and scaled
 *    differently, so cropping each to its own ink bounds would make the letters
 *    change size when the theme toggles. We measure the solid letterforms in
 *    each (white ink on the dark plate, black ink on the light one) and lay out
 *    the output canvas in multiples of that cap height, so both files render at
 *    an identical letter size for a given CSS height. Their widths differ by
 *    ~2% because the two rasters aren't pixel-identical; that's fine, they are
 *    never on screen together.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'design-system/brand/source');
const LOGO_DIR = path.join(ROOT, 'public/images/logo');
const PUBLIC = path.join(ROOT, 'public');

// ── output geometry, expressed in cap heights of the wordmark letters ──
// Measured off the source art: the streaks reach ~1 cap height above and below
// the letters, ~0.3 to the left and ~0.6 to the right. Rounded up slightly so
// neither source's glow gets clipped.
const WM = { top: 1.03, bottom: 1.03, left: 0.32, right: 0.70, outHeight: 264 };

// Icon: the "F1." glyphs are scaled to this fraction of the tile width. 0.68
// keeps the glyph box inside the 80%-diameter maskable safe zone (its half
// diagonal lands at 0.367 of the tile, under the 0.40 limit) while matching
// the optical weight of the icon it replaces.
const ICON_GLYPH_W = 0.68;
// Same, for 16/32px favicons: too small for the streaks to read, so the glyphs
// are pushed larger and the streaks just tint the tile.
const ICON_GLYPH_W_TINY = 0.80;

// ── pixel helpers ───────────────────────────────────────────────────────────

async function readRaw(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, ch: info.channels };
}

/** Bounding box of pixels satisfying `hit(r,g,b)`, or null if none do. */
function bbox({ data, w, h, ch }, hit) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      if (!hit(data[i], data[i + 1], data[i + 2])) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Un-premultiply an opaque plate into straight RGBA.
 * `plate` is 'black' or 'white'; a few levels of sensor-ish noise around the
 * plate colour are treated as fully transparent.
 */
function keyPlate({ data, w, h, ch }, plate) {
  const FLOOR = 4; // ignore noise within this many levels of the plate colour
  const out = Buffer.alloc(w * h * 4);
  for (let p = 0, q = 0; q < out.length; p += ch, q += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    let a;
    if (plate === 'black') a = Math.max(r, g, b);
    else a = 255 - Math.min(r, g, b);
    a = a <= FLOOR ? 0 : Math.min(255, Math.round(((a - FLOOR) * 255) / (255 - FLOOR)));
    if (a === 0) { out[q] = out[q + 1] = out[q + 2] = out[q + 3] = 0; continue; }
    const k = a / 255;
    // Straight colour = (composited - plate * (1 - alpha)) / alpha.
    const base = plate === 'black' ? 0 : 255;
    const un = (c) => Math.max(0, Math.min(255, Math.round((c - base * (1 - k)) / k)));
    out[q] = un(r); out[q + 1] = un(g); out[q + 2] = un(b); out[q + 3] = a;
  }
  return { data: out, w, h, ch: 4 };
}

const raw = ({ data, w, h, ch }) => sharp(data, { raw: { width: w, height: h, channels: ch } });

/** Rounded-rectangle alpha mask, as an SVG buffer sharp can composite with. */
const roundedMask = (size, radiusPct) =>
  Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" ` +
      `rx="${Math.round(size * radiusPct)}" ry="${Math.round(size * radiusPct)}" fill="#fff"/></svg>`,
  );

// The art is three flat colours plus glow ramps, so an indexed palette is
// visually lossless here and roughly halves the bytes - and the wordmark ships
// on every page (both themes are in the DOM, so both get fetched).
const PNG_OPTS = { compressionLevel: 9, palette: true, colours: 256, effort: 10 };

function write(file, buf) {
  fs.writeFileSync(file, buf);
  console.log(`[brand] ${path.relative(ROOT, file)}  (${(buf.length / 1024).toFixed(1)} kB)`);
}

// ── wordmarks ───────────────────────────────────────────────────────────────

/**
 * @param {'dark'|'light'} variant  'dark' = the black-plate art (light ink),
 *                                  'light' = the white-plate art (dark ink).
 */
async function buildWordmark(variant) {
  const plate = variant === 'dark' ? 'black' : 'white';
  const src = await readRaw(path.join(SRC, `wordmark-${variant}.png`));

  // Solid letterforms only: the "1" and the full stop are red in both variants,
  // so keying on the neutral ink gives a clean cap height either way.
  const isLetter =
    plate === 'black'
      ? (r, g, b) => Math.min(r, g, b) > 200
      : (r, g, b) => Math.max(r, g, b) < 55;
  const glyph = bbox(src, isLetter);
  if (!glyph) throw new Error(`wordmark-${variant}: could not find the letterforms`);

  const cap = glyph.h;
  const box = {
    left: Math.round(glyph.x0 - WM.left * cap),
    top: Math.round(glyph.y0 - WM.top * cap),
    width: Math.round(glyph.w + (WM.left + WM.right) * cap),
    height: Math.round((WM.top + 1 + WM.bottom) * cap),
  };

  const keyed = keyPlate(src, plate);
  // extend() pads with transparent where the crop runs past the source edge.
  const pad = {
    left: Math.max(0, -box.left),
    top: Math.max(0, -box.top),
    right: Math.max(0, box.left + box.width - src.w),
    bottom: Math.max(0, box.top + box.height - src.h),
  };
  // Separate passes: queued together sharp runs the extract before the extend,
  // and the crop would then be reading outside the source.
  const padded = await raw(keyed)
    .extend({ ...pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const buf = await sharp(padded)
    .extract({
      left: box.left + pad.left,
      top: box.top + pad.top,
      width: box.width,
      height: box.height,
    })
    .resize({ height: WM.outHeight, kernel: 'lanczos3' })
    .png(PNG_OPTS)
    .toBuffer();

  write(path.join(LOGO_DIR, `f1gures-wordmark-${variant}.png`), buf);
  const meta = await sharp(buf).metadata();
  return { variant, width: meta.width, height: meta.height, capFraction: cap / box.height };
}

// ── icons ───────────────────────────────────────────────────────────────────

/**
 * The square mark, scaled so the glyphs take `glyphW` of the tile and centred
 * on a black plate. `radiusPct` > 0 rounds the corners (browser icons, which
 * are shown as-authored); the maskable ones stay full-bleed square.
 */
async function buildIcon(size, { glyphW = ICON_GLYPH_W, radiusPct = 0 } = {}) {
  const src = await readRaw(path.join(SRC, 'icon.png'));

  // White "F" plus the red "1" and stop. The streaks are red too, but they sit
  // in their own horizontal bands, so glyphBox() only takes red from the "F"'s
  // rows.
  const white = bbox(src, (r, g, b) => Math.min(r, g, b) > 200);
  if (!white) throw new Error('icon: could not find the glyphs');
  const glyph = glyphBox(src, white);

  if (process.env.BRAND_DEBUG) console.log('[brand] glyph box', glyph);
  const scale = (glyphW * size) / glyph.w;
  const artW = Math.max(1, Math.round(src.w * scale));
  const artH = Math.max(1, Math.round(src.h * scale));
  // Offset so the glyph box lands dead centre of the tile.
  const cx = (glyph.x0 + glyph.x1 + 1) / 2;
  const cy = (glyph.y0 + glyph.y1 + 1) / 2;
  const left = Math.round(size / 2 - cx * scale);
  const top = Math.round(size / 2 - cy * scale);

  // Take the tile straight out of the scaled art rather than compositing it
  // onto a canvas - at favicon sizes the art is wider than the tile, and
  // composite() refuses an input bigger than its target.
  const black = { r: 0, g: 0, b: 0, alpha: 1 };
  const pad = {
    left: Math.max(0, left),
    top: Math.max(0, top),
    right: Math.max(0, size - left - artW),
    bottom: Math.max(0, size - top - artH),
  };
  if (process.env.BRAND_DEBUG) console.log('[brand] tile', { size, scale, artW, artH, left, top, pad });
  const scaled = await raw(src).resize(artW, artH, { kernel: 'lanczos3' }).png().toBuffer();
  // extend() and extract() have to be separate passes: queued together, sharp
  // runs the extract first and it would be reading outside the un-padded art.
  const padded = await sharp(scaled).extend({ ...pad, background: black }).png().toBuffer();
  const tile = await sharp(padded)
    .extract({ left: pad.left - left, top: pad.top - top, width: size, height: size })
    .png()
    .toBuffer();

  const img =
    radiusPct > 0
      ? sharp(tile).composite([{ input: roundedMask(size, radiusPct), blend: 'dest-in' }])
      : sharp(tile).flatten({ background: black });
  return img.png(PNG_OPTS).toBuffer();
}

/** Union of the white glyphs and the red glyphs that share the white's rows. */
function glyphBox(src, white) {
  const { data, w, ch } = src;
  let x0 = white.x0, x1 = white.x1, y0 = white.y0, y1 = white.y1;
  for (let y = white.y0; y <= white.y1; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (!(r > 140 && g < 80 && b < 80)) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(LOGO_DIR, { recursive: true });

  const marks = [await buildWordmark('dark'), await buildWordmark('light')];
  for (const m of marks) {
    console.log(
      `[brand] wordmark-${m.variant}: ${m.width}x${m.height}, cap height ` +
        `${(m.capFraction * 100).toFixed(1)}% of the image`,
    );
  }

  // Maskable PWA icons: full-bleed, the OS supplies the mask.
  write(path.join(LOGO_DIR, 'icon-512.png'), await buildIcon(512));
  write(path.join(LOGO_DIR, 'icon-192.png'), await buildIcon(192));
  // iOS masks apple-touch-icon itself, so it stays full-bleed too.
  write(path.join(PUBLIC, 'apple-touch-icon.png'), await buildIcon(180));
  // Browser icons are drawn as authored - keep the rounded tile they had.
  write(path.join(PUBLIC, 'favicon.png'), await buildIcon(256, { radiusPct: 0.19 }));
  write(path.join(PUBLIC, 'favicon-32x32.png'), await buildIcon(32, { glyphW: ICON_GLYPH_W_TINY, radiusPct: 0.19 }));
  write(path.join(PUBLIC, 'favicon-16x16.png'), await buildIcon(16, { glyphW: ICON_GLYPH_W_TINY, radiusPct: 0.19 }));
}

main().catch((err) => {
  console.error('[brand] failed:', err);
  process.exit(1);
});
