# Warm Light Theme + Banded Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recolour the light theme to a warm cream palette site-wide, and rebuild the homepage as full-bleed alternating "bands" (reusing existing card components) plus a new dark "Form Guide" ticker.

**Architecture:** Part A is a pure CSS token remap inside `html.light` — same token names, so every page inherits it with no component edits. Part B restructures only `HomeScreen.jsx` into `<section class="home-band">` wrappers (the Astro shell already renders the home island as a direct child of `.f1-app` with no max-width wrapper, so bands go full-bleed), reusing `NextRacePanel`/`SeasonAtGlance`/`SummaryWidget`/`.card-accent` unchanged, adding one shared `SectionHead` variant and one new `FormGuide` ticker component.

**Tech Stack:** Astro 4 SSG, React 18 islands, plain CSS custom properties. No test framework applies to visual CSS/layout — verification is via the dev server in both themes plus `npm run build`. (The repo's vitest covers only `src/lib/` and `scripts/records/`; this change touches neither's tested surface, so forcing unit tests here would be YAGNI.)

**Worktree:** `C:/Users/rotsm/f1gures/.claude/worktrees/warm-home` (branch `feat/warm-home`, off `origin/main`). `npm install` already run. All commands below run from the worktree root.

**Spec:** `docs/superpowers/specs/2026-06-08-warm-light-theme-banded-homepage-design.md`

---

## File map

- **Modify** `public/css/app.css`
  - `html.light { … }` token block → warm values (Task 1)
  - `html.light .nav/.botnav/.topbar-mobile` rgba → warm (Task 1)
  - `:root` → add `--band-ink*` tokens (Task 2)
  - new `HOME BANDS` CSS section (Task 2)
  - `.section-head` band variant CSS (Task 3)
  - new `FORM GUIDE` CSS section (Task 4)
- **Modify** `src/lib/shared.jsx` — `SectionHead` gains optional `variant` prop (Task 3)
- **Modify** `src/components/islands/screens/HomeScreen.jsx` — `Band` wrapper + restructured root (Task 2), band headers (Task 3), `FormGuide` component (Task 4)

---

## Task 1: Warm light palette (Part A)

**Files:**
- Modify: `public/css/app.css` (the `html.light` block, lines ~68–101)

- [ ] **Step 1: Remap the `html.light` token values**

In `public/css/app.css`, replace the existing token values inside `html.light {` (currently `--bg-0: #eeeef2;` … `--fg-4: #9a9ba6;`) with the warm set. Replace ONLY these lines; leave `--accent-glow`, `--pos`, `--neg`, `--warn` as they are.

```css
html.light {
  --bg-0: #e7e5de;
  --bg-1: #f0eee9;
  --bg-2: #ffffff;
  --bg-3: #ebe7df;
  --bg-hover: #e7e2d8;
  --bg-elevated: #ffffff;
  --line-1: #e1ded6;
  --line-2: #cbc7bb;
  --line-3: #b4afa1;
  --fg-1: #0d0e12;
  --fg-2: #3d3e48;
  --fg-3: #84857f;
  --fg-4: #ada99e;
  --accent-glow: rgba(232, 0, 45, 0.10);
  --pos: #15803d;
  --neg: #dc2626;
  --warn: #b45309;
}
```

- [ ] **Step 2: Warm the hardcoded light-chrome rgba values**

Still in `public/css/app.css`, update the three light-chrome backgrounds that predate the token system (they currently use `rgba(245, 245, 248, …)`):

```css
html.light .nav {
  background: rgba(240, 238, 233, 0.92);
  border-bottom-color: var(--line-1);
}
html.light .botnav {
  background: rgba(240, 238, 233, 0.96);
  border-top-color: var(--line-1);
}
html.light .topbar-mobile {
  background: rgba(240, 238, 233, 0.96);
  border-bottom-color: var(--line-1);
}
```

- [ ] **Step 3: Verify the build is not broken**

Run: `npm run build`
Expected: completes without CSS errors (full prebuild + Astro build). If it fails on a stale `dist/` module-not-found, run `rm -rf dist && npm run build` (per CLAUDE.md).

- [ ] **Step 4: Visual check in both themes**

