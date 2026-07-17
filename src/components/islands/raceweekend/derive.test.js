import { describe, it, expect } from 'vitest';
import {
  decodeLaps, cumTimes, gapByLap, posByLap, overtakeList, overtakeCount,
  fastestLap, lap1Gains, duelGap, teamPace, degSeries, undercutWindows,
  segmentBests, theoreticalBest, progressionRows, compoundOffsets,
  fuelCorrectedPace, fmtLap,
} from './derive.js';

// Compact-laps rows: [lap, t, pos, comp, tyreLife, stint, pit, neutral, green]
const row = (lap, t, pos, opts = {}) => [
  lap, t, pos, opts.c ?? 'M', opts.age ?? lap, opts.stint ?? 1,
  opts.pit ? 1 : 0, opts.neutral ? 1 : 0, opts.green === false || opts.pit || opts.neutral || lap === 1 ? 0 : 1,
];

describe('decodeLaps', () => {
  it('decodes the compact array shape', () => {
    const laps = decodeLaps({ AAA: [[3, 92.5, 4, 'H', 7, 2, 1, 0, 0]] });
    expect(laps.AAA[0]).toEqual({
      lap: 3, t: 92.5, pos: 4, c: 'H', age: 7, stint: 2, pit: true, neutral: false, green: false,
    });
  });
});

describe('cumTimes / gapByLap', () => {
  const laps = decodeLaps({
    AAA: [row(1, 90, 1), row(2, 90, 1)],
    BBB: [row(1, 91, 2), row(2, 91, 2)],
  });
  const cum = cumTimes(laps);
  it('accumulates lap times', () => {
    expect(cum.AAA).toEqual([90, 180]);
    expect(cum.BBB).toEqual([91, 182]);
  });
  it('gap to leader is zero for the leader and grows for the chaser', () => {
    const gaps = gapByLap(laps, cum);
    expect(gaps.AAA).toEqual([0, 0]);
    expect(gaps.BBB).toEqual([1, 2]);
  });
  it('patches null lap times with the driver median so cum stays finite', () => {
    const withNull = decodeLaps({ AAA: [row(1, null, 1), row(2, 90, 1), row(3, 92, 1)] });
    const c = cumTimes(withNull);
    // median of [90, 92] is the upper middle (92) in this implementation
    expect(c.AAA[2]).toBeCloseTo(92 + 90 + 92, 5);
  });
});

describe('posByLap', () => {
  it('uses the timing-feed positions when present, grid at index 0', () => {
    const laps = decodeLaps({ AAA: [row(1, 90, 2)], BBB: [row(1, 91, 1)] });
    const cum = cumTimes(laps);
    const pos = posByLap(laps, cum, (c) => (c === 'AAA' ? 1 : 2));
    expect(pos.AAA).toEqual([1, 2]);
    expect(pos.BBB).toEqual([2, 1]);
  });
  it('falls back to cumulative-time order when feed positions are missing', () => {
    const laps = decodeLaps({ AAA: [[1, 95, null, 'M', 1, 1, 0, 0, 0]], BBB: [[1, 92, null, 'M', 1, 1, 0, 0, 0]] });
    const cum = cumTimes(laps);
    const pos = posByLap(laps, cum, () => null);
    expect(pos.AAA[1]).toBe(2);
    expect(pos.BBB[1]).toBe(1);
  });
});

describe('overtakes', () => {
  // BBB passes AAA on lap 3, on track, green flag
  const laps = decodeLaps({
    AAA: [row(1, 90, 1), row(2, 90, 1), row(3, 95, 2)],
    BBB: [row(1, 91, 2), row(2, 90, 2), row(3, 89, 1)],
  });
  const cum = cumTimes(laps);
  const pos = posByLap(laps, cum, (c) => (c === 'AAA' ? 1 : 2));
  it('records who passed whom with lap and tyre', () => {
    const passes = overtakeList(laps, pos);
    expect(passes).toEqual([{ by: 'BBB', on: 'AAA', lap: 3, tyre: 'M' }]);
    expect(overtakeCount(laps, pos)).toBe(1);
  });
  it('ignores position changes on the passer’s pit laps', () => {
    const laps2 = decodeLaps({
      AAA: [row(1, 90, 1), row(2, 90, 1), row(3, 95, 2)],
      BBB: [row(1, 91, 2), row(2, 90, 2), row(3, 89, 1, { pit: true })],
    });
    const pos2 = posByLap(laps2, cumTimes(laps2), (c) => (c === 'AAA' ? 1 : 2));
    expect(overtakeList(laps2, pos2)).toEqual([]);
  });
});

describe('fastestLap', () => {
  it('skips lap 1, pit laps and neutralised laps', () => {
    const laps = decodeLaps({
      AAA: [row(1, 80, 1), row(2, 91, 1), row(3, 85, 1, { neutral: true }), row(4, 90, 1)],
    });
    expect(fastestLap(laps)).toEqual({ code: 'AAA', lap: 4, t: 90 });
  });
});

describe('lap1Gains', () => {
  it('ranks by places gained', () => {
    const pos = { AAA: [5, 2], BBB: [1, 3] };
    const gains = lap1Gains(pos, (c) => (c === 'AAA' ? 5 : 1));
    expect(gains[0]).toEqual({ code: 'AAA', grid: 5, after: 2, delta: 3 });
    expect(gains[1].delta).toBe(-2);
  });
});

