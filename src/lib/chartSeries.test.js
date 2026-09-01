import { describe, it, expect } from 'vitest';
import {
  SERIES_DASH, dashForSlot, assignSeriesStyles, hexToRgb, colorDistance, colorGroups, stackLabels,
} from './chartSeries.js';

describe('assignSeriesStyles', () => {
  const drivers = [
    { id: 'norris', team: 'mclaren' },
    { id: 'leclerc', team: 'ferrari' },
    { id: 'piastri', team: 'mclaren' },
    { id: 'hamilton', team: 'ferrari' },
    { id: 'albon', team: 'williams' },
  ];
  const opts = { idOf: (d) => d.id, groupOf: (d) => d.team };

  it('draws the first car of a team solid and the second dashed', () => {
    const s = assignSeriesStyles(drivers, opts);
    expect(s.norris).toEqual({ slot: 0, dash: '', group: 'mclaren' });
    expect(s.piastri).toEqual({ slot: 1, dash: SERIES_DASH[1], group: 'mclaren' });
    expect(s.leclerc.dash).toBe('');
    expect(s.hamilton.dash).toBe(SERIES_DASH[1]);
    expect(s.albon.dash).toBe('');
  });

  it('is deterministic on input order (standings order decides "first car")', () => {
    const reversed = assignSeriesStyles([...drivers].reverse(), opts);
    expect(reversed.piastri.dash).toBe('');
    expect(reversed.norris.dash).toBe(SERIES_DASH[1]);
  });

  it('cycles solid → dashed → dotted → solid for multi-car entries', () => {
    const cars = ['a', 'b', 'c', 'd'].map((id) => ({ id, team: 'lotus' }));
    const s = assignSeriesStyles(cars, opts);
    expect(cars.map((c) => s[c.id].dash)).toEqual(['', '6 4', '2 3', '']);
    expect(dashForSlot(5)).toBe('2 3');
  });

  it('treats items with no group as solo (always solid)', () => {
    const s = assignSeriesStyles([{ id: 'x' }, { id: 'y' }], { idOf: (d) => d.id, groupOf: () => null });
    expect(s.x.dash).toBe('');
    expect(s.y.dash).toBe('');
    expect(s.x.group).not.toBe(s.y.group);
  });
});

describe('colour helpers', () => {
  it('parses 6- and 3-digit hex, rejects junk', () => {
    expect(hexToRgb('#64C4FF')).toEqual([100, 196, 255]);
    expect(hexToRgb('fff')).toEqual([255, 255, 255]);
    expect(hexToRgb('var(--accent)')).toBeNull();
    expect(hexToRgb('')).toBeNull();
  });

  it('measures Williams vs Racing Bulls as close, Alpine as far', () => {
    expect(colorDistance('#64C4FF', '#6692FF')).toBeLessThan(64);
    expect(colorDistance('#0093CC', '#64C4FF')).toBeGreaterThan(64);
    expect(colorDistance('#3671C6', '#6692FF')).toBeGreaterThan(64);
    expect(colorDistance('#E80020', 'nope')).toBe(Infinity);
  });

  it('buckets near-identical liveries together and everything else apart', () => {
    const teams = [
      { id: 'mclaren', color: '#FF8000' },
      { id: 'williams', color: '#64C4FF' },
      { id: 'alpine', color: '#0093CC' },
      { id: 'rb', color: '#6692FF' },
      { id: 'ferrari', color: '#E80020' },
    ];
    const groupOf = colorGroups(teams, (t) => t.color);
    expect(groupOf(teams[1])).toBe(groupOf(teams[3]));
    expect(groupOf(teams[1])).not.toBe(groupOf(teams[2]));
    expect(groupOf(teams[0])).not.toBe(groupOf(teams[4]));
    const styles = assignSeriesStyles(teams, { idOf: (t) => t.id, groupOf });
    expect(styles.williams.dash).toBe('');
    expect(styles.rb.dash).toBe(SERIES_DASH[1]);
    expect(styles.alpine.dash).toBe('');
  });

  it('cycles dashes across a historic grid that all fell back to one grey', () => {
    const teams = ['a', 'b', 'c', 'd'].map((id) => ({ id, color: '#888888' }));
    const styles = assignSeriesStyles(teams, { idOf: (t) => t.id, groupOf: colorGroups(teams, (t) => t.color) });
    expect(teams.map((t) => styles[t.id].dash)).toEqual(['', '6 4', '2 3', '']);
  });
});

describe('stackLabels', () => {
  it('leaves well-spaced labels alone', () => {
    const out = stackLabels([{ y: 50 }, { y: 100 }, { y: 200 }]);
    expect(out.map((o) => o.y)).toEqual([50, 100, 200]);
  });

  it('pushes colliding labels down by the gap', () => {
    const out = stackLabels([{ y: 100 }, { y: 101 }, { y: 102 }], 13);
    expect(out[0].y).toBe(100);
    expect(out[1].y).toBeGreaterThanOrEqual(out[0].y + 13);
    expect(out[2].y).toBeGreaterThanOrEqual(out[1].y + 13);
  });

  it('clamps into [top, bottom] and preserves item fields', () => {
    const out = stackLabels([{ code: 'NOR', y: -40 }, { code: 'PIA', y: 999 }], 13, 18, 370);
    expect(out[0]).toEqual({ code: 'NOR', y: 18 });
    expect(out[1].code).toBe('PIA');
    expect(out[1].y).toBeGreaterThanOrEqual(370);
  });
});
