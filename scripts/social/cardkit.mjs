// scripts/social/cardkit.mjs
//
// Layout primitives for the social cards.
//
// The design is the "f1gures social cards" handoff (see
// docs/social-card-design.md): six skeletons covering all thirteen card types,
// authored inside the Satori subset. Every measurement here is from that spec -
// they are final and intentional, so change them there first, not here.
//
// Sizing model: the design is drawn at portrait 1080x1350. Square and story are
// reflows of the same markup rather than separate designs, reached by three
// scale factors - font size, explicit width, and everything vertical. That is
// why nothing below hardcodes a pixel: a layout calls m.f() / m.w() / m.v() and
// the same tree composes at all three sizes.

import fs from 'node:fs';
import path from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { ROOT } from './sources.mjs';

export const FORMATS = {
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
};

export const DEFAULT_FORMATS = ['portrait', 'square', 'story'];

// Reflow multipliers, from the handoff's "Reflows" table. Portrait is the
// drawn size, so it scales by 1.
const SCALE = {
  portrait: { font: 1, width: 1, vert: 1 },
  square: { font: 0.88, width: 0.92, vert: 0.74 },
  story: { font: 1.05, width: 1.02, vert: 1.18 },
};

/**
 * Dark-theme token values, mirrored from public/css/app.css.
 *
 * A PNG has no theme to read custom properties from, so the values are copied
 * here. design-system/TOKENS.md is the source of truth; this is a mirror of its
 * dark column. If a token moves there, move it here too.
 */
export const COLORS = {
  bg: '#060709',
  panel: '#1C1D22',
  raised: '#252629',
  line: '#2C2E36',
  line2: '#383A44',
  fg1: '#F5F5F5',
  fg2: '#B8B9BD',
  fg3: '#9A9BA1',
  accent: '#E8002D',
  gold: '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32',
};

export const RANK_INK = [COLORS.gold, COLORS.silver, COLORS.bronze];

/**
 * Canvas grounds. The one sanctioned exception to the flat token list: a
 * multi-stop gradient interpolating around #060709, as canvas texture. All
 * content still sits on solid panels.
 */
export const GROUNDS = {
  photo: 'linear-gradient(118deg,#1A1C22 0%,#0D0F13 34%,#060709 58%,#0E1015 100%)',
  streak: 'linear-gradient(118deg,#12141A 0%,#08090C 46%,#060709 100%)',
  flat: 'linear-gradient(168deg,#171A20 0%,#0A0B0F 46%,#060709 100%)',
  flatAlt: 'linear-gradient(200deg,#15171C 0%,#090A0D 50%,#060709 100%)',
};

// Scrims stacked over a bleeding photo: one fades its left edge into the
// ground so the headline can overlap it, one fades its foot.
export const SCRIM_LEFT = 'linear-gradient(100deg,#060709 0%,rgba(6,7,9,0.82) 26%,rgba(6,7,9,0.12) 66%,rgba(6,7,9,0) 100%)';
export const SCRIM_FOOT = 'linear-gradient(to top,#060709 0%,rgba(6,7,9,0.88) 10%,rgba(6,7,9,0.25) 26%,rgba(6,7,9,0) 44%)';

// ── fonts ──
// The brand's three families (TOKENS §1): Barlow Condensed for display, Barlow
// for body, JetBrains Mono for every numeral.
//
// They are read from @fontsource packages in node_modules rather than fetched
// from a CDN at render time. That makes a render reproducible (the exact faces
// are pinned by package-lock.json), removes a network call from the daily job,
// and means a blocked or moved CDN cannot quietly degrade the typography.
// Fontsource ships woff and woff2; Satori parses woff, so that is what we read.
const FONTSOURCE_DIR = path.join(ROOT, 'node_modules/@fontsource');

const FONT_SPECS = [
  { family: 'Display', weight: 700, pkg: 'barlow-condensed', face: 700,
    system: ['/usr/share/fonts/truetype/liberation/LiberationSansNarrow-Bold.ttf'] },
  // Registered at 400 because the layouts only ask for 400 or 700; Barlow
  // Condensed 500 is the weight that reads right for small tracked labels.
  { family: 'Display', weight: 400, pkg: 'barlow-condensed', face: 500,
    system: ['/usr/share/fonts/truetype/liberation/LiberationSansNarrow-Regular.ttf'] },
  { family: 'Body', weight: 400, pkg: 'barlow', face: 400,
    system: ['/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'] },
  { family: 'Body', weight: 700, pkg: 'barlow', face: 600,
    system: ['/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'] },
  { family: 'Mono', weight: 700, pkg: 'jetbrains-mono', face: 700,
    system: ['/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf'] },
  { family: 'Mono', weight: 400, pkg: 'jetbrains-mono', face: 500,
    system: ['/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf'] },
];

