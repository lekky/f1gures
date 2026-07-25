---
description: Write an f1gures blog post (preview / recap / etc.) the house way — sync data first, use real numbers, research the actual race events, ship a non-repetitive hero-image prompt.
argument-hint: "[topic] e.g. 'austria recap' or 'mid-season check-in'"
---

# Write a blog post: $ARGUMENTS

Follow this workflow exactly. The three non-negotiables: **the branch/data must be
current before you write a word**, **race events must be researched by dispatched
subagents, never inferred from timing data**, and **every post ships with a
hero-image prompt that doesn't repeat the last one**.

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
  stale "holding page" race docs with an empty results array. (On a fresh
  container the archive may not exist at all — same fix.)
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
(`.order`, `.detail[CODE]`, `.dnfs`, `.pole`, `.fastest`).

**Every superlative must be computed, not vibed.** "Closest finish of the
season", "smallest lead since May", "best Sunday of the year", "X has outscored
Y over the last three rounds" — each of these is a five-line node script against
the bundle (loop the rounds, compare the margins). If you can't compute it,
don't claim it. Same for prior-round facts (who won which round, who led the
championship when): read them from `d.results`, not from earlier blog posts —
prose in old posts has been wrong before; the bundle is the record.

## 3. Research what ACTUALLY happened — the bundle has numbers, not causes

The season bundle records **outcomes** (order, gaps, laps, DNF flags), never
**causes**. It will tell you the polesitter finished P15; it will not tell you
he picked up front-wing damage on lap 1. It will show eight cars covered by
2.4s; it will not mention the safety car that bunched them. A recap written
from timing data alone reads like a spreadsheet with adjectives — and worse,
it tempts you into either hedging ("whatever went wrong…") or guessing.

So, for every **race recap** (and any post that narrates on-track events):

1. **Dispatch a research agent per race — do not skip this, and do not try to
   do it inline.** Before writing a word of prose, launch one `general-purpose`
   subagent for each race being written up (in a single message, so they run
   concurrently). Web research is slow, wide, and context-heavy: an agent can
   read a dozen race reports and hand back a page of findings, where doing it
   inline burns the context you need for writing. Give each agent:
   - the **race, date and round number**, and every fact you already hold from
     the bundle (pole, podium, finishing order, grid slots, DNF laps, gaps) so
     it cannot contradict the record;
   - a **numbered list of the specific unknowns** — one question per DNF, per
     big grid-vs-finish delta, per surprise result;
   - a standing instruction to also report **anything out of the ordinary the
     questions didn't anticipate**: a standout drive, a record, a debut, a
     controversy, a bizarre strategy call, a milestone. The best line in a
     recap is usually the thing you didn't know to ask about;
   - the output contract: **numbered findings, each with source URL(s) and a
     confidence level** (CONFIRMED 2+ sources / SINGLE SOURCE / NOT FOUND),
     plus an explicit list of what it could NOT find, and a hard instruction
     never to guess or fill gaps with plausible invention.

   While the agents run, do the bundle work (standings snapshots, superlatives,
   reading the previous recap for continuity). Fold the findings in when they
   land. Search terms worth handing over: `"<Grand Prix name> <year> report"`,
   `"<GP> <year> safety car"`, `"<driver> <GP> <year> retirement reason"`.
2. **Specifically chase the gaps the data can't fill:**
   - cause of every DNF and every big grid-vs-finish delta (damage? penalty?
     strategy? spin?)
   - safety cars / red flags / VSC — when, why, and who won or lost from them
   - pit-stop calls that decided positions (who stopped under the SC, who
     stayed out)
   - weather, penalties, collisions, team orders
   - **the out-of-the-ordinary:** a career-first or a milestone (first win,
     first podium, first points for a team), a record broken, a debut or a
     stand-in driver, a drive that beat the car (a huge recovery, a one-stop
     nobody else made work), a protest, a stewards' decision that changed the
     result after the flag. These are what make a recap worth reading rather
     than a table with sentences around it — ask for them explicitly.
3. **Numbers from the bundle beat numbers from reports.** If a report's gap or
   lap count disagrees with `d.results`, the bundle wins. Reports supply the
   *why*, the bundle supplies the *what*.
4. **If research comes up empty** (offline, paywalled, or a fictional/future
   season the web knows nothing about): **ask the user** for the key events —
   "what caused X's DNF? was there a safety car?" — before publishing. The
   user watched the race; a 30-second question beats a hedged paragraph.
5. **Never fabricate a cause.** If neither research nor the user can fill a
   gap, write around it honestly and narrowly — but treat that as a last
   resort, not the default.

