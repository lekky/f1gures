// scripts/records/principal-entries.test.js
import { describe, it, expect } from 'vitest';
import { generatePrincipalEntries } from './generators.mjs';

const CURRENT_YEAR = 2026;

// Two teams, one cross-team boss (Flavio-like), one straddling the 1981 era
// boundary (Enzo-like, with a classic sub-bucket), one same-year cross-team
// handover (Mekies-like).
const teams = [
  {
    constructorRef: 'benetton_like', name: 'Benetton', color: '#00A550',
    principals: [
      { name: 'Flavio Boss', from: 1989, to: 1997, seasons: 9, races: 146, wins: 26, titles: 1, driverTitles: 2 },
    ],
  },
  {
    constructorRef: 'renault_like', name: 'Renault', color: '#FFF500',
    principals: [
      { name: 'Flavio Boss', from: 2002, to: 2009, toRound: 13, seasons: 8, races: 136, wins: 20, titles: 2, driverTitles: 2 },
    ],
  },
  {
    constructorRef: 'ferrari_like', name: 'Ferrari', color: '#DC0000',
    principals: [
      { name: 'Enzo Boss', from: 1950, to: 1988, seasons: 39, races: 443, wins: 95, titles: 8, driverTitles: 9,
        classic: { seasons: 31, races: 350, wins: 80, titles: 6, driverTitles: 9 } },
    ],
  },
  {
    constructorRef: 'rb_like', name: 'Racing Bulls', color: '#6692FF',
    principals: [
      { name: 'Laurent Handover', from: 2024, to: 2025, toRound: 12, seasons: 2, races: 36, wins: 0, titles: 0, driverTitles: 0 },
    ],
  },
  {
    constructorRef: 'redbull_like', name: 'Red Bull', color: '#3671C6',
    principals: [
      { name: 'Laurent Handover', from: 2025, fromRound: 13, to: null, current: true, seasons: 2, races: 24, wins: 6, titles: 0, driverTitles: 0 },
    ],
  },
];

describe('generatePrincipalEntries', () => {
  it('aggregates wins by person across teams', () => {
    const entries = generatePrincipalEntries(teams, 'wins', 'all-time', CURRENT_YEAR);
    const flavio = entries.find(e => e.name === 'Flavio Boss');
    expect(flavio.value).toBe(46); // 26 + 20
    expect(flavio.valueLabel).toBe('46 wins');
    expect(flavio.context).toBe('1989-2009 · 2 teams');
    // Primary team = most wins (Benetton, 26 > 20)
    expect(flavio.teamRef).toBe('benetton_like');
    expect(flavio.teamColor).toBe('#00A550');
  });

  it('splits eras from the classic sub-bucket', () => {
    const classic = generatePrincipalEntries(teams, 'wins', 'classic', CURRENT_YEAR);
    const enzoClassic = classic.find(e => e.name === 'Enzo Boss');
    expect(enzoClassic.value).toBe(80);
    // Flavio has no classic bucket → no classic entry
    expect(classic.find(e => e.name === 'Flavio Boss')).toBeUndefined();

    const modern = generatePrincipalEntries(teams, 'wins', 'modern', CURRENT_YEAR);
    const enzoModern = modern.find(e => e.name === 'Enzo Boss');
    expect(enzoModern.value).toBe(15); // 95 - 80
    expect(enzoModern.context).toBe('1981-1988');
  });

  it('splits era titles the same way', () => {
    const classic = generatePrincipalEntries(teams, 'titles', 'classic', CURRENT_YEAR);
    expect(classic.find(e => e.name === 'Enzo Boss').value).toBe(6);
    const modern = generatePrincipalEntries(teams, 'titles', 'modern', CURRENT_YEAR);
    expect(modern.find(e => e.name === 'Enzo Boss').value).toBe(2); // 8 - 6
  });

  it('counts seasons uniquely across a same-year cross-team handover', () => {
    const entries = generatePrincipalEntries(teams, 'seasons', 'all-time', CURRENT_YEAR);
    const laurent = entries.find(e => e.name === 'Laurent Handover');
    // 2024+2025 (RB) + 2025+2026 (Red Bull) = 4 tenure-seasons, 3 unique years
    expect(laurent.value).toBe(3);
    expect(laurent.context).toBe('2024-present · 2 teams');
    // Primary team by wins → Red Bull
    expect(laurent.teamRef).toBe('redbull_like');
  });

  it('drops zero-value entries and ranks with ties', () => {
    const entries = generatePrincipalEntries(teams, 'titles', 'all-time', CURRENT_YEAR);
    expect(entries.find(e => e.name === 'Laurent Handover')).toBeUndefined(); // 0 titles
    expect(entries[0].name).toBe('Enzo Boss');
    expect(entries[0].rank).toBe(1);
  });

  it('builds first/last/shortName from the person name', () => {
    const entries = generatePrincipalEntries(teams, 'wins', 'all-time', CURRENT_YEAR);
    const flavio = entries.find(e => e.name === 'Flavio Boss');
    expect(flavio.first).toBe('Flavio');
    expect(flavio.last).toBe('Boss');
    expect(flavio.shortName).toBe('F. Boss');
  });

  it('handles teams without principals', () => {
    const entries = generatePrincipalEntries([{ constructorRef: 'x', name: 'X' }], 'wins', 'all-time', CURRENT_YEAR);
    expect(entries).toEqual([]);
  });
});
