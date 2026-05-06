// Race Detail screen — round read from ?round=N

function RaceDetailScreen() {
  const F_race = window.F1_DATA;
  const mob = useIsMobile();
  const round = parseInt(getParam('round'), 10);
  const race = F_race.calendar.find(r => r.round === round);

  if (!race) {
    return (
      <div className={`page ${mob ? 'page-mob' : ''}`}>
        <Panel><div style={{ padding: 24 }}>Race not found.</div></Panel>
      </div>
    );
  }

  const circuit = F_race.circuits[race.circuit];
  const result = F_race.results[race.round];
  const completed = race.status === 'completed';
  const tabs = race.sprint
    ? [{ id: 'fp1', label: 'FP1' }, { id: 'sq', label: 'Sprint Quali' }, { id: 'sprint', label: 'Sprint' }, { id: 'q', label: 'Qualifying' }, { id: 'race', label: 'Race' }]
    : [{ id: 'fp1', label: 'FP1' }, { id: 'fp2', label: 'FP2' }, { id: 'fp3', label: 'FP3' }, { id: 'q', label: 'Qualifying' }, { id: 'race', label: 'Race' }];
  const [tab, setTab] = React.useState('race');

  return (
    <div className={`page ${mob ? 'page-mob' : ''}`}>
      <a className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} href={urlFor({ name: 'calendar' })}>← Calendar</a>
      <div className="panel" style={{ position: 'relative', overflow: 'hidden', marginBottom: 20 }}>
        <div className="kbd-corner kbd-tl"></div>
        <div className="kbd-corner kbd-tr"></div>
        <div className="kbd-corner kbd-bl"></div>
        <div className="kbd-corner kbd-br"></div>
        <div style={{ padding: mob ? 16 : 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            <span className="t-eyebrow" style={{ color: 'var(--accent)' }}>Round {String(race.round).padStart(2, '0')}</span>
            <span className={`pill pill-${race.status}`}>{race.status}</span>
            {race.sprint && <SprintBadge />}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 28 }}>{race.flag}</span>
            <h1 className="page-title" style={{ fontSize: mob ? 30 : 44 }}>{race.name}</h1>
          </div>
          <div className="t-mono" style={{ fontSize: 13, color: 'var(--fg-3)', marginTop: 6 }}>
            {circuit.name.toUpperCase()} · {fmtDateLong(race.date)}
          </div>
        </div>
        <div className="tabs" style={{ borderTop: '1px solid var(--line-1)' }}>
          {tabs.map(t => (
            <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''} ${!completed && t.id === 'race' ? 'locked' : ''}`}
                    onClick={() => setTab(t.id)}>
              {t.label}
              {!completed && t.id === 'race' && <span className="tab-status">PENDING</span>}
            </button>
          ))}
        </div>
      </div>

      {!completed && (
        <Panel><div style={{ padding: 20, textAlign: 'center', color: 'var(--fg-3)' }}>Results pending — session not yet run.</div></Panel>
      )}

      {completed && tab === 'race' && <RaceResultsTable round={round} race={race} result={result} mob={mob} />}
      {completed && tab === 'q' && <QualifyingTable round={round} result={result} mob={mob} />}
      {completed && (tab === 'fp1' || tab === 'fp2' || tab === 'fp3') && (
        <Panel><div style={{ padding: 24, textAlign: 'center', color: 'var(--fg-3)' }}>{tab.toUpperCase()} timing archived. <button className="btn btn-ghost btn-sm">View Lap Times →</button></div></Panel>
      )}
      {completed && tab === 'sprint' && <SprintResultsTable result={result} mob={mob} />}
      {completed && tab === 'sq' && (
        <Panel><div style={{ padding: 24, textAlign: 'center', color: 'var(--fg-3)' }}>Sprint Qualifying results archived.</div></Panel>
      )}
    </div>
  );
}

function RaceResultsTable({ round, race, result, mob }) {
  const winner = F_race.driverById(result.order[0]);
  const winnerTeam = F_race.teamById(winner.team);
  const fastestDriver = F_race.driverById(result.fastest);
  const poleDriver = F_race.driverById(result.pole);
  const quali = F_race.genQuali(round);

  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: mob ? '1fr' : '1fr 1fr', marginBottom: 16 }}>
        <div className="callout">
          <div className="callout-icon">◈</div>
          <div className="callout-body">
            <div className="callout-lbl">Pole Position</div>
            <div className="callout-driver">{poleDriver.flag} {poleDriver.first} {poleDriver.last}</div>
            <div className="callout-time">{quali[poleDriver.id].q3}</div>
          </div>
        </div>
        <div className="callout">
          <div className="callout-icon">⚡</div>
          <div className="callout-body">
            <div className="callout-lbl">Fastest Lap</div>
            <div className="callout-driver">{fastestDriver.flag} {fastestDriver.first} {fastestDriver.last}</div>
            <div className="callout-time">{F_race.fmtLap(78.5 + Math.random() * 0.4)} · L{Math.floor(40 + Math.random() * 15)}</div>
          </div>
        </div>
      </div>

      <Panel title="Race Result" tight>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Pos</th>
                <th>Grid</th>
                <th>Δ</th>
                <th>Driver</th>
                <th>Team</th>
                <th className="right">Laps</th>
                <th className="right">Time / Gap</th>
                <th className="right">Pts</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {result.order.map((code, i) => {
                const driver = F_race.driverById(code);
                const team = F_race.teamById(driver.team);
                const gridPos = result.grid.indexOf(code) + 1;
                const finishPos = i + 1;
                const delta = gridPos - finishPos;
                const isDnf = result.dnfs.includes(code);
                const points = i < 10 ? F_race.POINTS[i] : 0;
                const fastestBonus = code === result.fastest && finishPos <= 10 ? 1 : 0;
                return (
                  <tr key={code} className="clickable" onClick={() => navigate({ name: 'driver', id: code })}>
                    <td><div className={`pos pos-${finishPos}`}>{isDnf ? '—' : finishPos}</div></td>
                    <td className="num center" style={{ color: 'var(--fg-3)', fontFamily: 'var(--f-mono)' }}>{gridPos}</td>
                    <td><ChangeIndicator change={delta} /></td>
                    <td><DriverCell driver={driver} /></td>
                    <td>{team.name}</td>
                    <td className="right num">{isDnf ? Math.floor(Math.random() * 40) + 10 : 57}</td>
                    <td className="right num t-mono">{isDnf ? '—' : F_race.fmtGap(i, 78.5)}</td>
                    <td className="right num"><strong>{points + fastestBonus || '—'}</strong>{fastestBonus ? <span style={{ color: 'var(--accent)', fontSize: 10, marginLeft: 4 }}>+1</span> : null}</td>
                    <td><StatusPill status={isDnf ? 'DNF' : 'Finished'} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function QualifyingTable({ round, result, mob }) {
  const quali = F_race.genQuali(round);
  return (
    <Panel title="Qualifying" tight>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Driver</th>
              <th>Team</th>
              <th className="right">Q1</th>
              <th className="right">Q2</th>
              <th className="right">Q3</th>
            </tr>
          </thead>
          <tbody>
            {result.grid.map((code, i) => {
              const driver = F_race.driverById(code);
              const team = F_race.teamById(driver.team);
              const q = quali[code];
              return (
                <tr key={code}>
                  <td><div className={`pos pos-${i + 1}`}>{i + 1}</div></td>
                  <td><DriverCell driver={driver} /></td>
                  <td>{team.name}</td>
                  <td className="right num t-mono">{q.q1}</td>
                  <td className="right num t-mono" style={{ color: q.q2 ? 'var(--fg-1)' : 'var(--fg-4)' }}>{q.q2 || '—'}</td>
                  <td className="right num t-mono" style={{ color: q.q3 ? 'var(--fg-1)' : 'var(--fg-4)', fontWeight: i === 0 ? 700 : 400 }}>{q.q3 || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function SprintResultsTable({ result, mob }) {
  const SPRINT_PTS = [8,7,6,5,4,3,2,1];
  return (
    <Panel title="Sprint Result" tight>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Pos</th><th>Driver</th><th>Team</th><th className="right">Time / Gap</th><th className="right">Pts</th></tr>
          </thead>
          <tbody>
            {result.order.slice(0, 12).map((code, i) => {
              const driver = F_race.driverById(code);
              const team = F_race.teamById(driver.team);
              return (
                <tr key={code}>
                  <td><div className={`pos pos-${i + 1}`}>{i + 1}</div></td>
                  <td><DriverCell driver={driver} /></td>
                  <td>{team.name}</td>
                  <td className="right num t-mono">{i === 0 ? '32:14.567' : `+${(i * 1.4 + Math.random()).toFixed(3)}s`}</td>
                  <td className="right num"><strong>{SPRINT_PTS[i] || '—'}</strong></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

window.RaceDetailScreen = RaceDetailScreen;
