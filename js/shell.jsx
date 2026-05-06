// f1gures — shared shell for the deployed multi-page app.
// Provides:
//   <Chrome>      — wraps every page with desktop top-nav, mobile top-bar, mobile bot-nav.
//   urlFor()/navigate()/getParam() — URL helpers (replace the prototype's setRoute).
//   useIsMobile() — viewport hook used by screens to switch desktop/mobile layouts.
//   Panel, SectionHead, ChangeIndicator, StatusPill, SprintBadge,
//   DriverCell, Countdown, DriverSilhouette, fmtDate, fmtDateLong.

const { useState, useEffect, useMemo } = React;

const APP_VERSION = '1.000';

// ─── URL helpers ──────────────────────────────────────────────
function currentPath() {
  const p = window.location.pathname;
  return p.split('/').pop() || 'index.html';
}
function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}
function urlFor(target) {
  switch (target.name) {
    case 'home':         return 'index.html';
    case 'standings-d':  return 'standings-drivers.html';
    case 'standings-c':  return 'standings-constructors.html';
    case 'calendar':     return 'calendar.html';
    case 'circuits':     return 'circuits.html';
    case 'race':         return `race.html?round=${target.round}`;
    case 'circuit':      return `circuit.html?id=${encodeURIComponent(target.id)}`;
    case 'driver':       return `driver.html?id=${encodeURIComponent(target.id)}`;
    default:             return 'index.html';
  }
}
function navigate(target) { window.location.href = urlFor(target); }
function currentRouteName() {
  const path = currentPath();
  if (path === '' || path === 'index.html')   return 'home';
  if (path === 'standings-drivers.html')      return 'standings-d';
  if (path === 'standings-constructors.html') return 'standings-c';
  if (path === 'calendar.html')               return 'calendar';
  if (path === 'circuits.html')               return 'circuits';
  if (path === 'race.html')                   return 'race';
  if (path === 'circuit.html')                return 'circuit';
  if (path === 'driver.html')                 return 'driver';
  return 'home';
}

