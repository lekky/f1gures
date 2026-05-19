# Constructor Lineage Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a horizontal timeline strip on each F1 team page that participates in a curated rebrand chain (e.g. Jordan → Aston Martin, Tyrrell → Mercedes), with every pill clickable and per-era stats baked in at build time.

**Architecture:** Hand-curated chain data in `scripts/lineages.mjs`. `scripts/build-archive.mjs` runs a final pass after the post-Ergast bundle-synth, calling `buildLineageAttachment` to inject a `lineage` field into the JSON of each team in any chain. `TeamPage.astro` includes a new `LineageStrip.astro` partial that renders the strip when `team.lineage` is present. Pure server-rendered; no client JS.

**Tech Stack:** Node ESM, Astro 4 (SSG), vitest. No new dependencies.

**Worktree:** `.claude/worktrees/lineage-tree` on branch `feat/constructor-lineage`. All paths below are relative to that worktree.

**Spec reference:** [docs/superpowers/specs/2026-05-19-constructor-lineage-design.md](../specs/2026-05-19-constructor-lineage-design.md)

---

## File Structure

**Create:**
- `scripts/lineages.mjs` - data + pure helpers
- `scripts/lineages.test.js` - vitest unit tests
- `src/components/LineageStrip.astro` - rendering partial

**Modify:**
- `scripts/build-archive.mjs` - import lineages and invoke `buildLineageAttachment` after the post-Ergast team-doc pass
- `src/components/TeamPage.astro` - add `lineage` to Props, include `LineageStrip` between Notable Drivers and Season-by-Season

---

## Task 1: Skeleton + `eraStats` (TDD)

**Files:**
- Create: `scripts/lineages.mjs`
- Create: `scripts/lineages.test.js`

- [ ] **Step 1.1: Write the failing test**

Create `scripts/lineages.test.js`:

```js
// scripts/lineages.test.js
import { describe, it, expect } from 'vitest';
import { eraStats } from './lineages.mjs';

describe('eraStats', () => {
  const doc = {
    perSeason: [
      { year: 2020, position: 7,  wins: 0 },
      { year: 2021, position: 4,  wins: 1 },
      { year: 2022, position: 2,  wins: 3 },
      { year: 2023, position: 1,  wins: 9 },  // champion
      { year: 2024, position: 1,  wins: 12 }, // champion
      { year: 2025, position: 3,  wins: 2 },
    ],
  };

  it('sums wins and counts championships across an inclusive range', () => {
    expect(eraStats(doc, 2021, 2024)).toEqual({ seasons: 4, wins: 25, championships: 2 });
  });

  it('treats to: null as open-ended (through last perSeason year)', () => {
    expect(eraStats(doc, 2023, null)).toEqual({ seasons: 3, wins: 23, championships: 2 });
  });

  it('returns zeros when doc has no perSeason', () => {
    expect(eraStats(null, 2020, 2024)).toEqual({ seasons: 0, wins: 0, championships: 0 });
    expect(eraStats({}, 2020, 2024)).toEqual({ seasons: 0, wins: 0, championships: 0 });
  });

  it('handles a single-year era (from === to)', () => {
    expect(eraStats(doc, 2023, 2023)).toEqual({ seasons: 1, wins: 9, championships: 1 });
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
cd .claude/worktrees/lineage-tree
npx vitest run scripts/lineages.test.js
```

Expected: FAIL with "Failed to resolve import './lineages.mjs'" or similar.

- [ ] **Step 1.3: Write minimal implementation**

Create `scripts/lineages.mjs`:

```js
// scripts/lineages.mjs
// Hand-curated F1 constructor lineage chains + pure helpers used by
// scripts/build-archive.mjs to attach a `lineage` field to each team's
// JSON doc. Same-ref-appearing-twice is allowed (e.g. Renault 2002-11
// and 2016-20). Linear chains only - no fork/merge support.

export const lineages = [];

export function eraStats(teamDoc, from, to) {
  if (!teamDoc?.perSeason) return { seasons: 0, wins: 0, championships: 0 };
  const upper = to ?? Infinity;
  const rows = teamDoc.perSeason.filter(s => s.year >= from && s.year <= upper);
  return {
    seasons: rows.length,
    wins: rows.reduce((sum, s) => sum + (s.wins || 0), 0),
    championships: rows.filter(s => s.position === 1).length,
  };
}
```

- [ ] **Step 1.4: Run test to verify it passes**

