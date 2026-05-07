# Features

The app is eight HTML pages, each loading a single screen component. There is no router — navigation is plain `<a href>` to another `.html` file, with query strings for parameters like `?id=NOR` or `?round=7`.

URL helpers (`urlFor`, `navigate`, `getParam`) live in [js/shell.jsx](../js/shell.jsx).

## Pages

| HTML | Screen | What it shows |
|---|---|---|
| [index.html](../index.html) | [home.jsx](../js/screens/home.jsx) | Hero panel + Season Summary trio + top-5 driver cards |
| [standings-drivers.html](../standings-drivers.html) | [standings.jsx](../js/screens/standings.jsx) `DriverStandingsScreen` | Sortable driver standings table + Recharts points-progression chart + head-to-head |
| [standings-constructors.html](../standings-constructors.html) | [standings.jsx](../js/screens/standings.jsx) `ConstructorStandingsScreen` | Constructor standings table + team progression chart |
| [calendar.html](../calendar.html) | [calendar.jsx](../js/screens/calendar.jsx) | All rounds as race cards (date, circuit, status, winner if completed) |
| [race.html](../race.html) | [race.jsx](../js/screens/race.jsx) | Per-race detail; round from `?round=N`. Tabs for FP1/FP2/FP3/Q/Race (or Sprint variant) |
| [circuits.html](../circuits.html) | [circuits.jsx](../js/screens/circuits.jsx) `CircuitsIndexScreen` | Grid of all circuits in the season |
| [circuit.html](../circuit.html) | [circuits.jsx](../js/screens/circuits.jsx) `CircuitDetailScreen` | Per-circuit profile; id from `?id=...`. Track Characteristics + Historical Winners |
| [driver.html](../driver.html) | [driver.jsx](../js/screens/driver.jsx) | Per-driver profile; id from `?id=...`. Career stats (live from Jolpica) + season stats + Round by Round |

## Hero panel on home

The leading panel on `index.html` flips between two layouts depending on whether the selected season is in progress or finished:

- **Current season** → `NextRacePanel`. Eyebrow "Next Race", country/circuit name, days/hours/mins/secs countdown, Session Schedule (FP1/FP2/FP3/Q/Race, or Sprint-variant when applicable). Click goes to that race's detail page.
- **Historic season** → `SeasonAtGlance`. Eyebrow "YYYY Season", world champion's surname styled as the headline, team accent, points + gap to runner-up, Constructors' champion below. Right column lists Most Wins / Most Poles / Most Fastest Laps / Total DNFs. Click goes to driver standings.

The flip is data-driven, not based on the year picker — see [data-flow.md](data-flow.md).

## Shell widgets

In every page's chrome ([js/shell.jsx](../js/shell.jsx)):

- **Year picker** — dropdown with "Current Season" plus every year back to 1950. Selection writes to `localStorage.f1-year` and reloads `index.html`.
- **Theme switcher** — Light / Dark segmented control. Persists to `localStorage.f1-theme` and toggles `html.light`. Defaults to light.
- **Top nav** (desktop) — Home, Standings (dropdown → Drivers / Constructors), Calendar, Circuits. Active state from `currentRouteName()`.
- **Bottom nav** (mobile, ≤720px) — same four destinations as icons.
- **Version chip** — shows `v{APP_VERSION}` next to the logo so a deploy is visible at a glance. Bump on every PR (see CLAUDE.md).

## URL flags

Documented in CLAUDE.md too, repeated here for findability:

- `?year=YYYY` — load a specific season (e.g. `index.html?year=2019`). Persists into `localStorage.f1-year` via the picker.
- `?offline=1` — skip the Jolpica fetch entirely. The bundled fallback in [js/data.js](../js/data.js) is shown as-is. Useful for debugging or for working without network.
- `<body data-api="https://your-proxy.example.com/ergast/f1">` or `window.F1_API_BASE` — override the Jolpica base URL (e.g. for a local proxy).
