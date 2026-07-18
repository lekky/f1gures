// Race / sprint session charts. Every chart takes:
//   R   — derived race bundle (see deriveRace in RaceWeekendIsland)
//   ctx — { colorOf, teamOf, teamNameOf, nameOf, tip(e,title,lines), leave() }
//   sel — Set of selected driver codes (driver filter)
import React, { useState } from 'react';
import { PANEL, MONO, COND, Bands, YGrid, XTicks, scale, niceTicks, lapTickValues, stackLabels, DivergingLadder, FaceImg, compoundColor } from './primitives.jsx';
import { COMPOUNDS, fmtLap, duelGap, undercutWindows, fuelCorrectedPace } from './derive.js';
import { useIsMobile } from '../../../lib/shared.jsx';

function svgFrac(e) {
  const r = e.currentTarget.getBoundingClientRect();
  return { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height };
}

// ── 1. Race trace ────────────────────────────────────────────────
export function RaceTrace({ R, ctx, sel, passLap = null }) {
  const [hoverLap, setHoverLap] = useState(null);
  const codes = R.finishOrder.filter((c) => sel.has(c) && R.gaps[c]);
  const x0 = 46, x1 = 930;
  const xl = (lap) => x0 + (lap / R.totalLaps) * (x1 - x0);
  let maxGap = 12;
  codes.forEach((c) => R.gaps[c].forEach((g) => { if (g > maxGap) maxGap = g; }));
  // Clamp: a lapped car's 100s+ gap must not crush the front-field story.
  maxGap = Math.min(Math.ceil(maxGap / 10) * 10, 90);
  const gy = (g) => 12 + (Math.min(g, maxGap) / maxGap) * (374 - 12);
  const lines = codes.map((c) => ({
    code: c, color: ctx.colorOf(c),
    pts: R.gaps[c].map((g, i) => `${xl(i + 1).toFixed(1)},${gy(g).toFixed(1)}`).join(' '),
  }));
  const labels = stackLabels(codes.map((c) => {
    const arr = R.gaps[c];
    return { code: c, x: xl(arr.length) + 6, y: gy(arr[arr.length - 1]), color: ctx.colorOf(c) };
  }));
  const yTicks = [];
  for (let g = 0; g <= maxGap; g += maxGap > 60 ? 20 : 10) yTicks.push({ y: gy(g).toFixed(1), label: `${g}s` });
  const onMove = (e) => {
    const { fx } = svgFrac(e);
    const lap = Math.max(1, Math.min(R.totalLaps, Math.round(((fx * 1000 - x0) / (x1 - x0)) * R.totalLaps)));
    setHoverLap(lap);
    const lines2 = codes
      .filter((c) => lap <= R.gaps[c].length)
      .map((c) => ({ c, g: R.gaps[c][lap - 1], p: R.pos[c][lap] }))
      .sort((a, b) => a.g - b.g)
      .slice(0, 8)
      .map((o) => ({ color: ctx.colorOf(o.c), txt: `P${o.p ?? '?'} ${o.c}  ${o.g === 0 ? 'LEADER' : `+${o.g.toFixed(1)}s`}` }));
    ctx.tip(e, `LAP ${lap}`, lines2);
  };
  return (
    <svg viewBox="0 0 1000 400" style={{ width: '100%', display: 'block', cursor: 'crosshair' }}
      onMouseMove={onMove} onMouseLeave={() => { setHoverLap(null); ctx.leave(); }}>
      <Bands bands={R.bands} xl={xl} y={10} h={364} />
      <YGrid ticks={yTicks} x0={x0} x1={x1} />
      <XTicks ticks={lapTickValues(R.totalLaps).map((l) => ({ x: xl(l).toFixed(1), label: `L${l}` }))} y={392} />
      {passLap != null && (
        <g>
          <line x1={xl(passLap)} x2={xl(passLap)} y1="10" y2="374" stroke={PANEL.amber} strokeWidth="1.5" strokeDasharray="5 4" />
          <text x={xl(passLap)} y="24" fontFamily={MONO} fontSize="10" fontWeight="600" fill={PANEL.amber} textAnchor="middle">{`THE PASS · L${passLap}`}</text>
        </g>
      )}
      {hoverLap != null && <line x1={xl(hoverLap)} x2={xl(hoverLap)} y1="10" y2="374" stroke={PANEL.fg} strokeDasharray="3 3" />}
      {lines.map((ln) => <polyline key={ln.code} points={ln.pts} fill="none" stroke={ln.color} strokeWidth="2.4" strokeLinejoin="round" />)}
      {labels.map((lb) => (
        <g key={lb.code}>
          <FaceImg href={ctx.faceImg?.(lb.code)} x={lb.x} y={lb.y - 12} size={16} />
          <text x={(lb.x + (ctx.faceImg?.(lb.code) ? 20 : 0)).toFixed(1)} y={lb.y.toFixed(1)} fontFamily={MONO} fontSize="11" fontWeight="700" fill={lb.color}>{lb.code}</text>
        </g>
      ))}
    </svg>
  );
}

