// Team Profile screen — team id read from ?id=

function TeamProfileScreen() {
  const F = window.F1_DATA;
  const mob = useIsMobile();
  const standings = React.useMemo(() => F.computeStandings(), []);

  const id = getParam('id');
  const team = F.teamById(id);
  const row = standings.teams.find(r => r.team.id === id);

  useSeo({
    title: team && team.name !== '—'
      ? `${team.name} — F1 Team Profile, Drivers & 2026 Form | f1gures`
      : 'F1 Team Profile — Constructor History | f1gures',
    description: team && team.name !== '—'
      ? `${team.name} Formula 1 team: drivers, points, wins, podiums and 2026 season trajectory in the Constructors' Championship.`
      : 'Formula 1 team profiles: constructor titles, race wins, drivers and 2026 season performance.',
    canonicalPath: id ? `/team.html?id=${encodeURIComponent(id)}` : '/team.html',
    ogType: 'article',
    jsonLd: team && team.name !== '—' ? {
      '@context': 'https://schema.org',
      '@type': 'SportsTeam',
      'name': team.name,
      'sport': 'Formula 1',
      'url': `https://f1gures.app/team.html?id=${encodeURIComponent(id)}`
    } : null
  });

  if (!team || team.name === '—' || !row) {
    return (
      <div className={`page ${mob ? 'page-mob' : ''}`}>
        <Panel><div style={{ padding: 24 }}>Team not found.</div></Panel>
      </div>
    );
  }

  // Per-driver rows for this team in current standings
  const teamDrivers = standings.drivers.filter(r => r.driver.team === id);

  // Total DNFs across the team's drivers
  const totalDnfs = teamDrivers.reduce((s, r) => s + (r.dnfs || 0), 0);

  // Round-by-round team points (combined from both drivers)
  const rounds = F.calendar.map(race => {
    const r = F.results[race.round];
    if (!r) return { race, status: 'pending', pts: null };
    const pts = teamDrivers.reduce((sum, d) => {
      const det = r.detail && r.detail[d.driver.id];
      if (det && typeof det.points === 'number') return sum + det.points;
      return sum;
    }, 0);
    return { race, pts, status: 'completed' };
  });

  return (
    <div className={`page ${mob ? 'page-mob' : ''}`}>
      <a className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} href={urlFor({ name: 'standings-c' })}>← Standings</a>

      <div className="panel" style={{ position: 'relative', overflow: 'hidden', marginBottom: 20, borderLeft: `3px solid ${team.color}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: mob ? '1fr' : '1fr auto', gap: 20, padding: mob ? 16 : 20, alignItems: 'center' }}>
          <div>
            <div className="t-eyebrow" style={{ color: team.color, marginBottom: 6 }}>{team.short || team.name.toUpperCase()} · CONSTRUCTOR</div>
            <h1 className="page-title" style={{ fontSize: mob ? 36 : 56 }}>{team.name}</h1>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8, color: 'var(--fg-3)', flexWrap: 'wrap' }}>
              {team.nationality && <span className="t-mono" style={{ fontSize: 13 }}>{team.nationality.toUpperCase()}</span>}
              {teamDrivers.length > 0 && (
                <>
                  <span style={{ color: 'var(--fg-4)' }}>·</span>
                  <span className="t-mono" style={{ fontSize: 13 }}>{teamDrivers.map(r => r.driver.code).join(' / ')}</span>
                </>
              )}
            </div>
          </div>
          <div style={{ textAlign: mob ? 'left' : 'right' }}>
            <div className="t-eyebrow">Championship</div>
            <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 64, lineHeight: 1, color: row.position <= 3 ? 'var(--accent)' : 'var(--fg-1)' }}>P{row.position}</div>
            <div className="t-mono" style={{ fontSize: 13, color: 'var(--fg-2)' }}>{row.points} PTS</div>
          </div>
        </div>
      </div>

      <SectionHead title={((window.F1_DATA && window.F1_DATA.seasonYear) || '2026') + ' Season'} />
      <div className="grid" style={{ gridTemplateColumns: mob ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)' }}>
        <div className="stat"><div className="stat-lbl">Points</div><div className="stat-val">{row.points}</div></div>
        <div className="stat"><div className="stat-lbl">Wins</div><div className="stat-val">{row.wins}</div></div>
        <div className="stat"><div className="stat-lbl">Podiums</div><div className="stat-val">{row.podiums}</div></div>
        <div className="stat"><div className="stat-lbl">Drivers</div><div className="stat-val">{teamDrivers.length}</div></div>
        <div className="stat"><div className="stat-lbl">DNFs</div><div className="stat-val">{totalDnfs}</div></div>
      </div>

      <SectionHead title="Drivers" />
      <div className="grid" style={{ gridTemplateColumns: mob ? '1fr' : 'repeat(2, 1fr)' }}>
        {teamDrivers.map(r => (
          <a key={r.driver.id} className="panel" style={{ borderLeft: `3px solid ${team.color}`, cursor: 'pointer', textDecoration: 'none', color: 'inherit', display: 'block' }}
             href={urlFor({ name: 'driver', id: r.driver.id, ref: r.driver.jolpicaId })}>
            <div className="panel-body" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 36, lineHeight: 1, color: 'var(--fg-3)', minWidth: 56, textAlign: 'center' }}>{r.driver.num || '—'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 22, lineHeight: 1, textTransform: 'uppercase' }}>{r.driver.first} {r.driver.last}</div>
                <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 4 }}>{r.driver.flag} {r.driver.code} · P{r.position} · {r.points} pts</div>
              </div>
              <div className="t-mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>
                {r.wins}W · {r.podiums}P · {r.poles}POLE
              </div>
            </div>
          </a>
        ))}
      </div>

      <SectionHead title="Round by Round" />
      <Panel tight>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Rd</th><th>Race</th><th className="right">Team Pts</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rounds.map(r => (
                <tr key={r.race.round} className={r.status === 'pending' ? '' : 'clickable'}
                    onClick={() => r.status !== 'pending' && navigate({ name: 'race', round: r.race.round })}
                    style={{ opacity: r.status === 'pending' ? 0.5 : 1 }}>
                  <td className="num t-mono" style={{ color: 'var(--fg-3)' }}>{String(r.race.round).padStart(2,'0')}</td>
                  <td><span style={{ marginRight: 6 }}>{r.race.flag}</span><span style={{ fontFamily: 'var(--f-display)', fontWeight: 600, textTransform: 'uppercase', fontSize: 13, letterSpacing: '0.06em' }}>{r.race.name.replace(' Grand Prix', '')}</span></td>
                  <td className="right num"><strong>{r.pts != null ? r.pts : '—'}</strong></td>
                  <td>{r.status === 'pending' ? <span className="pill pill-upcoming">Upcoming</span> : <StatusPill status={r.status} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

window.TeamProfileScreen = TeamProfileScreen;
