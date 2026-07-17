// Race-weekend experience for completed/in-progress weekends with FastF1 data:
// sticky session bar → per-session results blocks → the dark Visualisation
// Explorer (all charts share-exportable as branded PNGs in 16:9 / 1:1 / 9:16).
//
// props:
//   race    — archive race doc (same shape RacePage.astro consumes)
//   weekend — { year, round, name, circuitName, sprintWeekend,
//               sessions: [{id,label,start}], available: [sessionIds],
//               summary?: string }
//
// The race/quali/sprint results blocks render from the archive doc, so they're
// in the prerendered HTML (SEO). Charts hydrate from
// /data/fastf1/<year>/<round>/<session>.json written by scripts/fetch-fastf1.py.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  decodeLaps, cumTimes, gapByLap, posByLap, overtakeCount, overtakeList,
  fastestLap, lap1Gains, degSeries, teamPace, fmtLap,
} from './raceweekend/derive.js';
import { vizListFor } from './raceweekend/vizdefs.jsx';
import { renderShareCard, shareFileName, SHARE_FORMATS, EXPORT_SCALE } from './raceweekend/share.js';
import {
  SessionHeader, RacePodium3, StatChips, RaceClassification, KeyMoments,
  DriverFilter, QualiTable, SprintTable, FastF1SegTable, PracticeTimes,
  SectionRule, LocalTime,
} from './raceweekend/results.jsx';

const dataUrl = (y, r, sid) => `/data/fastf1/${y}/${r}/${sid}.json`;

function deriveRace(sess) {
  if (!sess || sess.type !== 'race') return null;
  const laps = decodeLaps(sess.laps);
  const finishOrder = sess.drivers.map((d) => d.code).filter((c) => laps[c]);
  const gridMap = {};
  const posFinal = {};
  sess.drivers.forEach((d) => {
    if (d.grid != null) gridMap[d.code] = d.grid;
    if (d.position != null) posFinal[d.code] = d.position;
  });
  const gridOf = (c) => gridMap[c] ?? null;
  const cum = cumTimes(laps);
  const gaps = gapByLap(laps, cum);
  const pos = posByLap(laps, cum, gridOf);
  const totalLaps = sess.totalLaps || Math.max(...finishOrder.map((c) => laps[c].length));
  // Drop "stops" on each driver's own final lap — that's the car filing into
  // parc fermé (or retiring into the pits), not pit strategy. Lapped cars
  // finish on lap N-1, so this must be per-driver, not the race distance.
  const lastLapOf = {};
  finishOrder.forEach((c) => { lastLapOf[c] = laps[c][laps[c].length - 1].lap; });
  const pits = (sess.pitStops || []).filter(
    (p) => p.lap != null && p.lap > 0 && p.lap < (lastLapOf[p.code] ?? totalLaps),
  );
  return {
    laps, cum, gaps, pos, posFinal, finishOrder, gridOf,
    totalLaps,
    stints: sess.stints || [],
    pits,
    bands: sess.trackStatus || [],
    passes: overtakeList(laps, pos),
    overtakes: overtakeCount(laps, pos),
    fl: fastestLap(laps),
    lap1: lap1Gains(pos, gridOf),
  };
}

function keyMomentsFrom(sess) {
  if (!sess?.raceControl) return [];
  const out = [];
  const seen = new Set();
  for (const m of sess.raceControl) {
    let tag = null, color = null;
    const msg = m.msg || '';
    if (/RED FLAG/i.test(msg)) { tag = 'RED FLAG'; color = '#DC2626'; }
    else if (/VIRTUAL SAFETY CAR DEPLOYED/i.test(msg)) { tag = 'VSC'; color = '#B45309'; }
    else if (/SAFETY CAR DEPLOYED/i.test(msg)) { tag = 'SC'; color = '#B45309'; }
    else if (/TIME PENALTY|DRIVE THROUGH|STOP.AND.GO|DISQUALIF/i.test(msg)) { tag = 'PENALTY'; color = '#DC2626'; }
    else if (/UNDER INVESTIGATION|WILL BE INVESTIGATED/i.test(msg)) { tag = 'INVESTIGATION'; color = '#B45309'; }
    if (!tag) continue;
    const label = msg.charAt(0) + msg.slice(1).toLowerCase();
    const k = tag + label;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ tag: m.lap != null ? `LAP ${m.lap} · ${tag}` : tag, label, color });
    if (out.length >= 8) break;
  }
  return out;
}

