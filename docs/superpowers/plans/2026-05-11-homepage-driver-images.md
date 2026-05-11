# Homepage Driver Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `DriverSilhouette` images to the SummaryWidget driver cards and the top-5 standings strip on the homepage.

**Architecture:** Single file change — `HomeScreen.jsx`. Import the existing `DriverSilhouette` component, wire it into `SummaryWidget` (when a driver is present) absolutely-positioned at the card's right edge, and add it above the driver name in each top-5 standings card. No new files, no CSS file changes.

**Tech Stack:** React 18, inline styles (matching existing `HomeScreen.jsx` patterns), existing `DriverSilhouette` from `src/lib/shared.jsx`.

---

## File Map

| File | Change |
|------|--------|
| `src/components/islands/screens/HomeScreen.jsx` | Add `DriverSilhouette` import; update `SummaryWidget`; update top-5 strip |

---

### Task 1: Add `DriverSilhouette` import

**Files:**
- Modify: `src/components/islands/screens/HomeScreen.jsx:6-8`

- [ ] **Step 1: Add the import**

Open `src/components/islands/screens/HomeScreen.jsx`. The existing import on line 6 is:

```js
import {
  SectionHead, SprintBadge, Countdown, useIsMobile, urlFor, navigate, fmtDateLong,
  circuitTz, zoneShort,
} from '../../../lib/shared.jsx';
```

Change it to:

```js
import {
  SectionHead, SprintBadge, Countdown, useIsMobile, urlFor, navigate, fmtDateLong,
  circuitTz, zoneShort, DriverSilhouette,
} from '../../../lib/shared.jsx';
```

- [ ] **Step 2: Verify the dev server compiles without error**

The dev server is already running at http://localhost:4321/. Check the terminal output — there should be no new errors. The homepage should still render identically (no visual change yet).

---

### Task 2: Update `SummaryWidget` with silhouette

**Files:**
- Modify: `src/components/islands/screens/HomeScreen.jsx` — `SummaryWidget` component (lines 73–104)

The `SummaryWidget` currently looks like this (relevant parts):

```jsx
function SummaryWidget({ data, kicker, driver, team, big, sub, href }) {
  const D = data;
  const accent = driver ? D.teamById(driver.team).color : (team ? team.color : 'var(--accent)');
  return (
    <a className="panel" style={{ borderLeft: `3px solid ${accent}`, cursor: 'pointer', textDecoration: 'none', color: 'inherit', display: 'block' }} href={href}>
      <div className="panel-body">
        <div className="t-eyebrow" style={{ color: 'var(--fg-3)', marginBottom: 8 }}>{kicker}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          {driver && ( ... )}
          {team && ( ... )}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderTop: '1px solid var(--line-1)', paddingTop: 10 }}>
          <div ...>{big}</div>
          <div ...>{sub}</div>
        </div>
      </div>
    </a>
  );
}
```

- [ ] **Step 1: Replace `SummaryWidget` with the updated version**

Replace the entire `SummaryWidget` function (lines 73–104) with:

```jsx
function SummaryWidget({ data, kicker, driver, team, big, sub, href, mob }) {
  const D = data;
  const accent = driver ? D.teamById(driver.team).color : (team ? team.color : 'var(--accent)');
  return (
    <a className="panel" style={{ borderLeft: `3px solid ${accent}`, cursor: 'pointer', textDecoration: 'none', color: 'inherit', display: 'block', position: 'relative', overflow: 'hidden' }} href={href}>
      {driver && (
        <div style={{ position: 'absolute', bottom: 0, right: 0, zIndex: 0, lineHeight: 0 }}>
          <DriverSilhouette data={D} driver={driver} height={mob ? 70 : 90} />
        </div>
      )}
      <div className="panel-body" style={{ position: 'relative', zIndex: 1 }}>
        <div className="t-eyebrow" style={{ color: 'var(--fg-3)', marginBottom: 8 }}>{kicker}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          {driver && (
            <>
              <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 30, lineHeight: 1, color: 'var(--fg-3)' }}>{driver.num}</div>
              <div>
                <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 22, lineHeight: 1, textTransform: 'uppercase' }}>{driver.first} {driver.last}</div>
                <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 2 }}>{driver.flag} {D.teamById(driver.team).name}</div>
              </div>
            </>
          )}
          {team && (
            <div>
              <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 22, lineHeight: 1, textTransform: 'uppercase' }}>{team.name}</div>
              <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 2 }}>{D.seasonYear || '2026'} Constructors</div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderTop: '1px solid var(--line-1)', paddingTop: 10 }}>
          <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 26, color: 'var(--fg-1)' }}>{big}</div>
          <div style={{ fontSize: 11, color: 'var(--fg-3)', textAlign: 'right' }}>{sub}</div>
        </div>
      </div>
    </a>
  );
}
```