// ─── Viewport hook ────────────────────────────────────────────
// Returns true when the viewport is narrow enough to use mobile layouts.
// Screens use this to flip between desktop/mobile grid layouts inline.
function useIsMobile(breakpoint = 720) {
  const [isMob, setIsMob] = useState(() =>
    typeof window === 'undefined' ? false : window.innerWidth <= breakpoint
  );
  useEffect(() => {
    const onResize = () => setIsMob(window.innerWidth <= breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return isMob;
}

// ─── Top nav (desktop) ────────────────────────────────────────
function TopNav() {
  const [openStandings, setOpenStandings] = useState(false);
  const route = currentRouteName();
  return (
    <nav className="nav nav-desktop">
      <a className="nav-logo" href={urlFor({ name: 'home' })}>
        <span className="dot"></span>F1GURES
        <span className="nav-version">v{APP_VERSION}</span>
      </a>
      <div className="nav-items">
        <a className={`nav-item ${route === 'home' ? 'active' : ''}`} href={urlFor({ name: 'home' })}>Home</a>

        <div style={{ position: 'relative', height: '100%' }}
             onMouseEnter={() => setOpenStandings(true)}
             onMouseLeave={() => setOpenStandings(false)}>
          <button className={`nav-item ${route.startsWith('standings') ? 'active' : ''}`}>
            Standings<span className="caret">▼</span>
          </button>
          {openStandings && (
            <div className="nav-dropdown" style={{ top: 'calc(100% - 1px)' }}>
              <a href={urlFor({ name: 'standings-d' })}>Drivers</a>
              <a href={urlFor({ name: 'standings-c' })}>Constructors</a>
            </div>
          )}
        </div>

        <a className={`nav-item ${route === 'calendar' || route === 'race' ? 'active' : ''}`}
           href={urlFor({ name: 'calendar' })}>Calendar</a>
        <a className={`nav-item ${route === 'circuits' || route === 'circuit' ? 'active' : ''}`}
           href={urlFor({ name: 'circuits' })}>Circuits</a>
      </div>
      <div className="nav-spacer"></div>
      <button className="nav-season">
        {(window.F1_DATA && window.F1_DATA.seasonYear) || '2026'} <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
      </button>
    </nav>
  );
}

// ─── Mobile top bar ───────────────────────────────────────────
function MobileTopBar() {
  return (
    <div className="topbar-mobile">
      <a className="nav-logo" href={urlFor({ name: 'home' })}>
        <span className="dot"></span>F1GURES
        <span className="nav-version">v{APP_VERSION}</span>
      </a>
      <div className="spacer"></div>
      <button className="nav-season">{(window.F1_DATA && window.F1_DATA.seasonYear) || '2026'} ▾</button>
    </div>
  );
}

// ─── Bottom nav (mobile) ──────────────────────────────────────
function BotNav() {
  const route = currentRouteName();
  const items = [
    { id: 'home',      label: 'Home',      icon: '◇', href: urlFor({ name: 'home' }) },
    { id: 'standings', label: 'Standings', icon: '≡', href: urlFor({ name: 'standings-d' }) },
    { id: 'calendar',  label: 'Calendar',  icon: '▦', href: urlFor({ name: 'calendar' }) },
    { id: 'circuits',  label: 'Circuits',  icon: '◈', href: urlFor({ name: 'circuits' }) },
  ];
  const activeId =
    route === 'home'                              ? 'home' :
    route.startsWith('standings')                 ? 'standings' :
    (route === 'calendar' || route === 'race')    ? 'calendar' :
    (route === 'circuits' || route === 'circuit') ? 'circuits' :
    null;
  return (
    <nav className="botnav botnav-mobile">
      {items.map(it => (
        <a key={it.id} className={`botnav-item ${activeId === it.id ? 'active' : ''}`} href={it.href}>
          <span className="botnav-icon">{it.icon}</span>
          <span>{it.label}</span>
        </a>
      ))}
    </nav>
  );
}

// ─── Chrome: wraps every page ─────────────────────────────────
function Chrome({ children }) {
  return (
    <div className="f1-app">
      <TopNav />
      <MobileTopBar />
      {children}
      <BotNav />
    </div>
  );
}

// ─── Reusable building blocks ─────────────────────────────────
function Panel({ title, action, children, tight, style }) {
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

function SectionHead({ title, right }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      <div className="section-rule"></div>
      {right}
    </div>
  );
}

function ChangeIndicator({ change }) {
  if (change === 0 || change == null) return <span className="chg flat">— 0</span>;
  if (change > 0) return <span className="chg up">▲ {change}</span>;
  return <span className="chg down">▼ {Math.abs(change)}</span>;
}

function StatusPill({ status }) {
  return <span className={`pill pill-${status.toLowerCase()}`}>{status}</span>;
}

function SprintBadge() {
  return <span className="pill pill-sprint">Sprint</span>;
}

function DriverCell({ driver, showCode = true }) {
  const D = window.F1_DATA;
  const team = D.teamById(driver.team);
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

// ─── Countdown ────────────────────────────────────────────────
function Countdown({ target }) {
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

// ─── Driver silhouette placeholder ────────────────────────────
function DriverSilhouette({ driver, height = 200 }) {
  const D = window.F1_DATA;
  const team = D.teamById(driver.team);
  return (
    <div className="silhouette" style={{ height, '--team-color': team.color }}>
      <svg viewBox="0 0 100 120" preserveAspectRatio="xMidYMax meet">
        <path d="M50 12 C28 12 18 28 18 46 L18 60 L14 70 L14 82 L20 88 L20 120 L80 120 L80 88 L86 82 L86 70 L82 60 L82 46 C82 28 72 12 50 12 Z M30 50 L70 50 L70 60 L30 60 Z" fill={team.color} />
      </svg>
      <span style={{ position: 'relative', zIndex: 1 }}>{driver.code} · #{driver.num}</span>
    </div>
  );
}

// ─── Date helpers ─────────────────────────────────────────────
function fmtDate(iso, opts = {}) {
  const d = new Date(iso + 'T14:00:00Z');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', ...opts });
}
function fmtDateLong(iso) {
  const d = new Date(iso + 'T14:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

// Expose to global scope so screen files can use them
Object.assign(window, {
  Chrome, TopNav, MobileTopBar, BotNav,
  Panel, SectionHead, ChangeIndicator, StatusPill, SprintBadge,
  DriverCell, Countdown, DriverSilhouette,
  fmtDate, fmtDateLong,
  urlFor, navigate, getParam, currentRouteName,
  useIsMobile,
});
