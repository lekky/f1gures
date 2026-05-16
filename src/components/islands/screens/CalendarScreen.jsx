// Calendar - season schedule with a featured "next race" hero, an
// upcoming-rounds grid and a compact list of completed rounds. Historical
// seasons (no future races) keep the original chronological card grid.

import { useMemo } from 'react';
import {
  urlFor, useIsMobile, fmtDate, fmtDateLong, SectionHead, SprintBadge,
  Flag, Countdown, circuitTz, zoneShort,
} from '../../../lib/shared.jsx';

const SESSION_LABELS = {
  fp1: 'FP1', fp2: 'FP2', fp3: 'FP3',
  q: 'Quali', sprint: 'Sprint', sprintQuali: 'Sprint Quali', race: 'Race',
};

// Build the next session whose start is in the future, plus a short
// schedule strip for the hero. Mirrors HomeScreen.buildSessions but
// keeps everything in track-local time (the calendar page doesn't
// expose a TZ toggle - users tweak it on the home dashboard).
function buildSessionStrip(race, zone) {
  const order = race.sprint
    ? ['fp1', 'sprintQuali', 'sprint', 'q', 'race']
    : ['fp1', 'fp2', 'fp3', 'q', 'race'];
  const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: zone });
  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone,
  });
  const src = race.sessions || {};
  return order.flatMap(id => {
    const s = src[id];
    if (!s || !s.date || !s.time) return [];
    const dt = new Date(`${s.date}T${s.time}`);
    return [{
      id, name: SESSION_LABELS[id],
      day: dayFmt.format(dt), time: timeFmt.format(dt), dt,
    }];
  });
}

