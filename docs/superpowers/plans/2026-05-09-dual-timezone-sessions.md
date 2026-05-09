# Dual-Timezone Session Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a TRACK/YOU timezone toggle to the Next Race panel's session schedule, and re-target the countdown to the next non-passed session.

**Architecture:** Single-panel change in `NextRacePanel` ([HomeScreen.jsx](../../../src/components/islands/screens/HomeScreen.jsx)). New `CIRCUIT_TZ` map + `circuitTz()` helper in [shared.jsx](../../../src/lib/shared.jsx). State (`tzMode`) persisted to `localStorage.f1-tz`. Initial render is always TRACK so the prerendered HTML matches what hydration shows for users with no preference — no CLS, no flicker. `Intl.DateTimeFormat` does the conversion.

**Tech Stack:** React 18 islands, Astro 4 SSG, browser-native `Intl`. No new deps. No test framework in this repo — verification is dev-server (`npm run dev` → http://localhost:4321/) + manual + preview tools.

**Spec:** [docs/superpowers/specs/2026-05-09-dual-timezone-sessions-design.md](../specs/2026-05-09-dual-timezone-sessions-design.md)

---

## File map

- **Modify** `src/lib/shared.jsx` — add `CIRCUIT_TZ` map, `circuitTz()` and `zoneShort()` helpers near the existing `CIRCUIT_ID_ALIAS` block.
- **Modify** `src/components/islands/screens/HomeScreen.jsx` — `buildSessions(next)` becomes `buildSessions(next, zone)`; `NextRacePanel` gains `tzMode` state, toggle UI, next-session countdown logic, and zone caption.

That's the entire change surface. No new files.

---

## Task 1: Add CIRCUIT_TZ map and helpers to shared.jsx

**Files:**
- Modify: `src/lib/shared.jsx` — insert after line 96 (`useIsMobile` ends), before the "Date helpers" section that starts on line 98.

- [ ] **Step 1: Insert the timezone constants and helpers**

In `src/lib/shared.jsx`, between `useIsMobile` and `// ─── Date helpers ───`, add:

```jsx
// ─── Circuit timezones ────────────────────────────────────────
// IANA zone per circuitId (matches the circuitId field on calendar
// entries in public/data/<year>.json). Used by HomeScreen's session
// schedule toggle. Missing entries fall back to UTC so the panel
// never crashes on a circuit we forgot.
const CIRCUIT_TZ = {
  albert_park:    'Australia/Melbourne',
  shanghai:       'Asia/Shanghai',
  suzuka:         'Asia/Tokyo',
  miami:          'America/New_York',
  villeneuve:     'America/Toronto',
  monaco:         'Europe/Monaco',
  catalunya:      'Europe/Madrid',
  red_bull_ring:  'Europe/Vienna',
  silverstone:    'Europe/London',
  spa:            'Europe/Brussels',
  hungaroring:    'Europe/Budapest',
  zandvoort:      'Europe/Amsterdam',
  monza:          'Europe/Rome',
  madring:        'Europe/Madrid',
  baku:           'Asia/Baku',
  marina_bay:     'Asia/Singapore',
  americas:       'America/Chicago',
  rodriguez:      'America/Mexico_City',
  interlagos:     'America/Sao_Paulo',
  vegas:          'America/Los_Angeles',
  losail:         'Asia/Qatar',
  yas_marina:     'Asia/Dubai',
  bahrain:        'Asia/Bahrain',
  jeddah:         'Asia/Riyadh',
  imola:          'Europe/Rome',
};

export function circuitTz(circuitId) {
  return (circuitId && CIRCUIT_TZ[circuitId]) || 'UTC';
}

// Resolve the short timezone abbreviation (EDT, CEST, JST, …) for a
// given zone at a given moment. The moment matters because abbreviations
// flip with DST (EDT in summer, EST in winter).
export function zoneShort(zone, dt) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'short',
    }).formatToParts(dt);
    const part = parts.find(p => p.type === 'timeZoneName');
    return part ? part.value : '';
  } catch {
    return '';
  }
}
```

- [ ] **Step 2: Sanity-check exports**

Run:

```bash
node -e "import('./src/lib/shared.jsx').then(m => console.log(typeof m.circuitTz, typeof m.zoneShort, m.circuitTz('villeneuve'), m.circuitTz('bogus')))"
```

Expected: `function function America/Toronto UTC` (or similar). If Node can't import JSX, skip this step — the dev server will catch the error in Task 2.

- [ ] **Step 3: Commit**

```bash
git add src/lib/shared.jsx
git commit -m "feat(home): add circuit timezone map + helpers"
```

---

## Task 2: Make `buildSessions` timezone-aware

**Files:**
- Modify: `src/components/islands/screens/HomeScreen.jsx` lines 9–42 (the SESSION_LABELS / DAYS_SHORT consts and `buildSessions` function).

- [ ] **Step 1: Update imports**

In `src/components/islands/screens/HomeScreen.jsx`, change the existing import on lines 5–7 from:

```jsx
import {
  SectionHead, SprintBadge, Countdown, useIsMobile, urlFor, navigate, fmtDateLong,
} from '../../../lib/shared.jsx';
```

to:

```jsx
import {
  SectionHead, SprintBadge, Countdown, useIsMobile, urlFor, navigate, fmtDateLong,
  circuitTz, zoneShort,
} from '../../../lib/shared.jsx';
```

- [ ] **Step 2: Replace `DAYS_SHORT` and `buildSessions` with the timezone-aware version**

Delete lines 18 (`const DAYS_SHORT = ...`) and lines 20–42 (the old `buildSessions` function and its comment). Replace with:

```jsx
// Sessions come from public/data/<year>.json's calendar entries (date +
// HH:MM:SSZ time per session). Sprint weekends drop fp2/fp3 and gain
// sprintQuali + sprint. Both day-of-week and HH:MM are computed in the
// chosen IANA zone so a Friday session in Tokyo correctly becomes
// Thursday in Austin.
function buildSessions(next, zone) {
  const order = next.sprint
    ? ['fp1', 'sprintQuali', 'sprint', 'q', 'race']
    : ['fp1', 'fp2', 'fp3', 'q', 'race'];
  const dayFmt  = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: zone });
  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone,
  });
  const src = next.sessions;
  return order.map(id => {
    const s = src && src[id];
    if (!s || !s.date || !s.time) {
      return { id, name: SESSION_LABELS[id], day: '—', time: '—', dt: null };
    }
    const dt = new Date(`${s.date}T${s.time}`);
    return {
      id,
      name: SESSION_LABELS[id],
      day:  dayFmt.format(dt),
      time: timeFmt.format(dt),
      dt,
    };
  });
}
```

- [ ] **Step 3: Update the `buildSessions` call site temporarily**

`NextRacePanel` (line 110) currently calls `buildSessions(next)`. To keep the page rendering while we work, change it to pass UTC:

```jsx
const sessions = buildSessions(next, 'UTC');
```

This intentionally still shows UTC times — Task 3 wires up the actual toggle.

- [ ] **Step 4: Verify the dev server still renders**

The dev server is already running on http://localhost:4321/. Use the preview tools:

1. `preview_eval` with `window.location.reload()`.
2. `preview_console_logs` — expect no errors.
3. `preview_snapshot` — confirm the home page renders and the session table still shows 5 rows.

If errors appear, fix and retry. Do NOT proceed until clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/islands/screens/HomeScreen.jsx
git commit -m "refactor(home): make buildSessions timezone-aware"
```

---

## Task 3: Add tzMode state and toggle UI

**Files:**
- Modify: `src/components/islands/screens/HomeScreen.jsx` `NextRacePanel` (currently lines 101–160).

- [ ] **Step 1: Add `useState` and `useEffect` to the imports from React**

Line 4 currently reads:

```jsx
import { useMemo } from 'react';
```

Change to:

```jsx
import { useMemo, useState, useEffect } from 'react';
```

- [ ] **Step 2: Add tzMode state and userZone resolution at the top of `NextRacePanel`**

Inside `NextRacePanel`, immediately after `const D = data;` (line 102), insert:

```jsx
  const userZone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
    catch { return 'UTC'; }
  }, []);

  // Initial render is always 'track' so the prerendered HTML matches what
  // hydration shows for users with no saved preference. localStorage is
  // read in an effect after hydration to switch to 'user' when needed.
  const [tzMode, setTzMode] = useState('track');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('f1-tz');
      if (saved === 'user' || saved === 'track') setTzMode(saved);
    } catch { /* localStorage unavailable */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem('f1-tz', tzMode); }
    catch { /* localStorage unavailable */ }
  }, [tzMode]);

  const trackZone = circuitTz(next.circuitId);
  const activeZone = tzMode === 'user' ? userZone : trackZone;
