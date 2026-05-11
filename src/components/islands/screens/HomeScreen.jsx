// Home / Dashboard. Ported from js/screens/home.jsx.
// All `window.F1_DATA` reads → `data` prop. Recharts unused on this screen.

import { useMemo, useState, useEffect } from 'react';
import {
  SectionHead, SprintBadge, Countdown, DriverSilhouette, useIsMobile, urlFor, navigate, fmtDateLong,
  circuitTz, zoneShort, Flag,
} from '../../../lib/shared.jsx';

const SESSION_LABELS = {
  fp1: 'Practice 1',
  fp2: 'Practice 2',
  fp3: 'Practice 3',
  q: 'Qualifying',
  sprint: 'Sprint',
  sprintQuali: 'Sprint Quali',
  race: 'Race',
};
// Sessions come from public/data/<year>.json's calendar entries (date +
// HH:MM:SSZ time per session). Sprint weekends drop fp2/fp3 and gain
// sprintQuali + sprint. Both day-of-week and HH:MM are computed in the
// chosen IANA zone so a Friday session in Tokyo correctly becomes
// Thursday in Austin.
function buildSessions(next, zone) {
  const order = next.sprint
    ? ['fp1', 'sprintQuali', 'sprint', 'q', 'race']
    : ['fp1', 'fp2', 'fp3', 'q', 'race'];
  const dayFmt  = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: zone });
  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone,
  });
  const src = next.sessions;
  return order.map(id => {
    const s = src && src[id];
    if (!s || !s.date || !s.time) {
      return { id, name: SESSION_LABELS[id], day: '-', time: '-', dt: null };
    }
    const dt = new Date(`${s.date}T${s.time}`);
    return {
      id,
      name: SESSION_LABELS[id],
      day:  dayFmt.format(dt),
      time: timeFmt.format(dt),
      dt,
    };
  });
}

function EmptyHome({ mob }) {
  // Shown when currentSeason has no real bundle yet (fresh clone, before
  // the nightly Jolpica refresh has run, or year just rolled over). We
  // prefer empty placeholders to a speculative grid that drifts from
  // reality.
  return (
    <div className={`page ${mob ? 'page-mob' : ''}`}>
      <div className="panel" style={{ position: 'relative', overflow: 'hidden', minHeight: 220 }}>
        <div className="kbd-corner kbd-tl"></div>
        <div className="kbd-corner kbd-tr"></div>
        <div className="kbd-corner kbd-bl"></div>
        <div className="kbd-corner kbd-br"></div>
        <div style={{ padding: mob ? 32 : 56, textAlign: 'center', color: 'var(--fg-3)' }}>
          <div className="t-eyebrow" style={{ color: 'var(--accent)', marginBottom: 12 }}>Awaiting Season Data</div>
          <div className="t-display" style={{ fontSize: mob ? 24 : 32, marginBottom: 8, color: 'var(--fg-2)' }}>
            Refreshing<span style={{ color: 'var(--accent)' }}>.</span>
          </div>
          <div className="t-mono" style={{ fontSize: 13 }}>The latest results will appear once the nightly sync completes.</div>
        </div>
      </div>
    </div>
  );
}

function SummaryWidget({ data, kicker, driver, team, big, sub, href, mob }) {
  const D = data;
  const accent = driver ? D.teamById(driver.team).color : (team ? team.color : 'var(--accent)');
  return (
    <a className="panel" style={{ borderLeft: `3px solid ${accent}`, cursor: 'pointer', textDecoration: 'none', color: 'inherit', display: 'block', position: 'relative', overflow: 'hidden' }} href={href}>
      {driver && (
        <div style={{ position: 'absolute', bottom: 0, right: 0, zIndex: 0, lineHeight: 0 }}>
          <DriverSilhouette data={D} driver={driver} height={mob ? 70 : 90} />
        </div>
      )}
      <div className="panel-body" style={{ position: 'relative', zIndex: 1 }}>
        <div className="t-eyebrow" style={{ color: 'var(--fg-3)', marginBottom: 8 }}>{kicker}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          {driver && (
            <>
              <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 30, lineHeight: 1, color: 'var(--fg-3)' }}>{driver.num}</div>
              <div>
                <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 22, lineHeight: 1, textTransform: 'uppercase' }}>{driver.first} {driver.last}</div>
                <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 2 }}><Flag cc={driver.country} flag={driver.flag} /> {D.teamById(driver.team).name}</div>
              </div>
            </>
          )}
          {team && (
            <div>
              <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 22, lineHeight: 1, textTransform: 'uppercase' }}>{team.name}</div>
              <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 2 }}>{D.seasonYear || '2026'} Constructors</div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderTop: '1px solid var(--line-1)', paddingTop: 10 }}>
          <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 26, color: 'var(--fg-1)' }}>{big}</div>
          <div style={{ fontSize: 11, color: 'var(--fg-3)', textAlign: 'right' }}>{sub}</div>
        </div>
      </div>
    </a>
  );
}

