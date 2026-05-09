// Shared layout primitives for OG image templates rendered with Satori.
// Returns plain Satori-style JSX object trees (no React).

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

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
