#!/usr/bin/env python3
"""Fetch per-driver tyre-stint data for a single race and cache it as JSON.

Standalone, run-by-hand helper (NOT part of `npm run prebuild`) — the Python /
FastF1 cost is quarantined off the Node/Astro build, exactly like
`npm run build:climate`. It pulls compound + start/end lap for every classified
driver from F1's official live-timing feed (via FastF1, which covers 2018 to
present) and writes a small deterministic JSON that a future "Tyre Stints"
React island can render (horizontal bar per driver, x-axis = lap, segments
coloured by compound).

Why FastF1 and not Jolpica/Ergast: the site's per-race data comes from Jolpica
(`scripts/fetch-season.mjs`), which has pit-stop laps but NO tyre compounds, so
it cannot power this chart. Compound/stint data only exists in F1's live-timing
feed; FastF1's `laps` DataFrame already exposes `Compound` + `Stint`, and it
absorbs F1 format changes so we don't maintain a fragile parser.

Usage:
    python scripts/fetch-stints.py            # defaults: 2026 round 9 (Silverstone)
    python scripts/fetch-stints.py 2026 9
    python scripts/fetch-stints.py 2024 12

Output: public/data/stints/<year>-<round>.json
    {
      "RUS": [
        {"compound": "MEDIUM", "start": 1,  "end": 25},
        {"compound": "HARD",   "start": 26, "end": 48},
        {"compound": "SOFT",   "start": 49, "end": 52}
      ],
      ...
    }
    Keys are 3-letter driver codes (RUS, NOR, ...) — these match FastF1's
    `Driver` column AND the per-race `results['<round>'].detail` codes in the
    season bundles, so no remapping is needed when the chart joins the two.

Compound -> colour mapping for the eventual chart (matches the mockup legend):
    SOFT         -> --accent (red)
    MEDIUM       -> yellow
    HARD         -> white
    INTERMEDIATE -> green
    WET          -> blue

The output is committed to the repo (like the season bundles
`public/data/<year>.json`) because it's produced by this manual script, not by
prebuild. Output is deterministic (sorted keys, no timestamps) so re-runs
produce identical bytes.
"""

import json
import pathlib
import sys

import fastf1

# FastF1 caches session blobs (tens of MB per session) — keep them in a
# gitignored scratch dir at the repo root so re-runs are fast and offline-ish.
REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE_DIR = REPO_ROOT / ".fastf1-cache"
OUT_DIR = REPO_ROOT / "public" / "data" / "stints"


def build_stints(year: int, rnd: int) -> dict:
    """Return {driver_code: [{compound, start, end}, ...]} for one race."""
    session = fastf1.get_session(year, rnd, "R")  # 'R' = Race
    # We only need the laps table — skip telemetry/weather/messages to keep the
    # download small and fast.
    session.load(telemetry=False, weather=False, messages=False)

    laps = session.laps
    out = {}
    for drv in laps["Driver"].unique():
        if not isinstance(drv, str) or not drv:
            continue
        dl = laps.pick_drivers(drv).sort_values("LapNumber")
        stints = []
        for _stint_no, grp in dl.groupby("Stint"):
            comp = grp["Compound"].iloc[0]
            # Skip stints with no usable compound (e.g. FastF1 rows for a lap
            # that never ran, or an "UNKNOWN"/NaN entry). A real stint always
            # names one of SOFT/MEDIUM/HARD/INTERMEDIATE/WET.
            if comp is None or (isinstance(comp, float)) or comp == "" or comp == "UNKNOWN":
                continue
            stints.append(
                {
                    "compound": str(comp),
                    "start": int(grp["LapNumber"].min()),
                    "end": int(grp["LapNumber"].max()),
                }
            )
        # Order stints by their start lap so segments render left-to-right.
        stints.sort(key=lambda s: s["start"])
        if stints:
            out[str(drv)] = stints
    return out


def main() -> int:
    year = int(sys.argv[1]) if len(sys.argv) > 1 else 2026
    rnd = int(sys.argv[2]) if len(sys.argv) > 2 else 9

    CACHE_DIR.mkdir(exist_ok=True)
    fastf1.Cache.enable_cache(str(CACHE_DIR))

    print(f"Fetching tyre stints for {year} round {rnd} (Race)...")
    out = build_stints(year, rnd)

    if not out:
        print("ERROR: no stint data produced — is the race loaded / completed?", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"{year}-{rnd}.json"
    # Deterministic output: driver keys sorted (FastF1's iteration order is not
    # stable, so we sort explicitly), each stint object left in natural
    # compound/start/end order, 2-space indent, trailing newline, no timestamps.
    ordered = {code: out[code] for code in sorted(out)}
    text = json.dumps(ordered, indent=2, ensure_ascii=False) + "\n"
    out_path.write_text(text, encoding="utf-8")

    total_stints = sum(len(v) for v in out.values())
    print(f"Wrote {out_path.relative_to(REPO_ROOT)}")
    print(f"  {len(out)} drivers, {total_stints} stints total")
    for code in sorted(out):
        segs = ", ".join(f"{s['compound'][:1]}{s['start']}-{s['end']}" for s in out[code])
        print(f"  {code}: {segs}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
