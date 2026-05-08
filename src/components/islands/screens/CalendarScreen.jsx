// Calendar — full season grid. Ported from js/screens/calendar.jsx.
// Reads `data` prop instead of window.F1_DATA.

import { urlFor, useIsMobile, fmtDateLong, SprintBadge } from '../../../lib/shared.jsx';

export default function CalendarScreen({ data }) {
  const F = data;
  const mob = useIsMobile();
  const cal = F.calendar;
  const sprintCount = cal.filter(r => r.sprint).length;

  return (
    <div className={`page ${mob ? 'page-mob' : ''}`}>
      <div className="page-head">
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 6 }}>{F.seasonYear || '2026'} Season</div>
          <h1 className="page-title">Race Calendar</h1>
          <div className="page-sub">{cal.length} rounds · {sprintCount} sprint weekends</div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: mob ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {cal.map(race => {
          const circuit = F.circuits[race.circuit] || { name: race.circuit };
          const result = F.results[race.round];
          const winner = result ? F.driverById(result.order[0]) : null;
          const fastest = result ? F.driverById(result.fastest) : null;
          return (
            <a key={race.round}
               className={`race-card is-${race.status}`}
               style={{ textDecoration: 'none', color: 'inherit' }}
               href={urlFor({ name: 'race', round: race.round })}>
              <div className="race-card-head">
                <div>
                  <div className="race-round">RD {String(race.round).padStart(2, '0')}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {race.sprint && <SprintBadge />}
                  <span className={`pill pill-${race.status}`}>{race.status}</span>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                  <span className="race-flag">{race.flag}</span>
                  <div className="race-name">{race.name.replace(' Grand Prix', '')}</div>
                </div>
                <div className="race-circuit">{circuit.name}</div>
              </div>
              <div className="race-card-foot">
                <div className="race-mini-row">
                  <span className="lbl">Date</span>
                  <span className="val">{fmtDateLong(race.date)}</span>
                </div>
                {winner && (
                  <div className="race-mini-row">
                    <span className="lbl">Winner</span>
                    <span className="val" style={{ color: 'var(--fg-1)' }}>{winner.flag} {winner.first[0]}. {winner.last}</span>
                  </div>
                )}
                {fastest && (
                  <div className="race-mini-row">
                    <span className="lbl">Fastest Lap</span>
                    <span className="val">{fastest.code}</span>
                  </div>
                )}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
