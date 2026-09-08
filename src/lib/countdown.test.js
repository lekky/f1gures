import { describe, it, expect } from 'vitest';
import { splitDuration, unitLabel, countdownCells } from './countdown.js';

const H = 3600000;
const D = 24 * H;

describe('splitDuration', () => {
  it('splits a gap into days / hours / mins / secs', () => {
    expect(splitDuration(2 * D + 3 * H + 4 * 60000 + 5000)).toEqual({ days: 2, hours: 3, mins: 4, secs: 5 });
  });
  it('clamps negative and junk input to zero', () => {
    expect(splitDuration(-5000)).toEqual({ days: 0, hours: 0, mins: 0, secs: 0 });
    expect(splitDuration(NaN)).toEqual({ days: 0, hours: 0, mins: 0, secs: 0 });
  });
});

describe('unitLabel', () => {
  it('uses the singular only for exactly one', () => {
    expect(unitLabel(1, 'Hour')).toBe('Hour');
    expect(unitLabel(0, 'Hour')).toBe('Hours');
    expect(unitLabel(2, 'Hour')).toBe('Hours');
  });
  it('accepts an irregular plural', () => {
    expect(unitLabel(3, 'Day', 'Dayz')).toBe('Dayz');
  });
});

describe('countdownCells', () => {
  it('pluralises each unit independently (the feedback case: "1 hours")', () => {
    const cells = countdownCells(1 * D + 1 * H + 60000 + 1000);
    expect(cells.map(c => c.l)).toEqual(['Day', 'Hour', 'Min', 'Sec']);
    expect(cells.map(c => c.text)).toEqual(['01', '01', '01', '01']);
  });
  it('keeps plurals for zero and many', () => {
    const cells = countdownCells(12 * D + 0 * H + 30 * 60000);
    expect(cells.map(c => c.l)).toEqual(['Days', 'Hours', 'Mins', 'Secs']);
    expect(cells.map(c => c.text)).toEqual(['12', '00', '30', '00']);
  });
  it('has stable keys for React', () => {
    expect(countdownCells(0).map(c => c.key)).toEqual(['days', 'hours', 'mins', 'secs']);
  });
});
