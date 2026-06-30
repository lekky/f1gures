---
description: Write an f1gures blog post (preview / recap / etc.) the house way — sync data first, use real numbers, always ship a templated image prompt.
argument-hint: "[topic] e.g. 'austria recap' or 'mid-season check-in'"
---

# Write a blog post: $ARGUMENTS

Follow this workflow exactly. The two non-negotiables: **the branch/data must be
current before you write a word**, and **every post ships with a hero-image prompt
templated to its category**.

## 1. Sync the branch and data FIRST

Stale data is the most common failure here (empty `<RaceResult>` tables, wrong
standings). Before writing anything:

```bash
git fetch origin
git log --oneline origin/main -8        # look for "chore(data): 2026 season refresh"
```

- If `origin/main` has newer data than the working tree, pull just the bundle so
  you don't tangle the feature branch with unrelated main commits:
  ```bash
  git checkout origin/main -- public/data/<year>.json
  npm run build:archive                  # regenerate archive JSONs from the new bundle
  ```
  `build:archive` is required — `<RaceResult>` and the standings cards read the
  generated `public/data/archive/**`, not the bundle directly. Skipping it leaves
  stale "holding page" race docs with an empty results array.
- **For a race recap:** confirm the round's results actually exist before writing.
  A round is only complete once it's in `d.results[<round>]`:
  ```bash
  node --input-type=module -e "import{readFileSync}from'fs';const d=JSON.parse(readFileSync('./public/data/<year>.json','utf8'));console.log(Object.keys(d.results))"
  ```
  No results → don't invent them. Tell the user the round isn't in the data yet
  and offer to wait for the nightly Jolpica refresh (or pull it once it lands).

## 2. Use REAL numbers — never eyeball standings

Compute from the single source of truth, `src/lib/seasonStats.mjs`:

```bash
node --input-type=module -e "import{computeStandings}from'./src/lib/seasonStats.mjs';import{readFileSync}from'fs';const d=JSON.parse(readFileSync('./public/data/<year>.json','utf8'));const s=computeStandings(d);console.log(s.lastRound);s.drivers.slice(0,8).forEach(x=>console.log(x.driver.jolpicaId,x.points,'W'+x.wins));s.teams.forEach(x=>console.log(x.team.name,x.points))"
```

Recaps pull finishing order / grid / DNFs from `d.results[<round>]`
(`.order`, `.detail[CODE]`, `.dnfs`, `.pole`, `.fastest`). Cite laps/positions
from the data; don't fabricate DNF causes the bundle doesn't record.

## 3. Write the post

Drop an `.mdx` into `src/content/blog/`. Naming: `<year>-r<round>-<circuit>-<preview|recap>.mdx`
for race posts, otherwise a descriptive slug.

Frontmatter must satisfy the Zod schema in `src/content/config.ts`:
- `title` ≤ 120 chars · `description` 40–200 chars · `category` one of the
  `BLOG_CATEGORIES` enum · `publishedAt` (past date so `isPublic()` shows it) ·
  optional `updatedAt`, `heroImage`, `heroImageAlt`, `draft`.

House components (import from `../../components/blog/`): `DriverChip`,
`StandingsCard`, `RaceResult`, `Storylines`/`Storyline`, `Sessions`, `PullQuote`.
- `DriverChip ref="..."` takes a **driverRef slug** (`max_verstappen`, `antonelli`).
  Verify each ref exists in `public/data/archive/_drivers-index.json` or the chip
  falls back to raw text.
- Standings go in `StandingsCard`, never a plain "Constructors: …" sentence.
  Drivers: rows of `{ driver, team, value }`. Constructors: add `kind="constructor"`
  with rows of `{ name, color, value }` (team colours from the bundle `teams[]`).
- `RaceResult year={} round={}` only works once that round is in the archive
  (step 1).
- Match the established voice: tight, declarative, links to `/races/`, `/drivers/`,
  `/circuits/`. Keep the narrative continuous with the existing recap chain.
- **Never use em dashes (`—`).** House style is a spaced hyphen (` - `) for every
  parenthetical break or aside, in both prose and frontmatter. En dashes in
  numeric ranges (`2023–2024`, `560–580 kW`) are fine. After writing, sweep the
  file: `grep -c "—" src/content/blog/<slug>.mdx` must return 0.
- **Rookie vs. second-season:** a driver is only a *rookie* in their F1 debut
  year. Antonelli and Hadjar both debuted in **2025**, so from 2026 on they are
  **second-season** drivers, not rookies. Check a driver's debut year before
  calling them a rookie.

