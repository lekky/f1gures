// Driver Standings - table + sort + CSV export + chart + head-to-head.
// Ported from js/screens/standings.jsx DriverStandingsScreen.

import { useMemo, useState } from 'react';
import {
  Panel, SectionHead, ChangeIndicator, DriverCell, useIsMobile, urlFor,
  MiniChart, lastNCompletedRounds, driverPointsForRound,
} from '../../../lib/shared.jsx';
import { StandingsTypeToggle, PointsChart, HeadToHead } from './StandingsCommon.jsx';
import { DriverBars } from './StandingsBars.jsx';
import TriviaBoard from './TriviaBoard.jsx';
import { ChampSection, driversSummary } from './ChampPodium.jsx';

export default function DriverStandingsScreen({ data }) {
  const DD = data;
  const mob = useIsMobile();
  const standings = useMemo(() => DD.computeStandings(), [DD]);
  const recentRounds = useMemo(() => lastNCompletedRounds(DD, 5), [DD]);
  const leaderPoints = standings.drivers.reduce((m, r) => Math.max(m, r.points), 0);
  const completedCount = DD.calendar.filter(r => DD.results[r.round]).length;
  const top3 = standings.drivers.slice(0, 3);
  const [sortKey, setSortKey] = useState('position');
  const [sortDir, setSortDir] = useState('asc');

  const sorted = useMemo(() => {
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
  }, [standings, sortKey, sortDir, DD]);

  const toggleSort = (k) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'driver' || k === 'team' ? 'asc' : 'desc'); }
  };
  const SortInd = ({ k }) => sortKey === k ? <span className="sort-ind">{sortDir === 'asc' ? '▲' : '▼'}</span> : null;

  const exportCSV = () => {
    const headers = ['Position', 'Driver', 'Code', 'Nationality', 'Team', 'Points', 'Wins', 'Podiums', 'Poles', 'Fastest Laps', 'DNFs'];
    const rows = sorted.map(row => {
      const team = DD.teamById(row.driver.team);
      return [
        row.position,
        `${row.driver.first} ${row.driver.last}`,
        row.driver.code,
        row.driver.nationality || '',
        team ? team.name : '',
        row.points,
        row.wins,
        row.podiums,
        row.poles,
        row.fastestLaps,
        row.dnfs,
      ];
    });
    const csv = [headers, ...rows]
      .map(r => r.map(v => {
        const s = v == null ? '' : String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(','))
      .join('\r\n');
    const year = (DD && DD.seasonYear) || new Date().getFullYear();
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `f1-driver-standings-${year}-r${standings.lastRound}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const lastRoundEntry = DD.calendar.find(r => r.round === standings.lastRound) || {};

  return (
    <div className={`page ${mob ? 'page-mob' : ''}`}>
      <div className="page-head">
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 6 }}>{DD.seasonYear || '2026'} World Championship</div>
          <h1 className="page-title">Driver Standings</h1>
          <div className="page-sub">After Round {standings.lastRound} · {lastRoundEntry.name}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="btn btn-secondary btn-sm" href="/drivers/">All Drivers</a>
        </div>
      </div>

      <div className="standings-toggle-mobile"><StandingsTypeToggle active="d" /></div>

      <TriviaBoard />

      {top3.length >= 1 && (
        <div className="std-podium">
          <ChampSection mode="drivers" title="Championship Leaders"
            rows={top3} D={DD} recentRounds={recentRounds}
            blurb={driversSummary(DD, top3, completedCount)}
            after={String(completedCount).padStart(2, '0')} mob={mob} />
          <SectionHead variant="band" title="Full Table" />
        </div>
      )}

      <DriverBars D={DD} standings={standings} leaderPoints={leaderPoints} recentRounds={recentRounds} />

      <div className="std-fulltable">
      <Panel tight>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort('position')}>Pos<SortInd k="position" /></th>
                <th>Δ</th>
                <th className="sortable" onClick={() => toggleSort('driver')}>Driver<SortInd k="driver" /></th>
                <th className="sortable" onClick={() => toggleSort('team')}>Team<SortInd k="team" /></th>
                {recentRounds.length > 0 && <th className="right col-recent">Last {recentRounds.length}</th>}
                <th className="right sortable" onClick={() => toggleSort('points')}>Pts<a className="th-guide-link" href="/guide/points-system/" onClick={(e) => e.stopPropagation()} aria-label="How F1 points work">?</a><SortInd k="points" /></th>
                <th className="right sortable" onClick={() => toggleSort('wins')}>W<SortInd k="wins" /></th>
                <th className="right sortable" onClick={() => toggleSort('podiums')}>Pod<SortInd k="podiums" /></th>
                <th className="right sortable" onClick={() => toggleSort('fastest')}>FL<SortInd k="fastest" /></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(row => {
                const team = DD.teamById(row.driver.team);
                const driverHref = urlFor({ name: 'driver', id: row.driver.id, ref: row.driver.jolpicaId });
                const teamHref = team ? urlFor({ name: 'team', id: team.id, ref: team.id }) : null;
                return (
                  <tr key={row.driver.id} className="clickable" onClick={() => { window.location.href = driverHref; }}>
                    <td><div className={`pos pos-${row.position}`}>{row.position}</div></td>
                    <td><ChangeIndicator change={row.change} /></td>
                    <td className="std-name-td">
                      <span className="std-bar" aria-hidden="true"
                        style={{ width: `${leaderPoints > 0 ? (row.points / leaderPoints) * 100 : 0}%`, '--tc': team ? team.color : 'var(--fg-3)' }} />
                      <div className="std-name-inner">
                        <a href={driverHref} className="std-name-id" onClick={e => e.stopPropagation()}>
                          {row.driver.jolpicaId && (
                            <img
                              src={`/images/drivers/${row.driver.jolpicaId}.webp`}
                              width={28}
                              height={28}
                              alt=""
                              style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                              onError={e => { e.currentTarget.style.display = 'none'; }}
                            />
                          )}
                          <DriverCell data={DD} driver={row.driver} />
                        </a>
                        {(() => {
                          const gap = leaderPoints - row.points;
                          return gap <= 0
                            ? <span className="std-gap is-leader">Leader</span>
                            : <span className="std-gap">-{gap}</span>;
                        })()}
                      </div>
                    </td>
                    <td>
                      {team && teamHref
                        ? <a href={teamHref} style={{ color: 'inherit', textDecoration: 'none' }} onClick={e => e.stopPropagation()}>{team.name}</a>
                        : '-'}
                    </td>
                    {recentRounds.length > 0 && (
                      <td className="right col-recent">
                        <div style={{ display: 'inline-block' }}>
                          <MiniChart
                            values={recentRounds.map(r => driverPointsForRound(DD, row.driver.id, r.round))}
                            color={team ? team.color : 'var(--fg-3)'}
                            width={70}
                            height={22}
                          />
                        </div>
                      </td>
                    )}
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
      </div>

      <SectionHead title="Points Progression" />
      <Panel>
        <PointsChart data={DD} series={standings.progression} drivers={standings.drivers.slice(0, 8).map(r => r.driver)} />
      </Panel>

      <SectionHead title="Head-to-Head" />
      <HeadToHead data={DD} standings={standings} />
    </div>
  );
}
