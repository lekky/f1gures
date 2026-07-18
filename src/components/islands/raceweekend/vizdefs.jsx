// The visualisation registry: every chart in the explorer, per session kind.
// Each def: { key, tag, title, desc, src, filter?, render(args) } where args =
//   { sess, R, deg, pace, ctx, sel, raceSess, raceR }
//   tag    — short mono badge shown on the gallery card (e.g. GAP, LAPS)
//   filter — true when the chart honours the driver filter, so the modal
//            surfaces the driver-filter chips for it
// All charts are live — ones that need data from a session that hasn't run
// yet render an explanatory empty state instead.
import React from 'react';
import {
  RaceTrace, PositionChart, StintChart, PitTimeline, DegChart, TeamPaceChart,
  OvertakeMatrix, UndercutTable, Lap1Chart, DuelChart, WeatherStrip,
  RaceControlFeed, PaceComparison, DumbbellPairs, EmptyNote,
} from './charts-race.jsx';
import {
  GapLadder, SectorBattle, DominanceMap, PoleTelemetry, ProgressionChart,
  TheoreticalBest, LapScatter, SpeedTrapChart, LongRunChart, CompoundOffsetChart,
} from './charts-quali.jsx';
import { fuelCorrectedPace, fmtLap } from './derive.js';

const RACE_VIZ = [
  { key: 'trace', tag: 'GAP', title: 'Race trace', src: 'laps["LapTime"] cumulative + track_status', filter: true,
    desc: 'Gap to leader lap by lap — pit stops step the line, SC/VSC bands explain the resets.',
    render: (a) => <RaceTrace R={a.R} ctx={a.ctx} sel={a.sel} /> },
  { key: 'positions', tag: 'LAPS', title: 'Position changes', src: 'laps["Position"] per lap', filter: true,
    desc: 'Grid to flag for the whole field. Filtered drivers highlighted; hover for the running order at any lap.',
    render: (a) => <PositionChart R={a.R} ctx={a.ctx} sel={a.sel} /> },
  { key: 'stints', tag: 'STINTS', title: 'Tyre strategy', src: 'laps["Compound","Stint","TyreLife"]',
    desc: 'Every stint as a compound-coloured bar in finish order. Ticks mark pit stops.',
    render: (a) => <StintChart R={a.R} ctx={a.ctx} /> },
  { key: 'pits', tag: 'SEC', title: 'Pit stop timeline', src: 'laps["PitInTime","PitOutTime"]',
    desc: 'Pit-lane time by lap. Diamonds mark cheap stops under SC/VSC — strategy luck, quantified.',
    render: (a) => <PitTimeline R={a.R} ctx={a.ctx} /> },
  { key: 'deg', tag: 'DEG', title: 'Tyre degradation', src: 'laps + TyreLife, green-flag filter', filter: true,
    desc: 'Clean-lap pace vs tyre age per stint, per compound, for the filtered drivers (3-lap smoothing).',
    render: (a) => <DegChart R={a.R} ctx={a.ctx} sel={a.sel} deg={a.deg} /> },
  { key: 'teampace', tag: 'QUART', title: 'Team race pace', src: 'laps["LapTime"] quartiles by team',
    desc: 'Box plots of clean race laps per team, fastest first — the honest pecking order behind the result.',
    render: (a) => <TeamPaceChart pace={a.pace} ctx={a.ctx} /> },
  { key: 'overtakes', tag: 'PASS', title: 'Overtake matrix', src: 'laps["Position"] deltas',
    desc: 'Who passed whom, when, and on what tyre — every on-track pass grouped by the overtaker.',
    render: (a) => <OvertakeMatrix R={a.R} ctx={a.ctx} /> },
  { key: 'undercut', tag: 'WINDOW', title: 'Undercut calculator', src: 'laps around PitInTime windows',
    desc: 'For each green-flag stop: time gained or lost against every rival within five seconds.',
    render: (a) => <UndercutTable R={a.R} ctx={a.ctx} /> },
  { key: 'lap1', tag: 'START', title: 'Lap 1 gains & losses', src: 'grid vs P after L1',
    desc: 'Places gained and lost at lights out — the launch, the first braking zone, the chaos.',
    render: (a) => <Lap1Chart R={a.R} ctx={a.ctx} /> },
  { key: 'duel', tag: 'PAIR', title: 'Duel picker', src: 'cumulative LapTime delta, any pair',
    desc: 'Pick any two drivers and get their gap over the whole race, pit stops marked.',
    render: (a) => <DuelChart R={a.R} ctx={a.ctx} /> },
  { key: 'weather', tag: 'WX', title: 'Weather overlay', src: 'session.weather_data',
    desc: 'Track temp, air temp, wind and rain across the session — the conditions behind the deg story.',
    render: (a) => <WeatherStrip weather={a.sess.weather} /> },
  { key: 'racecontrol', tag: 'FEED', title: 'Race control feed', src: 'session.race_control_messages',
    desc: 'Every flag, SC deployment, penalty and investigation as a timestamped feed.',
    render: (a) => <RaceControlFeed raceControl={a.sess.raceControl} /> },
];