Validate lengths before finishing:
```bash
node --input-type=module -e "import{readFileSync}from'fs';const fm=readFileSync('src/content/blog/<slug>.mdx','utf8').split('---')[1];console.log('title',(fm.match(/title:\s*\"([^\"]+)\"/)||[])[1].length,'desc',(fm.match(/description:\s*\"([^\"]+)\"/)||[])[1].length)"
```

## 4. ALWAYS provide a hero-image prompt (templated per category)

Set `heroImage: /images/blog/<slug>.jpg` + `heroImageAlt` in the frontmatter, then
give the user a generation prompt using the matching template below. The goal is
**one consistent image type per category** — fill the `{braces}`, keep the rest
fixed. Output target: wide landscape, **16:9, ~1792×1024** (downscaled in use; also
serves as the OG fallback).

### `race-preview` → stylised illustrated track map
> Stylised illustrated track map of the **{Circuit Full Name}, {City}**. Clean
> vector aerial view of the full circuit outline, start/finish marked, condensed
> uppercase circuit name and "ROUND {NN} · {YEAR}" label. Dark charcoal background,
> a single red (#E10600) accent on the track ribbon, subtle topographic grid
> texture, flat editorial poster style. No cars, no people. **No corner numbers
> and no text labels on the track — keep only the title and round label** (image
> models garble corner numbers). 16:9.

`heroImageAlt`: `"Illustrated track map of the {Circuit Full Name}, {City}"`

### `race-recap` → painted podium-order race moment
> Dynamic painted illustration at the **{Circuit}** finish line: a **{P1 team}
> ({P1 colour}) crossing the line first**, just ahead of a **{P2 team} ({P2
> colour}) in second** and a **{P3 team} ({P3 colour}) in third**, **{local
> landmark}** silhouetted behind. Motion blur on the wheels, low three-quarter
> chase angle, cinematic {dusk/daylight} light, painterly editorial style.
> **Plain unbranded liveries — no sponsor logos, wordmarks, or readable text
> anywhere.** 16:9.
>
> Lead with the finishing ORDER explicitly (winner crossing first) — models
> otherwise default to putting the most recognisable car in front.

`heroImageAlt`: `"Painted illustration of a {P1 team} leading a {P2 team} and a {P3 team} across the {Circuit} finish line, {local landmark} silhouetted in the distance"`

### `technical` → conceptual subject illustration
> Clean conceptual illustration of **{the technical subject}**, exploded /
> cutaway diagram style, charcoal background with a single red accent, condensed
> labels, flat technical-poster aesthetic. No real sponsor branding. 16:9.

`heroImageAlt`: `"{The technical subject} explained"`

### `driver-focus` → driver portrait
> Editorial portrait illustration of **{driver name}** in **{era/team}** racing
> kit, three-quarter profile, muted period palette with a single red accent,
> painterly poster style. Likeness-suggestive, not photoreal. 16:9.

`heroImageAlt`: `"{Driver name}, {one-line descriptor}"`

### `historic-season` → period rivalry scene
> Period illustration of **{subject / rivalry}**, **{year}**, {two cars or two
> drivers} in correct era liveries, vintage editorial palette, grain texture,
> painterly poster style. 16:9.

`heroImageAlt`: `"{Subjects / rivalry}, {year}"`

### `general` → representative race moment
> Painted illustration of **{representative scene from the post}**, correct
> {year} liveries, cinematic light, painterly editorial style, single red accent.
> 16:9.

`heroImageAlt`: `"{One-line description of the scene}"`

## 5. Optimise the hero image when it lands

Generated heroes often arrive oversized (multi-MB, sometimes a PNG saved with a
`.jpg` extension). Siblings are ~200–550 KB at 2752×1536. Recompress in place
(`sharp` is installed):

```bash
node --input-type=module -e "import sharp from 'sharp';import{writeFileSync}from'fs';const p='public/images/blog/<slug>.jpg';writeFileSync(p,await sharp(p).flatten({background:'#0a0a0a'}).jpeg({quality:82,mozjpeg:true}).toBuffer());console.log('done')"
```

Verify it serves as `image/jpeg` at a sane size before finishing.

## 6. Wrap up

Report: the file(s) written, the standings/result they're built on, and the
image prompt(s). If the hero `.jpg` isn't in place yet, say so — the post renders
without it (no broken `<img>`). Don't commit unless asked.
