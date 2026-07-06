// compareShared — the reusable guts of Compare Mode, shared by the on-page CTA
// overlay (CompareCta.jsx) and the standalone /compare/ launcher
// (CompareLauncher.jsx). Holds the index/doc loaders, the rival PickerBody, the
// fighter/context/row presentation, and CompareView (the full tale-of-the-tape
// panel + share actions). All comparison MATH stays in src/lib/compareStats.js;
// this file is presentation + data-fetching only.

import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtVal } from '../../lib/compareStats.js';
import { buildShareBlob } from '../../lib/compareShareCard.js';
import { NATIONALITY } from '../../lib/nationality.js';
import { DRIVER_MATCHUPS, TEAM_MATCHUPS } from '../../data/compareMatchups.js';

// team-logo files use the buildFallback id, not the Ergast constructorRef.
export const LOGO_ALIAS = { red_bull: 'redbull', aston_martin: 'aston' };
export const flagCc = (nat) => {
  const n = nat && NATIONALITY[nat];
  return n && n.country ? n.country.toLowerCase() : null;
};
// team colour as small text fails WCAG on dark cards — mix toward the theme
// text colour to lift every hue to AA while keeping its identity.
export const teamTint = (c) => `color-mix(in srgb, ${c} 58%, var(--fg-1))`;

// ── module-level caches (survive remounts) ───────────────────────
const _index = {};
const _indexPromise = {};
const _docCache = {};

export function loadIndex(kind) {
  if (_index[kind]) return Promise.resolve(_index[kind]);
  if (_indexPromise[kind]) return _indexPromise[kind];
  const file = kind === 'team' ? '_teams-index.json' : '_drivers-index.json';
  _indexPromise[kind] = fetch(`/data/archive/${file}`)
    .then((r) => r.json())
    .then((list) => { _index[kind] = list; return list; })
    .catch((err) => { _indexPromise[kind] = null; throw err; });
  return _indexPromise[kind];
}

export function loadDoc(kind, ref) {
  const key = `${kind}:${ref}`;
  if (_docCache[key]) return Promise.resolve(_docCache[key]);
  const dir = kind === 'team' ? 'teams' : 'drivers';
  return fetch(`/data/archive/${dir}/${ref}.json`)
    .then((r) => { if (!r.ok) throw new Error(`no doc ${ref}`); return r.json(); })
    .then((doc) => { _docCache[key] = doc; return doc; });
}

// index-entry helpers (drivers and teams have different key names)
export const entryRef = (kind, e) => (kind === 'team' ? e.constructorRef : e.driverRef);
export const entryName = (kind, e) => (kind === 'team' ? e.name : `${e.forename} ${e.surname}`);
export const entryColor = (kind, e) => (kind === 'team' ? e.color : e.teamColor) || '#888';
const entryHay = (kind, e) =>
  (kind === 'team' ? e.name : `${e.forename} ${e.surname} ${e.code || ''}`).toLowerCase();

function scoreHay(hay, tokens) {
  let score = 0;
  for (const tok of tokens) {
    const i = hay.indexOf(tok);
    if (i === -1) return -1;
    score += i === 0 ? 3 : hay.charCodeAt(i - 1) === 32 ? 2 : 1;
  }
  return score;
}

/** Current grid first (drivers racing this season / teams active latest year),
 *  minus an optional excluded ref. */
