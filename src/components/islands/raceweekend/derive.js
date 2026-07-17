// Pure lap-level derivations for the race-weekend Visualisation Explorer.
// Input shapes are the per-session JSONs written by scripts/fetch-fastf1.py
// (see docs/fastf1-pipeline.md). Everything here is plain data-in/data-out so
// vitest can cover it without React or fetch.

export const COMPOUNDS = {
  S: { name: 'SOFT', color: '#E10600', text: '#fff' },
  M: { name: 'MEDIUM', color: '#F5C518', text: '#111' },
  H: { name: 'HARD', color: '#EDEDED', text: '#111' },
  I: { name: 'INTER', color: '#2FAF56', text: '#fff' },
  W: { name: 'WET', color: '#2A78D6', text: '#fff' },
  U: { name: 'UNKNOWN', color: '#565760', text: '#fff' },
};

export function fmtLap(t) {
  if (t == null || !isFinite(t)) return '—';
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(3).padStart(6, '0');
  return m > 0 ? `${m}:${s}` : s;
}

export function fmtClock(t) {
  // race total time h:mm:ss.mmm
  if (t == null || !isFinite(t)) return '—';
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = (t % 60).toFixed(3).padStart(6, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// Decode the compact laps arrays into keyed objects.
// [lap, t, pos, comp, tyreLife, stint, pit, neutral, green]
export function decodeLaps(lapsJson) {
  const out = {};
  for (const code of Object.keys(lapsJson || {})) {
    out[code] = lapsJson[code].map((a) => ({
      lap: a[0], t: a[1], pos: a[2], c: a[3], age: a[4],
      stint: a[5], pit: !!a[6], neutral: !!a[7], green: !!a[8],
    }));
  }
  return out;
}

// Cumulative race time per driver per lap. Laps with a null LapTime (lap 1
// under standing start sometimes, or red flags) get patched with the median of
// that driver's neighbours so cumulative gaps stay usable.
export function cumTimes(laps) {
  const out = {};
  for (const code of Object.keys(laps)) {
    const arr = laps[code];
    const known = arr.filter((l) => l.t != null).map((l) => l.t).sort((a, b) => a - b);
    const median = known.length ? known[Math.floor(known.length / 2)] : null;
    let cum = 0;
    out[code] = arr.map((l) => {
      cum += l.t != null ? l.t : (median ?? 0);
      return cum;
    });
  }
  return out;
}

// Gap to race leader per lap: { code: [gapLap1, gapLap2, ...] }.
// The "leader" is the lowest cumulative time among drivers still running.
export function gapByLap(laps, cum) {
  const codes = Object.keys(laps);
  const maxLap = Math.max(0, ...codes.map((c) => laps[c].length));
  const leaders = [];
  for (let i = 0; i < maxLap; i++) {
    let lead = Infinity;
    for (const c of codes) if (i < cum[c].length && cum[c][i] < lead) lead = cum[c][i];
    leaders.push(lead);
  }
  const out = {};
  for (const c of codes) out[c] = cum[c].map((t, i) => +(t - leaders[i]).toFixed(3));
  return out;
}

// Positions per lap from the timing feed, index 0 = grid slot.
// { code: [grid, posL1, posL2, ...] } — falls back to cumulative-time order
// when the feed's Position column is null.
export function posByLap(laps, cum, gridOf) {
  const codes = Object.keys(laps);
  const maxLap = Math.max(0, ...codes.map((c) => laps[c].length));
  const out = {};
  for (const c of codes) out[c] = [gridOf(c) ?? codes.length];
  for (let i = 0; i < maxLap; i++) {
    const running = codes.filter((c) => i < laps[c].length);
    const withPos = running.filter((c) => laps[c][i].pos != null);
    if (withPos.length === running.length) {
      for (const c of running) out[c].push(laps[c][i].pos);
    } else {
      const order = [...running].sort((a, b) => cum[a][i] - cum[b][i]);
      order.forEach((c, k) => out[c].push(k + 1));
    }
  }
  return out;
}

// Net on-track passes (excludes lap 1, pit laps and SC/VSC laps on either side).
export function overtakeList(laps, pos) {
  const passes = [];
  const codes = Object.keys(laps);
  for (const c of codes) {
    const arr = pos[c];
    for (let lap = 2; lap < arr.length; lap++) {
      const l = laps[c][lap - 1];
      if (!l || l.pit || l.neutral) continue;
      const gained = arr[lap - 1] - arr[lap];
      if (gained <= 0) continue;
      // who did they pass? drivers whose position at `lap` is now behind but was ahead
      for (const v of codes) {
        if (v === c) continue;
        const va = pos[v];
        if (lap >= va.length) continue;
        const vl = laps[v][lap - 1];
        if (va[lap - 1] < arr[lap - 1] && va[lap] > arr[lap] && !(vl && vl.pit)) {
          passes.push({ by: c, on: v, lap, tyre: l.c });
        }
      }
    }
  }
  return passes;
}

export function overtakeCount(laps, pos) {
  let n = 0;
  for (const c of Object.keys(laps)) {
    const arr = pos[c];
    for (let lap = 2; lap < arr.length; lap++) {
      const l = laps[c][lap - 1];
      if (!l || l.pit || l.neutral) continue;
      if (arr[lap] < arr[lap - 1]) n += arr[lap - 1] - arr[lap];
    }
  }
  return n;
}

// Fastest race lap over green-flag laps (lap > 1).
export function fastestLap(laps) {
  let best = null;
  for (const c of Object.keys(laps)) {
    for (const l of laps[c]) {
      if (l.t == null || l.lap <= 1 || l.pit || l.neutral) continue;
      if (!best || l.t < best.t) best = { code: c, lap: l.lap, t: l.t };
    }
  }
  return best;
}

// Lap-1 gains: [{code, grid, after, delta}] sorted by delta desc.
export function lap1Gains(pos, gridOf) {
  return Object.keys(pos)
    .map((c) => {
      const grid = gridOf(c) ?? pos[c][0];
      const after = pos[c][1];
      if (after == null) return null;
      return { code: c, grid, after, delta: grid - after };
    })
    .filter(Boolean)
    .sort((a, b) => b.delta - a.delta || a.after - b.after);
}

// Gap between two drivers over the race (positive = b behind a).
export function duelGap(cum, a, b) {
  const n = Math.min(cum[a]?.length ?? 0, cum[b]?.length ?? 0);
  const out = [];
  for (let i = 0; i < n; i++) out.push(+(cum[b][i] - cum[a][i]).toFixed(3));
  return out;
}

// Team race pace quartiles over green-flag laps.
export function teamPace(laps, teamOf) {
  const byTeam = {};
  for (const c of Object.keys(laps)) {
    const t = teamOf(c);
    if (!t) continue;
    for (const l of laps[c]) {
      if (!l.green || l.t == null) continue;
      (byTeam[t] = byTeam[t] || []).push(l.t);
    }
  }
  const q = (arr, f) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(f * (s.length - 1))];
  };
  return Object.keys(byTeam)
    .filter((t) => byTeam[t].length >= 8)
    .map((t) => {
      const a = byTeam[t];
      return { team: t, n: a.length, med: q(a, 0.5), q1: q(a, 0.25), q3: q(a, 0.75), lo: q(a, 0.05), hi: q(a, 0.95) };
    })
    .sort((a, b) => a.med - b.med);
}

