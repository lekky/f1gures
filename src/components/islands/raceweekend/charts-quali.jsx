// Qualifying / sprint-quali / practice session charts.
import React, { useState } from 'react';
import { PANEL, MONO, COND, YGrid, XTicks, scale, niceTicks, Ladder, distinctColors, FaceImg, compoundColor } from './primitives.jsx';
import { COMPOUNDS, fmtLap, segmentBests, theoreticalBest, progressionRows, spreadLabels, cornerMarkers, compoundOffsets } from './derive.js';
import { EmptyNote } from './charts-race.jsx';
import { useIsMobile } from '../../../lib/shared.jsx';

function svgFrac(e) {
  const r = e.currentTarget.getBoundingClientRect();
  return { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height };
}

// best segment time each driver posted (Q3 > Q2 > Q1)
function bestSeg(r) {
  return r.q3 ?? r.q2 ?? r.q1 ?? null;
}

// ── Gap to pole ladder (quali + SQ) ─────────────────────────────
export function GapLadder({ results, ctx, poleLabel = 'POLE' }) {
  const rows = results
    .map((r) => ({ code: r.code, t: r.q3 }))
    .filter((r) => r.t != null)
    .sort((a, b) => a.t - b.t)
    .slice(0, 10);
  if (rows.length < 2) return <EmptyNote txt="No final-segment times available." />;
  const pole = rows[0].t;
  const maxD = rows[rows.length - 1].t - pole || 1;
  return (
    <Ladder rows={rows.map((r, i) => ({
      pos: `P${i + 1}`, code: r.code, color: ctx.colorOf(r.code),
      face: ctx.faceImg?.(r.code),
      frac: 0.04 + ((r.t - pole) / maxD) * 0.92,
      txt: i === 0 ? `${fmtLap(pole)} · ${poleLabel}` : `+${(r.t - pole).toFixed(3)}`,
    }))} />
  );
}