describe('duelGap', () => {
  it('is positive when b is behind a', () => {
    const cum = { A: [90, 180], B: [92, 185] };
    expect(duelGap(cum, 'A', 'B')).toEqual([2, 5]);
  });
});

describe('teamPace', () => {
  it('computes quartiles over green laps only, sorted by median', () => {
    const mk = (base) => Array.from({ length: 10 }, (_, i) => row(i + 2, base + (i % 3) * 0.2, 1));
    const laps = decodeLaps({ AAA: mk(90), BBB: mk(92) });
    const pace = teamPace(laps, (c) => (c === 'AAA' ? 'fast' : 'slow'));
    expect(pace.length).toBe(2);
    expect(pace[0].team).toBe('fast');
    expect(pace[0].med).toBeLessThan(pace[1].med);
    expect(pace[0].q1).toBeLessThanOrEqual(pace[0].q3);
  });
});

describe('degSeries', () => {
  it('smooths green laps within a stint', () => {
    const laps = decodeLaps({
      AAA: Array.from({ length: 8 }, (_, i) => row(i + 2, 90 + i * 0.1, 1, { age: i + 1 })),
    });
    const stints = [{ code: 'AAA', compound: 'M', from: 2, to: 9 }];
    const series = degSeries(laps, stints, ['AAA']);
    expect(series.length).toBe(1);
    expect(series[0].pts.length).toBe(8);
    // interior points are 3-lap means
    expect(series[0].pts[1].t).toBeCloseTo((90 + 90.1 + 90.2) / 3, 5);
  });
});

describe('undercutWindows', () => {
  it('finds rivals within the window and measures the swing', () => {
    // AAA pits lap 5 (loses 20s that lap), BBB stays out; both run 12 laps.
    const mkLaps = (pitLap) => Array.from({ length: 12 }, (_, i) => {
      const lap = i + 1;
      const t = 90 + (pitLap === lap ? 20 : 0);
      return row(lap, t, 1, { pit: pitLap === lap });
    });
    const laps = decodeLaps({ AAA: mkLaps(5), BBB: mkLaps(null) });
    const cum = cumTimes(laps);
    const pos = posByLap(laps, cum, () => null);
    const pits = [{ code: 'AAA', lap: 5, dur: 20, neutral: 0 }];
    const wins = undercutWindows(laps, cum, pits, pos);
    expect(wins.length).toBe(1);
    expect(wins[0].code).toBe('AAA');
    const rival = wins[0].rivals.find((r) => r.code === 'BBB');
    expect(rival).toBeTruthy();
    expect(rival.gained).toBeCloseTo(-20, 1);
  });
});

describe('quali helpers', () => {
  const results = [
    { code: 'AAA', q1: 90, q2: 89, q3: 88 },
    { code: 'BBB', q1: 89.5, q2: 89.2, q3: null },
  ];
  it('segmentBests takes the min per segment', () => {
    expect(segmentBests(results)).toEqual({ q1: 89.5, q2: 89, q3: 88 });
  });
  it('theoreticalBest sums own best sectors and sorts by ideal', () => {
    const rows = theoreticalBest([
      { code: 'AAA', lap: 88, s: [28, 36, 24.2] },
      { code: 'BBB', lap: 88.5, s: [28, 36, 24] },
    ]);
    expect(rows[0].code).toBe('BBB');
    expect(rows[0].ideal).toBeCloseTo(88, 5);
    expect(rows[0].lost).toBeCloseTo(0.5, 5);
  });
  it('progressionRows keeps nulls for knocked-out segments', () => {
    expect(progressionRows(results)[1].segs).toEqual([89.5, 89.2, null]);
  });
});

describe('compoundOffsets', () => {
  it('expresses medians relative to the fastest compound', () => {
    const rows = compoundOffsets([
      { code: 'A', c: 'S', laps: 8, avg: 91 },
      { code: 'B', c: 'M', laps: 9, avg: 91.6 },
      { code: 'C', c: 'M', laps: 9, avg: 91.8 },
    ]);
    expect(rows[0].c).toBe('S');
    expect(rows[0].offset).toBe(0);
    // median of [91.6, 91.8] is the upper middle (91.8)
    expect(rows[1].offset).toBeCloseTo(0.8, 5);
  });
});

describe('fuelCorrectedPace', () => {
  it('normalises laps to zero-fuel pace', () => {
    // constant 90s laps: corrected pace = 90 - fuelPerLap*(total-lap), medians of fastest half
    const laps = decodeLaps({ AAA: Array.from({ length: 10 }, (_, i) => row(i + 2, 90, 1)) });
    const out = fuelCorrectedPace(laps, 11, 0.1);
    // fastest corrected laps are the late ones (least fuel correction removed)
    expect(out.AAA).toBeLessThan(90);
  });
});

describe('fmtLap', () => {
  it('formats minutes and seconds', () => {
    expect(fmtLap(88.111)).toBe('1:28.111');
    expect(fmtLap(59.5)).toBe('59.500');
    expect(fmtLap(null)).toBe('—');
  });
});