// ── 2. Position changes ──────────────────────────────────────────
export function PositionChart({ R, ctx, sel }) {
  const x0 = 60, x1 = 930;
  const n = R.finishOrder.length;
  const xl = (lap) => x0 + (lap / R.totalLaps) * (x1 - x0);
  const py = (p) => 16 + ((p - 1) / Math.max(1, n - 1)) * (518 - 16);
  const mk = (c) => R.pos[c].map((p, i) => `${xl(i).toFixed(1)},${py(p).toFixed(1)}`).join(' ');
  const onMove = (e) => {
    const { fx } = svgFrac(e);
    const lap = Math.max(0, Math.min(R.totalLaps, Math.round(((fx * 1000 - x0) / (x1 - x0)) * R.totalLaps)));
    const lines = R.finishOrder
      .filter((c) => sel.has(c) && lap < R.pos[c].length)
      .map((c) => ({ c, p: R.pos[c][lap] }))
      .sort((a, b) => a.p - b.p).slice(0, 8)
      .map((o) => ({ color: ctx.colorOf(o.c), txt: `P${o.p}  ${o.c}` }));
    ctx.tip(e, lap === 0 ? 'GRID' : `LAP ${lap}`, lines);
  };
  return (
    <svg viewBox="0 0 1000 540" style={{ width: '100%', display: 'block', cursor: 'crosshair' }} onMouseMove={onMove} onMouseLeave={ctx.leave}>
      <Bands bands={R.bands} xl={xl} y={12} h={506} labels={false} />
      <XTicks ticks={lapTickValues(R.totalLaps).map((l) => ({ x: xl(l).toFixed(1), label: `L${l}` }))} y={536} />
      {R.finishOrder.filter((c) => !sel.has(c)).map((c) => (
        <polyline key={c} points={mk(c)} fill="none" stroke={PANEL.dim} strokeWidth="1.4" strokeLinejoin="round" />
      ))}
      {R.finishOrder.filter((c) => sel.has(c)).map((c) => (
        <polyline key={c} points={mk(c)} fill="none" stroke={ctx.colorOf(c)} strokeWidth="3" strokeLinejoin="round" />
      ))}
      {R.finishOrder.map((c) => (
        <text key={`l${c}`} x="34" y={(py(R.pos[c][0]) + 3).toFixed(1)} fontFamily={MONO} fontSize="10" fontWeight="600"
          fill={sel.has(c) ? ctx.colorOf(c) : PANEL.faint} textAnchor="end">{c}</text>
      ))}
      {R.finishOrder.map((c) => {
        const arr = R.pos[c];
        const face = sel.has(c) ? ctx.faceImg?.(c) : null;
        const ly = py(arr[arr.length - 1]);
        return (
          <g key={`r${c}`}>
            <FaceImg href={face} x={934} y={ly - 8} size={15} />
            <text x={face ? 952 : 940} y={(ly + 3).toFixed(1)} fontFamily={MONO} fontSize="10" fontWeight="600"
              fill={sel.has(c) ? ctx.colorOf(c) : PANEL.faint}>{`P${R.posFinal[c] ?? arr[arr.length - 1]} ${c}`}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── 3. Tyre strategy ─────────────────────────────────────────────
export function StintChart({ R, ctx }) {
  const rowH = 23;
  const x0 = 60, x1 = 960;
  const xl = (lap) => x0 + (lap / R.totalLaps) * (x1 - x0);
  const height = 10 + R.finishOrder.length * rowH + 34;
  return (
    <svg viewBox={`0 0 1000 ${height}`} style={{ width: '100%', display: 'block' }}>
      <Bands bands={R.bands} xl={xl} y={6} h={height - 38} labels={false} />
      {R.finishOrder.map((c, i) => {
        const y = 10 + i * rowH;
        const st = R.stints.filter((s) => s.code === c);
        const pits = R.pits.filter((p) => p.code === c && p.lap != null);
        return (
          <g key={c}>
            <FaceImg href={ctx.faceImg?.(c)} x={42} y={y - 1} size={17} />
            <text x="40" y={y + 12} fontFamily={MONO} fontSize="11" fontWeight="600" fill={ctx.colorOf(c)} textAnchor="end">{c}</text>
            {st.map((s, k) => {
              const x = xl(s.from - 1), w = Math.max(3, xl(s.to) - x);
              return (
                <rect key={k} x={x.toFixed(1)} y={y} width={w.toFixed(1)} height="15" fill={compoundColor(s.compound)}
                  onMouseMove={(e) => ctx.tip(e, `${c} · ${COMPOUNDS[s.compound]?.name || s.compound}${s.used ? ' (USED)' : ''}`, [
                    { color: COMPOUNDS[s.compound]?.color, txt: `L${s.from}–L${s.to} (${s.to - s.from + 1} laps)` },
                    { color: ctx.colorOf(c), txt: ctx.teamNameOf(c) },
                  ])}
                  onMouseLeave={ctx.leave} />
              );
            })}
            {pits.map((p, k) => <rect key={`p${k}`} x={xl(p.lap).toFixed(1)} y={y - 2} width="2.5" height="19" fill={PANEL.fg} />)}
          </g>
        );
      })}
      <XTicks ticks={lapTickValues(R.totalLaps).map((l) => ({ x: xl(l).toFixed(1), label: `L${l}` }))} y={height - 8} />
    </svg>
  );
}

// ── 4. Pit stop timeline (pit-lane time) ─────────────────────────
export function PitTimeline({ R, ctx }) {
  const stops = R.pits.filter((p) => p.dur != null && p.lap != null);
  if (!stops.length) return <EmptyNote txt="No pit-lane timing available for this session." />;
  const durs = stops.map((p) => p.dur).sort((a, b) => a - b);
  const lo = durs[0], cutoff = lo + 15;
  const shown = stops.filter((p) => p.dur <= cutoff);
  const outliers = stops.filter((p) => p.dur > cutoff);
  const dmax = Math.max(...shown.map((p) => p.dur));
  const x0 = 46, x1 = 486;
  const px = (l) => x0 + (l / R.totalLaps) * (x1 - x0);
  const py = scale(lo - 0.5, dmax + 0.5, 296, 16);
  const yTicks = niceTicks(lo - 0.5, dmax + 0.5, 5).map((t) => ({ y: py(t).toFixed(1), label: `${t.toFixed(0)}s` }));
  return (
    <svg viewBox="0 0 500 330" style={{ width: '100%', display: 'block' }}>
      <Bands bands={R.bands} xl={px} y={8} h={288} labels={false} />
      <YGrid ticks={yTicks} x0={x0 - 6} x1={x1} />
      {shown.map((p, i) => {
        const cx = px(p.lap), cy = py(p.dur);
        return (
          <rect key={i} x={(cx - 4.5).toFixed(1)} y={(cy - 4.5).toFixed(1)} width="9" height="9"
            fill={p.neutral ? PANEL.bg : ctx.colorOf(p.code)} stroke={ctx.colorOf(p.code)} strokeWidth="1.5"
            transform={p.neutral ? `rotate(45 ${cx.toFixed(1)} ${cy.toFixed(1)})` : undefined}
            onMouseMove={(e) => ctx.tip(e, `${p.code} · LAP ${p.lap}`, [
              { color: ctx.colorOf(p.code), txt: `${p.dur.toFixed(1)}s in the pit lane` },
              { color: PANEL.amber, txt: p.neutral ? 'Cheap stop — under SC/VSC' : 'Green-flag stop' },
            ])}
            onMouseLeave={ctx.leave} />
        );
      })}
      <XTicks ticks={lapTickValues(R.totalLaps).map((l) => ({ x: px(l).toFixed(1), label: `L${l}` }))} y={322} />
      {outliers.length > 0 && (
        <text x={x1} y="20" fontFamily={MONO} fontSize="9" fill={PANEL.axis} textAnchor="end">
          {`${outliers.length} slow stops not shown (${outliers.slice(0, 3).map((p) => `${p.code} ${p.dur.toFixed(0)}s`).join(' · ')})`}
        </text>
      )}
      <text x={x0 - 6} y="12" fontFamily={MONO} fontSize="9" fill={PANEL.axis}>PIT-LANE TIME (S) · ◆ = UNDER SC/VSC</text>
    </svg>
  );
}

// ── 5. Tyre degradation ──────────────────────────────────────────
export function DegChart({ R, ctx, sel, deg }) {
  const lines = deg.filter((d) => sel.has(d.code)).slice(0, 12);
  if (!lines.length) return <EmptyNote txt="Select at least one driver in the filter above." />;
  let dmin = Infinity, dmax = 0, amax = 8;
  lines.forEach((d) => d.pts.forEach((p) => {
    if (p.t < dmin) dmin = p.t;
    if (p.t > dmax) dmax = p.t;
    if (p.age > amax) amax = p.age;
  }));
  dmax = Math.min(dmax, dmin + 4.5);
  const shown = lines.slice(0, 8);
  const gy = scale(dmin, dmax, 24, 300);
  const gx = scale(0, amax, 52, 458);
  const yTicks = niceTicks(dmin, dmax, 4).map((t) => ({ y: gy(t).toFixed(1), label: fmtLap(t).slice(0, -2) }));
  const dashOf = (c) => (c === 'M' ? '' : c === 'H' ? '8 5' : '2 4');
  return (
    <svg viewBox="0 0 500 330" style={{ width: '100%', display: 'block' }}>
      <YGrid ticks={yTicks} x0={46} x1={490} />
      <XTicks ticks={[0, 10, 20, 30].filter((a) => a <= amax).map((a) => ({ x: gx(a).toFixed(1), label: a }))} y={322} />
      {shown.map((d, i) => {
        const last = d.pts[d.pts.length - 1];
        return (
          <g key={i}>
            <polyline points={d.pts.map((p) => `${gx(p.age).toFixed(1)},${gy(Math.min(p.t, dmax)).toFixed(1)}`).join(' ')}
              fill="none" stroke={ctx.colorOf(d.code)} strokeWidth="2.2" strokeDasharray={dashOf(d.compound)} strokeLinejoin="round" />
            <text x={Math.min(gx(last.age) + 5, 455).toFixed(1)} y={gy(Math.min(last.t, dmax)).toFixed(1)} fontFamily={MONO} fontSize="10" fontWeight="700" fill={ctx.colorOf(d.code)}>
              {`${d.code}·${d.compound}`}
            </text>
          </g>
        );
      })}
      <text x="52" y="14" fontFamily={MONO} fontSize="9" fill={PANEL.axis}>solid=MED dashed=HARD dotted=SOFT · TYRE AGE (LAPS) →</text>
    </svg>
  );
}

// ── 6. Team race pace ────────────────────────────────────────────
export function TeamPaceChart({ pace, ctx }) {
  if (!pace.length) return <EmptyNote txt="Not enough green-flag laps yet." />;
  const pmin = Math.min(...pace.map((s) => s.lo)) - 0.2;
  const pmax = Math.max(...pace.map((s) => s.hi)) + 0.2;
  const py = scale(pmin, pmax, 16, 264);
  const yTicks = niceTicks(pmin, pmax, 5).map((t) => ({ y: py(t).toFixed(1), label: fmtLap(t).slice(0, -4) }));
  const step = Math.min(84, 900 / Math.max(1, pace.length));
  return (
    <svg viewBox="0 0 1000 300" style={{ width: '100%', display: 'block' }}>
      <YGrid ticks={yTicks} x0={60} x1={980} />
      {pace.map((s, i) => {
        const cx = 110 + i * step;
        const color = s.color;
        return (
          <g key={s.team}>
            <line x1={cx} x2={cx} y1={py(s.lo).toFixed(1)} y2={py(s.hi).toFixed(1)} stroke={color} strokeWidth="1.5" />
            <rect x={cx - 28} y={py(s.q1).toFixed(1)} width="56" height={Math.max(3, py(s.q3) - py(s.q1)).toFixed(1)} fill={`${color}2E`} stroke={color} strokeWidth="2" />
            <line x1={cx - 28} x2={cx + 28} y1={py(s.med).toFixed(1)} y2={py(s.med).toFixed(1)} stroke={color} strokeWidth="3" />
            <text x={cx} y="290" fontFamily={COND} fontSize="12" fontWeight="600" letterSpacing="1" fill={PANEL.fg2} textAnchor="middle">{s.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── 7. Overtake matrix ───────────────────────────────────────────
export function OvertakeMatrix({ R, ctx }) {
  const passes = R.passes;
  if (!passes.length) return <EmptyNote txt="No on-track passes detected." />;
  const byPasser = {};
  passes.forEach((p) => { (byPasser[p.by] = byPasser[p.by] || []).push(p); });
  const passers = Object.keys(byPasser).sort((a, b) => byPasser[b].length - byPasser[a].length);
  return (
    <div style={{ padding: '4px 2px', maxHeight: 440, overflowY: 'auto' }}>
      {passers.map((c) => (
        <div key={c} style={{ display: 'grid', gridTemplateColumns: '76px 40px 1fr', gap: 10, alignItems: 'start', padding: '7px 4px', borderBottom: `1px solid ${PANEL.line2}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 12, fontWeight: 700, color: ctx.colorOf(c) }}>
            {ctx.faceImg?.(c) && <img src={ctx.faceImg(c)} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />}
            {c}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: PANEL.fg2 }}>×{byPasser[c].length}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {byPasser[c].map((p, i) => (
              <span key={i} title={`Passed ${p.on} on lap ${p.lap}`} style={{
                fontFamily: MONO, fontSize: 10, padding: '3px 6px', background: PANEL.hover,
                borderLeft: `3px solid ${COMPOUNDS[p.tyre]?.color || PANEL.faint}`, color: PANEL.fg2,
              }}>{`${p.on} · L${p.lap}`}</span>
            ))}
          </div>
        </div>
      ))}
      <div style={{ fontFamily: MONO, fontSize: 9, color: PANEL.axis, padding: '8px 4px 2px' }}>
        CHIP EDGE = TYRE THE PASSER WAS ON · EXCLUDES LAP 1, PIT SWAPS AND SC/VSC LAPS
      </div>
    </div>
  );
}

// ── 8. Undercut calculator ───────────────────────────────────────
export function UndercutTable({ R, ctx }) {
  const wins = undercutWindows(R.laps, R.cum, R.pits, R.pos).filter((w) => !w.neutral);
  if (!wins.length) return <EmptyNote txt="No green-flag pit windows with close rivals." />;
  return (
    <div style={{ padding: '4px 2px', maxHeight: 440, overflowY: 'auto' }}>
      {wins.map((w, i) => (
        <div key={i} style={{ padding: '8px 4px', borderBottom: `1px solid ${PANEL.line2}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 11, fontWeight: 700, color: ctx.colorOf(w.code) }}>
            {ctx.faceImg?.(w.code) && <img src={ctx.faceImg(w.code)} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />}
            {w.code} <span style={{ color: PANEL.axis, fontWeight: 400 }}>· stops lap {w.lap}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
            {w.rivals.map((r, k) => {
              const gained = r.gained > 0.05 ? `+${r.gained.toFixed(1)}s` : r.gained < -0.05 ? `${r.gained.toFixed(1)}s` : '±0.0s';
              const col = r.gained > 0.05 ? PANEL.green : r.gained < -0.05 ? PANEL.pink : PANEL.fg3;
              return (
                <span key={k} style={{ fontFamily: MONO, fontSize: 10.5, padding: '3px 7px', background: PANEL.hover, color: PANEL.fg2 }}>
                  vs <b style={{ color: ctx.colorOf(r.code) }}>{r.code}</b>{r.rivalStop ? ` (stops L${r.rivalStop})` : ' (stays out)'} → <b style={{ color: col }}>{gained}</b>
                </span>
              );
            })}
          </div>
        </div>
      ))}
      <div style={{ fontFamily: MONO, fontSize: 9, color: PANEL.axis, padding: '8px 4px 2px' }}>
        GAIN = GAP CHANGE TO EACH RIVAL WITHIN ±5s, MEASURED 3 LAPS AFTER BOTH CARS SETTLE
      </div>
    </div>
  );
}

// ── 9. Lap 1 gains & losses ─────────────────────────────────────
export function Lap1Chart({ R, ctx }) {
  const rows = R.lap1.map((r) => ({ code: r.code, color: ctx.colorOf(r.code), value: r.delta, face: ctx.faceImg?.(r.code) }));
  return <DivergingLadder rows={rows} width={520} fmt={(v) => (v > 0 ? `+${v}` : `${v}`)} />;
}

// ── 10. Duel picker ─────────────────────────────────────────────
export function DuelChart({ R, ctx }) {
  const order = R.finishOrder;
  const [a, setA] = useState(order[0]);
  const [b, setB] = useState(order[1]);
  const gaps = duelGap(R.cum, a, b);
  const x0 = 46, x1 = 930;
  const xl = (lap) => x0 + (lap / R.totalLaps) * (x1 - x0);
  const maxAbs = Math.max(2, ...gaps.map((g) => Math.abs(g)));
  const gy = scale(-maxAbs, maxAbs, 330, 14);
  const yTicks = niceTicks(-maxAbs, maxAbs, 6).map((t) => ({ y: gy(t).toFixed(1), label: `${t > 0 ? '+' : ''}${t.toFixed(0)}s` }));
  const stopsA = R.pits.filter((p) => p.code === a && p.lap != null);
  const stopsB = R.pits.filter((p) => p.code === b && p.lap != null);
  const selStyle = {
    background: PANEL.hover, color: PANEL.fg, border: `1px solid ${PANEL.line3}`, fontFamily: MONO,
    fontSize: 12, padding: '5px 8px',
  };
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '2px 2px 10px' }}>
        <select value={a} onChange={(e) => setA(e.target.value)} style={selStyle} aria-label="Driver A">
          {order.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ fontFamily: COND, fontWeight: 800, fontSize: 13, color: PANEL.red, letterSpacing: '0.08em' }}>VS</span>
        <select value={b} onChange={(e) => setB(e.target.value)} style={selStyle} aria-label="Driver B">
          {order.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ fontFamily: MONO, fontSize: 10, color: PANEL.axis }}>
          above line = <b style={{ color: ctx.colorOf(b) }}>{b}</b> behind · ▼ = pit stop
        </span>
      </div>
      <svg viewBox="0 0 1000 372" style={{ width: '100%', display: 'block' }}>
        <Bands bands={R.bands} xl={xl} y={10} h={344} labels={false} />
        <YGrid ticks={yTicks} x0={x0} x1={x1} />
        <line x1={x0} x2={x1} y1={gy(0).toFixed(1)} y2={gy(0).toFixed(1)} stroke={PANEL.line4} strokeDasharray="4 3" />
        <polyline points={gaps.map((g, i) => `${xl(i + 1).toFixed(1)},${gy(Math.max(-maxAbs, Math.min(maxAbs, g))).toFixed(1)}`).join(' ')}
          fill="none" stroke={ctx.colorOf(b)} strokeWidth="2.6" strokeLinejoin="round" />
        {stopsA.map((p, i) => <path key={`a${i}`} d={`M ${xl(p.lap)} 352 l -5 9 l 10 0 z`} fill={ctx.colorOf(a)} />)}
        {stopsB.map((p, i) => <path key={`b${i}`} d={`M ${xl(p.lap)} 12 l -5 -0 l 5 9 l 5 -9 z`} fill={ctx.colorOf(b)} />)}
        <XTicks ticks={lapTickValues(R.totalLaps).map((l) => ({ x: xl(l).toFixed(1), label: `L${l}` }))} y={368} />
      </svg>
    </div>
  );
}

// ── 11. Weather overlay ─────────────────────────────────────────
export function WeatherStrip({ weather }) {
  const s = weather?.samples || [];
  if (s.length < 3) return <EmptyNote txt="No weather samples for this session." />;
  const t0 = s[0][0];
  const mins = s.map((x) => x[0] - t0);
  const span = mins[mins.length - 1] || 1;
  const x0 = 52, x1 = 960;
  const gx = (m) => x0 + (m / span) * (x1 - x0);
  const temps = s.flatMap((x) => [x[1], x[2]]).filter((v) => v != null);
  const tmin = Math.min(...temps) - 2, tmax = Math.max(...temps) + 2;
  const ty = scale(tmin, tmax, 210, 20);
  const winds = s.map((x) => x[3]).filter((v) => v != null);
  const wmax = Math.max(5, ...winds);
  const wy = scale(0, wmax, 330, 250);
  const yTicks = niceTicks(tmin, tmax, 4).map((t) => ({ y: ty(t).toFixed(1), label: `${t.toFixed(0)}°` }));
  const mk = (idx) => s.filter((x) => x[idx] != null).map((x) => `${gx(x[0] - t0).toFixed(1)},${ty(x[idx]).toFixed(1)}`).join(' ');
  return (
    <svg viewBox="0 0 1000 360" style={{ width: '100%', display: 'block' }}>
      {s.map((x, i) => x[4] ? (
        <rect key={i} x={gx(x[0] - t0) - 6} y="14" width="12" height="320" fill="rgba(42,120,214,0.16)" />
      ) : null)}
      <YGrid ticks={yTicks} x0={x0} x1={x1} />
      <polyline points={mk(2)} fill="none" stroke={PANEL.amber} strokeWidth="2.4" strokeLinejoin="round" />
      <polyline points={mk(1)} fill="none" stroke={PANEL.blue} strokeWidth="2" strokeLinejoin="round" />
      <polyline points={s.filter((x) => x[3] != null).map((x) => `${gx(x[0] - t0).toFixed(1)},${wy(x[3]).toFixed(1)}`).join(' ')}
        fill="none" stroke={PANEL.fg3} strokeWidth="1.6" strokeDasharray="4 3" />
      <text x={x0} y="14" fontFamily={MONO} fontSize="9" fill={PANEL.axis}>
        <tspan fill={PANEL.amber} fontWeight="700">TRACK</tspan> · <tspan fill={PANEL.blue} fontWeight="700">AIR</tspan> °C · <tspan fill={PANEL.fg3} fontWeight="700">WIND</tspan> (LOWER STRIP, MAX {wmax.toFixed(0)} KM/H) · BLUE BANDS = RAIN
      </text>
      <XTicks ticks={[0, 0.25, 0.5, 0.75, 1].map((f) => ({ x: gx(f * span).toFixed(1), label: `+${Math.round(f * span)}m` }))} y={352} />
    </svg>
  );
}

// ── 12. Race control feed ───────────────────────────────────────
const RC_COLOR_KEYS = { SafetyCar: 'amber', Flag: 'fg2', Drs: 'blue', CarEvent: 'pink', Other: 'fg3' };
export function RaceControlFeed({ raceControl }) {
  const msgs = (raceControl || []).filter((m) => m.msg);
  if (!msgs.length) return <EmptyNote txt="No race control messages." />;
  const color = (m) => {
    if (m.flag === 'RED' || /PENALTY|INVESTIGAT/i.test(m.msg)) return PANEL.pink;
    if (/SAFETY CAR|VIRTUAL/i.test(m.msg) || m.cat === 'SafetyCar') return PANEL.amber;
    if (m.flag === 'YELLOW' || m.flag === 'DOUBLE YELLOW') return PANEL.yellow;
    if (m.flag === 'GREEN' || m.flag === 'CLEAR') return PANEL.green;
    return PANEL[RC_COLOR_KEYS[m.cat] || 'fg3'];
  };
  return (
    <div style={{ padding: '2px', maxHeight: 460, overflowY: 'auto' }}>
      {msgs.map((m, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '58px 44px 1fr', gap: 10, padding: '6px 4px', borderBottom: `1px solid ${PANEL.line2}`, alignItems: 'baseline' }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: PANEL.axis }}>{m.time || ''}</span>
          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: color(m) }}>{m.lap != null ? `L${m.lap}` : '—'}</span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: PANEL.fg2, lineHeight: 1.45 }}>{m.msg}</span>
        </div>
      ))}
    </div>
  );
}

// ── Sprint vs GP / Sim vs race pace comparison ──────────────────
export function PaceComparison({ laps1, total1, label1, laps2, total2, label2, ctx, order }) {
  if (!laps1 || !laps2) return <EmptyNote txt={`Needs both ${label1} and ${label2} data — check back after both sessions.`} />;
  const p1 = fuelCorrectedPace(laps1, total1);
  const p2 = fuelCorrectedPace(laps2, total2);
  const codes = order.filter((c) => p1[c] != null && p2[c] != null);
  if (!codes.length) return <EmptyNote txt="Not enough clean laps in both sessions." />;
  const rows = codes.map((c) => ({ code: c, a: p1[c], b: p2[c] }));
  return <DumbbellPairs rows={rows} label1={label1} label2={label2} ctx={ctx} />;
}

// rows: [{code, a, b}] — hollow dot at a, solid dot at b, sorted by b.
// Fits the screen on mobile: narrow viewBox, faces dropped, fewer axis ticks.
export function DumbbellPairs({ rows: rowsIn, label1, label2, ctx }) {
  const mob = useIsMobile();
  const rows = rowsIn.map((r) => ({ ...r, d: +(r.b - r.a).toFixed(3) })).sort((x, y) => x.b - y.b);
  const all = rows.flatMap((r) => [r.a, r.b]);
  const lo = Math.min(...all) - 0.3, hi = Math.max(...all) + 0.3;
  const W = mob ? 420 : 1000;
  const [x0, x1, xVal] = mob ? [52, 348, 356] : [120, 900, 912];
  const gx = scale(lo, hi, x0, x1);
  const rowH = 26;
  const height = rows.length * rowH + 40;
  const legend = mob ? '' : 'FUEL-CORRECTED MEDIAN PACE · ';
  return (
    <svg className="vx-fit" viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', display: 'block' }}>
      <text x={mob ? 6 : 120} y="14" fontFamily={MONO} fontSize="9" fill={PANEL.axis}>
        {legend}<tspan fill={PANEL.faint} fontWeight="700">○ {label1.toUpperCase()}</tspan> → <tspan fill={PANEL.fg} fontWeight="700">● {label2.toUpperCase()}</tspan>
      </text>
      {rows.map((r, i) => {
        const y = 32 + i * rowH;
        return (
          <g key={r.code}>
            {!mob && <FaceImg href={ctx.faceImg?.(r.code)} x={62} y={y - 9} size={18} />}
            <text x={mob ? 40 : 56} y={y + 4} fontFamily={MONO} fontSize="11" fontWeight="700" fill={ctx.colorOf(r.code)} textAnchor="end">{r.code}</text>
            <line x1={gx(r.a).toFixed(1)} x2={gx(r.b).toFixed(1)} y1={y} y2={y} stroke={ctx.colorOf(r.code)} strokeWidth="2" opacity="0.55" />
            <circle cx={gx(r.a).toFixed(1)} cy={y} r="4.5" fill={PANEL.bg} stroke={ctx.colorOf(r.code)} strokeWidth="1.8" />
            <circle cx={gx(r.b).toFixed(1)} cy={y} r="4.5" fill={ctx.colorOf(r.code)} />
            <text x={xVal} y={y + 4} fontFamily={MONO} fontSize="10.5" fill={r.d <= 0 ? PANEL.green : PANEL.fg3}>
              {`${r.d > 0 ? '+' : ''}${r.d.toFixed(2)}s`}
            </text>
          </g>
        );
      })}
      {niceTicks(lo, hi, mob ? 3 : 6).map((t, i) => (
        <text key={i} x={gx(t).toFixed(1)} y={height - 8} fontFamily={MONO} fontSize="9" fill={PANEL.axis} textAnchor="middle">{fmtLap(t).slice(0, -2)}</text>
      ))}
    </svg>
  );
}

export function EmptyNote({ txt }) {
  return (
    <div style={{ padding: '48px 20px', textAlign: 'center', fontFamily: MONO, fontSize: 11, color: PANEL.axis, letterSpacing: '0.06em' }}>
      {txt}
    </div>
  );
}
