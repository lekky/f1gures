// Mobile "bar rows + tap-to-expand" standings pattern.
//
// Each row is a proportional points bar (gap-to-leader reads at a glance);
// tapping a row drops an inline panel with the full stat line (wins / podiums
// / poles / fastest laps), recent form and a profile link. The constructor
// variant additionally lists the team line-up (both drivers, their championship
// position + points) above the form row.
//
// Rendered only <=720px — the wrapper is CSS-gated (.std-barlist) so desktop
// keeps the sortable full table. First row is expanded by default.

import { useState } from 'react';
import {
  Flag, MiniChart, TeamLogo, urlFor,
  driverPointsForRound, teamPointsForRound,
} from '../../../lib/shared.jsx';

function StatCell({ label, value }) {
  return (
    <div className="stdrow-stat">
      <div className="stdrow-stat-num">{value}</div>
      <div className="stdrow-stat-lbl">{label}</div>
    </div>
  );
}

// Points bar: team-coloured fill sized to the leader, points value pinned right.
function Bar({ pct, value }) {
  return (
    <span className="stdrow-bar">
      <span className="stdrow-fill" style={{ width: `${pct}%` }} aria-hidden="true" />
      <span className="stdrow-val">{value}<small>pts</small></span>
    </span>
  );
}

function FormRow({ values, color, gap }) {
  return (
    <div className="stdrow-formrow">
      <span className="stdrow-form-lbl">Form</span>
      <MiniChart values={values} color={color} width={84} height={22} />
      <span className="stdrow-gap">{gap <= 0 ? 'Leader' : `Gap to P1 -${gap}`}</span>
    </div>
  );
}

