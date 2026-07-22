// CompareLauncher — the standalone /compare/ experience, a multi-entity
// "head-to-head canvas". Pin 2+ drivers or teams and compare them across a
// compact set of headline metrics (one bar per entity per metric, each bar
// tagged with the entity's face + code so same-team line-ups stay tellable
// apart) with a "leads X of Y" verdict. Entity cards sit in a left rail so the
// data starts high. State mirrors to /compare/?type=&e=ref1,ref2,… so any
// canvas is a shareable link (legacy ?a=&b= still resolves).
//
// N-way math lives in compareStats.compareCanvas; when exactly two entities are
// pinned a "Head-to-head" button opens the existing rich 2-way CompareView
// (rivalry context + branded PNG export) in an overlay — reused verbatim.
// Loaders / picker / suggestions come from compareShared.

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
// (two McLaren drivers, say). Led by colours unlikely to collide with a real
// team fill, so the shifted entity stays clearly apart.
const FALLBACK_COLORS = ['#8B5CF6', '#EC4899', '#FFD700', '#27F4D2', '#3671C6', '#FF8000'];

const hexRgb = (h) => { const s = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };
/** Perceptually close? Catches near-duplicate reds/blues (Ferrari vs a red
 *  fallback, Williams vs Racing Bulls) that an exact-match test would miss. */
const tooClose = (a, b) => {
  if (!a || !b || a[0] !== '#' || b[0] !== '#') return false;
  const A = hexRgb(a), B = hexRgb(b);
  return Math.abs(A[0] - B[0]) + Math.abs(A[1] - B[1]) + Math.abs(A[2] - B[2]) < 64;
};

/** Keep each entity's own team colour where it's distinct; shift only the
 *  collisions onto a distinct fallback, so N bars never blur together. */
function assignColors(picks) {
  const used = [];
  return picks.map((p, i) => {
    let c = p.color && p.color[0] === '#' ? p.color.toUpperCase() : null;
    const clashes = (col) => !col || used.some((u) => tooClose(u, col));
    if (clashes(c)) c = FALLBACK_COLORS.find((f) => !clashes(f)) || c || FALLBACK_COLORS[i % FALLBACK_COLORS.length];
    used.push(c);
    return c;
  });
}

