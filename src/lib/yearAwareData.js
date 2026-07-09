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

// Finish the top progress bar (rendered in BaseLayout) — drive it to 100% and
// fade it out, using inline styles so it keeps animating even after the
// year-pending class (which started the trickle in CSS) is removed. Reset to
// zero afterwards so a later navigation starts clean.
function finishYearBar() {
  if (typeof document === 'undefined') return;
  const bar = document.getElementById('year-load-bar');
  if (!bar) return;
  const w = bar.getBoundingClientRect().width;
  bar.style.transition = 'none';
  bar.style.width = `${w}px`;
  bar.getBoundingClientRect(); // force reflow so the jump to 100% animates
  bar.style.transition = 'width .18s ease-out, opacity .35s ease .1s';
  bar.style.width = '100%';
  bar.style.opacity = '0';
  window.setTimeout(() => {
    bar.style.transition = 'none';
    bar.style.width = '0';
    bar.style.removeProperty('opacity');
  }, 520);
}

// Reveal the year-aware content and finish the progress bar. No-op for
// default-year visitors (year-pending was never added).
function revealYearAware() {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (!html.classList.contains('year-pending')) return;
  finishYearBar();          // finish while the bar is still visible (class on)
  html.classList.remove('year-pending');
}

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

  // Reveal the content (and finish the progress bar) once the real bundle has
  // rendered. Keyed on `data` so it runs AFTER React commits the loaded
  // season - removing year-pending any earlier would flash the hidden loading
  // placeholder for a frame. The pre-hydration script keeps content hidden and
  // the top bar trickling until this fires; default-year visitors have data
  // that is never `_loading`, so this reveals on mount (a no-op - year-pending
  // was never added).
  useEffect(() => {
    if (data && data._loading) return;
    revealYearAware();
  }, [data]);

  useEffect(() => {
    if (!pendingYear) return;
    let cancelled = false;
    // Reuse the fallback's circuit metadata (length, corners, lap record,
    // blurb) - year JSON bundles don't include it and it's stable across
    // seasons.
    const staticCircuits = fallback.circuits || {};
    // Failsafe: never leave content stranded behind a stalled fetch. If the
    // bundle hasn't resolved in 10s, drop back to the current-season data
    // (which reveals via the effect above).
    const failsafe = setTimeout(() => { if (!cancelled) setData(fallback); }, 10000);
    fetch(`/data/${pendingYear}.json`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`no bundle for ${pendingYear}`)))
      .then(json => { if (!cancelled) setData(buildFromYearJson(json, staticCircuits)); })
      .catch(() => { if (!cancelled) setData(fallback); })
      .finally(() => clearTimeout(failsafe));

    return () => { cancelled = true; clearTimeout(failsafe); };
  }, [pendingYear]);

  return data;
}
