// Mobile standings: dense ranked list with tap-to-expand rows.
//
// Every entry is a 56 px bordered row (1 px --line-1 dividers, no card, no
// radius, no glow): position · Δ · 3 px team strip · headshot · name over team
// with a slim team-coloured points bar under the name (width = share of the
// leader's points) · points right-aligned · chevron. Tapping a row reveals a
// one-line stat strip (wins / podiums / poles / fastest laps / last-5 form)
// plus a text link to the profile. One row open at a time; the panel animates
// height in <=120 ms and respects prefers-reduced-motion (CSS grid-rows).
//
// Rendered only <=720px — the wrapper is CSS-gated (.std-barlist) so desktop
// keeps the sortable full table. The leader gets no special box: the podium
// colour on the position digit and the longest bar already say it.

import { useState } from 'react';
import {
  ChangeIndicator, Flag, Icon, MiniChart, TeamLogo, urlFor,
  driverPointsForRound, teamPointsForRound,
} from '../../../lib/shared.jsx';

function Stat({ value, label }) {
  return (
    <span className="stdrow-stat"><b>{value}</b><span>{label}</span></span>
  );
}

function GapTag({ gap }) {
  return gap <= 0
    ? <span className="stdrow-gap is-leader">Leader</span>
    : <span className="stdrow-gap">&minus;{gap} to P1</span>;
}

// Shared row shell: head button (collapsed state) + animated expand panel.
function Row({ id, position, change, tc, isOpen, onToggle, avatar, name, sub, pct, points, panelId, children }) {
  return (
    <div className={`stdrow ${isOpen ? 'is-open' : ''}`} style={{ '--tc': tc }} role="listitem">
      <button
        type="button" className="stdrow-head" aria-expanded={isOpen} aria-controls={panelId}
        onClick={onToggle}
      >
        <span className={`pos pos-${position} stdrow-pos`}>{position}</span>
        {change != null && <span className="stdrow-chg"><ChangeIndicator change={change} /></span>}
        <span className="stdrow-strip" aria-hidden="true" />
        {avatar}
        <span className="stdrow-main">
          <span className="stdrow-name">{name}</span>
          <span className="stdrow-team">{sub}</span>
          <span className="stdrow-bar" aria-hidden="true">
            <span className="stdrow-fill" style={{ width: `${pct}%` }} />
          </span>
        </span>
        <span className="stdrow-pts">{points}</span>
        <span className="stdrow-caret" aria-hidden="true"><Icon name="chevron-right" size={14} /></span>
      </button>
      <div className="stdrow-panel" id={panelId} aria-hidden={!isOpen}>
        <div className="stdrow-panel-in">{children}</div>
      </div>
    </div>
  );
}

export function DriverBars({ D, standings, leaderPoints, recentRounds }) {
  const [openId, setOpenId] = useState(null);
  return (
    <div className="std-barlist" role="list">
      {standings.drivers.map(row => {
        const drv = row.driver;
        const team = D.teamById(drv.team);
        const tc = team ? team.color : 'var(--fg-3)';
        const pct = leaderPoints > 0 ? Math.max(1, (row.points / leaderPoints) * 100) : 0;
        const gap = leaderPoints - row.points;
        const isOpen = openId === drv.id;
        const driverHref = urlFor({ name: 'driver', id: drv.id, ref: drv.jolpicaId });
        return (
          <Row
            key={drv.id} id={drv.id} position={row.position} change={row.change} tc={tc}
            isOpen={isOpen} onToggle={() => setOpenId(id => (id === drv.id ? null : drv.id))}
            panelId={`stdrow-d-${drv.id}`} pct={pct} points={row.points}
            avatar={drv.jolpicaId
              ? (
                <img
                  className="stdrow-face" src={`/images/drivers/${drv.jolpicaId}.webp`}
                  width={32} height={32} alt="" loading="lazy"
                  onError={e => { e.currentTarget.style.display = 'none'; }}
                />
              )
              : <Flag cc={drv.country} flag={drv.flag} name={drv.nationality} className="stdrow-flag" />}
            name={<><span className="first">{drv.first}</span> <b>{drv.last}</b></>}
            sub={team ? team.name : ''}
          >
            <div className="stdrow-stats">
              <Stat value={row.wins} label="Wins" />
              <Stat value={row.podiums} label="Pods" />
              <Stat value={row.poles} label="Poles" />
              <Stat value={row.fastestLaps} label="FL" />
              {recentRounds.length > 0 && (
                <span className="stdrow-form" title={`Points, last ${recentRounds.length} rounds`}>
                  <span>L{recentRounds.length}</span>
                  <MiniChart values={recentRounds.map(r => driverPointsForRound(D, drv.id, r.round))} color={tc} width={44} height={12} />
                </span>
              )}
            </div>
            <div className="stdrow-foot">
              <a className="stdrow-profile" href={driverHref} tabIndex={isOpen ? 0 : -1}>{drv.last} profile &rarr;</a>
              <GapTag gap={gap} />
            </div>
          </Row>
        );
      })}
    </div>
  );
}

