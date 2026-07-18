// Shared SVG primitives + theme-aware chart palette for the Visualisation
// Explorer. The explorer follows the site theme (light + dark). Charts read
// colours through `PANEL`, whose getters resolve to the active theme; the
// island calls `setPanelTheme()` on load and on every theme toggle, so a
// re-render redraws every chart in the right palette. Concrete hex is
// returned (not CSS vars) so the share-card export — which serialises the
// live SVG — captures resolved colours.
//
// Mobile: ladder/row-list charts render a compact narrow viewBox (class
// `vx-fit`) so they FIT a phone screen at readable size; wide time-series
// charts instead keep a min-width and pan horizontally (see app.css).
import React from 'react';
import { useIsMobile } from '../../../lib/shared.jsx';
import { COMPOUNDS } from './derive.js';

const DARK = {
  bg: '#0F1014', panel: '#141519', hover: '#1B1C22', inset2: '#16171D', pill: '#1F2027',
  grid: '#22232A', line: '#26272E', line2: '#1E1F26', line3: '#33343C', line4: '#44454E',
  axis: '#85868E', fg: '#F2F2F4', fg2: '#C2C3CA', fg3: '#9A9BA3', fg4: '#63646C',
  dim: '#2A2B33', faint: '#565760',
  amber: '#E3B341', purple: '#A78BFA', red: '#E8002D', green: '#3DDC97', blue: '#64C4FF', pink: '#FF6B81', yellow: '#F5C518',
  bandSC: 'rgba(227,179,65,0.10)', bandVSC: 'rgba(227,179,65,0.05)', bandGreen: 'rgba(61,220,151,0.12)',
};
const LIGHT = {
  bg: '#FFFFFF', panel: '#F4F4F6', hover: '#EAEAEE', inset2: '#F0F0F3', pill: '#ECECEF',
  grid: '#E6E6EA', line: '#E1E1E6', line2: '#ECECF0', line3: '#D4D5DC', line4: '#C2C3CA',
  axis: '#6B6C74', fg: '#15161A', fg2: '#3A3B42', fg3: '#6B6C74', fg4: '#8A8B93',
  dim: '#D2D3DA', faint: '#A9AAB2',
  amber: '#B45309', purple: '#7C3AED', red: '#E8002D', green: '#0F9D58', blue: '#2563EB', pink: '#E11D48', yellow: '#CA8A04',
  bandSC: 'rgba(180,83,9,0.12)', bandVSC: 'rgba(180,83,9,0.06)', bandGreen: 'rgba(15,157,88,0.14)',
};

let _light = false;
// Called by the island from the site theme; charts re-read PANEL on re-render.
export function setPanelTheme(light) { _light = !!light; }
export function panelIsLight() { return _light; }

// PANEL.* getters resolve to the active theme at read time.
export const PANEL = {};
for (const key of Object.keys(DARK)) {
  Object.defineProperty(PANEL, key, { enumerable: true, get() { return _light ? LIGHT[key] : DARK[key]; } });
}

// Tyre-compound fill for marks drawn on the chart background. HARD is white
// (#EDEDED) — invisible on the light theme's white inset — so it's darkened to
// a readable silver there; every other compound reads on both backgrounds.
export function compoundColor(key) {
  if (_light && key === 'H') return '#B9BAC0';
  return COMPOUNDS[key]?.color || PANEL.faint;
}

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
// Fits the screen on mobile (narrow viewBox, no pan).
export function Ladder({ rows, width = 500, rowH = 31, barMax = 310 }) {
  const mob = useIsMobile();
  const W = mob ? 420 : width;
  const bMax = mob ? 190 : barMax;
  // x anchors: pos label · face · right-aligned code · bar start
  const [xPos, xFace, xCode, xBar] = mob ? [6, 26, 66, 72] : [12, 36, 88, 96];
  const face = mob ? 18 : 20;
  const height = rows.length * rowH + 14;
  return (
    <svg className="vx-fit" viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', display: 'block' }}>
      {rows.map((r, i) => {
        const y = 14 + i * rowH;
        const w = Math.max(4, r.frac * bMax);
        return (
          <g key={r.code}>
            <text x={xPos} y={y + 12.5} fontFamily={MONO} fontSize="11" fill={PANEL.axis}>{r.pos}</text>
            <FaceImg href={r.face} x={xFace} y={y - 2} size={face} />
            <text x={xCode} y={y + 12.5} fontFamily={MONO} fontSize="11" fontWeight="700" fill={r.color} textAnchor="end">{r.code}</text>
            <rect x={xBar} y={y} width={w.toFixed(1)} height="16" fill={r.color} />
            <text x={(xBar + w + 8).toFixed(1)} y={y + 12.5} fontFamily={MONO} fontSize="11" fill={PANEL.fg2}>{r.txt}</text>
          </g>
        );
      })}
    </svg>
  );
}

// Diverging ladder centred at 0 (lap-1 gains & losses).
// rows: [{ code, color, value, face? }]
// Fits the screen on mobile (narrow viewBox, no pan).
export function DivergingLadder({ rows, width = 500, rowH = 26, fmt }) {
  const mob = useIsMobile();
  const W = mob ? 420 : width;
  const height = rows.length * rowH + 16;
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  const cx = W / 2 + 20;
  const span = W / 2 - (mob ? 92 : 110);
  return (
    <svg className="vx-fit" viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', display: 'block' }}>
      <line x1={cx} x2={cx} y1="6" y2={height - 10} stroke={PANEL.grid} />
      {rows.map((r, i) => {
        const y = 10 + i * rowH;
        const w = (Math.abs(r.value) / maxAbs) * span;
        const pos = r.value >= 0;
        return (
          <g key={r.code}>
            <FaceImg href={r.face} x={cx - span - (mob ? 52 : 56)} y={y - 2} size={18} />
            <text x={cx - span - (mob ? 12 : 14)} y={y + 11} fontFamily={MONO} fontSize="11" fontWeight="700" fill={r.color} textAnchor="end">{r.code}</text>
            <rect x={pos ? cx : cx - w} y={y} width={Math.max(2, w).toFixed(1)} height="13" fill={pos ? r.color : PANEL.dim} stroke={pos ? 'none' : r.color} strokeWidth={pos ? 0 : 1} />
            {/* negative labels sit right of the axis (always empty there) —
                at the bar tip they collide with the code on full-span bars */}
            <text x={pos ? cx + w + 8 : cx + 8} y={y + 11} fontFamily={MONO} fontSize="10.5" fill={PANEL.fg2} textAnchor="start">
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
