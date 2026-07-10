// Shared layout primitives for OG image templates rendered with Satori.
// Returns plain Satori-style JSX object trees (no React).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

// Brand wordmark, embedded as a base64 data URI so Satori can rasterise it
// without a network/filesystem fetch per card. The dark variant is light-on-
// transparent, which reads correctly on the card's dark background. Native
// size is 560×141 (≈3.97:1); we render it at a fixed masthead height.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORDMARK_PATH = path.resolve(
  __dirname,
  '../../public/images/logo/f1gures-wordmark-dark.png',
);
const WORDMARK_NATIVE = { w: 560, h: 141 };
const WORDMARK_DATA_URI = (() => {
  try {
    const buf = fs.readFileSync(WORDMARK_PATH);
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null; // fall back to the text mark below
  }
})();

export const COLORS = {
  bg: '#0a0a0a',
  bgGrad: '#1a1a1a',
  text: '#f5f5f5',
  muted: '#a0a0a0',
  accent: '#ff5f5f',
};

// Build a base container card. Children render inside a 60px-padded box.
export function ogCard(children) {
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
      },
      children,
    },
  };
}

export function ogBrand() {
  // Render the real wordmark when available; fall back to the text mark so the
  // build never fails if the asset is missing.
  if (WORDMARK_DATA_URI) {
    const h = 40;
    const w = Math.round((WORDMARK_NATIVE.w / WORDMARK_NATIVE.h) * h);
    return {
      type: 'div',
      props: {
        style: { display: 'flex', alignItems: 'center' },
        children: [
          { type: 'img', props: { src: WORDMARK_DATA_URI, width: w, height: h } },
        ],
      },
    };
  }
  return {
    type: 'div',
    props: {
      style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: 24, color: COLORS.muted },
      children: [
        { type: 'span', props: { style: { color: COLORS.accent }, children: '●' } },
        { type: 'span', props: { children: 'f1gures' } },
      ],
    },
  };
}

export function ogTitle(text) {
  return {
    type: 'div',
    props: {
      style: { fontSize: 84, fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.02em' },
      children: text,
    },
  };
}

export function ogSubtitle(text) {
  return {
    type: 'div',
    props: {
      style: { fontSize: 32, fontWeight: 500, color: COLORS.muted, marginTop: 16 },
      children: text,
    },
  };
}
