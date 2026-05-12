# Drivers & Teams Listing Pages — Design Spec

**Date:** 2026-05-12  
**Status:** Approved

## Overview

Add `/drivers/` and `/teams/` listing pages (currently 404). Both pages show the full all-time catalogue of F1 drivers (862) and constructors (212) in a filterable, paginated card grid, with each card linking through to the existing detail page.

## Approach

Static Astro shell + React island (Approach A). The Astro page provides the SEO shell and mounts the island. On hydration, the island fetches the pre-built archive index JSON (`_drivers-index.json` / `_teams-index.json`) from `/data/archive/`, then handles all search, filtering, and pagination client-side in memory. No year-awareness needed — this is an all-time listing.

## 1. Data Pipeline

`scripts/build-archive.mjs` gets one new pass at the end of its existing run, after all driver/team docs are already built.

**For drivers** — enrich each entry in `_drivers-index.json` with:
- `last5`: array of up to 5 objects `{ pos, year, round }` — the driver's final 5 career race results (position number, or `"DNF"`/`"DNS"` for non-finishes), sorted chronologically.
- `firstYear`: earliest season year from the driver's race history.
- `lastYear`: latest season year (or `"present"` if `lastYear === currentYear`).

**For teams** — same additions to `_teams-index.json`:
- `last5`: constructor's last 5 race results — best finish between the two drivers in each race.
- `firstYear`, `lastYear`: derived from race history.

No new files. Both index JSONs already exist; this enriches existing entries.

## 2. New Files

| File | Purpose |
|---|---|
| `src/pages/drivers.astro` | Static SEO shell — title, description, canonical, Chrome, mounts DriversIndexIsland |
| `src/pages/teams.astro` | Same for teams |
| `src/components/islands/DriversIndexIsland.jsx` | Fetches `_drivers-index.json` on mount, passes data to DriversIndexScreen |
| `src/components/islands/TeamsIndexIsland.jsx` | Fetches `_teams-index.json` on mount, passes data to TeamsIndexScreen |
| `src/components/islands/screens/DriversIndexScreen.jsx` | Search, nationality filter, pagination, grid render for drivers |
| `src/components/islands/screens/TeamsIndexScreen.jsx` | Search, nationality filter, pagination, grid render for teams |

### Nav update

`src/components/Chrome.astro` — add **Drivers** and **Teams** links alongside the existing Circuits nav link.

## 3. Screen Layout

### Grid

CSS grid: 3–4 columns desktop → 2 columns tablet (≤ 720px) → 1 column mobile (≤ 480px). Each card is a full `<a>` tag link with a hover lift/border treatment consistent with circuit cards.

### Driver card anatomy

```
[ headshot or silhouette ]
Alexander Albon            🇹🇭 Thai
#23 · Williams
2016–present   🏆 0   🏁 0
● ● ○ ● ●
```

- **Photo**: `public/images/drivers/<driverRef>.webp`; SVG silhouette fallback (same as `DriverSilhouette` in `shared.jsx`)
- **Name**: first + last
- **Nationality**: flag emoji + nationality string
- **Number · Team**: car number and current/last team
- **Active years**: `firstYear–lastYear` (or `firstYear–present`)
- **Championships** 🏆 and **Wins** 🏁: career totals from archive doc
- **Last 5**: form dots using the same `Last5` widget from `StandingsCommon.jsx`
- **Click**: links to `/drivers/<jolpicaId>/` via `urlFor`

### Team card anatomy

```
[ ██ team color bar ]
Red Bull Racing
🇦🇹 Austrian
2005–present   🏆 6   🏁 120
● ● ● ○ ●
```

- **Color bar**: left border or top stripe using `team.color` hex
- **Name**: full constructor name
- **Nationality**: flag emoji + nationality string
- **Active years**: `firstYear–lastYear` (or `firstYear–present`)
- **Championships** 🏆 and **Wins** 🏁: career totals from archive doc
- **Last 5**: form dots (same widget)
- **Click**: links to `/teams/<constructorRef>/` via `urlFor`
- **No car image** (team logos to be added in a future pass)

### Default sort

Most championships descending, then wins descending. Applied before any filter.

### Controls

Above the grid:
- **Search input**: live filters by driver/team name as you type (case-insensitive)
- **Nationality dropdown**: populated from unique nationality values in the loaded index; filters in combination with search (AND logic)
- **Result count**: e.g. "Showing 24 of 862"

### Pagination

- 24 items per page
- Numbered page buttons + Prev / Next
- Resets to page 1 whenever search or nationality filter changes
- No URL state — transient island state only (consistent with other listing islands)

## 4. Data Columns Summary

### Drivers

| Column | Source field |
|---|---|
| Photo | `images/drivers/<driverRef>.webp` |
| Name | `first`, `last` |
| Car number | `num` |
| Nationality | `nationality`, `flag` |
| Team | `team` (last/current) |
| Active years | `firstYear`, `lastYear` (new) |
| Championships | `championships` |
| Wins | `wins` |
| Last 5 | `last5` (new) |

### Teams

| Column | Source field |
|---|---|
| Color bar | `color` |
| Name | `name` |
| Nationality | `nationality` |
| Active years | `firstYear`, `lastYear` (new) |
| Championships | `championships` |
| Wins | `wins` |
| Last 5 | `last5` (new) |

## 5. Out of Scope

- Team logos / car images (future)
- URL-persisted filter/pagination state
- Year-aware switching (this is all-time only)
- Sorting controls (sort order is fixed; no user-facing sort toggle)
