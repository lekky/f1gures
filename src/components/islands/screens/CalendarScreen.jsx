// Calendar - season schedule with a featured "next race" hero followed by a
// single unified list of every round (ordered round 1 → N). Each row is
// styled by status: completed rounds recede and carry a chequered flag, the
// next round is outlined in --accent, upcoming rounds stay clean.

import { useMemo, useState, useEffect } from 'react';
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
        marginBottom: 28,
        padding: mob ? 24 : 40,
        minHeight: 0,
        gap: mob ? 18 : 26,
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
        {race.sprint && <SprintBadge href="/guide/race-weekend-format/" />}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: mob ? '1fr' : 'minmax(0, 1fr) auto',
        gap: mob ? 16 : 28,
        alignItems: 'center',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 8, flexWrap: 'wrap' }}>
            <span className="race-flag" style={{ fontSize: mob ? 26 : 34 }}>
              <Flag cc={race.country} flag={race.flag} />
            </span>
            <div
              className="t-display"
              style={{ fontSize: mob ? 42 : 64, lineHeight: 0.95, textTransform: 'uppercase' }}
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

// Whole days from `now` until the race date. Null until the client mounts
// (now is set in an effect) so SSR and first client render match.
function daysUntil(dateStr, now) {
  if (!dateStr || !now) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86400000);
}

function CountdownLabel({ days, accent }) {
  if (days == null) return null;
  const text = days === 0 ? 'race day' : days === 1 ? 'in 1 day' : `in ${days} days`;
  return (
    <span className="t-mono" style={{
      fontSize: 11, whiteSpace: 'nowrap',
      color: accent ? 'var(--accent)' : 'var(--fg-3)',
      fontWeight: accent ? 700 : 400,
    }}>{text}</span>
  );
}