const facePath = (spec) =>
  path.join(FONTSOURCE_DIR, spec.pkg, 'files', `${spec.pkg}-latin-${spec.face}-normal.woff`);

let _fontsPromise = null;

export function loadFonts() {
  if (!_fontsPromise) _fontsPromise = collectFonts();
  return _fontsPromise;
}

/**
 * Last-resort faces. SOCIAL_FONT_DIR lets a machine point at its own files;
 * the system list keeps a card renderable (in the wrong face, loudly) rather
 * than failing the day's post outright if node_modules is incomplete.
 */
function fallbackFace(spec) {
  const dir = process.env.SOCIAL_FONT_DIR;
  const candidates = [
    ...(dir ? [path.join(dir, `${spec.pkg}-${spec.face}.woff`), path.join(dir, `${spec.pkg}-${spec.face}.ttf`)] : []),
    ...spec.system,
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return fs.readFileSync(p);
  }
  return null;
}

async function collectFonts() {
  const out = [];
  const degraded = [];

  for (const spec of FONT_SPECS) {
    const file = facePath(spec);
    let data = null;

    if (fs.existsSync(file)) {
      data = fs.readFileSync(file);
    } else {
      data = fallbackFace(spec);
      if (!data) {
        throw new Error(
          `Missing ${spec.family} ${spec.weight}: expected ${path.relative(ROOT, file)}. Run \`npm install\`.`,
        );
      }
      degraded.push(`${spec.family} ${spec.weight}`);
    }
    out.push({ name: spec.family, data, weight: spec.weight, style: 'normal' });
  }

  if (degraded.length) {
    console.warn(`[social] brand faces missing from node_modules, using fallbacks for: ${degraded.join(', ')} - run \`npm install\`.`);
  }
  return out;
}

/** Render a Satori tree to a PNG buffer at the given format size. */
export async function renderPng(tree, format) {
  const { w, h } = FORMATS[format] || FORMATS.portrait;
  const svg = await satori(tree, { width: w, height: h, fonts: await loadFonts() });
  return new Resvg(svg, { fitTo: { mode: 'width', value: w } }).render().asPng();
}

// ── element helpers ──
export const div = (style, children = []) => ({
  type: 'div', props: { style: { display: 'flex', ...style }, children },
});
export const txt = (style, children) => ({
  type: 'div', props: { style: { display: 'flex', ...style }, children },
});
export const img = (src, w, h, style = {}) => ({
  type: 'img', props: { src, width: w, height: h, style },
});
/** A flex spacer. Vertical rhythm is slack, not fixed offsets, so this reflows. */
export const grow = (n = 1) => div({ flexGrow: n });

