# Team Page — Best Season View

**Date:** 2026-05-11
**Status:** Approved (mockup), ready for implementation plan
**Scope:** add a "Best Season" hero card to `/teams/<constructorRef>/` pages

## Goal

Highlight each constructor's single best season as a visual hero card on the team detail page. Sits between **Career Stats** and **Notable Drivers**.

## Selection rule

Pick exactly one season from `team.perSeason`. Sort by, in order:

1. **Championship position ascending** — null/missing positions sort last.
2. **Win-rate descending** — `wins / races`. Normalises across eras (16-race vs 24-race seasons).
3. **Points descending** — final tiebreaker.
4. **Year ascending** — earliest tied season wins; "they did it first" is the more historic claim.

Only consider seasons with `races > 0`. If no qualifying season exists, the section is omitted entirely.

## Auto-tagline ladder

Single string derived from the selected season. Evaluated top-down; first match wins.

| Condition                            | Tagline             |
|--------------------------------------|---------------------|
| `position === 1` && win-rate ≥ 0.75  | Total Dominance     |
| `position === 1` && win-rate ≥ 0.50  | Championship Year   |
| `position === 1`                     | Champions           |
| `position === 2`                     | Runners-Up          |
| `position === 3`                     | Third Place         |
| `position` in [4,5]                  | Top-Five Finish     |
| `position` in [6,10]                 | Top-Ten Finish      |
| `wins > 0`                           | Race Winners        |
| _otherwise_                          | Best Result         |

## Card content

```
[border-left: team.color]
┌─ left column ──────────────────┬─ right column ────────────────┐
│ eyebrow: "Best Season"         │  ┌─────────┬─────────┐         │
│ huge year (e.g. 2002)          │  │  WCC    │ WIN     │         │
│ tagline (auto, team-colored)   │  │  P1*    │ RATE    │         │
│                                │  │         │ 88.2%   │         │
│ eyebrow: "Drivers"             │  ├─────────┼─────────┤         │
│ [chip] [chip] ...              │  │ WINS    │ POINTS  │         │
│   linked to /drivers/<ref>/    │  │ 15      │ 221     │         │
│                                │  └─────────┴─────────┘         │
└────────────────────────────────┴───────────────────────────────┘
* WCC tile uses accent colour only when position === 1
```

- Mobile (≤720px): collapses to single column; stat grid stays 2×2.
- Border-left uses `team.color` (already on team object).
- Tagline text uses `team.color` (matches eyebrow).
- Win rate formatted to 1 decimal place (e.g. `88.2%`, `0.0%`).
- WCC value: `P{position}` if known, `—` if null.
- Drivers shown as chips linking to `/drivers/<driverRef>/`, full name as label.

## Data flow

The selection happens at build time in `scripts/build-archive.mjs`, so the prerendered page contains the chosen season's data without runtime computation.

New shape on each team JSON (additive — existing consumers unaffected):

```ts
bestSeason: {
  year: number;
  position: number | null;
  points: number | null;
  wins: number;
  races: number;
  winRate: number;          // wins / races, 0..1
  tagline: string;          // from ladder above
  drivers: Array<{ driverRef: string; name: string }>;
} | null                    // null when no race seasons exist
```

`TeamPage.astro` reads `team.bestSeason` and renders the card if non-null.

## File touch list (preview)

- `scripts/build-archive.mjs` — compute `bestSeason` in the team-doc emit pass, plus a small pure helper for the tagline ladder.
- `src/components/TeamPage.astro` — add the section between Career Stats and Notable Drivers; scoped `<style>` block for the new classes.
- _No_ change to `src/lib/shared.jsx`, the data fallbacks, or any island — this is a server-rendered detail page.

## Out of scope

- Per-driver win breakdown inside the card (dropped per user decision).
- Podiums (we don't currently extract per-season podium counts).
- Narrative paragraph copy (dropped — stat tiles + tagline carry the meaning).
- "Worst season" or "biggest improvement" — separate features if ever wanted.
- Year-aware variants for teams currently mid-season — the rule operates on completed seasons only; the current year is included once its bundle is finalised (same gate as `ARCHIVE_MAX_YEAR`).
