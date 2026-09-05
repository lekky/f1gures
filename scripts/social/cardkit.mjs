// scripts/social/cardkit.mjs
//
// Layout primitives for the social cards, sized for the vertical/square
// formats the feed platforms actually want. The OG templates in
// scripts/og-templates/ are locked to one 1200x630 landscape canvas, so this
// is a sibling toolkit rather than a reuse of them - but it deliberately
// borrows their palette and their image loaders (faces, logos, flags, track
// maps) so a social card and a link preview look like the same product.
//
// Design follows design-system/TOKENS.md: hard corners, condensed uppercase
// labels, dense numerics, and --accent red used once per card as the signal of
// "this is the thing".

import fs from 'node:fs';
import path from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { ROOT } from './sources.mjs';

// Instagram feed takes 1:1 and 4:5; 4:5 occupies the most screen and is the
// default. Story/TikTok is 9:16.
export const FORMATS = {
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
};

export const DEFAULT_FORMATS = ['portrait', 'square', 'story'];

/**
 * Dark-theme token values, mirrored from public/css/app.css.
 *
 * A PNG has no theme to read custom properties from, so the values are copied
 * here. If a token moves in app.css, move it here too - design-system/TOKENS.md
 * is the source of truth and this is a mirror of its dark column.
 */
export const COLORS = {
  bg0: '#050505',
  bg1: '#060709',
  bg2: '#1C1D22',
  bg3: '#252629',
  line1: '#2C2E36',
  line2: '#383A44',
  fg1: '#F5F5F5',
  fg2: '#B8B9BD',
  fg3: '#9A9BA1',
  accent: '#E8002D',      // "now" - one moment per card (TOKENS red budget)
  accentText: '#FF3B57',  // accent that clears 4.5:1 as text
  gold: '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32',
};