/** #RRGGBB -> rgba() at the given alpha. Team hues are only ever used tinted. */
export function alpha(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return `rgba(255,255,255,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Black or white, whichever reads on the given background. */
export function contrastText(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const L = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return L > 0.6 ? '#0a0a0a' : '#ffffff';
}

/**
 * Ferrari's #E80020 is within a few points of the accent #E8002D, so a red chip
 * beside a Ferrari strip reads as a rendering fault. TOKENS.md calls this
 * collision out; the design inverts the chip to white-on-black instead.
 */
export function clashesWithAccent(teamColor) {
  const m = /^#?([0-9a-f]{6})$/i.exec(teamColor || '');
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const a = parseInt(COLORS.accent.slice(1), 16);
  const d = (x, y, sh) => Math.abs(((x >> sh) & 255) - ((y >> sh) & 255));
  return d(n, a, 16) < 28 && d(n, a, 8) < 28 && d(n, a, 0) < 40;
}

/**
 * Estimate a font size that fits `maxWidth` across `maxLines`.
 *
 * The design specifies sizes outright (and a smaller step for long names), so
 * this is now only a guard for the genuinely unbounded strings - circuit names,
 * trivia sentences. Two constraints: the whole string must fit the area, and
 * the longest single word must fit one line, because words do not break.
 */
export const ADVANCE = { display: 0.42, body: 0.5, mono: 0.6 };

export function fitFontSize(text, { maxWidth, maxLines = 1, max, min, advance = ADVANCE.display }) {
  const str = String(text || '');
  const len = str.length || 1;
  const longestWord = str.split(/\s+/).reduce((n, w) => Math.max(n, w.length), 1);
  const byTotal = (maxWidth * maxLines) / (len * advance);
  const byWord = maxWidth / (longestWord * advance);
  return Math.max(min, Math.min(max, Math.floor(Math.min(byTotal, byWord))));
}

/**
 * Per-format geometry and the three scale functions.
 *
 *   m.f(px)  font sizes and anything that must track them (letter-spacing runs)
 *   m.w(px)  explicit widths
 *   m.v(px)  heights, top/left/right offsets, padding, margin, gap
 */
export function metrics(format) {
  const { w, h } = FORMATS[format] || FORMATS.portrait;
  const s = SCALE[format] || SCALE.portrait;
  const f = (px) => Math.round(px * s.font);
  const wf = (px) => Math.round(px * s.width);
  const v = (px) => Math.round(px * s.vert);

  const padX = wf(72);
  const padTop = v(64);
  const padBottom = v(56);

  return {
    format,
    w,
    h,
    f,
    v,
    scale: s,
    // `w` is the canvas width, so the width scaler is exposed as wx to avoid
    // shadowing it in layouts that destructure.
    wx: wf,
    pad: padX,
    padTop,
    padBottom,
    inner: w - padX * 2,
    safeTop: padTop,
    safeBottom: padBottom,
    // Kept for callers that still think in terms of a generic row height.
    rowH: v(144),
  };
}

// ── brand furniture ──
const WORDMARK_PATH = path.join(ROOT, 'public/images/logo/f1gures-wordmark-dark.png');
const WORDMARK_NATIVE = { w: 791, h: 264 };
const WORDMARK_URI = (() => {
  try {
    return `data:image/png;base64,${fs.readFileSync(WORDMARK_PATH).toString('base64')}`;
  } catch {
    return null;
  }
})();

/** The wordmark lockup at a spec width (250x80 top-right, 300x96 bottom-left). */
export function wordmark(m, width = 250) {
  const wpx = m.wx(width);
  const hpx = Math.round((WORDMARK_NATIVE.h / WORDMARK_NATIVE.w) * wpx);
  if (!WORDMARK_URI) {
    return txt({ fontFamily: 'Display', fontSize: m.f(30), fontWeight: 700, color: COLORS.fg3 }, 'F1GURES');
  }
  return img(WORDMARK_URI, wpx, hpx);
}

/** Tiny tracked mono kicker - the card's quiet voice. */
export function kicker(m, text) {
  return txt({
    fontFamily: 'Mono', fontSize: m.f(22), fontWeight: 700,
    color: COLORS.fg3, textTransform: 'uppercase', letterSpacing: '0.22em',
  }, String(text || '').toUpperCase());
}

/** Kicker left, wordmark right. */
export function kickerRow(m, text, { mark = true } = {}) {
  return div({ width: m.inner, alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }, [
    kicker(m, text),
    mark ? wordmark(m, 250) : div({}),
  ]);
}

/** The red session chip. Inverts to white-on-black beside a Ferrari strip. */
export function chip(m, text, { invert = false } = {}) {
  return div({
    backgroundColor: invert ? COLORS.fg1 : COLORS.accent,
    paddingTop: m.v(9), paddingBottom: m.v(8), paddingLeft: m.wx(16), paddingRight: m.wx(16),
    alignSelf: 'flex-start', flexShrink: 0,
  }, [
    txt({
      fontFamily: 'Display', fontSize: m.f(26), fontWeight: 700,
      letterSpacing: '0.22em', color: invert ? COLORS.bg : '#FFFFFF',
    }, String(text).toUpperCase()),
  ]);
}

/** Footer: hairline rule, then f1gures.app left and a context string right. */
export function footer(m, right = '', { mark = false } = {}) {
  return div({ flexDirection: 'column', width: m.inner, flexShrink: 0 }, [
    div({ width: m.inner, height: 1, backgroundColor: COLORS.line, marginBottom: m.v(26) }),
    div({ width: m.inner, alignItems: 'center', justifyContent: 'space-between' }, [
      mark
        ? wordmark(m, 300)
        // Deliberately not uppercased: the brand's "1" reads as an "I" in caps.
        : txt({ fontFamily: 'Mono', fontSize: m.f(23), fontWeight: 500, letterSpacing: '0.1em', color: COLORS.fg3 }, 'f1gures.app'),
      right
        ? txt({ fontFamily: 'Mono', fontSize: m.f(23), fontWeight: 500, letterSpacing: '0.1em', color: COLORS.fg3 }, String(right).toUpperCase())
        : div({}),
    ]),
  ]);
}

/**
 * The card shell: ground gradient, optional full-bleed art behind, then the
 * padded content overlay.
 *
 * `bleed` paints under the overlay - photos and their scrims go there, so the
 * headline can sit over the scrimmed edge.
 */
export function card(m, children, { ground = GROUNDS.flat, bleed = [], edgeToEdge = false } = {}) {
  return div({
    width: m.w, height: m.h, position: 'relative', flexDirection: 'column',
    backgroundColor: COLORS.bg, backgroundImage: ground,
    color: COLORS.fg1, fontFamily: 'Body', overflow: 'hidden',
  }, [
    ...bleed,
    div({
      position: 'absolute', top: 0, left: 0, width: m.w, height: m.h,
      flexDirection: 'column',
      paddingTop: m.padTop, paddingBottom: m.padBottom,
      // Cards whose bands bleed to the edges pad per row instead.
      paddingLeft: edgeToEdge ? 0 : m.pad,
      paddingRight: edgeToEdge ? 0 : m.pad,
    }, children),
  ]);
}

/**
 * A photo bleeding off the right edge, under two scrims.
 * Spec: 560x920 on result cards, 600x900 on hero cards.
 */
export function photoBleed(m, src, { width = 560, height = 920, top = 0 } = {}) {
  if (!src) return [];
  const pw = m.wx(width);
  const ph = m.v(height);
  // The scrims sit over the PHOTO, not the card. Spanning the full width
  // instead darkens everything above the photo's foot and nothing below it,
  // leaving a horizontal seam straight across the card at that y.
  return [
    div({ position: 'absolute', top: m.v(top), right: 0, width: pw, height: ph, overflow: 'hidden' }, [
      img(src, pw, ph, { objectFit: 'cover' }),
    ]),
    div({ position: 'absolute', top: m.v(top), right: 0, width: pw, height: ph, backgroundImage: SCRIM_LEFT }),
    div({ position: 'absolute', top: m.v(top), right: 0, width: pw, height: ph, backgroundImage: SCRIM_FOOT }),
  ];
}

/**
 * One leaderboard row: a band whose length encodes the value, cut on the
 * diagonal of the wordmark's speed streaks.
 *
 * The diagonal is a linear-gradient with a hard stop into transparency - no
 * clip-path, no transform, so Satori can draw it.
 */
export function streakBand(m, { widthPct, height, surface, cut, tint }) {
  const rgba0 = alpha(surface, 0);
  return [
    div({
      position: 'absolute', top: 0, left: 0, height, width: `${widthPct}%`,
      backgroundImage: `linear-gradient(108deg,${surface} 0%,${surface} ${cut}%,${rgba0} ${cut + 0.4}%)`,
    }),
    tint
      ? div({
          position: 'absolute', top: 0, left: 0, height, width: `${widthPct}%`,
          backgroundImage: `linear-gradient(108deg,${tint} 0%,${alpha(tint.startsWith('#') ? tint : COLORS.accent, 0)} 60%)`,
        })
      : div({}),
  ];
}

/** Hero stat strip: rules top and bottom, 3-4 equal cells divided by hairlines. */
export function statStrip(m, cells) {
  return div({
    width: m.inner, flexDirection: 'column', marginTop: m.v(44), flexShrink: 0,
    borderTop: `1px solid ${COLORS.line}`, borderBottom: `1px solid ${COLORS.line}`,
  }, [
    div({ width: m.inner }, cells.map((c, i) =>
      div({
        flexGrow: 1, flexBasis: 0, flexDirection: 'column',
        paddingTop: m.v(30), paddingBottom: m.v(28),
        paddingLeft: i === 0 ? 0 : m.wx(34),
        // Satori throws on an explicit `undefined` border value, so the key is
        // omitted entirely rather than set to undefined.
        ...(i === 0 ? {} : { borderLeft: `1px solid ${COLORS.line}` }),
      }, [
        txt({
          fontFamily: 'Mono', fontSize: m.f(c.size || 88), fontWeight: 700,
          lineHeight: 0.8, letterSpacing: '-0.03em', color: c.color || COLORS.fg1,
        }, String(c.value)),
        txt({
          fontFamily: 'Display', fontSize: m.f(22), fontWeight: 600,
          letterSpacing: '0.2em', color: COLORS.fg3, marginTop: m.v(14),
        }, String(c.label).toUpperCase()),
      ]),
    )),
  ]);
}