```bash
npx vitest run scripts/lineages.test.js
```

Expected: PASS (4 tests).

- [ ] **Step 1.5: Commit**

```bash
git add scripts/lineages.mjs scripts/lineages.test.js
git commit -m "feat(lineages): seed module with eraStats helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `validateLineages` (TDD)

**Files:**
- Modify: `scripts/lineages.test.js`
- Modify: `scripts/lineages.mjs`

- [ ] **Step 2.1: Add failing tests**

Append to `scripts/lineages.test.js`:

```js
import { validateLineages } from './lineages.mjs';

describe('validateLineages', () => {
  const teamsIndex = [
    { constructorRef: 'jordan' },
    { constructorRef: 'aston_martin' },
  ];

  it('passes for a valid chain', () => {
    const chains = [{
      id: 'jordan-aston',
      nodes: [
        { ref: 'jordan',       from: 1991, to: 2005 },
        { ref: 'aston_martin', from: 2021, to: null },
      ],
    }];
    expect(() => validateLineages(chains, teamsIndex)).not.toThrow();
  });

  it('throws on unknown ref with chain id and ref in message', () => {
    const chains = [{
      id: 'broken-chain',
      nodes: [
        { ref: 'jordan',       from: 1991, to: 2005 },
        { ref: 'totally_fake', from: 2006, to: 2010 },
      ],
    }];
    expect(() => validateLineages(chains, teamsIndex))
      .toThrow(/broken-chain.*totally_fake/);
  });

  it('throws on chain shorter than 2 nodes', () => {
    const chains = [{ id: 'solo', nodes: [{ ref: 'jordan', from: 1991, to: 2005 }] }];
    expect(() => validateLineages(chains, teamsIndex)).toThrow(/solo.*at least 2/);
  });

  it('throws on missing chain id', () => {
    const chains = [{ nodes: [
      { ref: 'jordan', from: 1991, to: 2005 },
      { ref: 'aston_martin', from: 2021, to: null },
    ] }];
    expect(() => validateLineages(chains, teamsIndex)).toThrow(/missing id/);
  });
});
```

- [ ] **Step 2.2: Run tests to verify failure**

```bash
npx vitest run scripts/lineages.test.js
```

Expected: 4 FAIL (`validateLineages is not a function`), 4 PASS (eraStats).

- [ ] **Step 2.3: Implement `validateLineages`**

Append to `scripts/lineages.mjs`:

```js
export function validateLineages(chains, teamsIndex) {
  const refSet = new Set(teamsIndex.map(t => t.constructorRef));
  for (const chain of chains) {
    if (!chain.id) throw new Error('lineage chain missing id');
    if (!chain.nodes || chain.nodes.length < 2) {
      throw new Error(`lineage chain "${chain.id}" must have at least 2 nodes`);
    }
    for (const node of chain.nodes) {
      if (!refSet.has(node.ref)) {
        throw new Error(`lineage chain "${chain.id}" references unknown ref "${node.ref}"`);
      }
    }
  }
}
```

- [ ] **Step 2.4: Run tests to verify all pass**

```bash
npx vitest run scripts/lineages.test.js
```

Expected: PASS (8 tests).

- [ ] **Step 2.5: Commit**

```bash
git add scripts/lineages.mjs scripts/lineages.test.js
git commit -m "feat(lineages): add validateLineages with chain-id error messages

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `buildLineageAttachment` (TDD)

**Files:**
- Modify: `scripts/lineages.test.js`
- Modify: `scripts/lineages.mjs`

- [ ] **Step 3.1: Add failing tests**

Append to `scripts/lineages.test.js`:

