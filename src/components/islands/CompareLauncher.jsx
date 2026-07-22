// CompareLauncher — the standalone /compare/ experience, rebuilt as a
// multi-entity "head-to-head canvas". Pin 2+ drivers or teams and compare them
// across a compact set of headline metrics (one bar per entity per metric) with
// a "leads X of Y" verdict. State mirrors to /compare/?type=&e=ref1,ref2,… so
// any canvas is a shareable link (legacy ?a=&b= still resolves).
//
// N-way math lives in compareStats.compareCanvas; when exactly two entities are
// pinned an "↗ Rivalry & share card" button opens the existing rich 2-way
// CompareView (teammate/rival context + branded PNG) in an overlay — reused
// verbatim, no duplicated render. Loaders / picker / suggestions come from
// compareShared, so alias maps and the archive fetches stay in one place.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  compareDrivers, compareTeams, compareCanvas, fmtVal,
} from '../../lib/compareStats.js';
import {
  loadDoc, loadIndex, entryRef, entryName, entryColor,
  PickerBody, CompareView, SuggestedMatchups, LOGO_ALIAS,
} from './compareShared.jsx';

const MAX = 6;

// Distinct fallbacks used only when two entities would otherwise share a hue
// (two McLaren drivers, say) — so every bar stays tellable apart.
const FALLBACK_COLORS = ['#E8002D', '#3671C6', '#FF8000', '#27F4D2', '#8B5CF6', '#FFD700'];

/** Keep each entity's own team colour where it's unique; shift only the
 *  collisions onto a distinct fallback, so N bars never blur together. */
function assignColors(picks) {
  const used = new Set();
  return picks.map((p, i) => {
    let c = p.color && p.color[0] === '#' ? p.color.toUpperCase() : null;
    if (!c || used.has(c)) c = FALLBACK_COLORS.find((f) => !used.has(f)) || c || FALLBACK_COLORS[i % FALLBACK_COLORS.length];
    used.add(c);
    return c;
  });
}

const surnameOf = (name) => (name || '').trim().split(/\s+/).slice(-1)[0] || name;

