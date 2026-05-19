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
  for (const chain of chains) {
    for (let idx = 0; idx < chain.nodes.length; idx++) {
      if (chain.nodes[idx].ref !== doc.constructorRef) continue;
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
}
