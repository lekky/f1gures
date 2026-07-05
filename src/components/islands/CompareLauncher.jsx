// CompareLauncher — the standalone /compare/ experience. Two slots (A vs B), a
// Drivers/Teams toggle, and the shared CompareView rendered inline. State is
// mirrored to /compare/?type=&a=&b= so any head-to-head is a shareable link.
// Reuses everything from compareShared.jsx — no duplicated render or math.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { compareDrivers, compareTeams } from '../../lib/compareStats.js';
import {
  loadDoc, loadIndex, entryRef, entryName, entryColor, PickerBody, CompareView,
} from './compareShared.jsx';

export default function CompareLauncher() {
  const [type, setType] = useState('driver');   // 'driver' | 'team'
  const [a, setA] = useState(null);              // { ref, name, color }
  const [b, setB] = useState(null);
  const [cmp, setCmp] = useState(null);
  const [status, setStatus] = useState('');       // '', 'loading', 'error'
  const [picking, setPicking] = useState(null);   // 'a' | 'b' | null

  // deep-link: /compare/?type=&a=&b=
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get('type') === 'team' ? 'team' : 'driver';
    const ar = p.get('a'), br = p.get('b');
    if (!ar && !br) return;
    setType(t);
    loadIndex(t).then((list) => {
      const resolve = (ref) => {
        if (!ref) return null;
        const e = list.find((x) => entryRef(t, x) === ref);
        return e ? { ref, name: entryName(t, e), color: entryColor(t, e) } : { ref, name: ref, color: '#888' };
      };
      setA(resolve(ar)); setB(resolve(br));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // compute when both chosen
  useEffect(() => {
    if (!a || !b) { setCmp(null); setStatus(''); return; }
    let alive = true;
    setStatus('loading');
    Promise.all([loadDoc(type, a.ref), loadDoc(type, b.ref)])
      .then(([da, db]) => {
        if (!alive) return;
        const result = type === 'team' ? compareTeams(da, db) : compareDrivers(da, db);
        if (b.color && b.color[0] === '#' && !result.b.color) result.b.color = b.color;
        setCmp(result); setStatus('');
      })
      .catch(() => { if (alive) setStatus('error'); });
    return () => { alive = false; };
  }, [a, b, type]);

  // mirror to URL
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('type', type);
      if (a) url.searchParams.set('a', a.ref); else url.searchParams.delete('a');
      if (b) url.searchParams.set('b', b.ref); else url.searchParams.delete('b');
      window.history.replaceState({}, '', url);
    } catch {}
  }, [a, b, type]);

  // scroll-lock + Escape while the picker is open
  useEffect(() => {
    if (!picking) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setPicking(null); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [picking]);

  function chooseType(t) { if (t === type) return; setType(t); setA(null); setB(null); setCmp(null); }
  function onPick(ref, entry) {
    const chosen = { ref, name: entryName(type, entry), color: entryColor(type, entry) };
    if (picking === 'a') setA(chosen); else setB(chosen);
    setPicking(null);
  }

  const excludeRef = picking === 'a' ? (b && b.ref) : (a && a.ref);
  const noun = type === 'team' ? 'constructor' : 'driver';

  return (
    <div className="cmp-launch">
      <div className="cmp-seg" role="tablist" aria-label="Compare drivers or teams">
        <button role="tab" aria-selected={type === 'driver'} className={`cmp-seg-btn ${type === 'driver' ? 'is-on' : ''}`} onClick={() => chooseType('driver')}>Drivers</button>
        <button role="tab" aria-selected={type === 'team'} className={`cmp-seg-btn ${type === 'team' ? 'is-on' : ''}`} onClick={() => chooseType('team')}>Teams</button>
      </div>

      <div className="cmp-launch-slots">
        <Slot pick={a} noun={noun} onOpen={() => setPicking('a')} onClear={() => setA(null)} />
        <div className="cmp-launch-vs">VS</div>
        <Slot pick={b} noun={noun} onOpen={() => setPicking('b')} onClear={() => setB(null)} />
      </div>

      {status === 'loading' && (
        <div className="cmp-panel cmp-panel-loading"><div className="cmp-empty"><span className="cmp-spin" aria-hidden="true" />Building the head-to-head…</div></div>
      )}
      {status === 'error' && (
        <div className="cmp-panel cmp-panel-loading"><div className="cmp-empty">Couldn’t load that comparison. Try another pick.</div></div>
      )}
      {status === '' && cmp && (
        <CompareView cmp={cmp} kind={type}
          footerLeft={<button className="cmp-foot-btn" onClick={() => { setA(null); setB(null); }}>↺ New comparison</button>} />
      )}
      {status === '' && !cmp && (
        <div className="cmp-launch-hint">Pick two {noun}s to see the head-to-head: points, wins, poles, rates, season-by-season form and the rivalry between them.</div>
      )}

      {picking && createPortal(
        <div className="cmp-back" role="dialog" aria-modal="true" aria-label={`Choose a ${noun}`}
             onMouseDown={(e) => { if (e.target === e.currentTarget) setPicking(null); }}>
          <div className="cmp-picker">
            <div className="cmp-picker-head">
              <span className="cmp-picker-eyebrow">Choose a {noun}</span>
              <button className="cmp-x" onClick={() => setPicking(null)} aria-label="Close">✕</button>
            </div>
            <PickerBody kind={type} excludeRef={excludeRef} onPick={onPick} />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function Slot({ pick, noun, onOpen, onClear }) {
  if (!pick) {
    return (
      <button className="cmp-slot is-empty" onClick={onOpen}>
        <span className="cmp-slot-plus" aria-hidden="true">+</span>
        <span className="cmp-slot-hint">Choose {noun}</span>
      </button>
    );
  }
  return (
    <div className="cmp-slot">
      <span className="cmp-slot-strip" style={{ background: pick.color }} />
      <button className="cmp-slot-main" onClick={onOpen} title="Change">
        <span className="cmp-slot-name">{pick.name}</span>
        <span className="cmp-slot-change">Change</span>
      </button>
      <button className="cmp-slot-x" onClick={onClear} aria-label={`Clear ${noun}`}>✕</button>
    </div>
  );
}
