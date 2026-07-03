// Home / Dashboard. Ported from js/screens/home.jsx.
// All `window.F1_DATA` reads → `data` prop. Recharts unused on this screen.

import { useMemo, useState, useEffect } from 'react';
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
import { CountUp, ChampSection, driversSummary, teamsSummary } from './ChampPodium.jsx';

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

  // Resolve the visitor's zone after mount only. The prerendered HTML (and the
  // first client render) fall back to track time, so SSR and hydration agree;
  // once known, the visitor's local time becomes the prominent column. Reading
  // it during the initial render would bake the build machine's zone into the
  // static HTML and mismatch on hydration.
  const [userZone, setUserZone] = useState(null);
  useEffect(() => {
    try { setUserZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'); }
    catch { setUserZone('UTC'); }
  }, []);

  const [expandedSessionId, setExpandedSessionId] = useState(null);
  const unit = useTempUnit();
  const useF = unit === 'F';
  const toggleExpand = (id) => setExpandedSessionId(curr => curr === id ? null : id);

  const trackZone = circuitTz(next.circuitId);

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
  // Show the visitor's local time (primary) and the circuit's local time
  // (secondary) side by side, so nobody mistakes a track-time schedule for
  // their own clock. Both columns show even when the zones match this weekend
  // - seeing them line up confirms it rather than leaving the reader guessing.
  // Until the visitor's zone is known (pre-mount / SSR) we fall back to a
  // single track-time column. Countdown/next-session picking is zone-agnostic
  // (dt is the same instant either way), so it runs off `sessions`.
  const effUserZone = userZone || trackZone;
  const twoTz = !!userZone;
  const userSessions = buildSessions(next, effUserZone);
  const trackSessions = buildSessions(next, trackZone);
  const sessions = userSessions;

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
              {nextSession.name} starts {nextSession.day} · {nextSession.time} {zoneShort(effUserZone, nextSession.dt)}
            </div>
          )}
          <Countdown target={target} />
        </div>

        <div style={{ minWidth: 0 }}>
          {(() => {
            // Grid template shared by the column header and every row. Time
            // columns use fixed widths (not `auto`) so the header and each row -
            // separate grid containers - resolve identical tracks and line up.
            // Order: num, name, weather, your time[, track] - the time columns
            // sit last so they're flush to the right edge (weather tucks in
            // before them rather than pushing them left). Two time columns once
            // the visitor's zone is known; a single one before that (SSR).
            const cols = twoTz
              ? (mob ? '26px minmax(0,1fr) 22px 78px 70px' : '44px minmax(0,1fr) 52px 100px 92px')
              : (mob ? '28px minmax(0,1fr) 22px 78px' : '46px minmax(0,1fr) 56px 100px');
            return (
          <div style={{ minWidth: 0 }}>
          <div style={{ marginBottom: 8 }}>
            <span className="t-eyebrow">Session Schedule</span>
          </div>
          <div style={{ border: '1px solid var(--line-1)', background: 'var(--bg-2)', minWidth: 0 }} className={`next-race-sessions${twoTz ? '' : ' single-tz'}`}>
            <div style={{
              display: 'grid', gridTemplateColumns: cols,
              gap: mob ? 8 : 12, padding: mob ? '7px 12px' : '7px 14px', alignItems: 'center',
              borderBottom: '1px solid var(--line-1)', background: 'var(--bg-1)',
            }}>
              <span></span>
              <span className="t-mono" style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}></span>
              <span></span>
              <span className="t-mono" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: 10, color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1.25 }}>
                <span>{twoTz ? 'Your time' : 'Local'}</span>
                <span style={{ color: 'var(--fg-4)', fontWeight: 400 }}>({zoneShort(effUserZone, raceDt)})</span>
              </span>
              {twoTz && (
                <span className="t-mono" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1.25 }}>
                  <span>Track</span>
                  <span style={{ color: 'var(--fg-4)', fontWeight: 400 }}>({zoneShort(trackZone, raceDt)})</span>
                </span>
              )}
            </div>
            {sessions.map((s, i) => {
              const ts = trackSessions[i];
              const { forecast, isClimate } = sessionWeather(D, next, s.id);
              const isExpanded = expandedSessionId === s.id;
              return (
                <div key={s.id} style={{ minWidth: 0 }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: cols,
                    gap: mob ? 8 : 12, padding: mob ? '10px 12px' : '10px 14px', alignItems: 'center',
                    borderBottom: (isExpanded || i < sessions.length - 1) ? '1px solid var(--line-1)' : '0',
                    background: nextSession && s.id === nextSession.id ? 'rgba(232,0,45,0.04)' : 'transparent',
                  }}>
                    <span className="t-mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{String(i + 1).padStart(2, '0')}</span>
                    <span style={{ fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{s.name}</span>
                    <SessionWeatherCell
                      forecast={forecast}
                      isClimate={isClimate}
                      useFahrenheit={useF}
                      expanded={isExpanded}
                      mob={mob}
                      onClick={() => toggleExpand(s.id)}
                    />
                    {/* Your local time - the prominent column */}
                    <span className="t-mono" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 11, color: 'var(--fg-3)', marginRight: 6 }}>{s.day}</span>
                      <span style={{ fontSize: 14, color: 'var(--fg-1)', fontWeight: 700 }}>{s.time}</span>
                    </span>
                    {/* Track local time - secondary, dimmed */}
                    {twoTz && (
                      <span className="t-mono" style={{ textAlign: 'right', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--fg-3)' }}>
                        <span style={{ marginRight: 5 }}>{ts.day}</span>{ts.time}
                      </span>
                    )}
                  </div>
                  {isExpanded && forecast && (
                    <SessionWeatherExpand forecast={forecast} isClimate={isClimate} useFahrenheit={useF} timeZone={effUserZone} />
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
            {twoTz
              ? <>Your time: {userZone} ({zoneShort(effUserZone, raceDt)}) · Track: {(D.circuits[next.circuit] && D.circuits[next.circuit].city) || 'circuit'} ({zoneShort(trackZone, raceDt)})</>
              : <>Times in track local time ({zoneShort(trackZone, raceDt)})</>}
          </div>
          </div>
            );
          })()}
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

export default function HomeScreen({ data }) {
  const D = data;
  const mob = useIsMobile();
  const standings = useMemo(() => D.computeStandings(), [D]);

  // Empty bundle (fresh clone / pre-cron) - render a placeholder rather than
  // pretend to have results. Hook order stays stable: standings is computed
  // unconditionally above (safely returns empty arrays for empty data).
  if (D._empty) return <EmptyHome mob={mob} />;

  const cal = D.calendar;

  // "Next race" = first race whose results aren't in the bundle yet. Presence
  // in `results` is the canonical "race has run" signal across the app, so the
  // race weekend currently in progress stays the hero until it's actually been
  // run - even on race-day morning, or after midnight while results still lag.
  // (Trusting the bundle's precomputed `status` string, or a bare date >= today
  // check, would prematurely flip the hero to the following round.) A season is
  // "historic" iff every round has results.
  const next = cal.find(r => !D.results[r.round]) || null;
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
