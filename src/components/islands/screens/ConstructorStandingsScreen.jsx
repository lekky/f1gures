// Constructor Standings - table + chart. Ported from
// js/screens/standings.jsx ConstructorStandingsScreen.

import { useMemo } from 'react';
import { Panel, SectionHead, useIsMobile, urlFor } from '../../../lib/shared.jsx';
import { StandingsTypeToggle, TeamProgressionChart } from './StandingsCommon.jsx';

export default function ConstructorStandingsScreen({ data }) {
  const DD = data;
  const mob = useIsMobile();
  const standings = useMemo(() => DD.computeStandings(), [DD]);
  return (
    <div className={`page ${mob ? 'page-mob' : ''}`}>
      <div className="page-head">
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 6 }}>{DD.seasonYear || '2026'} World Championship</div>
          <h1 className="page-title">Constructor Standings</h1>
          <div className="page-sub">After Round {standings.lastRound}</div>
        </div>
      </div>

      {mob && <StandingsTypeToggle active="c" />}

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
              {standings.teams.map(row => {
                const teamHref = urlFor({ name: 'team', id: row.team.id, ref: row.team.id });
                return (
                  <tr key={row.team.id} className="clickable"
                      onClick={() => { window.location.href = teamHref; }}>
                    <td><div className={`pos pos-${row.position}`}>{row.position}</div></td>
                    <td>
                      <a href={teamHref} style={{ color: 'inherit', textDecoration: 'none' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ width: 4, height: 24, background: row.team.color }}></span>
                          <span style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 16, textTransform: 'uppercase' }}>{row.team.name}</span>
                        </div>
                      </a>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {row.drivers.map(d => (
                          <a key={d.id}
                             href={urlFor({ name: 'driver', id: d.id, ref: d.jolpicaId })}
                             className="driver-chip"
                             style={{ '--team-color': row.team.color, color: 'inherit', textDecoration: 'none' }}
                             onClick={e => e.stopPropagation()}>{d.code}</a>
                        ))}
                      </div>
                    </td>
                    <td className="right num"><strong style={{ fontFamily: 'var(--f-display)', fontSize: 18 }}>{row.points}</strong></td>
                    <td className="right num">{row.wins}</td>
                    <td className="right num">{row.podiums}</td>
                  </tr>
                );
              })}
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