export default function CompareLauncher() {
  const [type, setType] = useState('driver');     // 'driver' | 'team'
  const [picks, setPicks] = useState([]);          // [{ ref, name, color }]
  const [canvas, setCanvas] = useState(null);      // compareCanvas() + colors
  const [pair, setPair] = useState(null);          // 2-way cmp when exactly 2 pinned
  const [status, setStatus] = useState('');         // '', 'loading', 'error'
  const [picking, setPicking] = useState(null);     // null | { mode:'add' } | { mode:'replace', index }
  const [rivalry, setRivalry] = useState(false);    // 2-way overlay open?
  const [toast, setToast] = useState('');

  // deep-link: /compare/?type=&e=ref1,ref2  (legacy ?a=&b= still works)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get('type') === 'team' ? 'team' : 'driver';
    let refs = (p.get('e') || '').split(',').map((r) => r.trim()).filter(Boolean);
    if (!refs.length) refs = [p.get('a'), p.get('b')].filter(Boolean);
    if (!refs.length) return;
    setType(t);
    loadIndex(t).then((list) => {
      const resolved = refs.slice(0, MAX).map((ref) => {
        const e = list.find((x) => entryRef(t, x) === ref);
        return e ? { ref, name: entryName(t, e), color: entryColor(t, e) } : { ref, name: ref, color: '#888' };
      });
      setPicks(resolved);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // compute the canvas (and the 2-way pair) whenever the line-up changes
  useEffect(() => {
    if (picks.length < 2) { setCanvas(null); setPair(null); setStatus(''); return undefined; }
    let alive = true;
    setStatus('loading');
    Promise.all(picks.map((p) => loadDoc(type, p.ref)))
      .then((docs) => {
        if (!alive) return;
        const cvs = compareCanvas(docs, type);
        const colors = assignColors(picks);
        cvs.colors = colors;
        cvs.entities = cvs.entities.map((e, i) => ({ ...e, color: colors[i] }));
        setCanvas(cvs);
        if (docs.length === 2) {
          const pc = type === 'team' ? compareTeams(docs[0], docs[1]) : compareDrivers(docs[0], docs[1]);
          if (!pc.b.color) pc.b.color = colors[1];
          setPair(pc);
        } else setPair(null);
        setStatus('');
      })
      .catch(() => { if (alive) setStatus('error'); });
    return () => { alive = false; };
  }, [picks, type]);

  // mirror to URL
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('type', type);
      if (picks.length) url.searchParams.set('e', picks.map((p) => p.ref).join(',')); else url.searchParams.delete('e');
      url.searchParams.delete('a'); url.searchParams.delete('b');
      window.history.replaceState({}, '', url);
    } catch {}
  }, [picks, type]);

  // scroll-lock + Escape while the picker is open
  useEffect(() => {
    if (!picking) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setPicking(null); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [picking]);

  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(''), 1800); return () => clearTimeout(t); }, [toast]);

  function chooseType(t) { if (t === type) return; setType(t); setPicks([]); setCanvas(null); setPair(null); }

  function onPick(ref, entry) {
    const chosen = { ref, name: entryName(type, entry), color: entryColor(type, entry) };
    setPicks((cur) => {
      if (picking?.mode === 'replace') {
        if (cur.some((p, i) => p.ref === ref && i !== picking.index)) return cur; // already pinned elsewhere
        const next = cur.slice(); next[picking.index] = chosen; return next;
      }
      if (cur.some((p) => p.ref === ref) || cur.length >= MAX) return cur;
      return [...cur, chosen];
    });
    setPicking(null);
  }
  function removeAt(i) { setPicks((cur) => cur.filter((_, idx) => idx !== i)); }
  function pickMatchup(sa, sb) { setPicks([sa, sb]); }

  function shareCanvas() {
    const url = window.location.href;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => setToast('Canvas link copied')).catch(() => setToast('Copy the URL from the address bar'));
    } else setToast('Copy the URL from the address bar');
  }

  const excludeRefs = picks.map((p) => p.ref);
  const noun = type === 'team' ? 'constructor' : 'driver';

  return (
    <div className="cvs">
      <div className="cmp-seg" role="tablist" aria-label="Compare drivers or teams">
        <button role="tab" aria-selected={type === 'driver'} className={`cmp-seg-btn ${type === 'driver' ? 'is-on' : ''}`} onClick={() => chooseType('driver')}>Drivers</button>
        <button role="tab" aria-selected={type === 'team'} className={`cmp-seg-btn ${type === 'team' ? 'is-on' : ''}`} onClick={() => chooseType('team')}>Teams</button>
      </div>

      <div className="cvs-cards">
        {picks.map((p, i) => (
          <EntityCard
            key={p.ref}
            pick={p}
            kind={type}
            color={canvas?.colors?.[i] || p.color}
            info={canvas?.entities?.[i] || null}
            onReplace={() => setPicking({ mode: 'replace', index: i })}
            onRemove={() => removeAt(i)}
          />
        ))}
        {picks.length < MAX && (
          <button className="cvs-card cvs-drop" onClick={() => setPicking({ mode: 'add' })} type="button">
            <span className="cvs-drop-plus" aria-hidden="true">+</span>
            <span className="cvs-drop-hint">{picks.length < 2 ? `Add ${noun}` : 'Drop entity'}</span>
          </button>
        )}
      </div>

      {status === 'loading' && (
        <div className="cvs-panel cvs-panel-empty"><span className="cmp-spin" aria-hidden="true" />Building the canvas…</div>
      )}
      {status === 'error' && (
        <div className="cvs-panel cvs-panel-empty">Couldn’t load one of those. Try another pick.</div>
      )}

      {status === '' && canvas && (
        <>
          <CanvasPanel canvas={canvas} />
          <div className="cvs-tray">
            <span className="cvs-tray-lbl">Compare tray</span>
            <div className="cvs-tray-chips">
              {picks.map((p, i) => (
                <span className="cvs-chip" key={p.ref} style={{ '--cc': canvas.colors?.[i] || p.color }}>
                  {surnameOf(p.name).toUpperCase()}
                  <button className="cvs-chip-x" onClick={() => removeAt(i)} aria-label={`Remove ${p.name}`} type="button">✕</button>
                </span>
              ))}
              {picks.length < MAX && (
                <button className="cvs-chip cvs-chip-add" onClick={() => setPicking({ mode: 'add' })} type="button">+ Add</button>
              )}
            </div>
            <div className="cvs-tray-actions">
              {toast && <span className="cmp-toast" role="status">{toast}</span>}
              {picks.length === 2 && pair && (
                <button className="cmp-foot-btn" onClick={() => setRivalry(true)} type="button">↗ Rivalry &amp; share card</button>
              )}
              <button className="cmp-foot-btn cmp-foot-btn-primary" onClick={shareCanvas} type="button">⧉ Share canvas</button>
            </div>
          </div>
        </>
      )}

      {status === '' && picks.length < 2 && (
        <div className="cvs-launch-hint">
          Pin any two {noun}s to open the canvas — championships, wins, poles, points and win rate, side by side. Add a third or fourth to turn it into a shoot-out.
        </div>
      )}

      <SuggestedMatchups kind={type} onPick={pickMatchup} />

      {picking && createPortal(
        <div className="cmp-back" role="dialog" aria-modal="true" aria-label={`Choose a ${noun}`}
             onMouseDown={(e) => { if (e.target === e.currentTarget) setPicking(null); }}>
          <div className="cmp-picker">
            <div className="cmp-picker-head">
              <span className="cmp-picker-eyebrow">{picking.mode === 'replace' ? `Swap ${noun}` : `Add a ${noun}`}</span>
              <button className="cmp-x" onClick={() => setPicking(null)} aria-label="Close">✕</button>
            </div>
            <PickerBody
              kind={type}
              excludeRefs={picking.mode === 'replace' ? excludeRefs.filter((_, i) => i !== picking.index) : excludeRefs}
              onPick={onPick}
            />
          </div>
        </div>,
        document.body,
      )}

      {rivalry && pair && createPortal(
        <div className="cmp-back cmp-back-overlay" role="dialog" aria-modal="true" aria-label="Rivalry"
             onMouseDown={(e) => { if (e.target === e.currentTarget) setRivalry(false); }}>
          <CompareView cmp={pair} kind={type} onClose={() => setRivalry(false)} />
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── entity photo card ────────────────────────────────────────────
function CardFace({ kind, refId, color, name }) {
  const [ok, setOk] = useState(true);
  const src = kind === 'team'
    ? `/images/teams/${LOGO_ALIAS[refId] || refId}.jpg`
    : `/images/drivers/${refId}.webp`;
  if (!ok || !refId) {
    const mono = (name || refId || '?').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();
    return <span className="cvs-face is-mono" style={{ '--cc': color }} aria-hidden="true">{mono}</span>;
  }
  return <img className={`cvs-face ${kind === 'team' ? 'is-team' : ''}`} src={src} alt="" loading="lazy" onError={() => setOk(false)} />;
}

function EntityCard({ pick, kind, color, info, onReplace, onRemove }) {
  const display = kind === 'team' ? (info?.name || pick.name) : surnameOf(info?.name || pick.name);
  const sub = kind === 'team' ? (info?.nationality || '') : (info?.team || '');
  const href = kind === 'team' ? `/teams/${pick.ref}/` : `/drivers/${pick.ref}/`;
  return (
    <div className="cvs-card" style={{ '--cc': color }}>
      <span className="cvs-card-rule" />
      <button className="cvs-card-x" onClick={onRemove} aria-label={`Remove ${pick.name}`} type="button">✕</button>
      <button className="cvs-card-face-btn" onClick={onReplace} title="Swap" type="button">
        <CardFace kind={kind} refId={pick.ref} color={color} name={pick.name} />
      </button>
      <a className="cvs-card-name" href={href}>{display}</a>
      <div className="cvs-card-sub">
        <span className="cvs-card-dot" style={{ background: color }} aria-hidden="true" />
        <span>{sub || ' '}</span>
      </div>
      <button className="cvs-card-swap" onClick={onReplace} type="button">Swap</button>
    </div>
  );
}

// ── the shared metric-bars panel ─────────────────────────────────
function CanvasPanel({ canvas }) {
  const [live, setLive] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setLive(true)); return () => cancelAnimationFrame(id); }, [canvas]);

  const v = canvas.verdict;
  const leadName = v.leaderIdx != null ? surnameOf(canvas.entities[v.leaderIdx].name).toUpperCase() : null;
  const leadColor = v.leaderIdx != null ? canvas.colors[v.leaderIdx] : null;

  return (
    <div className="cvs-panel">
      {canvas.metrics.map((m) => {
        const present = m.values.filter((x) => x != null);
        const max = present.length ? Math.max(...present) : 0;
        return (
          <div className="cvs-metric" key={m.key}>
            <div className="cvs-metric-label">{m.label}<span className="cvs-metric-unit">{m.unit}</span></div>
            <div className="cvs-bars">
              {m.values.map((val, i) => {
                const frac = max > 0 && val != null ? val / max : 0;
                const lead = m.leaders.length >= 1 && m.leaders.includes(i);
                return (
                  <div className="cvs-bar" key={canvas.entities[i].ref}>
                    <span className="cvs-track">
                      <span className="cvs-fill" style={{ width: live ? `${Math.max(frac * 100, val ? 2 : 0)}%` : '0%', background: canvas.colors[i] }} />
                    </span>
                    <span className={`cvs-val ${lead ? 'is-lead' : ''}`}>{fmtVal(val, m.fmt)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="cvs-verdict">
        <span className="cvs-verdict-kick">Verdict</span>
        {leadName
          ? <span className="cvs-verdict-txt"><b style={{ color: `color-mix(in srgb, ${leadColor} 60%, var(--fg-1))` }}>{leadName}</b> leads <b>{v.lead}</b> of {v.of} metrics</span>
          : <span className="cvs-verdict-txt">Too close to call — no clear leader across the board</span>}
      </div>
    </div>
  );
}
