import { useEffect, useMemo, useRef, useState } from 'react';
import { WORLD_VIEWBOX, WORLD_PATHS } from '../../data/worldGeo.js';

// World map of all-time F1 achievement by the driver's home nation. Choropleth
// over a self-contained SVG (Natural Earth 1:110m, no runtime geo library); the
// metric chips switch which stat drives the shading. Data comes from the
// build-time _countries.json artifact (see scripts/countryStats.mjs).

const METRICS = [
  { key: 'wins',          label: 'Race wins',   noun: 'wins',        blurb: 'Grand Prix victories by the country’s drivers.' },
  { key: 'poles',         label: 'Poles',       noun: 'poles',       blurb: 'Pole positions taken by the country’s drivers.' },
  { key: 'podiums',       label: 'Podiums',     noun: 'podiums',     blurb: 'Top-three finishes by the country’s drivers.' },
  { key: 'championships', label: 'World titles',noun: 'titles',      blurb: 'Drivers’ World Championships won by the country.' },
  { key: 'drivers',       label: 'Drivers',     noun: 'drivers',     blurb: 'Drivers the country has ever entered in a Grand Prix.' },
  { key: 'dnfs',          label: 'Retirements', noun: 'DNFs',        blurb: 'Career retirements (DNFs) by the country’s drivers.' },
];

// Micro-states absent from the 1:110m outlines — rendered as clickable markers.
// Coords are the same equirectangular projection the geometry uses.
const MICRO = {
  MC: { x: 520.6, y: 111.9 },
  LI: { x: 526.5, y: 102.4 },
};

const regionNames = (() => {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; }
})();
function countryName(iso, fallback) {
  if (regionNames) { try { const n = regionNames.of(iso); if (n && n !== iso) return n; } catch { /* noop */ } }
  return fallback || iso;
}

function fmt(n) { return (n ?? 0).toLocaleString('en-US'); }

