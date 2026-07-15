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
const FIRST_STRIP_YEAR = 2018; // strip chips run currentYear → this; older = panel

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
  const [maxChips, setMaxChips] = useState(null); // null = show all (desktop/SSR)
  const chipRef = useRef(null);
  const panelRef = useRef(null);
  const chipsRowRef = useRef(null);

  const stripYears = range(currentYear, FIRST_STRIP_YEAR); // current → 2018

  // Resolve the picked year after mount (keeps first render === server HTML).
  useEffect(() => {
    const pref = readYearPref();
    if (pref && pref !== currentYear) setSelected(pref);
  }, [currentYear]);

  const archive = selected !== currentYear;

  // If a year outside the quick range is picked (e.g. 1999), surface it as an
  // active chip at the head of the strip so the quick list reflects the choice
  // — instead of only the "1950–2017" chip carrying the highlight.
  const displayYears = archive && !stripYears.includes(selected)
    ? [selected, ...stripYears]
    : stripYears;

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

  // Responsive chip count: on mobile (≤900px) show as many year chips as fit on
  // one row while keeping the decade chip visible — never scroll. Desktop shows
  // all. Measurement runs with every chip momentarily visible (setMaxChips(null)
  // → measure in the next frame → cap), so it stays correct as the chip list
  // length changes (e.g. a historic year gets prepended).
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    let raf = 0;
    function recompute() {
      if (!mq.matches) { setMaxChips(null); return; }
      setMaxChips(null); // reveal all chips so their natural widths are measurable
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const row = chipsRowRef.current;
        if (!row) return;
        const chips = [...row.querySelectorAll('.sstrip-chip')];
        const decade = row.querySelector('.sstrip-decade-chip');
        const divider = row.querySelector('.sstrip-div');
        if (!chips.length || !decade) return;
        const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
        let dividerW = 0;
        if (divider) {
          const d = getComputedStyle(divider);
          dividerW = divider.getBoundingClientRect().width +
            (parseFloat(d.marginLeft) || 0) + (parseFloat(d.marginRight) || 0);
        }
        const avail = row.clientWidth - decade.getBoundingClientRect().width - dividerW - gap * 2;
        let used = 0, fit = 0;
        for (const c of chips) {
          const next = used + (fit ? gap : 0) + c.getBoundingClientRect().width;
          if (next <= avail) { used = next; fit++; } else break;
        }
        setMaxChips(Math.max(2, fit));
      });
    }
    recompute();
    window.addEventListener('resize', recompute);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(recompute);
    return () => { window.removeEventListener('resize', recompute); cancelAnimationFrame(raf); };
  }, [currentYear, displayYears.length]);

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
  const panelLabel = `${HISTORIC_MIN}–${FIRST_STRIP_YEAR - 1}`;

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
          {displayYears.map((y, i) => (
            <button
              key={y}
              type="button"
              className={`sstrip-chip${y === selected ? ' active' : ''}`}
              aria-current={y === selected ? 'true' : undefined}
              style={maxChips != null && i >= maxChips ? { display: 'none' } : undefined}
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
