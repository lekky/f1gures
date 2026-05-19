# Constructor lineage tree on team pages

**Date:** 2026-05-19
**Branch:** `feat/constructor-lineage`
**Worktree:** `.claude/worktrees/lineage-tree`

## Motivation

F1 teams rebrand, get bought, and change identity all the time. Today's Aston
Martin started life as Jordan in 1991; today's Mercedes works team began as
Tyrrell in 1968. The Ergast data treats every name as a separate
`constructorRef` with no relationship between them, so visitors to
`/teams/jordan/` have no way to discover that Jordan is now Aston Martin (and
vice versa).

A lineage strip on the team page makes that continuity explicit. It also
surfaces a navigation path: from any era, one click reaches the next or
previous identity in the chain.

## Goals

- Render a horizontal timeline strip on each team page that participates in a
  curated rebrand chain.
- Every pill is clickable; visiting any team in the chain shows the same chain
  with that team highlighted ("self").
- Per-era stats (years active, wins, championships) computed at build time -
  zero runtime cost, no client JS.
- Hand-curated chain data, maximalist scope (every multi-name team in F1
  history is eventually covered).
- Linear chains only - no fork/merge support. Same `constructorRef` appearing
  twice in one chain (e.g. Renault 2002-11 + 2016-20) is allowed and renders
  as two separate pills.

## Non-goals

- Engine-supplier lineages (Mercedes engines used by different chassis teams).
- Fork or merge topology in v1.
- Per-decade or per-era timeline scrubbing.
- A standalone "all lineages" hub page (could come later; this spec ships the
  per-team strip only).
- Animation, hover charts, or any interactivity beyond the link.

## Design

### Layout (locked: option A from brainstorm)

Horizontal timeline strip. One pill per era, chevron between pills, current
era subtly filled. CSS grid with `grid-auto-flow: column; grid-auto-columns:
1fr` so pills divide the panel width evenly regardless of chain length.

Each pill contains three lines:

- **Eyebrow** (`1991-2005` or `2021-now`) - mono, dim.
- **Team name** with optional `displayNameOverride` (e.g. "Kick Sauber" when
  the underlying ref is `sauber`). If the era won championships, append a gold
  `★N` after the name.
- **Stats** (`15 yrs · 4W`) - seasons + wins for that era only.

The self pill gets a stronger gradient fill in the era's team color and the
name colored the same. `aria-current="page"` for accessibility.

**Mobile (`max-width: 720px`):** vertical flex column, each pill full width,
chevron rotates to point down. No horizontal scrolling.

### Placement on the team page

After the existing "Notable Drivers" section, before "Season by Season":

```
Hero -> Current Drivers -> Car -> Career Stats -> Best Season
  -> Notable Drivers -> Lineage -> Season by Season
```

Section appears only when `team.lineage` is present (i.e. the team's ref is
in a curated chain of length >= 2). Solo teams (Ferrari, McLaren, Williams,
Haas) get no section.

### Data source

`scripts/lineages.mjs` - ES module, version controlled, hand curated. Lives
alongside `scripts/build-archive.mjs` and `scripts/records/`. **Not** in
`src/data/` because no Astro page reads it directly - the merged result is
baked into each team's JSON and that's what the page consumes. Same module
that exports `lineages` also exports the helpers (`buildLineageAttachment`,
`eraStats`).

```js
export const lineages = [
  {
    id: 'jordan-aston',
    nodes: [
      { ref: 'jordan',       from: 1991, to: 2005 },
      { ref: 'midland',      from: 2006, to: 2006 },
      { ref: 'spyker',       from: 2007, to: 2007 },
      { ref: 'force_india',  from: 2008, to: 2018 },
      { ref: 'racing_point', from: 2019, to: 2020 },
      { ref: 'aston_martin', from: 2021, to: null },   // null = "present"
    ],
  },
  // ... more chains
];
```

JS module (not JSON) so we can leave inline comments documenting Lotus naming
disputes, Sauber/Stake/Kick treatment, etc.

**Node fields:**

