// Home / Dashboard screen — adapted from the prototype, links via urlFor()

const { useMemo } = React;

function HomeScreen() {
  const D = window.F1_DATA;
  const mob = useIsMobile();
  const standings = useMemo(() => D.computeStandings(), []);
  const cal = D.calendar;

  // Next race = the calendar entry flagged 'next', or fall back
  const next = cal.find(r => r.status === 'next') || cal[6];
  // Latest completed race we actually have results for (rate-limited fetches
  // can leave a 'completed' race without a result entry).
  const prev = [...cal].reverse().find(r => r.status === 'completed' && D.results[r.round]);

  // Countdown target: a fake offset to keep it lively
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
      <div className="panel" style={{ position: 'relative', overflow: 'hidden' }}>
        <div className="kbd-corner kbd-tl"></div>
        <div className="kbd-corner kbd-tr"></div>
        <div className="kbd-corner kbd-bl"></div>
        <div className="kbd-corner kbd-br"></div>
        <div style={{ padding: mob ? 16 : 24, display: 'grid', gridTemplateColumns: mob ? '1fr' : '1fr 1fr', gap: mob ? 20 : 32 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span className="t-eyebrow" style={{ color: 'var(--accent)' }}>Next Race</span>
              <span style={{ flex: 1, height: 1, background: 'var(--line-1)' }}></span>
              <span className="t-eyebrow">Round {String(next.round).padStart(2, '0')}/24</span>
              {next.sprint && <SprintBadge />}
            </div>
            <div className="t-display" style={{ fontSize: mob ? 38 : 56, marginBottom: 6 }}>
              {next.name.replace(' Grand Prix', '')}<span style={{ color: 'var(--accent)' }}>.</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--fg-2)', marginBottom: 16 }}>
              <span style={{ fontSize: 20 }}>{next.flag}</span>
              <span className="t-mono" style={{ fontSize: 13 }}>{D.circuits[next.circuit].name.toUpperCase()}</span>
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

      <SectionHead title="Season Summary" />
      <div className="grid" style={{ gridTemplateColumns: mob ? '1fr' : 'repeat(3, 1fr)' }}>
        <SummaryWidget kicker="Drivers' Leader"
          driver={leader.driver}
          big={`${leader.points} pts`}
          sub={`+${leader.points - p2.points} over ${p2.driver.last}`}
          href={urlFor({ name: 'driver', id: leader.driver.id })}
        />
        <SummaryWidget kicker="Constructors' Leader"
          team={teamLeader.team}
          big={`${teamLeader.points} pts`}
          sub={`${teamLeader.wins} wins · ${teamLeader.podiums} podiums`}
          href={urlFor({ name: 'standings-c' })}
        />
        {lastRace && lastWinner ? (
          <SummaryWidget kicker="Last Race"
            driver={lastWinner}
            big={`P1`}
            sub={`${lastRace.name.replace(' Grand Prix', '')} · ${lastWinnerTeam.name}`}
            href={urlFor({ name: 'race', round: lastRace.round })}
          />
        ) : (
          <SummaryWidget kicker="Last Race"
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
             href={urlFor({ name: 'driver', id: row.driver.id })}>
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

function SummaryWidget({ kicker, driver, team, big, sub, href }) {
  const D = window.F1_DATA;
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
              <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 2 }}>{(window.F1_DATA && window.F1_DATA.seasonYear) || '2026'} Constructors</div>
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

window.HomeScreen = HomeScreen;
