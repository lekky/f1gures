// Hydrates the <race-countdown> element from RaceUpcomingBody.astro:
// - Ticks the countdown to the next non-passed session
// - Re-evaluates "next session" on hydration (SSR pick may be stale)
// - Fills two time columns per session: the visitor's local time (prominent)
//   and the circuit's local time (dimmed). Both columns always show - even
//   when the zones match - so the reader can see the times line up.
// - Formats day-of-week + HH:MM in each zone via Intl.DateTimeFormat
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

// Short timezone abbreviation (e.g. BST, JST) for a zone at a given instant.
function zoneAbbr(iso, zone) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'short' }).formatToParts(new Date(iso));
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    return tzPart ? tzPart.value : '';
  } catch { return ''; }
}

function formatDayTime(iso, zone) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'short' }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${day} ${time}`;
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

  const root = rootRef.current;
  const circuitId = root?.getAttribute('data-circuit-id') || '';
  const trackZone = circuitTz(circuitId);
  const userZone = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
  })();

  // Read session rows from DOM (data-session-iso attributes).
  const rows = useMemo(() => {
    if (!root) return [];
    return Array.from(root.querySelectorAll('[data-session-iso]')).map(tr => ({
      el: tr,
      key: tr.getAttribute('data-session-key'),
      iso: tr.getAttribute('data-session-iso'),
      youCell: tr.querySelector('[data-session-you]'),
      trackCell: tr.querySelector('[data-session-track]'),
    }));
  }, [root]);

  // Pick next session based on current time.
  const nextRow = useMemo(() => {
    return rows.find(r => new Date(r.iso).getTime() > now) || null;
  }, [rows, now]);

  // Apply DOM updates: both time columns, is-next class, headline + countdown,
  // column headers. Both columns are always shown - even when the visitor's
  // zone matches the circuit's, seeing the two side by side confirms they line
  // up (rather than leaving the reader to wonder).
  useEffect(() => {
    if (!root) return;
    const refIso = (nextRow && nextRow.iso) || (rows[0] && rows[0].iso) || null;
    const userAbbr = refIso ? zoneAbbr(refIso, userZone) : '';
    const trackAbbr = refIso ? zoneAbbr(refIso, trackZone) : '';

    for (const r of rows) {
      if (r.youCell) r.youCell.textContent = formatDayTime(r.iso, userZone);
      if (r.trackCell) r.trackCell.textContent = formatDayTime(r.iso, trackZone);
      if (r.el.classList.contains('is-next') !== (r === nextRow)) {
        r.el.classList.toggle('is-next', r === nextRow);
      }
    }

    const youHead = root.querySelector('[data-you-head]');
    const trackHead = root.querySelector('[data-track-head]');
    if (youHead) youHead.textContent = userAbbr ? `Your time (${userAbbr})` : 'Your time';
    if (trackHead) trackHead.textContent = trackAbbr ? `Track (${trackAbbr})` : 'Track';

    const footEl = root.querySelector('[data-tz-foot]');
    if (footEl) footEl.textContent = 'Bold = your local time · dimmed = the circuit’s local time.';

    const labelEl = root.querySelector('[data-next-label]');
    const countEl = root.querySelector('[data-next-countdown]');
    if (labelEl) labelEl.textContent = nextRow ? SESSION_LABELS[nextRow.key] : 'Race weekend complete';
    if (countEl) countEl.textContent = nextRow ? formatCountdown(nextRow.iso) : '';
  }, [root, rows, nextRow, userZone, trackZone]);

  return null; // The island manipulates the SSR DOM, doesn't render its own tree.
}