| Field | Required | Notes |
|---|---|---|
| `ref` | yes | constructorRef matching Ergast / archive |
| `from` | yes | first year of this era |
| `to` | yes | last year, or `null` for the current era |
| `displayNameOverride` | no | use when marketing name differs from Ergast (`'Kick Sauber'`) |

### Build-time computation

`scripts/build-archive.mjs` imports from `scripts/lineages.mjs` and calls
`buildLineageAttachment` for each team doc. **Ordering matters:** the call
must happen *after* the existing post-Ergast bundle-synth pass that creates
team docs for years > 2024 (currently around line 1900, the same pass that
recomputes `topDrivers` and `bestSeason`). Otherwise the lineage validation
fails for refs that only exist in bundle-derived team docs (e.g. `audi` in
2026).

For each team doc whose ref appears in any chain, attach:

```js
team.lineage = {
  chainId: 'jordan-aston',
  selfIndex: 5,
  nodes: [
    { ref, name, displayNameOverride, color, from, to, seasons, wins, championships, isSelf },
    ...
  ],
};
```

**Algorithm:**

1. Build `lineageByRef: Map<ref, Array<{chain, idx}>>` once.
2. For each team doc, look up its ref. If absent, skip.
3. Prefer the era whose `[from, to]` range contains the doc's latest
   `perSeason` year as `selfIndex`. Falls back to first occurrence if no era
   covers the latest year (defensive - shouldn't happen for well-curated chains).
4. Map every node in the chain to `{ ref, name, displayNameOverride, color,
   from, to, seasons, wins, championships, isSelf }`, pulling `name`/`color`
   from the resolved team doc, carrying `displayNameOverride` through from
   the chain config (undefined when not set), and computing per-era stats
   via `eraStats`.

```js
function eraStats(teamDoc, from, to) {
  if (!teamDoc?.perSeason) return { wins: 0, championships: 0, seasons: 0 };
  const upper = to ?? Infinity;
  const rows = teamDoc.perSeason.filter(s => s.year >= from && s.year <= upper);
  return {
    seasons: rows.length,
    wins: rows.reduce((sum, s) => sum + (s.wins || 0), 0),
    championships: rows.filter(s => s.position === 1).length,
  };
}
```

**Validation pass:** for every `node.ref` across all chains, assert
`allTeamDocs.has(ref)`. Fail loudly with the chain id + bad ref in the
message. Reject chains of length < 2 (a single-node "chain" produces no
useful strip).

### Rendering

A new `src/components/LineageStrip.astro` partial included by
`src/components/TeamPage.astro`. Pure server-rendered, no React island.
Renders only when `team.lineage` exists.

Markup shape:

```astro
<div class="section-head">
  <h2>Lineage</h2>
  <div class="section-rule"></div>
  <span class="t-eyebrow lineage-summary">
    {nodes.length} eras · {totalSeasons} seasons · {totalWins}W · {totalTitles}T
  </span>
</div>
<div class="panel lineage-strip">
  {nodes.map((n, i) => (
    <a
      class={`lin-node ${n.isSelf ? 'is-self' : ''}`}
      style={`--c:${n.color};`}
      href={`/teams/${n.ref}/`}
      aria-current={n.isSelf ? 'page' : undefined}
    >
      <div class="lin-years">{formatYears(n.from, n.to)}</div>
      <div class="lin-name">
        {n.displayNameOverride ?? n.name}
        {n.championships > 0 && <span class="lin-star">{'★'}{n.championships}</span>}
      </div>
      <div class="lin-stats">
        {n.seasons} {n.seasons === 1 ? 'yr' : 'yrs'}
        {n.wins > 0 && (<> · <span class="win">{n.wins}W</span></>)}
      </div>
      {i < nodes.length - 1 && <span class="lin-arrow" aria-hidden="true"></span>}
    </a>
  ))}
</div>
```

CSS lives in the component's `<style>` block. Token references
(`--bg-2`, `--line-1`, `--fg-3`, etc.) come from the project's existing
design tokens in `public/css/app.css` and `public/css/site.css`. The gold
star color reuses `var(--accent)` for consistency with other championship
markers (best-season hero, `stat-accent`).

### Curation seed

First commit ships these chains:

| Chain id | Nodes |
|---|---|
| `jordan-aston` | jordan -> midland -> spyker -> force_india -> racing_point -> aston_martin |
| `sauber-audi` | sauber -> bmw_sauber -> sauber -> alfa -> sauber (`displayNameOverride: 'Kick Sauber'`) -> audi |
| `tyrrell-mercedes` | tyrrell -> bar -> honda -> brawn -> mercedes |
| `toleman-alpine` | toleman -> benetton -> renault -> lotus_f1 -> renault -> alpine |
| `stewart-redbull` | stewart -> jaguar -> red_bull |
| `minardi-rb` | minardi -> toro_rosso -> alphatauri -> rb |
| `lotus-caterham` | lotus_racing -> caterham |
| `virgin-manor` | virgin -> marussia -> manor |

Comment in the file explains:
- `mf1` in Ergast is the same era as `midland` (duplicate entry) - we use
  `midland` in the chain.
- `team_lotus` is Colin Chapman's outfit and not in any chain.
- `lotus_f1` is the Renault/Enstone team's 2012-15 sponsor-named era, not
  related to Team Lotus or to `lotus_racing`/`caterham`.

Second-wave chains (follow-up commits, not blocking v1): pre-1990 outfits
where successor relationships are less clear-cut (Brabham, Cooper, Vanwall,
BRM lineages).

#### Audi 2026

Audi enters in 2026. The `sauber-audi` chain ends with `audi` having
`from: 2026, to: null`. Audi has no Ergast entry; its team doc is synthesised
by `build-archive.mjs`'s post-Ergast pass from `public/data/2026.json`. The
lineage attachment runs after that pass (see ordering note above), so the
audi pill resolves correctly with its name and color from the synthesised
doc.

## Testing

Mirror the `scripts/records/` pattern: pure-function modules in
`scripts/lineages.mjs` get vitest unit tests in `scripts/lineages.test.js`.

**Unit tests:**

1. `eraStats` sums wins and counts championships for a year range.
2. `eraStats` with `to: null` treats the range as open-ended.
3. `buildLineageAttachment` populates `nodes[]` with name/color from the
   resolved team doc.
4. `selfIndex` for a ref appearing twice in one chain -> era covering the doc's latest perSeason year (falls back to first occurrence).
5. `displayNameOverride` is preserved in the attached node.
6. Validation throws on unknown ref (message contains chain id + ref).
7. Validation throws on chain length < 2.

**Smoke / visual:**

- `npm run build:archive` produces a team doc with the `lineage` field for
  `jordan`; eyeball the JSON.
- `npm run build` succeeds (every chain ref already exists in the teams
  index; no new `getStaticPaths` work needed).
- `npm run dev` (port to be chosen per worktree-port convention - ask user):
  spot-check four teams - jordan (chain head), force_india (mid-chain),
  mercedes (chain tail with titles), ferrari (solo, should show NO section).
- DevTools at 720px to confirm mobile stack.

**Skipped:**

- No HTML snapshot tests (brittle for cosmetic CSS tweaks).
- No e2e click tests (hrefs are deterministic and asserted via unit tests of
  the data shape).

## Open questions / risks

- **Stake / Kick naming for 2024-2025:** assumes Ergast keeps `sauber` as the
  ref. If the 2025 CSV ships with a new ref (`kick_sauber`?), the chain
  entry's `ref` needs updating and the `displayNameOverride` removed.
  Validation pass would catch this at build time.
- **Color choice for historic eras without a team color in the existing
  `TEAM_COLORS` map:** the team doc's `color` field defaults to `#888`. Pills
  for ancient teams may all blend together. Acceptable for v1; can expand
  `TEAM_COLORS` if it looks bad.
- **Chain ordering:** `_teams-index.json` is alphabetical by name. The chain
  itself controls pill order via the array index, so this is fine - but if
  we ever want a "browse chains" hub, we'll need a separate sorted list of
  chains.

## Out of scope (future work)

- Lineage chain hub page (`/lineages/`).
- Cross-team comparison (compare two chains' total wins).
- Engine-supplier lineages.
- Animated transitions / hover previews.
