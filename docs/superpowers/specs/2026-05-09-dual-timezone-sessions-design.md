# Dual-timezone session schedule + next-session countdown

**Status:** approved 2026-05-09
**Scope:** [src/components/islands/screens/HomeScreen.jsx](../../../src/components/islands/screens/HomeScreen.jsx) `NextRacePanel` only.

## Problem

The "Next Race" panel on the home page shows session times in UTC. A user planning to watch needs to do the math twice - once to convert to track local (the F1-broadcast convention) and once to convert to their own clock. The countdown above the schedule targets the race start, ignoring the fact that practice and qualifying are usually what people are checking in on mid-week.

## Solution

Two related changes shipped together in one panel:

1. **Dual-timezone toggle** for the session-schedule table - `[ TRACK | YOU ]` segmented control, persists in `localStorage.f1-tz`. Both day-of-week and HH:MM are recomputed in the chosen zone.
2. **Countdown re-targeted to the next non-passed session.** When the page loads on Tuesday, it counts down to FP1, not to the race that's still 5 days away.

## UI

```
┌─────────────────────────────────────────────────────────────────────────┐
│  NEXT RACE  ───  ROUND 05/22  [SPRINT]                                  │
│                                                                         │
│  Canadian.                                                              │
│  🇨🇦  CIRCUIT GILLES VILLENEUVE  ·  SUN 24 MAY 2026                      │
│                                                                         │
│  ▸ Practice 1 starts Fri 22 May · 12:30 EDT                             │
│  ┌────┐┌────┐┌────┐┌────┐                                               │
│  │ 03 ││ 04 ││ 12 ││ 47 │                                               │
│  │Days││Hrs ││Min ││Sec │                                               │
│  └────┘└────┘└────┘└────┘                                               │
│                                                                         │
│                       SESSION SCHEDULE          [ TRACK | YOU ]         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ 01  PRACTICE 1         Fri    12:30                             │    │
│  │ 02  SPRINT QUALI       Fri    16:30                             │    │
│  │ 03  SPRINT             Sat    12:00                             │    │
│  │ 04  QUALIFYING         Sat    16:00                             │    │
│  │ 05  RACE               Sun    16:00                             │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│  Track: Montréal (EDT) · You: Europe/Amsterdam (CEST)                   │
└─────────────────────────────────────────────────────────────────────────┘
```

The toggle sits inside the existing `Session Schedule` eyebrow row, right-aligned. The caption line below the table shows the resolved zones, eyebrow-styled grey. The countdown gains a single caption line above it: `<Session> starts <Day DD Mon> · HH:MM <ZONE>`.

## Data

### `CIRCUIT_TZ` map

New constant in [src/lib/shared.jsx](../../../src/lib/shared.jsx), placed next to `CIRCUIT_ID_ALIAS`:

```js
const CIRCUIT_TZ = {
  albert_park: 'Australia/Melbourne',
  shanghai:    'Asia/Shanghai',
  suzuka:      'Asia/Tokyo',
  miami:       'America/New_York',
  villeneuve:  'America/Toronto',
  monaco:      'Europe/Monaco',
  catalunya:   'Europe/Madrid',
  red_bull_ring: 'Europe/Vienna',
  silverstone: 'Europe/London',
  spa:         'Europe/Brussels',
  hungaroring: 'Europe/Budapest',
  zandvoort:   'Europe/Amsterdam',
  monza:       'Europe/Rome',
  madring:     'Europe/Madrid',
  baku:        'Asia/Baku',
  marina_bay:  'Asia/Singapore',
  americas:    'America/Chicago',
  rodriguez:   'America/Mexico_City',
  interlagos:  'America/Sao_Paulo',
  vegas:       'America/Los_Angeles',
  losail:      'Asia/Qatar',
  yas_marina:  'Asia/Dubai',
  // historic/edge
  bahrain:     'Asia/Bahrain',
  jeddah:      'Asia/Riyadh',
  imola:       'Europe/Rome',
};

export function circuitTz(circuitId) {
  return CIRCUIT_TZ[circuitId] || 'UTC';
}
```

Keys match the `circuitId` field already present on each calendar entry. Missing entries fall back to `'UTC'` so the panel never crashes on a circuit we forgot.

### State shape

`NextRacePanel` gains:

```js
const userZone = useMemo(() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch { return 'UTC'; }
}, []);

const [tzMode, setTzMode] = useState('track');   // 'track' | 'user'
useEffect(() => {
  const saved = localStorage.getItem('f1-tz');
  if (saved === 'user' || saved === 'track') setTzMode(saved);
}, []);
useEffect(() => { localStorage.setItem('f1-tz', tzMode); }, [tzMode]);

const activeZone = tzMode === 'user' ? userZone : circuitTz(next.circuitId);
```

Initial render is always `'track'` - deterministic, SSR-safe, matches the prerendered HTML byte-for-byte. Hydration reads `localStorage.f1-tz` and switches if needed. Users with no saved preference stay on track.

### `buildSessions` becomes timezone-aware

Replace the current UTC slice with `Intl.DateTimeFormat`:

```js
function buildSessions(next, zone) {
  const order = next.sprint
    ? ['fp1', 'sprintQuali', 'sprint', 'q', 'race']
    : ['fp1', 'fp2', 'fp3', 'q', 'race'];
  const dayFmt  = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: zone });
  const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone });
  return order.map(id => {
    const s = next.sessions && next.sessions[id];
    if (!s || !s.date || !s.time) return { id, name: SESSION_LABELS[id], day: '-', time: '-', dt: null };
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

`dt` is preserved on each row so the countdown logic can pick the next-future session without re-parsing.

### Next-session countdown

Replace the current "always race" target:

```js
const sessions = buildSessions(next, activeZone);
const nextSession = useMemo(() => {
  const nowMs = Date.now();
  return sessions.find(s => s.dt && s.dt.getTime() > nowMs)
      || sessions[sessions.length - 1];   // fall back to race even if past
}, [sessions]);
const target = nextSession.dt || new Date();
```

The countdown caption renders `nextSession.name` + day + time in `activeZone`. `Countdown` itself is unchanged - it takes a `Date`, the duration math is timezone-invariant.

**SSR consistency note:** `Date.now()` differs between build time and render time, so `nextSession` may pick a different session at SSR vs hydration. That's the same pattern the panel already accepts for the countdown numbers (they're always wrong in the prerendered HTML and corrected on hydration). The session row pinned as "current" gets the existing red highlight applied to whichever `nextSession.id` resolves at render time.

### Zone caption

```js
function zoneShort(zone, dt) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' })
      .formatToParts(dt).find(p => p.type === 'timeZoneName')?.value || '';
  } catch { return ''; }
}
```

Track caption uses the circuit's `city` (`D.circuits[next.circuit].city`, already populated) plus `zoneShort(circuitTz(...), raceDt)`. User caption uses the IANA zone name plus `zoneShort(userZone, raceDt)`. The `raceDt` reference passed in ensures the abbreviation reflects the correct DST state for the race weekend (EDT vs EST).

## Toggle component

Inline in `NextRacePanel`, no new file. Two `<button>`s wrapped in a `display: flex; border: 1px solid var(--line-1)` pill. Active button gets `background: var(--accent); color: #fff`. Inactive is transparent with `var(--fg-2)` text. ~25 lines including styles.

```jsx
<div role="tablist" aria-label="Time zone" style={{ display: 'inline-flex', border: '1px solid var(--line-1)', borderRadius: 0 }}>
  {[
    ['track', 'Track'],
    ['user',  'You'],
  ].map(([val, lbl]) => (
    <button key={val} role="tab" aria-selected={tzMode === val}
      onClick={(e) => { e.stopPropagation(); setTzMode(val); }}
      style={{
        padding: '4px 10px', fontFamily: 'var(--f-mono)', fontSize: 11,
        textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer',
        background: tzMode === val ? 'var(--accent)' : 'transparent',
        color: tzMode === val ? '#fff' : 'var(--fg-2)',
        border: 'none',
      }}>{lbl}</button>
  ))}
</div>
```

`stopPropagation` is required because the parent panel has an `onClick` that navigates to the race detail page. Without it, clicking the toggle navigates away.

## Out of scope

- **Race-page session schedule** - `RacePage.astro` doesn't render a schedule today; not adding one here.
- **Calendar listing rows** - the calendar page shows date-only per round, no per-session times.
- **`fmtDateLong(next.date)` in panel header** - F1 calendars conventionally label a race by its UTC-stored date even when the local-Saturday-night convention would disagree (Vegas). Changing this opens a separate question; out of scope.
- **Per-user zone selector** - auto-detected via `Intl`. No UI to override.
- **Driver/Constructor standings or other panels** - no time-of-day data, nothing to toggle.

## Edge cases

- **Empty bundle** (`D._empty`): `EmptyHome` is rendered before `NextRacePanel`, so none of this code runs. No change needed.
- **Historic season** (no upcoming race): `SeasonAtGlance` is rendered instead of `NextRacePanel`. Untouched.
- **Year picker swap to a past year**: `next` is `null`, the panel doesn't render. No regression.
- **Circuit missing from `CIRCUIT_TZ`**: falls back to `'UTC'`, panel shows UTC times labelled as "track". The `circuit` field is logged once via `console.warn` on hydration so we notice (dev-mode only - `import.meta.env.DEV`).
- **`Intl` unavailable** (very old browsers): caught by the `try/catch` around `Intl.DateTimeFormat`; user zone falls back to `'UTC'` and the toggle effectively becomes a no-op. Site still renders.
- **All sessions in the past** (race weekend has finished but the next-race finder still returned this round because the Sunday race is "today or later" by date): `nextSession` falls through to the race itself, countdown reads `0`. Acceptable - same as today.

## Verification

1. `npm run dev`, open `/`. Schedule shows track times by default. Toggle to YOU, refresh - preference persists. Toggle back to TRACK.
2. Set `localStorage.f1-tz = 'user'` in devtools, hard refresh. After hydration, schedule shows local times.
3. With system TZ set to a non-EU zone (`TZ=America/Los_Angeles`), check Canadian GP rows: TRACK shows EDT (UTC−4), YOU shows PDT (UTC−7). Day-of-week shifts where the time crosses midnight.
4. Countdown caption matches the first non-passed session row's day+time.
5. Click anywhere on the panel except the toggle - still navigates to `/races/2026/5/`. Click the toggle - panel does not navigate.
6. Mobile (Chrome devtools, 375px): toggle and zone caption don't overflow; schedule rows stay one-line.
7. Lighthouse: no CLS regression - initial paint shows the same TRACK markup as the prerendered HTML.