```js
import { buildLineageAttachment } from './lineages.mjs';

describe('buildLineageAttachment', () => {
  const chains = [{
    id: 'jordan-aston',
    nodes: [
      { ref: 'jordan',       from: 1991, to: 2005 },
      { ref: 'aston_martin', from: 2021, to: null },
    ],
  }];

  const teamDocs = {
    jordan: {
      constructorRef: 'jordan',
      name: 'Jordan',
      color: '#FFC107',
      perSeason: [
        { year: 1998, position: 4, wins: 1 },
        { year: 1999, position: 3, wins: 2 },
      ],
    },
    aston_martin: {
      constructorRef: 'aston_martin',
      name: 'Aston Martin',
      color: '#2E8B57',
      perSeason: [
        { year: 2023, position: 5, wins: 0 },
        { year: 2024, position: 5, wins: 0 },
      ],
    },
  };
  const lookup = (ref) => teamDocs[ref] ?? null;

  it('attaches lineage with selfIndex 0 to Jordan and all node fields', () => {
    const doc = JSON.parse(JSON.stringify(teamDocs.jordan));
    buildLineageAttachment(doc, chains, lookup);
    expect(doc.lineage).toEqual({
      chainId: 'jordan-aston',
      selfIndex: 0,
      nodes: [
        { ref: 'jordan', name: 'Jordan', displayNameOverride: undefined,
          color: '#FFC107', from: 1991, to: 2005,
          seasons: 2, wins: 3, championships: 0, isSelf: true },
        { ref: 'aston_martin', name: 'Aston Martin', displayNameOverride: undefined,
          color: '#2E8B57', from: 2021, to: null,
          seasons: 2, wins: 0, championships: 0, isSelf: false },
      ],
    });
  });

  it('attaches lineage with selfIndex 1 to Aston Martin', () => {
    const doc = JSON.parse(JSON.stringify(teamDocs.aston_martin));
    buildLineageAttachment(doc, chains, lookup);
    expect(doc.lineage.selfIndex).toBe(1);
    expect(doc.lineage.nodes[1].isSelf).toBe(true);
    expect(doc.lineage.nodes[0].isSelf).toBe(false);
  });

  it('leaves lineage undefined for refs not in any chain', () => {
    const doc = { constructorRef: 'ferrari', name: 'Ferrari', color: '#DC0000', perSeason: [] };
    buildLineageAttachment(doc, chains, lookup);
    expect(doc.lineage).toBeUndefined();
  });

  it('carries displayNameOverride through to the attached node', () => {
    const chainsWithOverride = [{
      id: 'jordan-aston',
      nodes: [
        { ref: 'jordan',       from: 1991, to: 2005, displayNameOverride: 'Eddie Jordan GP' },
        { ref: 'aston_martin', from: 2021, to: null },
      ],
    }];
    const doc = JSON.parse(JSON.stringify(teamDocs.jordan));
    buildLineageAttachment(doc, chainsWithOverride, lookup);
    expect(doc.lineage.nodes[0].displayNameOverride).toBe('Eddie Jordan GP');
    expect(doc.lineage.nodes[0].name).toBe('Jordan');
  });

  it('picks first occurrence as selfIndex when ref appears twice in one chain', () => {
    const renaultDoc = {
      constructorRef: 'renault',
      name: 'Renault',
      color: '#FFF500',
      perSeason: [
        { year: 2005, position: 1, wins: 8 },  // champion (era 1)
        { year: 2006, position: 1, wins: 8 },  // champion (era 1)
        { year: 2016, position: 9, wins: 0 },  // era 2
        { year: 2020, position: 5, wins: 0 },  // era 2
      ],
    };
    const chainWithDup = [{
      id: 'toleman-alpine',
      nodes: [
        { ref: 'renault', from: 2002, to: 2011 },  // era 1
        { ref: 'renault', from: 2016, to: 2020 },  // era 2 - same ref
      ],
    }];
    const dupLookup = (ref) => ref === 'renault' ? renaultDoc : null;
    const doc = JSON.parse(JSON.stringify(renaultDoc));
    buildLineageAttachment(doc, chainWithDup, dupLookup);
    expect(doc.lineage.selfIndex).toBe(0);
    expect(doc.lineage.nodes[0].isSelf).toBe(true);
    expect(doc.lineage.nodes[1].isSelf).toBe(false);
    // Era stats differ per-pill (date-range filtered)
    expect(doc.lineage.nodes[0].wins).toBe(16);    // 2005+2006 wins
    expect(doc.lineage.nodes[0].championships).toBe(2);
    expect(doc.lineage.nodes[1].wins).toBe(0);     // 2016-2020 wins
    expect(doc.lineage.nodes[1].championships).toBe(0);
  });

  it('falls back to ref-as-name and grey color when lookup returns null', () => {
    const orphanChain = [{
      id: 'orphan',
      nodes: [
        { ref: 'jordan', from: 1991, to: 2005 },
        { ref: 'ghost_team', from: 2010, to: 2012 },
      ],
    }];
    const doc = JSON.parse(JSON.stringify(teamDocs.jordan));
    buildLineageAttachment(doc, orphanChain, lookup);
    expect(doc.lineage.nodes[1]).toMatchObject({
      ref: 'ghost_team',
      name: 'ghost_team',
      color: '#888',
      seasons: 0,
    });
  });
});
```

