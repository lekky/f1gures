import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nextRoundNumber, replay, tiersForNextRound } from './lib/tiers.js';

const bundle = year => JSON.parse(readFileSync(resolve(process.cwd(), `public/data/${year}.json`), 'utf8'));

describe('nextRoundNumber', () => {
  it('is the first calendar round after the last scored one', () => {
    const cal = { calendar: [{ round: 1 }, { round: 2 }, { round: 3 }] };
    expect(nextRoundNumber(cal, 2)).toBe(3);
    expect(nextRoundNumber(cal, 3)).toBeNull();
  });
});

describe('tiersForNextRound (2026)', () => {
  const b2026 = bundle(2026);
  const b2025 = bundle(2025);
  const replayed = replay(b2026, b2025);

  it('publishes a full, correctly-sized cut for the unraced round', () => {
    const tiers = tiersForNextRound({ replayed, prevBundle: b2025 });
    const grid = replayed[replayed.length - 1].context.entries.length;
    expect(tiers).toHaveLength(grid);
    const sizes = ['A', 'B', 'C', 'D'].map(t => tiers.filter(x => x.tier === t).length);
    // Extras go to the LOWER tiers (§3), so the sizes never decrease.
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(grid);
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
  });

  it('ranks best-first and hands out consecutive ranks', () => {
    const tiers = tiersForNextRound({ replayed, prevBundle: b2025 });
    expect(tiers.map(t => t.rank)).toEqual(tiers.map((_, i) => i + 1));
    expect(tiers[0].avgPts).toBeGreaterThan(tiers[tiers.length - 1].avgPts);
  });

  it('honours the stability rule — the cut barely moves round to round (§3)', () => {
    const prev = replayed[replayed.length - 1].tiers;
    const next = tiersForNextRound({ replayed, prevBundle: b2025 });
    const prevTier = Object.fromEntries(prev.map(t => [t.code, t.tier]));
    const moved = next.filter(t => prevTier[t.code] && prevTier[t.code] !== t.tier);
    expect(moved.length).toBeLessThanOrEqual(4);
  });

  it('returns nothing when no round has been scored yet', () => {
    expect(tiersForNextRound({ replayed: [], prevBundle: b2025 })).toEqual([]);
  });
});

describe('replay', () => {
  it('covers every scored round of 2026 and produces a tier cut for each', () => {
    const replayed = replay(bundle(2026), bundle(2025));
    expect(replayed.map(r => r.round)).toEqual(Object.keys(bundle(2026).results).map(Number).sort((a, b) => a - b));
    for (const step of replayed) {
      expect(step.tiers.length).toBe(step.context.entries.length);
      expect(Object.keys(step.scores.drivers).length).toBe(step.context.entries.length);
    }
  });
});
