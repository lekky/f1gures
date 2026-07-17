// Per-session results blocks for the race-weekend tabs. Light (theme-aware)
// cards — styles live in public/css/app.css under "RACE WEEKEND". The race /
// quali / sprint blocks render from the prerendered archive doc (SEO: they're
// in the static HTML); FastF1-only blocks (SQ table, FP times, stat chips,
// key moments) fill in after the session JSON fetch resolves.
import React, { useEffect, useState } from 'react';
import { COMPOUNDS, fmtLap } from './derive.js';

const MEDALS = ['#FFD700', '#C0C0C0', '#CD7F32'];
const POSC = { 1: '#B8860B', 2: '#8A8B93', 3: '#A0653A' };

export function parseT(str) {
  // "1:28.111" | "88.111" | null → seconds
  if (str == null) return null;
  const s = String(str).trim();
  const m = /^(?:(\d+):)?(\d{1,2}(?:\.\d+)?)$/.exec(s);
  if (!m) return null;
  return (m[1] ? parseInt(m[1], 10) * 60 : 0) + parseFloat(m[2]);
}

// Local-time formatter that only renders after hydration (SSR/browser TZ differ).
export function LocalTime({ iso, opts }) {
  const [txt, setTxt] = useState('');
  useEffect(() => {
    if (!iso) return;
    const d = new Date(iso);
    setTxt(d.toLocaleString(undefined, opts || { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).toUpperCase());
  }, [iso]);
  return <span suppressHydrationWarning>{txt}</span>;
}

export function SectionRule({ label }) {
  return (
    <div className="rw-rule-row">
      <div className="rw-rule-label">{label}</div>
      <div className="rw-rule-line" />
    </div>
  );
}

export function SessionHeader({ title, startIso, highlight, weather, extra }) {
  return (
    <div className="rw-session-head panel">
      <div className="rw-session-title">{title}</div>
      <div className="rw-session-when t-mono"><LocalTime iso={startIso} />{extra ? ` · ${extra}` : ''}</div>
      {highlight && <div className={`rw-session-pill rw-pill-${highlight.kind || 'purple'}`}>{highlight.txt}</div>}
      {weather && (
        <div className="rw-session-weather">
          {weather.airMax != null && <span>AIR {Math.round(weather.airMax)}°</span>}
          {weather.trackMax != null && <span>TRACK {Math.round(weather.trackMax)}°</span>}
          {weather.windAvg != null && <span>WIND {Math.round(weather.windAvg)} KM/H</span>}
          {weather.rain && <span className="rw-wx-rain">🌧 RAIN</span>}
        </div>
      )}
    </div>
  );
}

// ── Race block ──────────────────────────────────────────────────
export function RacePodium3({ results }) {
  const top3 = results.filter((r) => r.position && r.position <= 3).sort((a, b) => a.position - b.position);
  if (top3.length < 3) return null;
  return (
    <div className="rw-podium">
      {top3.map((r, i) => (
        <div key={r.position} className="rw-podium-card panel" style={{ borderTop: `3px solid ${MEDALS[i]}` }}>
          <div className="rw-podium-pos" style={{ color: MEDALS[i] }}>{r.position}</div>
          <div className="rw-podium-chip" style={{ borderLeft: `3px solid ${r.constructorColor || 'var(--line-2)'}` }}>{r.code}</div>
          <div className="rw-podium-meta">
            <div className="rw-podium-name">
              {r.driverRef ? <a href={`/drivers/${r.driverRef}/`}>{r.driverName}</a> : r.driverName}
            </div>
            <div className="rw-podium-team t-mono">{r.constructorName?.toUpperCase()} · {i === 0 ? (r.time || 'WINNER') : (r.time || '—')}</div>
          </div>
          <div className="rw-podium-pts"><b>{r.points}</b> <span>PTS</span></div>
        </div>
      ))}
    </div>
  );
}

export function StatChips({ chips }) {
  return (
    <div className="rw-statchips">
      {chips.map((c) => (
        <div key={c.k} className="rw-statchip panel">
          <div className="rw-statchip-k">{c.k}</div>
          <div className="rw-statchip-v" style={c.color ? { color: c.color } : undefined}>{c.v}</div>
        </div>
      ))}
    </div>
  );
}

export function RaceClassification({ results, stopsOf, allRows, onToggle }) {
  const rows = allRows ? results : results.slice(0, 10);
  return (
    <div className="panel rw-table-card">
      <SectionRule label="Classification" />
      <div className="rw-tbl-scroll">
        <table className="rw-tbl">
          <thead>
            <tr><th>Pos</th><th>Driver</th><th>Team</th><th>Grid</th><th>Gap</th><th>Pts</th><th>Stops</th><th>FL</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const dnf = r.positionText === 'R' || /retired|accident|collision|dnf/i.test(r.status || '');
              return (
                <tr key={i}>
                  <td className="rw-pos" style={{ color: POSC[r.position] || undefined }}>{dnf ? 'DNF' : r.position ?? r.positionText}</td>
                  <td>
                    <span className="rw-drv" style={{ borderLeftColor: r.constructorColor || 'var(--line-2)' }}>
                      {r.driverRef ? <a href={`/drivers/${r.driverRef}/`}>{r.driverName}</a> : r.driverName}
                      <span className="rw-code t-mono">{r.code}</span>
                    </span>
                  </td>
                  <td className="rw-team">{r.constructorName}</td>
                  <td className="t-mono">{r.grid === 0 ? 'PIT' : r.grid != null ? `P${r.grid}` : '—'}</td>
                  <td className="t-mono rw-gap">{r.time || (dnf ? '—' : r.status) || '—'}</td>
                  <td className="t-mono rw-pts">{r.points > 0 ? r.points : '·'}</td>
                  <td className="t-mono">{stopsOf ? stopsOf(r.code) ?? '—' : '—'}</td>
                  <td className="t-mono rw-fl">{r.fastestLapRank === 1 && r.fastestLapTime ? `⚡ ${r.fastestLapTime}` : ''}</td>
                  <td className="t-mono rw-status" data-dnf={dnf || undefined}>{r.status || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {results.length > 10 && (
        <button type="button" className="btn btn-secondary btn-sm rw-rows-btn" onClick={onToggle}>
          {allRows ? 'Show top 10' : `Show all ${results.length}`}
        </button>
      )}
    </div>
  );
}

export function KeyMoments({ moments }) {
  if (!moments?.length) return null;
  return (
    <div className="panel rw-moments-card">
      <SectionRule label="Key moments" />
      <div className="rw-moments">
        {moments.map((m, i) => (
          <div key={i} className="rw-moment" style={{ borderLeftColor: m.color }}>
            <div className="rw-moment-tag" style={{ color: m.color }}>{m.tag}</div>
            <div className="rw-moment-txt">{m.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DriverFilter({ order, colorOf, sel, onToggle, presets }) {
  return (
    <div className="panel rw-filter-card">
      <div className="rw-filter-label">Driver filter</div>
      <div className="rw-filter-chips">
        {order.map((code) => (
          <button key={code} type="button"
            className={`rw-filter-chip${sel.has(code) ? ' is-on' : ''}`}
            style={{ borderLeftColor: colorOf(code) }}
            onClick={() => onToggle(code)}>
            {code}
          </button>
        ))}
      </div>
      <div className="rw-filter-presets">
        {presets.map((p) => (
          <button key={p.label} type="button" className={`btn btn-sm ${p.primary ? 'btn-primary' : 'btn-secondary'}`} onClick={p.apply}>{p.label}</button>
        ))}
      </div>
    </div>
  );
}

// ── Qualifying block (Q1/Q2/Q3 columns, session best in purple) ─
export function QualiTable({ rows, segLabels = ['Q1', 'Q2', 'Q3'] }) {
  if (!rows?.length) return null;
  const parsed = rows.map((r) => ({ ...r, t1: parseT(r.q1), t2: parseT(r.q2), t3: parseT(r.q3) }));
  const best = ['t1', 't2', 't3'].map((k) => {
    const v = parsed.map((r) => r[k]).filter((x) => x != null);
    return v.length ? Math.min(...v) : null;
  });
  const cell = (t, b) => {
    if (t == null) return <td className="t-mono rw-q-none">—</td>;
    const isBest = b != null && Math.abs(t - b) < 0.0005;
    return <td className={`t-mono${isBest ? ' rw-q-best' : ''}`}>{fmtLap(t)}</td>;
  };
  return (
    <div className="panel rw-table-card">
      <SectionRule label="Classification" />
      <div className="rw-tbl-scroll">
        <table className="rw-tbl">
          <thead>
            <tr><th>Pos</th><th>Driver</th><th>Team</th><th>{segLabels[0]}</th><th>{segLabels[1]}</th><th>{segLabels[2]}</th></tr>
          </thead>
          <tbody>
            {parsed.map((r, i) => (
              <tr key={i} className={i >= 10 ? 'rw-q-out' : undefined}>
                <td className="rw-pos" style={i === 0 ? { color: '#7C3AED' } : undefined}>{r.position ?? i + 1}</td>
                <td>
                  <span className="rw-drv" style={{ borderLeftColor: r.constructorColor || 'var(--line-2)' }}>
                    {r.driverRef ? <a href={`/drivers/${r.driverRef}/`}>{r.driverName}</a> : r.driverName}
                    {r.code && <span className="rw-code t-mono">{r.code}</span>}
                  </span>
                </td>
                <td className="rw-team">{r.constructorName}</td>
                {cell(r.t1, best[0])}{cell(r.t2, best[1])}{cell(r.t3, best[2])}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Sprint result table ─────────────────────────────────────────
export function SprintTable({ rows }) {
  if (!rows?.length) return null;
  return (
    <div className="panel rw-table-card">
      <SectionRule label="Sprint result" />
      <div className="rw-tbl-scroll">
        <table className="rw-tbl">
          <thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th>Gap</th><th>Pts</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="rw-pos" style={{ color: POSC[r.position] || undefined }}>{r.positionText === 'R' ? 'DNF' : r.position}</td>
                <td>
                  <span className="rw-drv" style={{ borderLeftColor: r.constructorColor || 'var(--line-2)' }}>
                    {r.driverRef ? <a href={`/drivers/${r.driverRef}/`}>{r.driverName}</a> : r.driverName}
                  </span>
                </td>
                <td className="rw-team">{r.constructorName}</td>
                <td className="t-mono rw-gap">{r.time || r.status || '—'}</td>
                <td className="t-mono rw-pts">{r.points > 0 ? r.points : '·'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── FastF1-backed session times (SQ segments / FP order) ────────
export function FastF1SegTable({ sess, label, segLabels }) {
  if (!sess?.results?.length) return null;
  const nameOf = (code) => sess.drivers?.find((d) => d.code === code) || {};
  const rows = sess.results.map((r, i) => {
    const d = nameOf(r.code);
    return {
      position: i + 1, code: r.code, driverName: d.name || r.code,
      constructorName: d.team, constructorColor: d.color,
      q1: r.q1 != null ? fmtLap(r.q1) : null, q2: r.q2 != null ? fmtLap(r.q2) : null, q3: r.q3 != null ? fmtLap(r.q3) : null,
    };
  });
  return <QualiTable rows={rows} segLabels={segLabels} />;
}

export function PracticeTimes({ sess }) {
  if (!sess?.order?.length) return <div className="panel rw-loading">Session times will appear once FastF1 publishes the session…</div>;
  const meta = (code) => sess.drivers?.find((d) => d.code === code) || {};
  const best = sess.order[0].t;
  const half = Math.ceil(sess.order.length / 2);
  const cols = [sess.order.slice(0, half), sess.order.slice(half)];
  return (
    <div className="panel rw-table-card">
      <SectionRule label="Session times" />
      <div className="rw-fp-cols">
        {cols.map((col, k) => (
          <table className="rw-tbl" key={k}>
            <tbody>
              {col.map((r, i) => {
                const d = meta(r.code);
                const pos = k * half + i + 1;
                return (
                  <tr key={r.code}>
                    <td className="rw-pos" style={pos === 1 ? { color: '#7C3AED' } : undefined}>{pos}</td>
                    <td><span className="rw-drv" style={{ borderLeftColor: d.color || 'var(--line-2)' }}>{d.name || r.code}</span></td>
                    <td className="t-mono rw-gap">{fmtLap(r.t)}</td>
                    <td className="t-mono rw-fp-delta">{pos === 1 ? '—' : `+${(r.t - best).toFixed(3)}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}
      </div>
    </div>
  );
}