// One row in the unified schedule list. Handles every status:
//  - completed: chequered wash + winner face / fastest-lap, recessed
//  - next: red-tinted, lifted out, date + day countdown + NEXT pill
//  - upcoming: date + day countdown + UPCOMING pill
function ScheduleRow({ F, race, status, mob, now }) {
  const circuit = F.circuits[race.circuit] || { name: race.circuit };
  const circuitHref = urlFor({ name: 'circuit', id: race.circuit });
  const result = F.results[race.round];
  const winner = result ? F.driverById(result.order[0]) : null;
  // Pre-2004 bundles ship fastest: null (Ergast has no FL rank before then);
  // driverById(null) returns a truthy placeholder, so guard the id itself.
  const fastest = result && result.fastest ? F.driverById(result.fastest) : null;
  const raceHref = urlFor({ name: 'race', year: F.seasonYear, round: race.round });
  const winnerHref = winner ? urlFor({ name: 'driver', id: winner.id, ref: winner.jolpicaId }) : null;
  const fastestHref = fastest ? urlFor({ name: 'driver', id: fastest.id, ref: fastest.jolpicaId }) : null;
  const winnerSurname = winner ? winner.last : '';
  const driverFlag = winner
    ? <Flag cc={winner.country} flag={winner.flag} style={{ width: 14, height: 10, flexShrink: 0 }} />
    : null;
  // Winner headshot; hides itself if the .webp is missing (most historic drivers).
  const winnerFace = winner && winner.jolpicaId ? (
    <img
      className="cal-face"
      src={`/images/drivers/${winner.jolpicaId}.webp`}
      alt=""
      loading="lazy"
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  ) : null;

  const isNext = status === 'next';
  const isDone = status === 'completed';
  const statusCls = isNext ? 'is-next-row' : isDone ? 'is-done' : 'is-up';
  const days = daysUntil(race.date, now);

  // Right-hand cell: winner face + name + fastest-lap for completed rounds,
  // otherwise a status pill.
  const statusSide = isDone ? (
    winner ? (
      <>
        {winnerFace}
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
    )
  ) : (
    <span className={`pill pill-${status}`}>{status}</span>
  );

  return (
    <div
      className={`cal-row race-card-link ${statusCls}`}
      style={{
        gridTemplateColumns: mob
          ? '40px 22px minmax(0, 1fr) auto'
          : '52px 26px minmax(0, 1.5fr) minmax(0, 1.1fr) minmax(0, 1.1fr) auto',
        gap: mob ? 10 : 16,
        padding: isNext
          ? (mob ? '18px 14px' : '20px 20px')
          : (mob ? '12px 12px' : '13px 18px'),
      }}
    >
      <a className="race-card-stretch" href={raceHref} aria-label={`${race.name} - round ${race.round}`}></a>

      {isDone ? (
        <span className="cal-flag-num" aria-label={`Round ${race.round} — completed`}>
          <span className="cal-flag-num-txt">{String(race.round).padStart(2, '0')}</span>
        </span>
      ) : (
        <span className="t-mono" style={{ fontSize: 11, color: isNext ? 'var(--accent)' : 'var(--fg-3)', letterSpacing: '0.08em', fontWeight: isNext ? 700 : 400 }}>
          RD {String(race.round).padStart(2, '0')}
        </span>
      )}

      <span className="race-flag" style={{ fontSize: 18, lineHeight: 1 }}>
        <Flag cc={race.country} flag={race.flag} />
      </span>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span className="cal-name" style={{ fontSize: isNext ? (mob ? 17 : 19) : (mob ? 14 : 15) }}>
            {race.name.replace(' Grand Prix', '')}
          </span>
          {race.sprint && <SprintBadge href="/guide/race-weekend-format/" />}
        </span>
        <a
          href={circuitHref}
          className="cal-circuit inline-link race-card-overlay-link t-mono"
          style={{ color: 'var(--fg-3)', fontSize: 11 }}
        >
          {circuit.name}
        </a>
        {mob && (
          <span className="t-mono" style={{ fontSize: 11, color: 'var(--fg-3)', display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>{fmtDate(race.date)}</span>
            {isDone && winner && (
              <>
                <span style={{ color: 'var(--fg-4)' }}>·</span>
                {winnerFace}
                {winnerHref
                  ? <a href={winnerHref} className="inline-link race-card-overlay-link" style={{ color: 'var(--fg-1)' }}>{winnerSurname}</a>
                  : <span style={{ color: 'var(--fg-1)' }}>{winnerSurname}</span>}
              </>
            )}
            {!isDone && (
              <>
                <span style={{ color: 'var(--fg-4)' }}>·</span>
                <span className={`pill pill-${status}`}>{status}</span>
                <CountdownLabel days={days} accent={isNext} />
              </>
            )}
          </span>
        )}
      </div>

      {!mob && (
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span className="t-mono" style={{ fontSize: 12, color: 'var(--fg-2)' }}>
            {fmtDate(race.date)}
          </span>
          {!isDone && <CountdownLabel days={days} accent={isNext} />}
        </span>
      )}

      {!mob && (
        <span style={{
          fontSize: 12, color: 'var(--fg-1)', display: 'flex', gap: 8, alignItems: 'center',
          justifyContent: 'flex-end', minWidth: 0,
        }}>
          {statusSide}
        </span>
      )}

      <span aria-hidden="true" style={{ color: isNext ? 'var(--accent)' : 'var(--fg-4)', fontFamily: 'var(--f-mono)', fontSize: 16 }}>›</span>
    </div>
  );
}

export default function CalendarScreen({ data }) {
  const F = data;
  const mob = useIsMobile();
  const cal = F.calendar;
  const sprintCount = cal.filter(r => r.sprint).length;

  // A race counts as "completed" only once its results are in the bundle - the
  // canonical "race has run" signal used everywhere else in the app. The
  // bundle's own `status` string can read 'completed' on race-day morning,
  // before results land, which would wrongly bump the hero to the following
  // round. Deriving status from results keeps the current race weekend as the
  // hero until it's actually been run.
  const isDone = (r) => !!F.results[r.round];
  const nextRace = cal.find(r => !isDone(r)) || null;
  const statusOf = (r) =>
    isDone(r) ? 'completed' : (nextRace && r.round === nextRace.round ? 'next' : 'upcoming');
  const completedRaces = cal.filter(isDone);
  const hasFuture = !!nextRace;

  // Set on mount only, so SSR / first client render agree (no `now`) and the
  // day countdowns fill in after hydration.
  const [now, setNow] = useState(null);
  useEffect(() => { setNow(new Date()); }, []);

  return (
    <div className={`page ${mob ? 'page-mob' : ''}`}>
      <div className="page-head">
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 6 }}>{F.seasonYear || '2026'} Season</div>
          <h1 className="page-title">Next Race</h1>
          <div className="page-sub">
            {cal.length} rounds · {sprintCount} sprint weekends
            {completedRaces.length > 0 && (
              <> · {completedRaces.length} complete</>
            )}
          </div>
        </div>
      </div>

      {nextRace && <NextRaceHero F={F} race={nextRace} mob={mob} />}

      <SectionHead variant="band" title={hasFuture ? 'Full Schedule' : 'Season Results'} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {cal.map(race => <ScheduleRow key={race.round} F={F} race={race} status={statusOf(race)} mob={mob} now={now} />)}
      </div>
    </div>
  );
}
