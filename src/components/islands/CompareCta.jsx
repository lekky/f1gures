// CompareCta — the "Compare Mode" flagship island. Renders the hero CTA
// button, a grid-seeded rival picker, and the animated VS overlay. Mounted on
// driver and team detail pages (which are otherwise pure static Astro), so all
// the heavy per-race joining happens client-side, on demand, only when someone
// actually opens a comparison.
//
//   <CompareCta client:idle kind="driver" refId="hamilton" name="Lewis Hamilton" teamColor="#27F4D2" />
//
// Data: the picker lazy-loads _drivers-index.json / _teams-index.json (cached);
// selecting a rival fetches both full archive docs and runs compareStats. The
// chosen rival is mirrored to ?vs=<ref> so any comparison is a shareable link
// and a deep-link opens straight into the overlay.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { compareDrivers, compareTeams, fmtVal } from '../../lib/compareStats.js';
import { buildShareBlob } from '../../lib/compareShareCard.js';
import { NATIONALITY } from '../../lib/nationality.js';

// team-logo files use the buildFallback id, not the Ergast constructorRef
// (mirrors TEAM_LOGO_ALIAS in TeamPage.astro / shared.jsx).
const LOGO_ALIAS = { red_bull: 'redbull', aston_martin: 'aston' };
const flagCc = (nat) => {
  const n = nat && NATIONALITY[nat];
  return n && n.country ? n.country.toLowerCase() : null;
};
// team colour as small text fails WCAG on dark cards — mix toward the theme
// text colour to lift every hue to AA while keeping its identity.
const teamTint = (c) => `color-mix(in srgb, ${c} 58%, var(--fg-1))`;

// ── module-level caches (survive remounts within a page) ─────────
const _index = {};        // kind -> array
const _indexPromise = {};
const _docCache = {};      // `${kind}:${ref}` -> doc

function loadIndex(kind) {
  if (_index[kind]) return Promise.resolve(_index[kind]);
  if (_indexPromise[kind]) return _indexPromise[kind];
  const file = kind === 'team' ? '_teams-index.json' : '_drivers-index.json';
  _indexPromise[kind] = fetch(`/data/archive/${file}`)
    .then((r) => r.json())
    .then((list) => { _index[kind] = list; return list; })
    .catch((err) => { _indexPromise[kind] = null; throw err; });
  return _indexPromise[kind];
}

function loadDoc(kind, ref) {
  const key = `${kind}:${ref}`;
  if (_docCache[key]) return Promise.resolve(_docCache[key]);
  const dir = kind === 'team' ? 'teams' : 'drivers';
  return fetch(`/data/archive/${dir}/${ref}.json`)
    .then((r) => { if (!r.ok) throw new Error(`no doc ${ref}`); return r.json(); })
    .then((doc) => { _docCache[key] = doc; return doc; });
}

// index-entry helpers (drivers and teams have different key names)
const entryRef = (kind, e) => (kind === 'team' ? e.constructorRef : e.driverRef);
const entryName = (kind, e) => (kind === 'team' ? e.name : `${e.forename} ${e.surname}`);
const entryColor = (kind, e) => (kind === 'team' ? e.color : e.teamColor) || '#888';
const entryHay = (kind, e) =>
  (kind === 'team'
    ? e.name
    : `${e.forename} ${e.surname} ${e.code || ''}`
  ).toLowerCase();

function scoreHay(hay, tokens) {
  let score = 0;
  for (const tok of tokens) {
    const i = hay.indexOf(tok);
    if (i === -1) return -1;
    score += i === 0 ? 3 : hay.charCodeAt(i - 1) === 32 ? 2 : 1;
  }
  return score;
}

/** The current grid (drivers racing this season / teams active latest year),
 *  minus the page's own entity — the default rivals to offer first. */
