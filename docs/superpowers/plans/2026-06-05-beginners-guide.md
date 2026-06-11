# Beginner's Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a beginner's F1 guide — a `/guide/` hub plus 10 short sub-pages aimed at newcomers who want to follow race-strategy commentary — and a mobile "More" bottom-sheet that exposes the site sections currently missing from the 4-slot bottom nav.

**Architecture:** Pure server-rendered Astro, mirroring the existing `/records/` and `/blog/` patterns. Guide content is an Astro content collection (`guide`) of MDX files. Two routes: a hub (`src/pages/guide/index.astro`) and a dynamic sub-page route (`src/pages/guide/[slug].astro`). Ordering/related-link logic lives in a tiny tested helper module (`src/lib/guide.ts`). Navigation changes are in `src/components/Chrome.astro` + `public/css/app.css`; the More menu is static markup toggled by a ~20-line inline script (no React island).

**Tech Stack:** Astro 4 (content collections, `getCollection`, MDX), Zod (collection schema), Vitest (unit tests for the helper), plain CSS custom properties (design tokens).

---

## File structure

**Create:**
- `src/lib/guide.ts` — pure helpers: filter drafts, sort by `order`, resolve `related[]` slugs, compute prev/next. Unit-tested.
- `src/lib/guide.test.js` — Vitest unit tests for the helpers.
- `src/pages/guide/index.astro` — the hub page.
- `src/pages/guide/[slug].astro` — the dynamic sub-page route.
- `src/content/guide/*.mdx` — 10 content files (one per topic).

**Modify:**
- `src/content/config.ts` — add the `guide` collection + export it.
- `src/components/Chrome.astro` — desktop Guide link, route detection, mobile bottom nav (4 slots incl. More), More bottom-sheet markup + inline toggle script.
- `public/css/app.css` — styles for the More sheet + backdrop (both themes).
- `src/components/islands/screens/RaceScreen.jsx` (or wherever the Sprint badge renders — confirm in Task 9) — link Sprint badge to `/guide/race-weekend-format/`.
- Standings screen header (confirm exact file in Task 10) — link "Pts" header to `/guide/points-system/`.
- `src/pages/index.astro` or the Home island — add a "New to F1?" link to `/guide/`.

---

## Task 1: Add the `guide` content collection

**Files:**
- Modify: `src/content/config.ts`

- [ ] **Step 1: Add the collection definition**

In `src/content/config.ts`, after the `blog` collection definition (before the `collections` export), add:

```ts
const guide = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string().max(120),
    order: z.number().int().positive(),
    summary: z.string().min(40).max(200),
    related: z.array(z.string()).default([]),
    updatedAt: z.coerce.date().optional(),
    draft: z.boolean().default(false),
  }),
});
```

- [ ] **Step 2: Export the collection**

Change the final line of `src/content/config.ts` from:

```ts
export const collections = { blog };
```

to:

```ts
export const collections = { blog, guide };
```

- [ ] **Step 3: Verify the config compiles**

