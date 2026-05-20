# F1gures Design System — Tokens & contracts

> Single-file reference for tools and humans. The browsable docs live in
> the sibling HTML files (`index.html`, `foundations.html`, etc.) — open
> them when you need to see something rendered.
>
> All tokens defined in `public/css/app.css`. **Never hardcode hex** — the
> light-mode override (`html.light`) remaps the same token names; hardcoded
> values break theme parity.

---

## 1. Type

| Token         | Family             | Weights         | Use                                                      |
|---------------|--------------------|-----------------|----------------------------------------------------------|
| `--f-display` | Barlow Condensed   | 600 / 700 / 800 | Titles, eyebrows, labels, button text, pill text         |
| `--f-body`    | Barlow             | 400 / 500 / 600 / 700 | Body copy, prose, descriptions, blog article body  |
| `--f-mono`    | JetBrains Mono     | 400 / 500 / 600 | Lap times, gaps, hex, code, mono eyebrows                |

### Display scale (line-height in parens)

| Size | Use                                          |
|------|----------------------------------------------|
| 88px (0.9)  | Hero title (records hub top)           |
| 56px (1.0)  | Page hero (driver name, race name)     |
| 44px (1.0)  | Big stat values, record card numbers   |
| 36px (1.02) | Standard page H1                       |
| 28px (1.0)  | Stat block values                      |
| 22px (1.0)  | Sub-section / circuit hero secondary   |
| 16px (1.0, 0.12em tracking) | Section eyebrows         |
| 11px (1.0, 0.16em tracking) | `.t-eyebrow` — display eyebrows |
| 11px (1.0, 0.18em tracking, mono) | Mono eyebrows / metadata |

### Rules

- Uppercase by default for display headings (`text-transform: uppercase`).
- **Exception:** blog/MDX (`.blog-card-title`, `.blog-article-body h1/h2/h3`)
  uses sentence case for readability. Document any new exception explicitly.
- Body default: 14px / 1.4. Long-form (blog): 16px / 1.7.

---

## 2. Color

Every token below has a paired light-mode value in `html.light { ... }`.

### Surfaces

| Token            | Dark    | Light    | Role                                       |
|------------------|---------|----------|--------------------------------------------|
| `--bg-0`         | #050505 | #EEEEF2  | Deepest — code blocks, page edges          |
| `--bg-1`         | #0A0A0A | #F5F5F8  | Page background                            |
| `--bg-2`         | #1C1D22 | #FFFFFF  | Cards, panels, tables                      |
| `--bg-3`         | #252629 | #EDEDF1  | Table headers, pills, inputs               |
| `--bg-hover`     | #2D2F36 | #E6E6EA  | Interactive hover fill                     |
| `--bg-elevated`  | #22232A | #FFFFFF  | Lifted card (`.race-card:hover`, `.is-next`) |

### Lines

| Token       | Dark    | Light    | Role                                |
|-------------|---------|----------|-------------------------------------|
| `--line-1`  | #2C2E36 | #E0E1E6  | Quiet — panel borders, row dividers |
| `--line-2`  | #383A44 | #CCCDD4  | Default — controls, pills, callouts |
| `--line-3`  | #484C56 | #B2B3BC  | Active — hover & focus borders      |

### Foreground

| Token    | Dark    | Light    | Role                                  |
|----------|---------|----------|---------------------------------------|
| `--fg-1` | #F5F5F5 | #0D0E12  | Primary — body, titles, numbers       |
| `--fg-2` | #B8B9BD | #3D3E48  | Secondary — descriptions, prose       |
| `--fg-3` | #9A9BA1 | #6A6B75  | Tertiary — eyebrows, labels, captions |
| `--fg-4` | #636469 | #9A9BA6  | Quaternary — row chevron, hint glyphs |

### Accent

| Token            | Value                  | Role                                    |
|------------------|------------------------|-----------------------------------------|
| `--accent`       | #E8002D                | F1 red. Active nav, leader, next race.  |
| `--accent-dim`   | #B8002A                | Pressed / secondary accent fill         |
| `--accent-glow`  | rgba(232,0,45, .18 D / .10 L) | Halo on accent dots, ::before  |