```

- [ ] **Step 3: Switch `buildSessions` to use `activeZone`**

Find the line (introduced in Task 2) that reads `const sessions = buildSessions(next, 'UTC');` and change it to:

```jsx
  const sessions = buildSessions(next, activeZone);
```

- [ ] **Step 4: Replace the `Session Schedule` eyebrow with eyebrow + toggle**

Find this block in `NextRacePanel`:

```jsx
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 10 }}>Session Schedule</div>
          <div style={{ border: '1px solid var(--line-1)' }}>
```

Replace the eyebrow `<div>` (the line that says `Session Schedule`) and add the toggle. Final shape:

```jsx
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span className="t-eyebrow">Session Schedule</span>
            <div role="tablist" aria-label="Time zone"
                 style={{ display: 'inline-flex', border: '1px solid var(--line-1)' }}>
              {[['track', 'Track'], ['user', 'You']].map(([val, lbl]) => (
                <button key={val} role="tab" aria-selected={tzMode === val}
                  onClick={(e) => { e.stopPropagation(); setTzMode(val); }}
                  style={{
                    padding: '4px 10px',
                    fontFamily: 'var(--f-mono)',
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    cursor: 'pointer',
                    background: tzMode === val ? 'var(--accent)' : 'transparent',
                    color: tzMode === val ? '#fff' : 'var(--fg-2)',
                    border: 'none',
                  }}>{lbl}</button>
              ))}
            </div>
          </div>
          <div style={{ border: '1px solid var(--line-1)' }}>
