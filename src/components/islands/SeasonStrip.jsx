// Season strip — the site's single season control, a full-width bar under the
// nav. Replaces the old top-right YearPicker dropdown.
//
// State-as-colour: brand red in the current/live season, champion gold in
// "archive mode" (any past year). The colour itself signals where you are.
//
// Like the year-aware islands, the selected year comes from ?year= / the
// f1-year localStorage key — never from server state. On SSR (and the first
// client render, to avoid a hydration mismatch) the strip renders the current
// season; a useEffect then reads the pref and swaps to archive mode if needed.

import { forwardRef, useEffect, useRef, useState } from 'react';
import { track } from '../../lib/analytics.js';

const HISTORIC_MIN = 1950;
const FIRST_STRIP_YEAR = 2018; // panel's "Recent" split point (currentYear-1 → this)
const DESKTOP_CHIPS = 9;       // quick-chip capacity on desktop (mobile is measured)

// The routes whose islands react to ?year=. Selecting a year on any other page
// sends you home for that year (matches the old YearPicker's behaviour).
const YEAR_AWARE = new Set([
  '/', '/calendar/', '/circuits/', '/standings-drivers/', '/standings-constructors/',
]);

function readYearPref() {
  if (typeof window === 'undefined') return null;
  let pref = null;
  try { pref = localStorage.getItem('f1-year'); } catch (e) {}
  try {
    const urlYear = new URLSearchParams(window.location.search).get('year');
    if (urlYear) pref = urlYear;
  } catch (e) {}
  if (!pref || pref === 'current') return null;
  const n = Number(pref);
  return Number.isFinite(n) ? n : null;
}

function range(from, to) {
  // inclusive, descending (from ≥ to)
  const out = [];
  for (let y = from; y >= to; y--) out.push(y);
  return out;
}

// A window of `size` years centred on `center`, clamped to [min, max], returned
// newest-first. Lets the strip show the selected year flanked by its neighbours
// (±1, ±2, …) so adjacent seasons are one click away. Near an edge the window
// slides inward to keep the full count.
function windowAround(center, size, min, max) {
  size = Math.max(1, Math.min(size, max - min + 1));
  let lo = center - Math.floor((size - 1) / 2);
  let hi = center + Math.ceil((size - 1) / 2);
  if (lo < min) { hi += min - lo; lo = min; }
  if (hi > max) { lo -= hi - max; hi = max; }
  lo = Math.max(lo, min);
  return range(hi, lo);
}