// Preload face/logo images as data URIs. Charts embed these directly in their
// SVG <image> tags so the share export works: SVG-as-image rasterisation runs
// in secure mode and silently drops external hrefs — only inline data survives.
function useInlineImages(urlMap) {
  const [data, setData] = useState({});
  useEffect(() => {
    let dead = false;
    Object.entries(urlMap || {}).forEach(([key, url]) => {
      fetch(url)
        .then((r) => (r.ok ? r.blob() : null))
        .then((blob) => {
          if (!blob || dead) return;
          const fr = new FileReader();
          fr.onload = () => { if (!dead) setData((d) => ({ ...d, [key]: fr.result })); };
          fr.readAsDataURL(blob);
        })
        .catch(() => {});
    });
    return () => { dead = true; };
  }, [urlMap]);
  return data;
}

function useNow(active) {
  const [now, setNow] = useState(null);
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [active]);
  return now;
}

const NO_ASSETS = { faces: {}, logos: {}, refs: {}, teams: {} };

export default function RaceWeekendIsland({ race, weekend, assets }) {
  const { year, round, sessions, available, sprintWeekend } = weekend;
  const ax = assets || NO_ASSETS;
  const defaultTab = available.length ? available[available.length - 1] : sessions[sessions.length - 1]?.id;

  const [tab, setTab] = useState(defaultTab);
  const [viz, setViz] = useState({});
  const [selArr, setSelArr] = useState(null);
  const [allRows, setAllRows] = useState(false);
  const [data, setData] = useState({});
  const [tt, setTt] = useState(null);
  const [share, setShare] = useState(null);
  const [shareFmt, setShareFmt] = useState('wide');
  const [shareImg, setShareImg] = useState(null);
  const [shareBusy, setShareBusy] = useState(false);
  const chartRef = useRef(null);

  const hasUpcoming = useMemo(() => sessions.some((s) => !available.includes(s.id)), [sessions, available]);
  const now = useNow(hasUpcoming);
  const faceData = useInlineImages(ax.faces);
  const logoData = useInlineImages(ax.logos);

  // ── data fetch (all sessions with data are small, grab them all) ──
  useEffect(() => {
    let dead = false;
    available.forEach((sid) => {
      fetch(dataUrl(year, round, sid))
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => { if (!dead && json) setData((d) => ({ ...d, [sid]: json })); })
        .catch(() => {});
    });
    return () => { dead = true; };
  }, [year, round]);

  // ── deep links: ?session=&viz= ──
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get('session');
    const v = p.get('viz');
    if (s && sessions.some((x) => x.id === s)) {
      setTab(s);
      if (v && vizListFor(s).some((d) => d.key === v)) setViz((m) => ({ ...m, [s]: v }));
    }
  }, []);
  const syncUrl = useCallback((sid, vkey) => {
    const p = new URLSearchParams(window.location.search);
    p.set('session', sid);
    if (vkey) p.set('viz', vkey); else p.delete('viz');
    window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}`);
  }, []);

  // ── derived bundles ──
  const raceSess = data.race;
  const sprintSess = data.sprint;
  const raceR = useMemo(() => deriveRace(raceSess), [raceSess]);
  const sprintR = useMemo(() => deriveRace(sprintSess), [sprintSess]);

  // driver metadata across everything we know
  const meta = useMemo(() => {
    const m = {};
    for (const sid of Object.keys(data)) {
      for (const d of data[sid]?.drivers || []) {
        m[d.code] = { name: d.name, team: d.team, teamId: d.teamId, color: d.color, ...m[d.code] };
      }
    }
    for (const r of race.results || []) {
      if (r.code) m[r.code] = { name: r.driverName, team: r.constructorName, teamId: r.constructorRef, color: r.constructorColor, ...m[r.code] };
    }
    return m;
  }, [data, race]);

  const ctx = useMemo(() => ({
    colorOf: (c) => meta[c]?.color || '#8A8B93',
    teamOf: (c) => meta[c]?.teamId || meta[c]?.team || null,
    teamNameOf: (c) => meta[c]?.team || '',
    nameOf: (c) => meta[c]?.name || c,
    faceOf: (c) => ax.faces[c] || null,
    logoOf: (c) => ax.logos[meta[c]?.teamId] || ax.logos[ax.teams[c]] || null,
    refOf: (c) => ax.refs[c] || null,
    // data-URI variants for use INSIDE charts (survive share-card export)
    faceImg: (c) => faceData[c] || null,
    logoImgFor: (teamKey) => logoData[teamKey] || null,
    tip: (e, title, lines) => setTt({
      x: Math.min(e.clientX + 16, (typeof window !== 'undefined' ? window.innerWidth : 1280) - 200),
      y: e.clientY + 14, title, lines,
    }),
    leave: () => setTt(null),
  }), [meta, ax, faceData, logoData]);

  // driver filter (race tab)
  const defaultSel = useMemo(() => {
    const order = raceR?.finishOrder
      || (race.results || []).filter((r) => r.code).map((r) => r.code);
    return order.slice(0, 6);
  }, [raceR, race]);
  const sel = useMemo(() => new Set(selArr ?? defaultSel), [selArr, defaultSel]);

  const activeSess = data[tab];
  const activeR = tab === 'race' ? raceR : tab === 'sprint' ? sprintR : null;
  const deg = useMemo(
    () => (activeR ? degSeries(activeR.laps, activeR.stints, activeR.finishOrder.filter((c) => sel.has(c))) : []),
    [activeR, sel],
  );
  const pace = useMemo(() => {
    if (!activeR || !activeSess) return [];
    const teamMeta = {};
    activeSess.drivers.forEach((d) => {
      if (d.teamId && !teamMeta[d.teamId]) teamMeta[d.teamId] = { label: (d.team || d.teamId).toUpperCase().slice(0, 9), color: d.color };
    });
    return teamPace(activeR.laps, (c) => meta[c]?.teamId).map((p) => ({ ...p, ...teamMeta[p.team] }));
  }, [activeR, activeSess, meta]);

  // ── session bar ──
  const sessInfo = useMemo(() => {
    const winner = (race.results || []).find((r) => r.position === 1);
    const pole = (race.qualifying || [])[0];
    const sprintRows = Array.isArray(race.sprint) ? race.sprint : [];
    const sprintWinner = sprintRows.find((r) => r.position === 1);
    return { winner, pole, sprintWinner };
  }, [race]);

  const subLabelFor = (s) => {
    const done = available.includes(s.id);
    if (!done) {
      if (now && new Date(s.start).getTime() > now) {
        const t = Math.max(0, Math.floor((new Date(s.start).getTime() - now) / 1000));
        const d = Math.floor(t / 86400), h = Math.floor(t / 3600) % 24, mn = Math.floor(t / 60) % 60, sc = t % 60;
        const pad = (n) => String(n).padStart(2, '0');
        return `STARTS IN ${d > 0 ? `${d}D ` : ''}${pad(h)}:${pad(mn)}:${pad(sc)}`;
      }
      return now ? 'AWAITING DATA' : '';
    }
    if (s.id === 'race' && sessInfo.winner?.code) return `${sessInfo.winner.code} WINS`;
    if (s.id === 'q' && sessInfo.pole?.code) return `${sessInfo.pole.code} POLE`;
    if (s.id === 'sprint' && sessInfo.sprintWinner?.code) return `${sessInfo.sprintWinner.code} WINS`;
    if (s.id === 'sprintQuali' && data.sprintQuali?.results?.[0]) return `${data.sprintQuali.results[0].code} SP POLE`;
    if (s.id.startsWith('fp') && data[s.id]?.order?.[0]) return `${data[s.id].order[0].code} ${fmtLap(data[s.id].order[0].t)}`;
    return 'RESULTS';
  };

  const pickTab = (sid) => {
    setTab(sid);
    setTt(null);
    syncUrl(sid, viz[sid] || null);
  };

  const isUpcoming = !available.includes(tab);
  const activeSchedule = sessions.find((s) => s.id === tab);

  // ── viz explorer state ──
  const vlist = vizListFor(tab);
  const activeKey = viz[tab] && vlist.some((d) => d.key === viz[tab]) ? viz[tab] : vlist[0]?.key;
  const vi = Math.max(0, vlist.findIndex((d) => d.key === activeKey));
  const cur = vlist[vi];
  const pickViz = (key) => {
    setViz((m) => ({ ...m, [tab]: key }));
    setTt(null);
    syncUrl(tab, key);
  };
  const sessLabel = (activeSchedule?.label || tab).toUpperCase();

  const vizArgs = { sess: activeSess, R: activeR, deg, pace, ctx, sel, raceSess, raceR };

  // ── share flow ──
  const openShare = (fmtKeep) => {
    if (!cur) return;
    setShare({ key: cur.key, title: cur.title });
    if (!fmtKeep) setShareImg(null);
    setTimeout(() => makeShare(shareFmt), 40);
  };
  const makeShare = async (fmt) => {
    const node = chartRef.current;
    if (!node) return;
    setShareBusy(true);
    setShareImg(null);
    try {
      const img = await renderShareCard(node, fmt, {
        raceName: race.name, circuit: race.circuit?.name || '', year,
        roundTag: `R${round} · ${year}`, session: sessLabel, title: cur.title,
        desc: cur.desc || '',
      });
      setShareImg(img);
    } catch (e) {
      console.error('share render failed', e);
    }
    setShareBusy(false);
  };
  const setFmt = (f) => { setShareFmt(f); makeShare(f); };

  // ── per-session results block ──
  const stopsOf = useCallback((code) => {
    if (!raceR) return null;
    return raceR.pits.filter((p) => p.code === code).length;
  }, [raceR]);

  const raceChips = useMemo(() => {
    if (!raceR) return null;
    const sc = raceR.bands.filter((b) => b.type === 'SC').length;
    const vsc = raceR.bands.filter((b) => b.type === 'VSC').length;
    return [
      { k: 'Laps', v: String(raceR.totalLaps) },
      { k: 'Safety cars', v: String(sc), color: sc ? 'var(--warn)' : undefined },
      { k: 'Virtual SC', v: String(vsc), color: vsc ? 'var(--warn)' : undefined },
      { k: 'Pit stops', v: String(raceR.pits.length) },
      { k: 'On-track passes', v: String(raceR.passes.length) },
      { k: 'Fastest lap', v: raceR.fl ? `${raceR.fl.code} ${fmtLap(raceR.fl.t)}` : '—', color: '#7C3AED' },
    ];
  }, [raceR]);

  const filterPresets = useMemo(() => {
    const order = raceR?.finishOrder || (race.results || []).filter((r) => r.code).map((r) => r.code);
    return [
      { label: 'The story', primary: true, apply: () => setSelArr(defaultSel) },
      { label: 'Top 10', apply: () => setSelArr(order.slice(0, 10)) },
      { label: 'All', apply: () => setSelArr(order) },
      { label: 'None', apply: () => setSelArr([]) },
    ];
  }, [raceR, race, defaultSel]);

  const renderSessionBlock = () => {
    if (tab === 'race') {
      return (
        <>
          <SessionHeader title="Race" startIso={activeSchedule?.start} weather={raceSess?.weather}
            extra={raceR ? `${raceR.totalLaps} LAPS` : undefined}
            highlight={sessInfo.winner ? { txt: `${sessInfo.winner.driverName?.toUpperCase()} WINS`, kind: 'green' } : null} />
          <RacePodium3 results={race.results || []} ctx={ctx} />
          {raceChips && <StatChips chips={raceChips} />}
          <RaceClassification results={race.results || []} stopsOf={raceR ? stopsOf : null} allRows={allRows} onToggle={() => setAllRows(!allRows)} ctx={ctx} />
          <KeyMoments moments={keyMomentsFrom(raceSess)} />
          <DriverFilter order={raceR?.finishOrder || (race.results || []).filter((r) => r.code).map((r) => r.code)}
            colorOf={ctx.colorOf} sel={sel}
            onToggle={(code) => {
              const next = new Set(sel);
              if (next.has(code)) next.delete(code); else next.add(code);
              setSelArr([...next]);
            }}
            presets={filterPresets} />
        </>
      );
    }
    if (tab === 'q') {
      return (
        <>
          <SessionHeader title="Qualifying" startIso={activeSchedule?.start} weather={data.q?.weather}
            highlight={sessInfo.pole ? { txt: `POLE · ${sessInfo.pole.code || sessInfo.pole.driverName} · ${sessInfo.pole.q3 || ''}`, kind: 'purple' } : null} />
          <QualiTable rows={race.qualifying || []} ctx={ctx} />
        </>
      );
    }
    if (tab === 'sprint') {
      return (
        <>
          <SessionHeader title="Sprint" startIso={activeSchedule?.start} weather={sprintSess?.weather}
            extra={sprintR ? `${sprintR.totalLaps} LAPS` : undefined}
            highlight={sessInfo.sprintWinner ? { txt: `${sessInfo.sprintWinner.driverName?.toUpperCase()} WINS THE SPRINT`, kind: 'green' } : null} />
          <SprintTable rows={Array.isArray(race.sprint) ? race.sprint : []} ctx={ctx} />
        </>
      );
    }
    if (tab === 'sprintQuali') {
      const sq = data.sprintQuali;
      return (
        <>
          <SessionHeader title="Sprint Qualifying" startIso={activeSchedule?.start} weather={sq?.weather}
            highlight={sq?.results?.[0] ? { txt: `SPRINT POLE · ${sq.results[0].code} · ${fmtLap(sq.results[0].q3)}`, kind: 'purple' } : null} />
          {sq ? <FastF1SegTable sess={sq} segLabels={['SQ1', 'SQ2', 'SQ3']} ctx={ctx} /> : <div className="panel rw-loading">Loading session data…</div>}
        </>
      );
    }
    const fp = data[tab];
    return (
      <>
        <SessionHeader title={activeSchedule?.label || 'Practice'} startIso={activeSchedule?.start} weather={fp?.weather}
          highlight={fp?.order?.[0] ? { txt: `P1 · ${fp.order[0].code} · ${fmtLap(fp.order[0].t)}`, kind: 'purple' } : null} />
        <PracticeTimes sess={fp} ctx={ctx} />
      </>
    );
  };

  const upcomingView = () => {
    const start = activeSchedule ? new Date(activeSchedule.start).getTime() : null;
    const t = now && start ? Math.max(0, Math.floor((start - now) / 1000)) : null;
    const pad = (n) => String(Math.max(0, n)).padStart(2, '0');
    const cells = t != null
      ? [{ v: pad(Math.floor(t / 86400)), l: 'Days' }, { v: pad(Math.floor(t / 3600) % 24), l: 'Hours' },
         { v: pad(Math.floor(t / 60) % 60), l: 'Min' }, { v: pad(t % 60), l: 'Sec' }]
      : null;
    const started = now && start && now >= start;
    const latest = available[available.length - 1];
    return (
      <div className="panel rw-upcoming">
        <div className="rw-upcoming-eyebrow t-eyebrow">{started ? 'Session complete — data pending' : 'Session not started'}</div>
        <div className="rw-upcoming-title">{activeSchedule?.label} {started ? 'data is on its way' : 'begins in'}</div>
        {!started && cells && (
          <div className="countdown rw-upcoming-cd">
            {cells.map((c) => (
              <div className="countdown-cell" key={c.l}>
                <div className="rw-cd-v">{c.v}</div>
                <div className="rw-cd-l">{c.l}</div>
              </div>
            ))}
          </div>
        )}
        <div className="t-mono rw-upcoming-when"><LocalTime iso={activeSchedule?.start} />{race.circuit?.name ? ` · ${race.circuit.name}` : ''}</div>
        <div className="rw-upcoming-note">
          {started
            ? 'Results, timing and telemetry appear here shortly after the session ends — usually within the hour.'
            : 'Results, timing and telemetry will appear here the moment the session ends.'}
        </div>
        {latest && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => pickTab(latest)}>
            ← Latest session: {sessions.find((s) => s.id === latest)?.label}
          </button>
        )}
      </div>
    );
  };

  // ── explorer ──
  const explorer = () => {
    if (isUpcoming || !vlist.length) return null;
    const loading = !activeSess;
    return (
      <div className="rw-viz">
        <div className="rw-viz-head">
          <div className="rw-viz-head-title">Visualisations</div>
          <div className="rw-viz-head-count t-mono">{sessLabel} · {vlist.length} charts</div>
          <div className="rw-viz-head-rule" />
        </div>
        <div className="rw-viz-body">
          <div className="rw-viz-rail">
            {vlist.map((d) => (
              <button type="button" key={d.key}
                className={`rw-viz-railitem${d.key === activeKey ? ' is-active' : ''}`}
                onClick={() => pickViz(d.key)}>
                <span className="rw-viz-dot" />
                <span className="rw-viz-railtitle">{d.title}</span>
              </button>
            ))}
          </div>
          <div className="rw-viz-main">
            <div className="rw-viz-meta-row">
              <span className="rw-viz-meta t-mono">{sessLabel} · {vi + 1} / {vlist.length}</span>
              <span className="rw-viz-actions">
                <button type="button" className="rw-viz-share" onClick={() => openShare()} disabled={loading}>⤴ Share</button>
                <button type="button" className="rw-viz-cycle" onClick={() => pickViz(vlist[(vi - 1 + vlist.length) % vlist.length].key)} aria-label="Previous chart">←</button>
                <button type="button" className="rw-viz-cycle" onClick={() => pickViz(vlist[(vi + 1) % vlist.length].key)} aria-label="Next chart">→</button>
              </span>
            </div>
            <div className="rw-viz-title">{cur?.title}</div>
            <div className="rw-viz-titlerule" />
            <div className="rw-viz-desc">{cur?.desc}</div>
            <div className="rw-viz-chart" ref={chartRef} id={`rw-chart-${tab}-${activeKey}`}>
              {loading
                ? <div className="rw-viz-loading t-mono">LOADING SESSION DATA…</div>
                : cur?.render(vizArgs)}
            </div>
            <div className="rw-viz-foot">
              <span className="rw-viz-src t-mono">{cur?.src}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="rw">
      {weekend.summary && (
        <div className="panel rw-summary"><p>{weekend.summary}</p></div>
      )}
      <div className="rw-tabs" role="tablist">
        {sessions.map((s) => {
          const active = s.id === tab;
          const done = available.includes(s.id);
          return (
            <button type="button" key={s.id} role="tab" aria-selected={active}
              className={`rw-tab${active ? ' is-active' : ''}${done ? '' : ' is-upcoming'}`}
              onClick={() => pickTab(s.id)}>
              <span className="rw-tab-label">{s.label}</span>
              <span className="rw-tab-sub" suppressHydrationWarning>{subLabelFor(s)}</span>
            </button>
          );
        })}
      </div>

      {isUpcoming ? upcomingView() : renderSessionBlock()}
      {explorer()}

      {tt && (
        <div className="rw-tooltip" style={{ left: tt.x, top: tt.y }}>
          <div className="rw-tooltip-title">{tt.title}</div>
          {tt.lines.map((l, i) => (
            <div key={i} className="rw-tooltip-line">
              <span className="rw-tooltip-dot" style={{ background: l.color }} />
              <span>{l.txt}</span>
            </div>
          ))}
        </div>
      )}

      {share && (
        <div className="rw-share-overlay" onClick={() => { setShare(null); setShareImg(null); }}>
          <div className="rw-share-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rw-share-head">
              <div className="rw-share-title">Share this chart</div>
              <div className="rw-share-fmts">
                {Object.entries(SHARE_FORMATS).map(([k, f]) => (
                  <button type="button" key={k} className={`rw-share-fmt${shareFmt === k ? ' is-active' : ''}`} onClick={() => setFmt(k)}>
                    {f.label}
                  </button>
                ))}
              </div>
              <button type="button" className="rw-share-close" onClick={() => { setShare(null); setShareImg(null); }}>✕</button>
            </div>
            <div className="rw-share-preview">
              {shareImg && <img src={shareImg} alt="Share preview" />}
              {shareBusy && <div className="t-mono rw-share-busy">RENDERING…</div>}
            </div>
            <div className="rw-share-actions">
              <a className="btn btn-primary rw-share-dl" href={shareImg || '#'}
                download={shareFileName({ raceName: race.name, year }, share.key, shareFmt)}
                aria-disabled={!shareImg}>⤓ Download PNG</a>
              <button type="button" className="btn btn-secondary" onClick={() => { setShare(null); setShareImg(null); }}>Close</button>
            </div>
            <div className="rw-share-note t-mono">
              Branded card · {SHARE_FORMATS[shareFmt].w * EXPORT_SCALE} × {SHARE_FORMATS[shareFmt].h * EXPORT_SCALE} · www.f1gures.app watermark baked in
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
