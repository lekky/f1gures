// scripts/records/helpers.mjs
//
// Pure helpers for the records pipeline. No I/O.

export const MODERN_ERA_START_YEAR = 1981;

// Filter per-race rows by era and (by default) drop the in-progress current
// year. When era === 'modern' drop anything before MODERN_ERA_START_YEAR.
//
// `includeCurrentYear`: cumulative event-count records (career wins/podiums/
// poles/starts/fastest-laps, streaks, oldest winner, team wins, circuit
// wins/poles) should count completed current-year races - a race that has run
// is a fact regardless of whether the season is over. Standings-based records
// (championships, title-margin, youngest-champion, team titles) keep the
// default exclusion because final standings aren't stable mid-season; those
// generators also self-guard the current year independently.
export function filterPerRaceByEra(rows, era, currentYear, { includeCurrentYear = false } = {}) {
  return rows.filter(r => {
    if (r.year == null) return false;
    if (!includeCurrentYear && r.year === currentYear) return false;
    if (era === 'modern' && r.year < MODERN_ERA_START_YEAR) return false;
    if (era === 'classic' && r.year >= MODERN_ERA_START_YEAR) return false;
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