```

`stopPropagation` is required because the parent `.panel` has an `onClick` that navigates to the race detail page; without it, clicking the toggle would navigate away.

- [ ] **Step 5: Verify in the browser**

Use the preview tools:

1. `preview_eval` with `window.location.reload()`.
2. `preview_snapshot` — confirm both `Track` and `You` segments are visible next to "Session Schedule", with `Track` highlighted.
3. `preview_click` on the `You` segment.
4. `preview_snapshot` — confirm `You` is now highlighted, the page did NOT navigate, and the session times changed (e.g. for the Canadian GP, `04:00 → 00:00` if your zone is e.g. EDT, or different depending on your zone).
5. `preview_eval` with `localStorage.getItem('f1-tz')` — expect `"user"`.
6. `preview_eval` with `window.location.reload()`, then `preview_snapshot` — `You` should remain highlighted after reload (persistence).
7. `preview_click` `Track` segment to reset, `preview_eval` to confirm `localStorage.getItem('f1-tz') === 'track'`.

If any step fails, fix and re-verify.

- [ ] **Step 6: Commit**

```bash
git add src/components/islands/screens/HomeScreen.jsx
git commit -m "feat(home): add TRACK/YOU timezone toggle to session schedule"
```

---

## Task 4: Add zone caption below the session table

**Files:**
- Modify: `src/components/islands/screens/HomeScreen.jsx` `NextRacePanel`.

- [ ] **Step 1: Compute `raceDt` once for zone abbreviation lookups**

Inside `NextRacePanel`, in the same block that contains the existing `target` `useMemo` (around lines 104–108), replace it with:

```jsx
  const raceDt = useMemo(() => {
    return next.date
      ? new Date(`${next.date}T${next.time || '14:00:00Z'}`)
      : new Date();
  }, [next.date, next.time]);
```

Then below it, leave `target` for the countdown — but Task 5 will replace `target` entirely. For now, add a `target = raceDt` alias so the existing countdown call doesn't break:

```jsx
  const target = raceDt;
```

- [ ] **Step 2: Add caption rendering below the session table**

Find the closing `</div>` of the session table (the one that ends `border: '1px solid var(--line-1)'` block — i.e. the `</div>` immediately following the `{sessions.map(...)}` block). After it, before the panel-closing tags, add:

```jsx
            <div className="t-mono" style={{
              fontSize: 11,
              color: 'var(--fg-3)',
              marginTop: 8,
              letterSpacing: '0.04em',
            }}>
              Track: {(D.circuits[next.circuit] && D.circuits[next.circuit].city) || '—'} ({zoneShort(trackZone, raceDt)})
              {' · '}
              You: {userZone} ({zoneShort(userZone, raceDt)})
            </div>
```

- [ ] **Step 3: Verify in the browser**

1. `preview_eval` with `window.location.reload()`.
2. `preview_snapshot` — caption appears below the table. Format matches `Track: <City> (<ZONE>) · You: <IANA> (<ZONE>)`.
3. `preview_click` on `You` segment, `preview_snapshot` — caption text doesn't change (it always shows both); only the table times change.

- [ ] **Step 4: Commit**

```bash
git add src/components/islands/screens/HomeScreen.jsx
git commit -m "feat(home): add track/user zone caption below session schedule"
```

---

## Task 5: Re-target countdown to next non-passed session

**Files:**
- Modify: `src/components/islands/screens/HomeScreen.jsx` `NextRacePanel`.

- [ ] **Step 1: Replace the `target = raceDt` alias with next-session logic**

In `NextRacePanel`, find the alias added in Task 4:

```jsx
  const target = raceDt;