- [ ] **Step 3.2: Run tests to verify failure**

```bash
npx vitest run scripts/lineages.test.js
```

Expected: 6 FAIL (`buildLineageAttachment is not a function`), 8 PASS (prior).

- [ ] **Step 3.3: Implement `buildLineageAttachment`**

Append to `scripts/lineages.mjs`:

```js
export function buildLineageAttachment(doc, chains, lookupTeam) {
  for (const chain of chains) {
    for (let idx = 0; idx < chain.nodes.length; idx++) {
      if (chain.nodes[idx].ref !== doc.constructorRef) continue;
      doc.lineage = {
        chainId: chain.id,
        selfIndex: idx,
        nodes: chain.nodes.map((n, i) => {
          const other = lookupTeam(n.ref);
          const stats = eraStats(other, n.from, n.to);
          return {
            ref: n.ref,
            name: other?.name ?? n.ref,
            displayNameOverride: n.displayNameOverride,
            color: other?.color ?? '#888',
            from: n.from,
            to: n.to,
            ...stats,
            isSelf: i === idx,
          };
        }),
      };
      return;
    }
  }
}
```

- [ ] **Step 3.4: Run tests to verify all pass**

```bash
npx vitest run scripts/lineages.test.js
```

Expected: PASS (14 tests).

- [ ] **Step 3.5: Commit**

```bash
git add scripts/lineages.mjs scripts/lineages.test.js
git commit -m "feat(lineages): attach lineage to team docs with per-era stats

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Curation seed (8 chains)

**Files:**
- Modify: `scripts/lineages.mjs`

- [ ] **Step 4.1: Replace the empty `lineages = []` with the seed**

In `scripts/lineages.mjs`, replace the `export const lineages = [];` line with:

```js
// Eight starter chains covering the modern grid's heritage plus a few
// short-lived 2010s outfits. Year ranges are inclusive on both ends;
// `to: null` means "current". Same ref appearing twice is allowed and
// renders as two separate pills.
//
// Notes on ref choices:
//   - Ergast uses `mf1` for the 2006 Midland team. We use `mf1` with
//     `displayNameOverride: 'Midland'` so the pill reads naturally.
//   - We skip Ergast's `spyker_mf1` (the 2006 mid-season rename); only
//     `spyker` (full 2007 season) is in the chain.
//   - Ergast uses `alfa` for the Alfa Romeo-sponsored Sauber era.
//   - Sauber's 2024-2025 entry stays as ref `sauber` in Ergast/the
//     2025 bundle; we use displayNameOverride 'Kick Sauber'.
//   - `lotus_f1` (2012-2015) is the Toleman/Renault Enstone line, not
//     related to Team Lotus or to `lotus_racing`/`caterham`.
//   - `team_lotus` (Colin Chapman's outfit, 1958-1994) is NOT in any
//     chain - solo and historic.

