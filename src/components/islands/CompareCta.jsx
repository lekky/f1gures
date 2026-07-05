// CompareCta — the "Compare Mode" hero CTA on driver/team detail pages. Renders
// the fully-coloured Compare button, a grid-seeded rival picker (in a modal),
// and the animated VS overlay. All the reusable parts (picker body, comparison
// view, data loaders) live in compareShared.jsx and are also used by the
// standalone /compare/ launcher.
//
//   <CompareCta client:idle kind="driver" refId="hamilton" name="Lewis Hamilton" teamColor="#27F4D2" />
//
// The chosen rival is mirrored to ?vs=<ref> so any comparison is a shareable
// link and a deep-link opens straight into the overlay.

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { compareDrivers, compareTeams } from '../../lib/compareStats.js';
import {
  loadDoc, loadIndex, entryRef, entryColor, readableText, PickerBody, CompareView,
} from './compareShared.jsx';

export default function CompareCta({ kind = 'driver', refId, name, teamColor }) {
  const [mode, setMode] = useState('idle');   // idle | pick | overlay
  const [cmp, setCmp] = useState(null);
  const [status, setStatus] = useState('');    // '', 'loading', 'error'

  const open = mode === 'pick' || mode === 'overlay';

  // scroll-lock + Escape while any layer is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') closeAll(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const runCompare = useCallback((rref) => {
    setStatus('loading');
    setMode('overlay');
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

  function setVs(rref) {
    try {
      const url = new URL(window.location.href);
      if (rref) url.searchParams.set('vs', rref); else url.searchParams.delete('vs');
      window.history[rref ? 'pushState' : 'replaceState'](rref ? { vs: rref } : {}, '', url);
    } catch {}
  }
  function pick(rref) { setVs(rref); runCompare(rref); }
  function closeAll() { setVs(null); setMode('idle'); setCmp(null); setStatus(''); }
  function backToPick() { setVs(null); setCmp(null); setStatus(''); setMode('pick'); }

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
            <PickerBody kind={kind} excludeRef={refId} onPick={(r) => pick(r)} />
          </div>
        </div>,
        document.body
      )}

      {mode === 'overlay' && createPortal(
        <div className="cmp-back cmp-back-overlay" role="dialog" aria-modal="true" aria-label="Comparison"
             onMouseDown={(e) => { if (e.target === e.currentTarget) closeAll(); }}>
          {status === 'loading' || !cmp ? (
            <div className="cmp-panel cmp-panel-loading">
              {status === 'error'
                ? <div className="cmp-empty">Couldn’t load that comparison.</div>
                : <div className="cmp-empty"><span className="cmp-spin" aria-hidden="true" />Building the head-to-head…</div>}
              <button className="cmp-x cmp-x-abs" onClick={closeAll} aria-label="Close">✕</button>
            </div>
          ) : (
            <CompareView
              cmp={cmp} kind={kind} teamColor={teamColor} onClose={closeAll}
              footerLeft={<button className="cmp-foot-btn" onClick={backToPick}>↺ Change rival</button>}
            />
          )}
        </div>,
        document.body
      )}
    </>
  );
}
