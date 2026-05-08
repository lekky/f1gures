// Shared React helpers and components — ported from js/shell.jsx for use
// inside React islands. The Astro layout (BaseLayout/Chrome.astro) handles
// the chrome itself; this module provides the building blocks each screen
// island composes (Panel, DriverCell, Countdown, etc.) plus URL/date helpers.

import { useEffect, useState } from 'react';

// ─── URL helpers ──────────────────────────────────────────────
// Listing pages use clean Astro paths. Detail pages (driver/race/circuit/team)
// still use legacy `?id=` URLs until PR 2 prerenders them per-entity.
export function urlFor(target) {
  switch (target.name) {
    case 'home':         return '/';
    case 'standings-d':  return '/standings-drivers/';
    case 'standings-c':  return '/standings-constructors/';
    case 'calendar':     return '/calendar/';
    case 'circuits':     return '/circuits/';
    case 'race':         return `/race.html?round=${target.round}`;
    case 'circuit':      return `/circuit.html?id=${encodeURIComponent(target.id)}`;
    case 'driver':       return `/driver.html?id=${encodeURIComponent(target.id)}`;
    case 'team':         return `/team.html?id=${encodeURIComponent(target.id)}`;
    default:             return '/';
  }
}

export function getParam(name) {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

export function navigate(target) {
  if (typeof window === 'undefined') return;
  window.location.href = urlFor(target);
}

// ─── Viewport hook ────────────────────────────────────────────
export function useIsMobile(breakpoint = 720) {
  const [isMob, setIsMob] = useState(false);
  useEffect(() => {
    const check = () => setIsMob(window.innerWidth <= breakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);
  return isMob;
}

// ─── Date helpers ─────────────────────────────────────────────
export function fmtDate(iso, opts = {}) {
  const d = new Date(iso + 'T14:00:00Z');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', ...opts });
}
export function fmtDateLong(iso) {
  const d = new Date(iso + 'T14:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Reusable building blocks ─────────────────────────────────
export function Panel({ title, action, children, tight, style }) {
  return (
    <div className={`panel ${tight ? 'panel-tight' : ''}`} style={style}>
      {(title || action) && (
        <div className="panel-head">
          <span>{title}</span>
          <div style={{ flex: 1 }}></div>
          {action}
        </div>
      )}
      {tight ? children : <div className="panel-body">{children}</div>}
    </div>
  );
}

export function SectionHead({ title, right }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      <div className="section-rule"></div>
      {right}
    </div>
  );
}

export function ChangeIndicator({ change }) {
  if (change === 0 || change == null) return <span className="chg flat">— 0</span>;
  if (change > 0) return <span className="chg up">▲ {change}</span>;
  return <span className="chg down">▼ {Math.abs(change)}</span>;
}

export function StatusPill({ status }) {
  return <span className={`pill pill-${status.toLowerCase()}`}>{status}</span>;
}

export function SprintBadge() {
  return <span className="pill pill-sprint">Sprint</span>;
}

export function DriverCell({ data, driver, showCode = true }) {
  const team = data.teamById(driver.team) || { color: '#888888', short: '—', name: '—' };
  return (
    <div className="driver-cell" style={{ '--team-color': team.color }}>
      <span className="driver-flag">{driver.flag}</span>
      <span className="driver-name">
        <span className="driver-firstlast">
          <span className="first">{driver.first}</span>
          <span className="last">{driver.last}</span>
        </span>
        {showCode && <span className="driver-code">{driver.code}</span>}
      </span>
    </div>
  );
}

export function Countdown({ target }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, target.getTime() - now.getTime());
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  const cells = [
    { v: days, l: 'Days' }, { v: hours, l: 'Hours' },
    { v: mins, l: 'Mins' }, { v: secs, l: 'Secs' },
  ];
  return (
    <div className="countdown">
      {cells.map(c => (
        <div className="countdown-cell" key={c.l}>
          <div className="countdown-num">{String(c.v).padStart(2, '0')}</div>
          <div className="countdown-lbl">{c.l}</div>
        </div>
      ))}
    </div>
  );
}

export function DriverSilhouette({ data, driver, height = 200 }) {
  const team = data.teamById(driver.team);
  const [imgFailed, setImgFailed] = useState(false);
  const src = driver.jolpicaId ? `/images/drivers/${driver.jolpicaId}.webp` : null;

  if (src && !imgFailed) {
    return (
      <div className="silhouette silhouette-photo" style={{ height, '--team-color': team.color }}>
        <img src={src} alt={`${driver.first} ${driver.last}`} onError={() => setImgFailed(true)} />
      </div>
    );
  }
  return (
    <div className="silhouette" style={{ height, '--team-color': team.color }}>
      <svg viewBox="0 0 100 120" preserveAspectRatio="xMidYMax meet">
        <path d="M50 12 C28 12 18 28 18 46 L18 60 L14 70 L14 82 L20 88 L20 120 L80 120 L80 88 L86 82 L86 70 L82 60 L82 46 C82 28 72 12 50 12 Z M30 50 L70 50 L70 60 L30 60 Z" fill={team.color} />
      </svg>
      <span style={{ position: 'relative', zIndex: 1 }}>{driver.code} · #{driver.num}</span>
    </div>
  );
}