function gridSeed(kind, list, selfRef) {
  if (kind === 'team') {
    const maxYear = Math.max(...list.map((t) => t.lastYear || 0));
    return list
      .filter((t) => t.lastYear === maxYear && t.constructorRef !== selfRef)
      .sort((a, b) => (b.championships || 0) - (a.championships || 0) || (b.wins || 0) - (a.wins || 0));
  }
  const maxYear = Math.max(...list.map((d) => d.currentSeasonYear || 0));
  return list
    .filter((d) => d.currentSeasonYear === maxYear && d.driverRef !== selfRef)
    .sort((a, b) => (b.currentSeasonPoints || 0) - (a.currentSeasonPoints || 0));
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Pick black or white — whichever has the higher WCAG contrast on the given
 *  fill — so the fully-coloured CTA text is always readable on any team colour. */
function readableText(hex) {
  if (!hex || hex[0] !== '#' || hex.length < 7) return '#fff';
  const ch = (i) => parseInt(hex.slice(i, i + 2), 16) / 255;
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(ch(1)) + 0.7152 * lin(ch(3)) + 0.0722 * lin(ch(5));
  const cWhite = 1.05 / (L + 0.05);
  const cBlack = (L + 0.05) / 0.05;
  return cBlack >= cWhite ? '#0A0A0A' : '#FFFFFF';
}

// ── count-up hook ────────────────────────────────────────────────
function useCountUp(target, live, fmt) {
  const [val, setVal] = useState(live ? 0 : target);
  const rafRef = useRef(0);
  useEffect(() => {
    if (target == null) return;
    if (!live || prefersReducedMotion()) { setVal(target); return; }
    let start = null;
    const dur = 620;
    const step = (ts) => {
      if (start == null) start = ts;
      const t = Math.min(1, (ts - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(target * eased);
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

// ── main island ──────────────────────────────────────────────────
export default function CompareCta({ kind = 'driver', refId, name, teamColor }) {
  const [mode, setMode] = useState('idle');     // idle | pick | overlay
  const [list, setList] = useState(null);
  const [query, setQuery] = useState('');
  const [rivalRef, setRivalRef] = useState(null);
  const [cmp, setCmp] = useState(null);
  const [status, setStatus] = useState('');      // '', 'loading', 'error'
  const inputRef = useRef(null);

  const open = mode === 'pick' || mode === 'overlay';

  // load index when the picker opens
  useEffect(() => {
    if (mode === 'pick' && !list) loadIndex(kind).then(setList).catch(() => setStatus('error'));
  }, [mode, list, kind]);

  // scroll-lock + focus + Escape while any layer is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') closeAll(); };
    window.addEventListener('keydown', onKey);
    if (mode === 'pick') requestAnimationFrame(() => inputRef.current?.focus());
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open, mode]);

  const runCompare = useCallback((rref) => {
    setRivalRef(rref);
    setStatus('loading');
    setMode('overlay');
    // Load both docs + the index (the index is the only place the rival's team
    // colour lives — driver docs don't carry it, so bars would fall back to the
    // page entity's colour without this).
    Promise.all([loadDoc(kind, refId), loadDoc(kind, rref), loadIndex(kind).catch(() => null)])
      .then(([selfDoc, rivalDoc, idx]) => {
        const result = kind === 'team' ? compareTeams(selfDoc, rivalDoc) : compareDrivers(selfDoc, rivalDoc);
        if (idx) {
          const rEntry = idx.find((e) => entryRef(kind, e) === rref);
          if (rEntry && !result.b.color) result.b.color = entryColor(kind, rEntry);
        }
        setCmp(result);
        setStatus('');
      })
      .catch(() => setStatus('error'));
  }, [kind, refId]);

  // deep-link: ?vs=<ref> opens straight into the overlay
  useEffect(() => {
    const vs = new URLSearchParams(window.location.search).get('vs');
    if (vs && vs !== refId) runCompare(vs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pushVs(rref) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('vs', rref);
      window.history.pushState({ vs: rref }, '', url);
    } catch {}
  }
  function clearVs() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('vs');
      window.history.replaceState({}, '', url);
    } catch {}
  }

  function pick(rref) {
    pushVs(rref);
    setQuery('');
    runCompare(rref);
  }
  function closeAll() {
    clearVs();
    setMode('idle');
    setCmp(null);
    setRivalRef(null);
    setStatus('');
  }
  function backToPick() {
    clearVs();
    setCmp(null);
    setRivalRef(null);
    setStatus('');
    setMode('pick');
  }

  // picker result set — grid seed when empty, ranked search otherwise
  const results = useMemo(() => {
    if (!list) return [];
    const q = query.trim().toLowerCase();
    if (!q) return gridSeed(kind, list, refId).slice(0, 24);
    const tokens = q.split(/\s+/).filter(Boolean);
    const scored = [];
    for (const e of list) {
      if (entryRef(kind, e) === refId) continue;
      const s = scoreHay(entryHay(kind, e), tokens);
      if (s >= 0) scored.push({ s, e });
    }
    scored.sort((a, b) =>
      b.s - a.s ||
      ((kind === 'team' ? b.e.championships : b.e.wins) || 0) - ((kind === 'team' ? a.e.championships : a.e.wins) || 0)
    );
    return scored.slice(0, 24).map((x) => x.e);
  }, [list, query, kind, refId]);

  const seededLabel = query.trim() ? 'Best matches' : (kind === 'team' ? 'Current grid' : 'On the grid now');

  return (
    <>
      <button
        type="button"
        className="cmp-cta"
        style={{ '--cmp-team': teamColor || 'var(--accent)', '--cmp-fg': readableText(teamColor) }}
        onClick={() => setMode('pick')}
        aria-haspopup="dialog"
      >
        <span className="cmp-cta-vs" aria-hidden="true">VS</span>
        <span className="cmp-cta-txt">Compare</span>
        <span className="cmp-cta-sub">{name} against any {kind === 'team' ? 'constructor' : 'driver'} in history</span>
        <span className="cmp-cta-arrow" aria-hidden="true">→</span>
        <span className="cmp-cta-shine" aria-hidden="true" />
      </button>

      {mode === 'pick' && createPortal(
        <div className="cmp-back" role="dialog" aria-modal="true" aria-label={`Compare ${name} with…`}
             onMouseDown={(e) => { if (e.target === e.currentTarget) closeAll(); }}>
          <div className="cmp-picker">
            <div className="cmp-picker-head">
              <span className="cmp-picker-eyebrow">Compare {name} with</span>
              <button className="cmp-x" onClick={closeAll} aria-label="Close">✕</button>
            </div>
            <div className="cmp-search">
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                type="search"
                placeholder={kind === 'team' ? 'Search every constructor…' : 'Search all 862 drivers…'}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off" spellCheck={false}
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
                      <button key={r} className="cmp-row" onClick={() => pick(r)}>
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
          </div>
        </div>,
        document.body
      )}

      {mode === 'overlay' && createPortal(
        <div className="cmp-back cmp-back-overlay" role="dialog" aria-modal="true" aria-label="Comparison"
             onMouseDown={(e) => { if (e.target === e.currentTarget) closeAll(); }}>
          <CompareOverlay
            cmp={cmp} status={status} name={name} teamColor={teamColor} kind={kind}
            onClose={closeAll} onChange={backToPick}
          />
        </div>,
        document.body
      )}
    </>
  );
}

// ── overlay ──────────────────────────────────────────────────────
function CompareOverlay({ cmp, status, name, teamColor, kind, onClose, onChange }) {
  const [live, setLive] = useState(false);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    if (cmp) { const id = requestAnimationFrame(() => setLive(true)); return () => cancelAnimationFrame(id); }
    setLive(false);
  }, [cmp]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  if (status === 'loading' || !cmp) {
    return (
      <div className="cmp-panel cmp-panel-loading">
        {status === 'error'
          ? <div className="cmp-empty">Couldn’t load that comparison.</div>
          : <div className="cmp-empty"><span className="cmp-spin" aria-hidden="true" />Building the head-to-head…</div>}
        <button className="cmp-x cmp-x-abs" onClick={onClose} aria-label="Close">✕</button>
      </div>
    );
  }

  const A = cmp.a, B = cmp.b;
  const aColor = 'var(--accent)';
  const bColor = B.color || teamColor || 'var(--accent-dim)';
  const v = cmp.verdict;
  const leadName = v.lead === 'a' ? A.surname || A.name : v.lead === 'b' ? B.surname || B.name : null;
  const leadCount = v.lead === 'a' ? v.a : v.b;

  // canvas needs a real hex for the rival colour, never a CSS-var string
  const cardBColor = B.color && B.color[0] === '#' ? B.color : '#FF3B57';
  const shareTitle = `${A.name} vs ${B.name} · F1gures`;
  const fileName = `f1gures-${A.ref}-vs-${B.ref}.png`;

  async function makeBlob() { return buildShareBlob(cmp, { bColor: cardBColor }); }

  async function onSave() {
    if (busy) return;
    setBusy('save');
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
    if (busy) return;
    setBusy('copy');
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
    if (busy) return;
    setBusy('share');
    try {
      const blob = await makeBlob();
      const file = new File([blob], fileName, { type: 'image/png' });
      const data = { title: shareTitle, text: shareTitle, url: window.location.href };
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ ...data, files: [file] });
      } else if (navigator.share) {
        await navigator.share(data);
      } else {
        await navigator.clipboard.writeText(window.location.href);
        setToast('Link copied');
      }
    } catch (e) { if (e && e.name !== 'AbortError') setToast('Share unavailable'); }
    setBusy('');
  }

  return (
    <div className="cmp-panel">
      <button className="cmp-x cmp-x-abs" onClick={onClose} aria-label="Close">✕</button>

      {/* fighters + verdict */}
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
        <button className="cmp-foot-btn" onClick={onChange}>↺ Change rival</button>
        <div className="cmp-share-actions">
          {toast && <span className="cmp-toast" role="status">{toast}</span>}
          <button className="cmp-foot-btn" onClick={onSave} disabled={!!busy} title="Save as PNG">
            {busy === 'save' ? '…' : '↓'} Save image
          </button>
          <button className="cmp-foot-btn" onClick={onCopy} disabled={!!busy} title="Copy image to clipboard">
            {busy === 'copy' ? '…' : '⧉'} Copy
          </button>
          <button className="cmp-foot-btn cmp-foot-btn-primary" onClick={onShare} disabled={!!busy} title="Share to Reddit, WhatsApp…">
            {busy === 'share' ? '…' : '↗'} Share
          </button>
        </div>
      </div>
    </div>
  );
}

