// Pure helpers that keep multi-series line charts legible without relying on
// colour alone. Team colour is the only hue a series gets, so the two cars of
// one team (and near-identical liveries such as Williams #64C4FF vs Racing
// Bulls #6692FF) are indistinguishable by colour. Two fixes, both here so the
// Recharts standings charts and the hand-rolled Weekend Analysis SVGs share
// one rule:
//
//   1. assignSeriesStyles — the first series of a group draws solid, the
//      second dashed, the third dotted. Input order decides which car is
//      "first", so callers pass a deterministic order (standings order for
//      the season charts, session classification for the weekend charts).
//   2. stackLabels — de-collides direct end-of-line labels so every line can
//      carry its own code instead of leaning on a colour legend.
//
// Plain ESM, no React — vitest-covered in chartSeries.test.js.

// Dash pattern for the Nth series of a group. Solid, dashed, dotted; a fourth
// car (historic multi-car entries) wraps back to solid.
export const SERIES_DASH = ['', '6 4', '2 3'];

export function dashForSlot(slot) {
  return SERIES_DASH[slot % SERIES_DASH.length];
}

// items → { [id]: { slot, dash, group } }. `groupOf` returns the key that
// series share a colour under (team id, or a colour bucket); items with no
// group are treated as their own group and stay solid.
export function assignSeriesStyles(items, { idOf, groupOf }) {
  const seen = {};
  const out = {};
  for (const it of items) {
    const id = idOf(it);
    const group = groupOf(it) ?? `__solo:${id}`;
    const slot = seen[group] || 0;
    seen[group] = slot + 1;
    out[id] = { slot, dash: dashForSlot(slot), group };
  }
  return out;
}

// Parse "#RRGGBB" (or "#RGB") into [r, g, b]; null for anything else.
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Euclidean RGB distance — crude, but it only has to catch liveries a viewer
// would confuse (Williams vs Racing Bulls is ~50; Alpine vs Williams ~120;
// Red Bull vs Racing Bulls ~80). Unparseable colours are "far apart".
export function colorDistance(a, b) {
  const ra = hexToRgb(a), rb = hexToRgb(b);
  if (!ra || !rb) return Infinity;
  return Math.hypot(ra[0] - rb[0], ra[1] - rb[1], ra[2] - rb[2]);
}

// Greedy colour bucketing: each item joins the first bucket whose seed colour
// is within `threshold`, else seeds a new one. Returns a groupOf(item)
// function for assignSeriesStyles, so two teams with near-identical colours
// get solid + dashed just like two cars of one team.
export function colorGroups(items, colorOf, threshold = 64) {
  const seeds = [];
  const keyOf = new Map();
  for (const it of items) {
    const c = colorOf(it);
    let idx = seeds.findIndex((s) => colorDistance(s, c) <= threshold);
    if (idx < 0) { seeds.push(c); idx = seeds.length - 1; }
    keyOf.set(it, `c${idx}`);
  }
  return (it) => keyOf.get(it) ?? null;
}

// End-of-line label stacking: nudges labels down by `minGap` until none
// overlap, clamped to [top, bottom]. Items keep their order; only `y` moves.
export function stackLabels(items, minGap = 13, top = 18, bottom = 370) {
  const used = {};
  return items.map((it) => {
    let y = Math.max(top, Math.min(bottom, it.y));
    while (used[Math.round(y / minGap)]) y += minGap;
    used[Math.round(y / minGap)] = 1;
    return { ...it, y };
  });
}
