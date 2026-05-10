// Shared hook for the 5 listing-page islands. SSR uses `fallback` (the
// current-season bundle from currentSeason.js) so the prerendered HTML
// is the SEO content. On hydration, if the visitor has picked a different
// year via the year picker (localStorage.f1-year) or `?year=` URL param,
// fetch /data/<year>.json and swap.
//
// To avoid a flash of the SSR'd current-season content while the picked
// year's bundle loads, we synchronously detect the mismatch on the first
// client render and hand the screens an empty/loading shape immediately.
// Default-year visitors still get the SEO-optimal SSR HTML with no flash.

import { useEffect, useState } from 'react';
import { buildFromYearJson } from '../data/buildFallback.js';

function readYearPref(fallbackYear) {
  if (typeof window === 'undefined') return null;
  let pref = null;
  try { pref = localStorage.getItem('f1-year'); } catch (e) {}
  try {
    const urlYear = new URLSearchParams(window.location.search).get('year');
    if (urlYear) pref = urlYear;
  } catch (e) {}
  if (!pref || pref === 'current' || pref === String(fallbackYear)) return null;
  return pref;
}

export function useYearAwareData(fallback) {
  // First-render decision. On SSR `pendingYear` is null (window undefined)
  // so the prerendered HTML matches `fallback`. On the client's first
  // render, if the visitor wants a different year we replace `fallback`
  // with an empty-loading shape so the islands render placeholders rather
  // than flashing the wrong season's data while the fetch is in flight.
  const pendingYear = readYearPref(fallback.seasonYear);
  const initial = pendingYear
    ? { ...fallback, _empty: true, _loading: true, _pendingYear: pendingYear }
    : fallback;

  const [data, setData] = useState(initial);

  useEffect(() => {
    // Pre-hydration script in BaseLayout adds `html.year-pending` to hide
    // year-aware island content before paint when a non-current year is
    // stored. By the time this effect runs React has hydrated and is
    // rendering the screen (loading or real), so it's safe to reveal.
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('year-pending');
    }
  }, []);

  useEffect(() => {
    if (!pendingYear) return;
    let cancelled = false;
    // Reuse the fallback's circuit metadata (length, corners, lap record,
    // blurb) - year JSON bundles don't include it and it's stable across
    // seasons.
    const staticCircuits = fallback.circuits || {};
    fetch(`/data/${pendingYear}.json`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`no bundle for ${pendingYear}`)))
      .then(json => { if (!cancelled) setData(buildFromYearJson(json, staticCircuits)); })
      .catch(() => { if (!cancelled) setData(fallback); });

    return () => { cancelled = true; };
  }, [pendingYear]);

  return data;
}
