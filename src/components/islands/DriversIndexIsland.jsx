import { useState, useEffect } from 'react';
import DriversIndexScreen from './screens/DriversIndexScreen.jsx';

export default function DriversIndexIsland() {
  const [drivers, setDrivers] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/data/archive/_drivers-index.json')
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(setDrivers)
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div className="page"><p className="page-sub">Failed to load drivers: {error}</p></div>;
  if (!drivers) return <div className="page"><p className="page-sub">Loading…</p></div>;
  return <DriversIndexScreen drivers={drivers} />;
}
