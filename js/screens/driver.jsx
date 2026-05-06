// Driver Profile screen — driver id read from ?id=

const F_drv = window.F1_DATA;

function DriverProfileScreen() {
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

  // Career stats (illustrative)
  const careerByDriver = {
    VER: { seasons: 12, races: 224, wins: 64, podiums: 113, poles: 41, fl: 33, champs: 4 },
    HAM: { seasons: 19, races: 367, wins: 105, podiums: 202, poles: 104, fl: 67, champs: 7 },
    LEC: { seasons: 8, races: 152, wins: 9, podiums: 41, poles: 28, fl: 11, champs: 0 },
    NOR: { seasons: 8, races: 148, wins: 12, podiums: 35, poles: 14, fl: 10, champs: 0 },
    ALO: { seasons: 23, races: 415, wins: 32, podiums: 106, poles: 22, fl: 24, champs: 2 },
    PIA: { seasons: 4, races: 76, wins: 6, podiums: 21, poles: 5, fl: 7, champs: 0 },
    RUS: { seasons: 7, races: 144, wins: 4, podiums: 16, poles: 6, fl: 7, champs: 0 },
    SAI: { seasons: 12, races: 228, wins: 4, podiums: 28, poles: 7, fl: 4, champs: 0 },
  };
  const career = careerByDriver[id] || { seasons: 2, races: 28, wins: 0, podiums: 1, poles: 0, fl: 0, champs: 0 };

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
        <div className="stat"><div className="stat-lbl">Seasons</div><div className="stat-val">{career.seasons}</div></div>
        <div className="stat"><div className="stat-lbl">Races</div><div className="stat-val">{career.races}</div></div>
        <div className="stat"><div className="stat-lbl">Wins</div><div className="stat-val">{career.wins}</div></div>
        <div className="stat"><div className="stat-lbl">Podiums</div><div className="stat-val">{career.podiums}</div></div>
        <div className="stat"><div className="stat-lbl">Poles</div><div className="stat-val">{career.poles}</div></div>
        <div className="stat"><div className="stat-lbl">Fastest Laps</div><div className="stat-val">{career.fl}</div></div>
        <div className="stat" style={{ borderColor: career.champs ? 'var(--accent)' : 'var(--line-1)' }}><div className="stat-lbl" style={{ color: career.champs ? 'var(--accent)' : undefined }}>WDC</div><div className="stat-val" style={{ color: career.champs ? 'var(--accent)' : undefined }}>{career.champs}</div></div>
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
