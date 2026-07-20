// DriverSectionShare — the "Share image" affordance mounted under each of the
// three driver-profile visual sections (Teammate Duels · Career Mosaic · Season
// Outcomes). A single button opens an export modal (aspect ratio + dark/light +
// live preview) with native Share / Download PNG / Copy actions — the same flow
// as Compare Mode and the Visualisation Explorer, drawing the section to a
// branded card via src/lib/driverShareCard.js.
//
//   <DriverSectionShare client:visible section="duels" driverRef="norris"
//     driverName="Lando Norris" payload={...} />

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { track } from '../../lib/analytics.js';
import {
  renderDriverCard, buildDriverBlob, driverShareFileName, DRIVER_SHARE_FORMATS,
} from '../../lib/driverShareCard.js';

export default function DriverSectionShare({ section, driverRef, driverName, payload }) {
  const [open, setOpen] = useState(false);
  const [fmt, setFmt] = useState('fit');
  const [light, setLight] = useState(false);
  // Mosaic tile order, read from the page toggle when the modal opens so the
  // exported card matches whichever order the user is looking at.
  const [order, setOrder] = useState('outcome');
  const [img, setImg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState('');
  const [toast, setToast] = useState('');

  const full = { ...payload, driverName, order };
  const shareTitle = `${driverName} · F1gures`;
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const shareEvent = (method) => track('driver_section_share', { method, section, driver: driverRef });

  function openShare() {
    if (typeof document !== 'undefined') {
      setLight(document.documentElement.classList.contains('light'));
      const grid = document.querySelector('.waffle-grid');
      setOrder(grid && grid.classList.contains('waffle-grid--chrono') ? 'chrono' : 'outcome');
    }
    setImg(null);
    setOpen(true);
    shareEvent('open');
  }
  function closeShare() { setOpen(false); setImg(null); }

  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(''), 1800); return () => clearTimeout(t); }, [toast]);

  // Re-render the preview whenever the modal opens or a format/theme changes.
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setBusy(true);
    setImg(null);
    renderDriverCard(section, full, { fmt, light })
      .then((url) => { if (alive) { setImg(url); setBusy(false); } })
      .catch(() => { if (alive) { setBusy(false); setToast('Preview failed'); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fmt, light]);

  // Escape closes; lock scroll while the modal is up.
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeShare(); } };
    window.addEventListener('keydown', onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey, true); document.body.style.overflow = prev; };
  }, [open]);

  async function onCopy() {
    if (action || !img) return; setAction('copy');
    try {
      const blob = await buildDriverBlob(section, full, { fmt, light });
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
        setToast('Image copied');
        shareEvent('copy_image');
      } else { throw new Error('no clipboard'); }
    } catch { setToast('Copy unsupported — use Download'); }
    setAction('');
  }

  async function onNativeShare() {
    if (action || !img) return; setAction('share');
    try {
      const blob = await buildDriverBlob(section, full, { fmt, light });
      const file = new File([blob], driverShareFileName(section, driverRef, fmt), { type: 'image/png' });
      const data = { title: shareTitle, text: shareTitle, url: window.location.href };
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ ...data, files: [file] }); shareEvent('web_share_file'); }
      else if (navigator.share) { await navigator.share(data); shareEvent('web_share'); }
      else { await navigator.clipboard.writeText(window.location.href); setToast('Link copied'); shareEvent('link_copy'); }
    } catch (e) { if (e && e.name !== 'AbortError') setToast('Share unavailable'); }
    setAction('');
  }

  const onDownload = () => { if (img) shareEvent('save_png'); };

  return (
    <div className="dv-share">
      <button type="button" className="cmp-foot-btn cmp-foot-btn-primary" onClick={openShare} title="Export a share image">↗ Share image</button>

      {open && typeof document !== 'undefined' && createPortal(
        <div className="cmp-share-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeShare(); }}>
          <div className="cmp-share-modal" role="dialog" aria-modal="true" aria-label="Share this section">
            <div className="cmp-share-head">
              <div className="cmp-share-title">Share image</div>
              <div className="cmp-share-segs">
                <div className="cmp-share-seg" role="group" aria-label="Aspect ratio">
                  {Object.entries(DRIVER_SHARE_FORMATS).map(([k, f]) => (
                    <button type="button" key={k} className={`cmp-share-opt${fmt === k ? ' is-active' : ''}`} onClick={() => setFmt(k)}>{f.label}</button>
                  ))}
                </div>
                <div className="cmp-share-seg" role="group" aria-label="Theme">
                  <button type="button" className={`cmp-share-opt${!light ? ' is-active' : ''}`} onClick={() => setLight(false)}>Dark</button>
                  <button type="button" className={`cmp-share-opt${light ? ' is-active' : ''}`} onClick={() => setLight(true)}>Light</button>
                </div>
              </div>
              <button type="button" className="cmp-share-close" onClick={closeShare} aria-label="Close">✕</button>
            </div>
            <div className={`cmp-share-preview cmp-share-preview-${fmt}`}>
              {img && <img src={img} alt="Share preview" />}
              {busy && <div className="cmp-share-busy">RENDERING…</div>}
            </div>
            <div className="cmp-share-foot">
              {toast && <span className="cmp-toast" role="status">{toast}</span>}
              {canNativeShare && (
                <button type="button" className="cmp-foot-btn cmp-foot-btn-primary cmp-share-grow" onClick={onNativeShare} disabled={!img || !!action}>
                  {action === 'share' ? '…' : '↗'} Share image
                </button>
              )}
              <a
                className={`cmp-foot-btn cmp-share-grow ${canNativeShare ? '' : 'cmp-foot-btn-primary'} ${img ? '' : 'is-disabled'}`}
                href={img || undefined}
                download={driverShareFileName(section, driverRef, fmt)}
                onClick={onDownload}
                aria-disabled={!img}
              >⤓ Download PNG</a>
              <button type="button" className="cmp-foot-btn" onClick={onCopy} disabled={!img || !!action}>{action === 'copy' ? '…' : '⧉'} Copy</button>
              <button type="button" className="cmp-foot-btn" onClick={closeShare}>Close</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