function gridSeed(kind, list, excludeRef) {
  if (kind === 'team') {
    const maxYear = Math.max(...list.map((t) => t.lastYear || 0));
    return list
      .filter((t) => t.lastYear === maxYear && t.constructorRef !== excludeRef)
      .sort((a, b) => (b.championships || 0) - (a.championships || 0) || (b.wins || 0) - (a.wins || 0));
  }
  const maxYear = Math.max(...list.map((d) => d.currentSeasonYear || 0));
  return list
    .filter((d) => d.currentSeasonYear === maxYear && d.driverRef !== excludeRef)
    .sort((a, b) => (b.currentSeasonPoints || 0) - (a.currentSeasonPoints || 0));
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Black or white — whichever clears WCAG better on a team-colour fill. */
export function readableText(hex) {
  if (!hex || hex[0] !== '#' || hex.length < 7) return '#fff';
  const ch = (i) => parseInt(hex.slice(i, i + 2), 16) / 255;
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(ch(1)) + 0.7152 * lin(ch(3)) + 0.0722 * lin(ch(5));
  return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? '#0A0A0A' : '#FFFFFF';
}

// ── count-up ─────────────────────────────────────────────────────
function useCountUp(target, live, fmt) {
  const [val, setVal] = useState(live ? 0 : target);
  const rafRef = useRef(0);
  useEffect(() => {
    if (target == null) return;
    if (!live || prefersReducedMotion()) { setVal(target); return; }
    let start = null;
    const step = (ts) => {
      if (start == null) start = ts;
      const t = Math.min(1, (ts - start) / 620);
      setVal(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else setVal(target);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, live]);
  return fmtVal(val, fmt);
}

function CountVal({ value, fmt, live, className }) {
  const shown = useCountUp(value, live, fmt);
  return <span className={className}>{value == null ? '–' : shown}</span>;
}

// ── rival picker body (search + list; loads its own index) ───────
export function PickerBody({ kind, excludeRef = null, onPick, autoFocus = true, placeholder }) {
  const [list, setList] = useState(null);
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { setList(null); loadIndex(kind).then(setList).catch(() => setStatus('error')); }, [kind]);
  useEffect(() => { if (autoFocus) requestAnimationFrame(() => inputRef.current?.focus()); }, [autoFocus, kind]);

  const results = useMemo(() => {
    if (!list) return [];
    const q = query.trim().toLowerCase();
    if (!q) return gridSeed(kind, list, excludeRef).slice(0, 24);
    const tokens = q.split(/\s+/).filter(Boolean);
    const scored = [];
    for (const e of list) {
      if (entryRef(kind, e) === excludeRef) continue;
      const s = scoreHay(entryHay(kind, e), tokens);
      if (s >= 0) scored.push({ s, e });
    }
    scored.sort((a, b) =>
      b.s - a.s ||
      ((kind === 'team' ? b.e.championships : b.e.wins) || 0) - ((kind === 'team' ? a.e.championships : a.e.wins) || 0));
    return scored.slice(0, 24).map((x) => x.e);
  }, [list, query, kind, excludeRef]);

  const seededLabel = query.trim() ? 'Best matches' : (kind === 'team' ? 'Current grid' : 'On the grid now');

  return (
    <>
      <div className="cmp-search">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef} type="search"
          placeholder={placeholder || (kind === 'team' ? 'Search every constructor…' : 'Search all 862 drivers…')}
          value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" spellCheck={false}
        />
      </div>
      <div className="cmp-picker-list">
        {status === 'error' && <div className="cmp-empty">Couldn’t load the index. Try again.</div>}
        {!list && status !== 'error' && <div className="cmp-empty">Loading…</div>}
        {list && results.length === 0 && <div className="cmp-empty">No matches.</div>}
        {list && results.length > 0 && (
          <>
            <div className="cmp-group-lbl">{seededLabel}</div>
            {results.map((e) => {
              const r = entryRef(kind, e);
              return (
                <button key={r} className="cmp-row" onClick={() => onPick(r, e)}>
                  <span className="cmp-row-strip" style={{ background: entryColor(kind, e) }} />
                  <span className="cmp-row-name">{entryName(kind, e)}</span>
                  <span className="cmp-row-meta">
                    {kind === 'team' ? (
                      <>{e.championships > 0 && <b>{e.championships}×</b>} {e.wins}W · {e.firstYear}–{e.lastYear}</>
                    ) : (
                      <>{e.code && <span className="cmp-row-code">{e.code}</span>} {e.championships > 0 && <b>{e.championships}×</b>} {e.wins}W</>
                    )}
                  </span>
                </button>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}

// ── suggested matchups (rotating featured head-to-heads) ─────────
const shortName = (kind, e) => (kind === 'team' ? e.name : e.surname);

// Fisher–Yates on a copy — client-only (called from an effect), so Math.random
// never runs during SSR/hydration and every reload gives a fresh order.
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function SuggFace({ kind, refId, color, side }) {
  const [ok, setOk] = useState(true);
  const src = kind === 'team'
    ? `/images/teams/${LOGO_ALIAS[refId] || refId}.jpg`
    : `/images/drivers/${refId}.webp`;
  const cls = `cmp-sugg-face cmp-sugg-face-${side} ${kind === 'team' ? 'is-team' : ''}`;
  if (!ok) {
    const mono = (refId || '?').slice(0, 2).toUpperCase();
    return <span className={`${cls} is-mono`} style={{ '--sc': color }} aria-hidden="true">{mono}</span>;
  }
  return <img className={cls} style={{ '--sc': color }} src={src} alt="" loading="lazy" onError={() => setOk(false)} />;
}

/** A grid of clickable, rotating featured head-to-heads. `onPick(a, b)` receives
 *  two { ref, name, color } objects ready to drop into the launcher slots. */
export function SuggestedMatchups({ kind, onPick, count = 4 }) {
  const [list, setList] = useState(null);
  const [seed, setSeed] = useState(0);

  useEffect(() => { setList(null); loadIndex(kind).then(setList).catch(() => setList([])); }, [kind]);

  const picks = useMemo(() => {
    if (!list || !list.length) return [];
    const byRef = new Map(list.map((e) => [entryRef(kind, e), e]));
    const pool = kind === 'team' ? TEAM_MATCHUPS : DRIVER_MATCHUPS;
    const resolved = pool
      .map((m) => {
        const ea = byRef.get(m.a), eb = byRef.get(m.b);
        if (!ea || !eb) return null;
        const side = (e) => ({ ref: entryRef(kind, e), name: entryName(kind, e), color: entryColor(kind, e) });
        return { ...m, ea, eb, sa: side(ea), sb: side(eb) };
      })
      .filter(Boolean);
    return shuffled(resolved).slice(0, count);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, kind, count, seed]);

  if (!list) return null;                 // don't flash before the index lands
  if (!picks.length) return null;

  return (
    <div className="cmp-sugg">
      <div className="cmp-sugg-head">
        <span className="cmp-sugg-eyebrow">Try a classic head-to-head</span>
        <button className="cmp-sugg-shuffle" onClick={() => setSeed((s) => s + 1)} type="button">
          <span aria-hidden="true">↻</span> Shuffle
        </button>
      </div>
      <div className="cmp-sugg-grid">
        {picks.map((m) => (
          <button
            key={`${m.a}-${m.b}`}
            className="cmp-sugg-card"
            style={{ '--sa': m.sa.color, '--sb': m.sb.color }}
            onClick={() => onPick(m.sa, m.sb)}
            type="button"
          >
            <span className="cmp-sugg-tag">{m.tag}</span>
            <span className="cmp-sugg-faces">
              <SuggFace kind={kind} refId={m.sa.ref} color={m.sa.color} side="l" />
              <span className="cmp-sugg-vs" aria-hidden="true">VS</span>
              <SuggFace kind={kind} refId={m.sb.ref} color={m.sb.color} side="r" />
            </span>
            <span className="cmp-sugg-names">
              <b>{shortName(kind, m.ea)}</b><i>vs</i><b>{shortName(kind, m.eb)}</b>
            </span>
            <span className="cmp-sugg-reason">{m.reason}</span>
            <span className="cmp-sugg-go" aria-hidden="true">Compare <span className="cmp-sugg-arrow">→</span></span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── fighter header + rows ────────────────────────────────────────
function FaceImg({ kind, id, color }) {
  const [ok, setOk] = useState(true);
  const src = kind === 'team'
    ? `/images/teams/${LOGO_ALIAS[id.ref] || id.ref}.jpg`
    : `/images/drivers/${id.ref}.webp`;
  if (!ok) {
    if (kind === 'team') {
      const mono = (id.short || id.name || '?').slice(0, 3).toUpperCase();
      return <span className="cmp-f-face is-team is-mono" style={{ '--cmp-av': color }} aria-hidden="true">{mono}</span>;
    }
    return null;
  }
  return <img className={`cmp-f-face ${kind === 'team' ? 'is-team' : ''}`} src={src} alt="" loading="eager" onError={() => setOk(false)} />;
}

function TeamLogoMark({ refId }) {
  const [ok, setOk] = useState(true);
  if (!ok || !refId) return null;
  return <img className="cmp-f-tlogo" src={`/images/teams/${LOGO_ALIAS[refId] || refId}.jpg`} alt="" loading="eager" onError={() => setOk(false)} />;
}

function Fighter({ side, id, kind, color }) {
  const cc = flagCc(id.nationality);
  const logoRef = kind === 'team' ? null : id.teamRef;
  const teamLabel = kind === 'team' ? (id.nationality || '') : (id.team || id.nationality || '');
  return (
    <div className={`cmp-fighter cmp-${side}`}>
      {cc && <span className="cmp-f-flagwash" style={{ backgroundImage: `url(/images/flags/${cc}.svg)` }} aria-hidden="true" />}
      <FaceImg kind={kind} id={id} color={color} />
      <div className="cmp-f-text">
        <div className="cmp-f-team" style={{ color: teamTint(color) }}>
          {logoRef && <TeamLogoMark refId={logoRef} />}
          <span>{teamLabel}</span>
        </div>
        <div className="cmp-f-name">{id.surname || id.name}</div>
        <div className="cmp-f-sub">{id.code ? `${id.code} · ` : ''}{id.span || ''}</div>
        <div className="cmp-f-strip" style={{ background: color }} />
      </div>
    </div>
  );
}

function ContextBanner({ cmp, A, B, bColor, kind }) {
  const c = cmp.context;
  if (kind === 'team') {
    return (
      <div className="cmp-ctx cmp-ctx-teams">
        <div className="cmp-ctx-main">
          <span className="cmp-ctx-kick">Shared-season title race</span>
          {c.shared > 0
            ? <span className="cmp-ctx-txt">In <b>{c.shared}</b> seasons both raced, <b>{A.surname || A.name}</b> finished higher <b>{c.aAhead}</b> · <b>{B.surname || B.name}</b> <b>{c.bAhead}</b>.</span>
            : <span className="cmp-ctx-txt">Their seasons never overlapped. A pure record-vs-record comparison.</span>}
        </div>
        {c.sharedDrivers?.length > 0 && (
          <div className="cmp-shared-drivers">
            <span className="cmp-shared-lbl">Wore both colours</span>
            <span className="cmp-chips">
              {c.sharedDrivers.slice(0, 8).map((d) => (
                <a key={d.driverRef} className="cmp-chip" href={`/drivers/${d.driverRef}/`}>{d.name}</a>
              ))}
              {c.sharedDrivers.length > 8 && <span className="cmp-chip cmp-chip-more">+{c.sharedDrivers.length - 8}</span>}
            </span>
          </div>
        )}
      </div>
    );
  }
  if (c.type === 'teammate') {
    const q = c.quali, race = c.race;
    const qLead = q.wins === q.losses ? null : q.wins > q.losses ? A.surname : B.surname;
    const rLead = race.wins === race.losses ? null : race.wins > race.losses ? A.surname : B.surname;
    return (
      <div className="cmp-ctx cmp-ctx-mate" style={{ '--cmp-b': bColor }}>
        <span className="cmp-ctx-kick">Teammates · {c.years}</span>
        <span className="cmp-ctx-txt">
          {c.weekends} weekends in the same garage. Qualifying <b>{q.wins}–{q.losses}</b>{qLead ? ` ${qLead}` : ''} · Race <b>{race.wins}–{race.losses}</b>{rLead ? ` ${rLead}` : ''}.
        </span>
      </div>
    );
  }
  if (c.type === 'rival') {
    return (
      <div className="cmp-ctx cmp-ctx-rival">
        <span className="cmp-ctx-kick">On-track rivals</span>
        <span className="cmp-ctx-txt">
          {c.shared > 0 && <>They’ve started <b>{c.shared}</b> races on the same grid. </>}
          {c.decided > 0
            ? <>Of {c.decided} both classified, <b>{A.surname}</b> finished ahead <b>{c.aAhead}</b> · <b>{B.surname}</b> <b>{c.bAhead}</b>.</>
            : <>Never both classified in the same race.</>}
          {' '}Never teammates.
        </span>
      </div>
    );
  }
  return (
    <div className="cmp-ctx cmp-ctx-era">
      <span className="cmp-ctx-kick">Different eras</span>
      <span className="cmp-ctx-txt">Their careers never shared a grid ({A.span} vs {B.span}). A pure record-vs-record comparison.</span>
    </div>
  );
}

function MetricRow({ r, live, aColor, bColor }) {
  let aFrac = 0, bFrac = 0;
  const a = r.a, b = r.b;
  if (r.better === 'lo') {
    const m = Math.min(a ?? Infinity, b ?? Infinity);
    aFrac = a ? m / a : 0; bFrac = b ? m / b : 0;
  } else {
    const max = Math.max(a ?? 0, b ?? 0) || 1;
    aFrac = (a ?? 0) / max; bFrac = (b ?? 0) / max;
  }
  const aFill = r.winner === 'a' ? aColor : 'var(--line-3)';
  const bFill = r.winner === 'b' ? bColor : 'var(--line-3)';
  const w = (f) => `${Math.round((live ? f : 0) * 100)}%`;
  return (
    <div className="cmp-mrow">
      <div className="cmp-lbar">
        <CountVal value={a} fmt={r.fmt} live={live} className={`cmp-mval ${r.winner === 'a' ? 'win' : ''}`} />
        <span className="cmp-track"><span className="cmp-fill cmp-fill-l" style={{ width: w(aFrac), background: aFill }} /></span>
      </div>
      <div className="cmp-mlabel">{r.label}<span className="cmp-unit">{r.unit}</span></div>
      <div className="cmp-rbar">
        <span className="cmp-track"><span className="cmp-fill cmp-fill-r" style={{ width: w(bFrac), background: bFill }} /></span>
        <CountVal value={b} fmt={r.fmt} live={live} className={`cmp-mval ${r.winner === 'b' ? 'win' : ''}`} />
      </div>
    </div>
  );
}

function ExtraFact({ x, A, B }) {
  if (x.key === 'genGap') {
    const older = x.olderRef === A.ref ? A : B;
    return (
      <div className="cmp-extra">
        <span className="cmp-extra-k">Generation gap</span>
        <span className="cmp-extra-v"><b>{x.value}</b> years apart. {older.surname || older.name} is the elder ({x.aBorn} vs {x.bBorn}).</span>
      </div>
    );
  }
  if (x.key === 'teamCount') {
    return (
      <div className="cmp-extra">
        <span className="cmp-extra-k">Teams driven for</span>
        <span className="cmp-extra-v"><b>{A.surname || A.name}</b> {x.a} · <b>{B.surname || B.name}</b> {x.b}</span>
      </div>
    );
  }
  return null;
}

// ── the full comparison panel (fighters + context + rows + share) ─
export function CompareView({ cmp, kind, teamColor, onClose, footerLeft }) {
  const [live, setLive] = useState(false);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => { const id = requestAnimationFrame(() => setLive(true)); return () => cancelAnimationFrame(id); }, [cmp]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 1800); return () => clearTimeout(t); }, [toast]);

  const A = cmp.a, B = cmp.b;
  const aColor = 'var(--accent)';
  const bColor = B.color || teamColor || 'var(--accent-dim)';
  const v = cmp.verdict;
  const leadName = v.lead === 'a' ? A.surname || A.name : v.lead === 'b' ? B.surname || B.name : null;
  const leadCount = v.lead === 'a' ? v.a : v.b;

  const cardBColor = B.color && B.color[0] === '#' ? B.color : '#FF3B57';
  const shareTitle = `${A.name} vs ${B.name} · F1gures`;
  const fileName = `f1gures-${A.ref}-vs-${B.ref}.png`;
  const makeBlob = () => buildShareBlob(cmp, { bColor: cardBColor });

  async function onSave() {
    if (busy) return; setBusy('save');
    try {
      const blob = await makeBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setToast('Image saved');
    } catch { setToast('Save failed'); }
    setBusy('');
  }
  async function onCopy() {
    if (busy) return; setBusy('copy');
    try {
      const blob = await makeBlob();
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
        setToast('Image copied');
      } else { throw new Error('no clipboard'); }
    } catch { setToast('Copy unsupported — use Save'); }
    setBusy('');
  }
  async function onShare() {
    if (busy) return; setBusy('share');
    try {
      const blob = await makeBlob();
      const file = new File([blob], fileName, { type: 'image/png' });
      const data = { title: shareTitle, text: shareTitle, url: window.location.href };
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ ...data, files: [file] });
      else if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(window.location.href); setToast('Link copied'); }
    } catch (e) { if (e && e.name !== 'AbortError') setToast('Share unavailable'); }
    setBusy('');
  }

  return (
    <div className="cmp-panel">
      {onClose && <button className="cmp-x cmp-x-abs" onClick={onClose} aria-label="Close">✕</button>}
      <div className="cmp-tape-top">
        <Fighter side="left" id={A} kind={kind} color={aColor} />
        <div className="cmp-vscol">
          <div className="cmp-vsbig">VS</div>
          {v.lead
            ? <div className="cmp-verdict"><b>{leadName}</b> takes<br /><span className="cmp-verdict-n">{leadCount} of {v.of}</span></div>
            : <div className="cmp-verdict">Dead heat<br /><span className="cmp-verdict-n">{v.a}–{v.b}</span></div>}
        </div>
        <Fighter side="right" id={B} kind={kind} color={bColor} />
      </div>

      <ContextBanner cmp={cmp} A={A} B={B} bColor={bColor} kind={kind} />

      {cmp.groups.map((g) => (
        g.rows.length > 0 && (
          <div className="cmp-group" key={g.key}>
            <div className="cmp-group-head">{g.title}</div>
            <div className="cmp-rows">
              {g.rows.map((r) => <MetricRow key={r.key} r={r} live={live} aColor={aColor} bColor={bColor} />)}
            </div>
          </div>
        )
      ))}

      {kind === 'driver' && cmp.extras?.length > 0 && (
        <div className="cmp-extras">
          {cmp.extras.map((x) => <ExtraFact key={x.key} x={x} A={A} B={B} />)}
        </div>
      )}

      <div className="cmp-panel-foot">
        {footerLeft || <span />}
        <div className="cmp-share-actions">
          {toast && <span className="cmp-toast" role="status">{toast}</span>}
          <button className="cmp-foot-btn" onClick={onSave} disabled={!!busy} title="Save as PNG">{busy === 'save' ? '…' : '↓'} Save image</button>
          <button className="cmp-foot-btn" onClick={onCopy} disabled={!!busy} title="Copy image to clipboard">{busy === 'copy' ? '…' : '⧉'} Copy</button>
          <button className="cmp-foot-btn cmp-foot-btn-primary" onClick={onShare} disabled={!!busy} title="Share to Reddit, WhatsApp…">{busy === 'share' ? '…' : '↗'} Share</button>
        </div>
      </div>
    </div>
  );
}