// Tyre-deg series: per driver+stint, 3-lap-smoothed green-flag pace vs tyre age.
export function degSeries(laps, stints, codes) {
  const out = [];
  for (const code of codes) {
    const arr = laps[code];
    if (!arr) continue;
    for (const st of stints.filter((s) => s.code === code)) {
      const pts = arr.filter((l) => l.green && l.t != null && l.lap >= st.from && l.lap <= st.to);
      if (pts.length < 4) continue;
      const sm = pts.map((l, i) => {
        const win = pts.slice(Math.max(0, i - 1), i + 2);
        return { age: l.age ?? (l.lap - st.from + 1), t: win.reduce((s, x) => s + x.t, 0) / win.length };
      });
      out.push({ code, compound: st.compound, from: st.from, to: st.to, pts: sm });
    }
  }
  return out;
}

// Undercut windows: for every green-flag pit stop, the delta to each rival
// within `windowS` seconds pre-stop, measured `settleLaps` after both have
// stopped. Positive gained = the stopper came out ahead of where they were.
export function undercutWindows(laps, cum, pits, pos, windowS = 5, settleLaps = 3) {
  const rows = [];
  const stopLap = {};
  for (const p of pits) {
    if (p.lap == null) continue;
    (stopLap[p.code] = stopLap[p.code] || []).push(p.lap);
  }
  for (const p of pits) {
    if (p.lap == null || p.lap <= 1) continue;
    const c = p.code;
    if (!cum[c] || p.lap - 2 < 0 || p.lap - 2 >= cum[c].length) continue;
    const rivals = [];
    for (const v of Object.keys(cum)) {
      if (v === c || !cum[v] || p.lap - 2 >= cum[v].length) continue;
      const gapBefore = cum[v][p.lap - 2] - cum[c][p.lap - 2];
      if (Math.abs(gapBefore) > windowS) continue;
      const vStops = stopLap[v] || [];
      const vStop = vStops.find((l) => Math.abs(l - p.lap) <= 6);
      const settle = Math.max(p.lap, vStop ?? p.lap) + settleLaps;
      if (settle - 1 >= cum[c].length || settle - 1 >= cum[v].length) continue;
      const gapAfter = cum[v][settle - 1] - cum[c][settle - 1];
      rivals.push({ code: v, before: +gapBefore.toFixed(2), after: +gapAfter.toFixed(2), gained: +(gapAfter - gapBefore).toFixed(2), rivalStop: vStop ?? null });
    }
    if (rivals.length) rows.push({ code: c, lap: p.lap, neutral: !!p.neutral, rivals });
  }
  return rows.sort((a, b) => a.lap - b.lap);
}

