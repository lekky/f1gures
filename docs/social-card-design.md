# Social card design — "Telemetry Editorial"

The design philosophy behind `scripts/social/card.mjs`. It exists so the daily
social cards read as f1gures rather than as generic dark stat blocks, and so
future angles inherit a coherent visual language instead of inventing one.

---

## The movement

**Telemetry Editorial.** The aesthetic of the timing screen crossed with the
authority of a printed sports annual. A race weekend produces enormous
quantities of number; the romance is not in the numbers themselves but in the
moment they resolve into a result. These cards treat data with the reverence of
a scientific plate — measured, gridded, systematically annotated — and then
allow exactly one element to break the system and become the subject.

Space is disciplined and vertical. The card is a column, read top to bottom in
one thumb-scroll: a whispered label, a monumental statement, then evidence.
Structure is asserted through rules and bands rather than boxes — a card should
feel *ruled*, like a results sheet, not *contained*, like a widget. Negative
space is load-bearing. Where a lesser card would fill the gap with another
panel, this one lets the ground breathe so the subject has somewhere to land.

Colour is a budget, not a palette. The ground is near-black, almost blue. Ink is
bone white falling to grey for anything secondary. Against that near-monochrome,
a single chromatic event is permitted per card: brand red where the meaning is
*now*, podium gold where the meaning is *won*, or the team's own hue carried as
a bar, a strip, a rule. Team colour never floods a panel — it edges, underlines,
and fills bars. Restraint is what makes the one permitted colour land like a
struck match.

Scale is the primary instrument. The hierarchy is deliberately violent: labels
set tiny, tracked wide, and uppercase, sitting beneath headlines many times
their size. Condensed display type carries the names; a monospace face carries
every numeral, so lap times, points and counts align into columns the eye can
scan without reading. Numbers set in mono against names set condensed is the
signature — the card should be recognisable as ours from across a room, with
the text unreadable.

Depth comes from ghosting, never from ornament. A single enormous numeral or
year sits behind the composition at the threshold of visibility, and a fine
diagonal ruling — the same rake as the wordmark's speed streaks — grains the
ground. These are structural, not decorative: they give a flat export the
suggestion of layered stock, and they reward the second look without competing
for the first.

Every card must look meticulously crafted — the product of deep expertise and
painstaking attention, not a template filled in. Alignment is absolute: rules
meet margins exactly, baselines agree, nothing overlaps, nothing crops a face at
the chin. Type is fitted to the width it is actually given, never to a nominal
one. The measure of success is that a reader scrolling at speed stops, and a
designer looking closely finds nothing to correct. Master-level execution is the
minimum, and it must survive being seen at thumbnail size on a phone.

---

## How the philosophy binds to the house rules

The philosophy is downstream of `design-system/TOKENS.md`, which wins on every
conflict:

| Rule | Where it comes from |
|---|---|
| Display type is **Barlow Condensed**, body **Barlow**, numerics **JetBrains Mono** | TOKENS §1 |
| Display headings are **uppercase** | TOKENS §1 |
| `--accent` is **#E8002D** and means "now" — one per card | TOKENS §2, red budget |
| Podium **gold #FFD700 / silver #C0C0C0 / bronze #CD7F32**, fixed across themes | TOKENS §2 |
| Team colour only as **strip, top rule, dot, chip edge or full bar fill** — **never a panel background** | TOKENS §2 |
| Never colour text with the pure team hex | TOKENS §2, contrast contract |
| Leaderboard surfaces copy the **records hero pattern** (accent rule + proportional bars) | CLAUDE.md, design system |

The cards render to PNG for platforms that have no theme, so they use the dark
token values directly rather than CSS custom properties. The values are mirrored
in `scripts/social/cardkit.mjs` — if a token changes in `public/css/app.css`,
change it there too.
