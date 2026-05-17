// scripts/records/helpers.mjs
//
// Pure helpers for the records pipeline. No I/O.

export const MODERN_ERA_START_YEAR = 1981;

// Drop rows whose year is the in-progress current year (we don't have the data
// to compute a stable final standing yet) and, when era === 'modern', drop
// anything before MODERN_ERA_START_YEAR.
export function filterPerRaceByEra(rows, era, currentYear) {
  return rows.filter(r => {
    if (r.year == null) return false;
    if (r.year === currentYear) return false;
    if (era === 'modern' && r.year < MODERN_ERA_START_YEAR) return false;
    return true;
  });
}

// Mutates entries[] adding a `rank` field. Ties share a rank; the next rank
// skips by the number of ties (1, 1, 3, 4 — not 1, 1, 2, 3).
// Assumes entries are already sorted by value descending.
export function assignRanksWithTies(entries) {
  let lastValue = null;
  let lastRank = 0;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].value !== lastValue) {
      lastRank = i + 1;
      lastValue = entries[i].value;
    }
    entries[i].rank = lastRank;
  }
}

// "25y 100d" — years and remainder days between two ISO dates (YYYY-MM-DD).
// Returns null if either input is falsy.
export function formatAge(birthIso, eventIso) {
  if (!birthIso || !eventIso) return null;
  const birth = new Date(birthIso + 'T00:00:00Z');
  const event = new Date(eventIso + 'T00:00:00Z');
  if (isNaN(birth) || isNaN(event)) return null;
  let years = event.getUTCFullYear() - birth.getUTCFullYear();
  const anniversary = new Date(Date.UTC(
    event.getUTCFullYear(),
    birth.getUTCMonth(),
    birth.getUTCDate(),
  ));
  if (anniversary > event) {
    years--;
    anniversary.setUTCFullYear(anniversary.getUTCFullYear() - 1);
  }
  const ms = event - anniversary;
  const days = Math.round(ms / (24 * 60 * 60 * 1000));
  return `${years}y ${days}d`;
}

// "2007-2023" or "2019-present" or just "1958" depending on inputs.
export function formatYearsRange(firstYear, lastYear, currentYear) {
  if (firstYear == null && lastYear == null) return '';
  if (firstYear === lastYear) return String(firstYear);
  const right = (currentYear != null && lastYear === currentYear) ? 'present' : String(lastYear);
  return `${firstYear}-${right}`;
}

// Array.sort comparator: value desc, then races asc, then firstYear asc.
export function compareEntries(a, b) {
  if (b.value !== a.value) return b.value - a.value;
  const ra = a.races ?? Infinity;
  const rb = b.races ?? Infinity;
  if (ra !== rb) return ra - rb;
  const ya = a.firstYear ?? Infinity;
  const yb = b.firstYear ?? Infinity;
  return ya - yb;
}