```

Replace with:

```jsx
  // Countdown targets the earliest session whose start time is in the
  // future. If all sessions on the weekend have passed (race weekend
  // finishing today), fall through to the race itself (target = raceDt,
  // countdown reads 0). Recomputed when `sessions` changes (zone toggle
  // doesn't affect ordering — `dt` is the same Date — but `useMemo`
  // keeps this stable across renders).
  const nextSession = useMemo(() => {
    const nowMs = Date.now();
    const upcoming = sessions.find(s => s.dt && s.dt.getTime() > nowMs);
    return upcoming || sessions[sessions.length - 1] || null;
  }, [sessions]);
  const target = (nextSession && nextSession.dt) || raceDt;
```

- [ ] **Step 2: Add a caption above the Countdown showing the targeted session**

Find the `<Countdown target={target} />` line in `NextRacePanel`. Wrap it so the caption appears above:

```jsx
          {nextSession && nextSession.dt && (
            <div className="t-mono" style={{
              fontSize: 11,
              color: 'var(--fg-3)',
              letterSpacing: '0.04em',
              marginBottom: 6,
            }}>
              {nextSession.name} starts {nextSession.day} · {nextSession.time} {zoneShort(activeZone, nextSession.dt)}
            </div>
          )}
          <Countdown target={target} />
```

- [ ] **Step 3: Highlight the current target row in the schedule (optional polish)**

Find the schedule row map in `NextRacePanel`:

```jsx
            {sessions.map((s, i) => (
              <div key={s.id} style={{
                ...
                background: i === sessions.length - 1 ? 'rgba(232,0,45,0.04)' : 'transparent',
              }}>
```

Change the `background:` line to highlight the actual `nextSession` row instead of always the last row:

```jsx
                background: nextSession && s.id === nextSession.id ? 'rgba(232,0,45,0.04)' : 'transparent',
```

- [ ] **Step 4: Verify in the browser**

1. `preview_eval` with `window.location.reload()`.
2. `preview_snapshot` — countdown caption shows the next session (e.g. `Practice 1 starts Fri · 12:30 EDT` if Fri FP1 is in the future). The countdown numbers match the duration to that session.
3. The highlighted row in the schedule is the one named in the caption.
4. `preview_click` `You` segment, `preview_snapshot` — caption time updates to user-local zone, schedule highlight stays on the same session row.
5. `preview_click` `Track` segment to reset.

- [ ] **Step 5: Commit**

```bash
git add src/components/islands/screens/HomeScreen.jsx
git commit -m "feat(home): countdown targets next non-passed session"
```

---

## Task 6: Final verification + screenshot

- [ ] **Step 1: Full panel walkthrough**

1. `preview_eval` with `localStorage.removeItem('f1-tz'); window.location.reload();`
2. `preview_snapshot` — confirms TRACK is the default after a fresh visit.
3. Check the schedule shows track-local times (Canadian GP example: `04:00 UTC → 00:00 EDT` for the race row, day shifts from Sun to Sat for the race).
4. `preview_click` `You`, refresh, confirm persistence.
5. `preview_resize` to 375 wide, `preview_snapshot` — toggle and zone caption don't overflow; rows stay one-line. Resize back.
6. `preview_console_logs` — no errors.
7. `preview_screenshot` — capture the final state for the PR description.

- [ ] **Step 2: Verify across the year picker**

1. `preview_eval` with `window.location.search = '?year=2024'` then `preview_snapshot`. Past seasons render `SeasonAtGlance`, not `NextRacePanel` — the toggle code shouldn't even execute. Confirm no errors.
2. `preview_eval` to navigate back: `window.location.search = ''`.

- [ ] **Step 3: Confirm hydration parity**

The pre-hydration HTML must match what the default-TRACK hydrated panel shows. If they diverge, React logs a hydration warning to the console.

1. `preview_eval` with `localStorage.removeItem('f1-tz'); window.location.reload();`
2. `preview_console_logs` — expect zero `Hydration` warnings.

- [ ] **Step 4: No commit needed (no code changes), but report findings**

Summarise verification results in the PR description.

---

## Self-review checklist (run before declaring complete)

- [ ] Spec sections covered:
  - CIRCUIT_TZ map + circuitTz/zoneShort helpers → Task 1.
  - tzMode state + persistence → Task 3.
  - buildSessions timezone-aware → Task 2.
  - Toggle UI in eyebrow row → Task 3.
  - Zone caption below table → Task 4.
  - Next-session countdown + caption → Task 5.
  - Hydration parity, mobile, no-CLS → Task 6 verification.
- [ ] No `TBD`/`TODO`/placeholder text in any task — every step shows actual code.
- [ ] Function and prop names consistent across tasks: `circuitTz`, `zoneShort`, `tzMode`, `setTzMode`, `userZone`, `trackZone`, `activeZone`, `raceDt`, `nextSession`.
- [ ] Each commit is a coherent unit; no commit leaves the page broken.