### Semantic

| Token       | Dark    | Light    | Role                                |
|-------------|---------|----------|-------------------------------------|
| `--pos`     | #2ECC71 | #15803D  | Position up, lap improved           |
| `--neg`     | #FF4444 | #DC2626  | Position down, DNF, error           |
| `--warn`    | #FFB020 | #B45309  | DSQ, tyre deg high, caution         |
| `--neutral` | #75767B | #75767B  | Position unchanged                  |
| `--live`    | #FF1E1E | #FF1E1E  | Live race pill (brighter than accent) |

### Podium (fixed across themes)

| Token   | Value   | Use                |
|---------|---------|--------------------|
| `.pos-1` | #FFD700 | P1 gold            |
| `.pos-2` | #C0C0C0 | P2 silver          |
| `.pos-3` | #CD7F32 | P3 bronze          |

### Team colors (2026 grid, from `src/data/buildFallback.js`)

| Team             | id        | short | hex     |
|------------------|-----------|-------|---------|
| McLaren          | mclaren   | MCL   | #FF8000 |
| Ferrari          | ferrari   | FER   | #E80020 |
| Mercedes         | mercedes  | MER   | #27F4D2 |
| Red Bull Racing  | redbull   | RBR   | #3671C6 |
| Aston Martin     | aston     | AST   | #229971 |
| Alpine           | alpine    | ALP   | #0093CC |
| Williams         | williams  | WIL   | #64C4FF |
| Racing Bulls     | rb        | RBL   | #6692FF |
| Kick Sauber      | sauber    | SAU   | #52E252 |
| Haas             | haas      | HAA   | #B6BABD |

**Collisions to guard against**

- Ferrari `#E80020` ≈ `--accent` `#E8002D`. On Ferrari-context pages,
  switch the "active" cue to a 2 px underline + weight 800 — don't fight
  the team strip for red.
- Sauber `#52E252` ≈ `--pos` `#2ECC71`. Never color a Sauber driver's
  "position up" cell green; let the team strip carry the green.
- Williams `#64C4FF` vs Racing Bulls `#6692FF`. When both appear in one
  view (chart, standings), always pair the strip with the short code.

### Where team color may land

1. **3 px left strip** on driver cells (`.driver-cell`, `.driver-card`).
2. **2–4 px top rule** on team cards / record sections (`.records-section-rule`).
3. **8–12 px round dot** in search palette, chart legends (`.f1k-team-dot`).
4. **2 px left strip on chips** (`.driver-chip`).
5. **Full bar fill** in record-card lead row (`.rec-bar-lead .rec-bar-fill`).
6. **Solid pill background** — rare, team-specific only.

**Never** as panel background. The only exception is the
`.silhouette-photo` gradient (18 % team tint over `bg-3`).

---

## 3. Spacing

4-unit scale. Tokens defined in `public/css/app.css`. Existing rules still
inline pixel values in places; follow-up PRs are migrating consumers.

| Token   | px | Use                                            |
|---------|----|------------------------------------------------|
| `--sp-0` | 4  | Sub-element gaps, micro chips                 |
| `--sp-1` | 6  | Compact rows, inline metadata                 |
| `--sp-2` | 8  | Compact table cell padding (`.data-table`)    |
| `--sp-3` | 12 | Default panel body, grid gap, `.driver-card`  |
| `--sp-4` | 14 | Card body, medium cell padding (`.tbl`, `.race-card`) |
| `--sp-5` | 16 | Section container padding (`.callout`)        |
| `--sp-6` | 20 | Page padding (mobile inner)                   |
| `--sp-7` | 24 | Page padding (desktop), hero pad              |
| `--sp-8` | 32 | Vertical section separator                    |
| `--sp-10` | 56 | Nav height (`--nav-h`)                       |

### Container widths

- `.page` — max 1280px
- `.records-page` — max 1200px
- `.blog-article` — max 720px (reading width)
- Prose / summaries — max 65ch

### Breakpoints