export default function SeasonStrip({
  currentYear,
  nextRound = null,
  totalRounds = null,
  nextRaceName = '',
  seasonComplete = false,
}) {
  const [selected, setSelected] = useState(currentYear); // SSR-safe: current
  const [panelOpen, setPanelOpen] = useState(false);
  const [expandedDecade, setExpandedDecade] = useState(null); // e.g. 1980
  const [meta, setMeta] = useState(null); // fetched _seasons.json
  // How many quick-chips fit. SSR/desktop default = DESKTOP_CHIPS; on mobile the
  // effect measures the row and shrinks it to what fits on one line.
  const [capacity, setCapacity] = useState(DESKTOP_CHIPS);
  const chipRef = useRef(null);
  const panelRef = useRef(null);
  const chipsRowRef = useRef(null);

  // Resolve the picked year after mount (keeps first render === server HTML).
  useEffect(() => {
    const pref = readYearPref();
    if (pref && pref !== currentYear) setSelected(pref);
  }, [currentYear]);

  // Reveal the strip (a pre-hydration script cloaks it when a past year is
  // pending) only once our state reflects that year — so its first visible
  // frame is the correct archive state, never a flash of the current season.
  useEffect(() => {
    const html = document.documentElement;
    if (!html.classList.contains('sstrip-cloak')) return;
    const pending = readYearPref();
    if (pending == null || selected === pending) html.classList.remove('sstrip-cloak');
  }, [selected]);

  // Failsafe: never leave the strip cloaked if the pref can't be resolved.
  useEffect(() => {
    const t = setTimeout(() => document.documentElement.classList.remove('sstrip-cloak'), 2000);
    return () => clearTimeout(t);
  }, []);

  const archive = selected !== currentYear;

  // Quick chips, sized to what the device fits:
  //  - a recent selection (within the last `capacity` years) shows the recent
  //    block anchored at the current year, so "back to now" stays in view;
  //  - a deep-historic selection centres the window on the picked year so you
  //    can browse its neighbours (±1, ±2, …).
  const recentFloor = currentYear - capacity + 1;
  const displayYears = selected >= recentFloor
    ? range(currentYear, Math.max(HISTORIC_MIN, recentFloor))
    : windowAround(selected, capacity, HISTORIC_MIN, currentYear);

  // Lazy-load the champion/rounds map the first time we need archive labels.
  useEffect(() => {
    if (!archive && !panelOpen) return;
    if (meta) return;
    let cancelled = false;
    fetch('/data/archive/_seasons.json')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('no season meta'))))
      .then(j => { if (!cancelled) setMeta(j); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [archive, panelOpen, meta]);

  // Panel dismissal: outside click + Esc.
  useEffect(() => {
    if (!panelOpen) return;
    function onDown(e) {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        chipRef.current && !chipRef.current.contains(e.target)
      ) closePanel();
    }
    function onKey(e) { if (e.key === 'Escape') closePanel(); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [panelOpen]);

  // Responsive capacity: on mobile (≤900px) fit as many quick-chips on one row
  // as the width allows while keeping the decade chip visible — never scroll.
  // Desktop uses a fixed count. Year chips are uniform width (4 digits), so we
  // measure the widest rendered chip and divide the free space by it.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    function recompute() {
      if (!mq.matches) { setCapacity(DESKTOP_CHIPS); return; }
      const row = chipsRowRef.current;
      if (!row) return;
      const chips = [...row.querySelectorAll('.sstrip-chip')];
      const decade = row.querySelector('.sstrip-decade-chip');
      const divider = row.querySelector('.sstrip-div');
      if (!chips.length || !decade) return;
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const chipW = Math.max(...chips.map(c => c.getBoundingClientRect().width));
      let dividerW = 0;
      if (divider) {
        const d = getComputedStyle(divider);
        dividerW = divider.getBoundingClientRect().width +
          (parseFloat(d.marginLeft) || 0) + (parseFloat(d.marginRight) || 0);
      }
      const avail = row.clientWidth - decade.getBoundingClientRect().width - dividerW - gap;
      const cap = Math.floor((avail + gap) / (chipW + gap));
      setCapacity(Math.max(3, cap));
    }
    recompute();
    window.addEventListener('resize', recompute);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [currentYear]);

  // Lock background scroll while the mobile bottom sheet is open — otherwise a
  // touch-drag inside the sheet scrolls the page behind it. The position:fixed
  // technique is the reliable cross-browser (incl. iOS) lock: pin <body> at its
  // current scroll offset, then restore the offset on close.
  useEffect(() => {
    if (!panelOpen) return;
    if (!window.matchMedia('(max-width: 900px)').matches) return;
    const body = document.body;
    const scrollY = window.scrollY;
    const prev = {
      position: body.style.position, top: body.style.top,
      left: body.style.left, right: body.style.right, width: body.style.width,
    };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, [panelOpen]);

  function closePanel() { setPanelOpen(false); setExpandedDecade(null); }

  function pick(year) {
    const isCurrent = year === currentYear;
    const val = isCurrent ? 'current' : String(year);
    try { localStorage.setItem('f1-year', val); } catch (e) {}
    track('year_change', {
      year: val,
      from_page: typeof location !== 'undefined' ? location.pathname : undefined,
    });
    const path = typeof location !== 'undefined' ? location.pathname : '/';
    const base = YEAR_AWARE.has(path) ? path : '/';
    window.location.href = isCurrent ? base : `${base}?year=${year}`;
  }

  // ── Meta strings ────────────────────────────────────────────────
  // The panel is a full-range picker (the strip only shows a window near the
  // selected year), so the trigger spans 1950 → current.
  const panelLabel = `${HISTORIC_MIN}–${currentYear}`;

  let metaText;
  if (archive) {
    const sm = meta && meta[selected];
    const bits = [String(selected), sm && sm.complete === false ? 'IN PROGRESS' : 'COMPLETE'];
    if (sm && sm.champion) bits.push(`${sm.champion} champion`);
    metaText = bits.join(' · ');
  } else if (seasonComplete || nextRound == null) {
    metaText = 'SEASON COMPLETE';
  } else {
    const next = nextRaceName ? `${nextRaceName} next` : '';
    metaText = [`ROUND ${nextRound}/${totalRounds}`, next].filter(Boolean).join(' · ');
  }

  const labelChip = archive ? 'Archive' : 'Season';

  return (
    <div className={`sstrip${archive ? ' sstrip-archive' : ''}`} data-year={selected}>
      <div className="sstrip-inner">
        <span className="sstrip-label">{labelChip}</span>

        <div className="sstrip-chips" role="group" aria-label="Season" ref={chipsRowRef}>
          {displayYears.map((y) => (
            <button
              key={y}
              type="button"
              className={`sstrip-chip${y === selected ? ' active' : ''}`}
              aria-current={y === selected ? 'true' : undefined}
              onClick={() => pick(y)}
            >
              {y}
            </button>
          ))}

          <span className="sstrip-div" aria-hidden="true" />

          <button
            type="button"
            ref={chipRef}
            className={`sstrip-decade-chip${panelOpen ? ' open' : ''}`}
            aria-expanded={panelOpen}
            aria-haspopup="dialog"
            onClick={() => setPanelOpen(o => !o)}
          >
            {panelLabel} {panelOpen ? '▲' : '▾'}
          </button>
        </div>

        <div className="sstrip-meta" aria-live="polite">
          {!archive && <span className="sstrip-dot" aria-hidden="true" />}
          {!archive && <span className="sstrip-live">Live</span>}
          <span className="sstrip-meta-text">{metaText}</span>
        </div>

        {archive && (
          <button type="button" className="sstrip-back" onClick={() => pick(currentYear)}>
            Back to {currentYear} →
          </button>
        )}
      </div>

      {panelOpen && (
        <DecadePanel
          ref={panelRef}
          currentYear={currentYear}
          selected={selected}
          archive={archive}
          nextRound={nextRound}
          totalRounds={totalRounds}
          expandedDecade={expandedDecade}
          setExpandedDecade={setExpandedDecade}
          onPick={pick}
          onClose={closePanel}
        />
      )}
    </div>
  );
}

