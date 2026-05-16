import { describe, it, expect } from 'vitest';
import {
  wmoToGlyph,
  wmoToDescription,
  formatTemp,
  pickSessionHours,
  summarizeHourly,
  wmoFromMeans,
} from './weather.js';

describe('wmoToGlyph', () => {
  it('maps clear sky', () => {
    expect(wmoToGlyph(0)).toBe('clear');
  });
  it('maps partly cloudy (1, 2)', () => {
    expect(wmoToGlyph(1)).toBe('partly-cloudy');
    expect(wmoToGlyph(2)).toBe('partly-cloudy');
  });
  it('maps overcast (3) to cloudy', () => {
    expect(wmoToGlyph(3)).toBe('cloudy');
  });
  it('maps fog codes (45, 48)', () => {
    expect(wmoToGlyph(45)).toBe('fog');
    expect(wmoToGlyph(48)).toBe('fog');
  });
  it('maps drizzle (51, 53, 55, 56, 57)', () => {
    [51, 53, 55, 56, 57].forEach(c => expect(wmoToGlyph(c)).toBe('drizzle'));
  });
  it('maps rain codes (61, 63, 65, 66, 67, 80, 81, 82)', () => {
    [61, 63, 65, 66, 67, 80, 81, 82].forEach(c => expect(wmoToGlyph(c)).toBe('rain'));
  });
  it('maps snow codes (71, 73, 75, 77, 85, 86)', () => {
    [71, 73, 75, 77, 85, 86].forEach(c => expect(wmoToGlyph(c)).toBe('snow'));
  });
  it('maps thunderstorm codes (95, 96, 99)', () => {
    [95, 96, 99].forEach(c => expect(wmoToGlyph(c)).toBe('storm'));
  });
  it('defaults to cloudy for unknown codes', () => {
    expect(wmoToGlyph(999)).toBe('cloudy');
    expect(wmoToGlyph(null)).toBe('cloudy');
    expect(wmoToGlyph(undefined)).toBe('cloudy');
  });
});

describe('wmoToDescription', () => {
  it('returns a human-readable string', () => {
    expect(wmoToDescription(0)).toMatch(/clear/i);
    expect(wmoToDescription(95)).toMatch(/thunder/i);
  });
  it('returns "Unknown" for unknown codes', () => {
    expect(wmoToDescription(999)).toBe('Unknown');
  });
});

describe('formatTemp', () => {
  it('rounds Celsius', () => {
    expect(formatTemp(22.4, false)).toBe('22°');
    expect(formatTemp(22.6, false)).toBe('23°');
  });
  it('converts to Fahrenheit and rounds', () => {
    expect(formatTemp(0, true)).toBe('32°');
    expect(formatTemp(100, true)).toBe('212°');
    expect(formatTemp(22, true)).toBe('72°');
  });
  it('returns dash for null', () => {
    expect(formatTemp(null, false)).toBe('-');
    expect(formatTemp(undefined, true)).toBe('-');
  });
});

describe('pickSessionHours', () => {
  const hourly = Array.from({ length: 24 }, (_, i) => ({
    tISO: `2026-05-24T${String(i).padStart(2, '0')}:00:00Z`,
    tempC: 20 + i * 0.1,
    precipProbPct: 0,
    precipMm: 0,
    wmo: 0,
  }));

  it('returns 7 entries centred on the session start', () => {
    const sessionMs = new Date('2026-05-24T15:00:00Z').getTime();
    const result = pickSessionHours(hourly, sessionMs);
    expect(result).toHaveLength(7);
    expect(result[3].tISO).toBe('2026-05-24T15:00:00Z');
    expect(result[0].tISO).toBe('2026-05-24T12:00:00Z');
    expect(result[6].tISO).toBe('2026-05-24T18:00:00Z');
  });

  it('clamps to start when session is in first hours', () => {
    const sessionMs = new Date('2026-05-24T01:00:00Z').getTime();
    const result = pickSessionHours(hourly, sessionMs);
    expect(result).toHaveLength(7);
    expect(result[0].tISO).toBe('2026-05-24T00:00:00Z');
  });

  it('clamps to end when session is near last hours', () => {
    const sessionMs = new Date('2026-05-24T23:00:00Z').getTime();
    const result = pickSessionHours(hourly, sessionMs);
    expect(result).toHaveLength(7);
    expect(result[6].tISO).toBe('2026-05-24T23:00:00Z');
  });

  it('returns [] when array is empty', () => {
    expect(pickSessionHours([], Date.now())).toEqual([]);
  });
});