- `max-width: 720px` — mobile. Bottom nav, grids → 1fr, page pad 16/14.
- `max-width: 1024px` — tablet. `.records-grid` drops 3 → 2 cols.
- `≥ 721px` — desktop default.

---

## 4. Borders, radius, elevation

- **Border-only language** — 1 px borders separate surfaces, never shadows.
- **`border-radius: 0`** is the rule. Exceptions:
  - `border-radius: 50%` — dots, status indicators (6–12 px).
  - `border-radius: 6px` — segmented controls, sort buttons. (Audit:
    `.listing-card` 8 px is **flagged** for unification on 0.)
- **Shadows** only on floating elements:
  - Nav dropdown — `0 12px 32px rgba(0,0,0,.5)`
  - Search palette — `0 24px 64px rgba(0,0,0,.45)`
  - `.race-card.is-next` — `0 8px 32px rgba(232,0,45,.14)` (accent halo)

---

## 5. Motion

Tokens defined in `public/css/app.css`. Existing transitions still inline
durations in places; follow-up PRs are migrating consumers.

| Token       | Duration | Use                                          |
|-------------|----------|----------------------------------------------|
| `--mo-fast` | 80ms     | Table row hover (`.tbl tbody tr`)           |
| `--mo`      | 120ms    | Default — borders, color, card transforms   |
| `--mo-slow` | 300ms    | Blog card image zoom on hover               |

Single easing: `ease`. No springs. Only hover-feedback animations — no
entrance / parallax / scroll-driven animation in the system.

---

## 6. Components

> Each component below ships in `public/css/app.css`. The component page
> in the design-system docs (`components.html`) renders every variant in
> both themes.

### Buttons — `.btn`

`.btn-primary` (accent bg, one per surface) · `.btn-secondary` (bg-3) ·
`.btn-ghost` (transparent). Modifier: `.btn-sm` (11px / 6×10 padding).

### Pills — `.pill`

10px label, 0.14em tracking, 3 × 8 padding. Variants:

- `.pill-finished`, `.pill-completed`, `.pill-upcoming` — neutral
- `.pill-dnf` — neg-tinted
- `.pill-dsq` — warn-tinted
- `.pill-next` — accent-bordered
- `.pill-sprint` — solid gradient (accent → #FF4500)
- `.pill-live` — solid `--live`, includes pulsing white dot

### Position cell — `.pos`

Big condensed (16 / 800), 28 px wide. `.pos-1/2/3` adds podium color.

### Change indicator — `.chg`

Round-over-round delta. Mono, 11 px, fixed 36 px wide.
`.chg-up` (pos), `.chg-down` (neg), `.chg-flat` (fg-4).

### Tabs — `.tabs > .tab`

Race-weekend session selector. Active gets 2 px accent underline.
`.tab.locked` (fg-4, not-allowed). `.tab.live` (live color).

### Segmented controls

`.theme-switcher`, `.standings-toggle`, `.records-era-toggle`,
`.sort-group > .sort-btn`. Same shape, different padding. Active
state uses `bg-3` background (or `accent` for sort buttons).

### Panel — `.panel`

Neutral container. `.panel-head` for uppercase eyebrow row;
`.panel-tight` kills body padding for tables.

### Stat block — `.stat`

Small label + big value + optional caption. Stack in `.grid grid-{2,3,4}`.

### Callout — `.callout`

Accent-railed highlight. Icon + label + driver + time. Used for lap
record + next race.

### Bar set — `.barset > .bar-row`

Label + track + value. Used on circuit profiles. Fill can be accent,
semantic, or team.

### Countdown — `.countdown > .countdown-cell`

Four numeric cells divided by 1 px lines. 44 px condensed numbers.

### Tables

**Audit warning — two systems coexist. New code: use `.tbl`.**

- `.tbl` — sortable, interactive. Use for live data screens.
- `.data-table` — read-only, prerendered detail pages. **Will be migrated**
  to `.tbl.tbl-static`. Don't introduce new `.data-table` usages.
- Row chevron is auto-injected by `.tbl tbody tr.clickable td:last-child::after`.

### Cards

**Audit warning — five card patterns coexist.** Until unification:

- `.race-card` — calendar entries. States: default `.is-upcoming`,
  `.is-completed` (opacity 0.45), `.is-next` (accent border + glow).
  Always pair with `.race-card-link` to get the corner ↗.
- `.driver-card` — compact home/listing row. Requires `--team-color`
  CSS var. 3 px left strip.
- `.listing-card` — drivers / teams index pages. **Currently 8 px
  radius** — flagged for migration to 0.
- `.blog-card` — editorial. 16:9 image + accent left rail. Title is
  sentence-case (the only card that is).
- `.rec-card` — record hero card on the records hub. **This is the
  pattern to follow** for any new "leaderboard" surface. Requires
  `--card-accent` CSS var.

### Search palette — `.f1k-*`

Cmd / Ctrl + K. Trigger is `.search-trigger` (desktop) / `.search-trigger-mobile`.
Panel is `.f1k-panel`. Groups separated by `.f1k-group` rules.

---

## 7. Patterns (page-level recipes)

### Records hero card (the lodestar pattern)

Anatomy: eyebrow → big value (44 px num + lowercase unit) → holder block
(48 px avatar + flag + name + mono context line) → top-5 bar chart
(lead row at full opacity + white text + 26 px height, others 0.45 opacity)
→ accent border-top on hover.

**Use this pattern for any new leaderboard surface**, including circuit
"all-time records" panels and the home page top-3 — see Audit · PR 5.

### Section heads with team-colored accent rule

```html
<section class="records-section" style="--section-accent: #FFD700;">
  <div class="section-head records-section-head">
    <h2>Career milestones</h2>
    <span class="records-section-count">6 leaderboards</span>
  </div>
  <div class="records-section-rule"></div>
</section>
```

The 2 px rule under each section is what makes the records page feel alive
even before bars load. Take the leader's team color as the section accent.

### Circuit profile

Hero (breadcrumb → title → flag + country → meta pills → blurb) +
track-map placeholder right. Then bar-set panel for track characteristics +
twin callouts (lap record, next race) + records cards scoped to the circuit
(recommend the rec-card pattern, not plain tables — see Patterns docs).

### Calendar grid

Grid of `.race-card`s in three states (completed / next / upcoming). The
"next" race dominates with `.is-next`.

### Standings table

`.tbl` with sticky header, team-colored `.driver-cell` strip, mono numerics,
`.pos pos-{1,2,3}` for podium, `.chg` at the end. Rows are `.clickable` —
auto-injected chevron.

---

## 8. Theme handling

Dark is the canonical surface. Light is opt-in via `<html class="light">`.

Pre-hydration script in `BaseLayout.astro` reads
`localStorage.f1-theme` and toggles `html.light` **before paint** —
this avoids a dark→light flash. Don't remove it.

When authoring new CSS:

1. Define using tokens, never hex.
2. If a component needs a light-mode adjustment beyond what tokens give,
   add `html.light .your-component { ... }` near the dark rule.
3. Verify in both themes before merging.

---

## 9. Drift to NOT add to (until fixed)

See `audit.html` for full migration plan. **Don't add new instances of:**

- A 3rd table class
- `border-radius: 8px` (or any radius other than 0 / 50%)
- `.inline-link` with a dotted border-bottom
- Hardcoded motion durations — use the `--mo-fast` / `--mo` / `--mo-slow`
  tokens. Inline `.12s`/`.15s`/`300ms` values still exist in older rules;
  migrate them when you touch surrounding code, don't add new ones.
- Hardcoded spacing values — use the `--sp-N` tokens when adding new CSS.
- Hardcoded hex anywhere

---

## 10. Quick rules of thumb

- One screen, one `--accent` usage. If it's appearing twice, demote one.
- Team color belongs on a strip / dot / rule / chip — not a fill.
- Numbers are always mono and tabular (`font-variant-numeric: tabular-nums;`
  or use `.t-mono` / `.t-num`).
- Cards never get `box-shadow` unless they're `.race-card.is-next`.
- Hover state is always a border-color change. Never scale.
- Mobile-first responsive: prefer CSS `@media (max-width: 720px)` over
  JS `useIsMobile()` for layout (see CLAUDE.md repo convention).