const QUALI_VIZ = [
  { key: 'ladder', tag: 'POLE', title: 'Gap to pole ladder', src: 'laps.pick_fastest() per driver',
    desc: 'Final-segment deltas as team-coloured bars — the top ten at a glance.',
    render: (a) => <GapLadder results={a.sess.results} ctx={a.ctx} /> },
  { key: 'sectors', tag: 'SEC', title: 'Sector battle', src: 'laps["Sector1/2/3Time"]',
    desc: 'Best-lap sector heat table. Purple = benchmark, green tint = within 0.08s.',
    render: (a) => <SectorBattle sectors={a.sess.sectors} ctx={a.ctx} /> },
  { key: 'dominance', tag: 'MAP', title: 'Track dominance map', src: 'telemetry distance-sliced mini-sectors',
    desc: 'The circuit coloured by who was fastest in each mini-sector, among the top three.',
    render: (a) => <DominanceMap dominance={a.sess.dominance} track={a.sess.track} ctx={a.ctx} /> },
  { key: 'poletel', tag: 'TEL', title: 'Pole lap telemetry', src: 'car_data["Speed"] + computed delta',
    desc: 'Speed traces with a live time-delta strip and corner bands — defaults to the front row, or pick any two drivers. Hover anywhere on the lap.',
    render: (a) => <PoleTelemetry poleTel={a.sess.poleTel} ctx={a.ctx} /> },
  { key: 'progression', tag: 'SLOPE', title: 'Q1→Q3 progression', src: 'laps per Q segment',
    desc: 'Slope chart of each driver’s best across the segments — who found pace, who peaked early.',
    render: (a) => <ProgressionChart results={a.sess.results} ctx={a.ctx} /> },
  { key: 'theoretical', tag: 'IDEAL', title: 'Theoretical best', src: 'best-lap sectors vs actual',
    desc: 'Ideal lap from each driver’s own best sectors vs what they actually posted.',
    render: (a) => <TheoreticalBest sectors={a.sess.sectors} ctx={a.ctx} /> },
  { key: 'evolution', tag: 'GRIP', title: 'Track evolution', src: 'laps["LapStartTime","LapTime"]',
    desc: 'Every timed lap against session time — the grip ramp that shapes the knockouts. Dashed rings are deleted laps.',
    render: (a) => <LapScatter lapsAll={a.sess.lapsAll} ctx={a.ctx} showDeleted /> },
  { key: 'speedtrap', tag: 'TRAP', title: 'Speed trap ranking', src: 'laps["SpeedST"]',
    desc: 'Speed-trap maxima from the best laps — who ran skinny wings for Sunday.',
    render: (a) => <SpeedTrapChart traps={(a.sess.sectors || []).map((s) => ({ code: s.code, st: s.st })).filter((s) => s.st != null).sort((x, y) => y.st - x.st)} ctx={a.ctx} /> },
];

const SQ_VIZ = [
  { key: 'ladder', tag: 'POLE', title: 'Gap to sprint pole', src: 'laps.pick_fastest() per driver',
    desc: 'SQ3 deltas as team-coloured bars.',
    render: (a) => <GapLadder results={a.sess.results} ctx={a.ctx} poleLabel="SPRINT POLE" /> },
  { key: 'evolution', tag: 'GRIP', title: 'Track evolution', src: 'laps["LapStartTime","LapTime"]',
    desc: 'Grip ramp across SQ1→SQ3 on the mandated compounds.',
    render: (a) => <LapScatter lapsAll={a.sess.lapsAll} ctx={a.ctx} showDeleted /> },
  { key: 'theoretical', tag: 'IDEAL', title: 'Theoretical best', src: 'best-lap sectors vs actual',
    desc: 'Ideal lap from best sectors vs actual for the SQ runners.',
    render: (a) => <TheoreticalBest sectors={a.sess.sectors} ctx={a.ctx} /> },
];