## 4. Write the post

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
  `/circuits/`. Keep the narrative continuous with the existing recap chain —
  read the round's preview and the previous recap, and call back to what they
  set up.
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

Then run `npx astro sync` — it validates the frontmatter against the collection
schema in seconds, no full build needed.

## 5. ALWAYS provide a hero-image prompt — house style, fresh scene

Set `heroImage: /images/blog/<slug>.jpg` + `heroImageAlt` in the frontmatter,
then give the user a generation prompt. Output target: wide landscape, **16:9,
~1792×1024** (downscaled in use; also serves as the OG fallback).

**The style is fixed; the scene is not.** Every hero shares the same DNA so the
blog looks like one publication — but the *moment depicted* must come from the
post's own story. The old approach (same finish-line template every recap)
produced a wall of near-identical images. Don't add to it.

### Prompt craft — these go to Gemini, so write for Gemini

The images are generated with Google's models (Gemini 2.5 Flash Image / Imagen).
They behave differently from Stable-Diffusion-style tooling, and three habits
carried over from that world actively make our images worse:

1. **Never write negations.** Gemini has no negative-prompt channel (Imagen
   dropped `negative_prompt` outright), so "no cars, no people, no text" simply
   injects *cars, people, text* into the attention context — a reliable way to
   get exactly what you excluded. **State everything positively.** Instead of
   "no cars on the track", write "the bare track ribbon alone on the
   background". Instead of "no sponsor logos", write "plain unmarked bodywork in
   solid block colour".
