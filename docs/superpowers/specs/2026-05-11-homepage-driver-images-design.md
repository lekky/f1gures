# Homepage Driver Images — Design Spec

**Date:** 2026-05-11  
**Status:** Approved

## Goal

Add `DriverSilhouette` images to two areas of the homepage (`HomeScreen.jsx`):
1. The three **SummaryWidget** cards where a driver is present (Drivers' Leader, Last Race winner)
2. Each card in the **top-5 Driver Standings strip**

The `DriverSilhouette` component already exists in `src/lib/shared.jsx`. It loads `/images/drivers/{driver.jolpicaId}.webp` and falls back to a team-coloured SVG outline when no image file is found.

## Affected File

`src/components/islands/screens/HomeScreen.jsx` — only file changed.

No changes to `shared.jsx`, CSS files, or any other file.

## SummaryWidget Cards

### What changes

- Add `overflow: hidden` and `position: relative` to the outer `<a>` element (the `panel` wrapper). `position: relative` is already present in spirit via the panel class; make it explicit inline.
- Import `DriverSilhouette` from `shared.jsx`.
- When a `driver` prop is present, render `<DriverSilhouette>` absolutely positioned at the right edge of the card, bottom-aligned, at height ~90px (desktop) / ~70px (mobile).
- The silhouette sits on top of the card content visually but behind the text — use `zIndex: 0` on the silhouette and ensure the text container has `position: relative; zIndex: 1`.
- The `team` (Constructors' Leader) card has no driver, so it gets no silhouette. No change there.

### Layout sketch (driver cards only)

```
┌─────────────────────────────────┐
│ DRIVERS' LEADER            [img]│  ← silhouette clipped at card right edge
│                                 │
│ 12  ANDREA KIMI ANTONELLI       │
│     🇮🇹 Mercedes                 │
│─────────────────────────────────│
│ 109 pts          +29 over Russe │
└─────────────────────────────────┘
```

## Top-5 Driver Standings Strip

### What changes

- Import `DriverSilhouette` from `shared.jsx` (same import as above).
- Inside each `.driver-card` anchor, render `<DriverSilhouette>` **above** the existing `.meta` div, centred horizontally.
- Height: ~80px.
- The card already uses flex/block layout via the CSS class — add a wrapper `div` with `display: flex; flexDirection: column; alignItems: center` around the silhouette, or apply `textAlign: center` + `display: block` on the silhouette container.
- No change to the `.pos` badge or `.pts` section.

### Layout sketch

```
┌──────────────┐
│   [silhouette│  ← ~80px centred
│      img]    │
│    ANTONELLI │
│    MER · 🇮🇹  │
│─────────────│
│     109      │
│     PTS      │
└──────────────┘
```

## Fallback Behaviour

`DriverSilhouette` handles missing images internally — renders an SVG driver outline in the team's accent colour. No extra error handling needed. Historic seasons (year picker set to an older year) will fall back gracefully for all drivers.

## Mobile

- SummaryWidget silhouette: 70px height. `SummaryWidget` does not currently accept a `mob` prop — add it to the component signature and pass `mob={mob}` at each call site in `HomeScreen` to control silhouette height.
- Top-5 strip: on mobile the grid collapses to `1fr` (single column); silhouette height stays ~80px, no change needed.

## Out of scope

- No changes to `SeasonAtGlance` (the historic/end-of-season panel).
- No new image files — only uses the 32 existing `.webp` headshots.
- No changes to the `DriverSilhouette` component itself.