export const lineages = [
  {
    id: 'jordan-aston',
    nodes: [
      { ref: 'jordan',       from: 1991, to: 2005 },
      { ref: 'mf1',          from: 2006, to: 2006, displayNameOverride: 'Midland' },
      { ref: 'spyker',       from: 2007, to: 2007 },
      { ref: 'force_india',  from: 2008, to: 2018 },
      { ref: 'racing_point', from: 2019, to: 2020 },
      { ref: 'aston_martin', from: 2021, to: null },
    ],
  },
  {
    id: 'sauber-audi',
    nodes: [
      { ref: 'sauber',     from: 1993, to: 2005 },
      { ref: 'bmw_sauber', from: 2006, to: 2009 },
      { ref: 'sauber',     from: 2010, to: 2018 },
      { ref: 'alfa',       from: 2019, to: 2023 },
      { ref: 'sauber',     from: 2024, to: 2025, displayNameOverride: 'Kick Sauber' },
      { ref: 'audi',       from: 2026, to: null },
    ],
  },
  {
    id: 'tyrrell-mercedes',
    nodes: [
      { ref: 'tyrrell',  from: 1968, to: 1998 },
      { ref: 'bar',      from: 1999, to: 2005 },
      { ref: 'honda',    from: 2006, to: 2008 },
      { ref: 'brawn',    from: 2009, to: 2009 },
      { ref: 'mercedes', from: 2010, to: null },
    ],
  },
  {
    id: 'toleman-alpine',
    nodes: [
      { ref: 'toleman',  from: 1981, to: 1985 },
      { ref: 'benetton', from: 1986, to: 2001 },
      { ref: 'renault',  from: 2002, to: 2011 },
      { ref: 'lotus_f1', from: 2012, to: 2015 },
      { ref: 'renault',  from: 2016, to: 2020 },
      { ref: 'alpine',   from: 2021, to: null },
    ],
  },
  {
    id: 'stewart-redbull',
    nodes: [
      { ref: 'stewart',  from: 1997, to: 1999 },
      { ref: 'jaguar',   from: 2000, to: 2004 },
      { ref: 'red_bull', from: 2005, to: null },
    ],
  },
  {
    id: 'minardi-rb',
    nodes: [
      { ref: 'minardi',    from: 1985, to: 2005 },
      { ref: 'toro_rosso', from: 2006, to: 2019 },
      { ref: 'alphatauri', from: 2020, to: 2023 },
      { ref: 'rb',         from: 2024, to: null },
    ],
  },
  {
    id: 'lotus-caterham',
    nodes: [
      { ref: 'lotus_racing', from: 2010, to: 2011 },
      { ref: 'caterham',     from: 2012, to: 2014 },
    ],
  },
  {
    id: 'virgin-manor',
    nodes: [
      { ref: 'virgin',   from: 2010, to: 2011 },
      { ref: 'marussia', from: 2012, to: 2014 },
      { ref: 'manor',    from: 2015, to: 2016 },
    ],
  },
];
```

- [ ] **Step 4.2: Run tests to confirm nothing regressed**

```bash
npx vitest run scripts/lineages.test.js
```

Expected: PASS (14 tests). The new `lineages` array isn't directly tested here; it's exercised by Task 5's build step.

- [ ] **Step 4.3: Commit**

```bash
git add scripts/lineages.mjs
git commit -m "feat(lineages): seed 8 starter chains (Jordan-Aston, Sauber-Audi, etc.)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Wire into `build-archive.mjs`

**Files:**
- Modify: `scripts/build-archive.mjs` (around line 1994, after the post-Ergast bundle-synth team-doc loop)

- [ ] **Step 5.1: Locate the insertion point**

Open `scripts/build-archive.mjs` and find this block (currently around lines 1994-2000):

```js
}                                                          // line 1994 - closes the post-Ergast team loop

if (postArchiveTeamYears > 0) {                            // line 1996
  teamsIndex.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  writeFileSync(join(OUT, '_teams-index.json'), JSON.stringify(teamsIndex));
  console.log(`[archive] merged ${postArchiveTeamYears} post-Ergast team-year entries into ${teamDocCache.size} team docs (${newlyCreatedTeams.size} new)`);
}
```

