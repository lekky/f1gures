# Social card design

The design behind `scripts/social/card.mjs` and `scripts/social/cardkit.mjs`.

Six skeletons cover all thirteen card types, so the feed reads as one
publication and a new angle usually needs no new drawing code:

| Skeleton | Cards |
|---|---|
| `result` (1a) | 01 race result · 02 qualifying · 03 sprint |
| `leaderboard` (3d) | 05 on this day · 07 record board · 08 standings |
| `hero` (4a) | 04 preview · 06 birthday · 09 driver · 11 circuit |
| `team` (10b) | 10 team spotlight |
| `versus` (12b) | 12 head to head |
| `fact` (13a) | 13 trivia |

## Sizing: one design, three formats

The design is drawn at **portrait 1080×1350**. Square and story are *reflows of
the same markup*, not separate designs, reached by three multipliers:

| Format | font | width | vertical |
|---|---|---|---|
| portrait 1080×1350 | ×1 | ×1 | ×1 |
| square 1080×1080 | ×0.88 | ×0.92 | ×0.74 |
| story 1080×1920 | ×1.05 | ×1.02 | ×1.18 |

Hence `metrics(format)` returns `m.f()` (font sizes), `m.wx()` (explicit widths)
and `m.v()` (heights, offsets, padding, margin, gap). **Nothing in a layout
hardcodes a pixel** — it calls one of those three and the tree composes at all
three sizes. Vertical rhythm is `grow()` slack rather than fixed offsets, so the
extra height on story lands in the gaps and keeps content clear of the platform
UI bands.

## The rules the design holds to

Everything traces back to `design-system/TOKENS.md`:

- **Type.** Barlow Condensed 600/700 for names, titles, labels and chips, always
  uppercase. Barlow 400 for subtitles. **JetBrains Mono 500/700 for every
  numeral** — times, points, counts, dates, ranks. Numbers in mono against names
  in condensed is the signature and is load-bearing in every skeleton.
- **Red budget — one accent moment per card.** The chip (result, hero), the
  leader strip and tint (standings), the rule above the fact, the champion's
  strip (versus). Historic cards use **gold** instead: red means "now", and a
  1956 race is not now. P1 gold sits outside the red budget.
- **Team colour** appears only as strips (4–10 px), 2–4 px rules, 7 px timeline
  ticks, proportional band and bar fills, and dots. Never a panel background,
  never as text colour.
- **Grounds** are the one sanctioned exception to the flat token list: each card
  carries a multi-stop gradient interpolating around `#060709` as canvas
  texture. All content still sits on solid panels.

### Two collisions the design handles

- **Ferrari `#E80020` ≈ accent `#E8002D`.** A red chip beside a Ferrari strip
  reads as a rendering fault, so `clashesWithAccent()` inverts the chip to
  white-on-black. Tested.
- **The brand's "1"** reads as an "I" in condensed caps, so the footer prints
  `f1gures.app` in lower case while every other label is uppercased.

## Satori constraints

Cards render through Satori (HTML/CSS → SVG → PNG), which supports only a
subset of flexbox. The design was authored inside that subset — no transforms,
filters, blur, masks, clip-path, grid, floats or animation. Available: flexbox,
absolute positioning inside a relative parent, gradients, solid fills, borders,
`border-radius`, `overflow:hidden`, `objectFit`, opacity, letter-spacing.

Three things that cost real debugging time when porting, worth keeping in mind:

1. **Satori throws on an explicit `undefined` style value.** A conditional
   border must omit the key (`...(cond ? { borderLeft } : {})`), not set it to
   `undefined` — the failure surfaces as an opaque `Cannot read properties of
   undefined (reading 'trim')` from inside Satori's CSS parser.
2. **Painting order.** Absolutely positioned elements paint above non-positioned
   in-flow siblings regardless of DOM order, so everything sitting *on* a
   leaderboard band carries `position:relative`.
3. **Scrims belong over the photo, not the card.** A scrim spanning the full
   width darkens everything above the photo's foot and nothing below it, leaving
   a horizontal seam straight across the card.

The diagonal cut on the leaderboard bands is a `linear-gradient` with a hard
stop into transparency — no clip-path, no transform, which is what lets Satori
draw it at all.

## Photography

The 811 driver headshots are 360×440 cutouts. A result card's photo column is
560×920, so a source upscales roughly 1.6×. It survives because the scrims
darken the soft edges; the leaderboard and fact treatments are the safest for
low-quality older portraits.

## Provenance

The design is the "f1gures social cards" handoff (Claude Design, September
2026), which replaced an earlier in-house set. It fixed two defects in that set:
the team card showed the current sponsor lockup on a card spanning 1975–2026
(now a championship timeline, no logo anywhere), and the trivia card printed
"Did you know?" twice.
