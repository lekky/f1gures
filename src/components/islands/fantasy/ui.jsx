// Small shared pieces every fantasy island uses: the auth bridge, the
// "not configured" notice, loading/error blocks, the lock countdown and the
// team dot. Nothing here talks to the network beyond what pb.js exposes.

import { useEffect, useMemo, useRef, useState } from 'react';
import { pb, fantasyConfigured, parseDate, formatRemaining, formatDateTime, teamColor } from './pb.js';

// ─── auth bridge ──────────────────────────────────────────────────────────
/** { user, ready } — re-renders on sign in / sign out / token refresh. */
export function useAuth() {
  const [state, setState] = useState({ user: null, ready: false });

  useEffect(() => {
    const client = pb();
    if (!client) {
      setState({ user: null, ready: true });
      return undefined;
    }
    const current = () => client.authStore.record || client.authStore.model || null;
    setState({ user: current(), ready: true });
    return client.authStore.onChange(() => setState({ user: current(), ready: true }));
  }, []);

  return state;
}

/** A ticking clock, for lock countdowns. `ms` = tick interval. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Load team colours for a season year once; returns a lookup map. */
export function useTeamMeta(year) {
  const [meta, setMeta] = useState({});
  useEffect(() => {
    if (!year) return undefined;
    let alive = true;
    import('./pb.js').then(({ loadTeamMeta }) =>
      loadTeamMeta(year).then((m) => {
        if (alive) setMeta(m);
      })
    );
    return () => {
      alive = false;
    };
  }, [year]);
  return meta;
}

// ─── blocks ───────────────────────────────────────────────────────────────
export function NotConfigured() {
  return (
    <div className="fx-notice">
      <div className="fx-notice-title">Fantasy isn’t configured on this build</div>
      <p>
        The game needs its PocketBase server. Once <code>pocketbaseUrl</code> is set in{' '}
        <code>src/data/fantasyConfig.js</code> (or <code>PUBLIC_FANTASY_PB_URL</code> is set at
        build time), the fantasy screens appear here.
      </p>
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="fx-loading" role="status">
      {label}
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <div className="fx-error" role="alert">
      {children}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="fx-empty">{children}</div>;
}

/** Guards an island: renders `fallback` while not configured or signed out. */
export function ConfigGate({ children }) {
  if (!fantasyConfigured()) return <NotConfigured />;
  return children;
}

// ─── round header + countdown ─────────────────────────────────────────────
/**
 * The one place `--accent` is spent on a fantasy screen: the live lock
 * countdown for the round you can still change.
 */
export function LockBar({ round, locked, note }) {
  const now = useNow(1000);
  const lockAt = parseDate(round?.lockAt);
  const remaining = lockAt ? lockAt.getTime() - now : 0;

  return (
    <div className={`fx-lockbar ${locked ? 'is-locked' : 'is-open'}`}>
      <div className="fx-lockbar-round">
        <span className="fx-lockbar-eyebrow">Round {round?.round ?? '—'}</span>
        <span className="fx-lockbar-name">{round?.name || 'No round scheduled'}</span>
        {round?.isSprint && <span className="pill pill-sprint">Sprint</span>}
      </div>
      <div className="fx-lockbar-clock">
        <span className="fx-lockbar-label">{locked ? 'Locked' : 'Locks in'}</span>
        <span className="fx-lockbar-value t-mono">
          {locked ? formatDateTime(round?.lockAt) : formatRemaining(remaining)}
        </span>
        {!locked && <span className="fx-lockbar-at">{formatDateTime(round?.lockAt)}</span>}
      </div>
      {note && <div className="fx-lockbar-note">{note}</div>}
    </div>
  );
}

// ─── atoms ────────────────────────────────────────────────────────────────
export function TeamDot({ meta, teamId, title }) {
  return (
    <span
      className="fx-team-dot"
      style={{ '--fx-team': teamColor(meta, teamId) }}
      title={title || teamId || ''}
      aria-hidden="true"
    />
  );
}

export function StartsLeft({ left, cap }) {
  if (!Number.isFinite(left)) return null;
  const state = left === 0 ? 'is-none' : left === 1 ? 'is-low' : '';
  return (
    <span className={`fx-starts ${state}`} title={`Starts left this season (cap ${cap})`}>
      <span className="t-mono">{left}</span>
      <span className="fx-starts-lbl">left</span>
    </span>
  );
}

/** A small labelled figure. Uses the site's `.stat` language without a new card. */
export function Figure({ label, value, sub }) {
  return (
    <div className="fx-figure">
      <div className="fx-figure-label">{label}</div>
      <div className="fx-figure-value t-mono">{value}</div>
      {sub && <div className="fx-figure-sub">{sub}</div>}
    </div>
  );
}

/** Clears the static children of a server-rendered mount point exactly once. */
export function useClearedMount(selector) {
  const [el, setEl] = useState(null);
  const done = useRef(false);
  useEffect(() => {
    if (!selector || typeof document === 'undefined') return;
    const node = document.querySelector(selector);
    if (!node) return;
    if (!done.current) {
      done.current = true;
      // These are the placeholder nodes the Astro page rendered; React never
      // owned them, so removing them before the portal commits is safe.
      Array.from(node.children).forEach((c) => c.remove());
    }
    setEl(node);
  }, [selector]);
  return el;
}

export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

export function useSeasonYear(season) {
  return useMemo(() => season?.year || null, [season]);
}