function Avatar({ kind, id, color }) {
  const [ok, setOk] = useState(true);
  const src = kind === 'team'
    ? `/images/teams/${LOGO_ALIAS[id.ref] || id.ref}.jpg`
    : `/images/drivers/${id.ref}.webp`;
  const mono = (id.code || id.short || id.surname || id.name || '?').slice(0, 3).toUpperCase();
  return (
    <div className={`cmp-f-avatar ${kind === 'team' ? 'is-team' : ''}`} style={{ '--cmp-av': color }} aria-hidden="true">
      {ok
        ? <img src={src} alt="" loading="eager" onError={() => setOk(false)} />
        : <span className="cmp-f-mono">{mono}</span>}
    </div>
  );
}

function TeamLogoMark({ refId }) {
  const [ok, setOk] = useState(true);
  if (!ok || !refId) return null;
  return (
    <img className="cmp-f-logo" src={`/images/teams/${LOGO_ALIAS[refId] || refId}.jpg`}
         alt="" loading="eager" onError={() => setOk(false)} />
  );
}

function Fighter({ side, id, kind, color }) {
  const cc = flagCc(id.nationality);
  const logoRef = kind === 'team' ? null : id.teamRef;
  return (
    <div className={`cmp-fighter cmp-${side}`}>
      <Avatar kind={kind} id={id} color={color} />
      <div className="cmp-f-team" style={{ color: teamTint(color) }}>
        {kind === 'team' ? (id.nationality || '') : (id.team || id.nationality || '')}
      </div>
      <div className="cmp-f-name">{id.surname || id.name}</div>
      <div className="cmp-f-sub">{id.code ? `${id.code} · ` : ''}{id.span || ''}</div>
      <div className="cmp-f-marks">
        {cc && <img className="cmp-f-flag" src={`/images/flags/${cc}.svg`} alt="" loading="eager" />}
        <TeamLogoMark refId={logoRef} />
      </div>
      <div className="cmp-f-strip" style={{ background: color }} />
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
  // driver
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
      <span className="cmp-ctx-txt">
        Their careers never shared a grid ({A.span} vs {B.span}). A pure record-vs-record comparison.
      </span>
    </div>
  );
}

function MetricRow({ r, live, aColor, bColor }) {
  // bar fractions: winner-longer. hi → value/max; lo → min/value (best = full).
  let aFrac = 0, bFrac = 0;
  const a = r.a, b = r.b;
  if (r.better === 'lo') {
    const m = Math.min(a ?? Infinity, b ?? Infinity);
    aFrac = a ? m / a : 0;
    bFrac = b ? m / b : 0;
  } else {
    const max = Math.max(a ?? 0, b ?? 0) || 1;
    aFrac = (a ?? 0) / max;
    bFrac = (b ?? 0) / max;
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
