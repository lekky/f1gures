// Driver and Constructor standings — adapted from the prototype.

function DriverStandingsScreen() {
  const DD = window.F1_DATA;
  const mob = useIsMobile();
  const standings = React.useMemo(() => DD.computeStandings(), []);
  const [sortKey, setSortKey] = React.useState('position');
  const [sortDir, setSortDir] = React.useState('asc');

  const sorted = React.useMemo(() => {
    const arr = [...standings.drivers];
    arr.sort((a, b) => {
      let av, bv;
      switch (sortKey) {
        case 'position': av = a.position; bv = b.position; break;
        case 'driver': av = a.driver.last; bv = b.driver.last; break;
        case 'team': av = DD.teamById(a.driver.team).name; bv = DD.teamById(b.driver.team).name; break;
        case 'points': av = a.points; bv = b.points; break;
        case 'wins': av = a.wins; bv = b.wins; break;
        case 'podiums': av = a.podiums; bv = b.podiums; break;
        case 'fastest': av = a.fastestLaps; bv = b.fastestLaps; break;
        default: av = a.position; bv = b.position;
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [standings, sortKey, sortDir]);

  const toggleSort = (k) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'driver' || k === 'team' ? 'asc' : 'desc'); }
  };
  const SortInd = ({ k }) => sortKey === k ? <span className="sort-ind">{sortDir === 'asc' ? '▲' : '▼'}</span> : null;

  return (
    <div className={`page ${mob ? 'page-mob' : ''}`}>
      <div className="page-head">
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 6 }}>{(window.F1_DATA && window.F1_DATA.seasonYear) || '2026'} World Championship</div>
          <h1 className="page-title">Driver Standings</h1>
          <div className="page-sub">After Round {standings.lastRound} · {(DD.calendar.find(r => r.round === standings.lastRound) || {}).name}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm">Export CSV</button>
        </div>
      </div>

      <Panel tight>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort('position')}>Pos<SortInd k="position" /></th>
                <th>Δ</th>
                <th className="sortable" onClick={() => toggleSort('driver')}>Driver<SortInd k="driver" /></th>
                <th className="sortable" onClick={() => toggleSort('team')}>Team<SortInd k="team" /></th>
                <th className="right sortable" onClick={() => toggleSort('points')}>Pts<SortInd k="points" /></th>
                <th className="right sortable" onClick={() => toggleSort('wins')}>W<SortInd k="wins" /></th>
                <th className="right sortable" onClick={() => toggleSort('podiums')}>Pod<SortInd k="podiums" /></th>
                <th className="right sortable" onClick={() => toggleSort('fastest')}>FL<SortInd k="fastest" /></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(row => {
                const team = DD.teamById(row.driver.team);
                return (
                  <tr key={row.driver.id} className="clickable" onClick={() => navigate({ name: 'driver', id: row.driver.id })}>
                    <td><div className={`pos pos-${row.position}`}>{row.position}</div></td>
                    <td><ChangeIndicator change={row.change} /></td>
                    <td><DriverCell driver={row.driver} /></td>
                    <td>{team ? team.name : '—'}</td>
                    <td className="right num"><strong style={{ fontFamily: 'var(--f-display)', fontSize: 16 }}>{row.points}</strong></td>
                    <td className="right num">{row.wins}</td>
                    <td className="right num">{row.podiums}</td>
                    <td className="right num">{row.fastestLaps}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <SectionHead title="Points Progression" />
      <Panel>
        <PointsChart series={standings.progression} drivers={standings.drivers.slice(0, 8).map(r => r.driver)} />
      </Panel>

      <SectionHead title="Head-to-Head" />
      <HeadToHead standings={standings} mob={mob} />
    </div>
  );
}

function PointsChart({ series, drivers, height = 320 }) {
  const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = window.Recharts;
  const D = window.F1_DATA;
  const cal = D.calendar;
  const rounds = series[drivers[0].id].map(p => p.round);
  const chartData = rounds.map((r, i) => {
    const row = { round: `R${r}`, name: cal.find(c => c.round === r).name.replace(' Grand Prix', '').slice(0, 6) };
    drivers.forEach(d => { row[d.code] = series[d.id][i].points; });
    return row;
  });
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="#1f2024" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="round" stroke="#75767b" tickLine={false} axisLine={{ stroke: '#2a2c32' }} />
          <YAxis stroke="#75767b" tickLine={false} axisLine={{ stroke: '#2a2c32' }} />
          <Tooltip contentStyle={{ background: '#15161a', border: '1px solid #2a2c32' }} />
          <Legend />
          {drivers.map(d => (
            <Line key={d.id} type="monotone" dataKey={d.code}
                  stroke={D.teamById(d.team).color} strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 0, fill: D.teamById(d.team).color }}
                  activeDot={{ r: 5 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function HeadToHead({ standings, mob }) {
  const DD = window.F1_DATA;
  // Default to top 2 in current standings — historic seasons don't have NOR/VER.
  const defaultA = (standings.drivers[0] && standings.drivers[0].driver.id) || DD.drivers[0]?.id;
  const defaultB = (standings.drivers[1] && standings.drivers[1].driver.id) || DD.drivers[1]?.id || defaultA;
  const [a, setA] = React.useState(defaultA);
  const [b, setB] = React.useState(defaultB);
  const driverA = DD.driverById(a);
  const driverB = DD.driverById(b);
  const rowA = standings.drivers.find(r => r.driver.id === a) || { points: 0, wins: 0, podiums: 0, poles: 0, fastestLaps: 0, dnfs: 0 };
  const rowB = standings.drivers.find(r => r.driver.id === b) || { points: 0, wins: 0, podiums: 0, poles: 0, fastestLaps: 0, dnfs: 0 };
  const teamA = DD.teamById(driverA.team) || { color: '#888888', short: '—' };
  const teamB = DD.teamById(driverB.team) || { color: '#888888', short: '—' };
  const avgFinish = (id) => {
    const rounds = Object.keys(DD.results).map(Number);
    const positions = rounds.map(r => DD.results[r].order.indexOf(id) + 1);
    return (positions.reduce((s, p) => s + p, 0) / positions.length).toFixed(1);
  };
  const stats = [
    { lbl: 'Points', a: rowA.points, b: rowB.points },
    { lbl: 'Wins', a: rowA.wins, b: rowB.wins },
    { lbl: 'Podiums', a: rowA.podiums, b: rowB.podiums },
    { lbl: 'Poles', a: rowA.poles, b: rowB.poles },
    { lbl: 'Fastest Laps', a: rowA.fastestLaps, b: rowB.fastestLaps },
    { lbl: 'Avg Finish', a: avgFinish(a), b: avgFinish(b) },
    { lbl: 'DNFs', a: rowA.dnfs, b: rowB.dnfs },
  ];
  return (
    <Panel>
      <div style={{ display: 'grid', gridTemplateColumns: mob ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 18 }}>
        <DriverPicker label="Driver A" value={a} onChange={setA} />
        <DriverPicker label="Driver B" value={b} onChange={setB} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center', marginBottom: 18 }}>
        <div style={{ borderLeft: `3px solid ${teamA.color}`, paddingLeft: 12 }}>
          <div className="t-eyebrow">{driverA.flag} {teamA.short}</div>
          <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 24, textTransform: 'uppercase' }}>{driverA.first} {driverA.last}</div>
        </div>
        <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 28, color: 'var(--accent)' }}>VS</div>
        <div style={{ borderRight: `3px solid ${teamB.color}`, paddingRight: 12, textAlign: 'right' }}>
          <div className="t-eyebrow">{teamB.short} {driverB.flag}</div>
          <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 24, textTransform: 'uppercase' }}>{driverB.first} {driverB.last}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--line-1)' }}>
        {stats.map(s => {
          const numA = parseFloat(s.a);
          const numB = parseFloat(s.b);
          const aWins = s.lbl === 'Avg Finish' ? numA < numB : numA > numB;
          const bWins = s.lbl === 'Avg Finish' ? numB < numA : numB > numA;
          return (
            <div key={s.lbl} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, padding: '10px 14px', background: 'var(--bg-2)', alignItems: 'center' }}>
              <div className="t-mono" style={{ textAlign: 'left', fontSize: 18, fontWeight: 600, color: aWins ? 'var(--fg-1)' : 'var(--fg-3)' }}>{s.a}</div>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--fg-3)', textAlign: 'center', whiteSpace: 'nowrap' }}>{s.lbl}</div>
              <div className="t-mono" style={{ textAlign: 'right', fontSize: 18, fontWeight: 600, color: bWins ? 'var(--fg-1)' : 'var(--fg-3)' }}>{s.b}</div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function DriverPicker({ label, value, onChange }) {
  const DD = window.F1_DATA;
  return (
    <div>
      <div className="t-eyebrow" style={{ marginBottom: 6 }}>{label}</div>
      <select className="sel" style={{ width: '100%' }} value={value} onChange={e => onChange(e.target.value)}>
        {DD.drivers.map(d => (
          <option key={d.id} value={d.id}>{d.first} {d.last} · {(DD.teamById(d.team) || { short: '—' }).short}</option>
        ))}
      </select>
    </div>
  );
}

function ConstructorStandingsScreen() {
  const DD = window.F1_DATA;
  const mob = useIsMobile();
  const standings = React.useMemo(() => DD.computeStandings(), []);
  return (
    <div className={`page ${mob ? 'page-mob' : ''}`}>
      <div className="page-head">
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 6 }}>{(window.F1_DATA && window.F1_DATA.seasonYear) || '2026'} World Championship</div>
          <h1 className="page-title">Constructor Standings</h1>
          <div className="page-sub">After Round {standings.lastRound}</div>
        </div>
      </div>

      <Panel tight>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Pos</th>
                <th>Team</th>
                <th>Drivers</th>
                <th className="right">Points</th>
                <th className="right">Wins</th>
                <th className="right">Podiums</th>
              </tr>
            </thead>
            <tbody>
              {standings.teams.map(row => (
                <tr key={row.team.id} className="clickable"
                    onClick={() => navigate({ name: 'team', id: row.team.id })}>
                  <td><div className={`pos pos-${row.position}`}>{row.position}</div></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 4, height: 24, background: row.team.color }}></span>
                      <span style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 16, textTransform: 'uppercase' }}>{row.team.name}</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {row.drivers.map(d => (
                        <span key={d.id} className="driver-chip" style={{ '--team-color': row.team.color }}>{d.code}</span>
                      ))}
                    </div>
                  </td>
                  <td className="right num"><strong style={{ fontFamily: 'var(--f-display)', fontSize: 18 }}>{row.points}</strong></td>
                  <td className="right num">{row.wins}</td>
                  <td className="right num">{row.podiums}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <SectionHead title="Constructor Points Progression" />
      <Panel>
        <TeamProgressionChart progression={standings.teamProgression} teams={standings.teams} />
      </Panel>
    </div>
  );
}

function TeamProgressionChart({ progression, teams, height = 360 }) {
  const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = window.Recharts;
  const rounds = progression[teams[0].team.id].map(p => p.round);
  const chartData = rounds.map((r, i) => {
    const row = { round: `R${r}` };
    teams.forEach(t => { row[t.team.short] = progression[t.team.id][i].points; });
    return row;
  });
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="#1f2024" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="round" stroke="#75767b" tickLine={false} axisLine={{ stroke: '#2a2c32' }} />
          <YAxis stroke="#75767b" tickLine={false} axisLine={{ stroke: '#2a2c32' }} />
          <Tooltip contentStyle={{ background: '#15161a', border: '1px solid #2a2c32' }} />
          <Legend />
          {teams.map(t => (
            <Line key={t.team.id} type="monotone" dataKey={t.team.short}
                  stroke={t.team.color} strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 0, fill: t.team.color }}
                  activeDot={{ r: 5 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

window.DriverStandingsScreen = DriverStandingsScreen;
window.ConstructorStandingsScreen = ConstructorStandingsScreen;