Run: `npx astro sync`
Expected: completes without error; `.astro/` types regenerate. (No `guide` content exists yet — that's fine; the collection can be empty.)

- [ ] **Step 4: Commit**

```bash
git add src/content/config.ts
git commit -m "feat(guide): add guide content collection schema"
```

---

## Task 2: Guide helper module + tests (TDD)

The hub and sub-page both need: published-only filtering, sort-by-`order`, prev/next, and resolving `related[]` slugs to entries (dropping unknown/draft slugs). Extract this into a pure, testable module so the `.astro` pages stay thin.

The helpers operate on a minimal shape so they can be unit-tested without the Astro content runtime:

```ts
type GuideLike = {
  slug: string;
  data: { title: string; order: number; summary: string; related?: string[]; draft?: boolean; updatedAt?: Date };
};
```

**Files:**
- Create: `src/lib/guide.ts`
- Test: `src/lib/guide.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/guide.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { isPublishedGuide, sortGuides, resolveRelated, prevNext } from './guide.ts';

const mk = (slug, order, related = [], draft = false) => ({
  slug,
  data: { title: slug.toUpperCase(), order, summary: 'x'.repeat(40), related, draft },
});

const PAGES = [
  mk('drs', 7, ['overtaking', 'nope']),
  mk('overtaking', 6, ['drs', 'tyres']),
  mk('tyres', 5),
  mk('secret', 99, [], true),
];

describe('isPublishedGuide', () => {
  it('keeps non-draft pages', () => {
    expect(isPublishedGuide(mk('drs', 7))).toBe(true);
  });
  it('drops draft pages in production', () => {
    // import.meta.env.PROD is false under vitest, so drafts are kept in dev/test.
    // We assert the draft flag is the only thing that can hide a page.
    expect(mk('secret', 99, [], true).data.draft).toBe(true);
  });
});

describe('sortGuides', () => {
  it('sorts ascending by order', () => {
    const sorted = sortGuides([mk('b', 5), mk('a', 1), mk('c', 9)]);
    expect(sorted.map((p) => p.slug)).toEqual(['a', 'b', 'c']);
  });
  it('does not mutate the input array', () => {
    const input = [mk('b', 5), mk('a', 1)];
    sortGuides(input);
    expect(input.map((p) => p.slug)).toEqual(['b', 'a']);
  });
});

describe('resolveRelated', () => {
  it('resolves known slugs in related order', () => {
    const rel = resolveRelated(PAGES[0], PAGES); // drs -> ['overtaking','nope']
    expect(rel.map((p) => p.slug)).toEqual(['overtaking']); // 'nope' dropped
  });
  it('drops draft targets', () => {
    const page = mk('x', 2, ['secret']);
    expect(resolveRelated(page, PAGES)).toEqual([]);
  });
  it('returns [] when related is missing', () => {
    expect(resolveRelated(mk('y', 3), PAGES)).toEqual([]);
  });
});

describe('prevNext', () => {
  it('returns neighbours by order', () => {
    const sorted = sortGuides(PAGES.filter((p) => !p.data.draft)); // tyres(5), overtaking(6), drs(7)
    const { prev, next } = prevNext(sorted, 'overtaking');
    expect(prev.slug).toBe('tyres');
    expect(next.slug).toBe('drs');
  });
  it('returns null at the ends', () => {
    const sorted = sortGuides(PAGES.filter((p) => !p.data.draft));
    expect(prevNext(sorted, 'tyres').prev).toBeNull();
    expect(prevNext(sorted, 'drs').next).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/guide.test.js`
Expected: FAIL — `Failed to resolve import './guide.ts'` / functions not defined.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/guide.ts`:

```ts
import type { CollectionEntry } from 'astro:content';

type Guide = CollectionEntry<'guide'>;

// Minimal duck-typed shape so the helpers are unit-testable without the
// content runtime (the test passes plain objects with the same shape).
type GuideLike = { slug: string; data: { order: number; related?: string[]; draft?: boolean } };

export function isPublishedGuide<T extends GuideLike>(page: T): boolean {
  if (page.data.draft && import.meta.env.PROD) return false;
  return true;
}

export function sortGuides<T extends GuideLike>(pages: T[]): T[] {
  return [...pages].sort((a, b) => a.data.order - b.data.order);
}

export function resolveRelated<T extends GuideLike>(page: T, all: T[]): T[] {
  const bySlug = new Map(all.filter((p) => !p.data.draft).map((p) => [p.slug, p]));
  return (page.data.related ?? [])
    .map((slug) => bySlug.get(slug))
    .filter((p): p is T => Boolean(p) && p!.slug !== page.slug);
}

export function prevNext<T extends GuideLike>(sorted: T[], slug: string): { prev: T | null; next: T | null } {
  const i = sorted.findIndex((p) => p.slug === slug);
  if (i < 0) return { prev: null, next: null };
  return {
    prev: i > 0 ? sorted[i - 1] : null,
    next: i < sorted.length - 1 ? sorted[i + 1] : null,
  };
}

// Convenience for pages: filter + sort in one call.
export function publishedGuidesSorted(all: Guide[]): Guide[] {
  return sortGuides(all.filter(isPublishedGuide));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/guide.test.js`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/guide.ts src/lib/guide.test.js
git commit -m "feat(guide): tested helpers for ordering and related links"
```

---

## Task 3: Author the 10 guide MDX pages

Create one MDX file per topic in `src/content/guide/`. Each file is a few hundred words of beginner-friendly prose with `##` subheadings. Current-era (~2024–2026) framing. The full prose is drafted by the implementer using the outlines below; each file MUST have valid frontmatter matching the Task 1 schema (note `summary` is 40–200 chars).

**Files (create all):**
- `src/content/guide/race-weekend-format.mdx`
- `src/content/guide/points-system.mdx`
- `src/content/guide/flags-and-signals.mdx`
- `src/content/guide/pit-stops-and-strategy.mdx`
- `src/content/guide/tyres.mdx`
- `src/content/guide/overtaking.mdx`
- `src/content/guide/drs.mdx`
- `src/content/guide/safety-cars.mdx`
- `src/content/guide/hybrid-power-unit.mdx`
- `src/content/guide/penalties.mdx`

- [ ] **Step 1: Write `race-weekend-format.mdx`**

```mdx
---
title: "The Race Weekend"
order: 1
summary: "How a Grand Prix weekend is structured — practice, qualifying, sprints and the race itself."
related: ["points-system", "tyres"]
---

A standard Formula 1 weekend runs over three days...

## Practice
Three one-hour sessions (FP1, FP2, FP3)...

## Qualifying
A knockout format split into Q1, Q2 and Q3...

## Sprint weekends
Six events a year replace one practice session with a Sprint Qualifying and a short Sprint race...

## The Grand Prix
Sunday's main event...
```

Fill the body with complete prose (cover: Friday practice, Saturday qualifying knockout Q1/Q2/Q3 with elimination counts, the 6 sprint weekends and how they differ, Sunday race distance ~305 km / 2-hour limit).

- [ ] **Step 2: Write `points-system.mdx`**

```mdx
---
title: "Points & Scoring"
order: 2
summary: "How drivers and teams score — the 25-to-1 race points, sprint points, and the fastest-lap rule."
related: ["race-weekend-format"]
---
```
Body: top-10 race points table (25-18-15-12-10-8-6-4-2-1), sprint points (top 8: 8-7-…-1), that the fastest-lap bonus point was scrapped after 2024, how driver vs constructor points accumulate.

- [ ] **Step 3: Write `flags-and-signals.mdx`**

```mdx
---
title: "Flags & Signals"
order: 3
summary: "What each marshal flag means — yellow, red, blue, green, white, black and the chequered flag."
related: ["safety-cars", "penalties"]
---
```
Body: yellow / double-yellow (slow, no overtaking), red (session stopped), blue (let leaders past), green (clear), white (slow vehicle), black & black-orange (penalties / mechanical), chequered (end).

- [ ] **Step 4: Write `pit-stops-and-strategy.mdx`**

```mdx
---
title: "Pit Stops & Strategy"
order: 4
summary: "Why teams pit, what a sub-3-second stop involves, and an intro to the undercut and overcut."
related: ["tyres", "overtaking"]
---
```
Body: mechanics of a stop (~2.5s, ~20 crew), the mandatory pit stop / two-compound rule in dry races, the "pit window", quick intro to undercut/overcut (full detail lives in `overtaking`).

- [ ] **Step 5: Write `tyres.mdx`**

```mdx
---
title: "Tyres"
order: 5
summary: "Slicks versus wets, the C1–C5 dry compounds, the mandatory-compound rule and tyre degradation."
related: ["pit-stops-and-strategy", "overtaking"]
---
```
Body: Pirelli C1 (hardest) → C5 (softest) and how three are chosen per weekend as hard/medium/soft, intermediates vs full wets, the must-use-two-compounds rule, what "deg" and the "cliff" mean.

- [ ] **Step 6: Write `overtaking.mdx`**

```mdx
---
title: "Overtaking"
order: 6
summary: "How drivers pass — slipstream, DRS trains, dive-bombs versus switchbacks, and the undercut."
related: ["drs", "tyres"]
---
```
Body: slipstream/tow, dirty air, the DRS train problem, classic moves (dive-bomb vs switchback), the undercut/overcut explained in full with a worked example.

- [ ] **Step 7: Write `drs.mdx`**

```mdx
---
title: "DRS"
order: 7
summary: "The Drag Reduction System — what it does, the one-second rule, activation zones and when it's disabled."
related: ["overtaking", "race-weekend-format"]
---
```
Body: what the moveable rear wing does, detection points + the within-1-second rule, designated activation zones, free use in practice/qualifying, disabled in wet/yellow conditions and first laps.

- [ ] **Step 8: Write `safety-cars.mdx`**

```mdx
---
title: "Safety Cars"
order: 8
summary: "Safety Car versus Virtual Safety Car versus red flag — and why they shake up the strategy."
related: ["pit-stops-and-strategy", "flags-and-signals"]
---
```
Body: full SC (bunches the field, restart procedure), VSC (delta speed, no bunching), red flag (stopped + free tyre change), why a well-timed SC gives a "cheap" pit stop.

- [ ] **Step 9: Write `hybrid-power-unit.mdx`**

```mdx
---
title: "The Power Unit"
order: 9
summary: "A light-touch look at the hybrid engine — the V6, the ERS energy recovery, and what 'deploy' means."
related: ["drs"]
---
```
Body: 1.6L V6 turbo + electric motor (ERS) at a beginner level, energy harvesting and deployment, what commentators mean by "out of battery" / "deploying". Keep it light — no engineering depth. (Optionally cross-reference the existing blog post `/blog/2026-power-unit-regulations-explained/` for depth.)

- [ ] **Step 10: Write `penalties.mdx`**

```mdx
---
title: "Penalties"
order: 10
summary: "Time penalties, drive-throughs, stop-go, grid drops and licence points — how rule-breaks are punished."
related: ["flags-and-signals", "safety-cars"]
---
```
Body: 5s/10s time penalties (served at a stop or added to race time), drive-through, stop-go (10s stationary), grid-position drops, the 12-point super-licence system and race bans.

- [ ] **Step 11: Verify all pages parse and the collection builds**

Run: `npx astro sync && npx astro check 2>&1 | head -40`
Expected: no schema validation errors for the `guide` collection. (Pre-existing unrelated `astro check` warnings elsewhere are acceptable; there must be no errors mentioning `src/content/guide/`.)

If `astro check` is too noisy, fall back to confirming the build succeeds after Task 5 (Task 5 Step 3).

- [ ] **Step 12: Commit**

```bash
git add src/content/guide/
git commit -m "feat(guide): author 10 beginner guide pages"
```

---

## Task 4: Guide hub page (`/guide/`)

**Files:**
- Create: `src/pages/guide/index.astro`

- [ ] **Step 1: Create the hub page**

Create `src/pages/guide/index.astro`:

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import { publishedGuidesSorted } from '../../lib/guide';

const pages = publishedGuidesSorted(await getCollection('guide'));
const alpha = [...pages].sort((a, b) => a.data.title.localeCompare(b.data.title));

const title = 'F1 for Beginners - A Guide to Following the Race | f1gures';
const description = 'New to Formula 1? Learn the race weekend, points, tyres, DRS, safety cars and strategy so you can follow every race like a regular.';
const canonicalPath = '/guide/';
const breadcrumb = [
  { name: 'Home', path: '/' },
  { name: 'Guide', path: '/guide/' },
];

const ORIGIN = 'https://f1gures.app';
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'F1 Beginner’s Guide',
  url: ORIGIN + canonicalPath,
  mainEntity: {
    '@type': 'ItemList',
    numberOfItems: pages.length,
    itemListElement: pages.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${ORIGIN}/guide/${p.slug}/`,
      name: p.data.title,
    })),
  },
};
---
<BaseLayout
  title={title}
  description={description}
  canonicalPath={canonicalPath}
  ogType="website"
  jsonLd={jsonLd}
  breadcrumb={breadcrumb}
>
  <div class="page guide-hub">
    <div class="page-head">
      <div>
        <div class="t-eyebrow">f1gures</div>
        <h1 class="page-title">F1 for Beginners</h1>
        <p class="page-sub">Everything you need to follow a Grand Prix and understand the commentary - the weekend format, points, tyres, strategy and the rules.</p>
      </div>
    </div>

    <section class="guide-starthere">
      <div class="section-head"><h2>Start here</h2></div>
      <ol class="guide-reading-list">
        {pages.map((p, i) => (
          <li class="guide-reading-item">
            <a class="panel guide-reading-link" href={`/guide/${p.slug}/`}>
              <span class="guide-reading-num t-mono">{String(i + 1).padStart(2, '0')}</span>
              <span class="guide-reading-text">
                <span class="guide-reading-title">{p.data.title}</span>
                <span class="guide-reading-sum">{p.data.summary}</span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </section>

    <section class="guide-browse">
      <div class="section-head"><h2>Browse by topic</h2></div>
      <div class="guide-grid">
        {alpha.map((p) => (
          <a class="panel guide-card" href={`/guide/${p.slug}/`}>
            <span class="guide-card-title">{p.data.title}</span>
            <span class="guide-card-sum">{p.data.summary}</span>
          </a>
        ))}
      </div>
    </section>
  </div>
</BaseLayout>
```

- [ ] **Step 2: Verify the hub builds and renders**

Run: `npm run dev` (or if already running, reload). Open `http://localhost:4321/guide/`.
Expected: page renders with a numbered "Start here" list of 10 items and an alpha "Browse by topic" grid. No console errors. (Styling is rough until Task 7 adds polish — the `panel`, `section-head`, `t-eyebrow`, `t-mono`, `page-*` classes already exist and give a usable baseline.)

- [ ] **Step 3: Commit**

```bash
git add src/pages/guide/index.astro
git commit -m "feat(guide): hub page with reading-order and topic grid"
```

---

## Task 5: Guide sub-page route (`/guide/<slug>/`)

**Files:**
- Create: `src/pages/guide/[slug].astro`

- [ ] **Step 1: Create the sub-page route**

Create `src/pages/guide/[slug].astro`:

```astro
---
import { getCollection, type CollectionEntry } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import { publishedGuidesSorted, resolveRelated, prevNext, isPublishedGuide } from '../../lib/guide';

export async function getStaticPaths() {
  const pages = (await getCollection('guide')).filter(isPublishedGuide);
  return pages.map((page) => ({ params: { slug: page.slug }, props: { page } }));
}

interface Props { page: CollectionEntry<'guide'>; }
const { page } = Astro.props;
const { Content } = await page.render();

const all = await getCollection('guide');
const sorted = publishedGuidesSorted(all);
const related = resolveRelated(page, all);
const { prev, next } = prevNext(sorted, page.slug);

const canonicalPath = `/guide/${page.slug}/`;
const ORIGIN = 'https://f1gures.app';
const breadcrumb = [
  { name: 'Home', path: '/' },
  { name: 'Guide', path: '/guide/' },
  { name: page.data.title, path: canonicalPath },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: page.data.title,
  description: page.data.summary,
  ...(page.data.updatedAt ? { dateModified: page.data.updatedAt.toISOString() } : {}),
  author: { '@type': 'Organization', name: 'f1gures', url: ORIGIN + '/' },
  publisher: {
    '@type': 'Organization',
    name: 'f1gures',
    url: ORIGIN + '/',
    logo: { '@type': 'ImageObject', url: ORIGIN + '/images/og-default.png' },
  },
  mainEntityOfPage: { '@type': 'WebPage', '@id': ORIGIN + canonicalPath },
};
---
<BaseLayout
  title={`${page.data.title} - F1 Beginner's Guide | f1gures`}
  description={page.data.summary}
  canonicalPath={canonicalPath}
  ogType="article"
  jsonLd={jsonLd}
  breadcrumb={breadcrumb}
>
  <article class="page guide-article">
    <a class="btn btn-ghost btn-sm" style="margin-bottom: 12px" href="/guide/">← Guide</a>

    <div class="guide-article-head">
      <div class="t-eyebrow">F1 Beginner's Guide</div>
      <h1 class="page-title">{page.data.title}</h1>
      <p class="guide-article-lede">{page.data.summary}</p>
    </div>

    <div class="guide-article-body">
      <Content />
    </div>

    {related.length > 0 && (
      <section class="guide-related">
        <div class="section-head"><h2>Related</h2></div>
        <div class="guide-grid">
          {related.map((r) => (
            <a class="panel guide-card" href={`/guide/${r.slug}/`}>
              <span class="guide-card-title">{r.data.title}</span>
              <span class="guide-card-sum">{r.data.summary}</span>
            </a>
          ))}
        </div>
      </section>
    )}

    {(prev || next) && (
      <nav class="guide-pager" aria-label="Guide navigation">
        {prev ? (
          <a class="panel guide-pager-link" href={`/guide/${prev.slug}/`}>
            <span class="t-eyebrow">Previous</span>
            <span class="guide-pager-title">{prev.data.title}</span>
          </a>
        ) : <span></span>}
        {next ? (
          <a class="panel guide-pager-link guide-pager-next" href={`/guide/${next.slug}/`}>
            <span class="t-eyebrow">Next</span>
            <span class="guide-pager-title">{next.data.title}</span>
          </a>
        ) : <span></span>}
      </nav>
    )}
  </article>
</BaseLayout>
```

- [ ] **Step 2: Verify a sub-page renders with related + pager**

Run: reload dev server. Open `http://localhost:4321/guide/overtaking/`.
Expected: breadcrumb, H1 "Overtaking", lede, MDX body, a "Related" section with cards (drs, tyres), and a prev/next pager (Previous: Tyres, Next: DRS). No console errors. Open `/guide/race-weekend-format/` and confirm the pager shows no "Previous" (it's order 1). Open `/guide/penalties/` and confirm no "Next" (order 10).

- [ ] **Step 3: Full build smoke test**

Run: `npm run build`
Expected: build succeeds; `dist/guide/index.html` and `dist/guide/<slug>/index.html` exist for all 10 slugs (e.g. `dist/guide/drs/index.html`).

Verify with: `git status` won't show dist (gitignored); instead run
`node -e "const fs=require('fs');console.log(fs.existsSync('dist/guide/drs/index.html'), fs.existsSync('dist/guide/index.html'))"`
Expected: `true true`

- [ ] **Step 4: Commit**

```bash
git add src/pages/guide/[slug].astro
git commit -m "feat(guide): sub-page route with related links and pager"
```

---

## Task 6: Navigation — desktop link, bottom nav, More sheet

This task touches `src/components/Chrome.astro` only. The More sheet is static markup toggled by an inline script (no React island), matching the records era-toggle pattern.

**Files:**
- Modify: `src/components/Chrome.astro`

- [ ] **Step 1: Add guide route detection + More active state**

In the frontmatter `route` object (currently ending at `blog:` around line 28), add a `guide` entry:

```ts
  blog:        isRoute('/blog'),
  guide:       isRoute('/guide'),
```

Then update the `botActive` computation. The four visible slots are home / standings / calendar / more. "More" should light up whenever the current route is one of the sections that live *inside* the More menu (circuits, drivers, teams, records, guide, blog) and isn't one of the three other slots. Replace the existing `botActive` block with:

```ts
const inMore =
  route.circuits || route.drivers || route.teams || route.blog || route.guide ||
  isRoute('/records');
const botActive =
  route.home       ? 'home' :
  route.standings  ? 'standings' :
  route.calendar   ? 'calendar' :
  inMore           ? 'more' : null;
```

Note: `route.standings` already includes `/records` (see line 23), so a records page resolves to `standings` first — that's fine and consistent with the desktop dropdown placement. The `isRoute('/records')` in `inMore` is harmless and future-proofs against that grouping changing.

- [ ] **Step 2: Add the desktop Guide link**

In the `.nav-items` block, after the Blog link (line 54), add:

```astro
      <a class:list={['nav-item', { active: route.guide }]} href="/guide/">Guide</a>
```

- [ ] **Step 3: Replace the mobile bottom nav with 4 slots incl. More**

Replace the entire `<nav class="botnav botnav-mobile">…</nav>` block (lines 90–103) with:

```astro
  <!-- Mobile bottom nav (static) -->
  <nav class="botnav botnav-mobile">
    <a class:list={['botnav-item', { active: botActive === 'home' }]} href="/">
      <span class="botnav-icon">◇</span><span>Home</span>
    </a>
    <a class:list={['botnav-item', { active: botActive === 'standings' }]} href="/standings-drivers/">
      <span class="botnav-icon">≡</span><span>Standings</span>
    </a>
    <a class:list={['botnav-item', { active: botActive === 'calendar' }]} href="/calendar/">
      <span class="botnav-icon">▦</span><span>Calendar</span>
    </a>
    <button
      type="button"
      class:list={['botnav-item', { active: botActive === 'more' }]}
      data-more-trigger
      aria-expanded="false"
      aria-controls="more-sheet"
      aria-label="More sections"
    >
      <span class="botnav-icon">⋯</span><span>More</span>
    </button>
  </nav>

  <!-- Mobile "More" bottom sheet -->
  <div class="more-backdrop" data-more-backdrop hidden></div>
  <div id="more-sheet" class="more-sheet" data-more-sheet role="dialog" aria-modal="false" aria-label="More sections" hidden>
    <div class="more-sheet-handle" aria-hidden="true"></div>
    <nav class="more-sheet-links">
      <a class="more-sheet-link" href="/guide/"><span class="more-sheet-ic">?</span>Guide</a>
      <a class="more-sheet-link" href="/circuits/"><span class="more-sheet-ic">○</span>Circuits</a>
      <a class="more-sheet-link" href="/drivers/"><span class="more-sheet-ic">◇</span>Drivers</a>
      <a class="more-sheet-link" href="/teams/"><span class="more-sheet-ic">▤</span>Teams</a>
      <a class="more-sheet-link" href="/records/"><span class="more-sheet-ic">★</span>Records</a>
      <a class="more-sheet-link" href="/blog/"><span class="more-sheet-ic">◈</span>Blog</a>
    </nav>
  </div>
```

- [ ] **Step 4: Add the inline toggle script**

Immediately after the existing `<script is:inline>…</script>` block at the bottom of the file (after line 116), add a second inline script:

```astro
<script is:inline>
  (function () {
    var trigger = document.querySelector('[data-more-trigger]');
    var sheet = document.querySelector('[data-more-sheet]');
    var backdrop = document.querySelector('[data-more-backdrop]');
    if (!trigger || !sheet || !backdrop) return;
    function setOpen(open) {
      trigger.setAttribute('aria-expanded', String(open));
      trigger.classList.toggle('active', open);
      if (open) { sheet.hidden = false; backdrop.hidden = false; }
      // rAF so the transition runs after `hidden` is cleared
      requestAnimationFrame(function () {
        sheet.classList.toggle('open', open);
        backdrop.classList.toggle('open', open);
      });
      if (!open) {
        setTimeout(function () {
          if (!sheet.classList.contains('open')) { sheet.hidden = true; backdrop.hidden = true; }
        }, 220);
      }
    }
    trigger.addEventListener('click', function () {
      setOpen(trigger.getAttribute('aria-expanded') !== 'true');
    });
    backdrop.addEventListener('click', function () { setOpen(false); trigger.focus(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && trigger.getAttribute('aria-expanded') === 'true') {
        setOpen(false); trigger.focus();
      }
    });
    // Links navigate (closing happens via page unload); no extra handler needed.
  })();
</script>
```

- [ ] **Step 5: Verify desktop nav (no functional regression yet)**

Run: reload dev server at desktop width. Open `http://localhost:4321/guide/`.
Expected: desktop top nav shows a new "Guide" item, highlighted/active on guide pages. All existing links still work.

- [ ] **Step 6: Commit**

```bash
git add src/components/Chrome.astro
git commit -m "feat(nav): desktop Guide link + mobile More bottom-sheet"
```

---

## Task 7: Style the guide pages + More sheet (both themes)

**Files:**
- Modify: `public/css/app.css`

- [ ] **Step 1: Append guide + more-sheet styles**

Add to the end of `public/css/app.css` (use existing tokens only — no hardcoded hex; `--panel`, `--bg-1`, `--line-2`, `--fg-1/2/3`, `--accent`, `--sp-*`, `--f-display`, `--f-mono`, `--botnav-h` already exist):

```css
/* ============================================================
   GUIDE
   ============================================================ */
.guide-starthere, .guide-browse, .guide-related { margin-top: 28px; }
.guide-reading-list { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 8px; }
.guide-reading-link {
  display: flex; align-items: center; gap: 14px; padding: 14px 16px;
  text-decoration: none; color: inherit;
}
.guide-reading-link:hover { border-color: var(--accent); }
.guide-reading-num { font-size: 18px; color: var(--accent); font-weight: 700; min-width: 28px; }
.guide-reading-text { display: flex; flex-direction: column; gap: 2px; }
.guide-reading-title { font-family: var(--f-display); font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; font-size: 15px; }
.guide-reading-sum { color: var(--fg-3); font-size: 13px; }

.guide-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 12px; }
.guide-card { display: flex; flex-direction: column; gap: 6px; padding: 16px; text-decoration: none; color: inherit; }
.guide-card:hover { border-color: var(--accent); }
.guide-card-title { font-family: var(--f-display); font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; font-size: 14px; }
.guide-card-sum { color: var(--fg-3); font-size: 12.5px; line-height: 1.45; }
@media (max-width: 720px) { .guide-grid { grid-template-columns: 1fr; } }

.guide-article-head { margin-bottom: 18px; }
.guide-article-lede { color: var(--fg-2); font-size: 16px; line-height: 1.55; margin-top: 8px; }
.guide-article-body { max-width: 70ch; font-size: 15px; line-height: 1.7; color: var(--fg-2); }
.guide-article-body h2 { font-family: var(--f-display); text-transform: uppercase; letter-spacing: 0.02em; font-size: 19px; margin: 28px 0 10px; color: var(--fg-1); }
.guide-article-body p { margin: 0 0 14px; }
.guide-article-body ul, .guide-article-body ol { margin: 0 0 14px; padding-left: 22px; }
.guide-article-body li { margin: 4px 0; }
.guide-article-body a { color: var(--accent); }

.guide-pager { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 28px; }
.guide-pager-link { display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; text-decoration: none; color: inherit; }
.guide-pager-link:hover { border-color: var(--accent); }
.guide-pager-next { text-align: right; }
.guide-pager-title { font-family: var(--f-display); font-weight: 700; text-transform: uppercase; font-size: 14px; }

/* ============================================================
   MOBILE "MORE" SHEET
   ============================================================ */
.more-backdrop {
  position: fixed; inset: 0; z-index: 65;
  background: rgba(0,0,0,0.5);
  opacity: 0; transition: opacity 0.2s ease;
}
.more-backdrop.open { opacity: 1; }
.more-sheet {
  position: fixed; left: 0; right: 0; z-index: 70;
  bottom: calc(var(--botnav-h) + env(safe-area-inset-bottom));
  background: var(--panel); border-top: 1px solid var(--line-2);
  border-radius: 14px 14px 0 0;
  padding: 8px 12px calc(12px + env(safe-area-inset-bottom));
  transform: translateY(110%); transition: transform 0.22s ease;
}
.more-sheet.open { transform: translateY(0); }
.more-sheet-handle { width: 36px; height: 4px; border-radius: 2px; background: var(--line-2); margin: 8px auto 12px; }
.more-sheet-links { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.more-sheet-link {
  display: flex; align-items: center; gap: 10px; padding: 14px 14px;
  text-decoration: none; color: var(--fg-1);
  border: 1px solid var(--line-2); border-radius: 8px;
  font-family: var(--f-display); font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; font-size: 12px;
}
.more-sheet-link:active { border-color: var(--accent); }
.more-sheet-ic { font-size: 16px; color: var(--fg-3); }
/* Desktop never shows the sheet/trigger (botnav itself is mobile-only). */
@media (min-width: 721px) { .more-sheet, .more-backdrop { display: none; } }
```

- [ ] **Step 2: Confirm the bottom nav still styles correctly with a `<button>` slot**

The existing `.botnav-item` rule already covers `button` (it sets `background: transparent; border: 0`), so the More trigger inherits the same look as the `<a>` items. No change needed — just verify in Step 3.

- [ ] **Step 3: Verify both themes + the sheet interaction**

Run: reload dev server. Resize the browser to a phone width (≤720px) or use devtools device mode. On `http://localhost:4321/`:
- Confirm bottom nav shows Home · Standings · Calendar · More.
- Tap More → sheet slides up with 6 links over a dimmed backdrop.
- Tap backdrop → sheet closes. Tap More, press Escape → closes.
- Tap a link (e.g. Guide) → navigates to `/guide/`.
- Toggle the theme (top bar) and repeat: verify the sheet, cards, and reading list look correct in both dark and `html.light` (no invisible text, borders visible).
- On a guide/circuit/teams page, confirm the More slot shows the active (accent) colour.

Capture a screenshot of the open sheet (dark) and the guide hub for the PR.

- [ ] **Step 4: Commit**

```bash
git add public/css/app.css
git commit -m "style(guide): guide page + More sheet styling for both themes"
```

---

## Task 8: Inline link — Sprint badge → race-weekend-format

The Sprint badge is rendered by `SprintBadge` in `src/lib/shared.jsx` (per CLAUDE.md's shared-components list). Confirm exactly where it renders before editing.

**Files:**
- Modify: `src/lib/shared.jsx` (the `SprintBadge` component) — confirm path first.

- [ ] **Step 1: Locate the Sprint badge**

Run: `grep -rn "SprintBadge" src/`
Expected: a definition in `src/lib/shared.jsx` and usages in screen/page components. Read the definition to see its current markup (likely a `<span>`).

- [ ] **Step 2: Decide the lightest change**

If `SprintBadge` is used in many places and wrapping all of them is risky, prefer wrapping the badge text in an anchor *inside* the component, gated by a prop (e.g. `linkToGuide`) defaulting to off — OR, simpler for a first cut, only link the badge in the one highest-traffic surface (the race results header). Choose the approach that touches the fewest files while making the link discoverable. Document the choice in the commit message.

Minimal in-component version (if the badge is a `<span>` with label text):

```jsx
// before
export function SprintBadge() {
  return <span className="sprint-badge">Sprint</span>;
}
// after
export function SprintBadge({ href = '/guide/race-weekend-format/' } = {}) {
  if (!href) return <span className="sprint-badge">Sprint</span>;
  return <a className="sprint-badge sprint-badge-link" href={href}>Sprint</a>;
}
```

(Adjust to the badge's actual markup — match its existing className and children exactly.)

- [ ] **Step 3: Verify the badge links and still renders**

Run: reload dev server. Open a sprint-weekend race or the calendar where a Sprint badge appears (e.g. a 2026 sprint round). Confirm the badge is now a link to `/guide/race-weekend-format/` and visually unchanged. If a hover style is wanted, add `.sprint-badge-link:hover { ... }` to `app.css` using tokens.

- [ ] **Step 4: Commit**

```bash
git add src/lib/shared.jsx
git commit -m "feat(guide): link Sprint badge to the race-weekend guide"
```

---

## Task 9: Inline link — Standings "Pts" header → points-system

**Files:**
- Modify: the standings screen that renders the table header (confirm path first).

- [ ] **Step 1: Locate the "Pts" column header**

Run: `grep -rni ">Pts<\|'Pts'\|\"Pts\"\|Pts</" src/components/islands/screens/`
Expected: a header cell (likely `<th>Pts</th>`) in the driver/constructor standings screen(s).

- [ ] **Step 2: Wrap the header label in a link**

Change the header cell text from `Pts` to an anchor, preserving the cell element and any classes:

```jsx
// before
<th className="...">Pts</th>
// after
<th className="..."><a className="th-guide-link" href="/guide/points-system/">Pts</a></th>
```

Add a minimal style to `public/css/app.css` so the link inherits the header look:

```css
.th-guide-link { color: inherit; text-decoration: none; border-bottom: 1px dotted var(--line-2); }
.th-guide-link:hover { color: var(--accent); }
```

Apply to both the driver and constructor standings headers if they're separate.

- [ ] **Step 3: Verify**

Run: reload dev server. Open `/standings-drivers/` and `/standings-constructors/`. Confirm the "Pts" header is a subtle link to `/guide/points-system/` and the table layout is unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/components/islands/screens/ public/css/app.css
git commit -m "feat(guide): link standings Pts header to the points guide"
```

---

## Task 10: Inline link — homepage "New to F1?" → /guide/

**Files:**
- Modify: `src/pages/index.astro` or the Home screen/island (confirm where a static link fits best).

- [ ] **Step 1: Locate a good anchor point on the homepage**

Run: `grep -rn "New to\|hero\|page-head\|page-sub" src/pages/index.astro src/components/islands/screens/HomeScreen.jsx 2>/dev/null | head`
Read `src/pages/index.astro` to see whether the homepage has static markup (preferred — no island change) where a link can live near the top.

- [ ] **Step 2: Add the link**

Prefer adding it to static Astro markup in `src/pages/index.astro` (so it appears in prerendered HTML for SEO and needs no island change). Example, placed in the page header or a small callout:

```astro
<a class="guide-cta" href="/guide/">New to F1? Start with the beginner's guide →</a>
```

Add a token-based style to `app.css`:

```css
.guide-cta {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--f-display); font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.06em; font-size: 12px;
  color: var(--accent); text-decoration: none;
  border: 1px solid var(--line-2); border-radius: 999px; padding: 6px 14px;
}
.guide-cta:hover { border-color: var(--accent); }
```

If the homepage hero is entirely island-rendered with no static slot, add the CTA to the island's screen instead and pass nothing new (it's a static link).

- [ ] **Step 3: Verify**

Run: reload dev server. Open `http://localhost:4321/`. Confirm a "New to F1?" link is visible and navigates to `/guide/`. Check both themes.

- [ ] **Step 4: Commit**

```bash
git add src/pages/index.astro public/css/app.css
git commit -m "feat(guide): homepage New to F1 link to the guide"
```

---

## Task 11: Full verification + finish

**Files:** none (verification only)

- [ ] **Step 1: Run the test suite**

Run: `npm test`
Expected: all tests pass, including the new `src/lib/guide.test.js`.

- [ ] **Step 2: Full production build**

Run: `npm run build`
Expected: build succeeds with no errors. Confirm guide output exists:
`node -e "const fs=require('fs');const s=['index','race-weekend-format','points-system','flags-and-signals','pit-stops-and-strategy','tyres','overtaking','drs','safety-cars','hybrid-power-unit','penalties'];console.log(s.every(x=>fs.existsSync('dist/guide/'+x+'/index.html')))"`
Expected: `true`

- [ ] **Step 3: Preview the production build**

Run: `npm run preview`. Spot-check `/guide/`, two sub-pages, the More sheet on mobile width, and the three inline links (sprint badge, Pts header, homepage CTA). Verify both themes.

- [ ] **Step 4: Verify the sitemap includes guide pages**

After build, run:
`node -e "const fs=require('fs');const f=fs.readdirSync('dist').find(x=>x.startsWith('sitemap'));console.log(f)"`
then grep the sitemap file(s) under `dist/` for `/guide/`.
Expected: guide URLs present (auto-added by `@astrojs/sitemap`).

- [ ] **Step 5: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "chore(guide): verification fixes"
```

(Skip if nothing changed.)

---

## Self-review notes (author)

- **Spec coverage:** content collection (T1), helpers (T2), 10 pages (T3), hub (T4), sub-page w/ related+pager (T5), desktop link + bottom nav + More sheet (T6), styling both themes (T7), three inline links (T8–T10), verification incl. sitemap (T11). All spec sections mapped.
- **Out-of-scope items** (tooltips, year-awareness, deep regs, broad cross-linking) are intentionally not implemented — no tasks for them.
- **Type consistency:** helper names `isPublishedGuide` / `sortGuides` / `resolveRelated` / `prevNext` / `publishedGuidesSorted` are used identically in T2, T4, T5.
- **Known confirm-at-implementation points:** exact files for the Sprint badge (T8), Pts header (T9), and homepage anchor (T10) are located via grep in their first step rather than assumed — these are the only soft spots and each task starts by pinning the real location.
```
