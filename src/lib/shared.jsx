// Shared React helpers and components - ported from js/shell.jsx for use
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
    case 'race': {
      // /races/<y>/<r>/ pages exist for Ergast (1950–2024) + hand-curated bundles
      // (2025 full, 2026 completed AND upcoming rounds via holding pages emitted
      // by build-archive.mjs). All entries land in _races-index.json. Future years
      // without bundles still fall through to /race.html → /calendar/.
      const ARCHIVE_MAX_YEAR = 2026;
      const y = target.year ? Number(target.year) : null;
      if (y && target.round && y <= ARCHIVE_MAX_YEAR) {
        return `/races/${target.year}/${target.round}/`;
      }
      if (target.year) return `/race.html?round=${target.round}&year=${target.year}`;
      return `/race.html?round=${target.round}`;
    }
    case 'circuit': {
      // PR 2b prerenders /circuits/<circuitRef>/. Most callers in current
      // (post-migration) code already pass the Ergast circuitRef, but the
      // 2026 fallback + 2020-2025 hand-curated season bundles use legacy
      // short ids (albert, marina, lasvegas, ...) that diverge from Ergast
      // (albert_park, marina_bay, vegas, ...). Map known aliases.
      const CIRCUIT_ID_ALIAS = {
        albert: 'albert_park',
        marina: 'marina_bay',
        lasvegas: 'vegas',
        yas: 'yas_marina',
        montreal: 'villeneuve',
        cota: 'americas',
        spielberg: 'red_bull_ring',
      };
      const raw = target.ref || target.id;
      const cref = (raw && CIRCUIT_ID_ALIAS[raw]) || raw;
      if (cref) return `/circuits/${encodeURIComponent(cref)}/`;
      return `/circuit.html?id=${encodeURIComponent(target.id)}`;
    }
    case 'driver': {
      // PR 2a prerenders driver pages at /drivers/<driverRef>/. Prefer `ref`
      // (driverRef / jolpicaId, e.g. "norris", "max_verstappen") when callers
      // can supply it. Fall back to /driver.html?id=<code> which the legacy
      // redirect resolves via _driver-codes.json.
      const ref = target.ref || target.driverRef;
      if (ref) return `/drivers/${encodeURIComponent(ref)}/`;
      return `/driver.html?id=${encodeURIComponent(target.id)}`;
    }
    case 'team': {
      // PR 2c prerenders team pages at /teams/<constructorRef>/. Most ids in
      // buildFallback already match Ergast's constructorRef, but a couple
      // diverge (buildFallback's `redbull` is Ergast's `red_bull`, and
      // `aston` is `aston_martin`). Map known aliases so links land on the
      // right route.
      const TEAM_ID_ALIAS = { redbull: 'red_bull', aston: 'aston_martin' };
      const raw = target.ref || target.id;
      const tref = (raw && TEAM_ID_ALIAS[raw]) || raw;
      if (tref) return `/teams/${encodeURIComponent(tref)}/`;
      return `/team.html?id=${encodeURIComponent(target.id)}`;
    }
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

// ─── Circuit timezones ────────────────────────────────────────
// IANA zone per circuitId (matches the circuitId field on calendar
// entries in public/data/<year>.json). Used by HomeScreen's session
// schedule toggle. Missing entries fall back to UTC so the panel
// never crashes on a circuit we forgot.
const CIRCUIT_TZ = {
  albert_park:    'Australia/Melbourne',
  shanghai:       'Asia/Shanghai',
  suzuka:         'Asia/Tokyo',
  miami:          'America/New_York',
  villeneuve:     'America/Toronto',
  monaco:         'Europe/Monaco',
  catalunya:      'Europe/Madrid',
  red_bull_ring:  'Europe/Vienna',
  silverstone:    'Europe/London',
  spa:            'Europe/Brussels',
  hungaroring:    'Europe/Budapest',
  zandvoort:      'Europe/Amsterdam',
  monza:          'Europe/Rome',
  madring:        'Europe/Madrid',
  baku:           'Asia/Baku',
  marina_bay:     'Asia/Singapore',
  americas:       'America/Chicago',
  rodriguez:      'America/Mexico_City',
  interlagos:     'America/Sao_Paulo',
  vegas:          'America/Los_Angeles',
  losail:         'Asia/Qatar',
  yas_marina:     'Asia/Dubai',
  bahrain:        'Asia/Bahrain',
  jeddah:         'Asia/Riyadh',
  imola:          'Europe/Rome',
};

export function circuitTz(circuitId) {
  return (circuitId && CIRCUIT_TZ[circuitId]) || 'UTC';
}

// Resolve the short timezone abbreviation (EDT, CEST, JST, …) for a
// given zone at a given moment. The moment matters because abbreviations
// flip with DST (EDT in summer, EST in winter).
export function zoneShort(zone, dt) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'short',
    }).formatToParts(dt);
    const part = parts.find(p => p.type === 'timeZoneName');
    return part ? part.value : '';
  } catch {
    return '';
  }
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
  if (change === 0 || change == null) return <span className="chg flat">- 0</span>;
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
  const team = data.teamById(driver.team) || { color: '#888888', short: '-', name: '-' };
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
