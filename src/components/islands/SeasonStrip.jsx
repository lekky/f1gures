// Season strip — the site's single season control, a single 40 px row under
// the nav (44 px on mobile). Replaces the old top-right YearPicker dropdown.
//
// State-as-colour, but only on the ACTIVE chip: brand red in the current/live
// season, champion gold in "archive mode" (any past year). The row itself sits
// on a neutral --bg-2 ground so the chip is the one coloured element — the
// site's one-red-per-screen rule. Year chips scroll horizontally (scrollbar
// hidden) with the full 1950→now picker as the last chip.
//
// Like the year-aware islands, the selected year comes from ?year= / the
// f1-year localStorage key — never from server state. On SSR (and the first
// client render, to avoid a hydration mismatch) the strip renders the current
// season; a useEffect then reads the pref and swaps to archive mode if needed.

import { forwardRef, useEffect, useRef, useState } from 'react';
import { track } from '../../lib/analytics.js';

const HISTORIC_MIN = 1950;
const MAX_CHIPS = 9; // quick-chips in the row (kept odd so the pick centres)

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
  const [meta, setMeta] = useState(null); // fetched _seasons.json
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

  // Quick chips centred on the selected year (selected in the middle, flanked
  // by its neighbours ±1, ±2, …) so you can click straight through adjacent
  // seasons. Clamped to [1950, currentYear], so at either end the window slides
  // inward rather than showing empty slots. The row scrolls horizontally when
  // the chips don't fit (narrow phones), so no width measuring is needed.
  const displayYears = windowAround(selected, MAX_CHIPS, HISTORIC_MIN, currentYear);

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

  // The chip row scrolls horizontally when it overflows (narrow phones). Keep
  // the active chip in view — centred when it sits mid-window — by scrolling
  // the row itself (never scrollIntoView, which can also scroll the page).
  useEffect(() => {
    const row = chipsRowRef.current;
    if (!row) return;
    const el = row.querySelector('.sstrip-chip.active');
    if (!el) return;
    const target = el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2;
    row.scrollLeft = Math.max(0, target);
  }, [selected]);

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

  function closePanel() { setPanelOpen(false); }

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

  // Compact, mono, right-aligned: "R13 · Italian GP" in the live season (the
  // red dot before it is the strip's live marker), "Complete · Senna champion"
  // in archive mode. The full sentence lives in the aria-label.
  let metaText;
  let metaLabel;
  if (archive) {
    const sm = meta && meta[selected];
    const state = sm && sm.complete === false ? 'In progress' : 'Complete';
    const bits = [state];
    if (sm && sm.champion) bits.push(`${sm.champion} champion`);
    metaText = bits.join(' · ');
    metaLabel = `${selected} season · ${metaText}`;
  } else if (seasonComplete || nextRound == null) {
    metaText = 'Season complete';
    metaLabel = `${currentYear} season complete`;
  } else {
    const gp = nextRaceName ? nextRaceName.replace(/\bGrand Prix\b/i, 'GP').trim() : '';
    metaText = [`R${nextRound}`, gp].filter(Boolean).join(' · ');
    metaLabel = `Live season · round ${nextRound} of ${totalRounds}${gp ? ` · ${gp} next` : ''}`;
  }

  return (
    <div className={`sstrip${archive ? ' sstrip-archive' : ''}`} data-year={selected}>
      <div className="sstrip-inner">
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
          <span className="sr-only">{metaLabel}</span>
          <span className="sstrip-meta-text" aria-hidden="true">{metaText}</span>
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
          onPick={pick}
          onClose={closePanel}
        />
      )}
    </div>
  );
}

// Full season picker: every decade from the current one down to the 1950s, each
// as a complete year grid, scrollable. Anchored dropdown on desktop, bottom
// sheet on mobile (styled via CSS).
const DecadePanel = forwardRef(function DecadePanel(
  { currentYear, selected, archive, nextRound, totalRounds, onPick, onClose },
  ref,
) {
  const decades = [];
  const topDecade = Math.floor(currentYear / 10) * 10;
  for (let d = topDecade; d >= HISTORIC_MIN; d -= 10) {
    decades.push({ label: `${d}s`, years: range(Math.min(d + 9, currentYear), Math.max(d, HISTORIC_MIN)) });
  }

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

        {decades.map(group => (
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