// ---- qualifying helpers ----

// Best time per segment column across the field: { q1, q2, q3 }.
export function segmentBests(results) {
  const best = {};
  for (const seg of ['q1', 'q2', 'q3']) {
    const vals = results.map((r) => r[seg]).filter((v) => v != null);
    best[seg] = vals.length ? Math.min(...vals) : null;
  }
  return best;
}

// Theoretical best: sum of each driver's session-best sectors (`bs` — best of
// any non-deleted lap) vs their actual best lap. Older session JSONs only ship
// best-lap sectors (`s`), which by construction sum to the best lap itself
// (lost = 0.000 for everyone) — those rows are skipped so the chart shows an
// honest empty state instead.
export function theoreticalBest(sectors) {
  return sectors
    .filter((s) => s.lap != null && Array.isArray(s.bs) && s.bs.every((v) => v != null))
    .map((s) => {
      const ideal = +(s.bs[0] + s.bs[1] + s.bs[2]).toFixed(3);
      return { code: s.code, actual: s.lap, ideal, lost: +(s.lap - ideal).toFixed(3) };
    })
    .sort((a, b) => a.ideal - b.ideal);
}

// Q1→Q3 slope chart rows.
export function progressionRows(results) {
  return results
    .filter((r) => r.q1 != null)
    .map((r) => ({ code: r.code, segs: [r.q1, r.q2 ?? null, r.q3 ?? null] }));
}

// FP long-run compound offsets: median avg per compound, expressed vs SOFT
// (or the fastest compound present).
export function compoundOffsets(longRuns) {
  const byC = {};
  for (const r of longRuns) (byC[r.c] = byC[r.c] || []).push(r.avg);
  const med = (a) => {
    const s = [...a].sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)];
  };
  const meds = Object.keys(byC).map((c) => ({ c, med: med(byC[c]), n: byC[c].length }));
  if (!meds.length) return [];
  const base = Math.min(...meds.map((m) => m.med));
  return meds
    .map((m) => ({ ...m, offset: +(m.med - base).toFixed(3) }))
    .sort((a, b) => a.med - b.med);
}

// Fuel-corrected pace comparison between two race-ish sessions (sprint vs GP)
// or FP long runs vs the race. Correction: assume `fuelPerLap` seconds of lap
// time per lap of fuel remaining, normalise both to zero-fuel pace.
export function fuelCorrectedPace(laps, totalLaps, fuelPerLap = 0.055) {
  const out = {};
  for (const c of Object.keys(laps)) {
    const greens = laps[c].filter((l) => l.green && l.t != null);
    if (greens.length < 5) continue;
    const corrected = greens.map((l) => l.t - fuelPerLap * (totalLaps - l.lap));
    corrected.sort((a, b) => a - b);
    // median of the fastest half — robust to traffic
    const half = corrected.slice(0, Math.max(3, Math.floor(corrected.length / 2)));
    out[c] = +(half.reduce((s, x) => s + x, 0) / half.length).toFixed(3);
  }
  return out;
}