// Decade-grouped season picker for 1950 → (FIRST_STRIP_YEAR-1). Anchored
// dropdown on desktop, bottom sheet on mobile (styled via CSS).
const DecadePanel = forwardRef(function DecadePanel(
  { currentYear, selected, archive, nextRound, totalRounds, expandedDecade, setExpandedDecade, onPick, onClose },
  ref,
) {
  // Named decade groups shown with full year grids (2010s..1990s).
  const namedDecades = [
    { label: '2010s', years: range(FIRST_STRIP_YEAR - 1, 2010) },
    { label: '2000s', years: range(2009, 2000) },
    { label: '1990s', years: range(1999, 1990) },
  ].filter(g => g.years.length);

  // Collapsed decades (1980s..1950s); clicking expands one in place.
  const earlierDecades = [1980, 1970, 1960, 1950];

  return (
    <>
      <div className="sstrip-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        className="sstrip-panel"
        role="dialog"
        aria-modal="false"
        aria-label="All seasons"
      >
        <div className="sstrip-panel-mobilehead">
          <span>All seasons</span>
          <button type="button" className="sstrip-panel-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Always-present way home */}
        <button type="button" className="sstrip-panel-current" onClick={() => onPick(currentYear)}>
          <span className="sstrip-panel-current-l">
            <span className="sstrip-dot" aria-hidden="true" />
            Current season · {currentYear}
          </span>
          {nextRound != null && (
            <span className="sstrip-panel-current-r">Round {nextRound}/{totalRounds}</span>
          )}
        </button>

        {/* Recent years grid — only shown on mobile (CSS), where the strip caps
            its chips to a few years to avoid horizontal scroll. Keeps the
            capped-off years (currentYear-1 → FIRST_STRIP_YEAR) reachable. */}
        {range(currentYear - 1, FIRST_STRIP_YEAR).length > 0 && (
          <section className="sstrip-decade sstrip-recent">
            <div className="sstrip-decade-head">
              <span>Recent</span>
              <span className="sstrip-decade-rule" aria-hidden="true" />
            </div>
            <div className="sstrip-year-grid">
              {range(currentYear - 1, FIRST_STRIP_YEAR).map(y => (
                <YearCell key={y} year={y} selected={selected} archive={archive} onPick={onPick} />
              ))}
            </div>
          </section>
        )}

        {namedDecades.map(group => (
          <section className="sstrip-decade" key={group.label}>
            <div className="sstrip-decade-head">
              <span>{group.label}</span>
              <span className="sstrip-decade-rule" aria-hidden="true" />
            </div>
            <div className="sstrip-year-grid">
              {group.years.map(y => (
                <YearCell key={y} year={y} selected={selected} archive={archive} onPick={onPick} />
              ))}
            </div>
          </section>
        ))}

        <section className="sstrip-decade sstrip-earlier">
          <div className="sstrip-decade-head">
            <span>{expandedDecade ? `${expandedDecade}s` : 'Earlier'}</span>
            <span className="sstrip-decade-rule" aria-hidden="true" />
            {expandedDecade && (
              <button type="button" className="sstrip-decade-back" onClick={() => setExpandedDecade(null)}>
                ‹ Decades
              </button>
            )}
          </div>
          {expandedDecade ? (
            <div className="sstrip-year-grid">
              {range(expandedDecade + 9, expandedDecade).map(y => (
                <YearCell key={y} year={y} selected={selected} archive={archive} onPick={onPick} />
              ))}
            </div>
          ) : (
            <div className="sstrip-decade-grid">
              {earlierDecades.map(d => (
                <button
                  key={d}
                  type="button"
                  className="sstrip-decade-cell"
                  onClick={() => setExpandedDecade(d)}
                >
                  {d}s
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
});

function YearCell({ year, selected, archive, onPick }) {
  const active = year === selected;
  return (
    <button
      type="button"
      className={`sstrip-year-cell${active ? ' active' : ''}${active && archive ? ' active-archive' : ''}`}
      aria-current={active ? 'true' : undefined}
      onClick={() => onPick(year)}
    >
      {year}
    </button>
  );
}