function NextRacePanel({ data, cal, next, mob }) {
  const D = data;

  const userZone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
    catch { return 'UTC'; }
  }, []);

  // Initial render is always 'track' so the prerendered HTML matches what
  // hydration shows for users with no saved preference. localStorage is
  // read in an effect after hydration to switch to 'user' when needed.
  const [tzMode, setTzMode] = useState('track');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('f1-tz');
      if (saved === 'user' || saved === 'track') setTzMode(saved);
    } catch { /* localStorage unavailable */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem('f1-tz', tzMode); }
    catch { /* localStorage unavailable */ }
  }, [tzMode]);

  const trackZone = circuitTz(next.circuitId);
  const activeZone = tzMode === 'user' ? userZone : trackZone;

  const raceDt = useMemo(() => {
    return next.date
      ? new Date(`${next.date}T${next.time || '14:00:00Z'}`)
      : new Date();
  }, [next.date, next.time]);

  // Countdown targets the earliest session whose start time is in the
  // future. If all sessions on the weekend have passed (race weekend
  // finishing today), fall through to the race itself (target = raceDt,
  // countdown reads 0). Recomputed when `sessions` changes (zone toggle
  // doesn't affect ordering - `dt` is the same Date - but `useMemo`
  // keeps this stable across renders).
  const sessions = buildSessions(next, activeZone);

  const nextSession = useMemo(() => {
    const nowMs = Date.now();
    const upcoming = sessions.find(s => s.dt && s.dt.getTime() > nowMs);
    return upcoming || sessions[sessions.length - 1] || null;
  }, [sessions]);
  const target = (nextSession && nextSession.dt) || raceDt;

  return (
    <div className="panel" style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer' }}
         onClick={() => navigate({ name: 'race', year: D.seasonYear, round: next.round })}>
      <div className="kbd-corner kbd-tl"></div>
      <div className="kbd-corner kbd-tr"></div>
      <div className="kbd-corner kbd-bl"></div>
      <div className="kbd-corner kbd-br"></div>
      <div style={{ padding: mob ? 16 : 24, display: 'grid', gridTemplateColumns: mob ? '1fr' : '1fr 1fr', gap: mob ? 20 : 32 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span className="t-eyebrow" style={{ color: 'var(--accent)' }}>Next Race</span>
            <span style={{ flex: 1, height: 1, background: 'var(--line-1)' }}></span>
            <span className="t-eyebrow">Round {String(next.round).padStart(2, '0')}/{cal.length}</span>
            {next.sprint && <SprintBadge />}
          </div>
          <div className="t-display" style={{ fontSize: mob ? 38 : 56, marginBottom: 6 }}>
            {next.name.replace(' Grand Prix', '')}<span style={{ color: 'var(--accent)' }}>.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--fg-2)', marginBottom: 16 }}>
            <span style={{ fontSize: 20, lineHeight: 1 }}><Flag cc={next.country} flag={next.flag} /></span>
            <span className="t-mono" style={{ fontSize: 13 }}>{D.circuits[next.circuit] && D.circuits[next.circuit].name.toUpperCase()}</span>
            <span style={{ color: 'var(--fg-4)' }}>·</span>
            <span className="t-mono" style={{ fontSize: 13 }}>{fmtDateLong(next.date)}</span>
          </div>
          {nextSession && nextSession.dt && (
            <div className="t-mono" style={{
              fontSize: 11,
              color: 'var(--fg-3)',
              letterSpacing: '0.04em',
              marginBottom: 6,
            }}>
              {nextSession.name} starts {nextSession.day} · {nextSession.time} {zoneShort(activeZone, nextSession.dt)}
            </div>
          )}
          <Countdown target={target} />
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span className="t-eyebrow">Session Schedule</span>
            <div role="tablist" aria-label="Time zone"
                 style={{ display: 'inline-flex', border: '1px solid var(--line-1)' }}>
              {[['track', 'Track'], ['user', 'You']].map(([val, lbl]) => (
                <button key={val} role="tab" aria-selected={tzMode === val}
                  onClick={(e) => { e.stopPropagation(); setTzMode(val); }}
                  style={{
                    padding: '4px 10px',
                    fontFamily: 'var(--f-mono)',
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    cursor: 'pointer',
                    background: tzMode === val ? 'var(--accent)' : 'transparent',
                    color: tzMode === val ? '#fff' : 'var(--fg-2)',
                    border: 'none',
                  }}>{lbl}</button>
              ))}
            </div>
          </div>
          <div style={{ border: '1px solid var(--line-1)' }}>
            {sessions.map((s, i) => (
              <div key={s.id} style={{
                display: 'grid', gridTemplateColumns: '50px 1fr auto auto',
                gap: 12, padding: '10px 14px', alignItems: 'center',
                borderBottom: i < sessions.length - 1 ? '1px solid var(--line-1)' : '0',
                background: nextSession && s.id === nextSession.id ? 'rgba(232,0,45,0.04)' : 'transparent',
              }}>
                <span className="t-mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{s.name}</span>
                <span className="t-mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{s.day}</span>
                <span className="t-mono" style={{ fontSize: 12, color: 'var(--fg-1)' }}>{s.time}</span>
              </div>
            ))}
          </div>
          <div className="t-mono" style={{
            fontSize: 11,
            color: 'var(--fg-3)',
            marginTop: 8,
            letterSpacing: '0.04em',
          }}>
            Track: {(D.circuits[next.circuit] && D.circuits[next.circuit].city) || '-'} ({zoneShort(trackZone, raceDt)})
            {' · '}
            You: {userZone} ({zoneShort(userZone, raceDt)})
          </div>
        </div>
      </div>
    </div>
  );
}

