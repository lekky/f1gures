// Circuits index - grid of all calendar circuits. Ported from
// js/screens/circuits.jsx (CircuitsIndexScreen only - detail screen is PR 2).

import { urlFor, useIsMobile } from '../../../lib/shared.jsx';

export default function CircuitsIndexScreen({ data }) {
  const F = data;
  const mob = useIsMobile();
  return (
    <div className={`page ${mob ? 'page-mob' : ''}`}>
      <div className="page-head">
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 6 }}>{F.seasonYear || '2026'} Calendar</div>
          <h1 className="page-title">Circuits</h1>
          <div className="page-sub">{F.calendar.length} venues · select a circuit to view profile</div>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: mob ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {F.calendar.map(race => {
          const c = F.circuits[race.circuit] || { name: race.circuit, city: '-', country: '-', type: '-', length: 0, corners: 0, lapRecord: { time: '-' } };
          return (
            <a key={race.round} className="race-card"
               style={{ textDecoration: 'none', color: 'inherit' }}
               href={urlFor({ name: 'circuit', id: race.circuit })}>
              <div className="race-card-head">
                <div className="race-round">RD {String(race.round).padStart(2,'0')}{c.type && c.type !== '-' ? ` · ${c.type.toUpperCase()}` : ''}</div>
                <span style={{ fontSize: 18 }}>{race.flag}</span>
              </div>
              <div>
                <div className="race-name">{c.name.replace('Circuit', '').replace('Autodromo','').trim()}</div>
                <div className="race-circuit">{c.city}, {c.country}</div>
              </div>
              <div className="race-card-foot">
                {c.length ? <div className="race-mini-row"><span className="lbl">Length</span><span className="val">{c.length.toFixed(3)} km</span></div> : null}
                {c.corners ? <div className="race-mini-row"><span className="lbl">Corners</span><span className="val">{c.corners}</span></div> : null}
                {c.lapRecord && c.lapRecord.time !== '-' ? <div className="race-mini-row"><span className="lbl">Lap Record</span><span className="val">{c.lapRecord.time}</span></div> : null}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
