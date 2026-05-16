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