describe('summarizeHourly', () => {
  it('describes clear-throughout', () => {
    const hours = Array.from({ length: 7 }, () => ({ wmo: 0, precipProbPct: 5, tempC: 22 }));
    expect(summarizeHourly(hours)).toBe('Dry conditions throughout the session window.');
  });
  it('describes rain-throughout', () => {
    const hours = Array.from({ length: 7 }, () => ({ wmo: 63, precipProbPct: 80, tempC: 18 }));
    expect(summarizeHourly(hours)).toBe('Wet conditions expected across the full session window.');
  });
  it('describes fog-throughout as wet', () => {
    const hours = Array.from({ length: 7 }, () => ({ wmo: 45, precipProbPct: 0, tempC: 12 }));
    expect(summarizeHourly(hours)).toBe('Wet conditions expected across the full session window.');
  });
  it('describes snow-throughout as wet', () => {
    const hours = Array.from({ length: 7 }, () => ({ wmo: 73, precipProbPct: 0, tempC: -2 }));
    expect(summarizeHourly(hours)).toBe('Wet conditions expected across the full session window.');
  });
  it('describes rain-then-clear', () => {
    const hours = [
      { wmo: 63, precipProbPct: 80, tempC: 18 },
      { wmo: 63, precipProbPct: 70, tempC: 18 },
      { wmo: 63, precipProbPct: 60, tempC: 19 },
      { wmo: 2, precipProbPct: 30, tempC: 20 },
      { wmo: 1, precipProbPct: 10, tempC: 21 },
      { wmo: 0, precipProbPct: 5, tempC: 22 },
      { wmo: 0, precipProbPct: 5, tempC: 22 },
    ];
    expect(summarizeHourly(hours)).toBe('Rain at the start of the window, easing later.');
  });
  it('describes dry-then-rain', () => {
    const hours = [
      { wmo: 0, precipProbPct: 5, tempC: 22 },
      { wmo: 0, precipProbPct: 5, tempC: 22 },
      { wmo: 1, precipProbPct: 10, tempC: 21 },
      { wmo: 2, precipProbPct: 30, tempC: 20 },
      { wmo: 63, precipProbPct: 60, tempC: 19 },
      { wmo: 63, precipProbPct: 70, tempC: 18 },
      { wmo: 63, precipProbPct: 80, tempC: 18 },
    ];
    expect(summarizeHourly(hours)).toBe('Dry early, with rain developing later in the window.');
  });
  it('describes intermittent showers', () => {
    const hours = [
      { wmo: 0, precipProbPct: 5, tempC: 22 },
      { wmo: 63, precipProbPct: 60, tempC: 19 },
      { wmo: 0, precipProbPct: 10, tempC: 21 },
      { wmo: 63, precipProbPct: 60, tempC: 19 },
      { wmo: 0, precipProbPct: 10, tempC: 21 },
      { wmo: 63, precipProbPct: 60, tempC: 19 },
      { wmo: 0, precipProbPct: 10, tempC: 21 },
    ];
    expect(summarizeHourly(hours)).toBe('Intermittent showers across the session window.');
  });
  it('returns empty string for empty input', () => {
    expect(summarizeHourly([])).toBe('');
  });
});

describe('wmoFromMeans', () => {
  it('returns clear for low cloud + zero precip', () => {
    expect(wmoFromMeans(10, 0)).toBe(0);
  });
  it('returns partly-cloudy code for moderate cloud + zero precip', () => {
    expect(wmoFromMeans(45, 0)).toBe(2);
  });
  it('returns cloudy code for high cloud + zero precip', () => {
    expect(wmoFromMeans(85, 0)).toBe(3);
  });
  it('returns rain code for any cloud + significant precip', () => {
    expect(wmoFromMeans(60, 5)).toBe(63);
  });
});