export function TeamBars({ D, standings, leaderPoints, recentRounds }) {
  const drow = {};
  standings.drivers.forEach(r => { drow[r.driver.id] = r; });
  const [openId, setOpenId] = useState(null);
  return (
    <div className="std-barlist" role="list">
      {standings.teams.map(row => {
        const team = row.team;
        const tc = team.color;
        const pct = leaderPoints > 0 ? Math.max(1, (row.points / leaderPoints) * 100) : 0;
        const gap = leaderPoints - row.points;
        const isOpen = openId === team.id;
        const teamHref = urlFor({ name: 'team', id: team.id, ref: team.id });
        const poles = standings.drivers.reduce((s, r) => (r.driver.team === team.id ? s + (r.poles || 0) : s), 0);
        const fastest = standings.drivers.reduce((s, r) => (r.driver.team === team.id ? s + (r.fastestLaps || 0) : s), 0);
        const lineup = row.drivers
          .map(d => ({ d, r: drow[d.id] }))
          .filter(x => x.r)
          .sort((a, b) => b.r.points - a.r.points);
        return (
          <Row
            key={team.id} id={team.id} position={row.position} change={row.change} tc={tc}
            isOpen={isOpen} onToggle={() => setOpenId(id => (id === team.id ? null : team.id))}
            panelId={`stdrow-t-${team.id}`} pct={pct} points={row.points}
            avatar={<span className="stdrow-logo"><TeamLogo team={team} size={26} /></span>}
            name={<b>{team.name}</b>}
            sub={row.drivers.map(d => d.code).join(' · ')}
          >
            <div className="stdrow-stats">
              <Stat value={row.wins} label="Wins" />
              <Stat value={row.podiums} label="Pods" />
              <Stat value={poles} label="Poles" />
              <Stat value={fastest} label="FL" />
              {recentRounds.length > 0 && (
                <span className="stdrow-form" title={`Points, last ${recentRounds.length} rounds`}>
                  <span>L{recentRounds.length}</span>
                  <MiniChart values={recentRounds.map(r => teamPointsForRound(D, team.id, r.round))} color={tc} width={44} height={12} />
                </span>
              )}
            </div>
            {lineup.length > 0 && (
              <div className="stdrow-lineup">
                {lineup.map(({ d, r }) => (
                  <a key={d.id} className="stdrow-lineup-row" tabIndex={isOpen ? 0 : -1}
                     href={urlFor({ name: 'driver', id: d.id, ref: d.jolpicaId })}>
                    <span className="stdrow-lineup-pos">P{r.position}</span>
                    <span className="stdrow-lineup-name"><span className="first">{d.first}</span> <b>{d.last}</b></span>
                    <span className="stdrow-lineup-pts">{r.points}</span>
                  </a>
                ))}
              </div>
            )}
            <div className="stdrow-foot">
              <a className="stdrow-profile" href={teamHref} tabIndex={isOpen ? 0 : -1}>{team.name} profile &rarr;</a>
              <GapTag gap={gap} />
            </div>
          </Row>
        );
      })}
    </div>
  );
}
