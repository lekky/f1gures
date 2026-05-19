// scripts/lineages.test.js
import { describe, it, expect } from 'vitest';
import { eraStats } from './lineages.mjs';

describe('eraStats', () => {
  const doc = {
    perSeason: [
      { year: 2020, position: 7,  wins: 0 },
      { year: 2021, position: 4,  wins: 1 },
      { year: 2022, position: 2,  wins: 3 },
      { year: 2023, position: 1,  wins: 9 },  // champion
      { year: 2024, position: 1,  wins: 12 }, // champion
      { year: 2025, position: 3,  wins: 2 },
    ],
  };

  it('sums wins and counts championships across an inclusive range', () => {
    expect(eraStats(doc, 2021, 2024)).toEqual({ seasons: 4, wins: 25, championships: 2 });
  });

  it('treats to: null as open-ended (through last perSeason year)', () => {
    expect(eraStats(doc, 2023, null)).toEqual({ seasons: 3, wins: 23, championships: 2 });
  });

  it('returns zeros when doc has no perSeason', () => {
    expect(eraStats(null, 2020, 2024)).toEqual({ seasons: 0, wins: 0, championships: 0 });
    expect(eraStats({}, 2020, 2024)).toEqual({ seasons: 0, wins: 0, championships: 0 });
  });

  it('handles a single-year era (from === to)', () => {
    expect(eraStats(doc, 2023, 2023)).toEqual({ seasons: 1, wins: 9, championships: 1 });
  });
});

import { validateLineages } from './lineages.mjs';

describe('validateLineages', () => {
  const teamsIndex = [
    { constructorRef: 'jordan' },
    { constructorRef: 'aston_martin' },
  ];

  it('passes for a valid chain', () => {
    const chains = [{
      id: 'jordan-aston',
      nodes: [
        { ref: 'jordan',       from: 1991, to: 2005 },
        { ref: 'aston_martin', from: 2021, to: null },
      ],
    }];
    expect(() => validateLineages(chains, teamsIndex)).not.toThrow();
  });

  it('throws on unknown ref with chain id and ref in message', () => {
    const chains = [{
      id: 'broken-chain',
      nodes: [
        { ref: 'jordan',       from: 1991, to: 2005 },
        { ref: 'totally_fake', from: 2006, to: 2010 },
      ],
    }];
    expect(() => validateLineages(chains, teamsIndex))
      .toThrow(/broken-chain.*totally_fake/);
  });

  it('throws on chain shorter than 2 nodes', () => {
    const chains = [{ id: 'solo', nodes: [{ ref: 'jordan', from: 1991, to: 2005 }] }];
    expect(() => validateLineages(chains, teamsIndex)).toThrow(/solo.*at least 2/);
  });

  it('throws on missing chain id', () => {
    const chains = [{ nodes: [
      { ref: 'jordan', from: 1991, to: 2005 },
      { ref: 'aston_martin', from: 2021, to: null },
    ] }];
    expect(() => validateLineages(chains, teamsIndex)).toThrow(/missing id/);
  });
});

import { buildLineageAttachment } from './lineages.mjs';

