// Shared SVG primitives + dark-panel palette for the Visualisation Explorer.
// The explorer card is ALWAYS dark (both site themes) — these hexes are the
// chart-panel palette from the design handoff, not site theme tokens.
import React from 'react';

export const PANEL = {
  bg: '#0F1014', grid: '#22232A', axis: '#85868E', fg: '#F2F2F4',
  fg2: '#C2C3CA', fg3: '#9A9BA3', dim: '#2A2B33', faint: '#565760',
  amber: '#E3B341', purple: '#A78BFA', red: '#E8002D', green: '#3DDC97',
  bandSC: 'rgba(227,179,65,0.10)', bandVSC: 'rgba(227,179,65,0.05)',
};

export const MONO = 'JetBrains Mono, monospace';
export const COND = 'Barlow Condensed, sans-serif';

// SC/VSC lap bands. xl maps a lap number to an x coordinate.
export function Bands({ bands, xl, y = 10, h = 360, labels = true }) {
  if (!bands || !bands.length) return null;
  return (
    <>
      {bands.map((b, i) => {
        const x = xl(b.from - 1);
        const w = Math.max(6, xl(b.to) - x);
        return (
          <g key={i}>
            <rect x={x.toFixed(1)} y={y} width={w.toFixed(1)} height={h} fill={b.type === 'SC' ? PANEL.bandSC : PANEL.bandVSC} />
            {labels && (
              <text x={(x + w / 2).toFixed(1)} y={y + 12} fontFamily={MONO} fontSize="10" fontWeight="600" fill={PANEL.amber} textAnchor="middle">
                {b.type}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}

// Horizontal gridlines with left-aligned labels.
export function YGrid({ ticks, x0, x1 }) {
  return (
    <>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={x0} x2={x1} y1={t.y} y2={t.y} stroke={PANEL.grid} />
          <text x={x0 - 6} y={t.y + 3} fontFamily={MONO} fontSize="10" fill={PANEL.axis} textAnchor="end">{t.label}</text>
        </g>
      ))}
    </>
  );
}

export function XTicks({ ticks, y }) {
  return (
    <>
      {ticks.map((t, i) => (
        <text key={i} x={t.x} y={y} fontFamily={MONO} fontSize="10" fill={PANEL.axis} textAnchor="middle">{t.label}</text>
      ))}
    </>
  );
}

// Linear scale helper.
export function scale(d0, d1, r0, r1) {
  const dd = d1 - d0 || 1;
  return (v) => r0 + ((v - d0) / dd) * (r1 - r0);
}

export function niceTicks(min, max, count = 5) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 5 : norm >= 2.5 ? 2.5 : norm >= 2 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

// Lap ticks for an x axis: 1, 10, 20 … total.
export function lapTickValues(total) {
  const out = [1];
  for (let l = 10; l < total; l += 10) out.push(l);
  out.push(total);
  return out;
}

// Driver headshot inside an SVG chart. `href` must be a data URI
// (ctx.faceImg) — external URLs are dropped when the chart is rasterised for
// the share card. Renders nothing when the face isn't loaded/available.
export function FaceImg({ href, x, y, size = 18 }) {
  if (!href) return null;
  return (
    <image href={href} xlinkHref={href} x={x} y={y} width={size} height={size}
      preserveAspectRatio="xMidYMin slice" />
  );
}

// Ladder: horizontal delta bars (quali gaps, SQ gaps, speed traps…).
// rows: [{ pos, code, color, frac(0..1), txt, face? (data URI) }]
export function Ladder({ rows, width = 500, rowH = 31, barMax = 310 }) {
  const height = rows.length * rowH + 14;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', display: 'block' }}>
      {rows.map((r, i) => {
        const y = 14 + i * rowH;
        const w = Math.max(4, r.frac * barMax);
        return (
          <g key={r.code}>
            <text x="12" y={y + 12.5} fontFamily={MONO} fontSize="11" fill={PANEL.axis}>{r.pos}</text>
            <FaceImg href={r.face} x={36} y={y - 2} size={20} />
            <text x="88" y={y + 12.5} fontFamily={MONO} fontSize="11" fontWeight="700" fill={r.color} textAnchor="end">{r.code}</text>
            <rect x="96" y={y} width={w.toFixed(1)} height="16" fill={r.color} />
            <text x={(96 + w + 8).toFixed(1)} y={y + 12.5} fontFamily={MONO} fontSize="11" fill={PANEL.fg2}>{r.txt}</text>
          </g>
        );
      })}
    </svg>
  );
}

// Diverging ladder centred at 0 (lap-1 gains & losses).
// rows: [{ code, color, value, face? }]
export function DivergingLadder({ rows, width = 500, rowH = 26, fmt }) {
  const height = rows.length * rowH + 16;
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  const cx = width / 2 + 20;
  const span = width / 2 - 110;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', display: 'block' }}>
      <line x1={cx} x2={cx} y1="6" y2={height - 10} stroke={PANEL.grid} />
      {rows.map((r, i) => {
        const y = 10 + i * rowH;
        const w = (Math.abs(r.value) / maxAbs) * span;
        const pos = r.value >= 0;
        return (
          <g key={r.code}>
            <FaceImg href={r.face} x={cx - span - 56} y={y - 2} size={18} />
            <text x={cx - span - 14} y={y + 11} fontFamily={MONO} fontSize="11" fontWeight="700" fill={r.color} textAnchor="end">{r.code}</text>
            <rect x={pos ? cx : cx - w} y={y} width={Math.max(2, w).toFixed(1)} height="13" fill={pos ? r.color : PANEL.dim} stroke={pos ? 'none' : r.color} strokeWidth={pos ? 0 : 1} />
            <text x={pos ? cx + w + 8 : cx - w - 8} y={y + 11} fontFamily={MONO} fontSize="10.5" fill={PANEL.fg2} textAnchor={pos ? 'start' : 'end'}>
              {fmt ? fmt(r.value) : (r.value > 0 ? `+${r.value}` : r.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// End-of-line label stacking: avoids overlapping driver codes.
export function stackLabels(items, minGap = 13, top = 18, bottom = 370) {
  const used = {};
  return items.map((it) => {
    let y = Math.max(top, Math.min(bottom, it.y));
    while (used[Math.round(y / minGap)]) y += minGap;
    used[Math.round(y / minGap)] = 1;
    return { ...it, y };
  });
}

// Lighten a hex colour (teammate disambiguation on the dominance map).
export function lighten(hex, f = 0.45) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (v) => Math.round(v + (255 - v) * f);
  return `#${((mix(r) << 16) | (mix(g) << 8) | mix(b)).toString(16).padStart(6, '0')}`;
}

// Give every code a visually distinct colour even when teammates share one.
export function distinctColors(codes, colorOf, teamOf) {
  const seen = {};
  const out = {};
  for (const c of codes) {
    const t = teamOf(c) || c;
    if (seen[t]) out[c] = lighten(colorOf(c), 0.5);
    else { out[c] = colorOf(c); seen[t] = 1; }
  }
  return out;
}
