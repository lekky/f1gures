// Top-3 championship podium — featured leader card + stacked 2nd/3rd, with the
// "story so far" blurb and a count-up. Extracted from HomeScreen so the home
// page AND the two standings pages render one identical surface.
//
// `mode` switches between drivers and constructors. Keeps the real photo/logo,
// driver/team links, the count-up and the last-5-rounds mini-chart (leader card).

import { useState } from 'react';
import {
  SectionHead, TeamLogo, urlFor, Flag,
  MiniChart, driverPointsForRound, teamPointsForRound,
} from '../../../lib/shared.jsx';

// Layout effect that's a no-op during SSR (avoids the React useLayoutEffect
// server warning) but runs synchronously before paint on the client.
import { useEffect, useLayoutEffect } from 'react';
const useIsoLayout = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// Counts a number up from 0 on mount (page load). SSR and the first client
// render show the final value (so the prerendered HTML and hydration match);
// the layout effect then resets to 0 before the browser paints and eases up
// via rAF. Honours prefers-reduced-motion.
export function CountUp({ value, decimals = 0, duration = 800 }) {
  const [display, setDisplay] = useState(value);
  useIsoLayout(() => {
    if (!Number.isFinite(value)) { setDisplay(value); return; }
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setDisplay(value); return; }
    let raf;
    let startTs = null;
    setDisplay(0);
    const tick = (ts) => {
      if (startTs === null) startTs = ts;
      const t = Math.min(1, (ts - startTs) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(tick);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [value]);
  const shown = decimals > 0 ? Number(display).toFixed(decimals) : String(Math.round(Number(display)));
  return <>{shown}</>;
}

export function driversSummary(D, drivers, completedCount) {
  if (!drivers.length || !completedCount) return null;
  const [p1, p2, p3] = drivers;
  const p1Team = D.teamById(p1.driver.team);
  const year = D.seasonYear || '';
  const roundsLbl = `${completedCount} ${completedCount === 1 ? 'round' : 'rounds'}`;

  let s = `${p1.driver.first} ${p1.driver.last} leads the ${year} World Drivers' Championship`;
  if (p1Team) s += ` for ${p1Team.name}`;
  s += `, with ${p1.points} points after ${roundsLbl}`;
  if (p1.wins) s += ` and ${p1.wins} race ${p1.wins === 1 ? 'win' : 'wins'}`;
  s += '.';

  if (p2 && p3) {
    const g12 = p1.points - p2.points;
    const g23 = p2.points - p3.points;
    s += ` ${p2.driver.last} sits ${g12} ${g12 === 1 ? 'point' : 'points'} behind in second`;
    s += `, with ${p3.driver.last} a further ${g23} adrift in third.`;
  } else if (p2) {
    const g12 = p1.points - p2.points;
    s += ` ${p2.driver.last} is ${g12} ${g12 === 1 ? 'point' : 'points'} behind in second.`;
  }
  return s;
}

export function teamsSummary(D, teams, completedCount) {
  if (!teams.length || !completedCount) return null;
  const [t1, t2, t3] = teams;
  const year = D.seasonYear || '';
  const roundsLbl = `${completedCount} ${completedCount === 1 ? 'round' : 'rounds'}`;

  let s = `${t1.team.name} top the ${year} Constructors' Championship with ${t1.points} points`;
  if (t1.wins) {
    s += ` and ${t1.wins} ${t1.wins === 1 ? 'win' : 'wins'} from ${roundsLbl}`;
  } else {
    s += ` after ${roundsLbl}`;
  }
  s += '.';

  if (t2 && t3) {
    const g12 = t1.points - t2.points;
    s += ` ${t2.team.name} sit ${g12} ${g12 === 1 ? 'point' : 'points'} back`;
    s += `, with ${t3.team.name} completing the top three.`;
  } else if (t2) {
    const g12 = t1.points - t2.points;
    s += ` ${t2.team.name} are ${g12} ${g12 === 1 ? 'point' : 'points'} behind.`;
  }
  return s;
}

// Top-3 standings as a featured leader card (story, big points + stat tiles,
// photo/crest) flanked by two compact 2nd/3rd cards. `mode` switches between
// drivers and constructors. When `fullHref` is falsy the section header's
// "View Full Standings" link is omitted (used on the standings pages, where the
// full table sits directly below the cards).
export function ChampSection({ mode, title, fullHref, rows, D, recentRounds, blurb, after, mob }) {
  if (!rows || rows.length < 1) return null;
  const isDrv = mode === 'drivers';
  const norm = (row) => {
    if (isDrv) {
      const t = D.teamById(row.driver.team);
      return {
        key: row.driver.id, position: row.position, points: row.points, color: t.color,
        href: urlFor({ name: 'driver', id: row.driver.id, ref: row.driver.jolpicaId }),
        nameFirst: row.driver.first, nameLast: row.driver.last,
        meta: <><Flag cc={row.driver.country} flag={row.driver.flag} /><span>{t.name}</span></>,
        ghost: String(row.driver.num),
        media: row.driver.jolpicaId
          ? <img className="champ-photo-img" src={`/images/drivers/${row.driver.jolpicaId}.webp`} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          : null,
        rowMedia: row.driver.jolpicaId
          ? <img className="champ-row-img" src={`/images/drivers/${row.driver.jolpicaId}.webp`} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          : null,
        stats: [{ v: row.wins, l: 'Wins' }, { v: row.podiums, l: 'Podiums' }, { v: row.poles, l: 'Poles' }],
        sub: `${row.wins} wins · ${row.podiums} podiums · ${row.poles} poles`,
        recent: recentRounds.map(r => driverPointsForRound(D, row.driver.id, r.round)),
      };
    }
    const t = row.team;
    const codes = (row.drivers || []).map(d => d.code).filter(Boolean).join(' · ');
    return {
      key: t.id, position: row.position, points: row.points, color: t.color,
      href: urlFor({ name: 'team', id: t.id, ref: t.id }),
      nameFirst: null, nameLast: t.name,
      meta: <span>{codes || t.short}</span>,
      ghost: t.short,
      media: <TeamLogo team={t} fill />,
      rowMedia: <TeamLogo team={t} fill />,
      stats: [{ v: row.wins, l: 'Wins' }, { v: row.podiums, l: 'Podiums' }],
      sub: `${row.wins} wins · ${row.podiums} podiums`,
      recent: recentRounds.map(r => teamPointsForRound(D, t.id, r.round)),
    };
  };
  const ld = norm(rows[0]);
  const rest = rows.slice(1, 3).map(norm);
  return (
    <>
      <SectionHead variant="band" title={title} right={fullHref
        ? <a className="btn btn-ghost btn-sm" href={fullHref}>View Full Standings <span className="arrow">→</span></a>
        : null} />
      <div className="champ">
        <a className="champ-leader" href={ld.href} style={{ '--tc': ld.color }}>
          <div className="champ-leader-photo">
            <span className="champ-medal" aria-hidden="true">1</span>
            {ld.media}
            <span className="champ-photo-ghost" aria-hidden="true">1</span>
          </div>
          <div className="champ-leader-body">
            <div className="champ-leader-head">
              <span className="champ-pill">Championship Leader</span>
              <span className="champ-after">After Round {after}</span>
            </div>
            <h3 className="champ-name">
              {ld.nameFirst ? <span className="champ-name-first">{ld.nameFirst}</span> : null}
              <span className="champ-name-last">{ld.nameLast}</span>
            </h3>
            <div className="champ-meta">{ld.meta}</div>
            {blurb ? <p className="champ-leader-blurb">{blurb}</p> : null}
            <div className="champ-figures">
              <div className="champ-pts"><span className="champ-pts-v"><CountUp value={ld.points} /></span><span className="champ-pts-u">pts</span></div>
              {ld.stats.map(s => (
                <div className="champ-stat" key={s.l}>
                  <span className="champ-stat-v"><CountUp value={s.v} /></span>
                  <span className="champ-stat-l">{s.l}</span>
                </div>
              ))}
            </div>
            {ld.recent.length > 0 && (
              <div className="champ-chart">
                <span className="champ-chart-lbl">Last {ld.recent.length} rounds</span>
                <MiniChart values={ld.recent} color={ld.color} width={mob ? 120 : 150} height={26} />
              </div>
            )}
          </div>
        </a>
        <div className="champ-rest">
          {rest.map(r => (
            <a className="champ-row" key={r.key} href={r.href} style={{ '--tc': r.color }}>
              <div className="champ-row-side">
                <span className="champ-row-badge">{r.position}</span>
                {r.rowMedia
                  ? r.rowMedia
                  : <span className="champ-row-ghost" aria-hidden="true">{r.ghost}</span>}
              </div>
              <div className="champ-row-body">
                <div className="champ-row-name">{r.nameLast}</div>
                <div className="champ-row-meta">{r.meta}</div>
                <div className="champ-row-figs">
                  <span className="champ-row-pts"><CountUp value={r.points} /></span>
                  <span className="champ-row-pts-u">pts</span>
                </div>
                {r.recent.length > 0 && (
                  <div className="champ-row-chart">
                    <span className="champ-row-chart-lbl">Last {r.recent.length}</span>
                    <MiniChart values={r.recent} color={r.color} width={mob ? 72 : 88} height={18} />
                  </div>
                )}
                <div className="champ-row-sub">{r.sub}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}