describe('buildLineageAttachment', () => {
  const chains = [{
    id: 'jordan-aston',
    nodes: [
      { ref: 'jordan',       from: 1991, to: 2005 },
      { ref: 'aston_martin', from: 2021, to: null },
    ],
  }];

  const teamDocs = {
    jordan: {
      constructorRef: 'jordan',
      name: 'Jordan',
      color: '#FFC107',
      perSeason: [
        { year: 1998, position: 4, wins: 1 },
        { year: 1999, position: 3, wins: 2 },
      ],
    },
    aston_martin: {
      constructorRef: 'aston_martin',
      name: 'Aston Martin',
      color: '#2E8B57',
      perSeason: [
        { year: 2023, position: 5, wins: 0 },
        { year: 2024, position: 5, wins: 0 },
      ],
    },
  };
  const lookup = (ref) => teamDocs[ref] ?? null;

  it('attaches lineage with selfIndex 0 to Jordan and all node fields', () => {
    const doc = JSON.parse(JSON.stringify(teamDocs.jordan));
    buildLineageAttachment(doc, chains, lookup);
    expect(doc.lineage).toEqual({
      chainId: 'jordan-aston',
      selfIndex: 0,
      nodes: [
        { ref: 'jordan', name: 'Jordan', displayNameOverride: undefined,
          color: '#FFC107', from: 1991, to: 2005,
          seasons: 2, wins: 3, championships: 0, isSelf: true },
        { ref: 'aston_martin', name: 'Aston Martin', displayNameOverride: undefined,
          color: '#2E8B57', from: 2021, to: null,
          seasons: 2, wins: 0, championships: 0, isSelf: false },
      ],
    });
  });

  it('attaches lineage with selfIndex 1 to Aston Martin', () => {
    const doc = JSON.parse(JSON.stringify(teamDocs.aston_martin));
    buildLineageAttachment(doc, chains, lookup);
    expect(doc.lineage.selfIndex).toBe(1);
    expect(doc.lineage.nodes[1].isSelf).toBe(true);
    expect(doc.lineage.nodes[0].isSelf).toBe(false);
  });

  it('leaves lineage undefined for refs not in any chain', () => {
    const doc = { constructorRef: 'ferrari', name: 'Ferrari', color: '#DC0000', perSeason: [] };
    buildLineageAttachment(doc, chains, lookup);
    expect(doc.lineage).toBeUndefined();
  });

  it('carries displayNameOverride through to the attached node', () => {
    const chainsWithOverride = [{
      id: 'jordan-aston',
      nodes: [
        { ref: 'jordan',       from: 1991, to: 2005, displayNameOverride: 'Eddie Jordan GP' },
        { ref: 'aston_martin', from: 2021, to: null },
      ],
    }];
    const doc = JSON.parse(JSON.stringify(teamDocs.jordan));
    buildLineageAttachment(doc, chainsWithOverride, lookup);
    expect(doc.lineage.nodes[0].displayNameOverride).toBe('Eddie Jordan GP');
    expect(doc.lineage.nodes[0].name).toBe('Jordan');
  });

  it('picks the era covering the latest perSeason year when ref appears twice in one chain', () => {
    const renaultDoc = {
      constructorRef: 'renault',
      name: 'Renault',
      color: '#FFF500',
      perSeason: [
        { year: 2005, position: 1, wins: 8 },  // champion (era 1)
        { year: 2006, position: 1, wins: 8 },  // champion (era 1)
        { year: 2016, position: 9, wins: 0 },  // era 2
        { year: 2020, position: 5, wins: 0 },  // era 2
      ],
    };
    const chainWithDup = [{
      id: 'toleman-alpine',
      nodes: [
        { ref: 'renault', from: 2002, to: 2011 },  // era 1
        { ref: 'renault', from: 2016, to: 2020 },  // era 2 - same ref
      ],
    }];
    const dupLookup = (ref) => ref === 'renault' ? renaultDoc : null;
    const doc = JSON.parse(JSON.stringify(renaultDoc));
    buildLineageAttachment(doc, chainWithDup, dupLookup);
    // Latest perSeason year is 2020 -> falls in era 2 (idx 1), not era 1 (idx 0)
    expect(doc.lineage.selfIndex).toBe(1);
    expect(doc.lineage.nodes[0].isSelf).toBe(false);
    expect(doc.lineage.nodes[1].isSelf).toBe(true);
    // Era stats differ per-pill (date-range filtered)
    expect(doc.lineage.nodes[0].wins).toBe(16);    // 2005+2006 wins
    expect(doc.lineage.nodes[0].championships).toBe(2);
    expect(doc.lineage.nodes[1].wins).toBe(0);     // 2016-2020 wins
    expect(doc.lineage.nodes[1].championships).toBe(0);
  });

  it('picks the era covering the latest perSeason year when ref appears multiple times', () => {
    const sauberDoc = {
      constructorRef: 'sauber',
      name: 'Sauber',
      color: '#52E252',
      perSeason: [
        { year: 1993, position: 8,  wins: 0 },
        { year: 2018, position: 8,  wins: 0 },
        { year: 2024, position: 9,  wins: 0 },
        { year: 2025, position: 10, wins: 0 },  // latest year - in third era
      ],
    };
    const chain = [{
      id: 'sauber-audi',
      nodes: [
        { ref: 'sauber',     from: 1993, to: 2005 },                                       // era 1 (idx 0)
        { ref: 'bmw_sauber', from: 2006, to: 2009 },                                       // idx 1
        { ref: 'sauber',     from: 2010, to: 2018 },                                       // era 2 (idx 2)
        { ref: 'alfa',       from: 2019, to: 2023 },                                       // idx 3
        { ref: 'sauber',     from: 2024, to: 2025, displayNameOverride: 'Kick Sauber' },   // era 3 (idx 4)
        { ref: 'audi',       from: 2026, to: null },                                       // idx 5
      ],
    }];
    const lookup = (ref) => ref === 'sauber' ? sauberDoc : null;
    const doc = JSON.parse(JSON.stringify(sauberDoc));
    buildLineageAttachment(doc, chain, lookup);
    // Latest perSeason year is 2025 -> falls in era 3 (idx 4), not era 1 (idx 0)
    expect(doc.lineage.selfIndex).toBe(4);
    expect(doc.lineage.nodes[0].isSelf).toBe(false);
    expect(doc.lineage.nodes[2].isSelf).toBe(false);
    expect(doc.lineage.nodes[4].isSelf).toBe(true);
  });

  it('falls back to first occurrence when no era covers the latest perSeason year (defensive)', () => {
    const orphanDoc = {
      constructorRef: 'sauber',
      name: 'Sauber',
      color: '#52E252',
      perSeason: [{ year: 1900, position: 8, wins: 0 }],  // pathological - before any era
    };
    const chain = [{
      id: 'sauber-audi',
      nodes: [
        { ref: 'sauber', from: 1993, to: 2005 },
        { ref: 'sauber', from: 2010, to: 2018 },
      ],
    }];
    const lookup = (ref) => ref === 'sauber' ? orphanDoc : null;
    const doc = JSON.parse(JSON.stringify(orphanDoc));
    buildLineageAttachment(doc, chain, lookup);
    expect(doc.lineage.selfIndex).toBe(0);
  });

  it('falls back to ref-as-name and grey color when lookup returns null', () => {
    const orphanChain = [{
      id: 'orphan',
      nodes: [
        { ref: 'jordan', from: 1991, to: 2005 },
        { ref: 'ghost_team', from: 2010, to: 2012 },
      ],
    }];
    const doc = JSON.parse(JSON.stringify(teamDocs.jordan));
    buildLineageAttachment(doc, orphanChain, lookup);
    expect(doc.lineage.nodes[1]).toMatchObject({
      ref: 'ghost_team',
      name: 'ghost_team',
      color: '#888',
      seasons: 0,
    });
  });
});
