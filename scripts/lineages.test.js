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
