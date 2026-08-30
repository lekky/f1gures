// scripts/principals.test.js
import { describe, it, expect } from 'vitest';
import { PRINCIPALS, validatePrincipals, tenureStats, buildPrincipalsAttachment } from './principals.mjs';

// ─── tenureStats ──────────────────────────────────────────────────────

// Fixture team: 2022-2025, with a mid-2025 boss change at round 12/13.
const teamDoc = {
  constructorRef: 'red_bull',
  perSeason: [
    { year: 2025, position: 3, wins: 4, races: 20, drivers: [{ driverRef: 'max', position: 3 }] },
    { year: 2024, position: 1, wins: 12, races: 24, drivers: [{ driverRef: 'max', position: 1 }] },
    { year: 2023, position: 1, wins: 21, races: 22, drivers: [{ driverRef: 'max', position: 1 }] },
    { year: 2022, position: 2, wins: 5, races: 22, drivers: [{ driverRef: 'max', position: 2 }] },
  ],
};

// 2025 race archive: red_bull wins rounds 2 and 14; 20 completed rounds.
const rounds2025 = Array.from({ length: 20 }, (_, i) => i + 1);
const helpers = {
  currentYear: 2026,
  roundsForYear: (year) => (year === 2025 ? rounds2025 : year >= 2022 ? [1, 2, 3] : []),
  loadRaceResults: (year, round) => {
    if (year !== 2025) return null;
    const win = round === 2 || round === 14;
    return [
      { constructorRef: 'red_bull', position: win ? 1 : 4 },
      { constructorRef: 'red_bull', position: 8 },
      { constructorRef: 'mclaren', position: win ? 2 : 1 },
    ];
  },
};

describe('tenureStats', () => {
  it('sums full seasons straight from perSeason', () => {
    expect(tenureStats(teamDoc, { from: 2022, to: 2024 }, helpers))
      .toEqual({ seasons: 3, wins: 38, races: 68, titles: 2, driverTitles: 2 });
  });

  it('treats to: null as open-ended through the latest perSeason year', () => {
    const s = tenureStats(teamDoc, { from: 2024, to: null }, helpers);
    expect(s.seasons).toBe(2);
    expect(s.wins).toBe(16); // 12 (2024) + 4 (2025)
  });

  it('computes a round-cut year from race docs, not perSeason', () => {
    // Outgoing boss: rounds 1-12 of 2025 → 12 races, 1 win (round 2).
    const out = tenureStats(teamDoc, { from: 2022, to: 2025, toRound: 12 }, helpers);
    expect(out.races).toBe(68 + 12);
    expect(out.wins).toBe(38 + 1);
    // Incoming boss: rounds 13-20 → 8 races, 1 win (round 14).
    const incoming = tenureStats(teamDoc, { from: 2025, fromRound: 13, to: null }, helpers);
    expect(incoming).toMatchObject({ seasons: 1, races: 8, wins: 1 });
  });

  it('credits titles to the tenure in charge at the final round', () => {
    // 2024 champion year, boss cut at round 3 of a 3-round year: covers the end.
    const cover = tenureStats(teamDoc, { from: 2024, to: 2024, toRound: 3 }, helpers);
    expect(cover.titles).toBe(1);
    expect(cover.driverTitles).toBe(1);
    // Same year but cut at round 2: title goes to the successor instead.
    const cut = tenureStats(teamDoc, { from: 2024, to: 2024, toRound: 2 }, helpers);
    expect(cut.titles).toBe(0);
    expect(cut.driverTitles).toBe(0);
    const successor = tenureStats(teamDoc, { from: 2024, fromRound: 3, to: 2024 }, helpers);
    expect(successor.titles).toBe(1);
  });

  it('never credits a title for the in-progress season', () => {
    const live = tenureStats(teamDoc, { from: 2022, to: null }, { ...helpers, currentYear: 2024 });
    expect(live.titles).toBe(1); // 2023 only - 2024 leader is not yet champion
  });

  it('returns zeros for a doc without perSeason', () => {
    expect(tenureStats(null, { from: 2020, to: null }, helpers))
      .toEqual({ seasons: 0, races: 0, wins: 0, titles: 0, driverTitles: 0 });
    expect(tenureStats({}, { from: 2020, to: null }, helpers).seasons).toBe(0);
  });

  it('treats an explicit fromRound of 1 as a full season', () => {
    const s = tenureStats(teamDoc, { from: 2024, fromRound: 1, to: 2024 }, helpers);
    expect(s.races).toBe(24); // perSeason value, no race-doc walk
  });

  it('merges alsoRefs docs: wins/titles sum, races take the busiest ref, seasons stay unique', () => {
    // Ergast-style engine split: same physical 1966 season under two refs.
    const primary = {
      constructorRef: 'lotus_like',
      perSeason: [
        { year: 1966, position: 4, wins: 1, races: 3, drivers: [] },
        { year: 1968, position: 1, wins: 5, races: 12, drivers: [{ driverRef: 'hill', position: 1 }] },
      ],
    };
    const engineVariant = {
      constructorRef: 'lotus_like-climax',
      perSeason: [
        { year: 1966, position: 2, wins: 2, races: 8, drivers: [] },
        { year: 1965, position: 1, wins: 6, races: 10, drivers: [{ driverRef: 'clark', position: 1 }] },
      ],
    };
    const withLookup = { ...helpers, lookupTeam: (ref) => (ref === 'lotus_like-climax' ? engineVariant : null) };
    const s = tenureStats(primary, { from: 1960, to: 1970, alsoRefs: ['lotus_like-climax'] }, withLookup);
    expect(s.seasons).toBe(3);          // 1965, 1966, 1968 - 1966 counted once
    expect(s.races).toBe(10 + 8 + 12);  // per-year max, not sum, for 1966
    expect(s.wins).toBe(6 + 3 + 5);     // wins sum across refs
    expect(s.titles).toBe(2);           // 1965 (variant) + 1968 (primary)
    expect(s.driverTitles).toBe(2);
  });
});