export function DriverBars({ D, standings, leaderPoints, recentRounds }) {
  const [openId, setOpenId] = useState(
    () => (standings.drivers[0] ? standings.drivers[0].driver.id : null),
  );
  return (
    <div className="std-barlist" role="list">
      {standings.drivers.map(row => {
        const drv = row.driver;
        const team = D.teamById(drv.team);
        const tc = team ? team.color : 'var(--fg-3)';
        const pct = leaderPoints > 0 ? Math.max(2, (row.points / leaderPoints) * 100) : 0;
        const gap = leaderPoints - row.points;
        const isOpen = openId === drv.id;
        const driverHref = urlFor({ name: 'driver', id: drv.id, ref: drv.jolpicaId });
        const panelId = `stdrow-d-${drv.id}`;
        return (
          <div key={drv.id} className={`stdrow ${isOpen ? 'is-open' : ''}`} style={{ '--tc': tc }} role="listitem">
            <button
              type="button" className="stdrow-head" aria-expanded={isOpen} aria-controls={panelId}
              onClick={() => setOpenId(id => (id === drv.id ? null : drv.id))}
            >
              <span className={`stdrow-pos pos-${row.position}`}>{row.position}</span>
              <span className="stdrow-strip" aria-hidden="true" />
              <span className="stdrow-body">
                <span className="stdrow-top">
                  {drv.jolpicaId && (
                    <img
                      className="stdrow-face" src={`/images/drivers/${drv.jolpicaId}.webp`}
                      width={26} height={26} alt="" loading="lazy"
                      onError={e => { e.currentTarget.style.display = 'none'; }}
                    />
                  )}
                  <Flag cc={drv.country} flag={drv.flag} name={drv.nationality} className="stdrow-flag" />
                  <span className="stdrow-name"><span className="first">{drv.first}</span> <b>{drv.last}</b></span>
                  <span className="stdrow-team">{team ? team.name : ''}</span>
                  <span className="stdrow-caret" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                </span>
                <Bar pct={pct} value={row.points} />
              </span>
            </button>
            {isOpen && (
              <div className="stdrow-panel" id={panelId}>
                <div className="stdrow-stats">
                  <StatCell label="Wins" value={row.wins} />
                  <StatCell label="Podiums" value={row.podiums} />
                  <StatCell label="Poles" value={row.poles} />
                  <StatCell label="Fastest" value={row.fastestLaps} />
                </div>
                <FormRow
                  values={recentRounds.map(r => driverPointsForRound(D, drv.id, r.round))}
                  color={tc} gap={gap}
                />
                <a className="stdrow-profile" href={driverHref}>View {drv.last} profile &rarr;</a>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TeamBars({ D, standings, leaderPoints, recentRounds }) {
  const drow = {};
  standings.drivers.forEach(r => { drow[r.driver.id] = r; });
  const [openId, setOpenId] = useState(
    () => (standings.teams[0] ? standings.teams[0].team.id : null),
  );
  return (
    <div className="std-barlist" role="list">
      {standings.teams.map(row => {
        const team = row.team;
        const tc = team.color;
        const pct = leaderPoints > 0 ? Math.max(2, (row.points / leaderPoints) * 100) : 0;
        const gap = leaderPoints - row.points;
        const isOpen = openId === team.id;
        const teamHref = urlFor({ name: 'team', id: team.id, ref: team.id });
        const poles = standings.drivers.reduce((s, r) => (r.driver.team === team.id ? s + (r.poles || 0) : s), 0);
        const fastest = standings.drivers.reduce((s, r) => (r.driver.team === team.id ? s + (r.fastestLaps || 0) : s), 0);
        const lineup = row.drivers
          .map(d => ({ d, r: drow[d.id] }))
          .filter(x => x.r)
          .sort((a, b) => b.r.points - a.r.points);
        const panelId = `stdrow-t-${team.id}`;
        return (
          <div key={team.id} className={`stdrow ${isOpen ? 'is-open' : ''}`} style={{ '--tc': tc }} role="listitem">
            <button
              type="button" className="stdrow-head" aria-expanded={isOpen} aria-controls={panelId}
              onClick={() => setOpenId(id => (id === team.id ? null : team.id))}
            >
              <span className={`stdrow-pos pos-${row.position}`}>{row.position}</span>
              <span className="stdrow-strip" aria-hidden="true" />
              <span className="stdrow-body">
                <span className="stdrow-top">
                  <TeamLogo team={team} size={22} />
                  <span className="stdrow-name stdrow-name-team"><b>{team.name}</b></span>
                  <span className="stdrow-team">{row.wins} Wins &middot; {row.podiums} Pods</span>
                  <span className="stdrow-caret" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                </span>
                <Bar pct={pct} value={row.points} />
              </span>
            </button>
            {isOpen && (
              <div className="stdrow-panel" id={panelId}>
                <div className="stdrow-stats">
                  <StatCell label="Wins" value={row.wins} />
                  <StatCell label="Podiums" value={row.podiums} />
                  <StatCell label="Poles" value={poles} />
                  <StatCell label="Fastest" value={fastest} />
                </div>
                {lineup.length > 0 && (
                  <div className="stdrow-lineup">
                    {lineup.map(({ d, r }) => (
                      <a key={d.id} className="stdrow-lineup-row"
                         href={urlFor({ name: 'driver', id: d.id, ref: d.jolpicaId })}>
                        {d.jolpicaId
                          ? (
                            <img
                              className="stdrow-lineup-face" src={`/images/drivers/${d.jolpicaId}.webp`}
                              width={24} height={24} alt="" loading="lazy"
                              onError={e => { e.currentTarget.style.visibility = 'hidden'; }}
                            />
                          )
                          : <Flag cc={d.country} flag={d.flag} name={d.nationality} className="stdrow-lineup-flag" />}
                        <span className="stdrow-lineup-name"><span className="first">{d.first}</span> <b>{d.last}</b></span>
                        <span className="stdrow-lineup-pos">P{r.position}</span>
                        <span className="stdrow-lineup-pts">{r.points}<small>pts</small></span>
                      </a>
                    ))}
                  </div>
                )}
                <FormRow
                  values={recentRounds.map(r => teamPointsForRound(D, team.id, r.round))}
                  color={tc} gap={gap}
                />
                <a className="stdrow-profile" href={teamHref}>View {team.name} profile &rarr;</a>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
