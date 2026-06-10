// scripts/lineages.mjs
// Hand-curated F1 constructor lineage chains + pure helpers used by
// scripts/build-archive.mjs to attach a `lineage` field to each team's
// JSON doc. Same-ref-appearing-twice is allowed (e.g. Renault 2002-11
// and 2016-20). Linear chains only - no fork/merge support.

// Eight starter chains covering the modern grid's heritage plus a few
// short-lived 2010s outfits. Year ranges are inclusive on both ends;
// `to: null` means "current". Same ref appearing twice is allowed and
// renders as two separate pills.
//
// Notes on ref choices:
//   - Ergast uses `mf1` for the 2006 Midland team. We use `mf1` with
//     `displayNameOverride: 'Midland'` so the pill reads naturally.
//   - We skip Ergast's `spyker_mf1` (the 2006 mid-season rename); only
//     `spyker` (full 2007 season) is in the chain.
//   - Ergast uses `alfa` for the Alfa Romeo-sponsored Sauber era.
//   - Sauber's 2024-2025 entry stays as ref `sauber` in Ergast/the
//     2025 bundle; we use displayNameOverride 'Kick Sauber'.
//   - `lotus_f1` (2012-2015) is the Toleman/Renault Enstone line, not
//     related to Team Lotus or to `lotus_racing`/`caterham`.
//   - `team_lotus` (Colin Chapman's outfit, 1958-1994) is NOT in any
//     chain - solo and historic.

export const lineages = [
  {
    id: 'jordan-aston',
    nodes: [
      { ref: 'jordan',       from: 1991, to: 2005 },
      { ref: 'mf1',          from: 2006, to: 2006, displayNameOverride: 'Midland' },
      { ref: 'spyker',       from: 2007, to: 2007 },
      { ref: 'force_india',  from: 2008, to: 2018 },
      { ref: 'racing_point', from: 2019, to: 2020 },
      { ref: 'aston_martin', from: 2021, to: null },
    ],
  },
  {
    id: 'sauber-audi',
    nodes: [
      { ref: 'sauber',     from: 1993, to: 2005 },
      { ref: 'bmw_sauber', from: 2006, to: 2009 },
      { ref: 'sauber',     from: 2010, to: 2018 },
      { ref: 'alfa',       from: 2019, to: 2023 },
      { ref: 'sauber',     from: 2024, to: 2025, displayNameOverride: 'Kick Sauber' },
      { ref: 'audi',       from: 2026, to: null },
    ],
  },
  {
    id: 'tyrrell-mercedes',
    nodes: [
      { ref: 'tyrrell',  from: 1968, to: 1998 },
      { ref: 'bar',      from: 1999, to: 2005 },
      { ref: 'honda',    from: 2006, to: 2008 },
      { ref: 'brawn',    from: 2009, to: 2009 },
      { ref: 'mercedes', from: 2010, to: null },
    ],
  },
  {
    id: 'toleman-alpine',
    nodes: [
      { ref: 'toleman',  from: 1981, to: 1985 },
      { ref: 'benetton', from: 1986, to: 2001 },
      { ref: 'renault',  from: 2002, to: 2011 },
      { ref: 'lotus_f1', from: 2012, to: 2015 },
      { ref: 'renault',  from: 2016, to: 2020 },
      { ref: 'alpine',   from: 2021, to: null },
    ],
  },
  {
    id: 'stewart-redbull',
    nodes: [
      { ref: 'stewart',  from: 1997, to: 1999 },
      { ref: 'jaguar',   from: 2000, to: 2004 },
      { ref: 'red_bull', from: 2005, to: null },
    ],
  },
  {
    id: 'minardi-rb',
    nodes: [
      { ref: 'minardi',    from: 1985, to: 2005 },
      { ref: 'toro_rosso', from: 2006, to: 2019 },
      { ref: 'alphatauri', from: 2020, to: 2023 },
      { ref: 'rb',         from: 2024, to: null },
    ],
  },
  {
    id: 'lotus-caterham',
    nodes: [
      { ref: 'lotus_racing', from: 2010, to: 2011 },
      { ref: 'caterham',     from: 2012, to: 2014 },
    ],
  },
  {
    id: 'virgin-manor',
    nodes: [
      { ref: 'virgin',   from: 2010, to: 2011 },
      { ref: 'marussia', from: 2012, to: 2014 },
      { ref: 'manor',    from: 2015, to: 2016 },
    ],
  },
];

export function eraStats(teamDoc, from, to, currentYear = new Date().getFullYear()) {
  if (!teamDoc?.perSeason) return { seasons: 0, wins: 0, championships: 0 };
  const upper = to ?? Infinity;
  const rows = teamDoc.perSeason.filter(s => s.year >= from && s.year <= upper);
  return {
    seasons: rows.length,
    wins: rows.reduce((sum, s) => sum + (s.wins || 0), 0),
    // position for the in-progress season is the live standings rank, not a
    // won title - leading the WCC in June must not add a championship pill.
    championships: rows.filter(s => s.position === 1 && s.year < currentYear).length,
  };
}

export function validateLineages(chains, teamsIndex) {
  const refSet = new Set(teamsIndex.map(t => t.constructorRef));
  for (const chain of chains) {
    if (!chain.id) throw new Error('lineage chain missing id');
    if (!chain.nodes || chain.nodes.length < 2) {
      throw new Error(`lineage chain "${chain.id}" must have at least 2 nodes`);
    }
    for (const node of chain.nodes) {
      if (!refSet.has(node.ref)) {
        throw new Error(`lineage chain "${chain.id}" references unknown ref "${node.ref}"`);
      }
    }
  }
}

export function buildLineageAttachment(doc, chains, lookupTeam) {
  const latestYear = doc.perSeason?.length
    ? Math.max(...doc.perSeason.map(s => s.year))
    : null;
  for (const chain of chains) {
    const matchingIndices = [];
    for (let i = 0; i < chain.nodes.length; i++) {
      if (chain.nodes[i].ref === doc.constructorRef) matchingIndices.push(i);
    }
    if (matchingIndices.length === 0) continue;
    // Prefer the era whose range contains the doc's latest perSeason year.
    // Falls back to first occurrence if no era covers it.
    let idx = matchingIndices[0];
    if (latestYear != null) {
      for (const i of matchingIndices) {
        const node = chain.nodes[i];
        const upper = node.to ?? Infinity;
        if (latestYear >= node.from && latestYear <= upper) { idx = i; break; }
      }
    }
    doc.lineage = {
      chainId: chain.id,
      selfIndex: idx,
      nodes: chain.nodes.map((n, i) => {
        const other = lookupTeam(n.ref);
        const stats = eraStats(other, n.from, n.to);
        return {
          ref: n.ref,
          name: other?.name ?? n.ref,
          displayNameOverride: n.displayNameOverride,
          color: other?.color ?? '#888',
          from: n.from,
          to: n.to,
          ...stats,
          isSelf: i === idx,
        };
      }),
    };
    return;
  }
}
