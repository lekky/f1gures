// Standings dropdown — React island for the click-driven Drivers/Constructors
// menu in the desktop top nav. Replaces the inline TopNav dropdown logic from
// shell.jsx.

import { useEffect, useRef, useState } from 'react';

export default function StandingsDropdown({ active = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', height: '100%' }}>
      <button className={`nav-item ${active ? 'active' : ''}`}
              onClick={() => setOpen(o => !o)}>
        Standings<span className="caret">▼</span>
      </button>
      {open && (
        <div className="nav-dropdown" style={{ top: 'calc(100% - 1px)' }}>
          <a href="/standings-drivers/">Drivers</a>
          <a href="/standings-constructors/">Constructors</a>
        </div>
      )}
    </div>
  );
}