- [ ] **Step 2: Pass `mob` to each `SummaryWidget` call site**

In the `HomeScreen` return (around lines 371–397), there are three `SummaryWidget` usages. Add `mob={mob}` to each one:

```jsx
<SummaryWidget data={D} kicker="Drivers' Leader"
  driver={leader.driver}
  big={`${leader.points} pts`}
  sub={`+${leader.points - p2.points} over ${p2.driver.last}`}
  href={urlFor({ name: 'driver', id: leader.driver.id, ref: leader.driver.jolpicaId })}
  mob={mob}
/>
<SummaryWidget data={D} kicker="Constructors' Leader"
  team={teamLeader.team}
  big={`${teamLeader.points} pts`}
  sub={`${teamLeader.wins} wins · ${teamLeader.podiums} podiums`}
  href={urlFor({ name: 'standings-c' })}
  mob={mob}
/>
{lastRace && lastWinner ? (
  <SummaryWidget data={D} kicker="Last Race"
    driver={lastWinner}
    big={`P1`}
    sub={`${lastRace.name.replace(' Grand Prix', '')} · ${lastWinnerTeam.name}`}
    href={urlFor({ name: 'race', year: D.seasonYear, round: lastRace.round })}
    mob={mob}
  />
) : (
  <SummaryWidget data={D} kicker="Last Race"
    big="-"
    sub="No results yet"
    mob={mob}
  />
)}
```

- [ ] **Step 3: Verify in browser**

Open http://localhost:4321/ — the "Drivers' Leader" and "Last Race" cards should now show a driver silhouette at the right edge, clipped by the card boundary. The "Constructors' Leader" card should be unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/components/islands/screens/HomeScreen.jsx
git commit -m "feat(home): add driver silhouette to SummaryWidget cards"
```

---

### Task 3: Add silhouette to top-5 standings strip

**Files:**
- Modify: `src/components/islands/screens/HomeScreen.jsx` — top-5 driver card block (around lines 404–420)

The current top-5 block looks like:

```jsx
<div className="grid" style={{ gridTemplateColumns: mob ? '1fr' : 'repeat(5, 1fr)' }}>
  {top5.map(row => (
    <a key={row.driver.id} className="driver-card"
       style={{ '--team-color': D.teamById(row.driver.team).color, textDecoration: 'none', color: 'inherit' }}
       href={urlFor({ name: 'driver', id: row.driver.id, ref: row.driver.jolpicaId })}>
      <div className={`pos pos-${row.position}`}>{row.position}</div>
      <div className="meta">
        <div className="name">{row.driver.last}</div>
        <div className="team">{D.teamById(row.driver.team).short} · {row.driver.flag}</div>
      </div>
      <div className="pts">
        <div className="pts-num">{row.points}</div>
        <div className="pts-lbl">PTS</div>
      </div>
    </a>
  ))}
</div>
```

- [ ] **Step 1: Add the silhouette above `.meta` in each card**

Replace the top-5 block with:

```jsx
<div className="grid" style={{ gridTemplateColumns: mob ? '1fr' : 'repeat(5, 1fr)' }}>
  {top5.map(row => (
    <a key={row.driver.id} className="driver-card"
       style={{ '--team-color': D.teamById(row.driver.team).color, textDecoration: 'none', color: 'inherit' }}
       href={urlFor({ name: 'driver', id: row.driver.id, ref: row.driver.jolpicaId })}>
      <div className={`pos pos-${row.position}`}>{row.position}</div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
        <DriverSilhouette data={D} driver={row.driver} height={80} />
      </div>
      <div className="meta">
        <div className="name">{row.driver.last}</div>
        <div className="team">{D.teamById(row.driver.team).short} · {row.driver.flag}</div>
      </div>
      <div className="pts">
        <div className="pts-num">{row.points}</div>
        <div className="pts-lbl">PTS</div>
      </div>
    </a>
  ))}
</div>
```

- [ ] **Step 2: Verify in browser**

Open http://localhost:4321/ — each of the 5 driver cards in the standings strip should show a silhouette centred above the driver's name. Fallback SVG outlines appear for any driver without a `.webp` image.

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/screens/HomeScreen.jsx
git commit -m "feat(home): add driver silhouette to top-5 standings strip"
```
