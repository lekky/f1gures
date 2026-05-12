import { useState, useEffect } from 'react';
import TeamsIndexScreen from './screens/TeamsIndexScreen.jsx';

export default function TeamsIndexIsland() {
  const [teams, setTeams] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/data/archive/_teams-index.json')
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(setTeams)
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div className="page"><p className="page-sub">Failed to load teams: {error}</p></div>;
  if (!teams) return <div className="page"><p className="page-sub">Loading…</p></div>;
  return <TeamsIndexScreen teams={teams} />;
}