export const PODIUM_COLORS = [COLORS.gold, COLORS.silver, COLORS.bronze];

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
 * Estimate a font size that lets `text` fit `maxWidth` across `maxLines`.
 *
 * Satori exposes no text-measurement API, so this uses an average advance width
 * per em. Condensed display type runs much narrower than a normal-width face,
 * hence the per-family defaults.
 *
 * Two constraints, both necessary: the whole string has to fit the available
 * area, AND the longest single word has to fit one line - words do not break,
 * so a long surname overflows even when the total would have fitted ("MAX
 * VERSTAPPEN" clipped for exactly this reason). The smaller of the two wins.
 *
 * Any layout feeding this a width must pass the width the text actually gets,
 * not the card's full inner width.
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
 * Per-format geometry. Everything downstream sizes off this rather than
 * hardcoding numbers, so one format tweak moves every layout coherently.
 */
export function metrics(format) {
  const { w, h } = FORMATS[format] || FORMATS.portrait;
  const pad = Math.round(w * 0.065);
  return {
    format,
    w,
    h,
    pad,
    inner: w - pad * 2,
    // The story format has vertical room to spare; the safe band keeps content
    // clear of TikTok's UI chrome top and bottom.
    safeTop: format === 'story' ? Math.round(h * 0.12) : pad,
    safeBottom: format === 'story' ? Math.round(h * 0.15) : pad,
    kicker: Math.round(w * 0.026),
    label: Math.round(w * 0.023),
    body: Math.round(w * 0.036),
    stat: Math.round(w * 0.068),
    rowH: Math.round(w * (format === 'story' ? 0.128 : 0.115)),
  };
}

// ── texture ──

/**
 * A fine diagonal ruling at the rake of the wordmark's speed streaks.
 *
 * Built as one linear-gradient with repeated hard stops rather than
 * repeating-linear-gradient, whose Satori support is not guaranteed.
 */
function diagonalRuling(bands = 26) {
  const stops = [];
  const step = 100 / bands;
  for (let i = 0; i < bands; i++) {
    const a = i * step;
    const b = a + step * 0.5;
    stops.push(`rgba(255,255,255,0) ${a.toFixed(2)}%`, `rgba(255,255,255,0) ${b.toFixed(2)}%`);
    stops.push(`rgba(255,255,255,0.018) ${b.toFixed(2)}%`, `rgba(255,255,255,0.018) ${(a + step).toFixed(2)}%`);
  }
  return `linear-gradient(115deg, ${stops.join(', ')})`;
}

/** An enormous numeral ghosted into the ground - depth without ornament. */
export function ghostMark(m, text, { bottom = null, right = null } = {}) {
  if (!text) return div({});
  const size = Math.round(m.w * 0.62);
  return txt({
    position: 'absolute',
    bottom: bottom ?? Math.round(m.h * 0.16),
    right: right ?? -Math.round(m.w * 0.05),
    fontFamily: 'Mono',
    fontWeight: 700,
    fontSize: size,
    lineHeight: 1,
    color: 'rgba(245,245,245,0.035)',
  }, String(text));
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

/**
 * The wordmark lockup. Its speed streaks occupy roughly the top two thirds of
 * the PNG, so it is drawn ~1.6x taller than the letters need and the extra
 * (transparent) height is absorbed by negative margin - the same compensation
 * src/lib/brandMark.mjs applies to the canvas share cards.
 */
export function wordmark(m) {
  if (!WORDMARK_URI) {
    return txt({ fontFamily: 'Display', fontSize: m.kicker, color: COLORS.fg3, fontWeight: 700 }, 'F1GURES');
  }
  const height = Math.round(m.w * 0.062);
  const width = Math.round((WORDMARK_NATIVE.w / WORDMARK_NATIVE.h) * height);
  return img(WORDMARK_URI, width, height, { marginTop: -Math.round(height * 0.28) });
}

/** Tiny tracked uppercase label - the card's quiet voice. */
export function eyebrow(m, text, color = COLORS.fg3, size = null) {
  return txt({
    fontFamily: 'Display',
    fontSize: size || m.kicker,
    fontWeight: 700,
    color,
    textTransform: 'uppercase',
    letterSpacing: '0.16em',
  }, String(text || '').toUpperCase());
}

/** Kicker on the left, wordmark on the right. */
export function masthead(m, kicker) {
  return div({ alignItems: 'center', justifyContent: 'space-between', width: m.inner, flexShrink: 0 }, [
    eyebrow(m, kicker, COLORS.fg3),
    wordmark(m),
  ]);
}

/** Bottom rule + site URL. */
export function footer(m, right = '') {
  return div({ flexDirection: 'column', width: m.inner, flexShrink: 0 }, [
    div({ width: m.inner, height: 1, backgroundColor: COLORS.line1, marginBottom: Math.round(m.pad * 0.45) }),
    div({ width: m.inner, alignItems: 'center', justifyContent: 'space-between' }, [
      // Deliberately not uppercased: the brand's "1" reads as an "I" in caps.
      txt({
        fontFamily: 'Display', fontSize: m.label, fontWeight: 700,
        color: COLORS.fg2, letterSpacing: '0.16em',
      }, 'f1gures.app'),
      right
        ? txt({ fontFamily: 'Mono', fontSize: m.label, fontWeight: 400, color: COLORS.fg3, letterSpacing: '0.02em' }, String(right))
        : div({}),
    ]),
  ]);
}

/**
 * The card shell: near-black ground, diagonal ruling, optional ghost numeral,
 * then the padded column of content between masthead and footer.
 */
export function card(m, children, { kicker, footerRight, ghost } = {}) {
  return div({
    width: m.w,
    height: m.h,
    position: 'relative',
    flexDirection: 'column',
    backgroundColor: COLORS.bg1,
    color: COLORS.fg1,
    fontFamily: 'Body',
  }, [
    // ground: a soft vertical lift, then the ruling over it
    div({ position: 'absolute', top: 0, left: 0, width: m.w, height: m.h,
      backgroundImage: `linear-gradient(165deg, ${COLORS.bg2} 0%, ${COLORS.bg1} 55%, ${COLORS.bg0} 100%)` }),
    div({ position: 'absolute', top: 0, left: 0, width: m.w, height: m.h, backgroundImage: diagonalRuling() }),
    ghost ? ghostMark(m, ghost) : div({}),
    div({
      position: 'absolute', top: 0, left: 0, width: m.w, height: m.h,
      flexDirection: 'column',
      paddingTop: m.safeTop, paddingBottom: m.safeBottom, paddingLeft: m.pad, paddingRight: m.pad,
    }, [
      kicker ? masthead(m, kicker) : div({}),
      div({ flexDirection: 'column', flexGrow: 1, width: m.inner, justifyContent: 'center' }, children),
      footer(m, footerRight),
    ]),
  ]);
}

/** Big mono number over a small tracked label. */
export function statBlock(m, value, label, color = COLORS.fg1) {
  return div({ flexDirection: 'column', marginRight: Math.round(m.pad * 0.85) }, [
    txt({ fontFamily: 'Mono', fontSize: m.stat, fontWeight: 700, lineHeight: 1, color }, String(value)),
    txt({
      fontFamily: 'Display', fontSize: m.label, fontWeight: 400, color: COLORS.fg3,
      textTransform: 'uppercase', letterSpacing: '0.14em', marginTop: 8,
    }, String(label).toUpperCase()),
  ]);
}

/** A team-colour tile carrying a short code - stands in for a missing logo. */
export function badge(m, color, code) {
  const s = Math.round(m.rowH * 0.7);
  return div({
    width: s, height: s, backgroundColor: color || COLORS.line1,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  }, [
    txt({ fontFamily: 'Display', fontSize: Math.round(s * 0.36), fontWeight: 700, color: contrastText(color) },
      String(code || '').slice(0, 4).toUpperCase()),
  ]);
}

/**
 * One leaderboard row, following the records hero pattern: a proportional
 * team-colour bar fills the row behind the content (a sanctioned use of team
 * colour), the rank takes podium metal for the top three, and every numeral is
 * mono so columns align down the card.
 *
 * `r.pct` (0..1) drives the bar; omit it for a flat row.
 */
export function barRow(m, r, i) {
  const h = m.rowH;
  const rankColor = PODIUM_COLORS[i] || COLORS.fg3;
  const barW = Math.max(0, Math.min(1, r.pct ?? 0)) * m.inner;

  return div({
    width: m.inner, height: h, alignItems: 'center', position: 'relative',
    backgroundColor: COLORS.bg2, marginBottom: Math.round(h * 0.09), overflow: 'hidden', flexShrink: 0,
  }, [
    barW > 0
      ? div({ position: 'absolute', top: 0, left: 0, width: Math.round(barW), height: h,
          backgroundImage: `linear-gradient(90deg, ${alpha(r.color, 0.34)} 0%, ${alpha(r.color, 0.05)} 100%)` })
      : div({}),
    div({ position: 'absolute', top: 0, left: 0, width: 5, height: h, backgroundColor: r.color || COLORS.line2 }),
    txt({
      width: Math.round(h * 0.8), justifyContent: 'center', flexShrink: 0, marginLeft: 5,
      fontFamily: 'Mono', fontSize: Math.round(h * 0.42), fontWeight: 700, color: rankColor,
    }, String(r.rank ?? i + 1)),
    r.img
      ? img(r.img, Math.round(h * 0.7), Math.round(h * 0.7), { objectFit: 'cover', flexShrink: 0 })
      : badge(m, r.color, r.code),
    div({ flexDirection: 'column', marginLeft: Math.round(h * 0.22), flexGrow: 1, overflow: 'hidden' }, [
      txt({
        fontFamily: 'Display', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.01em',
        fontSize: fitFontSize(r.name, { maxWidth: m.inner * 0.5, max: Math.round(h * 0.4), min: Math.round(h * 0.24) }),
      }, String(r.name || '').toUpperCase()),
      r.sub
        ? txt({
            fontFamily: 'Display', fontSize: Math.round(h * 0.2), fontWeight: 400, color: COLORS.fg3,
            textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 3,
          }, String(r.sub).toUpperCase())
        : div({}),
    ]),
    div({ flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, marginRight: Math.round(h * 0.2) }, [
      txt({ fontFamily: 'Mono', fontSize: Math.round(h * 0.38), fontWeight: 700 }, String(r.valueMain)),
      r.valueUnit
        ? txt({
            fontFamily: 'Display', fontSize: Math.round(h * 0.18), fontWeight: 400, color: COLORS.fg3,
            textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 3,
          }, String(r.valueUnit).toUpperCase())
        : div({}),
    ]),
  ]);
}