const surnameOf = (name) => (name || '').trim().split(/\s+/).slice(-1)[0] || name;
/** Short bar tag: driver code / team short, falling back to the surname. */
const tagOf = (e) => (e.code || e.short || surnameOf(e.name) || '').toUpperCase();

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
  const noun = type === 'team' ? 'team' : 'driver';

  return (
    <div className="cvs">
      <div className="cvs-top">
        <div className="cmp-seg" role="tablist" aria-label="Compare drivers or teams">
          <button role="tab" aria-selected={type === 'driver'} className={`cmp-seg-btn ${type === 'driver' ? 'is-on' : ''}`} onClick={() => chooseType('driver')}>Drivers</button>
          <button role="tab" aria-selected={type === 'team'} className={`cmp-seg-btn ${type === 'team' ? 'is-on' : ''}`} onClick={() => chooseType('team')}>Teams</button>
        </div>
        {picks.length >= 2 && (
          <div className="cvs-top-actions">
            {toast && <span className="cmp-toast" role="status">{toast}</span>}
            {picks.length === 2 && pair && (
              <button className="cmp-foot-btn" onClick={() => setRivalry(true)} type="button">
                <span aria-hidden="true">⚔</span> Head-to-head
              </button>
            )}
            <button className="cmp-foot-btn cmp-foot-btn-primary" onClick={shareCanvas} type="button">
              <span aria-hidden="true">↗</span> Share
            </button>
          </div>
        )}
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
          <button className="cvs-add" onClick={() => setPicking({ mode: 'add' })} type="button">
            <span className="cvs-add-plus" aria-hidden="true">+</span>
            <span className="cvs-add-hint">Add {noun}</span>
          </button>
        )}
      </div>

      <div className="cvs-main">
        {status === 'loading' && (
          <div className="cvs-panel cvs-panel-empty"><span className="cmp-spin" aria-hidden="true" />Building the canvas…</div>
        )}
        {status === 'error' && (
          <div className="cvs-panel cvs-panel-empty">Couldn’t load one of those. Try another pick.</div>
        )}
        {status === '' && canvas && <CanvasPanel canvas={canvas} />}
        {status === '' && picks.length < 2 && (
          <div className="cvs-panel cvs-panel-empty cvs-prompt">
            <span className="cvs-prompt-vs" aria-hidden="true">VS</span>
            Pin any two {noun}s to open the canvas — titles, wins, poles, points and more, side by side. Add a third or fourth to turn it into a shoot-out.
          </div>
        )}
      </div>

      {canvas && (
        <div className="cvs-tray">
          <span className="cvs-tray-lbl">Compare tray</span>
          <div className="cvs-tray-chips">
            {picks.map((p, i) => (
              <span className="cvs-chip" key={p.ref} style={{ '--cc': canvas.colors?.[i] || p.color }}>
                {tagOf(canvas.entities?.[i] || p)}
                <button className="cvs-chip-x" onClick={() => removeAt(i)} aria-label={`Remove ${p.name}`} type="button">✕</button>
              </span>
            ))}
            {picks.length < MAX && (
              <button className="cvs-chip cvs-chip-add" onClick={() => setPicking({ mode: 'add' })} type="button">+ Add {noun}</button>
            )}
          </div>
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

// ── faces ────────────────────────────────────────────────────────
function EntityFace({ kind, refId, color, name, sm }) {
  const [ok, setOk] = useState(true);
  const src = kind === 'team'
    ? `/images/teams/${LOGO_ALIAS[refId] || refId}.jpg`
    : `/images/drivers/${refId}.webp`;
  const cls = `cvs-face ${sm ? 'is-sm' : ''} ${kind === 'team' ? 'is-team' : ''}`;
  if (!ok || !refId) {
    const mono = (name || refId || '?').replace(/[^A-Za-z]/g, '').slice(0, sm ? 3 : 2).toUpperCase();
    return <span className={`${cls} is-mono`} style={{ '--cc': color }} aria-hidden="true">{mono}</span>;
  }
  return <img className={cls} style={{ '--cc': color }} src={src} alt="" loading="lazy" onError={() => setOk(false)} />;
}

// ── entity card (left rail) ──────────────────────────────────────
function EntityCard({ pick, kind, color, info, onReplace, onRemove }) {
  const display = info?.name || pick.name;
  const href = kind === 'team' ? `/teams/${pick.ref}/` : `/drivers/${pick.ref}/`;
  return (
    <div className="cvs-card" style={{ '--cc': color }}>
      <span className="cvs-card-rule" aria-hidden="true" />
      <button className="cvs-card-face-btn" onClick={onReplace} title={`Swap ${display}`} type="button">
        <EntityFace kind={kind} refId={pick.ref} color={color} name={pick.name} />
        <span className="cvs-card-swapover" aria-hidden="true"><SwapIcon /></span>
      </button>
      <div className="cvs-card-body">
        <a className="cvs-card-name" href={href}>{display}</a>
        <button className="cvs-card-swap" onClick={onReplace} type="button"><SwapIcon /> Swap</button>
      </div>
      <button className="cvs-card-x" onClick={onRemove} aria-label={`Remove ${display}`} type="button">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}

function SwapIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" className="cvs-swapicon">
      <path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
                const e = canvas.entities[i];
                const frac = max > 0 && val != null ? val / max : 0;
                const lead = m.leaders.length >= 1 && m.leaders.includes(i);
                const label = canvas.kind === 'team' ? e.name : surnameOf(e.name);
                return (
                  <div className={`cvs-bar ${lead ? 'is-lead' : ''}`} key={e.ref} style={{ '--cc': canvas.colors[i] }}>
                    <EntityFace kind={canvas.kind} refId={e.ref} color={canvas.colors[i]} name={e.name} sm />
                    <span className="cvs-track">
                      <span className="cvs-fill" style={{ width: live ? `${Math.max(frac * 100, val ? 2 : 0)}%` : '0%' }} />
                      <span className="cvs-bar-name">{label}</span>
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
