// Shared layout primitives for OG image templates rendered with Satori.
// Returns plain Satori-style JSX object trees (no React).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export const COLORS = {
  bg: '#0a0a0a',
  bgGrad: '#1a1a1a',
  text: '#f5f5f5',
  muted: '#a0a0a0',
  accent: '#ff5f5f',
  panel: '#16171c',
  line: '#2a2c34',
  fg3: '#9a9ba1',
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DRIVERS_DIR = path.join(ROOT, 'public/images/drivers');
const TEAMS_DIR = path.join(ROOT, 'public/images/teams');

// Team-logo filename aliases (bundle/Ergast ref -> logo basename). Mirrors the
// maps in compareShareCard.js / urlFor; keep in sync.
const LOGO_ALIAS = { red_bull: 'redbull', aston_martin: 'aston' };

// ── brand wordmark, embedded as a base64 data URI ──
const WORDMARK_PATH = path.join(ROOT, 'public/images/logo/f1gures-wordmark-dark.png');
const WORDMARK_NATIVE = { w: 560, h: 141 };
const WORDMARK_DATA_URI = (() => {
  try {
    return `data:image/png;base64,${fs.readFileSync(WORDMARK_PATH).toString('base64')}`;
  } catch {
    return null;
  }
})();
const WM_H = 34;
const WM_W = Math.round((WORDMARK_NATIVE.w / WORDMARK_NATIVE.h) * WM_H);

// ── build-time image loaders (Satori can't decode WebP, so faces are
//    converted to PNG via sharp; logos are JPEG and load directly). ──

