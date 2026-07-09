// analytics.js — the single, guarded entry point for GA4 custom events.
//
// GA4 (gtag.js) is loaded PROD-only in BaseLayout.astro, where `window.gtag`
// is defined as a global. This helper is the ONLY thing islands should call to
// fire events — never touch `window.gtag` directly.
//
// It no-ops safely when gtag is absent, which is exactly what we want in three
// cases: dev builds (BaseLayout doesn't ship the tag), SSR (no `window`), and
// visitors running an ad-blocker. So callers never need their own guards.
//
// Event names + params follow GA4 convention: snake_case, and we lean on the
// recommended param names (`content_type`, `item_id`, `search_term`, `method`)
// where they fit so GA4's built-in reports light up. Never pass PII — entity
// refs and F1 search terms only, never free-text feedback or emails.

export function track(name, params = {}) {
  if (typeof window === 'undefined') return;
  if (typeof window.gtag !== 'function') return;
  try {
    window.gtag('event', name, params);
  } catch {
    /* analytics must never break the UI */
  }
}

// Per-keystroke inputs (listing search boxes) would flood GA with an event on
// every character. Debounce by a caller-supplied key so only the settled value
// is sent. Fire-and-forget — the timer is cleared on the next keystroke.
const _timers = {};
export function trackDebounced(key, name, params = {}, delay = 800) {
  if (typeof window === 'undefined') return;
  clearTimeout(_timers[key]);
  _timers[key] = setTimeout(() => track(name, params), delay);
}
