// useFocusTrap(ref, active, { returnTo }) — keyboard containment for the
// site's modals (chart explorer, share sheets). While `active`:
//   • focus moves into the dialog on open (the dialog node itself, which needs
//     tabIndex={-1} so its aria-labelledby title is announced; if focus is
//     already inside — e.g. a nested sheet just closed — it's left alone),
//   • Tab / Shift+Tab cycle inside the dialog,
//   • on close, focus returns to `returnTo.current` (the opener) or, failing
//     that, whatever was focused when the trap engaged.
// Escape handling stays with each caller — they already own it.
import { useEffect } from 'react';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusables(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') return false;
    // display:none / detached controls have no client rects
    return el.getClientRects().length > 0;
  });
}

function safeFocus(el) {
  if (!el || typeof el.focus !== 'function' || !document.contains(el)) return false;
  try { el.focus({ preventScroll: true }); } catch { el.focus(); }
  return true;
}

export function useFocusTrap(ref, active, { returnTo } = {}) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined;
    const node = ref.current;
    if (!node) return undefined;
    const prev = document.activeElement;
    if (!node.contains(prev)) safeFocus(node);

    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const list = focusables(node);
      if (!list.length) { e.preventDefault(); safeFocus(node); return; }
      const first = list[0];
      const last = list[list.length - 1];
      const cur = document.activeElement;
      const inside = node.contains(cur);
      if (e.shiftKey) {
        if (!inside || cur === first || cur === node) { e.preventDefault(); safeFocus(last); }
      } else if (!inside || cur === last) {
        e.preventDefault(); safeFocus(first);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const target = returnTo?.current;
      if (!safeFocus(target) && prev && prev !== document.body) safeFocus(prev);
    };
    // `returnTo` is a ref — read at cleanup time, not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, active]);
}
