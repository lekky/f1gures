// Grid dropdown - React island for the click-driven Drivers / Teams / Circuits
// menu in the desktop top nav. Mirrors StandingsDropdown: the "Grid" bucket
// groups the competitor + track roster (people, machines, the places they
// race) under one top-level item.

import { useEffect, useRef, useState } from 'react';

export default function GridDropdown({ active = false }) {
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
        Grid<span className="caret">▼</span>
      </button>
      {open && (
        <div className="nav-dropdown" style={{ top: 'calc(100% - 1px)' }}>
          <a href="/drivers/">Drivers</a>
          <a href="/teams/">Teams</a>
          <a href="/circuits/">Circuits</a>
        </div>
      )}
    </div>
  );
}