function SeasonAtGlance({ data, cal, standings, mob }) {
  const D = data;
  const drivers = standings.drivers;
  const teams = standings.teams;
  const champ = drivers[0];
  const champRunner = drivers[1];
  const teamChamp = teams[0];
  const teamRunner = teams[1];
  const champTeam = champ ? D.teamById(champ.driver.team) : null;

  const topBy = (key) => [...drivers].sort((a, b) => (b[key] || 0) - (a[key] || 0))[0];
  const mostWins = topBy('wins');
  const mostPoles = topBy('poles');
  const mostFL = topBy('fastestLaps');
  const totalDnfs = drivers.reduce((s, r) => s + (r.dnfs || 0), 0);

  const Record = ({ lbl, name, val }) => (
    <div className="stat" style={{ textAlign: 'left', padding: '12px 14px' }}>
      <div className="stat-lbl">{lbl}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 16, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        <span className="t-mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>{val}</span>
      </div>
    </div>
  );

  return (
    <div className="panel" style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer', borderLeft: champTeam ? `3px solid ${champTeam.color}` : undefined }}
         onClick={() => navigate({ name: 'standings-d' })}>
      <div className="kbd-corner kbd-tl"></div>
      <div className="kbd-corner kbd-tr"></div>
      <div className="kbd-corner kbd-bl"></div>
      <div className="kbd-corner kbd-br"></div>
      <div style={{ padding: mob ? 16 : 24, display: 'grid', gridTemplateColumns: mob ? '1fr' : '1fr 1fr', gap: mob ? 20 : 32 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span className="t-eyebrow" style={{ color: 'var(--accent)' }}>{D.seasonYear} Season</span>
            <span style={{ flex: 1, height: 1, background: 'var(--line-1)' }}></span>
            <span className="t-eyebrow">{cal.length} Rounds</span>
          </div>
          {champ && (
            <>
              <div className="t-display" style={{ fontSize: mob ? 38 : 56, marginBottom: 6 }}>
                {champ.driver.last}<span style={{ color: 'var(--accent)' }}>.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--fg-2)', marginBottom: 14, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 20, lineHeight: 1 }}><Flag cc={champ.driver.country} flag={champ.driver.flag} /></span>
                <span className="t-mono" style={{ fontSize: 13 }}>{champTeam && champTeam.name.toUpperCase()}</span>
                <span style={{ color: 'var(--fg-4)' }}>·</span>
                <span className="t-mono" style={{ fontSize: 13 }}>{champ.points} PTS</span>
                {champRunner && (
                  <>
                    <span style={{ color: 'var(--fg-4)' }}>·</span>
                    <span className="t-mono" style={{ fontSize: 13 }}>+{champ.points - champRunner.points} OVER {champRunner.driver.last.toUpperCase()}</span>
                  </>
                )}
              </div>
              <div className="t-eyebrow" style={{ color: 'var(--fg-3)', marginBottom: 4 }}>World Drivers' Champion</div>
              {teamChamp && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line-1)' }}>
                  <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: mob ? 22 : 28, letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: 4 }}>
                    {teamChamp.team.name}
                  </div>
                  <div className="t-eyebrow" style={{ color: 'var(--fg-3)', marginBottom: 4 }}>Constructors' Champion</div>
                  <div className="t-mono" style={{ fontSize: 13, color: 'var(--fg-2)' }}>
                    {teamChamp.points} PTS{teamRunner ? ` · +${teamChamp.points - teamRunner.points} over ${teamRunner.team.name}` : ''}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div>
          <div className="t-eyebrow" style={{ marginBottom: 10 }}>Season Records</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
            {mostWins && <Record lbl="Most Wins" name={mostWins.driver.last} val={mostWins.wins} />}
            {mostPoles && <Record lbl="Most Poles" name={mostPoles.driver.last} val={mostPoles.poles} />}
            {mostFL && <Record lbl="Most Fastest Laps" name={mostFL.driver.last} val={mostFL.fastestLaps} />}
            <Record lbl="Total DNFs" name="Across grid" val={totalDnfs} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomeScreen({ data }) {
  const D = data;
  const mob = useIsMobile();
  const standings = useMemo(() => D.computeStandings(), [D]);

  // Empty bundle (fresh clone / pre-cron) - render a placeholder rather than
  // pretend to have results. Hook order stays stable: standings is computed
  // unconditionally above (safely returns empty arrays for empty data).
  if (D._empty) return <EmptyHome mob={mob} />;

  const cal = D.calendar;

  // "Next race" = first race whose date is today or later. Falls back to
  // the legacy `status: 'next'` flag (only set on buildFallback's hardcoded
  // 2026 grid) so the dev-data path keeps working when system date drifts
  // past the speculative calendar. A season is "historic" iff there's no
  // upcoming race AND results have been recorded for at least one round.
  const todayIso = new Date().toISOString().slice(0, 10);
  const next =
    cal.find(r => r.date && r.date >= todayIso) ||
    cal.find(r => r.status === 'next') ||
    null;
  const isHistoric = !next && cal.some(r => D.results[r.round]);
  const prev = [...cal].reverse().find(r => D.results[r.round]);

  const top5 = standings.drivers.slice(0, 5);
  const leader = standings.drivers[0];
  const p2 = standings.drivers[1];
  const teamLeader = standings.teams[0];
  const lastRace = prev;
  const lastResult = lastRace ? D.results[lastRace.round] : null;
  const lastWinner = lastResult ? D.driverById(lastResult.order[0]) : null;
  const lastWinnerTeam = lastWinner ? D.teamById(lastWinner.team) : null;

  return (
    <div className={`page ${mob ? 'page-mob' : ''}`}>
      {isHistoric || !next
        ? <SeasonAtGlance data={D} cal={cal} standings={standings} mob={mob} />
        : <NextRacePanel data={D} cal={cal} next={next} mob={mob} />}

      <SectionHead title="Season Summary" />
      <div className="grid" style={{ gridTemplateColumns: mob ? '1fr' : 'repeat(3, 1fr)' }}>
        <SummaryWidget data={D} kicker="Drivers' Leader"
          driver={leader.driver}
          big={`${leader.points} pts`}
          sub={`+${leader.points - p2.points} over ${p2.driver.last}`}
          href={urlFor({ name: 'driver', id: leader.driver.id, ref: leader.driver.jolpicaId })}
          mob={mob}
        />
        <SummaryWidget data={D} kicker="Constructors' Leader"
          team={teamLeader.team}
          big={`${teamLeader.points} pts`}
          sub={`${teamLeader.wins} wins · ${teamLeader.podiums} podiums`}
          href={urlFor({ name: 'standings-c' })}
          mob={mob}
        />
        {lastRace && lastWinner ? (
          <SummaryWidget data={D} kicker="Last Race"
            driver={lastWinner}
            big={`P1`}
            sub={`${lastRace.name.replace(' Grand Prix', '')} · ${lastWinnerTeam.name}`}
            href={urlFor({ name: 'race', year: D.seasonYear, round: lastRace.round })}
            mob={mob}
          />
        ) : (
          <SummaryWidget data={D} kicker="Last Race"
            big="-"
            sub="No results yet"
            mob={mob}
          />
        )}
      </div>

      <SectionHead title="Driver Standings" right={
        <a className="btn btn-ghost btn-sm" href={urlFor({ name: 'standings-d' })}>
          View Full Standings <span className="arrow">→</span>
        </a>
      } />
      <div className="grid" style={{ gridTemplateColumns: mob ? '1fr' : 'repeat(5, 1fr)' }}>
        {top5.map(row => (
          <a key={row.driver.id} className="driver-card"
             style={{ '--team-color': D.teamById(row.driver.team).color, textDecoration: 'none', color: 'inherit' }}
             href={urlFor({ name: 'driver', id: row.driver.id, ref: row.driver.jolpicaId })}>
            <div className={`pos pos-${row.position}`}>{row.position}</div>
            <DriverSilhouette data={D} driver={row.driver} height={80} />
            <div className="meta">
              <div className="name">{row.driver.last}</div>
              <div className="team">{D.teamById(row.driver.team).short} · <Flag cc={row.driver.country} flag={row.driver.flag} /></div>
            </div>
            <div className="pts">
              <div className="pts-num">{row.points}</div>
              <div className="pts-lbl">PTS</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
