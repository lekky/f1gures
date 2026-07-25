import { describe, it, expect } from 'vitest';
import {
  decodeLaps, cumTimes, gapByLap, posByLap, overtakeList, overtakeCount,
  fastestLap, lap1Gains, duelGap, teamPace, degSeries, undercutWindows,
  segmentBests, theoreticalBest, progressionRows, spreadLabels, cornerMarkers, placeCornerLabels, compoundOffsets,
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
  it('one null-position car (a retiree) does not corrupt the rest of the lap order', () => {
    // PIT pitted on lap 1 (null lap time → median-patched to an unreliably
    // fast cumulative time) but the feed still has it P4; RET is a retiree
    // with a null feed position. The old all-or-nothing fallback re-ranked the
    // whole field by that patched time and spiked PIT to the front — regression.
    const green = (pos, t) => [[1, t, pos, 'M', 1, 1, 0, 0, 1]];
    const laps = decodeLaps({
      P1: green(1, 100), P2: green(2, 100), P3: green(3, 100),
      PIT: [[1, null, 4, 'M', 1, 1, 1, 0, 0]], // pitted: null lap time, feed pos 4
      RET: green(null, 100),                   // retiree: null feed position
    });
    const grid = { P1: 1, P2: 2, P3: 3, PIT: 4, RET: 5 };
    const pos = posByLap(laps, cumTimes(laps), (c) => grid[c]);
    expect(pos.PIT[1]).toBe(4); // kept its feed position, not spiked to the front
    expect([pos.P1[1], pos.P2[1], pos.P3[1]]).toEqual([1, 2, 3]);
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
  it('theoreticalBest sums session-best sectors and sorts by ideal', () => {
    const rows = theoreticalBest([
      { code: 'AAA', lap: 88, s: [28, 36, 24], bs: [28, 36, 24.2] },
      { code: 'BBB', lap: 88.5, s: [28.2, 36.3, 24], bs: [28, 36, 24] },
    ]);
    expect(rows[0].code).toBe('BBB');
    expect(rows[0].ideal).toBeCloseTo(88, 5);
    expect(rows[0].lost).toBeCloseTo(0.5, 5);
  });
  it('theoreticalBest skips legacy rows without session-best sectors', () => {
    // pre-`bs` JSONs only carry best-lap sectors, which always sum to the lap
    expect(theoreticalBest([{ code: 'AAA', lap: 88, s: [28, 36, 24] }])).toEqual([]);
    expect(theoreticalBest([{ code: 'AAA', lap: 88, s: [28, 36, 24], bs: [28, null, 24] }])).toEqual([]);
  });
  it('progressionRows keeps nulls for knocked-out segments', () => {
    expect(progressionRows(results)[1].segs).toEqual([89.5, 89.2, null]);
  });
});

describe('cornerMarkers', () => {
  const corners = [{ name: 'T1', d: 0 }, { name: 'T2', d: 500 }, { name: 'T3', d: 1000 }];

  it('maps corner distance to an outline index', () => {
    expect(cornerMarkers(corners, 1000, 101)).toEqual([
      { label: 'T1', idx: 0 }, { label: 'T2', idx: 50 }, { label: 'T3', idx: 100 },
    ]);
  });

  it('merges corners too close to label separately', () => {
    // T6/T7 are 37m apart at the Hungaroring — ~2 indices of 240
    const tight = [{ name: 'T6', d: 2353 }, { name: 'T7', d: 2390 }];
    const out = cornerMarkers(tight, 4342, 240);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('T6/7');
  });

  it('keeps a suffixed corner readable when merged', () => {
    const out = cornerMarkers([{ name: 'T12', d: 100 }, { name: 'T12A', d: 104 }], 4342, 240);
    expect(out[0].label).toBe('T12/12A');
  });

  it('orders by distance regardless of input order', () => {
    const out = cornerMarkers([{ name: 'T3', d: 900 }, { name: 'T1', d: 100 }], 1000, 101);
    expect(out.map((m) => m.label)).toEqual(['T1', 'T3']);
  });

  it('drops a corner whose distance contradicts the rest of the lap', () => {
    // Baku 2025 shape: one corner reports a distance from the wrong part of the
    // lap, and the other nineteen agree with each other
    const baku = Array.from({ length: 20 }, (_, i) => ({ name: `T${i + 1}`, d: (i + 1) * 290 }));
    baku[19].d = 2176;
    const out = cornerMarkers(baku, 5937, 240);
    expect(out.map((m) => m.label)).not.toContain('T20');
    expect(out.length).toBeGreaterThanOrEqual(18);
  });

  it('falls back to almost nothing when the whole lap is scrambled', () => {
    // São Paulo 2022: distances contradict each other wholesale, so there is no
    // coherent majority to keep. Degrading to a near-empty map is the point —
    // the alternative is a map confidently naming the wrong corners.
    const sao = [351, 539, 598, 1086, 1086, 454, 176, 10, 2022, 2389, 1921, 1622, 1674, 2379, 54]
      .map((d, i) => ({ name: `T${i + 1}`, d }));
    const labels = cornerMarkers(sao, 4234, 240).map((m) => m.label);
    for (const bad of ['T7', 'T8', 'T15']) expect(labels.join(' ')).not.toMatch(new RegExp(`\\bT${bad.slice(1)}\\b`));
    expect(labels.length).toBeLessThanOrEqual(4);
  });

  it('keeps every corner when the lap is self-consistent', () => {
    const clean = Array.from({ length: 16 }, (_, i) => ({ name: `T${i + 1}`, d: (i + 1) * 250 }));
    expect(cornerMarkers(clean, 4342, 240)).toHaveLength(16);
  });

  it('clamps to the outline and tolerates missing input', () => {
    expect(cornerMarkers([{ name: 'T1', d: 9999 }], 1000, 51)[0].idx).toBe(50);
    expect(cornerMarkers(null, 1000, 240)).toEqual([]);
    expect(cornerMarkers(corners, 0, 240)).toEqual([]);
    expect(cornerMarkers(corners, 1000, 1)).toEqual([]);
  });
});

describe('placeCornerLabels', () => {
  // a corner at (100, 100) whose outward normal points straight up
  const at = (label, px, py, ux = 0, uy = -1, idx = 0) => ({ label, px, py, ux, uy, idx });

  it('takes the plain outward offset when nothing is in the way', () => {
    const [m] = placeCornerLabels([at('T1', 100, 100)], { w: 400, h: 400 });
    expect(m.dist).toBe(30);
    expect([m.x, Math.round(m.y)]).toEqual([100, 70]);
  });

  it('pushes further out when the first slot is taken', () => {
    const out = placeCornerLabels([at('T1', 100, 100), at('T2', 106, 100)], { w: 400, h: 400 });
    expect(out[0].dist).toBe(30);
    expect(Math.hypot(out[1].x - out[0].x, out[1].y - out[0].y)).toBeGreaterThanOrEqual(15);
  });

  it('flips onto the infield when outward runs off the canvas', () => {
    // corner near the top edge, normal pointing up: no outward slot fits
    const [m] = placeCornerLabels([at('T1', 100, 12)], { w: 400, h: 400 });
    expect(m.dist).toBeLessThan(0);
    expect(m.y).toBeGreaterThan(12);
  });

  it('avoids planting a label on the track ribbon', () => {
    // a straight of track sits exactly where the outward normal points
    const ribbon = Array.from({ length: 40 }, (_, i) => [60 + i * 2, 70]);
    const [m] = placeCornerLabels([at('T1', 100, 100, 0, -1, 99)], { w: 400, h: 400, track: ribbon });
    expect(ribbon.some((q) => Math.hypot(q[0] - m.x, q[1] - m.y) < 19)).toBe(false);
  });

  it('still returns a position for every label when nothing fits', () => {
    const boxed = Array.from({ length: 400 }, (_, i) => [i % 20 * 5, Math.floor(i / 20) * 5]);
    const out = placeCornerLabels([at('T1', 50, 50)], { w: 100, h: 100, track: boxed });
    expect(out).toHaveLength(1);
    expect(Number.isFinite(out[0].x) && Number.isFinite(out[0].y)).toBe(true);
  });
});

describe('spreadLabels', () => {
  const gaps = (out) => out.slice(1).map((o, i) => +(o.y - out[i].y).toFixed(6));

  it('leaves already-separated labels untouched', () => {
    const out = spreadLabels([{ code: 'A', y: 50 }, { code: 'B', y: 200 }], 11, 30, 470);
    expect(out.map((o) => o.y)).toEqual([50, 200]);
  });

  it('pushes apart labels closer than minGap', () => {
    // the Hungary 2026 case: pole and P2 0.012s apart land on the same pixel
    const out = spreadLabels([{ code: 'NOR', y: 100 }, { code: 'HAM', y: 100.4 }], 11, 30, 470);
    expect(out.map((o) => o.code)).toEqual(['NOR', 'HAM']);
    expect(gaps(out)).toEqual([11]);
  });

  it('returns copies sorted top-down without mutating the input', () => {
    const input = [{ code: 'B', y: 300 }, { code: 'A', y: 40 }];
    const out = spreadLabels(input, 11, 30, 470);
    expect(out.map((o) => o.code)).toEqual(['A', 'B']);
    expect(input[0]).toEqual({ code: 'B', y: 300 });
  });

  it('walks back up when a cluster spills past the bottom', () => {
    const out = spreadLabels(
      [{ code: 'A', y: 465 }, { code: 'B', y: 466 }, { code: 'C', y: 467 }], 11, 30, 470,
    );
    expect(out[out.length - 1].y).toBe(470);
    expect(gaps(out)).toEqual([11, 11]);
    expect(out[0].y).toBeGreaterThanOrEqual(30);
  });

  it('keeps every label inside the axis when the column is full', () => {
    const out = spreadLabels(
      Array.from({ length: 10 }, (_, i) => ({ code: `D${i}`, y: 250 })), 11, 30, 470,
    );
    expect(gaps(out)).toEqual(Array(9).fill(11));
    expect(out[0].y).toBeGreaterThanOrEqual(30);
    expect(out[out.length - 1].y).toBeLessThanOrEqual(470);
  });

  it('pins the top and overflows downward when labels outnumber the space', () => {
    // 50 labels × 11px needs 539px of a 440px axis — nothing can fit, but they
    // must still read top-down from the axis start rather than off the chart
    const out = spreadLabels(
      Array.from({ length: 50 }, (_, i) => ({ code: `D${i}`, y: 250 })), 11, 30, 470,
    );
    expect(out[0].y).toBe(30);
    expect(gaps(out)).toEqual(Array(49).fill(11));
  });

  it('handles an empty column', () => {
    expect(spreadLabels([], 11, 30, 470)).toEqual([]);
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
