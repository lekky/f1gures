// SearchPalette - global Cmd/Ctrl+K command palette. Lazy-fetches the four
// _*-index.json files from /data/archive/ on first open, ranks substring
// matches across drivers, teams, circuits, and races, and navigates via the
// shared urlFor() so alias maps and the ARCHIVE_MAX_YEAR race-URL guard stay
// in one place.
//
// Mounts once in Chrome.astro. Listens globally for Cmd/Ctrl+K (toggle), '/'
// (open when no input is focused), and Escape (close). Any element with
// data-search-trigger also opens it via delegated click.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Flag, urlFor } from '../../lib/shared.jsx';

let _indexes = null;
let _indexesPromise = null;

async function loadIndexes() {
  if (_indexes) return _indexes;
  if (_indexesPromise) return _indexesPromise;
  _indexesPromise = Promise.all([
    fetch('/data/archive/_drivers-index.json').then(r => r.json()),
    fetch('/data/archive/_teams-index.json').then(r => r.json()),
    fetch('/data/archive/_circuits-index.json').then(r => r.json()),
    fetch('/data/archive/_races-index.json').then(r => r.json()),
  ]).then(([drivers, teams, circuits, races]) => {
    const circuitByRef = new Map(circuits.map(c => [c.circuitRef, c]));
    _indexes = {
      drivers: drivers.map(d => ({
        ...d,
        _hay: `${d.forename || ''} ${d.surname || ''} ${d.code || ''}`.toLowerCase(),
      })),
      teams: teams.map(t => ({
        ...t,
        _hay: (t.name || '').toLowerCase(),
      })),
      circuits: circuits.map(c => ({
        ...c,
        _hay: `${c.name || ''} ${c.location || ''} ${c.countryName || ''}`.toLowerCase(),
      })),
      races: races.map(r => {
        const c = circuitByRef.get(r.circuitRef);
        const circuitTokens = c ? `${c.name || ''} ${c.location || ''}` : '';
        return {
          ...r,
          _circuit: c || null,
          _hay: `${r.year} ${r.name || ''} ${circuitTokens}`.toLowerCase(),
        };
      }),
    };
    return _indexes;
  });
  return _indexesPromise;
}

function scoreItem(hay, tokens) {
  let score = 0;
  for (const tok of tokens) {
    const i = hay.indexOf(tok);
    if (i === -1) return -1;
    if (i === 0) score += 3;
    else if (hay.charCodeAt(i - 1) === 32) score += 2;
    else score += 1;
  }
  return score;
}

function rankItems(items, tokens, tieKey, max = 5) {
  const scored = [];
  for (const it of items) {
    const s = scoreItem(it._hay, tokens);
    if (s >= 0) scored.push({ score: s, item: it });
  }
  scored.sort((a, b) => b.score - a.score || (tieKey(b.item) - tieKey(a.item)));
  return scored.slice(0, max).map(s => s.item);
}

function isMacLike() {
  if (typeof navigator === 'undefined') return false;
  const p = navigator.platform || '';
  return /Mac|iPhone|iPad|iPod/.test(p);
}

