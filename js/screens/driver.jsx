// Driver Profile screen — driver id read from ?id=

function DriverProfileScreen() {
  const F_drv = window.F1_DATA;
  const mob = useIsMobile();
  const standings = React.useMemo(() => F_drv.computeStandings(), []);

  const id = getParam('id');
  const driver = F_drv.driverById(id);

  if (!driver) {
    return (
      <div className={`page ${mob ? 'page-mob' : ''}`}>
        <Panel><div style={{ padding: 24 }}>Driver not found.</div></Panel>
      </div>
    );
  }

  const team = F_drv.teamById(driver.team);
  const row = standings.drivers.find(r => r.driver.id === id);

  // Career stats — always pulled live from Jolpica via window.F1_API.fetchDriverCareer.
  // Cached per-endpoint (1 h TTL) by api.js. While loading or on error, cells show '—'.
  const [career, setCareer] = React.useState(null);
  const [careerErr, setCareerErr] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    setCareer(null); setCareerErr(false);
    const jId = driver && driver.jolpicaId;
    if (!jId || !(window.F1_API && window.F1_API.fetchDriverCareer)) {
      setCareerErr(true);
      return;
    }
    // Wait for the season boot fetches (~10 calls) to finish before fanning out
    // career calls — otherwise we share concurrency with boot and trip 429s.
    Promise.resolve(window.F1_READY)
      .then(() => window.F1_API.fetchDriverCareer(jId))
      .then(c => { if (!cancelled) setCareer(c); })
      .catch(err => {
        if (cancelled) return;
        console.warn('[f1gures] career fetch failed for', jId, err);
        setCareerErr(true);
      });
    return () => { cancelled = true; };
  }, [driver && driver.jolpicaId]);
  const careerVal = (key) => {
    if (career) return career[key];
    if (careerErr) return '—';
    return '…';
  };

  // Round-by-round results
  const rounds = F_drv.calendar.map(race => {
    const r = F_drv.results[race.round];
    if (!r) return { race, status: 'pending' };
    const finishPos = r.order.indexOf(id) + 1;
    const gridPos = r.grid.indexOf(id) + 1;
    const isDnf = (r.dnfs || []).includes(id);
    const pts = isDnf ? 0 : (finishPos <= 10 ? F_drv.POINTS[finishPos - 1] + (id === r.fastest ? 1 : 0) : 0);
    return { race, gridPos, finishPos, pts, status: isDnf ? 'DNF' : 'Finished' };
  });

  return (
    <div className={`page ${mob ? 'page-mob' : ''}`}>
      <a className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} href={urlFor({ name: 'standings-d' })}>← Standings</a>

      <div className="panel" style={{ position: 'relative', overflow: 'hidden', marginBottom: 20, borderLeft: `3px solid ${team.color}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: mob ? '1fr' : '220px 1fr auto', gap: 20, padding: mob ? 16 : 20, alignItems: 'center' }}>
          <DriverSilhouette driver={driver} height={mob ? 180 : 220} />
          <div>
            <div className="t-eyebrow" style={{ color: team.color, marginBottom: 6 }}>{driver.flag} {team.name.toUpperCase()}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <h1 className="page-title" style={{ fontSize: mob ? 36 : 56 }}>{driver.first} {driver.last}</h1>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8, color: 'var(--fg-3)' }}>
              <span className="t-mono" style={{ fontSize: 13 }}>#{driver.num}</span>
              <span style={{ color: 'var(--fg-4)' }}>·</span>
              <span className="t-mono" style={{ fontSize: 13 }}>{driver.code}</span>
              <span style={{ color: 'var(--fg-4)' }}>·</span>
              <span className="t-mono" style={{ fontSize: 13 }}>{driver.country}</span>
            </div>
          </div>
          <div style={{ textAlign: mob ? 'left' : 'right' }}>
            <div className="t-eyebrow">Championship</div>
            <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 64, lineHeight: 1, color: row.position <= 3 ? 'var(--accent)' : 'var(--fg-1)' }}>P{row.position}</div>
            <div className="t-mono" style={{ fontSize: 13, color: 'var(--fg-2)' }}>{row.points} PTS</div>
          </div>
        </div>
      </div>

      <SectionHead title="Career Stats" />
      <div className="grid" style={{ gridTemplateColumns: mob ? 'repeat(2, 1fr)' : 'repeat(7, 1fr)' }}>
        <div className="stat"><div className="stat-lbl">Seasons</div><div className="stat-val">{careerVal('seasons')}</div></div>
        <div className="stat"><div className="stat-lbl">Races</div><div className="stat-val">{careerVal('races')}</div></div>
        <div className="stat"><div className="stat-lbl">Wins</div><div className="stat-val">{careerVal('wins')}</div></div>
        <div className="stat"><div className="stat-lbl">Podiums</div><div className="stat-val">{careerVal('podiums')}</div></div>
        <div className="stat"><div className="stat-lbl">Poles</div><div className="stat-val">{careerVal('poles')}</div></div>
        <div className="stat"><div className="stat-lbl">Fastest Laps</div><div className="stat-val">{careerVal('fl')}</div></div>
        <div className="stat" style={{ borderColor: career && career.champs ? 'var(--accent)' : 'var(--line-1)' }}><div className="stat-lbl" style={{ color: career && career.champs ? 'var(--accent)' : undefined }}>WDC</div><div className="stat-val" style={{ color: career && career.champs ? 'var(--accent)' : undefined }}>{careerVal('champs')}</div></div>
      </div>

      <SectionHead title={((window.F1_DATA && window.F1_DATA.seasonYear) || '2026') + ' Season'} />
      <div className="grid" style={{ gridTemplateColumns: mob ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)' }}>
        <div className="stat"><div className="stat-lbl">Points</div><div className="stat-val">{row.points}</div></div>
        <div className="stat"><div className="stat-lbl">Wins</div><div className="stat-val">{row.wins}</div></div>
        <div className="stat"><div className="stat-lbl">Podiums</div><div className="stat-val">{row.podiums}</div></div>
        <div className="stat"><div className="stat-lbl">Poles</div><div className="stat-val">{row.poles}</div></div>
        <div className="stat"><div className="stat-lbl">DNFs</div><div className="stat-val">{row.dnfs}</div></div>
      </div>

      <SectionHead title="Round by Round" />
      <Panel tight>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Rd</th><th>Race</th><th className="center">Grid</th><th className="center">Finish</th><th>Δ</th><th className="right">Pts</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rounds.map(r => (
                <tr key={r.race.round} className={r.status === 'pending' ? '' : 'clickable'}
                    onClick={() => r.status !== 'pending' && navigate({ name: 'race', round: r.race.round })}
                    style={{ opacity: r.status === 'pending' ? 0.5 : 1 }}>
                  <td className="num t-mono" style={{ color: 'var(--fg-3)' }}>{String(r.race.round).padStart(2,'0')}</td>
                  <td><span style={{ marginRight: 6 }}>{r.race.flag}</span><span style={{ fontFamily: 'var(--f-display)', fontWeight: 600, textTransform: 'uppercase', fontSize: 13, letterSpacing: '0.06em' }}>{r.race.name.replace(' Grand Prix', '')}</span></td>
                  <td className="num center">{r.gridPos || '—'}</td>
                  <td className="num center"><strong style={{ fontFamily: 'var(--f-display)', fontSize: 15 }}>{r.finishPos || '—'}</strong></td>
                  <td>{r.gridPos ? <ChangeIndicator change={r.gridPos - r.finishPos} /> : <span className="chg flat">—</span>}</td>
                  <td className="right num"><strong>{r.pts || '—'}</strong></td>
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

window.DriverProfileScreen = DriverProfileScreen;
