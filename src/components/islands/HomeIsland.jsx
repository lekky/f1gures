import { useEffect, useState } from 'react';
import { buildFallback, buildFromYearJson } from '../../data/buildFallback.js';
import HomeScreen from './screens/HomeScreen.jsx';

const fallback = buildFallback();

export default function HomeIsland() {
  const [data, setData] = useState(fallback);

  useEffect(() => {
    let stored = null;
    try { stored = localStorage.getItem('f1-year'); } catch (e) {}
    if (!stored || stored === 'current' || stored === fallback.seasonYear) return;

    let cancelled = false;
    fetch(`/data/${stored}.json`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`no bundle for ${stored}`)))
      .then(json => { if (!cancelled) setData(buildFromYearJson(json)); })
      .catch(() => { /* keep fallback if year bundle is missing */ });

    return () => { cancelled = true; };
  }, []);

  return <HomeScreen data={data} />;
}