2. **Name colours in words; treat hex as a hint, not an instruction.** Models
   read `#E10600` as a text token, not a colour. Write "vivid racing red
   (#E10600)" — the words do the work and the hex nudges the shade.
3. **Quote the exact text you want rendered.** Gemini renders short strings
   genuinely well, but only if you give it the literal string: `the word
   "MONACO"` gets MONACO; "the circuit name" gets an invented one. Keep strings
   short, state where they sit in the frame and what they look like, and avoid
   the `·` middot (it garbles) — use a plain hyphen.

Also: **write flowing descriptive prose, not comma-separated keyword soup** —
Gemini follows narrative composition instructions ("centred in the frame", "in
the lower left") far better than tag lists. Set **16:9 with the aspect-ratio
control in the UI/API**, not in the prompt text; the parameter is honoured, the
words largely are not.

**When the subject has a shape that must be right** (a circuit outline above
all), don't describe geometry in words — Gemini accepts reference images. Hand
it `public/images/circuits/white-outline/<id>.svg` (or the black-outline
variant) and ask it to restyle *that* outline. A text description of a track
layout will never come back accurate.

### Fixed style DNA (weave into every prompt)

> Painterly editorial illustration, cinematic light, a muted palette lifted by a
> single vivid racing red (#E10600) accent. Bodywork is plain and unmarked in
> solid block colour, the surfaces clean and free of lettering. Illustrated and
> painterly rather than photographic.

### Anti-samey check (do this BEFORE writing the prompt)

Look at the last 3–4 heroes so you don't repeat them:

```bash
grep -h "heroImageAlt" src/content/blog/*.mdx | tail -6
ls -t public/images/blog/ | head -6
```

If the previous recap was a finish-line shot, this one isn't. Vary at least two
of: **moment, camera angle, light/weather, setting** from the previous post in
the same category.

### `race-recap` → the race's defining moment (not automatically the finish)

Pick the scene the post itself leads with. A menu, roughly in order of how
often they're the real story:

- **Decisive overtake** — attacker alongside at a *named corner*, defender's
  car correct colour, landmark or corner geography behind.
- **Safety-car restart queue** — the winner's car at the head of a tight
  nose-to-tail snake through a famous sequence of corners.
- **The pit-lane call that decided it** — one car stationary in the box, the
  rival flashing past on track in the background.
- **A wounded car** — damaged bodywork, sparks or a missing endplate, limping
  while the pack streams by (when the post's story is a fallen favourite).
- **Start into Turn 1** — full field funnelling in, when the race was decided
  early or the story is chaos.
- **Weather drama** — spray rooster-tails, gloom, rain light, when conditions
  defined the day.
- **Finish line** — still allowed, but only when the finish genuinely was the
  story (a photo-finish counts). If cars are shown in running order, **state
  the order explicitly** ("the {P1 colour} car crossing first, ahead of…") —
  models otherwise put the most recognisable car in front.
- **Podium / parc fermé** — driver on the car, crowd flooding the pit straight
  (Silverstone/Monza style), when the emotion was the story.

Camera angles to rotate through: low three-quarter chase · head-on compression
telephoto · high grandstand wide · trackside pan with motion blur · pit-wall
level. Light: match the actual race (day/dusk/night/overcast/rain).

Team colours and any depicted running order must match the real result — get
colours from the bundle `teams[]`. Write the scene as flowing prose in the
composition-first style above ("in the foreground…", "behind them…"), name the
colours in words, and describe the bodywork as plain and unmarked rather than
asking for no sponsors.

`heroImageAlt`: one factual sentence describing the depicted moment, e.g.
`"Painted illustration of {what the image shows}, {circuit/landmark context}"`.

### `race-preview` → illustrated track map (consistent on purpose)

Previews keep the track-map identity — it's the one category where sameness is
the brand. Vary only the ambience to match the venue:

> A flat 2D vector poster illustration, orthographic top-down view, of the
> **{Circuit Full Name}** racetrack{ in/near {City}}. The complete circuit
> outline is drawn as a single clean continuous ribbon centred in the frame,
> rendered in vivid racing red (#E10600) against a deep charcoal background. A
> small white chequered marker indicates the start/finish line. The background
> carries a faint darker-charcoal texture of **{venue-flavoured texture:
> topographic contours / harbour coastline and marina berths / city-street
> grid / desert dunes / forest canopy / heat-haze gradient}**. In the lower
> left, in condensed uppercase sans-serif white lettering, the word
> **"{SHORT CIRCUIT NAME}"**, and beneath it in smaller grey lettering
> **"ROUND {NN} - {YEAR}"**. The track ribbon is clean and unlabelled.
> Minimalist editorial poster design, flat colour, sharp vector edges, generous
> negative space.

Note what this template does *not* say: no "no cars", no "no corner numbers".
"The track ribbon is clean and unlabelled" and "generous negative space" get the
same result without naming the things you don't want. Keep it that way.

`heroImageAlt`: `"Illustrated track map of the {Circuit Full Name}, {City}"`

### `technical` → conceptual subject illustration

> A clean conceptual illustration of **{the technical subject}**, drawn as an
> exploded cutaway diagram on a deep charcoal background, with a single vivid
> racing red (#E10600) accent picking out {the key component}. Short condensed
> uppercase labels in white sit alongside the components. Flat technical-poster
> aesthetic, generic unmarked engineering surfaces.

`heroImageAlt`: `"{The technical subject} explained"`

### `driver-focus` → driver portrait

> A painterly editorial portrait illustration of **{driver name}** in
> **{era/team}** racing kit, shown in three-quarter profile against
> **{backdrop}**. Muted period palette lifted by a single vivid racing red
> (#E10600) accent, plain unmarked overalls and helmet in solid block colour.
> Loose painterly brushwork, an illustrated likeness rather than a photograph.

Vary the backdrop with the driver's story (home circuit, title-winning venue,
garage, era-appropriate paddock) so consecutive portraits don't share a
background.

`heroImageAlt`: `"{Driver name}, {one-line descriptor}"`

### `historic-season` → period rivalry scene

> A period illustration of **{subject / rivalry}** in **{year}**, showing
> {two cars or two drivers} in era-correct colours with plain unmarked
> bodywork. Vintage editorial palette, soft film-grain texture across the
> frame, painterly poster style.

`heroImageAlt`: `"{Subjects / rivalry}, {year}"`

### `general` → representative scene from the post

> A painted illustration of **{representative scene from the post}**, with the
> cars in their correct {year} team colours on plain unmarked bodywork, muted
> palette lifted by a single vivid racing red (#E10600) accent.

`heroImageAlt`: `"{One-line description of the scene}"`

## 6. Optimise the hero image when it lands

Generated heroes often arrive oversized (multi-MB, sometimes a PNG saved with a
`.jpg` extension). Siblings are ~200–550 KB at 2752×1536. Recompress in place
(`sharp` is installed):

```bash
node --input-type=module -e "import sharp from 'sharp';import{writeFileSync}from'fs';const p='public/images/blog/<slug>.jpg';writeFileSync(p,await sharp(p).flatten({background:'#0a0a0a'}).jpeg({quality:82,mozjpeg:true}).toBuffer());console.log('done')"
```

Verify it serves as `image/jpeg` at a sane size before finishing.

## 7. Wrap up

Report: the file(s) written, the standings/result they're built on, **which
facts came from research vs. the bundle** (and anything you couldn't source —
flag it instead of burying it), and the image prompt(s). If the hero `.jpg`
isn't in place yet, say so — the post renders without it (no broken `<img>`).
Don't commit unless asked.