Start the dev server (`npm run dev`, port per the user's worktree convention — ask which port if unsure) and load `/`. Toggle the theme. Confirm in light: page is cream (`#f0eee9`), white cards lift off it, hairlines read warm-grey not blue-grey. Confirm dark is unchanged. Spot-check one detail page (e.g. `/drivers/norris/`) in light theme — warm palette should read well site-wide, nothing should look broken where the old cool greys were assumed.

- [ ] **Step 5: Commit**

```bash
git add public/css/app.css
git commit -m "$(printf 'feat(theme): warm the light palette site-wide\n\nRemap html.light tokens from cool blue-grey to warm cream (#f0eee9\npage, warm tint + hairlines), per the amended home mockup. Same token\nnames so all pages inherit it; dark theme untouched.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: Band layout shell + restructured homepage (Part B core)

**Files:**
- Modify: `public/css/app.css` (`:root` tokens; new `HOME BANDS` section)
- Modify: `src/components/islands/screens/HomeScreen.jsx` (add `Band`, restructure root)

- [ ] **Step 1: Add the constant-dark band tokens to `:root`**

In `public/css/app.css`, inside `:root { … }` near the `/* Surfaces */` group, add (these are deliberately NOT overridden in `html.light` — the Form Guide band is constant-dark by design in both themes):

```css
  /* Form Guide / ink band - constant dark in BOTH themes (no html.light override) */
  --band-ink: #0c0c0d;
  --band-ink-line: #232327;
  --band-ink-fg: #cfcfd4;
  --band-ink-fg-dim: #7c7c82;
```

- [ ] **Step 2: Add the band layout CSS**

In `public/css/app.css`, after the `PAGE / LAYOUT` section (after the `.page-sub` rule, ~line 308), add:

```css
/* ============================================================
   HOME BANDS - full-bleed alternating sections (homepage only)
   ============================================================ */
.home-band { width: 100%; border-bottom: 1px solid var(--line-1); }
.home-band-plain { background: var(--bg-1); }
.home-band-tint  { background: var(--bg-0); }
.home-band-inner { max-width: 1280px; margin: 0 auto; padding: 40px 20px; }
.home-band-inner-mob { padding: 20px 14px; }
/* Last band clears the mobile bottom nav. */
.home-mob .home-band:last-child .home-band-inner-mob { padding-bottom: 28px; }
@media (max-width: 720px) {
  .home-band-inner { padding: 20px 14px; }
}
```

- [ ] **Step 3: Add the `Band` helper to `HomeScreen.jsx`**

In `src/components/islands/screens/HomeScreen.jsx`, add this component above `export default function HomeScreen` (after the `SeasonAtGlance` definition):

```jsx
function Band({ tone = 'plain', mob, children }) {
  // tone: 'plain' (page bg) | 'tint' (recessed bg)
  return (
    <section className={`home-band home-band-${tone}`}>
      <div className={`home-band-inner ${mob ? 'home-band-inner-mob' : ''}`}>
        {children}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Restructure the `HomeScreen` return into bands**

In `src/components/islands/screens/HomeScreen.jsx`, replace the entire returned JSX of `HomeScreen` (the `return ( <div className={`page ${mob ? 'page-mob' : ''}`}> … </div> )` block) with the banded structure below. Keep every child's internals exactly as they were — only the wrappers change. (`EmptyHome`'s early return is untouched.)

```jsx
  return (
    <div className={mob ? 'home-mob' : ''}>
      <Band tone="plain" mob={mob}>
        {isHistoric || !next
          ? <SeasonAtGlance data={D} cal={cal} standings={standings} mob={mob} />
          : <NextRacePanel data={D} cal={cal} next={next} mob={mob} />}
      </Band>

      <Band tone="tint" mob={mob}>
        <SectionHead title="Season Summary" />
        <div className="grid" style={{ gridTemplateColumns: mob ? '1fr' : 'repeat(3, 1fr)' }}>
          <SummaryWidget data={D} kicker="Drivers' Leader"
            driver={leader.driver}
            big={`${leader.points} pts`}
            sub={`+${leader.points - p2.points} over ${p2.driver.last}`}
            href={urlFor({ name: 'driver', id: leader.driver.id, ref: leader.driver.jolpicaId })}
          />
          <SummaryWidget data={D} kicker="Constructors' Leader"
            team={teamLeader.team}
            big={`${teamLeader.points} pts`}
            sub={`${teamLeader.wins} wins · ${teamLeader.podiums} podiums`}
            href={urlFor({ name: 'standings-c' })}
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
        </div>
      </Band>

      <FormGuide data={D} mob={mob} />

      <Band tone="plain" mob={mob}>
        <SectionHead title="Top 3 · Drivers" right={
          <a className="btn btn-ghost btn-sm" href={urlFor({ name: 'standings-d' })}>
            View Full Standings <span className="arrow">→</span>
          </a>
        } />
        {driversBlurb && (
          <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--fg-2)', maxWidth: 780, marginBottom: 14 }}>
            {driversBlurb}
          </p>
        )}
        <div className="records-grid">
          {top3Drivers.map(row => {
            const team = D.teamById(row.driver.team);
            const recent = recentRounds.map(r => driverPointsForRound(D, row.driver.id, r.round));
            const maxPts = Math.max(...top3Drivers.map(r => r.points), 1);
            return (
              <a key={row.driver.id}
                 className="card-accent"
                 href={urlFor({ name: 'driver', id: row.driver.id, ref: row.driver.jolpicaId })}
                 style={{ '--card-accent': team.color }}>
                <header className="card-accent-head">
                  <span className="card-accent-eyebrow">P{row.position} · {team.name}</span>
                  <span className="card-accent-arrow" aria-hidden="true">↗</span>
                </header>

                <div className="card-accent-value">
                  <span className="card-accent-num">{row.points}</span>
                  <span className="card-accent-unit">pts</span>
                </div>

                <div className="card-accent-holder">
                  <div className="card-accent-avatar card-accent-avatar-image" style={{ lineHeight: 0 }}>
                    <DriverSilhouette data={D} driver={row.driver} height={48} />
                  </div>
                  <div className="card-accent-holder-text">
                    <div className="card-accent-holder-name">
                      <Flag cc={row.driver.country} flag={row.driver.flag} className="card-accent-flag" />
                      <span>{row.driver.first} {row.driver.last}</span>
                    </div>
                    <div className="card-accent-holder-ctx">
                      #{row.driver.num} · {row.wins} {row.wins === 1 ? 'WIN' : 'WINS'} · {row.podiums} {row.podiums === 1 ? 'PODIUM' : 'PODIUMS'}
                    </div>
                  </div>
                </div>

                <ol className="card-bars">
                  {top3Drivers.map((peer, i) => {
                    const peerTeam = D.teamById(peer.driver.team);
                    const width = (peer.points / maxPts) * 100;
                    const isLead = peer.driver.id === row.driver.id;
                    return (
                      <li key={peer.driver.id} className={`card-bar${isLead ? ' card-bar-lead' : ''}`}>
                        <span className="card-bar-rank">{i + 1}</span>
                        <span className="card-bar-cc">
                          <Flag cc={peer.driver.country} flag={peer.driver.flag} className="card-bar-flag" />
                        </span>
                        <div className="card-bar-track">
                          <span className="card-bar-fill" style={{ width: `${width}%`, background: peerTeam.color }}></span>
                          <span className="card-bar-name">{peer.driver.last}</span>
                        </div>
                        <span className="card-bar-value">
                          <span className="card-bar-num">{peer.points}</span>
                          <span className="card-bar-unit"> pts</span>
                        </span>
                      </li>
                    );
                  })}
                </ol>

                {!mob && recent.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 4 }}>
                    <span className="t-mono" style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Last {recent.length} rounds</span>
                    <MiniChart values={recent} color={team.color} width={120} height={26} />
                  </div>
                )}
              </a>
            );
          })}
        </div>
      </Band>

      <Band tone="tint" mob={mob}>
        <SectionHead title="Top 3 · Constructors" right={
          <a className="btn btn-ghost btn-sm" href={urlFor({ name: 'standings-c' })}>
            View Full Standings <span className="arrow">→</span>
          </a>
        } />
        {teamsBlurb && (
          <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--fg-2)', maxWidth: 780, marginBottom: 14 }}>
            {teamsBlurb}
          </p>
        )}
        <div className="records-grid">
          {top3Teams.map(row => {
            const team = row.team;
            const recent = recentRounds.map(r => teamPointsForRound(D, team.id, r.round));
            const maxPts = Math.max(...top3Teams.map(r => r.points), 1);
            return (
              <a key={team.id}
                 className="card-accent"
                 href={urlFor({ name: 'team', id: team.id, ref: team.id })}
                 style={{ '--card-accent': team.color }}>
                <header className="card-accent-head">
                  <span className="card-accent-eyebrow">P{row.position} · CONSTRUCTORS</span>
                  <span className="card-accent-arrow" aria-hidden="true">↗</span>
                </header>

                <div className="card-accent-value">
                  <span className="card-accent-num">{row.points}</span>
                  <span className="card-accent-unit">pts</span>
                </div>

                <div className="card-accent-holder">
                  <div className="card-accent-avatar card-accent-avatar-image" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <TeamLogo team={team} size={44} />
                  </div>
                  <div className="card-accent-holder-text">
                    <div className="card-accent-holder-name"><span>{team.name}</span></div>
                    <div className="card-accent-holder-ctx">
                      {row.wins} {row.wins === 1 ? 'WIN' : 'WINS'} · {row.podiums} {row.podiums === 1 ? 'PODIUM' : 'PODIUMS'}
                    </div>
                  </div>
                </div>

                <ol className="card-bars">
                  {top3Teams.map((peer, i) => {
                    const width = (peer.points / maxPts) * 100;
                    const isLead = peer.team.id === team.id;
                    return (
                      <li key={peer.team.id} className={`card-bar${isLead ? ' card-bar-lead' : ''}`}>
                        <span className="card-bar-rank">{i + 1}</span>
                        <span className="card-bar-cc"></span>
                        <div className="card-bar-track">
                          <span className="card-bar-fill" style={{ width: `${width}%`, background: peer.team.color }}></span>
                          <span className="card-bar-name">{peer.team.name}</span>
                        </div>
                        <span className="card-bar-value">
                          <span className="card-bar-num">{peer.points}</span>
                          <span className="card-bar-unit"> pts</span>
                        </span>
                      </li>
                    );
                  })}
                </ol>

                {!mob && recent.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 4 }}>
                    <span className="t-mono" style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Last {recent.length} rounds</span>
                    <MiniChart values={recent} color={team.color} width={120} height={26} />
                  </div>
                )}
              </a>
            );
          })}
        </div>
      </Band>
    </div>
  );
```

NOTE: `FormGuide` is referenced here but defined in Task 4. Between Task 2 and Task 4 the build will fail on an undefined `FormGuide`. To keep Task 2 independently green, temporarily add a stub above `HomeScreen` and delete it in Task 4:

```jsx
function FormGuide() { return null; } // TEMP stub - replaced in Task 4
```

- [ ] **Step 5: Verify the build passes (with stub)**

Run: `npm run build`
Expected: completes. The homepage now renders bands; the Form Guide slot is empty (stub).

- [ ] **Step 6: Visual check**

Dev server → `/`. Confirm: full-width alternating bands (cream hero → tint summary → empty gap → cream drivers → tint constructors), content centered at 1280px, hero/summary/top-3 internals unchanged. Toggle dark — bands differentiate via `--bg-1` vs `--bg-0`. Resize to ≤720px — bands stack, padding tightens, content clears the bottom nav.

- [ ] **Step 7: Commit**

```bash
git add public/css/app.css src/components/islands/screens/HomeScreen.jsx
git commit -m "$(printf 'feat(home): full-bleed banded layout\n\nWrap homepage sections in alternating full-width bands (plain/tint)\nwith a centered inner. Reuses NextRacePanel/SeasonAtGlance/\nSummaryWidget/.card-accent unchanged. Adds --band-ink* tokens and a\ntemp FormGuide stub (filled in next commit).\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: Bolder band section headers

**Files:**
- Modify: `src/lib/shared.jsx` (`SectionHead`)
- Modify: `public/css/app.css` (`.section-head` band variant)
- Modify: `src/components/islands/screens/HomeScreen.jsx` (pass `variant="band"`)

- [ ] **Step 1: Add the `variant` prop to `SectionHead`**

In `src/lib/shared.jsx`, replace the existing `SectionHead` (lines ~213–221) with:

```jsx
export function SectionHead({ title, right, variant }) {
  const cls = variant === 'band' ? 'section-head section-head-band' : 'section-head';
  return (
    <div className={cls}>
      {variant === 'band' && <span className="section-head-mark" aria-hidden="true"></span>}
      <h2>{title}</h2>
      <div className="section-rule"></div>
      {right}
    </div>
  );
}
```

Default rendering (no `variant`) is byte-identical to before, so other screens are unaffected.

- [ ] **Step 2: Add the band-variant CSS**

In `public/css/app.css`, immediately after the `.section-head .section-rule` rule (~line 323), add:

```css
/* Band variant - bolder header for the full-bleed homepage bands. */
.section-head-band { margin-top: 0; gap: 14px; }
.section-head-band .section-head-mark {
  width: 13px; height: 13px; background: var(--accent); flex-shrink: 0;
}
.section-head-band h2 { font-size: 21px; letter-spacing: 0.1em; font-weight: 800; }
.section-head-band .section-rule { height: 2px; background: var(--line-2); }
```

- [ ] **Step 3: Pass `variant="band"` on the homepage headers**

In `src/components/islands/screens/HomeScreen.jsx`, add `variant="band"` to all three `SectionHead` usages inside the bands:

- `<SectionHead title="Season Summary" />` → `<SectionHead variant="band" title="Season Summary" />`
- `<SectionHead title="Top 3 · Drivers" right={…} />` → add `variant="band"`
- `<SectionHead title="Top 3 · Constructors" right={…} />` → add `variant="band"`

- [ ] **Step 4: Verify the build passes**

Run: `npm run build`
Expected: completes.

- [ ] **Step 5: Visual check**

Dev server → `/`. Headers now show a solid red square + heavier uppercase title + thicker rule, with the "View Full Standings →" action still inline at the right. Check another screen that uses `SectionHead` (e.g. a standings page) to confirm its headers are unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/lib/shared.jsx public/css/app.css src/components/islands/screens/HomeScreen.jsx
git commit -m "$(printf 'feat(home): bolder band section headers\n\nAdd an optional variant=\"band\" to the shared SectionHead (red square\nmark + heavier title + thicker rule); default rendering unchanged so\nother screens are unaffected. Apply it to the homepage band headers.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4: Form Guide ticker

**Files:**
- Modify: `src/components/islands/screens/HomeScreen.jsx` (replace stub with real `FormGuide`)
- Modify: `public/css/app.css` (new `FORM GUIDE` section)

- [ ] **Step 1: Replace the `FormGuide` stub with the real component**

In `src/components/islands/screens/HomeScreen.jsx`, delete the `function FormGuide() { return null; }` stub and add this component in its place (above `HomeScreen`). It derives its data from `D.calendar` + `D.results` using the existing `driverById`/`teamById` helpers — no new data plumbing:

```jsx
function formGuideRounds(D, n = 6) {
  const cal = D.calendar || [];
  const done = cal.filter(r => D.results[r.round]);
  return done.slice(-n).reverse().map(r => {
    const res = D.results[r.round];
    const winner = res && res.order && res.order.length ? D.driverById(res.order[0]) : null;
    const team = winner ? D.teamById(winner.team) : null;
    return {
      round: r.round,
      name: (r.name || '').replace(' Grand Prix', ''),
      country: r.country,
      flag: r.flag,
      sprint: !!r.sprint,
      winner: winner ? winner.last : '-',
      color: team ? team.color : 'var(--accent)',
    };
  });
}

function FormGuide({ data, mob }) {
  const rounds = formGuideRounds(data, 6);
  if (!rounds.length) return null;
  // Duplicate the list so the marquee can loop seamlessly (-50% translate).
  const loop = [...rounds, ...rounds];
  return (
    <section className="home-band fg-band">
      <div className="ticker">
        <div className="tklabel">▸ Form Guide</div>
        <div className="tkmask">
          <div className="tktrack">
            {loop.map((it, i) => (
              <span className="tkitem" key={i} aria-hidden={i >= rounds.length ? 'true' : undefined}>
                <span className="tk-rd">R{String(it.round).padStart(2, '0')}</span>
                <span className="tk-fl"><Flag cc={it.country} flag={it.flag} /></span>
                <span className="tk-gp">{it.name}</span>
                {it.sprint && <span className="tk-spr">SPR</span>}
                <span className="tk-strip" style={{ background: it.color }}></span>
                <span className="tk-wl">Win</span>
                <span className="tk-wn">{it.winner}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Add the Form Guide CSS**

In `public/css/app.css`, at the end of the `HOME BANDS` section, add:

```css
/* ============================================================
   FORM GUIDE - dark marquee band (constant dark in both themes)
   ============================================================ */
.fg-band { background: var(--band-ink); border-top: 1px solid #000; border-bottom: 1px solid var(--band-ink-line); }
.ticker { display: flex; align-items: stretch; height: 56px; overflow: hidden; position: relative; }
.ticker .tklabel {
  flex-shrink: 0; display: inline-flex; align-items: center; gap: 9px; padding: 0 22px;
  background: var(--accent); color: #fff; font-family: var(--f-display); font-weight: 800;
  font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; z-index: 2;
}
.ticker .tkmask {
  flex: 1; overflow: hidden;
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 40px, #000 calc(100% - 40px), transparent 100%);
  mask-image: linear-gradient(90deg, transparent 0, #000 40px, #000 calc(100% - 40px), transparent 100%);
}
.ticker .tktrack { display: inline-flex; height: 100%; white-space: nowrap; animation: fg-marq 38s linear infinite; }
.ticker:hover .tktrack { animation-play-state: paused; }
@keyframes fg-marq { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.tkitem { display: inline-flex; align-items: center; gap: 11px; padding: 0 24px; border-right: 1px solid var(--band-ink-line); }
.tkitem .tk-rd { font-family: var(--f-mono); font-size: 11px; color: var(--band-ink-fg-dim); }
.tkitem .tk-fl { font-size: 15px; }
.tkitem .tk-gp { font-family: var(--f-display); font-weight: 700; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; color: #fff; }
.tkitem .tk-strip { width: 16px; height: 3px; }
.tkitem .tk-wl { font-family: var(--f-display); font-weight: 600; font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--band-ink-fg-dim); }
.tkitem .tk-wn { font-family: var(--f-display); font-weight: 700; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--band-ink-fg); }
.tkitem .tk-spr { font-family: var(--f-mono); font-size: 9px; color: var(--accent); border: 1px solid var(--accent); padding: 1px 4px; }
@media (prefers-reduced-motion: reduce) {
  .ticker .tktrack { animation: none; }
  .ticker .tkmask { overflow-x: auto; }
}
```

- [ ] **Step 3: Verify the build passes**

Run: `npm run build`
Expected: completes; no undefined-component error (stub now replaced).

- [ ] **Step 4: Visual check**

Dev server → `/`. The dark Form Guide band sits between Season Summary and Top 3 Drivers, scrolling recent winners right-to-left with the red `▸ Form Guide` label fixed at the left and edge fades. Hover pauses it. In both themes the band stays dark. Toggle OS "reduce motion" (or DevTools rendering emulation) → animation stops and the strip is manually scrollable.

- [ ] **Step 5: Commit**

```bash
git add src/components/islands/screens/HomeScreen.jsx public/css/app.css
git commit -m "$(printf 'feat(home): add Form Guide ticker band\n\nDark constant-theme marquee of the last ~6 race winners, derived from\nexisting calendar/results data. Pauses on hover and respects\nprefers-reduced-motion.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: clean build of all routes.

- [ ] **Step 2: Cross-theme + responsive sweep**

Dev server. For `/` confirm, in BOTH dark and `html.light`:
- Hero, Season Summary, Form Guide, Top 3 Drivers, Top 3 Constructors all render correctly.
- Bands differentiate; Form Guide is dark in both.
- No console errors (`preview_console_logs` / browser console).
- ≤720px: bands stack, ticker usable, content clears bottom nav.

- [ ] **Step 3: Site-wide palette spot-check (light theme)**

Load `/drivers/norris/`, `/standings-drivers/`, `/records/`, a race page, and a circuit page in light theme. Confirm the warm palette reads well and nothing depended on the old cool greys (watch for low-contrast text or jarring white/cream seams).

- [ ] **Step 4: Screenshots for the user**

Capture `/` in light and dark, plus one detail page in light, and share them as proof.

- [ ] **Step 5: Finish the branch**

Use the superpowers:finishing-a-development-branch skill to decide merge/PR. Per CLAUDE.md, before any PR from a worktree: `git fetch origin main && git rebase origin/main`. Note the heavy first deploy (~20 min) because the CSS `?v=` hash changes for every page.

---

## Self-review notes

- **Spec coverage:** Part A palette → Task 1. Band layout + `--band-ink` → Task 2. Bolder headers → Task 3. Form Guide ticker → Task 4. Cross-theme/mobile/reduced-motion/site-wide verification → Task 5. `.stcard` correctly NOT introduced (Top 3 reuse `.card-accent`). All spec sections mapped.
- **No placeholders:** every code step shows complete code. The one inter-task dependency (`FormGuide` referenced in Task 2, defined in Task 4) is bridged with an explicit temporary stub so each task builds green.
- **Name consistency:** `Band`, `FormGuide`, `formGuideRounds`, `home-band`/`home-band-plain`/`home-band-tint`/`home-band-inner`, `fg-band`, `--band-ink*`, `tk-*` class names, and `variant="band"` are used identically across tasks.
