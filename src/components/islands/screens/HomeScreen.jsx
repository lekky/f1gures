// Home / Dashboard. Ported from js/screens/home.jsx.
// All `window.F1_DATA` reads → `data` prop. Recharts unused on this screen.

import { useMemo } from 'react';
import {
  SectionHead, SprintBadge, Countdown, useIsMobile, urlFor, navigate, fmtDateLong,
} from '../../../lib/shared.jsx';

function SummaryWidget({ data, kicker, driver, team, big, sub, href }) {
  const D = data;
  const accent = driver ? D.teamById(driver.team).color : (team ? team.color : 'var(--accent)');
  return (
    <a className="panel" style={{ borderLeft: `3px solid ${accent}`, cursor: 'pointer', textDecoration: 'none', color: 'inherit', display: 'block' }} href={href}>
      <div className="panel-body">
        <div className="t-eyebrow" style={{ color: 'var(--fg-3)', marginBottom: 8 }}>{kicker}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          {driver && (
            <>
              <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 30, lineHeight: 1, color: 'var(--fg-3)' }}>{driver.num}</div>
              <div>
                <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 22, lineHeight: 1, textTransform: 'uppercase' }}>{driver.first} {driver.last}</div>
                <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 2 }}>{driver.flag} {D.teamById(driver.team).name}</div>
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

function NextRacePanel({ data, cal, mob }) {
  const D = data;
  const next = cal.find(r => r.status === 'next') || cal[0];

  const target = useMemo(() => {
    const offset = 9 * 86400000 + 4 * 3600000 + 22 * 60000;
    return new Date(Date.now() + offset);
  }, [next.date]);

  let sessions = [
    { id: 'fp1', name: 'Practice 1', day: 'Fri', time: '11:30' },
    { id: 'fp2', name: 'Practice 2', day: 'Fri', time: '15:00' },
    { id: 'fp3', name: 'Practice 3', day: 'Sat', time: '10:30' },
    { id: 'q',   name: 'Qualifying', day: 'Sat', time: '14:00' },
    { id: 'r',   name: 'Race',       day: 'Sun', time: '14:00' },
  ];
  if (next.sprint) {
    sessions = [
      { id: 'fp1', name: 'Practice 1',   day: 'Fri', time: '11:30' },
      { id: 'sq',  name: 'Sprint Quali', day: 'Fri', time: '15:30' },
      { id: 'sp',  name: 'Sprint',       day: 'Sat', time: '11:00' },
      { id: 'q',   name: 'Qualifying',   day: 'Sat', time: '15:00' },
      { id: 'r',   name: 'Race',         day: 'Sun', time: '14:00' },
    ];
  }

  return (
    <div className="panel" style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer' }}
         onClick={() => navigate({ name: 'race', round: next.round })}>
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
            <span style={{ fontSize: 20 }}>{next.flag}</span>
            <span className="t-mono" style={{ fontSize: 13 }}>{D.circuits[next.circuit] && D.circuits[next.circuit].name.toUpperCase()}</span>
            <span style={{ color: 'var(--fg-4)' }}>·</span>
            <span className="t-mono" style={{ fontSize: 13 }}>{fmtDateLong(next.date)}</span>
          </div>
          <Countdown target={target} />
        </div>

        <div>
          <div className="t-eyebrow" style={{ marginBottom: 10 }}>Session Schedule</div>
          <div style={{ border: '1px solid var(--line-1)' }}>
            {sessions.map((s, i) => (
              <div key={s.id} style={{
                display: 'grid', gridTemplateColumns: '50px 1fr auto auto',
                gap: 12, padding: '10px 14px', alignItems: 'center',
                borderBottom: i < sessions.length - 1 ? '1px solid var(--line-1)' : '0',
                background: i === sessions.length - 1 ? 'rgba(232,0,45,0.04)' : 'transparent',
              }}>
                <span className="t-mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{s.name}</span>
                <span className="t-mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{s.day}</span>
                <span className="t-mono" style={{ fontSize: 12, color: 'var(--fg-1)' }}>{s.time}</span>
              </div>
            ))}
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
                <span style={{ fontSize: 20 }}>{champ.driver.flag}</span>
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
  const cal = D.calendar;

  const isHistoric = !cal.some(r => r.status === 'next') && cal.some(r => D.results[r.round]);
  const prev = [...cal].reverse().find(r => r.status === 'completed' && D.results[r.round]);

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
      {isHistoric ? <SeasonAtGlance data={D} cal={cal} standings={standings} mob={mob} /> : <NextRacePanel data={D} cal={cal} mob={mob} />}

      <SectionHead title="Season Summary" />
      <div className="grid" style={{ gridTemplateColumns: mob ? '1fr' : 'repeat(3, 1fr)' }}>
        <SummaryWidget data={D} kicker="Drivers' Leader"
          driver={leader.driver}
          big={`${leader.points} pts`}
          sub={`+${leader.points - p2.points} over ${p2.driver.last}`}
          href={urlFor({ name: 'driver', id: leader.driver.id, ref: leader.driver.jolpicaId })}
        />
        <SummaryWidget data={D} kicker="Constructors' Leader"
          team={teamLeader.team}
          big={`${teamLeader.points} pts`}
          sub={`${teamLeader.wins} wins · ${teamLeader.podiums} podiums`}
          href={urlFor({ name: 'standings-c' })}
        />
        {lastRace && lastWinner ? (
          <SummaryWidget data={D} kicker="Last Race"
            driver={lastWinner}
            big={`P1`}
            sub={`${lastRace.name.replace(' Grand Prix', '')} · ${lastWinnerTeam.name}`}
            href={urlFor({ name: 'race', round: lastRace.round })}
          />
        ) : (
          <SummaryWidget data={D} kicker="Last Race"
            big="—"
            sub="No results yet"
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
            <div className="meta">
              <div className="name">{row.driver.last}</div>
              <div className="team">{D.teamById(row.driver.team).short} · {row.driver.flag}</div>
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
