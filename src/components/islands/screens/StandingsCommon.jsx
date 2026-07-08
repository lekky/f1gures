// Shared bits between DriverStandingsScreen and ConstructorStandingsScreen.
// Includes the type toggle, points-progression chart, head-to-head card.
// Recharts is imported from npm (not window.Recharts UMD).

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Panel, urlFor, Flag } from '../../../lib/shared.jsx';

export function StandingsTypeToggle({ active }) {
  return (
    <div className="standings-toggle" role="group" aria-label="Standings type">
      <a className={`standings-toggle-opt ${active === 'd' ? 'active' : ''}`}
         href={urlFor({ name: 'standings-d' })} aria-current={active === 'd' ? 'page' : undefined}>
        Drivers
      </a>
      <a className={`standings-toggle-opt ${active === 'c' ? 'active' : ''}`}
         href={urlFor({ name: 'standings-c' })} aria-current={active === 'c' ? 'page' : undefined}>
        Constructors
      </a>
      <a className={`standings-toggle-opt ${active === 'r' ? 'active' : ''}`}
         href={urlFor({ name: 'records' })} aria-current={active === 'r' ? 'page' : undefined}>
        Records
      </a>
    </div>
  );
}

export function PointsChart({ data, series, drivers, height = 320 }) {
  const D = data;
  if (!drivers.length || !series[drivers[0].id]) return null;
  const cal = D.calendar;
  const rounds = series[drivers[0].id].map(p => p.round);
  // Key rows/lines by driver id, not code - codes collide for shared
  // surnames (1962: Graham Hill + Phil Hill are both "HIL") and the second
  // write would clobber the first. `name` keeps the code as the label.
  const chartData = rounds.map((r, i) => {
    const calEntry = cal.find(c => c.round === r);
    const row = { round: `R${r}`, name: calEntry ? calEntry.name.replace(' Grand Prix', '').slice(0, 6) : `R${r}` };
    drivers.forEach(d => { row[d.id] = series[d.id][i].points; });
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
            <Line key={d.id} type="monotone" dataKey={d.id} name={d.code}
                  stroke={D.teamById(d.team).color} strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 0, fill: D.teamById(d.team).color }}
                  activeDot={{ r: 5 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TeamProgressionChart({ progression, teams, height = 360 }) {
  if (!teams.length || !progression[teams[0].team.id]) return null;
  const rounds = progression[teams[0].team.id].map(p => p.round);
  // Key by team id - `short` collides historically (1961: Cooper-Climax and
  // Cooper-Maserati are both "COO"). `name` keeps short as the label.
  const chartData = rounds.map((r, i) => {
    const row = { round: `R${r}` };
    teams.forEach(t => { row[t.team.id] = progression[t.team.id][i].points; });
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
            <Line key={t.team.id} type="monotone" dataKey={t.team.id} name={t.team.short}
                  stroke={t.team.color} strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 0, fill: t.team.color }}
                  activeDot={{ r: 5 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function DriverPicker({ data, label, value, onChange }) {
  const DD = data;
  return (
    <div>
      <div className="t-eyebrow" style={{ marginBottom: 6 }}>{label}</div>
      <select className="sel" style={{ width: '100%' }} value={value} onChange={e => onChange(e.target.value)}>
        {DD.drivers.map(d => (
          <option key={d.id} value={d.id}>{d.first} {d.last} · {(DD.teamById(d.team) || { short: '-' }).short}</option>
        ))}
      </select>
    </div>
  );
}

export function HeadToHead({ data, standings }) {
  const DD = data;
  const defaultA = (standings.drivers[0] && standings.drivers[0].driver.id) || (DD.drivers[0] && DD.drivers[0].id);
  const defaultB = (standings.drivers[1] && standings.drivers[1].driver.id) || (DD.drivers[1] && DD.drivers[1].id) || defaultA;
  const [a, setA] = useState(defaultA);
  const [b, setB] = useState(defaultB);
  // When the year picker swaps the season data in, the previously selected
  // driver ids usually don't exist in the new season - reset to the new
  // season's top two so the card doesn't render "Unknown" placeholders.
  useEffect(() => {
    setA(defaultA);
    setB(defaultB);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [DD.seasonYear]);
  const driverA = DD.driverById(a);
  const driverB = DD.driverById(b);
  const rowA = standings.drivers.find(r => r.driver.id === a) || { points: 0, wins: 0, podiums: 0, poles: 0, fastestLaps: 0, dnfs: 0 };
  const rowB = standings.drivers.find(r => r.driver.id === b) || { points: 0, wins: 0, podiums: 0, poles: 0, fastestLaps: 0, dnfs: 0 };
  const teamA = DD.teamById(driverA.team) || { color: '#888888', short: '-' };
  const teamB = DD.teamById(driverB.team) || { color: '#888888', short: '-' };
  const avgFinish = (id) => {
    const rounds = Object.keys(DD.results).map(Number);
    // Only average races the driver actually appears in - indexOf returns -1
    // for absences, which would otherwise count as position 0 (best possible)
    // and make part-time drivers look superhuman.
    const positions = rounds
      .map(r => (DD.results[r].order || []).indexOf(id) + 1)
      .filter(p => p > 0);
    if (!positions.length) return '-';
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
      <div className="h2h-pickers">
        <DriverPicker data={DD} label="Driver A" value={a} onChange={setA} />
        <DriverPicker data={DD} label="Driver B" value={b} onChange={setB} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center', marginBottom: 18 }}>
        <div style={{ borderLeft: `3px solid ${teamA.color}`, paddingLeft: 12 }}>
          <div className="t-eyebrow"><Flag cc={driverA.country} flag={driverA.flag} /> {teamA.short}</div>
          <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 24, textTransform: 'uppercase' }}>{driverA.first} {driverA.last}</div>
        </div>
        <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 28, color: 'var(--accent)' }}>VS</div>
        <div style={{ borderRight: `3px solid ${teamB.color}`, paddingRight: 12, textAlign: 'right' }}>
          <div className="t-eyebrow">{teamB.short} <Flag cc={driverB.country} flag={driverB.flag} /></div>
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
