// Pure countdown helpers, shared by the home / calendar `Countdown` block
// (shared.jsx) and the Weekend Analysis "session begins in" panel
// (RaceWeekendIsland.jsx). One place owns the unit labels so "1 Hours" cannot
// creep back into one surface after being fixed in the other.

// Splits a millisecond gap into whole days / hours / mins / secs. Never negative.
export function splitDuration(diffMs) {
  const t = Math.max(0, Math.floor((Number(diffMs) || 0) / 1000));
  return {
    days: Math.floor(t / 86400),
    hours: Math.floor(t / 3600) % 24,
    mins: Math.floor(t / 60) % 60,
    secs: t % 60,
  };
}

// "1 Hour", "2 Hours", "0 Hours" — only exactly one takes the singular.
export function unitLabel(n, singular, plural = `${singular}s`) {
  return n === 1 ? singular : plural;
}

// The four cells a countdown renders: zero-padded value + correctly
// pluralised label. Keys are stable so callers can use them as React keys.
export function countdownCells(diffMs) {
  const d = splitDuration(diffMs);
  return [
    { key: 'days', v: d.days, l: unitLabel(d.days, 'Day') },
    { key: 'hours', v: d.hours, l: unitLabel(d.hours, 'Hour') },
    { key: 'mins', v: d.mins, l: unitLabel(d.mins, 'Min') },
    { key: 'secs', v: d.secs, l: unitLabel(d.secs, 'Sec') },
  ].map(c => ({ ...c, text: String(c.v).padStart(2, '0') }));
}
