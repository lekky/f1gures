// Year picker - React island for the season dropdown.
// Selecting a year writes localStorage and navigates to home. The Astro page's
// data-loading layer reads ?year= or localStorage.f1-year to decide which season
// JSON to load.

import { useEffect, useRef, useState } from 'react';

function useClickOutside(ref, onClose) {
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onClose]);
}

export default function YearPicker({ compact = false }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('current');
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));

  useEffect(() => {
    let saved = 'current';
    try { saved = localStorage.getItem('f1-year') || 'current'; } catch (e) {}
    // ?year= URL param overrides localStorage
    try {
      const urlYear = new URLSearchParams(window.location.search).get('year');
      if (urlYear) saved = urlYear;
    } catch (e) {}
    setSelected(saved);
  }, []);

  const liveYear = new Date().getFullYear();
  const label = selected === 'current' ? liveYear : selected;
  const maxYear = liveYear;
  const years = [];
  for (let y = maxYear; y >= 1950; y--) years.push(String(y));

  const pick = (year) => {
    try { localStorage.setItem('f1-year', year); } catch (e) {}
    window.location.href = year === 'current' ? '/' : `/?year=${year}`;
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
