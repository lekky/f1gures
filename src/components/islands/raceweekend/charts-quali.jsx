// Qualifying / sprint-quali / practice session charts.
import React, { useState } from 'react';
import { PANEL, MONO, COND, YGrid, XTicks, scale, niceTicks, Ladder, distinctColors, FaceImg } from './primitives.jsx';
import { COMPOUNDS, fmtLap, segmentBests, theoreticalBest, progressionRows, compoundOffsets } from './derive.js';
import { EmptyNote } from './charts-race.jsx';

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
            let bg = '#141519', fg = '#63646C', txt = `+${d.toFixed(3)}`;
            if (d === 0) { bg = '#7C3AED'; fg = '#fff'; txt = v.toFixed(3); }
            else if (d < 0.08) { bg = 'rgba(61,220,151,0.12)'; fg = PANEL.green; }
            else if (d < 0.2) { bg = '#1B1C22'; fg = PANEL.fg2; }
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
export function DominanceMap({ dominance, track, ctx }) {
  if (!dominance || !track?.pts?.length) return <EmptyNote txt="No telemetry available for this session." />;
  const pts = track.pts;
  const codes = dominance.codes;
  const colors = distinctColors(codes, ctx.colorOf, ctx.teamOf);
  const nSeg = dominance.n;
  const per = pts.length / nSeg;
  const segs = dominance.owners.map((owner, i) => {
    const a = Math.floor(i * per);
    const b = Math.min(pts.length - 1, Math.ceil((i + 1) * per));
    return { owner, pts: pts.slice(a, b + 1) };
  });
  const counts = {};
  dominance.owners.forEach((c) => { counts[c] = (counts[c] || 0) + 1; });
  const sf = pts[0];
  return (
    <svg viewBox="0 0 1000 720" style={{ width: '78%', display: 'block', margin: '0 auto' }}>
      <polyline points={pts.map((p) => `${p[0]},${p[1]}`).join(' ')} fill="none" stroke="#26272E" strokeWidth="22" strokeLinejoin="round" strokeLinecap="round" />
      {segs.map((sg, i) => (
        <polyline key={i} points={sg.pts.map((p) => `${p[0]},${p[1]}`).join(' ')} fill="none" stroke={colors[sg.owner]} strokeWidth="12" strokeLinejoin="round" strokeLinecap="round" />
      ))}
      <circle cx={sf[0]} cy={sf[1]} r="9" fill={PANEL.fg} />
      <text x={sf[0] + 16} y={sf[1] + 5} fontFamily={MONO} fontSize="15" fontWeight="700" fill={PANEL.fg}>S/F</text>
      {codes.map((c, i) => (
        <g key={c}>
          <FaceImg href={ctx.faceImg?.(c)} x={244 + i * 170} y={682} size={30} />
          <rect x={282 + i * 170} y={688} width="18" height="18" fill={colors[c]} />
          <text x={308 + i * 170} y={703} fontFamily={MONO} fontSize="17" fontWeight="700" fill={PANEL.fg2}>{`${c} × ${counts[c] || 0}`}</text>
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
          <rect x={(sx(c.d) - 14).toFixed(1)} y="10" width="28" height="240" fill="#16171D" />
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
      <line x1={x0} x2={x1} y1={dvy(0).toFixed(1)} y2={dvy(0).toFixed(1)} stroke="#44454E" strokeDasharray="4 3" />
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
  return (
    <svg viewBox="0 0 1000 520" style={{ width: '100%', display: 'block' }}>
      {colX.map((x, i) => (
        <g key={i}>
          <line x1={x} x2={x} y1="24" y2="476" stroke={PANEL.grid} />
          <text x={x} y="500" fontFamily={COND} fontSize="14" fontWeight="700" letterSpacing="2" fill={PANEL.fg3} textAnchor="middle">{segLabels[i]}</text>
        </g>
      ))}
      {rows.map((r) => {
        const pts = r.segs.map((v, i) => (v != null ? [colX[i], colScales[i](v)] : null)).filter(Boolean);
        if (pts.length < 2) return null;
        const last = pts[pts.length - 1];
        return (
          <g key={r.code}>
            <polyline points={pts.map((p) => `${p[0]},${p[1].toFixed(1)}`).join(' ')} fill="none" stroke={ctx.colorOf(r.code)} strokeWidth="2" opacity="0.85" />
            {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1].toFixed(1)} r="3.4" fill={ctx.colorOf(r.code)} />)}
            <text x={last[0] + 10} y={(last[1] + 4).toFixed(1)} fontFamily={MONO} fontSize="10" fontWeight="700" fill={ctx.colorOf(r.code)}>{r.code}</text>
          </g>
        );
      })}
      <text x="150" y="14" fontFamily={MONO} fontSize="9" fill={PANEL.axis}>EACH COLUMN RANKED FASTEST (TOP) → SLOWEST · LINE = ONE DRIVER ACROSS SEGMENTS</text>
    </svg>
  );
}

// ── Theoretical best ────────────────────────────────────────────
export function TheoreticalBest({ sectors, ctx }) {
  const rows = theoreticalBest(sectors).slice(0, 10);
  if (!rows.length) return <EmptyNote txt="No sector times available." />;
  const maxLost = Math.max(0.05, ...rows.map((r) => r.lost));
  return (
    <div style={{ padding: '4px 2px' }}>
      {rows.map((r) => (
        <div key={r.code} style={{ display: 'grid', gridTemplateColumns: '76px 110px 1fr 120px', alignItems: 'center', gap: 10, padding: '7px 4px', borderBottom: '1px solid #1E1F26' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 12, fontWeight: 700, color: ctx.colorOf(r.code) }}>
            {ctx.faceImg?.(r.code) && <img src={ctx.faceImg(r.code)} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />}
            {r.code}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10.5, color: PANEL.fg3 }}>{`IDEAL ${fmtLap(r.ideal)}`}</div>
          <div style={{ height: 12, background: '#1F2027' }}>
            <div style={{ height: 12, width: `${Math.min(100, (r.lost / maxLost) * 100).toFixed(0)}%`, background: r.lost < 0.05 ? PANEL.green : '#7C3AED' }} />
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 600, textAlign: 'right', color: PANEL.fg, fontVariantNumeric: 'tabular-nums' }}>
            {`+${r.lost.toFixed(3)} LEFT`}
          </div>
        </div>
      ))}
      <div style={{ fontFamily: MONO, fontSize: 9, color: PANEL.axis, padding: '8px 4px 2px' }}>
        IDEAL LAP = SUM OF OWN BEST-LAP SECTORS · BAR = TIME LEFT ON THE TABLE VS ACTUAL BEST
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
          fill={p.del ? 'none' : (COMPOUNDS[p.c]?.color || PANEL.faint)}
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
        <div key={r.code} style={{ display: 'grid', gridTemplateColumns: '76px 1fr 90px', alignItems: 'center', gap: 10, padding: '7px 4px', borderBottom: '1px solid #1E1F26' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 12, fontWeight: 700, color: ctx.colorOf(r.code) }}>
            {ctx.faceImg?.(r.code) && <img src={ctx.faceImg(r.code)} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />}
            {r.code}
          </div>
          <div style={{ height: 12, background: '#1F2027' }}>
            <div style={{ height: 12, width: `${(20 + ((r.st - low) / (best - low + 0.001)) * 78).toFixed(0)}%`, background: ctx.colorOf(r.code) }} />
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, textAlign: 'right', color: PANEL.fg, fontVariantNumeric: 'tabular-nums' }}>{r.st.toFixed(1)}</div>
        </div>
      ))}
      <div style={{ fontFamily: MONO, fontSize: 9, color: PANEL.axis, padding: '8px 4px 2px' }}>SPEED-TRAP MAX (KM/H) · LOW WING SHOWS UP HERE FIRST</div>
    </div>
  );
}

