// Shared hook for the 5 listing-page islands. SSR / initial render uses
// `fallback` (the speculative 2026 dataset from buildFallback) so the
// prerendered HTML is the SEO content. On hydration, if the visitor has
// picked a non-current, non-fallback year via the year picker (writes to
// localStorage.f1-year), fetch /data/<year>.json and swap the data so the
// screen re-renders with that season's results, calendar, drivers, etc.
//
// PR 1 of the migration carved this out as a known limitation; this hook
// closes the gap for all 5 listing pages with one place to change.

import { useEffect, useState } from 'react';
import { buildFromYearJson } from '../data/buildFallback.js';

export function useYearAwareData(fallback) {
  const [data, setData] = useState(fallback);

  useEffect(() => {
    let stored = null;
    try { stored = localStorage.getItem('f1-year'); } catch (e) {}
    // ?year= URL param overrides localStorage (matches YearPicker's logic)
    try {
      const urlYear = new URLSearchParams(window.location.search).get('year');
      if (urlYear) stored = urlYear;
    } catch (e) {}
    if (!stored || stored === 'current' || stored === fallback.seasonYear) return;

    let cancelled = false;
    // Reuse the fallback's hand-curated circuit metadata (length, corners,
    // lap record, blurb, etc.) — year JSON bundles don't include it, and
    // it's stable across seasons.
    const staticCircuits = fallback.circuits || {};
    fetch(`/data/${stored}.json`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`no bundle for ${stored}`)))
      .then(json => { if (!cancelled) setData(buildFromYearJson(json, staticCircuits)); })
      .catch(() => { /* keep fallback if year bundle is missing */ });

    return () => { cancelled = true; };
  }, []);

  return data;
}
