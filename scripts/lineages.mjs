// scripts/lineages.mjs
// Hand-curated F1 constructor lineage chains + pure helpers used by
// scripts/build-archive.mjs to attach a `lineage` field to each team's
// JSON doc. Same-ref-appearing-twice is allowed (e.g. Renault 2002-11
// and 2016-20). Linear chains only - no fork/merge support.

export const lineages = [];

export function eraStats(teamDoc, from, to) {
  if (!teamDoc?.perSeason) return { seasons: 0, wins: 0, championships: 0 };
  const upper = to ?? Infinity;
  const rows = teamDoc.perSeason.filter(s => s.year >= from && s.year <= upper);
  return {
    seasons: rows.length,
    wins: rows.reduce((sum, s) => sum + (s.wins || 0), 0),
    championships: rows.filter(s => s.position === 1).length,
  };
}