const SPRINT_VIZ = [
  { key: 'trace', tag: 'GAP', title: 'Sprint trace', src: 'laps["LapTime"] cumulative', filter: true,
    desc: 'Gap to leader across the sprint — short race, small gaps, every move visible.',
    render: (a) => <RaceTrace R={a.R} ctx={a.ctx} sel={a.sel} /> },
  { key: 'stints', tag: 'STINTS', title: 'Tyre choice', src: 'laps["Compound","Stint"]',
    desc: 'Compound picks across the sprint field.',
    render: (a) => <StintChart R={a.R} ctx={a.ctx} /> },
  { key: 'lap1', tag: 'START', title: 'Lap 1 gains & losses', src: 'grid vs P after L1',
    desc: 'Start reaction and lap-1 places gained across the sprint field.',
    render: (a) => <Lap1Chart R={a.R} ctx={a.ctx} /> },
  { key: 'sprintvsgp', tag: 'PACE', title: 'Sprint vs GP pace', src: 'sprint laps vs race laps, fuel-corrected',
    desc: 'Saturday pace against Sunday’s, fuel-corrected — who showed their hand early.',
    render: (a) => a.raceSess
      ? <PaceComparison laps1={a.R.laps} total1={a.R.totalLaps} label1="Sprint"
          laps2={a.raceR.laps} total2={a.raceR.totalLaps} label2="Race" ctx={a.ctx} order={a.raceR.finishOrder} />
      : <EmptyNote txt="Comes alive after the Grand Prix on Sunday." /> },
];

const FP_VIZ = [
  { key: 'lapmap', tag: 'MAP', title: 'Session lap map', src: 'laps + Compound over session time',
    desc: 'Every timed lap: fill = compound, ring = team. Quali sims and race sims separate visually.',
    render: (a) => <LapScatter lapsAll={a.sess.lapsAll} ctx={a.ctx} /> },
  { key: 'longrun', tag: 'RUN', title: 'Long-run pace', src: 'stint detection on laps, len ≥ 6',
    desc: 'Average of each race-sim stint — the Friday chart that predicts Sunday.',
    render: (a) => <LongRunChart longRuns={a.sess.longRuns} ctx={a.ctx} /> },
  { key: 'trap', tag: 'TRAP', title: 'Speed trap', src: 'laps["SpeedST"]',
    desc: 'Straight-line speeds from the first hour — who is running skinny wings.',
    render: (a) => <SpeedTrapChart traps={a.sess.speedTraps} ctx={a.ctx} /> },
  { key: 'compoundoffset', tag: 'OFFSET', title: 'Compound offset', src: 'paired long-run stints',
    desc: 'Measured pace offsets between the compounds from the day’s long runs.',
    render: (a) => <CompoundOffsetChart longRuns={a.sess.longRuns} /> },
  { key: 'simvsrace', tag: 'SIM', title: 'Sim vs race', src: 'FP long runs vs race pace',
    desc: 'Post-race: Friday long-run pace against actual fuel-corrected race pace — who sandbagged.',
    render: (a) => {
      if (!a.raceSess || !a.raceR) return <EmptyNote txt="Comes alive after the race — check back Sunday night." />;
      const racePace = fuelCorrectedPace(a.raceR.laps, a.raceR.totalLaps);
      const bestRun = {};
      (a.sess.longRuns || []).forEach((r) => {
        if (!bestRun[r.code] || r.avg < bestRun[r.code]) bestRun[r.code] = r.avg;
      });
      const rows = Object.keys(bestRun)
        .filter((c) => racePace[c] != null)
        .map((c) => ({ code: c, a: bestRun[c], b: racePace[c] }));
      if (!rows.length) return <EmptyNote txt="No overlapping long-run / race data." />;
      return <DumbbellPairs rows={rows} label1="FP long run" label2="Race (fuel-corr.)" ctx={a.ctx} />;
    } },
];

export function vizListFor(sessionId) {
  if (sessionId === 'race') return RACE_VIZ;
  if (sessionId === 'sprint') return SPRINT_VIZ;
  if (sessionId === 'q') return QUALI_VIZ;
  if (sessionId === 'sprintQuali') return SQ_VIZ;
  return FP_VIZ; // fp1 / fp2 / fp3
}