function NextRaceHero({ F, race, mob }) {
  const circuit = F.circuits[race.circuit] || { name: race.circuit };
  const raceHref = urlFor({ name: 'race', year: F.seasonYear, round: race.round });
  const circuitHref = urlFor({ name: 'circuit', id: race.circuit });
  const trackZone = circuitTz(race.circuitId);
  const sessions = useMemo(() => buildSessionStrip(race, trackZone), [race, trackZone]);

  const raceDt = race.date
    ? new Date(`${race.date}T${race.time || '14:00:00Z'}`)
    : new Date();

  const nextSession = useMemo(() => {
    const nowMs = Date.now();
    return sessions.find(s => s.dt && s.dt.getTime() > nowMs) || sessions[sessions.length - 1] || null;
  }, [sessions]);
  const target = (nextSession && nextSession.dt) || raceDt;

  return (
    <div
      className="race-card race-card-link is-next"
      style={{
        marginBottom: 24,
        padding: mob ? 20 : 28,
        minHeight: 0,
        gap: mob ? 16 : 20,
      }}
    >
      <a className="race-card-stretch" href={raceHref} aria-label={`${race.name} - round ${race.round}`}></a>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        flexWrap: 'wrap',
      }}>
        <span className="t-eyebrow" style={{ color: 'var(--accent)' }}>Next Race</span>
        <span style={{ flex: 1, minWidth: 16, height: 1, background: 'var(--line-1)' }}></span>
        <span className="t-eyebrow">Round {String(race.round).padStart(2, '0')}/{F.calendar.length}</span>
        {race.sprint && <SprintBadge />}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: mob ? '1fr' : 'minmax(0, 1fr) auto',
        gap: mob ? 16 : 28,
        alignItems: 'center',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
            <span className="race-flag" style={{ fontSize: mob ? 22 : 26 }}>
              <Flag cc={race.country} flag={race.flag} />
            </span>
            <div
              className="t-display"
              style={{ fontSize: mob ? 32 : 44, lineHeight: 1, textTransform: 'uppercase' }}
            >
              {race.name.replace(' Grand Prix', '')}
              <span style={{ color: 'var(--accent)' }}>.</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--fg-2)', flexWrap: 'wrap' }}>
            <a
              href={circuitHref}
              className="inline-link race-card-overlay-link t-mono"
              style={{ color: 'inherit', fontSize: 12 }}
            >
              {(circuit.name || '').toUpperCase()}
            </a>
            <span style={{ color: 'var(--fg-4)' }}>·</span>
            <span className="t-mono" style={{ fontSize: 12 }}>{fmtDateLong(race.date)}</span>
          </div>
        </div>

        <div style={{ minWidth: mob ? 0 : 320 }}>
          <Countdown target={target} />
        </div>
      </div>

      {sessions.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: mob ? 8 : 14,
          paddingTop: 12, borderTop: '1px dashed var(--line-1)',
          color: 'var(--fg-3)',
        }}>
          {sessions.map(s => {
            const isNext = nextSession && s.id === nextSession.id;
            return (
              <div key={s.id} className="t-mono" style={{
                fontSize: 11,
                color: isNext ? 'var(--fg-1)' : 'var(--fg-3)',
              }}>
                <span style={{
                  fontFamily: 'var(--f-display)',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginRight: 6,
                  color: isNext ? 'var(--accent)' : 'var(--fg-2)',
                }}>{s.name}</span>
                {s.day} {s.time}
              </div>
            );
          })}
          {nextSession && nextSession.dt && (
            <div className="t-mono" style={{
              fontSize: 11, color: 'var(--fg-3)', marginLeft: 'auto',
            }}>
              {zoneShort(trackZone, nextSession.dt)} · track time
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UpcomingCard({ F, race }) {
  const circuit = F.circuits[race.circuit] || { name: race.circuit };
  const raceHref = urlFor({ name: 'race', year: F.seasonYear, round: race.round });
  return (
    <div
      className={`race-card race-card-link is-${race.status}`}
      style={{ minHeight: 0, padding: '12px 14px', gap: 4 }}
    >
      <a className="race-card-stretch" href={raceHref} aria-label={`${race.name} - round ${race.round}`}></a>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="race-flag" style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>
          <Flag cc={race.country} flag={race.flag} />
        </span>
        <div
          style={{
            fontFamily: 'var(--f-display)', fontWeight: 700,
            fontSize: 18, lineHeight: 1.1, textTransform: 'uppercase',
            letterSpacing: '0.01em',
            flex: 1, minWidth: 0,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {race.name.replace(' Grand Prix', '')}
        </div>
        <span className="race-round" style={{ flexShrink: 0 }}>
          RD {String(race.round).padStart(2, '0')}
        </span>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, color: 'var(--fg-3)', fontSize: 12,
      }}>
        <a
          href={urlFor({ name: 'circuit', id: race.circuit })}
          className="inline-link race-card-overlay-link"
          style={{
            color: 'inherit',
            minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {circuit.name}
        </a>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {race.sprint && <SprintBadge />}
          <span className="t-mono" style={{ fontSize: 11 }}>{fmtDate(race.date)}</span>
        </span>
      </div>
    </div>
  );
}

function CompletedRow({ F, race, mob }) {
  const result = F.results[race.round];
  const winner = result ? F.driverById(result.order[0]) : null;
  const fastest = result ? F.driverById(result.fastest) : null;
  const raceHref = urlFor({ name: 'race', year: F.seasonYear, round: race.round });
  const winnerHref = winner ? urlFor({ name: 'driver', id: winner.id, ref: winner.jolpicaId }) : null;
  const fastestHref = fastest ? urlFor({ name: 'driver', id: fastest.id, ref: fastest.jolpicaId }) : null;
  const winnerSurname = winner ? winner.last : '';
  const driverFlag = winner
    ? <Flag cc={winner.country} flag={winner.flag} style={{ width: 14, height: 10, flexShrink: 0 }} />
    : null;

  return (
    <div
      className="race-card-link"
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: mob
          ? '40px 22px minmax(0, 1fr) auto'
          : '52px 26px minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) auto',
        gap: mob ? 10 : 16,
        alignItems: 'center',
        padding: mob ? '12px 12px' : '14px 18px',
        background: 'var(--bg-2)',
        border: '1px solid var(--line-1)',
        borderTop: 0,
      }}
    >
      <a className="race-card-stretch" href={raceHref} aria-label={`${race.name} - round ${race.round}`}></a>

      <span className="t-mono" style={{ fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.08em' }}>
        RD {String(race.round).padStart(2, '0')}
      </span>

      <span className="race-flag" style={{ fontSize: 18, lineHeight: 1 }}>
        <Flag cc={race.country} flag={race.flag} />
      </span>

      <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--f-display)', fontWeight: 700,
          fontSize: mob ? 14 : 15, textTransform: 'uppercase',
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {race.name.replace(' Grand Prix', '')}
        </span>
        {race.sprint && <SprintBadge />}
        {mob && (
          <span className="t-mono" style={{ fontSize: 11, color: 'var(--fg-3)', width: '100%', display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>{fmtDate(race.date)}</span>
            {winner && (
              <>
                <span style={{ color: 'var(--fg-4)' }}>·</span>
                {driverFlag}
                {winnerHref
                  ? <a href={winnerHref} className="inline-link race-card-overlay-link" style={{ color: 'var(--fg-1)' }}>{winnerSurname}</a>
                  : <span style={{ color: 'var(--fg-1)' }}>{winnerSurname}</span>}
              </>
            )}
          </span>
        )}
      </div>

      {!mob && (
        <span className="t-mono" style={{ fontSize: 12, color: 'var(--fg-2)' }}>
          {fmtDate(race.date)}
        </span>
      )}

      {!mob && (
        <span style={{
          fontSize: 12, color: 'var(--fg-1)', display: 'flex', gap: 10, alignItems: 'center',
          minWidth: 0,
        }}>
          {winner ? (
            <>
              <span className="t-mono" style={{ color: 'var(--fg-3)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Win</span>
              {driverFlag}
              {winnerHref
                ? <a href={winnerHref} className="inline-link race-card-overlay-link" style={{ color: 'inherit', fontSize: 12 }}>{winnerSurname}</a>
                : <span style={{ fontSize: 12 }}>{winnerSurname}</span>}
              {fastest && (
                <>
                  <span style={{ color: 'var(--fg-4)' }}>·</span>
                  <span className="t-mono" style={{ color: 'var(--fg-3)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase' }}>FL</span>
                  {fastestHref
                    ? <a href={fastestHref} className="inline-link race-card-overlay-link t-mono" style={{ color: 'inherit', fontSize: 11 }}>{fastest.code}</a>
                    : <span className="t-mono" style={{ fontSize: 11 }}>{fastest.code}</span>}
                </>
              )}
            </>
          ) : (
            <span style={{ color: 'var(--fg-3)' }}>—</span>
          )}
        </span>
      )}

      <span aria-hidden="true" style={{ color: 'var(--fg-4)', fontFamily: 'var(--f-mono)', fontSize: 16 }}>›</span>
    </div>
  );
}

function ChronologicalGrid({ F, mob }) {
  const cal = F.calendar;
  return (
    <div className="grid" style={{ gridTemplateColumns: mob ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))' }}>
      {cal.map(race => {
        const circuit = F.circuits[race.circuit] || { name: race.circuit };
        const result = F.results[race.round];
        const winner = result ? F.driverById(result.order[0]) : null;
        const fastest = result ? F.driverById(result.fastest) : null;
        const raceHref = urlFor({ name: 'race', year: F.seasonYear, round: race.round });
        return (
          <div key={race.round} className={`race-card race-card-link is-${race.status}`}>
            <a className="race-card-stretch" href={raceHref} aria-label={`${race.name} - round ${race.round}`}></a>
            <div className="race-card-head">
              <div className="race-round">RD {String(race.round).padStart(2, '0')}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {race.sprint && <SprintBadge />}
                <span className={`pill pill-${race.status}`}>{race.status}</span>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                <span className="race-flag"><Flag cc={race.country} flag={race.flag} /></span>
                <div className="race-name">{race.name.replace(' Grand Prix', '')}</div>
              </div>
              <a href={urlFor({ name: 'circuit', id: race.circuit })} className="race-circuit inline-link race-card-overlay-link" style={{ color: 'inherit' }}>{circuit.name}</a>
            </div>
            <div className="race-card-foot">
              <div className="race-mini-row">
                <span className="lbl">Date</span>
                <span className="val">{fmtDateLong(race.date)}</span>
              </div>
              {winner && (() => {
                const winnerHref = urlFor({ name: 'driver', id: winner.id, ref: winner.jolpicaId });
                const winnerName = `${winner.first ? winner.first[0] + '. ' : ''}${winner.last}`;
                const winnerLabel = (<><Flag cc={winner.country} flag={winner.flag} /> {winnerName}</>);
                return (
                  <div className="race-mini-row">
                    <span className="lbl">Winner</span>
                    <span className="val" style={{ color: 'var(--fg-1)' }}>
                      {winner.jolpicaId
                        ? <a href={winnerHref} className="inline-link race-card-overlay-link" style={{ color: 'inherit' }}>{winnerLabel}</a>
                        : winnerLabel}
                    </span>
                  </div>
                );
              })()}
              {fastest && (() => {
                const fastestHref = urlFor({ name: 'driver', id: fastest.id, ref: fastest.jolpicaId });
                return (
                  <div className="race-mini-row">
                    <span className="lbl">Fastest Lap</span>
                    <span className="val" style={{ color: 'var(--fg-1)' }}>
                      {fastest.jolpicaId
                        ? <a href={fastestHref} className="inline-link race-card-overlay-link" style={{ color: 'inherit' }}>{fastest.code}</a>
                        : fastest.code}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function CalendarScreen({ data }) {
  const F = data;
  const mob = useIsMobile();
  const cal = F.calendar;
  const sprintCount = cal.filter(r => r.sprint).length;

  const nextRace = cal.find(r => r.status === 'next');
  const upcomingRaces = cal.filter(r => r.status === 'upcoming');
  const completedRaces = cal.filter(r => r.status === 'completed');
  // Most-recent first so the latest result is the visual anchor of the
  // "recent results" strip.
  const completedRecentFirst = [...completedRaces].reverse();
  const hasFuture = !!nextRace || upcomingRaces.length > 0;

  return (
    <div className={`page ${mob ? 'page-mob' : ''}`}>
      <div className="page-head">
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 6 }}>{F.seasonYear || '2026'} Season</div>
          <h1 className="page-title">Race Calendar</h1>
          <div className="page-sub">
            {cal.length} rounds · {sprintCount} sprint weekends
            {hasFuture && completedRaces.length > 0 && (
              <> · {completedRaces.length} complete</>
            )}
          </div>
        </div>
      </div>

      {!hasFuture && <ChronologicalGrid F={F} mob={mob} />}

      {hasFuture && (
        <>
          {nextRace && <NextRaceHero F={F} race={nextRace} mob={mob} />}

          {completedRaces.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <SectionHead title="Recent Results" />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {completedRecentFirst.map((race, i) => (
                  <div key={race.round} style={{
                    borderTop: i === 0 ? '1px solid var(--line-1)' : undefined,
                  }}>
                    <CompletedRow F={F} race={race} mob={mob} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {upcomingRaces.length > 0 && (
            <>
              <SectionHead title={nextRace ? 'Coming Up' : 'Upcoming'} />
              <div
                className="grid"
                style={{
                  gridTemplateColumns: mob ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))',
                }}
              >
                {upcomingRaces.map(race => <UpcomingCard key={race.round} F={F} race={race} />)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