/** Driver headshot cover-cropped to w×h, returned as a PNG data URI (null if absent). */
export async function loadFace(ref, w, h) {
  if (!ref) return null;
  const p = path.join(DRIVERS_DIR, `${ref}.webp`);
  if (!fs.existsSync(p)) return null;
  try {
    const buf = await sharp(p).resize(w, h, { fit: 'cover', position: 'top' }).png().toBuffer();
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/** Team logo contained on a white s×s tile, returned as a PNG data URI (null if absent). */
export async function loadLogo(ref, s) {
  if (!ref) return null;
  const candidates = [ref, LOGO_ALIAS[ref]].filter(Boolean);
  for (const name of candidates) {
    const p = path.join(TEAMS_DIR, `${name}.jpg`);
    if (!fs.existsSync(p)) continue;
    try {
      const buf = await sharp(p)
        .resize(s, s, { fit: 'contain', background: '#ffffff' })
        .flatten({ background: '#ffffff' })
        .png()
        .toBuffer();
      return `data:image/png;base64,${buf.toString('base64')}`;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

// ── low-level element helpers ──
const div = (style, children) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });
const txt = (style, children) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });
export const ogImg = (src, w, h, style = {}) => ({ type: 'img', props: { src, width: w, height: h, style } });

// Base card with the branded dark gradient background.
export function ogCard(children, extra = {}) {
  return {
    type: 'div',
    props: {
      style: {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '60px',
        backgroundColor: COLORS.bg,
        backgroundImage: `linear-gradient(135deg, ${COLORS.bg} 0%, ${COLORS.bgGrad} 100%)`,
        color: COLORS.text,
        fontFamily: 'Inter',
        ...extra,
      },
      children,
    },
  };
}

// Absolutely-positioned card (for image-bleed layouts / bar-row grids).
function absCard(children) {
  return {
    type: 'div',
    props: {
      style: {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        backgroundColor: COLORS.bg,
        backgroundImage: `linear-gradient(135deg, ${COLORS.bg} 0%, ${COLORS.bgGrad} 100%)`,
        color: COLORS.text,
        fontFamily: 'Inter',
      },
      children,
    },
  };
}
export { absCard };

// ── brand furniture ──
export function wordmarkEl() {
  return WORDMARK_DATA_URI ? ogImg(WORDMARK_DATA_URI, WM_W, WM_H) : txt({ fontSize: 26, color: COLORS.muted }, 'f1gures');
}
export const wmTopLeft = () => div({ position: 'absolute', top: 44, left: 60 }, [wordmarkEl()]);
export const wmTopRight = () => div({ position: 'absolute', top: 44, right: 60 }, [wordmarkEl()]);
export const urlBottomLeft = () =>
  txt({ position: 'absolute', bottom: 44, left: 60, fontSize: 26, color: COLORS.muted, fontWeight: 700 }, 'www.f1gures.app');

// Masthead: red kicker on the left, wordmark on the right.
export function masthead(kicker) {
  return div({ position: 'absolute', top: 44, left: 60, right: 60, alignItems: 'center', justifyContent: 'space-between' }, [
    txt({ fontSize: 26, fontWeight: 600, color: COLORS.accent, textTransform: 'uppercase', letterSpacing: '0.1em' }, kicker),
    wordmarkEl(),
  ]);
}

// ── legacy detail-card primitives (still used by race / circuit templates) ──
export function ogBrand() {
  return div({ alignItems: 'center' }, [wordmarkEl()]);
}
export function ogTitle(text) {
  return txt({ fontSize: 84, fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.02em' }, text);
}
export function ogSubtitle(text) {
  return txt({ fontSize: 32, fontWeight: 500, color: COLORS.muted, marginTop: 16 }, text);
}

// A stat block: big value over a small uppercase label.
export function statBlock(value, label) {
  return div({ flexDirection: 'column' }, [
    txt({ fontSize: 52, fontWeight: 700 }, String(value)),
    txt({ fontSize: 20, color: COLORS.fg3, textTransform: 'uppercase', letterSpacing: '0.08em' }, label),
  ]);
}

// Pick black or white text for legibility on a given background colour.
function contrastText(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  // relative luminance
  const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return L > 0.6 ? '#0a0a0a' : '#ffffff';
}

// A team-colour badge with the short code — a consistent stand-in for the
// team logo (whose source JPEGs have inconsistent baked backgrounds).
function teamBadge(color, code) {
  return div(
    { width: 96, height: 96, borderRadius: 8, backgroundColor: color || COLORS.line, alignItems: 'center', justifyContent: 'center' },
    [txt({ fontSize: 34, fontWeight: 700, letterSpacing: '0.02em', color: contrastText(color) }, code || '')],
  );
}

/**
 * Shared "top-3 bar rows" card used by standings + records.
 * rows: [{ rank, name, sub, color, img (data uri|null), chip:{color,code}, valueMain, valueUnit }]
 */
export function barRowsCard({ kicker, title, rows }) {
  const rowEls = rows.map((r, i) =>
    div(
      {
        alignItems: 'center',
        height: 118,
        marginBottom: 14,
        backgroundColor: COLORS.panel,
        borderRadius: 10,
        overflow: 'hidden',
      },
      [
        div({ width: 8, height: 118, backgroundColor: r.color || COLORS.line }, []),
        txt({ width: 92, justifyContent: 'center', fontSize: 64, fontWeight: 700, color: i === 0 ? COLORS.accent : COLORS.fg3 }, String(r.rank)),
        r.img ? ogImg(r.img, 96, 96, { objectFit: 'cover', borderRadius: 8 }) : r.chip ? teamBadge(r.chip.color, r.chip.code) : div({ width: 96 }, []),
        div({ flexDirection: 'column', marginLeft: 26, flexGrow: 1 }, [
          txt({ fontSize: 44, fontWeight: 700 }, r.name),
          r.sub ? txt({ fontSize: 24, color: COLORS.fg3, textTransform: 'uppercase', letterSpacing: '0.06em' }, r.sub) : div({}, []),
        ]),
        div({ flexDirection: 'column', alignItems: 'flex-end', marginRight: 34 }, [
          txt({ fontSize: 54, fontWeight: 700 }, String(r.valueMain)),
          r.valueUnit ? txt({ fontSize: 20, color: COLORS.fg3, textTransform: 'uppercase' }, r.valueUnit) : div({}, []),
        ]),
      ],
    ),
  );
  const body = div({ flexDirection: 'column', position: 'absolute', top: 100, left: 60, right: 60 }, [
    txt({ fontSize: 40, fontWeight: 700, marginBottom: 18 }, title),
    ...rowEls,
  ]);
  return absCard([masthead(kicker), body, urlBottomLeft()]);
}