// ─── buildPrincipalsAttachment ────────────────────────────────────────

describe('buildPrincipalsAttachment', () => {
  it('maps tenures with defaults, stats and current flag', () => {
    const tenures = [
      { name: 'Old Boss', from: 2022, to: 2025, toRound: 12 },
      { name: 'New Boss', from: 2025, fromRound: 13, to: null, role: 'Team Principal & CEO' },
    ];
    const out = buildPrincipalsAttachment(teamDoc, tenures, helpers);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      name: 'Old Boss', role: 'Team Principal', from: 2022, to: 2025, toRound: 12,
      current: false, wins: 39,
    });
    expect(out[1]).toMatchObject({
      name: 'New Boss', role: 'Team Principal & CEO', fromRound: 13, to: null,
      current: true, races: 8, wins: 1,
    });
  });
});

// ─── validatePrincipals ───────────────────────────────────────────────

describe('validatePrincipals', () => {
  const teamsIndex = [{ constructorRef: 'ferrari' }, { constructorRef: 'red_bull' }];

  it('passes for valid data', () => {
    const data = {
      red_bull: [
        { name: 'A', from: 2005, to: 2025, toRound: 12 },
        { name: 'B', from: 2025, fromRound: 13, to: null },
      ],
    };
    expect(() => validatePrincipals(data, teamsIndex)).not.toThrow();
  });

  it('throws on unknown constructorRef', () => {
    expect(() => validatePrincipals({ ghost: [{ name: 'A', from: 2000, to: null }] }, teamsIndex))
      .toThrow(/unknown constructorRef "ghost"/);
  });

  it('throws on overlapping tenures', () => {
    const data = { ferrari: [{ name: 'A', from: 2000, to: 2010 }, { name: 'B', from: 2005, to: null }] };
    expect(() => validatePrincipals(data, teamsIndex)).toThrow(/overlaps/);
  });

  it('throws on same-year handover without disjoint rounds', () => {
    const data = { ferrari: [{ name: 'A', from: 2000, to: 2010 }, { name: 'B', from: 2010, to: null }] };
    expect(() => validatePrincipals(data, teamsIndex)).toThrow(/disjoint toRound\/fromRound/);
  });

  it('throws when an open-ended tenure is not last', () => {
    const data = { ferrari: [{ name: 'A', from: 2000, to: null }, { name: 'B', from: 2015, to: null }] };
    expect(() => validatePrincipals(data, teamsIndex)).toThrow(/must be last/);
  });

  it('throws on to < from', () => {
    const data = { ferrari: [{ name: 'A', from: 2010, to: 2005 }] };
    expect(() => validatePrincipals(data, teamsIndex)).toThrow(/to < from/);
  });
});

// ─── Curated dataset sanity ───────────────────────────────────────────

describe('PRINCIPALS dataset', () => {
  it('is internally consistent (ordering, rounds, open-ended-last)', () => {
    // Validate against a permissive index made of the dataset's own refs -
    // the real ref check runs in build-archive against the true teams index.
    const refs = new Set(Object.keys(PRINCIPALS));
    for (const tenures of Object.values(PRINCIPALS)) {
      for (const t of tenures) for (const r of t.alsoRefs || []) refs.add(r);
    }
    const selfIndex = [...refs].map(ref => ({ constructorRef: ref }));
    expect(() => validatePrincipals(PRINCIPALS, selfIndex)).not.toThrow();
  });

  it('every current-grid team has exactly one open-ended tenure', () => {
    const currentGrid = ['red_bull', 'ferrari', 'mercedes', 'mclaren', 'williams',
      'aston_martin', 'alpine', 'rb', 'audi', 'haas', 'cadillac'];
    for (const ref of currentGrid) {
      const open = (PRINCIPALS[ref] || []).filter(t => t.to == null);
      expect(open, ref).toHaveLength(1);
    }
  });

  it('defunct-team tenures are all closed', () => {
    const defunct = Object.keys(PRINCIPALS).filter(ref =>
      !['red_bull', 'ferrari', 'mercedes', 'mclaren', 'williams',
        'aston_martin', 'alpine', 'rb', 'audi', 'haas', 'cadillac'].includes(ref));
    for (const ref of defunct) {
      for (const t of PRINCIPALS[ref]) expect(t.to, `${ref}: ${t.name}`).not.toBeNull();
    }
  });
});
