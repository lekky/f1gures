// Parsers that turn Ergast/Jolpica race-result time strings into numeric
// seconds, so the race-page tables can draw proportional "gap" bars (gap to
// winner in results/sprint, gap to pole in qualifying). Everything is
// defensive: anything unrecognised returns null and the caller simply omits
// the bar (progressive enhancement - the raw string is always still shown).

// Parse an absolute clock string into seconds.
//   "1:31:44.742" -> 5504.742   (h:mm:ss.sss)
//   "1:29.179"    -> 89.179      (m:ss.sss)
//   "44.742"      -> 44.742      (ss.sss)
// Returns null for empty / non-time strings.
export function parseClock(str) {
  if (typeof str !== 'string') return null;
  const s = str.trim();
  if (!s) return null;
  // Must look like a time: digits, colons and a single decimal point only.
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(s)) return null;
  const parts = s.split(':');
  let seconds = 0;
  for (const p of parts) seconds = seconds * 60 + parseFloat(p);
  return Number.isFinite(seconds) ? seconds : null;
}

// Gap (in seconds) behind the race/sprint winner for one result row's `time`
// field. The winner carries an absolute clock -> 0. Everyone else classified
// carries a "+delta" string. Lapped cars ("+1 Lap") and DNFs (null/status)
// have no meaningful time gap -> null.
//   "1:31:44.742" -> 0
//   "+22.457"     -> 22.457
//   "+1:05.200"   -> 65.2
//   "+1 Lap"      -> null
//   null / "DNF"  -> null
export function raceGapSeconds(timeStr) {
  if (typeof timeStr !== 'string') return null;
  const s = timeStr.trim();
  if (!s) return null;
  if (/lap/i.test(s)) return null;
  if (s.startsWith('+')) return parseClock(s.slice(1).trim());
  // No leading '+' and parses as a clock -> this is the leader's own time.
  return parseClock(s) != null ? 0 : null;
}

// Best (fastest) qualifying lap in seconds across a row's Q1/Q2/Q3, or null if
// none parse. A driver knocked out in Q1 only has q1; a pole-sitter has all
// three and their q3 is usually fastest, but we take the min defensively.
export function bestQualiSeconds(row) {
  if (!row) return null;
  const times = [row.q3, row.q2, row.q1]
    .map(parseClock)
    .filter(v => v != null);
  return times.length ? Math.min(...times) : null;
}