// ── Long-run pace (FP) ──────────────────────────────────────────
export function LongRunChart({ longRuns, ctx }) {
  const rows = (longRuns || []).slice(0, 10);
  if (!rows.length) return <EmptyNote txt="No race-sim stints detected (needs ≥ 6 clean laps on one set)." />;
  const best = rows[0].avg, worst = rows[rows.length - 1].avg;
  return (
    <div style={{ padding: '4px 2px' }}>
      {rows.map((r, i) => (
        <div key={`${r.code}${i}`} style={{ display: 'grid', gridTemplateColumns: '76px 96px 1fr 96px', alignItems: 'center', gap: 10, padding: '7px 4px', borderBottom: '1px solid #1E1F26' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 12, fontWeight: 700, color: ctx.colorOf(r.code) }}>
            {ctx.faceImg?.(r.code) && <img src={ctx.faceImg(r.code)} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />}
            {r.code}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: PANEL.fg3 }}>{`${COMPOUNDS[r.c]?.name.slice(0, 3) || '?'} · ${r.laps} LAPS`}</div>
          <div style={{ height: 12, background: '#1F2027' }}>
            <div style={{ height: 12, width: `${(18 + (1 - (r.avg - best) / (worst - best + 0.001)) * 80).toFixed(0)}%`, background: ctx.colorOf(r.code) }} />
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, textAlign: 'right', color: PANEL.fg, fontVariantNumeric: 'tabular-nums' }}>{fmtLap(r.avg).slice(0, -1)}</div>
        </div>
      ))}
      <div style={{ fontFamily: MONO, fontSize: 9, color: PANEL.axis, padding: '8px 4px 2px' }}>AVERAGE OF EACH RACE-SIM STINT (≥ 6 CLEAN LAPS)</div>
    </div>
  );
}

// ── Compound offset (FP) ────────────────────────────────────────
export function CompoundOffsetChart({ longRuns }) {
  const rows = compoundOffsets(longRuns || []);
  if (rows.length < 2) return <EmptyNote txt="Needs long runs on at least two compounds." />;
  const maxOff = Math.max(0.2, ...rows.map((r) => r.offset));
  return (
    <div style={{ padding: '10px 2px' }}>
      {rows.map((r) => (
        <div key={r.c} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 130px', alignItems: 'center', gap: 12, padding: '12px 4px', borderBottom: '1px solid #1E1F26' }}>
          <div style={{ fontFamily: COND, fontSize: 14, fontWeight: 700, letterSpacing: '0.08em', color: COMPOUNDS[r.c]?.color }}>{COMPOUNDS[r.c]?.name}</div>
          <div style={{ height: 16, background: '#1F2027' }}>
            <div style={{ height: 16, width: `${(8 + (r.offset / maxOff) * 88).toFixed(0)}%`, background: COMPOUNDS[r.c]?.color }} />
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
