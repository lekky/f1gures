// Hydrates the <race-countdown> element from RaceUpcomingBody.astro:
// - Ticks the countdown to the next non-passed session
// - Re-evaluates "next session" on hydration (SSR pick may be stale)
// - Drives TRACK/YOU timezone toggle (persists to localStorage.f1-tz, same
//   key the home-page schedule uses)
// - Formats day-of-week + HH:MM in the chosen zone via Intl.DateTimeFormat
//
// Reads `data-circuit-id` from the wrapper element to pick the circuit's
// IANA timezone via circuitTz() from shared.jsx.

import { useEffect, useMemo, useRef, useState } from 'react';
import { circuitTz } from '../../lib/shared.jsx';

const SESSION_LABELS = {
  fp1: 'Practice 1',
  fp2: 'Practice 2',
  fp3: 'Practice 3',
  sprintQuali: 'Sprint Qualifying',
  sprint: 'Sprint',
  q: 'Qualifying',
  race: 'Race',
};

function readSavedTz() {
  try {
    const v = typeof localStorage !== 'undefined' && localStorage.getItem('f1-tz');
    return v === 'user' || v === 'track' ? v : 'track';
  } catch { return 'track'; }
}

function formatDay(iso, zone) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'short' }).format(new Date(iso));
}
function formatTime(iso, zone) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

function formatCountdown(targetIso) {
  const diff = Math.max(0, new Date(targetIso).getTime() - Date.now());
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `in ${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `in ${hours}h ${mins}m`;
  if (mins > 0) return `in ${mins}m`;
  return 'live now';
}

export default function RaceCountdown({ rootSelector = 'race-countdown' }) {
  const [tz, setTz] = useState(readSavedTz);
  const [now, setNow] = useState(() => Date.now());
  const rootRef = useRef(null);

  // Find our wrapper element - only one per page, addressed by tag.
  useEffect(() => {
    rootRef.current = document.querySelector(rootSelector);
  }, [rootSelector]);

  // Tick.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Persist timezone.
  useEffect(() => {
    try { localStorage.setItem('f1-tz', tz); } catch { /* no-op */ }
  }, [tz]);

  const root = rootRef.current;
  const circuitId = root?.getAttribute('data-circuit-id') || '';
  const trackZone = circuitTz(circuitId);
  const userZone = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
  })();
  const zone = tz === 'user' ? userZone : trackZone;

  // Read session rows from DOM (data-session-iso attributes).
  const rows = useMemo(() => {
    if (!root) return [];
    return Array.from(root.querySelectorAll('[data-session-iso]')).map(tr => ({
      el: tr,
      key: tr.getAttribute('data-session-key'),
      iso: tr.getAttribute('data-session-iso'),
      dayCell: tr.querySelector('[data-session-day]'),
      timeCell: tr.querySelector('[data-session-time]'),
    }));
  }, [root]);

  // Pick next session based on current time.
  const nextRow = useMemo(() => {
    return rows.find(r => new Date(r.iso).getTime() > now) || null;
  }, [rows, now]);

  // Apply DOM updates: day/time in the chosen zone, is-next class on the right row,
  // headline label + countdown.
  useEffect(() => {
    if (!root) return;
    for (const r of rows) {
      if (r.dayCell) r.dayCell.textContent = formatDay(r.iso, zone);
      if (r.timeCell) r.timeCell.textContent = formatTime(r.iso, zone);
      if (r.el.classList.contains('is-next') !== (r === nextRow)) {
        r.el.classList.toggle('is-next', r === nextRow);
      }
    }
    const labelEl = root.querySelector('[data-next-label]');
    const countEl = root.querySelector('[data-next-countdown]');
    if (labelEl) labelEl.textContent = nextRow ? SESSION_LABELS[nextRow.key] : 'Race weekend complete';
    if (countEl) countEl.textContent = nextRow ? formatCountdown(nextRow.iso) : '';
  }, [root, rows, nextRow, zone]);

  // Sync toggle button visual state.
  useEffect(() => {
    if (!root) return;
    for (const btn of root.querySelectorAll('.tz-btn')) {
      const isActive = btn.getAttribute('data-tz') === tz;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    }
  }, [root, tz]);

  // Wire toggle clicks.
  useEffect(() => {
    if (!root) return;
    function onClick(e) {
      const btn = e.target.closest('.tz-btn');
      if (!btn) return;
      const v = btn.getAttribute('data-tz');
      if (v === 'user' || v === 'track') setTz(v);
    }
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [root]);

  // Cross-tab sync (home page may toggle in another tab).
  useEffect(() => {
    function onStorage(e) {
      if (e.key === 'f1-tz' && (e.newValue === 'user' || e.newValue === 'track')) setTz(e.newValue);
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return null; // The island manipulates the SSR DOM, doesn't render its own tree.
}