The lineage pass must run **after** the post-Ergast loop (so synth'd teams like `audi` exist on disk) and **after** the teamsIndex sort/write (since `validateLineages` checks against the final teamsIndex).

- [ ] **Step 5.2: Add the lineage pass**

Insert the following block immediately after the `if (postArchiveTeamYears > 0) { ... }` block (i.e., after the `}` on what's currently line 2000, before the `// ─── Enrich index entries with last5 ...` comment around line 2002):

```js
// ─── Attach lineage to team docs in any curated chain ─────────────────
{
  const { lineages, validateLineages, buildLineageAttachment } = await import('./lineages.mjs');
  validateLineages(lineages, teamsIndex);

  const teamDocsByRef = new Map();
  function loadTeamDoc(ref) {
    if (teamDocsByRef.has(ref)) return teamDocsByRef.get(ref);
    const p = join(OUT, 'teams', `${ref}.json`);
    if (!existsSync(p)) {
      teamDocsByRef.set(ref, null);
      return null;
    }
    const doc = JSON.parse(readFileSync(p, 'utf8'));
    teamDocsByRef.set(ref, doc);
    return doc;
  }

  const allChainRefs = new Set();
  for (const chain of lineages) {
    for (const node of chain.nodes) allChainRefs.add(node.ref);
  }

  let lineageRefsTouched = 0;
  for (const ref of allChainRefs) {
    const doc = loadTeamDoc(ref);
    if (!doc) continue;
    buildLineageAttachment(doc, lineages, loadTeamDoc);
    writeFileSync(join(OUT, 'teams', `${ref}.json`), JSON.stringify(doc));
    lineageRefsTouched += 1;
  }
  console.log(`[archive] attached lineage to ${lineageRefsTouched} team docs across ${lineages.length} chains`);
}
```

- [ ] **Step 5.3: Run the build:archive script end-to-end**

```bash
npm run build:archive
```

Expected output ends with something like:

```
[archive] attached lineage to 30 team docs across 8 chains
```

(Exact count may vary by ±a few if some refs are missing from teamsIndex. If validation throws, fix the ref in `scripts/lineages.mjs` before continuing.)

- [ ] **Step 5.4: Eyeball a generated team doc**

```bash
node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('public/data/archive/teams/jordan.json','utf8')).lineage, null, 2))"
```

Expected: a `lineage` object with `chainId: 'jordan-aston'`, `selfIndex: 0`, and 6 nodes (Jordan, Midland, Spyker, Force India, Racing Point, Aston Martin) each carrying `seasons`, `wins`, `championships`, `isSelf`.

If any ref shows up as `name: '<ref>'` with `color: '#888'`, the team doc lookup failed for that ref - check whether that ref exists in `public/data/archive/teams/`.

- [ ] **Step 5.5: Run the full test suite to catch regressions**

```bash
npm test
```

Expected: 4 test files pass, 104 total (90 existing + 14 new).

- [ ] **Step 5.6: Commit**

```bash
git add scripts/build-archive.mjs
git commit -m "feat(archive): attach lineage info to chain-team JSON docs at build time

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `LineageStrip.astro` partial

**Files:**
- Create: `src/components/LineageStrip.astro`

- [ ] **Step 6.1: Create the component file**

Create `src/components/LineageStrip.astro`:

```astro
---
// Horizontal timeline strip showing every era of a constructor's lineage
// chain. Server-rendered, no client JS. Receives a fully-resolved lineage
// object (chainId, selfIndex, nodes[]) that build-archive.mjs has merged
// into the team doc via scripts/lineages.mjs.

interface LineageNode {
  ref: string;
  name: string;
  displayNameOverride?: string;
  color: string;
  from: number;
  to: number | null;
  seasons: number;
  wins: number;
  championships: number;
  isSelf: boolean;
}

interface Props {
  lineage: {
    chainId: string;
    selfIndex: number;
    nodes: LineageNode[];
  };
}

const { lineage } = Astro.props;
const { nodes } = lineage;

const totalSeasons = nodes.reduce((s, n) => s + n.seasons, 0);
const totalWins    = nodes.reduce((s, n) => s + n.wins, 0);
const totalTitles  = nodes.reduce((s, n) => s + n.championships, 0);

function formatYears(from: number, to: number | null): string {
  if (to == null) return `${from}-now`;
  if (to === from) return `${from}`;
  return `${from}-${to}`;
}
---

<div class="section-head">
  <h2>Lineage</h2>
  <div class="section-rule"></div>
  <span class="t-eyebrow lineage-summary">
    {nodes.length} eras &middot; {totalSeasons} seasons &middot; {totalWins}W &middot; {totalTitles}T
  </span>
</div>

<div class="panel lineage-strip">
  {nodes.map((n, i) => (
    <a
      class:list={['lin-node', n.isSelf && 'is-self']}
      style={`--c:${n.color};`}
      href={`/teams/${n.ref}/`}
      aria-current={n.isSelf ? 'page' : undefined}
    >
      <div class="lin-years">{formatYears(n.from, n.to)}</div>
      <div class="lin-name">
        <span class="lin-name-text">{n.displayNameOverride ?? n.name}</span>
        {n.championships > 0 && <span class="lin-star">&#9733;{n.championships}</span>}
      </div>
      <div class="lin-stats">
        {n.seasons} {n.seasons === 1 ? 'yr' : 'yrs'}
        {n.wins > 0 && (<span> &middot; <span class="win">{n.wins}W</span></span>)}
      </div>
      {i < nodes.length - 1 && <span class="lin-arrow" aria-hidden="true"></span>}
    </a>
  ))}
</div>

<style>
  .lineage-summary {
    margin-left: auto;
    color: var(--fg-3);
  }
  .lineage-strip {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: 2px;
    padding: 0;
    overflow: visible;
    margin-bottom: 24px;
  }
  .lin-node {
    position: relative;
    padding: 12px 12px 14px;
    border-top: 3px solid var(--c);
    background: color-mix(in srgb, var(--c) 8%, var(--bg-2));
    text-decoration: none;
    color: inherit;
    transition: background .15s;
    min-width: 0;
  }
  .lin-node + .lin-node { border-left: 1px solid var(--line-1); }
  .lin-node:hover { background: color-mix(in srgb, var(--c) 16%, var(--bg-2)); }
  .lin-node.is-self {
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--c) 28%, var(--bg-2)),
      color-mix(in srgb, var(--c) 8%, var(--bg-2)) 70%
    );
  }
  .lin-node.is-self:hover {
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--c) 38%, var(--bg-2)),
      color-mix(in srgb, var(--c) 14%, var(--bg-2)) 70%
    );
  }
  .lin-years {
    font-family: var(--f-mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    color: var(--fg-3);
  }
  .lin-name {
    font-family: var(--f-display);
    font-weight: 700;
    font-size: 14px;
    line-height: 1.15;
    margin: 2px 0 6px;
    color: var(--fg-1);
    display: flex;
    align-items: baseline;
    gap: 4px;
    min-width: 0;
  }
  .lin-name-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .lin-node.is-self .lin-name { color: var(--c); }
  .lin-star {
    color: var(--accent);
    font-weight: 700;
    font-size: 12px;
    flex-shrink: 0;
  }
  .lin-stats {
    font-family: var(--f-mono);
    font-size: 11px;
    color: var(--fg-3);
  }
  .lin-stats .win {
    color: var(--accent);
    font-weight: 700;
  }
  .lin-arrow {
    position: absolute;
    right: -7px;
    top: 26px;
    width: 12px;
    height: 12px;
    border-top: 1px solid var(--line-2);
    border-right: 1px solid var(--line-2);
    transform: rotate(45deg);
    background: var(--bg-2);
    z-index: 2;
  }
  @media (max-width: 720px) {
    .lineage-strip {
      grid-auto-flow: row;
      grid-auto-columns: auto;
      grid-template-columns: 1fr;
      gap: 4px;
    }
    .lin-node {
      border-top: 0;
      border-left: 3px solid var(--c);
    }
    .lin-node + .lin-node {
      border-left: 3px solid var(--c);
    }
    .lin-arrow {
      right: auto;
      left: 50%;
      top: auto;
      bottom: -8px;
      transform: translateX(-50%) rotate(135deg);
    }
  }
</style>
```

- [ ] **Step 6.2: Commit**

```bash
git add src/components/LineageStrip.astro
git commit -m "feat(team-page): add LineageStrip Astro partial

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Wire `LineageStrip` into `TeamPage.astro`

**Files:**
- Modify: `src/components/TeamPage.astro`

- [ ] **Step 7.1: Add `lineage` to the `team` Props type**

In `src/components/TeamPage.astro`, find the `interface Props` block (currently lines 10-51). Add `lineage` as an optional field on the inner `team` object, right after `bestSeason`:

```ts
    bestSeason: {
      year: number;
      position: number | null;
      points: number | null;
      wins: number;
      races: number;
      winRate: number;
      tagline: string;
      drivers: Array<{ driverRef: string; name: string }>;
    } | null;
    lineage?: {
      chainId: string;
      selfIndex: number;
      nodes: Array<{
        ref: string;
        name: string;
        displayNameOverride?: string;
        color: string;
        from: number;
        to: number | null;
        seasons: number;
        wins: number;
        championships: number;
        isSelf: boolean;
      }>;
    };
```

- [ ] **Step 7.2: Import `LineageStrip`**

Near the top of the frontmatter (currently line 8 has `import Flag from './Flag.astro';`), add:

```ts
import LineageStrip from './LineageStrip.astro';
```

- [ ] **Step 7.3: Render the section after Notable Drivers**

Find the "Notable Drivers" block (currently lines 265-286). It closes with `</>` and `)}`. Immediately after that closing `)}` (so still inside the `<div class="page">` wrapper, before "Season by Season"), insert:

```astro
  {team.lineage && team.lineage.nodes.length >= 2 && (
    <LineageStrip lineage={team.lineage} />
  )}
```

- [ ] **Step 7.4: Run the full Astro build**

```bash
npm run build
```

Expected: build completes without errors. Should emit ~2310 HTML files including the ~212 team pages.

If the build fails on a team page template error, the most likely cause is the `class:list` directive - it's standard Astro syntax but ensure no typo.

- [ ] **Step 7.5: Spot-check the generated HTML**

```bash
node -e "const html = require('fs').readFileSync('dist/teams/jordan/index.html','utf8'); console.log(html.match(/<h2>Lineage<\/h2>[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? 'NO LINEAGE SECTION')"
```

Expected: a chunk of HTML starting with `<h2>Lineage</h2>` containing 6 `<a class="lin-node ...">` elements. If you get `NO LINEAGE SECTION`, double-check that the build-archive lineage attachment ran and produced `public/data/archive/teams/jordan.json` with a `lineage` field.

Also verify Ferrari (solo team) gets NO section:

```bash
node -e "console.log(require('fs').readFileSync('dist/teams/ferrari/index.html','utf8').includes('<h2>Lineage</h2>'))"
```

Expected: `false`.

- [ ] **Step 7.6: Commit**

```bash
git add src/components/TeamPage.astro
git commit -m "feat(team-page): render LineageStrip after Notable Drivers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Visual verification

**Files:** none (manual check)

- [ ] **Step 8.1: Ask user which dev-server port to use**

Per the per-worktree-port memory, the user runs dev servers on ports 4321-4325, one per worktree. Ask:

> "Which dev port should I use for the lineage-tree worktree? (e.g. 4322, 4323, etc.)"

Wait for the answer before running the dev server.

- [ ] **Step 8.2: Start the dev server on the chosen port**

```bash
npm run dev -- --port <PORT>
```

Note: `predev` will rerun `build:archive` and `sync:current` first. That's expected.

- [ ] **Step 8.3: Visit the four spot-check teams**

Use the preview tools (`preview_*`) or the user's browser to check:

1. `http://localhost:<PORT>/teams/jordan/` - 6 pills, "Jordan" highlighted as self, championship star NOT present.
2. `http://localhost:<PORT>/teams/force_india/` - same 6 pills, "Force India" highlighted.
3. `http://localhost:<PORT>/teams/mercedes/` - 5 pills (Tyrrell → BAR → Honda → Brawn → Mercedes), "Mercedes" highlighted with a championship star ★8 (or current count).
4. `http://localhost:<PORT>/teams/ferrari/` - **no Lineage section** at all.

For each, the pill summary line should read `N eras · M seasons · KW · LT` with numbers that look right (not all zero).

- [ ] **Step 8.4: Mobile breakpoint**

Open DevTools, set viewport to 360px wide, reload `/teams/jordan/`. Pills should stack vertically. Each pill still shows year/name/stats. Arrow indicators rotate to point down (or are visually present below each non-last pill).

- [ ] **Step 8.5: Stop the dev server**

Kill the dev server process.

- [ ] **Step 8.6: Commit any tweaks**

If Step 8.3 or 8.4 surfaces a visual issue, fix it in `src/components/LineageStrip.astro` and commit with a `fix(lineages):` message. If nothing needs fixing, skip this step.

---

## Task 9: Wrap up

**Files:** none

- [ ] **Step 9.1: Run all tests one final time**

```bash
npm test
```

Expected: PASS (104 total).

- [ ] **Step 9.2: Run a full build to confirm CI will pass**

```bash
npm run build
```

Expected: succeeds with ~2310 pages generated.

- [ ] **Step 9.3: Review the commit log**

```bash
git log --oneline main..HEAD
```

Expected: 7-8 small, focused commits (one per Task 1-7, optionally one for Task 8.6 tweaks).

- [ ] **Step 9.4: Hand off**

Plan complete. User can then invoke the `finishing-a-development-branch` skill to decide between merging, opening a PR, or further iteration.

---

## Self-Review Checklist

The plan author verified before commit:

- **Spec coverage:** Every section of [2026-05-19-constructor-lineage-design.md](../specs/2026-05-19-constructor-lineage-design.md) maps to a task:
  - Data source -> Task 1 (skeleton) + Task 4 (seed)
  - Build-time computation -> Task 1, 2, 3, 5
  - Rendering -> Task 6
  - Curation seed (8 chains) -> Task 4
  - Testing -> Task 1.1, 2.1, 3.1; full suite in Task 5.5; build verification in Task 7.5; visual in Task 8
  - Audi 2026 ordering -> Task 5.1 (insertion point explicitly after post-Ergast bundle-synth)

- **Placeholder scan:** No TBDs, no "add error handling", no "similar to Task N". Every step has either exact code or an exact shell command with expected output.

- **Type consistency:** Node shape `{ ref, name, displayNameOverride, color, from, to, seasons, wins, championships, isSelf }` is identical across Task 3 implementation, Task 6 Astro Props, and Task 7 TeamPage Props. Function names `eraStats`, `validateLineages`, `buildLineageAttachment` are consistent throughout.
