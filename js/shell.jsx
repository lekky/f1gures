// f1gures — shared shell for the deployed multi-page app.
// Provides:
//   <Chrome>      — wraps every page with desktop top-nav, mobile top-bar, mobile bot-nav.
//   urlFor()/navigate()/getParam() — URL helpers (replace the prototype's setRoute).
//   useIsMobile() — viewport hook used by screens to switch desktop/mobile layouts.
//   Panel, SectionHead, ChangeIndicator, StatusPill, SprintBadge,
//   DriverCell, Countdown, DriverSilhouette, fmtDate, fmtDateLong.

const { useState, useEffect, useMemo } = React;

const APP_VERSION = '1.026';
// Buy Me a Coffee — script tag in each *.html injects #bmc-wbtn (a fixed
// floating button) and #bmc-iframe (the modal). We restyle the FAB into a
// flatter rectangle in css/app.css so it reads as a Support CTA, not a
// circular badge.

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
    case 'team':         return `team.html?id=${encodeURIComponent(target.id)}`;
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
  if (path === 'team.html')                   return 'team';
  return 'home';
}

// ─── Theme ────────────────────────────────────────────────────
function useTheme() {
  const [theme, setTheme] = useState(() => {
    const saved = (typeof localStorage !== 'undefined' && localStorage.getItem('f1-theme')) || 'light';
    document.documentElement.classList.toggle('light', saved === 'light');
    return saved;
  });
  const setMode = (next) => setTheme(() => {
    document.documentElement.classList.toggle('light', next === 'light');
    localStorage.setItem('f1-theme', next);
    return next;
  });
  return { theme, setMode };
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

// ─── Click-outside helper ─────────────────────────────────────
// Calls onClose if the user clicks anywhere outside the ref'd element.
// Used by the dropdowns so they dismiss when you click away.
function useClickOutside(ref, onClose) {
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onClose]);
}

// ─── Year picker ──────────────────────────────────────────────
// Dropdown listing 1950..currentRealYear plus "Current Season" at the top.
// Selecting a year writes to localStorage and reloads to index.html so the
// new season's data loads cleanly (deep pages might not have matching state).
// Click-driven (not hover) — works on touch devices and is less twitchy than
// the previous hover-only behaviour.
function YearPicker({ compact }) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);
  useClickOutside(ref, () => setOpen(false));

  const selected = (typeof window !== 'undefined' && window.F1_SELECTED_YEAR) || 'current';
  const liveYear = (window.F1_DATA && window.F1_DATA.seasonYear) || (new Date()).getFullYear();
  const label = selected === 'current' ? liveYear : selected;
  const maxYear = (new Date()).getFullYear();
  const years = [];
  for (let y = maxYear; y >= 1950; y--) years.push(String(y));

  const pick = (year) => {
    try { localStorage.setItem('f1-year', year); } catch (e) {}
    window.location.href = urlFor({ name: 'home' });
  };

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button className="nav-season" onClick={() => setOpen(o => !o)}>
        {label} {compact ? '▾' : <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>}
      </button>
      {open && (
        <div className="nav-dropdown nav-dropdown-years" style={{ top: 'calc(100% - 1px)', right: 0, left: 'auto' }}>
          <button onClick={() => pick('current')}
                  className={selected === 'current' ? 'active' : ''}>
            Current Season
          </button>
          <div className="dropdown-divider" />
          {years.map(y => (
            <button key={y} onClick={() => pick(y)}
                    className={selected === y ? 'active' : ''}>
              {y}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Theme switcher ───────────────────────────────────────────
function ThemeSwitcher({ theme, setMode }) {
  return (
    <div className="theme-switcher" role="group" aria-label="Theme">
      <button className={`theme-opt ${theme === 'light' ? 'active' : ''}`}
              onClick={() => setMode('light')}>Light</button>
      <button className={`theme-opt ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => setMode('dark')}>Dark</button>
    </div>
  );
}

// ─── Top nav (desktop) ────────────────────────────────────────
function TopNav({ theme, setMode }) {
  const [openStandings, setOpenStandings] = useState(false);
  const standingsRef = React.useRef(null);
  useClickOutside(standingsRef, () => setOpenStandings(false));
  const route = currentRouteName();
  return (
    <nav className="nav nav-desktop">
      <a className="nav-logo" href={urlFor({ name: 'home' })}>
        <span className="dot"></span>F1GURES
        <span className="nav-version">v{APP_VERSION}</span>
      </a>
      <div className="nav-items">
        <a className={`nav-item ${route === 'home' ? 'active' : ''}`} href={urlFor({ name: 'home' })}>Home</a>

        <div ref={standingsRef} style={{ position: 'relative', height: '100%' }}>
          <button className={`nav-item ${route.startsWith('standings') ? 'active' : ''}`}
                  onClick={() => setOpenStandings(o => !o)}>
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
      <div className="nav-controls">
        <ThemeSwitcher theme={theme} setMode={setMode} />
        <YearPicker />
      </div>
    </nav>
  );
}

// ─── Mobile top bar ───────────────────────────────────────────
function MobileTopBar({ theme, setMode }) {
  return (
    <div className="topbar-mobile">
      <a className="nav-logo topbar-logo" href={urlFor({ name: 'home' })}>
        <span className="dot"></span>F1GURES
      </a>
      <div style={{ flex: 1 }}></div>
      <ThemeSwitcher theme={theme} setMode={setMode} />
      <YearPicker compact />
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
  const { theme, setMode } = useTheme();
  return (
    <div className="f1-app">
      <TopNav theme={theme} setMode={setMode} />
      <MobileTopBar theme={theme} setMode={setMode} />
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
  const team = D.teamById(driver.team) || { color: '#888888', short: '—', name: '—' };
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

// ─── Driver silhouette / headshot ─────────────────────────────
// When a real headshot exists at images/drivers/<jolpicaId>.webp, render it.
// Otherwise (or on load error) fall back to the team-coloured SVG silhouette
// with the driver's code/number — the historic placeholder still works for
// drivers we don't have photos of yet.
function DriverSilhouette({ driver, height = 200 }) {
  const D = window.F1_DATA;
  const team = D.teamById(driver.team);
  const [imgFailed, setImgFailed] = useState(false);
  const src = driver.jolpicaId ? 'images/drivers/' + driver.jolpicaId + '.webp' : null;

  if (src && !imgFailed) {
    return (
      <div className="silhouette silhouette-photo" style={{ height, '--team-color': team.color }}>
        <img src={src} alt={driver.first + ' ' + driver.last} onError={() => setImgFailed(true)} />
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
