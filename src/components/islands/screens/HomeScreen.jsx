// Home / Dashboard. Ported from js/screens/home.jsx.
// All `window.F1_DATA` reads → `data` prop. Recharts unused on this screen.

import { useMemo, useState, useEffect, useLayoutEffect } from 'react';
import {
  SectionHead, SprintBadge, Countdown, TeamLogo, useIsMobile, urlFor, navigate, fmtDateLong,
  circuitTz, zoneShort, Flag,
  MiniChart, lastNCompletedRounds, driverPointsForRound, teamPointsForRound,
} from '../../../lib/shared.jsx';
import { useTempUnit } from '../../../lib/weather.js';
import { circuitProfiles } from '../../../data/circuitProfiles.js';
import SessionWeatherCell from './SessionWeatherCell.jsx';
import SessionWeatherExpand from './SessionWeatherExpand.jsx';
import TriviaBoard from './TriviaBoard.jsx';

// Layout effect that's a no-op during SSR (avoids the React useLayoutEffect
// server warning) but runs synchronously before paint on the client.
const useIsoLayout = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// Counts a number up from 0 on mount (page load). SSR and the first client
// render show the final value (so the prerendered HTML and hydration match);
// the layout effect then resets to 0 before the browser paints and eases up
// via rAF. Honours prefers-reduced-motion.
function CountUp({ value, decimals = 0, duration = 800 }) {
  const [display, setDisplay] = useState(value);
  useIsoLayout(() => {
    if (!Number.isFinite(value)) { setDisplay(value); return; }
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setDisplay(value); return; }
    let raf;
    let startTs = null;
    setDisplay(0);
    const tick = (ts) => {
      if (startTs === null) startTs = ts;
      const t = Math.min(1, (ts - startTs) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(tick);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [value]);
  const shown = decimals > 0 ? Number(display).toFixed(decimals) : String(Math.round(Number(display)));
  return <>{shown}</>;
}

function driversSummary(D, drivers, completedCount) {
  if (!drivers.length || !completedCount) return null;
  const [p1, p2, p3] = drivers;
  const p1Team = D.teamById(p1.driver.team);
  const year = D.seasonYear || '';
  const roundsLbl = `${completedCount} ${completedCount === 1 ? 'round' : 'rounds'}`;

  let s = `${p1.driver.first} ${p1.driver.last} leads the ${year} World Drivers' Championship`;
  if (p1Team) s += ` for ${p1Team.name}`;
  s += `, with ${p1.points} points after ${roundsLbl}`;
  if (p1.wins) s += ` and ${p1.wins} race ${p1.wins === 1 ? 'win' : 'wins'}`;
  s += '.';

  if (p2 && p3) {
    const g12 = p1.points - p2.points;
    const g23 = p2.points - p3.points;
    s += ` ${p2.driver.last} sits ${g12} ${g12 === 1 ? 'point' : 'points'} behind in second`;
    s += `, with ${p3.driver.last} a further ${g23} adrift in third.`;
  } else if (p2) {
    const g12 = p1.points - p2.points;
    s += ` ${p2.driver.last} is ${g12} ${g12 === 1 ? 'point' : 'points'} behind in second.`;
  }
  return s;
}

function teamsSummary(D, teams, completedCount) {
  if (!teams.length || !completedCount) return null;
  const [t1, t2, t3] = teams;
  const year = D.seasonYear || '';
  const roundsLbl = `${completedCount} ${completedCount === 1 ? 'round' : 'rounds'}`;

  let s = `${t1.team.name} top the ${year} Constructors' Championship with ${t1.points} points`;
  if (t1.wins) {
    s += ` and ${t1.wins} ${t1.wins === 1 ? 'win' : 'wins'} from ${roundsLbl}`;
  } else {
    s += ` after ${roundsLbl}`;
  }
  s += '.';

  if (t2 && t3) {
    const g12 = t1.points - t2.points;
    s += ` ${t2.team.name} sit ${g12} ${g12 === 1 ? 'point' : 'points'} back`;
    s += `, with ${t3.team.name} completing the top three.`;
  } else if (t2) {
    const g12 = t1.points - t2.points;
    s += ` ${t2.team.name} are ${g12} ${g12 === 1 ? 'point' : 'points'} behind.`;
  }
  return s;
}

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

function sessionWeather(D, next, sessionId) {
  const w = D.weather;
  if (
    w && w.status === 'ok' &&
    String(w.round) === String(next.round) &&
    String(w.year) === String(D.seasonYear) &&
    w.sessions && w.sessions[sessionId]
  ) {
    const slot = w.sessions[sessionId];
    return { forecast: { ...slot.at, hourly: slot.hourly }, isClimate: false };
  }
  // Note: w.status === 'out-of-window' intentionally falls through to climate.
  // currentSeason.js still attaches that envelope to D.weather, but the guard
  // above rejects anything other than 'ok'.
  const climate = D.climate && D.climate[next.circuit];
  if (climate) {
    return { forecast: { wmo: climate.wmo, tempC: climate.tempC, precipMm: climate.precipMm, precipProbPct: climate.precipProbPct }, isClimate: true };
  }
  return { forecast: null, isClimate: false };
}

function EmptyHome({ mob }) {
  // Shown when currentSeason has no real bundle yet (fresh clone, before
  // the nightly Jolpica refresh has run, or year just rolled over). We
  // prefer empty placeholders to a speculative grid that drifts from
  // reality.
  return (
    <div className={`page ${mob ? 'page-mob' : ''}`}>
      <h1 className="sr-only">Formula 1 Live Standings, Calendar & Stats</h1>
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

  const [expandedSessionId, setExpandedSessionId] = useState(null);
  const unit = useTempUnit();
  const useF = unit === 'F';
  const toggleExpand = (id) => setExpandedSessionId(curr => curr === id ? null : id);

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

  // Curated circuit stats (real length/laps/corners; the bundle's own fields
  // are zeros). next.circuit is the short id that keys circuitProfiles.
  const profile = circuitProfiles[next.circuit] || null;
  const circuitStats = profile ? [
    profile.length  ? { l: 'Length',  v: profile.length,  d: 3, u: ' km' } : null,
    profile.laps    ? { l: 'Laps',    v: profile.laps,    d: 0, u: '' } : null,
    profile.corners ? { l: 'Corners', v: profile.corners, d: 0, u: '' } : null,
  ].filter(Boolean) : [];
  const lapRec = profile && profile.lapRecord && profile.lapRecord.time && profile.lapRecord.time !== '-'
    ? profile.lapRecord
    : null;
  // Driver headshot + link for the lap-record holder. Images are keyed by
  // driverRef (e.g. max_verstappen.webp); the driver page is prerendered at
  // /drivers/<driverRef>/. Missing headshots hide via onError.
  const lapRecImg = lapRec && lapRec.driverRef ? `/images/drivers/${lapRec.driverRef}.webp` : null;
  const lapRecHref = lapRec && lapRec.driverRef ? `/drivers/${lapRec.driverRef}/` : null;

  return (
    <div className="panel f1-card-link" style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer' }}
         onClick={() => navigate({ name: 'race', year: D.seasonYear, round: next.round })}>
      <div className="hero-ghost" aria-hidden="true">{String(next.round).padStart(2, '0')}</div>
      <div className="hero-speedlines" aria-hidden="true"></div>
      <div className="kbd-corner kbd-tl"></div>
      <div className="kbd-corner kbd-tr"></div>
      <div className="kbd-corner kbd-bl"></div>
      <div className="kbd-corner kbd-br"></div>
      <div style={{ position: 'relative', zIndex: 1, padding: mob ? 16 : 24, display: 'grid', gridTemplateColumns: mob ? '1fr' : '1fr 1fr', gap: mob ? 20 : 32 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span className="t-eyebrow" style={{ color: 'var(--accent)' }}>Next Race</span>
            <span style={{ flex: 1, height: 1, background: 'var(--line-1)' }}></span>
            <span className="t-eyebrow">Round {String(next.round).padStart(2, '0')}/{cal.length}</span>
            {next.sprint && <SprintBadge href="/guide/race-weekend-format/" />}
          </div>
          <div className="t-display" style={{ fontSize: mob ? 44 : 76, marginBottom: 6 }}>
            {next.name.replace(' Grand Prix', '')}<span style={{ color: 'var(--accent)' }}>.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--fg-2)', marginBottom: 16 }}>
            <span style={{ fontSize: 20, lineHeight: 1 }}><Flag cc={next.country} flag={next.flag} /></span>
            <span className="t-mono" style={{ fontSize: 13 }}>{D.circuits[next.circuit] && D.circuits[next.circuit].name.toUpperCase()}</span>
            <span style={{ color: 'var(--fg-4)' }}>·</span>
            <span className="t-mono" style={{ fontSize: 13 }}>{fmtDateLong(next.date)}</span>
          </div>
          {circuitStats.length > 0 && (
            <div className="hero-circuit-stats" style={{ marginBottom: 16 }}>
              {circuitStats.map(s => (
                <div className="hs" key={s.l}>
                  <div className="hs-l">{s.l}</div>
                  <div className="hs-v"><CountUp value={s.v} decimals={s.d} /><span className="hs-u">{s.u}</span></div>
                </div>
              ))}
            </div>
          )}
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

        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span className="t-eyebrow">Session Schedule</span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span className="t-mono" style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--fg-3)',
              }}>Show times in</span>
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
          </div>
          <div style={{ border: '1px solid var(--line-1)', background: 'var(--bg-2)', minWidth: 0 }} className="next-race-sessions">
            {sessions.map((s, i) => {
              const { forecast, isClimate } = sessionWeather(D, next, s.id);
              const isExpanded = expandedSessionId === s.id;
              return (
                <div key={s.id} style={{ minWidth: 0 }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: mob ? '32px minmax(0, 1fr) auto auto 24px' : '50px minmax(0, 1fr) auto auto 56px',
                    gap: mob ? 8 : 12, padding: mob ? '10px 12px' : '10px 14px', alignItems: 'center',
                    borderBottom: (isExpanded || i < sessions.length - 1) ? '1px solid var(--line-1)' : '0',
                    background: nextSession && s.id === nextSession.id ? 'rgba(232,0,45,0.04)' : 'transparent',
                  }}>
                    <span className="t-mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{String(i + 1).padStart(2, '0')}</span>
                    <span style={{ fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{s.name}</span>
                    <span className="t-mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{s.day}</span>
                    <span className="t-mono" style={{ fontSize: 12, color: 'var(--fg-1)' }}>{s.time}</span>
                    <SessionWeatherCell
                      forecast={forecast}
                      isClimate={isClimate}
                      useFahrenheit={useF}
                      expanded={isExpanded}
                      mob={mob}
                      onClick={() => toggleExpand(s.id)}
                    />
                  </div>
                  {isExpanded && forecast && (
                    <SessionWeatherExpand forecast={forecast} isClimate={isClimate} useFahrenheit={useF} timeZone={activeZone} />
                  )}
                </div>
              );
            })}
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
          {lapRec && (
            <div style={{
              marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line-1)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
            }}>
              <span className="t-eyebrow">Lap Record</span>
              <a
                className="lap-record-link"
                href={lapRecHref}
                onClick={(e) => e.stopPropagation()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit' }}
              >
                {lapRecImg && (
                  <img
                    src={lapRecImg}
                    alt=""
                    width={24}
                    height={24}
                    loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top center', background: 'var(--bg-3)', flexShrink: 0 }}
                  />
                )}
                <span className="t-mono" style={{ fontSize: 12, color: 'var(--fg-2)' }}>
                  <span className="lap-record-name" style={{ color: 'var(--fg-1)', fontWeight: 600 }}>{lapRec.driver}</span> · {lapRec.time}
                  {lapRec.year ? <span style={{ color: 'var(--fg-3)' }}> ({lapRec.year})</span> : null}
                </span>
              </a>
            </div>
          )}
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
    <div className="panel f1-card-link" style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer', borderLeft: champTeam ? `3px solid ${champTeam.color}` : undefined }}
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

function Band({ tone = 'plain', mob, children }) {
  // tone: 'plain' (page bg) | 'tint' (recessed bg)
  return (
    <section className={`home-band home-band-${tone}`}>
      <div className={`home-band-inner ${mob ? 'home-band-inner-mob' : ''}`}>
        {children}
      </div>
    </section>
  );
}

function formGuideRounds(D, n = 6) {
  const cal = D.calendar || [];
  const done = cal.filter(r => D.results[r.round]);
  return done.slice(-n).reverse().map(r => {
    const res = D.results[r.round];
    const winner = res && res.order && res.order.length ? D.driverById(res.order[0]) : null;
    const team = winner ? D.teamById(winner.team) : null;
    return {
      round: r.round,
      name: (r.name || '').replace(' Grand Prix', ''),
      country: r.country,
      flag: r.flag,
      sprint: !!r.sprint,
      winner: winner ? winner.last : '-',
      color: team ? team.color : 'var(--accent)',
    };
  });
}

function FormGuide({ data, mob }) {
  const rounds = formGuideRounds(data, 6);
  if (!rounds.length) return null;
  // Duplicate the list so the marquee can loop seamlessly (-50% translate).
  const loop = [...rounds, ...rounds];
  return (
    <section className="home-band fg-band">
      <div className="ticker">
        <div className="tklabel">▸ Form Guide</div>
        <div className="tkmask">
          <div className="tktrack">
            {loop.map((it, i) => (
              <span className="tkitem" key={i} aria-hidden={i >= rounds.length ? 'true' : undefined}>
                <span className="tk-rd">R{String(it.round).padStart(2, '0')}</span>
                <span className="tk-fl"><Flag cc={it.country} flag={it.flag} /></span>
                <span className="tk-gp">{it.name}</span>
                {it.sprint && <span className="tk-spr">SPR</span>}
                <span className="tk-strip" style={{ background: it.color }}></span>
                <span className="tk-wl">Win</span>
                <span className="tk-wn">{it.winner}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// Season progress banner: a dark full-bleed strip (matching the form-guide
// ink) with the completion %, a one-line summary, and one slanted tick per
// round — red for completed, white for the next race, faint for upcoming.
function SeasonProgress({ data, cal, next }) {
  const total = cal.length;
  if (!total) return null;
  const completed = cal.filter(r => data.results[r.round]).length;
  const pct = Math.round((completed / total) * 100);
  const remaining = total - completed;
  const nextRound = next ? next.round : null;
  return (
    <section className="home-band season-progress" aria-label={`${data.seasonYear || ''} season progress`}>
      <div className="sp-inner">
        <div className="sp-pct"><CountUp value={pct} />%</div>
        <div className="sp-meta">
          <div className="sp-title">{data.seasonYear} Season</div>
          <div className="sp-sub">{completed} of {total} rounds complete · {remaining} to go</div>
        </div>
        <div className="sp-ticks" aria-hidden="true">
          {cal.map(r => {
            const done = !!data.results[r.round];
            const isNext = nextRound != null && r.round === nextRound;
            return <span key={r.round} className={`sp-tick${done ? ' done' : isNext ? ' next' : ''}`}></span>;
          })}
        </div>
      </div>
    </section>
  );
}

// Momentum line chart of the top-5 drivers' championship progression + a
// leader card. Hand-rolled SVG (no Recharts) to keep it off the homepage
// bundle. Data comes straight from computeStandings(): progression is the
// cumulative-points-per-round series, completedRounds the x-axis.
function TitleRace({ data, standings, mob }) {
  const D = data;
  const drivers = standings.drivers || [];
  const rounds = standings.completedRounds || [];
  if (drivers.length < 2 || rounds.length < 2) return null;

  const top = drivers.slice(0, 5);
  const leader = drivers[0];
  const p2 = drivers[1];
  const leaderTeam = D.teamById(leader.driver.team);
  const gap = leader.points - p2.points;

  const W = 720, H = 250, PADL = 8, PADR = 8, PADT = 14, PADB = 24;
  const finalPts = top.map(r => {
    const prog = standings.progression[r.driver.id];
    return prog && prog.length ? prog[prog.length - 1].points : r.points;
  });
  const maxPts = (Math.max(...finalPts) * 1.08) || 1;
  const x = i => PADL + (i / (rounds.length - 1)) * (W - PADL - PADR);
  const y = p => PADT + (1 - p / maxPts) * (H - PADT - PADB);

  const lines = top.map(row => {
    const col = D.teamById(row.driver.team).color;
    const pts = standings.progression[row.driver.id] || [];
    const dstr = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(pt.points).toFixed(1)}`).join(' ');
    const last = pts.length ? pts[pts.length - 1] : { points: 0 };
    return { id: row.driver.id, col, dstr, lx: x(pts.length - 1), ly: y(last.points) };
  });
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => PADT + f * (H - PADT - PADB));

  return (
    <Band tone="plain" mob={mob}>
      <SectionHead variant="band" title="The Title Race" right={
        <a className="btn btn-ghost btn-sm" href={urlFor({ name: 'standings-d' })}>
          Full Standings <span className="arrow">→</span>
        </a>
      } />
      <div className="grid" style={{ gridTemplateColumns: mob ? '1fr' : '1fr 320px', gap: 16, alignItems: 'stretch' }}>
        <div className="panel" style={{ padding: 20 }}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: mob ? 220 : 280, overflow: 'visible' }} role="img" aria-label="Championship points progression, top five drivers">
            {gridLines.map((yy, i) => (
              <line key={i} x1={PADL} y1={yy} x2={W - PADR} y2={yy} style={{ stroke: 'var(--line-1)' }} strokeWidth="1" />
            ))}
            {rounds.map((r, i) => (
              <text key={r} x={x(i)} y={H - 6} textAnchor="middle" style={{ fill: 'var(--fg-3)', fontFamily: 'var(--f-mono)', fontSize: 10 }}>R{String(r).padStart(2, '0')}</text>
            ))}
            {lines.map(l => (
              <path key={l.id} d={l.dstr} fill="none" stroke={l.col} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {lines.map(l => (
              <circle key={l.id} cx={l.lx} cy={l.ly} r="3.5" fill={l.col} />
            ))}
          </svg>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 10, paddingTop: 14, borderTop: '1px solid var(--line-1)' }}>
            {top.map(row => (
              <span key={row.driver.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 14, height: 3, background: D.teamById(row.driver.team).color }}></span>
                <span className="t-mono" style={{ fontSize: 12 }}><b>{row.driver.code}</b> {row.points}</span>
              </span>
            ))}
          </div>
        </div>

        <a className="panel" href={urlFor({ name: 'driver', id: leader.driver.id, ref: leader.driver.jolpicaId })}
           style={{ borderTop: `3px solid ${leaderTeam.color}`, padding: 22, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, textDecoration: 'none', color: 'inherit' }}>
          <div className="t-eyebrow">Championship Leader</div>
          <div className="t-display" style={{ fontSize: 30, marginTop: 6 }}>{leader.driver.first} {leader.driver.last}</div>
          <div className="t-mono" style={{ color: 'var(--fg-3)', fontSize: 12 }}>#{leader.driver.num} · {leaderTeam.name}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 14 }}>
            <span className="t-display" style={{ fontSize: 64, color: leaderTeam.color, lineHeight: 0.8 }}><CountUp value={leader.points} /></span>
            <span className="t-eyebrow">pts</span>
          </div>
          <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--bg-1)', border: '1px solid var(--line-1)' }}>
            {gap > 0
              ? <span className="t-mono" style={{ fontSize: 13 }}>+<b>{gap}</b> over {p2.driver.last}</span>
              : <span className="t-mono" style={{ fontSize: 13 }}>Level on points · ahead on countback</span>}
          </div>
          <div className="t-mono" style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 10 }}>
            {leader.wins} wins · {leader.podiums} podiums · {leader.poles} poles
          </div>
        </a>
      </div>
    </Band>
  );
}

// Top-3 standings as a featured leader card (story, big points + stat tiles,
// photo/crest) flanked by two compact 2nd/3rd cards. `mode` switches between
// drivers and constructors. Keeps the real photo/logo, driver/team links, the
// count-up and the last-5-rounds mini-chart (in the leader card).
function ChampSection({ mode, title, fullHref, rows, D, recentRounds, blurb, after, mob }) {
  if (!rows || rows.length < 1) return null;
  const isDrv = mode === 'drivers';
  const norm = (row) => {
    if (isDrv) {
      const t = D.teamById(row.driver.team);
      return {
        key: row.driver.id, position: row.position, points: row.points, color: t.color,
        href: urlFor({ name: 'driver', id: row.driver.id, ref: row.driver.jolpicaId }),
        nameFirst: row.driver.first, nameLast: row.driver.last,
        meta: <><Flag cc={row.driver.country} flag={row.driver.flag} /><span>{t.name}</span></>,
        ghost: String(row.driver.num),
        media: row.driver.jolpicaId
          ? <img className="champ-photo-img" src={`/images/drivers/${row.driver.jolpicaId}.webp`} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          : null,
        rowMedia: row.driver.jolpicaId
          ? <img className="champ-row-img" src={`/images/drivers/${row.driver.jolpicaId}.webp`} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          : null,
        stats: [{ v: row.wins, l: 'Wins' }, { v: row.podiums, l: 'Podiums' }, { v: row.poles, l: 'Poles' }],
        sub: `${row.wins} wins · ${row.podiums} podiums · ${row.poles} poles`,
        recent: recentRounds.map(r => driverPointsForRound(D, row.driver.id, r.round)),
      };
    }
    const t = row.team;
    const codes = (row.drivers || []).map(d => d.code).filter(Boolean).join(' · ');
    return {
      key: t.id, position: row.position, points: row.points, color: t.color,
      href: urlFor({ name: 'team', id: t.id, ref: t.id }),
      nameFirst: null, nameLast: t.name,
      meta: <span>{codes || t.short}</span>,
      ghost: t.short,
      media: <TeamLogo team={t} fill />,
      rowMedia: <TeamLogo team={t} fill />,
      stats: [{ v: row.wins, l: 'Wins' }, { v: row.podiums, l: 'Podiums' }],
      sub: `${row.wins} wins · ${row.podiums} podiums`,
      recent: recentRounds.map(r => teamPointsForRound(D, t.id, r.round)),
    };
  };
  const ld = norm(rows[0]);
  const rest = rows.slice(1, 3).map(norm);
  return (
    <>
      <SectionHead variant="band" title={title} right={
        <a className="btn btn-ghost btn-sm" href={fullHref}>View Full Standings <span className="arrow">→</span></a>
      } />
      <div className="champ">
        <a className="champ-leader" href={ld.href} style={{ '--tc': ld.color }}>
          <div className="champ-leader-photo">
            <span className="champ-medal" aria-hidden="true">1</span>
            {ld.media}
            <span className="champ-photo-ghost" aria-hidden="true">1</span>
          </div>
          <div className="champ-leader-body">
            <div className="champ-leader-head">
              <span className="champ-pill">Championship Leader</span>
              <span className="champ-after">After Round {after}</span>
            </div>
            <h3 className="champ-name">
              {ld.nameFirst ? <span className="champ-name-first">{ld.nameFirst}</span> : null}
              <span className="champ-name-last">{ld.nameLast}</span>
            </h3>
            <div className="champ-meta">{ld.meta}</div>
            {blurb ? <p className="champ-leader-blurb">{blurb}</p> : null}
            <div className="champ-figures">
              <div className="champ-pts"><span className="champ-pts-v"><CountUp value={ld.points} /></span><span className="champ-pts-u">pts</span></div>
              {ld.stats.map(s => (
                <div className="champ-stat" key={s.l}>
                  <span className="champ-stat-v"><CountUp value={s.v} /></span>
                  <span className="champ-stat-l">{s.l}</span>
                </div>
              ))}
            </div>
            {ld.recent.length > 0 && (
              <div className="champ-chart">
                <span className="champ-chart-lbl">Last {ld.recent.length} rounds</span>
                <MiniChart values={ld.recent} color={ld.color} width={mob ? 120 : 150} height={26} />
              </div>
            )}
          </div>
        </a>
        <div className="champ-rest">
          {rest.map(r => (
            <a className="champ-row" key={r.key} href={r.href} style={{ '--tc': r.color }}>
              <div className="champ-row-side">
                <span className="champ-row-badge">{r.position}</span>
                {r.rowMedia
                  ? r.rowMedia
                  : <span className="champ-row-ghost" aria-hidden="true">{r.ghost}</span>}
              </div>
              <div className="champ-row-body">
                <div className="champ-row-name">{r.nameLast}</div>
                <div className="champ-row-meta">{r.meta}</div>
                <div className="champ-row-figs">
                  <span className="champ-row-pts"><CountUp value={r.points} /></span>
                  <span className="champ-row-pts-u">pts</span>
                </div>
                <div className="champ-row-sub">{r.sub}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </>
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

  const top3Drivers = standings.drivers.slice(0, 3);
  const top3Teams = standings.teams.slice(0, 3);
  const recentRounds = lastNCompletedRounds(D, 5);
  const completedCount = D.calendar.filter(r => D.results[r.round]).length;
  const driversBlurb = driversSummary(D, top3Drivers, completedCount);
  const teamsBlurb = teamsSummary(D, top3Teams, completedCount);

  return (
    <div className={mob ? 'home-mob' : ''}>
      <h1 className="sr-only">F1 {D.seasonYear || ''} Live Standings, Calendar & Stats</h1>
      <Band tone="plain" mob={mob}>
        <TriviaBoard />
        {isHistoric || !next
          ? <SeasonAtGlance data={D} cal={cal} standings={standings} mob={mob} />
          : <NextRacePanel data={D} cal={cal} next={next} mob={mob} />}
        <a className="btn btn-secondary" style={{ marginTop: 18 }} href="/guide/">
          New to F1? Start with the beginner's guide <span className="arrow">→</span>
        </a>
      </Band>

      <SeasonProgress data={D} cal={cal} next={next} />

      <TitleRace data={D} standings={standings} mob={mob} />

      <FormGuide data={D} mob={mob} />

      <Band tone="plain" mob={mob}>
        <ChampSection mode="drivers" title="Drivers' Championship"
          fullHref={urlFor({ name: 'standings-d' })} rows={top3Drivers} D={D}
          recentRounds={recentRounds} blurb={driversBlurb}
          after={String(completedCount).padStart(2, '0')} mob={mob} />
      </Band>

      <Band tone="tint" mob={mob}>
        <ChampSection mode="teams" title="Constructors' Championship"
          fullHref={urlFor({ name: 'standings-c' })} rows={top3Teams} D={D}
          recentRounds={recentRounds} blurb={teamsBlurb}
          after={String(completedCount).padStart(2, '0')} mob={mob} />
      </Band>
    </div>
  );
}