// ── Sector battle heat table ────────────────────────────────────
export function SectorBattle({ sectors, ctx }) {
  const rows = sectors.filter((s) => s.s && s.s.every((v) => v != null)).slice(0, 10);
  if (!rows.length) return <EmptyNote txt="No sector times available." />;
  const best = [0, 1, 2].map((i) => Math.min(...rows.map((r) => r.s[i])));
  return (
    <div style={{ padding: '6px 4px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '82px 1fr 1fr 1fr', gap: 4, fontFamily: COND, fontWeight: 600, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: PANEL.fg3, paddingBottom: 6 }}>
        <div></div><div style={{ textAlign: 'center' }}>Sector 1</div><div style={{ textAlign: 'center' }}>Sector 2</div><div style={{ textAlign: 'center' }}>Sector 3</div>
      </div>
      {rows.map((r) => (
        <div key={r.code} style={{ display: 'grid', gridTemplateColumns: '82px 1fr 1fr 1fr', gap: 4, marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 11, fontWeight: 700, color: ctx.colorOf(r.code) }}>
            {ctx.faceImg?.(r.code) && <img src={ctx.faceImg(r.code)} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />}
            {r.code}
          </div>
          {r.s.map((v, i) => {
            const d = v - best[i];
            let bg = PANEL.panel, fg = PANEL.fg4, txt = `+${d.toFixed(3)}`;
            if (d === 0) { bg = '#7C3AED'; fg = '#fff'; txt = v.toFixed(3); }
            else if (d < 0.08) { bg = PANEL.bandGreen; fg = PANEL.green; }
            else if (d < 0.2) { bg = PANEL.hover; fg = PANEL.fg2; }
            return (
              <div key={i} style={{ textAlign: 'center', fontFamily: MONO, fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums', padding: '6px 0', background: bg, color: fg }}>
                {txt}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Track dominance map ─────────────────────────────────────────
export function DominanceMap({ dominance, track, corners, sectors, ctx }) {
  if (!dominance || !track?.pts?.length) return <EmptyNote txt="No telemetry available for this session." />;
  const codes = dominance.codes;
  const colors = distinctColors(codes, ctx.colorOf, ctx.teamOf);

  // Fit the outline to the drawing area. The source points are GPS-derived and
  // land wherever the projection put them — Hungary 2026 spans x 50–632 inside
  // a 1000-wide box — so drawing them raw left the map floating up and left
  // with a third of the card empty. The viewBox width then follows the circuit's
  // own aspect (floored by the legend), so a tall track like the Hungaroring
  // gets a near-square card instead of swimming in a fixed 1000-wide one.
  const MAP_H = 636, PAD = 52, SLOT = 230;
  const xs = track.pts.map((p) => p[0]), ys = track.pts.map((p) => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const w = Math.max(1, Math.max(...xs) - minX), h = Math.max(1, Math.max(...ys) - minY);
  const kH = (MAP_H - PAD * 2) / h;
  const legendW = codes.length * SLOT;
  const VB_W = Math.round(Math.min(1000, Math.max(660, legendW, w * kH + PAD * 2)));
  const k = Math.min((VB_W - PAD * 2) / w, kH);
  const ox = (VB_W - w * k) / 2 - minX * k, oy = (MAP_H - h * k) / 2 - minY * k;
  const pts = track.pts.map((p) => [p[0] * k + ox, p[1] * k + oy]);
  const cx = VB_W / 2, cy = MAP_H / 2;

  const per = pts.length / dominance.n;
  const segs = dominance.owners.map((owner, i) => {
    const a = Math.floor(i * per);
    const b = Math.min(pts.length - 1, Math.ceil((i + 1) * per));
    return { owner, pts: pts.slice(a, b + 1) };
  });
  const counts = {};
  dominance.owners.forEach((c) => { counts[c] = (counts[c] || 0) + 1; });
  const laps = Object.fromEntries((sectors || []).map((s) => [s.code, s.lap]));
  const marks = cornerMarkers(corners, track.len, pts.length);
  const sf = pts[0];

  // Legend: one centred slot per driver, code + share on top, lap time beneath.
  const lx = (VB_W - legendW) / 2;

  return (
    <svg viewBox={`0 0 ${VB_W} 724`} style={{ width: '82%', display: 'block', margin: '0 auto' }}>
      <polyline points={pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')} fill="none" stroke={PANEL.line} strokeWidth="22" strokeLinejoin="round" strokeLinecap="round" />
      {segs.map((sg, i) => (
        <polyline key={i} points={sg.pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')} fill="none" stroke={colors[sg.owner]} strokeWidth="12" strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {marks.map((m) => {
        // Offset along the track's local normal, not radially from the centre:
        // the Hungaroring folds back on itself, and a radial push planted T4 and
        // T13 straight on top of the ribbon. Sign picks whichever side of the
        // track faces away from the middle of the map.
        const p = pts[m.idx];
        const n = pts.length;
        const a = pts[(m.idx - 3 + n) % n], b = pts[(m.idx + 3) % n];
        let ux = -(b[1] - a[1]), uy = b[0] - a[0];
        const d = Math.hypot(ux, uy) || 1;
        ux /= d; uy /= d;
        if ((p[0] - cx) * ux + (p[1] - cy) * uy < 0) { ux = -ux; uy = -uy; }
        return (
          <g key={m.label}>
            <line x1={(p[0] + ux * 13).toFixed(1)} y1={(p[1] + uy * 13).toFixed(1)} x2={(p[0] + ux * 20).toFixed(1)} y2={(p[1] + uy * 20).toFixed(1)} stroke={PANEL.fg4} strokeWidth="1.5" />
            <text x={(p[0] + ux * 30).toFixed(1)} y={(p[1] + uy * 30 + 4).toFixed(1)} fontFamily={MONO} fontSize="13" fontWeight="700" fill={PANEL.fg3} textAnchor="middle">{m.label}</text>
          </g>
        );
      })}
      <circle cx={sf[0].toFixed(1)} cy={sf[1].toFixed(1)} r="9" fill={PANEL.fg} />
      <text x={(sf[0] + 16).toFixed(1)} y={(sf[1] + 5).toFixed(1)} fontFamily={MONO} fontSize="15" fontWeight="700" fill={PANEL.fg}>S/F</text>
      {codes.map((c, i) => (
        <g key={c}>
          <FaceImg href={ctx.faceImg?.(c)} x={lx + i * SLOT} y={664} size={34} />
          <rect x={lx + i * SLOT + 44} y={670} width="18" height="18" fill={colors[c]} />
          <text x={lx + i * SLOT + 70} y={685} fontFamily={MONO} fontSize="17" fontWeight="700" fill={PANEL.fg2}>{`${c} × ${counts[c] || 0}`}</text>
          {laps[c] != null && (
            <text x={lx + i * SLOT + 70} y={706} fontFamily={MONO} fontSize="14" fill={PANEL.fg3}>{fmtLap(laps[c])}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

// ── Pole lap telemetry ──────────────────────────────────────────
export function PoleTelemetry({ poleTel, ctx }) {
  const [hoverX, setHoverX] = useState(null);
  if (!poleTel) return <EmptyNote txt="No telemetry available for this session." />;
  const { a, b, speedA, speedB, delta, corners, len, step } = poleTel;
  const colors = distinctColors([a, b], ctx.colorOf, ctx.teamOf);
  const x0 = 44, x1 = 985;
  const sx = (d) => x0 + (d / len) * (x1 - x0);
  const vmax = Math.max(...speedA, ...speedB);
  const vmin = Math.min(...speedA, ...speedB);
  const svy = scale(vmin - 10, vmax + 10, 250, 14);
  const dmax = Math.max(0.05, ...delta.map((v) => Math.abs(v)));
  const dvy = scale(-dmax, dmax, 386, 300);
  const dEnd = delta[delta.length - 1];
  const yTicks = niceTicks(vmin - 10, vmax + 10, 4).map((v) => ({ y: svy(v).toFixed(1), label: Math.round(v) }));
  const onMove = (e) => {
    const { fx } = svgFrac(e);
    const x = Math.max(x0, Math.min(x1, fx * 1000));
    const d = ((x - x0) / (x1 - x0)) * len;
    const i = Math.max(0, Math.min(speedA.length - 1, Math.round(d / step)));
    setHoverX(x);
    ctx.tip(e, `${Math.round(i * step)}m`, [
      { color: colors[a], txt: `${a}  ${Math.round(speedA[i])} km/h` },
      { color: colors[b], txt: `${b}  ${Math.round(speedB[i])} km/h` },
      { color: PANEL.fg, txt: `Δ ${delta[i] >= 0 ? '+' : ''}${delta[i].toFixed(3)}s` },
    ]);
  };
  return (
    <svg viewBox="0 0 1000 400" style={{ width: '100%', display: 'block', cursor: 'crosshair' }}
      onMouseMove={onMove} onMouseLeave={() => { setHoverX(null); ctx.leave(); }}>
      {(corners || []).map((c, i) => (
        <g key={i}>
          <rect x={(sx(c.d) - 14).toFixed(1)} y="10" width="28" height="240" fill={PANEL.inset2} />
          <text x={sx(c.d).toFixed(1)} y={i % 2 ? 268 : 280} fontFamily={MONO} fontSize="8.5" fill={PANEL.faint} textAnchor="middle">{c.name}</text>
        </g>
      ))}
      {[a, b].map((code, i) => (
        <g key={code}>
          <FaceImg href={ctx.faceImg?.(code)} x={720 + i * 130} y={16} size={26} />
          <text x={752 + i * 130} y={34} fontFamily={MONO} fontSize="13" fontWeight="700" fill={colors[code]}>{code}</text>
        </g>
      ))}
      <YGrid ticks={yTicks} x0={x0} x1={x1} />
      {hoverX != null && <line x1={hoverX} x2={hoverX} y1="10" y2="390" stroke={PANEL.fg} strokeDasharray="3 3" />}
      <polyline points={speedA.map((v, i) => `${sx(i * step).toFixed(1)},${svy(v).toFixed(1)}`).join(' ')} fill="none" stroke={colors[a]} strokeWidth="2.6" strokeLinejoin="round" />
      <polyline points={speedB.map((v, i) => `${sx(i * step).toFixed(1)},${svy(v).toFixed(1)}`).join(' ')} fill="none" stroke={colors[b]} strokeWidth="2.4" strokeLinejoin="round" />
      <line x1={x0} x2={x1} y1={dvy(0).toFixed(1)} y2={dvy(0).toFixed(1)} stroke={PANEL.line4} strokeDasharray="4 3" />
      <polyline points={delta.map((v, i) => `${sx(i * step).toFixed(1)},${dvy(Math.max(-dmax, Math.min(dmax, v))).toFixed(1)}`).join(' ')} fill="none" stroke={PANEL.fg} strokeWidth="2" />
      <text x={x0} y="296" fontFamily={MONO} fontSize="9" fill={PANEL.fg3}>
        DELTA ({b} vs {a}) — above line = {b} losing time · <tspan fill={colors[a]} fontWeight="700">{a}</tspan> vs <tspan fill={colors[b]} fontWeight="700">{b}</tspan>
      </text>
      <text x={x1} y={(dvy(Math.max(-dmax, Math.min(dmax, dEnd))) + (dEnd >= 0 ? 14 : -6)).toFixed(1)} fontFamily={MONO} fontSize="10" fontWeight="700" fill={PANEL.fg} textAnchor="end">
        {`${dEnd >= 0 ? '+' : ''}${dEnd.toFixed(3)}s`}
      </text>
      <text x={x0} y="398" fontFamily={MONO} fontSize="9" fill={PANEL.axis}>SPEED (KM/H) OVER THE LAP · SHADED BANDS = CORNERS</text>
    </svg>
  );
}

// ── Q1→Q3 progression slope chart ───────────────────────────────
export function ProgressionChart({ results, ctx, segLabels = ['Q1', 'Q2', 'Q3'] }) {
  const rows = progressionRows(results);
  if (!rows.length) return <EmptyNote txt="No segment times available." />;
  const colX = [150, 500, 850];
  // normalise each segment column independently (grip ramps between segments)
  const colVals = [0, 1, 2].map((i) => rows.map((r) => r.segs[i]).filter((v) => v != null));
  const colScales = colVals.map((vals) => {
    if (!vals.length) return () => 0;
    const lo = Math.min(...vals), hi = Math.max(...vals);
    return scale(lo, hi === lo ? lo + 0.5 : hi, 30, 470);
  });
  const lines = rows
    .map((r) => {
      const pts = r.segs.map((v, i) => (v != null ? [colX[i], colScales[i](v)] : null)).filter(Boolean);
      return pts.length < 2 ? null : { code: r.code, pts, end: pts[pts.length - 1] };
    })
    .filter(Boolean);
  // Each label sits at its driver's last point, so drivers knocked out in the
  // same segment share an x — spread within each column, not across the chart.
  const labelY = new Map();
  for (const x of new Set(lines.map((l) => l.end[0]))) {
    const col = lines.filter((l) => l.end[0] === x).map((l) => ({ code: l.code, y: l.end[1] }));
    for (const it of spreadLabels(col, 11, 30, 470)) labelY.set(it.code, it.y);
  }
  return (
    <svg viewBox="0 0 1000 520" style={{ width: '100%', display: 'block' }}>
      {colX.map((x, i) => (
        <g key={i}>
          <line x1={x} x2={x} y1="24" y2="476" stroke={PANEL.grid} />
          <text x={x} y="500" fontFamily={COND} fontSize="14" fontWeight="700" letterSpacing="2" fill={PANEL.fg3} textAnchor="middle">{segLabels[i]}</text>
        </g>
      ))}
      {lines.map((l) => {
        const color = ctx.colorOf(l.code);
        const ly = labelY.get(l.code) ?? l.end[1];
        return (
          <g key={l.code}>
            <polyline points={l.pts.map((p) => `${p[0]},${p[1].toFixed(1)}`).join(' ')} fill="none" stroke={color} strokeWidth="2" opacity="0.85" />
            {l.pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1].toFixed(1)} r="3.4" fill={color} />)}
            {Math.abs(ly - l.end[1]) > 1.5 && (
              <line x1={l.end[0] + 4} y1={l.end[1].toFixed(1)} x2={l.end[0] + 9} y2={ly.toFixed(1)} stroke={color} strokeWidth="1" opacity="0.45" />
            )}
            <text x={l.end[0] + 10} y={(ly + 3.5).toFixed(1)} fontFamily={MONO} fontSize="10" fontWeight="700" fill={color}>{l.code}</text>
          </g>
        );
      })}
      <text x="150" y="14" fontFamily={MONO} fontSize="9" fill={PANEL.axis}>EACH COLUMN SCALED BY TIME · FASTEST (TOP) → SLOWEST · LINE = ONE DRIVER</text>
    </svg>
  );
}

// ── Theoretical best ────────────────────────────────────────────
export function TheoreticalBest({ sectors, ctx }) {
  const mob = useIsMobile();
  const rows = theoreticalBest(sectors).slice(0, 10);
  if (!rows.length) return <EmptyNote txt="Session-best sector data isn't available for this session." />;
  const maxLost = Math.max(0.05, ...rows.map((r) => r.lost));
  return (
    <div style={{ padding: '4px 2px' }}>
      {rows.map((r) => {
        const nameEl = (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 12, fontWeight: 700, color: ctx.colorOf(r.code) }}>
            {ctx.faceImg?.(r.code) && <img src={ctx.faceImg(r.code)} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />}
            {r.code}
          </div>
        );
        const idealEl = <div style={{ fontFamily: MONO, fontSize: 10.5, color: PANEL.fg3 }}>{`IDEAL ${fmtLap(r.ideal)}`}</div>;
        const barEl = (
          <div style={{ height: 12, background: PANEL.pill }}>
            <div style={{ height: 12, width: `${Math.min(100, (r.lost / maxLost) * 100).toFixed(0)}%`, background: r.lost < 0.05 ? PANEL.green : '#7C3AED' }} />
          </div>
        );
        const valEl = (
          <div style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 600, textAlign: 'right', color: PANEL.fg, fontVariantNumeric: 'tabular-nums' }}>
            {`+${r.lost.toFixed(3)} LEFT`}
          </div>
        );
        if (mob) {
          // stacked: identity + numbers on one line, full-width bar below —
          // the desktop 4-column grid leaves the bar ~0 px on a phone
          return (
            <div key={r.code} style={{ padding: '8px 4px', borderBottom: `1px solid ${PANEL.line2}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {nameEl}{idealEl}<div style={{ marginLeft: 'auto' }}>{valEl}</div>
              </div>
              <div style={{ marginTop: 6 }}>{barEl}</div>
            </div>
          );
        }
        return (
          <div key={r.code} style={{ display: 'grid', gridTemplateColumns: '76px 110px 1fr 120px', alignItems: 'center', gap: 10, padding: '7px 4px', borderBottom: `1px solid ${PANEL.line2}` }}>
            {nameEl}{idealEl}{barEl}{valEl}
          </div>
        );
      })}
      <div style={{ fontFamily: MONO, fontSize: 9, color: PANEL.axis, padding: '8px 4px 2px' }}>
        IDEAL LAP = SUM OF OWN BEST SECTORS FROM ANY LAP · BAR = TIME LEFT ON THE TABLE VS ACTUAL BEST
      </div>
    </div>
  );
}

// ── Track evolution / session lap map (scatter) ─────────────────
export function LapScatter({ lapsAll, ctx, showDeleted = false }) {
  const pts = [];
  for (const code of Object.keys(lapsAll || {})) {
    for (const l of lapsAll[code]) {
      // quali shape: [min, t, comp, deleted] — practice shape: [min, t, comp]
      pts.push({ code, min: l[0], t: l[1], c: l[2], del: !!l[3] });
    }
  }
  if (!pts.length) return <EmptyNote txt="No timed laps." />;
  const ts = pts.map((p) => p.t).sort((a, b) => a - b);
  const tlo = ts[0];
  const thi = Math.min(ts[Math.floor(ts.length * 0.9)] + 1.5, tlo + 12);
  const shown = pts.filter((p) => p.t <= thi && (showDeleted || !p.del));
  const mins = shown.map((p) => p.min);
  const m0 = Math.min(...mins), m1 = Math.max(...mins);
  const gx = scale(m0, m1 + 1, 56, 980);
  const gy = scale(tlo - 0.3, thi, 20, 352);
  const yTicks = niceTicks(tlo, thi, 5).map((t) => ({ y: gy(t).toFixed(1), label: fmtLap(t).slice(0, -2) }));
  return (
    <svg viewBox="0 0 1000 380" style={{ width: '100%', display: 'block' }}>
      <YGrid ticks={yTicks} x0={50} x1={985} />
      <XTicks ticks={niceTicks(m0, m1, 6).map((m) => ({ x: gx(m).toFixed(1), label: `${Math.round(m - m0)}m` }))} y={372} />
      {shown.map((p, i) => (
        <circle key={i} cx={gx(p.min).toFixed(1)} cy={gy(p.t).toFixed(1)} r="4.2"
          fill={p.del ? 'none' : compoundColor(p.c)}
          stroke={p.del ? PANEL.faint : ctx.colorOf(p.code)} strokeWidth="1.6"
          strokeDasharray={p.del ? '2 2' : undefined}
          onMouseMove={(e) => ctx.tip(e, `${p.code} · ${COMPOUNDS[p.c]?.name || '?'}${p.del ? ' · DELETED' : ''}`, [
            { color: ctx.colorOf(p.code), txt: fmtLap(p.t) },
            { color: PANEL.axis, txt: `Minute ${Math.round(p.min - m0)}` },
          ])}
          onMouseLeave={ctx.leave} />
      ))}
      <text x="985" y="14" fontFamily={MONO} fontSize="9" fill={PANEL.axis} textAnchor="end">FILL = COMPOUND · RING = TEAM · SESSION TIME →</text>
    </svg>
  );
}

// ── Speed trap ranking ──────────────────────────────────────────
export function SpeedTrapChart({ traps, ctx }) {
  const rows = (traps || []).filter((r) => r.st != null).slice(0, 12);
  if (!rows.length) return <EmptyNote txt="No speed-trap data." />;
  const best = rows[0].st, low = rows[rows.length - 1].st;
  return (
    <div style={{ padding: '4px 2px' }}>
      {rows.map((r) => (
        <div key={r.code} style={{ display: 'grid', gridTemplateColumns: '76px 1fr 116px', alignItems: 'center', gap: 10, padding: '7px 4px', borderBottom: `1px solid ` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 12, fontWeight: 700, color: ctx.colorOf(r.code) }}>
            {ctx.faceImg?.(r.code) && <img src={ctx.faceImg(r.code)} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />}
            {r.code}
          </div>
          <div style={{ height: 12, background: PANEL.pill }}>
            <div style={{ height: 12, width: `${(20 + ((r.st - low) / (best - low + 0.001)) * 78).toFixed(0)}%`, background: ctx.colorOf(r.code) }} />
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, textAlign: 'right', color: PANEL.fg, fontVariantNumeric: 'tabular-nums' }}>
            {r.st.toFixed(1)} <span style={{ color: PANEL.fg3, fontSize: 10 }}>km/h</span>
          </div>
        </div>
      ))}
      <div style={{ fontFamily: MONO, fontSize: 9, color: PANEL.axis, padding: '8px 4px 2px' }}>SPEED-TRAP MAX (KM/H) · LOW WING SHOWS UP HERE FIRST</div>
    </div>
  );
}

// ── Long-run pace (FP) ──────────────────────────────────────────
export function LongRunChart({ longRuns, ctx }) {
  const mob = useIsMobile();
  const rows = (longRuns || []).slice(0, 10);
  if (!rows.length) return <EmptyNote txt="No race-sim stints detected (needs ≥ 6 clean laps on one set)." />;
  const best = rows[0].avg, worst = rows[rows.length - 1].avg;
  return (
    <div style={{ padding: '4px 2px' }}>
      {rows.map((r, i) => {
        const nameEl = (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 12, fontWeight: 700, color: ctx.colorOf(r.code) }}>
            {ctx.faceImg?.(r.code) && <img src={ctx.faceImg(r.code)} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />}
            {r.code}
          </div>
        );
        const stintEl = <div style={{ fontFamily: MONO, fontSize: 10, color: PANEL.fg3 }}>{`${COMPOUNDS[r.c]?.name.slice(0, 3) || '?'} · ${r.laps} LAPS`}</div>;
        const barEl = (
          <div style={{ height: 12, background: PANEL.pill }}>
            <div style={{ height: 12, width: `${(18 + (1 - (r.avg - best) / (worst - best + 0.001)) * 80).toFixed(0)}%`, background: ctx.colorOf(r.code) }} />
          </div>
        );
        const valEl = <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, textAlign: 'right', color: PANEL.fg, fontVariantNumeric: 'tabular-nums' }}>{fmtLap(r.avg).slice(0, -1)}</div>;
        if (mob) {
          // stacked: the desktop grid's fixed columns leave the bar ~40 px
          return (
            <div key={`${r.code}${i}`} style={{ padding: '8px 4px', borderBottom: `1px solid ` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {nameEl}{stintEl}<div style={{ marginLeft: 'auto' }}>{valEl}</div>
              </div>
              <div style={{ marginTop: 6 }}>{barEl}</div>
            </div>
          );
        }
        return (
          <div key={`${r.code}${i}`} style={{ display: 'grid', gridTemplateColumns: '76px 96px 1fr 96px', alignItems: 'center', gap: 10, padding: '7px 4px', borderBottom: `1px solid ` }}>
            {nameEl}{stintEl}{barEl}{valEl}
          </div>
        );
      })}
      <div style={{ fontFamily: MONO, fontSize: 9, color: PANEL.axis, padding: '8px 4px 2px' }}>AVERAGE OF EACH RACE-SIM STINT (≥ 6 CLEAN LAPS)</div>
    </div>
  );
}

// ── Compound offset (FP) ────────────────────────────────────────
export function CompoundOffsetChart({ longRuns }) {
  const mob = useIsMobile();
  const rows = compoundOffsets(longRuns || []);
  if (rows.length < 2) return <EmptyNote txt="Needs long runs on at least two compounds." />;
  const maxOff = Math.max(0.2, ...rows.map((r) => r.offset));
  return (
    <div style={{ padding: '10px 2px' }}>
      {rows.map((r) => (
        <div key={r.c} style={{ display: 'grid', gridTemplateColumns: mob ? '78px 1fr 118px' : '110px 1fr 130px', alignItems: 'center', gap: 12, padding: '12px 4px', borderBottom: `1px solid ` }}>
          <div style={{ fontFamily: COND, fontSize: 14, fontWeight: 700, letterSpacing: '0.08em', color: compoundColor(r.c) }}>{COMPOUNDS[r.c]?.name}</div>
          <div style={{ height: 16, background: PANEL.pill }}>
            <div style={{ height: 16, width: `${(8 + (r.offset / maxOff) * 88).toFixed(0)}%`, background: compoundColor(r.c) }} />
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, textAlign: 'right', color: PANEL.fg }}>
            {r.offset === 0 ? 'BASELINE' : `+${r.offset.toFixed(3)}s/lap`} <span style={{ color: PANEL.axis, fontSize: 10 }}>({r.n})</span>
          </div>
        </div>
      ))}
      <div style={{ fontFamily: MONO, fontSize: 9, color: PANEL.axis, padding: '10px 4px 2px' }}>
        MEDIAN LONG-RUN PACE PER COMPOUND, VS THE FASTEST COMPOUND · (N) = STINT COUNT
      </div>
    </div>
  );
}