export default function WorldMap() {
  const [countries, setCountries] = useState(null);
  const [error, setError] = useState(false);
  const [metric, setMetric] = useState('wins');
  const [hover, setHover] = useState(null);     // { iso, x, y }
  const [selected, setSelected] = useState(null); // iso
  const wrapRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch('/data/archive/_countries.json')
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((d) => { if (alive) setCountries(d.countries || {}); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);

  const metricDef = METRICS.find((m) => m.key === metric) || METRICS[0];

  // Max value across nations for the chosen metric → log-scaled shading ramp.
  const max = useMemo(() => {
    if (!countries) return 0;
    let m = 0;
    for (const c of Object.values(countries)) m = Math.max(m, c[metric] || 0);
    return m;
  }, [countries, metric]);

  const intensity = (value) => {
    if (!value || max <= 0) return 0;
    return Math.log(value + 1) / Math.log(max + 1); // 0..1, compresses the long tail
  };

  // Fill + opacity for a country path / marker at the current metric.
  const paint = (iso) => {
    const c = countries && countries[iso];
    const value = c ? (c[metric] || 0) : 0;
    if (!c || value <= 0) return { fill: 'var(--map-land)', fillOpacity: 1 };
    return { fill: 'var(--accent)', fillOpacity: 0.2 + 0.8 * intensity(value) };
  };

  const onMove = (iso, e) => {
    if (!countries || !countries[iso]) { setHover(null); return; }
    const box = wrapRef.current?.getBoundingClientRect();
    setHover({ iso, x: e.clientX - (box?.left || 0), y: e.clientY - (box?.top || 0) });
  };

  const isoList = Object.keys(WORLD_PATHS);
  const hoverC = hover && countries && countries[hover.iso];
  const sel = selected && countries && countries[selected];

  // Legend stops (low → high) mirror the paint ramp.
  const legendStops = [0.15, 0.4, 0.65, 0.9, 1];

  return (
    <div className="worldmap">
      <div className="wm-controls" role="tablist" aria-label="Map metric">
        {METRICS.map((m) => (
          <button
            key={m.key}
            role="tab"
            aria-selected={m.key === metric}
            className={'wm-chip' + (m.key === metric ? ' is-active' : '')}
            onClick={() => setMetric(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="wm-blurb">{metricDef.blurb} Shading is by a driver’s home nation — darker means more.</p>

      <div className="wm-stage" ref={wrapRef}>
        {error && <div className="wm-note">Map data unavailable right now.</div>}
        {!error && !countries && <div className="wm-note">Loading the world…</div>}

        {countries && (
          <svg
            className="wm-svg"
            viewBox={WORLD_VIEWBOX}
            role="img"
            aria-label={`World map shaded by F1 ${metricDef.label.toLowerCase()} per country`}
            onMouseLeave={() => setHover(null)}
          >
            {isoList.map((iso) => {
              const c = countries[iso];
              const p = paint(iso);
              const active = !!c && (c[metric] || 0) > 0;
              return (
                <path
                  key={iso}
                  d={WORLD_PATHS[iso]}
                  fill={p.fill}
                  fillOpacity={p.fillOpacity}
                  className={'wm-country' + (c ? ' has-data' : '') + (selected === iso ? ' is-selected' : '')}
                  tabIndex={c ? 0 : undefined}
                  role={c ? 'button' : undefined}
                  aria-label={c ? `${countryName(iso, c.nationality)}: ${fmt(c[metric])} ${metricDef.noun}` : undefined}
                  onMouseMove={(e) => onMove(iso, e)}
                  onClick={() => c && setSelected(iso === selected ? null : iso)}
                  onKeyDown={(e) => { if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setSelected(iso === selected ? null : iso); } }}
                />
              );
            })}
            {Object.entries(MICRO).map(([iso, pos]) => {
              const c = countries[iso];
              if (!c) return null;
              const p = paint(iso);
              return (
                <circle
                  key={iso}
                  cx={pos.x} cy={pos.y} r={3.2}
                  fill={p.fill} fillOpacity={Math.max(0.55, p.fillOpacity)}
                  className={'wm-micro' + (selected === iso ? ' is-selected' : '')}
                  role="button"
                  aria-label={`${countryName(iso, c.nationality)}: ${fmt(c[metric])} ${metricDef.noun}`}
                  onMouseMove={(e) => onMove(iso, e)}
                  onClick={() => setSelected(iso === selected ? null : iso)}
                />
              );
            })}
          </svg>
        )}

        {hoverC && (
          <div className="wm-tip" style={{ left: hover.x, top: hover.y }}>
            <span className="wm-tip-flag">{hoverC.flag || '🏁'}</span>
            <span className="wm-tip-name">{countryName(hover.iso, hoverC.nationality)}</span>
            <span className="wm-tip-val">{fmt(hoverC[metric])} <em>{metricDef.noun}</em></span>
            {hoverC.top?.[metric] && (
              <span className="wm-tip-top">Top: {hoverC.top[metric].name} ({fmt(hoverC.top[metric].value)})</span>
            )}
          </div>
        )}

        {countries && max > 0 && (
          <div className="wm-legend" aria-hidden="true">
            <span className="wm-legend-lo">0</span>
            <span className="wm-legend-ramp">
              {legendStops.map((t, i) => (
                <span key={i} style={{ background: 'var(--accent)', opacity: 0.2 + 0.8 * t }} />
              ))}
            </span>
            <span className="wm-legend-hi">{fmt(max)}</span>
          </div>
        )}
      </div>

      {sel && (
        <div className="wm-panel">
          <button className="wm-panel-close" aria-label="Close" onClick={() => setSelected(null)}>×</button>
          <div className="wm-panel-head">
            <span className="wm-panel-flag">{sel.flag || '🏁'}</span>
            <div>
              <div className="wm-panel-name">{countryName(selected, sel.nationality)}</div>
              <div className="wm-panel-sub">{sel.nationality} · {fmt(sel.drivers)} drivers all-time</div>
            </div>
          </div>
          <div className="wm-panel-grid">
            {METRICS.map((m) => (
              <div key={m.key} className={'wm-stat' + (m.key === metric ? ' is-active' : '')}>
                <div className="wm-stat-val">{fmt(sel[m.key])}</div>
                <div className="wm-stat-label">{m.label}</div>
                {sel.top?.[m.key] && (
                  <a className="wm-stat-top" href={`/drivers/${sel.top[m.key].driverRef}/`}>
                    {sel.top[m.key].name} · {fmt(sel.top[m.key].value)}
                  </a>
                )}
              </div>
            ))}
          </div>
          {sel.nationality && (
            <a className="wm-panel-link" href={`/drivers/?nat=${encodeURIComponent(sel.nationality)}`}>
              See all {sel.nationality} drivers <span className="arrow" aria-hidden="true">›</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