export default function SearchPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [indexes, setIndexes] = useState(null);
  const [active, setActive] = useState(0);
  const [mac, setMac] = useState(false);
  const inputRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => { setMac(isMacLike()); }, []);

  // Global keyboard shortcuts + delegated trigger clicks
  useEffect(() => {
    function onKey(e) {
      const t = e.target;
      const isInput = t instanceof HTMLElement &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(o => !o);
        return;
      }
      if (e.key === '/' && !open && !isInput) {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    function onDelegatedClick(e) {
      const t = e.target.closest && e.target.closest('[data-search-trigger]');
      if (!t) return;
      e.preventDefault();
      triggerRef.current = t;
      setOpen(true);
    }
    window.addEventListener('keydown', onKey);
    document.addEventListener('click', onDelegatedClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onDelegatedClick);
    };
  }, [open]);

  // Fetch indexes lazily on first open; lock scroll; focus management
  useEffect(() => {
    if (open && !indexes) {
      loadIndexes().then(setIndexes);
    }
    if (open) {
      const raf = requestAnimationFrame(() => inputRef.current?.focus());
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        cancelAnimationFrame(raf);
        document.body.style.overflow = prevOverflow;
      };
    }
    if (!open && triggerRef.current) {
      try { triggerRef.current.focus(); } catch {}
    }
  }, [open, indexes]);

  useEffect(() => { setActive(0); }, [query]);

  const results = useMemo(() => {
    if (!indexes) return null;
    const q = query.trim().toLowerCase();
    if (!q) return { drivers: [], teams: [], circuits: [], races: [] };
    const tokens = q.split(/\s+/).filter(Boolean);
    return {
      drivers: rankItems(indexes.drivers, tokens, d => d.wins || 0, 5),
      teams: rankItems(indexes.teams, tokens, t => t.championships || 0, 5),
      circuits: rankItems(indexes.circuits, tokens, c => c.raceCount || 0, 5),
      races: rankItems(indexes.races, tokens, r => r.year || 0, 5),
    };
  }, [indexes, query]);

  const flat = useMemo(() => {
    if (!results) return [];
    const out = [];
    for (const d of results.drivers) out.push({ kind: 'driver', item: d });
    for (const t of results.teams) out.push({ kind: 'team', item: t });
    for (const c of results.circuits) out.push({ kind: 'circuit', item: c });
    for (const r of results.races) out.push({ kind: 'race', item: r });
    return out;
  }, [results]);

  function go(entry) {
    if (!entry) return;
    const { kind, item } = entry;
    let href = null;
    if (kind === 'driver') href = urlFor({ name: 'driver', ref: item.driverRef });
    else if (kind === 'team') href = urlFor({ name: 'team', ref: item.constructorRef });
    else if (kind === 'circuit') href = urlFor({ name: 'circuit', ref: item.circuitRef });
    else if (kind === 'race') href = urlFor({ name: 'race', year: item.year, round: item.round });
    if (href) window.location.href = href;
  }

  function onInputKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flat.length) setActive(a => Math.min(flat.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length) setActive(a => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flat.length) go(flat[active]);
    }
  }

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const modKey = mac ? '⌘' : 'Ctrl';

  return createPortal(
    <div
      className="f1k-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
      role="dialog"
      aria-modal="true"
      aria-label="Search F1gures"
    >
      <div className="f1k-panel">
        <div className="f1k-input-row">
          <svg className="f1k-search-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            className="f1k-input"
            type="search"
            placeholder='Search drivers, teams, circuits, races…'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            autoComplete="off"
            spellCheck={false}
            aria-controls="f1k-listbox"
            aria-activedescendant={flat[active] ? `f1k-row-${active}` : undefined}
          />
          <kbd className="f1k-kbd f1k-kbd-esc">esc</kbd>
        </div>
        <div className="f1k-results" id="f1k-listbox" role="listbox">
          {!indexes && <div className="f1k-empty">Loading index…</div>}
          {indexes && !query.trim() && (
            <div className="f1k-empty">
              Try <kbd className="f1k-kbd">Hamilton</kbd>
              <kbd className="f1k-kbd">Monza 2019</kbd>
              <kbd className="f1k-kbd">Ferrari</kbd>
            </div>
          )}
          {indexes && query.trim() && flat.length === 0 && (
            <div className="f1k-empty">No matches.</div>
          )}
          {results && flat.length > 0 && (
            <ResultGroups
              results={results}
              active={active}
              setActive={setActive}
              go={go}
            />
          )}
        </div>
        <div className="f1k-footer">
          <span><kbd className="f1k-kbd">{modKey}</kbd><kbd className="f1k-kbd">K</kbd> toggle</span>
          <span><kbd className="f1k-kbd">↑↓</kbd> navigate</span>
          <span><kbd className="f1k-kbd">↵</kbd> open</span>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ResultGroups({ results, active, setActive, go }) {
  let i = -1;
  const groups = [
    ['Drivers', 'driver', results.drivers],
    ['Teams', 'team', results.teams],
    ['Circuits', 'circuit', results.circuits],
    ['Races', 'race', results.races],
  ];
  return (
    <>
      {groups.map(([label, kind, items]) => items.length > 0 && (
        <div className="f1k-group" key={kind}>
          <div className="f1k-group-head">{label}</div>
          {items.map((item) => {
            i += 1;
            const idx = i;
            const isActive = idx === active;
            const key =
              kind === 'driver'  ? `driver-${item.driverRef}` :
              kind === 'team'    ? `team-${item.constructorRef}` :
              kind === 'circuit' ? `circuit-${item.circuitRef}` :
                                   `race-${item.year}-${item.round}`;
            return (
              <button
                key={key}
                id={`f1k-row-${idx}`}
                type="button"
                className={`f1k-row ${isActive ? 'is-active' : ''}`}
                onMouseEnter={() => setActive(idx)}
                onMouseMove={() => { if (!isActive) setActive(idx); }}
                onClick={() => go({ kind, item })}
                role="option"
                aria-selected={isActive}
              >
                <ResultRow kind={kind} item={item} />
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}

function ResultRow({ kind, item }) {
  if (kind === 'driver') {
    return (
      <>
        <span className="f1k-row-icon">
          <span className="f1k-team-dot" style={{ background: item.teamColor || '#888' }} />
        </span>
        <span className="f1k-row-main">
          <span className="f1k-row-title">{item.forename} {item.surname}</span>
          <span className="f1k-row-sub">
            {item.code && <span className="f1k-code">{item.code}</span>}
            {item.teamName && <span>{item.teamName}</span>}
            <span>{item.firstYear}–{item.lastYear}</span>
            {item.wins > 0 && <span>{item.wins}W</span>}
            {item.championships > 0 && <span className="f1k-champ">{item.championships}× champ</span>}
          </span>
        </span>
        <span className="f1k-row-kind">Driver</span>
      </>
    );
  }
  if (kind === 'team') {
    return (
      <>
        <span className="f1k-row-icon">
          <span className="f1k-team-dot" style={{ background: item.color || '#888' }} />
        </span>
        <span className="f1k-row-main">
          <span className="f1k-row-title">{item.name}</span>
          <span className="f1k-row-sub">
            {item.nationality && <span>{item.nationality}</span>}
            <span>{item.firstYear}–{item.lastYear}</span>
            {item.wins > 0 && <span>{item.wins}W</span>}
            {item.championships > 0 && <span className="f1k-champ">{item.championships}× champ</span>}
          </span>
        </span>
        <span className="f1k-row-kind">Team</span>
      </>
    );
  }
  if (kind === 'circuit') {
    return (
      <>
        <span className="f1k-row-icon">
          {item.country
            ? <Flag cc={item.country} flag={item.flag} name={item.countryName} className="f1k-flag" />
            : null}
        </span>
        <span className="f1k-row-main">
          <span className="f1k-row-title">{item.name}</span>
          <span className="f1k-row-sub">
            {item.location && <span>{item.location}</span>}
            {item.countryName && <span>{item.countryName}</span>}
            <span>{item.raceCount} race{item.raceCount === 1 ? '' : 's'}</span>
          </span>
        </span>
        <span className="f1k-row-kind">Circuit</span>
      </>
    );
  }
  if (kind === 'race') {
    const c = item._circuit;
    return (
      <>
        <span className="f1k-row-icon">
          {c?.country
            ? <Flag cc={c.country} flag={c.flag} name={c.countryName} className="f1k-flag" />
            : null}
        </span>
        <span className="f1k-row-main">
          <span className="f1k-row-title">{item.year} {item.name}</span>
          <span className="f1k-row-sub">
            {c?.name && <span>{c.name}</span>}
            {item.date && <span>{item.date}</span>}
            {item.completed === false && <span className="f1k-upcoming">Upcoming</span>}
          </span>
        </span>
        <span className="f1k-row-kind">Race</span>
      </>
    );
  }
  return null;
}
