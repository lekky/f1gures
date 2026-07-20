#!/usr/bin/env python3
"""Fetch + derive per-session FastF1 data for a race weekend.

Feeds the race-page "Weekend Analysis" experience (session tabs + the
Visualisation Explorer island). For every completed session of a weekend it
pulls timing/telemetry/weather/race-control from F1's live-timing feed via
FastF1 and writes ONE compact, deterministic JSON per session plus an
index.json manifest into:

    public/data/fastf1/<year>/<round>/
        index.json          manifest: schedule + which sessions have data
        fp1.json fp2.json fp3.json sprintQuali.json sprint.json q.json race.json

The heavy analytical work (minisector dominance, pole-lap speed/delta traces,
track outline from GPS, long-run detection, pit-lane durations, SC/VSC bands)
happens HERE in Python so the frontend JSON stays small (~50-150 KB/session).
Lap-level derivations that depend on UI state (gap-to-leader, positions per
lap, tyre-deg smoothing) happen client-side in
src/components/islands/raceweekend/derive.js from the raw laps shipped here.

Outputs are committed to the repo (like the season bundles) because they come
from this script, not from `npm run prebuild`. Deterministic: sorted keys,
fixed float rounding, no timestamps.

Usage:
    python scripts/fetch-fastf1.py 2026 9            # whole weekend (completed sessions)
    python scripts/fetch-fastf1.py 2026 9 --session q  # one session
    python scripts/fetch-fastf1.py --auto            # scan current-season bundle,
                                                     # fetch whatever is completed
                                                     # but missing on disk
    python scripts/fetch-fastf1.py 2026 9 --force    # re-fetch even if files exist

Supersedes scripts/fetch-stints.py (the stints prototype): stints ship inside
each race/sprint session JSON now.

Session ids match the season-bundle `sessions` keys: fp1 fp2 fp3 sprintQuali
sprint q race. FastF1 covers 2018+ (telemetry) — backfill older rounds by
running this by hand per round.
"""

import argparse
import json
import math
import pathlib
import sys
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

import fastf1

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE_DIR = REPO_ROOT / ".fastf1-cache"
OUT_ROOT = REPO_ROOT / "public" / "data" / "fastf1"
SCHEMA = 1

# bundle session id -> fastf1 session identifier
SESSION_IDS = {
    "fp1": "FP1", "fp2": "FP2", "fp3": "FP3",
    "sprintQuali": "SQ", "sprint": "S", "q": "Q", "race": "R",
}
SESSION_LABELS = {
    "fp1": "FP1", "fp2": "FP2", "fp3": "FP3",
    "sprintQuali": "Sprint Quali", "sprint": "Sprint", "q": "Qualifying", "race": "Race",
}
# session type drives which builder runs
SESSION_TYPE = {
    "fp1": "practice", "fp2": "practice", "fp3": "practice",
    "sprintQuali": "quali", "q": "quali",
    "sprint": "race", "race": "race",
}
# rough session lengths, used to decide "has this session finished yet"
SESSION_MINUTES = {
    "fp1": 60, "fp2": 60, "fp3": 60,
    "sprintQuali": 45, "q": 60, "sprint": 70, "race": 150,
}
# grace period after scheduled end before we trust the timing feed is complete
GRACE_MINUTES = 40

COMPOUND_SHORT = {
    "SOFT": "S", "MEDIUM": "M", "HARD": "H",
    "INTERMEDIATE": "I", "WET": "W",
    "HYPERSOFT": "S", "ULTRASOFT": "S", "SUPERSOFT": "S", "SUPERHARD": "H",
    "TEST_UNKNOWN": "U", "TEST-UNKNOWN": "U", "UNKNOWN": "U",
}

# FastF1 TeamName -> season-bundle team id (2020s grids). Fallback: slug.
TEAM_IDS = {
    "Ferrari": "ferrari", "Mercedes": "mercedes",
    "Red Bull Racing": "redbull", "Red Bull": "redbull",
    "McLaren": "mclaren", "Aston Martin": "aston", "Alpine": "alpine",
    "Williams": "williams", "Racing Bulls": "rb", "RB": "rb",
    "AlphaTauri": "alphatauri", "Toro Rosso": "toro_rosso",
    "Kick Sauber": "sauber", "Sauber": "sauber", "Alfa Romeo": "alfa",
    "Alfa Romeo Racing": "alfa", "Audi": "audi", "Cadillac": "cadillac",
    "Haas F1 Team": "haas", "Haas": "haas",
    "Racing Point": "racing_point", "Force India": "force_india", "Renault": "renault",
}


def r3(x):
    """Round to 3 dp, returning None for NaN/NaT-ish values."""
    if x is None:
        return None
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return round(f, 3)


def secs(td):
    """Timedelta -> float seconds (None-safe)."""
    if td is None or pd.isna(td):
        return None
    return r3(td.total_seconds())


def load_bundle(year):
    p = REPO_ROOT / "public" / "data" / f"{year}.json"
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def bundle_calendar_entry(bundle, rnd):
    if not bundle:
        return None
    for e in bundle.get("calendar", []):
        if int(e.get("round", -1)) == int(rnd):
            return e
    return None


def team_color_map(bundle):
    """team id -> color hex, from the season bundle's teams list."""
    out = {}
    for t in (bundle or {}).get("teams", []):
        tid = t.get("id")
        col = t.get("color")
        if tid and col:
            out[tid] = col
    return out


def driver_ref_map(bundle):
    """driver code -> Ergast driverRef (bundle `jolpicaId`), so the frontend can
    link driver pages + resolve headshots without a client-side lookup."""
    out = {}
    for d in (bundle or {}).get("drivers", []):
        code = d.get("code") or d.get("id")
        ref = d.get("jolpicaId")
        if code and ref:
            out[str(code)] = str(ref)
    return out


def team_id_for(name):
    if name in TEAM_IDS:
        return TEAM_IDS[name]
    return str(name or "").lower().replace(" ", "_") or None


# ---------------------------------------------------------------- drivers


def build_drivers(session, colors, refs):
    """Classified driver list in result order (falls back to laps order)."""
    rows = []
    res = session.results
    if res is not None and len(res) > 0:
        for _, r in res.iterrows():
            code = str(r.get("Abbreviation") or "").strip()
            if not code:
                continue
            tid = team_id_for(r.get("TeamName"))
            f1_col = r.get("TeamColor")
            color = colors.get(tid) or (f"#{f1_col}" if isinstance(f1_col, str) and f1_col else None)
            pos = r.get("Position")
            grid = r.get("GridPosition")
            status = r.get("Status")
            time_v = r.get("Time")
            rows.append({
                "code": code,
                "ref": refs.get(code),
                "name": str(r.get("FullName") or code),
                "team": str(r.get("TeamName") or ""),
                "teamId": tid,
                "color": color or "#8A8B93",
                "position": int(pos) if pd.notna(pos) else None,
                "grid": int(grid) if pd.notna(grid) and grid == grid else None,
                "status": str(status) if isinstance(status, str) and status else None,
                "gap": secs(time_v) if pd.notna(time_v) else None,
                "points": r3(r.get("Points")) if pd.notna(r.get("Points")) else None,
            })
    if rows:
        # session.results order is classification order already
        return rows
    # practice fallback: no formal classification -> unique drivers from laps
    for code in session.laps["Driver"].dropna().unique():
        rows.append({"code": str(code), "ref": refs.get(str(code)), "name": str(code),
                     "team": "", "teamId": None, "color": "#8A8B93", "position": None,
                     "grid": None, "status": None, "gap": None, "points": None})
    return rows


# ---------------------------------------------------------------- weather / race control


def build_weather(session):
    w = session.weather_data
    if w is None or len(w) == 0:
        return None
    samples = []
    for _, r in w.iterrows():
        t = r.get("Time")
        if pd.isna(t):
            continue
        wind = r.get("WindSpeed")  # FastF1 reports m/s — convert to km/h
        samples.append([
            round(t.total_seconds() / 60.0, 1),
            r3(r.get("AirTemp")), r3(r.get("TrackTemp")),
            r3(wind * 3.6) if pd.notna(wind) else None,
            1 if bool(r.get("Rainfall")) else 0,
        ])
    # thin to <= 80 samples to keep files small
    if len(samples) > 80:
        step = len(samples) / 80.0
        samples = [samples[int(i * step)] for i in range(80)]
    air = [s[1] for s in samples if s[1] is not None]
    trk = [s[2] for s in samples if s[2] is not None]
    wind = [s[3] for s in samples if s[3] is not None]
    wd = w.get("WindDirection")
    return {
        "airMin": r3(min(air)) if air else None, "airMax": r3(max(air)) if air else None,
        "trackMin": r3(min(trk)) if trk else None, "trackMax": r3(max(trk)) if trk else None,
        "windAvg": r3(sum(wind) / len(wind)) if wind else None,
        "windDirDeg": int(wd.median()) if wd is not None and wd.notna().any() else None,
        "rain": any(s[4] for s in samples),
        "samples": samples,
    }


def build_race_control(session):
    msgs = session.race_control_messages
    if msgs is None or len(msgs) == 0:
        return []
    out = []
    for _, m in msgs.iterrows():
        txt = str(m.get("Message") or "")
        if not txt:
            continue
        lap = m.get("Lap")
        cat = str(m.get("Category") or "")
        flag = m.get("Flag")
        t = m.get("Time")
        clock = t.strftime("%H:%M") if isinstance(t, (pd.Timestamp, datetime)) else None
        out.append({
            "lap": int(lap) if pd.notna(lap) else None,
            "time": clock,
            "cat": cat or None,
            "flag": str(flag) if isinstance(flag, str) and flag else None,
            "msg": txt,
        })
    return out


# ---------------------------------------------------------------- race / sprint


def track_status_bands(laps, total_laps):
    """[{from,to,type}] SC/VSC bands by lap, from the laps' TrackStatus codes."""
    by_lap = {}
    for _, l in laps.iterrows():
        n = l.get("LapNumber")
        if pd.isna(n):
            continue
        st = str(l.get("TrackStatus") or "")
        cur = by_lap.setdefault(int(n), set())
        if "4" in st:
            cur.add("SC")
        if "6" in st or "7" in st:
            cur.add("VSC")
    bands = []
    active = None
    for lap in range(1, (total_laps or 0) + 1):
        s = by_lap.get(lap, set())
        typ = "SC" if "SC" in s else ("VSC" if "VSC" in s else None)
        if typ and active and active["type"] == typ and active["to"] == lap - 1:
            active["to"] = lap
        elif typ:
            active = {"from": lap, "to": lap, "type": typ}
            bands.append(active)
        else:
            active = None
    return bands


def build_race_session(session):
    laps = session.laps
    total = int(session.total_laps or laps["LapNumber"].max())

    lap_rows = {}
    stints = []
    pits = []
    for code in laps["Driver"].dropna().unique():
        dl = laps.pick_drivers(code).sort_values("LapNumber")
        arr = []
        for _, l in dl.iterrows():
            n = l.get("LapNumber")
            if pd.isna(n):
                continue
            t = secs(l.get("LapTime"))
            pos = l.get("Position")
            comp = COMPOUND_SHORT.get(str(l.get("Compound") or "").upper(), "U")
            life = l.get("TyreLife")
            stint = l.get("Stint")
            has_pit = 1 if (pd.notna(l.get("PitInTime")) or pd.notna(l.get("PitOutTime"))) else 0
            st = str(l.get("TrackStatus") or "")
            neutral = 1 if ("4" in st or "6" in st or "7" in st) else 0
            accurate = bool(l.get("IsAccurate"))
            green = 1 if (accurate and not has_pit and not neutral and t is not None) else 0
            arr.append([
                int(n), t,
                int(pos) if pd.notna(pos) else None,
                comp,
                int(life) if pd.notna(life) else None,
                int(stint) if pd.notna(stint) else None,
                has_pit, neutral, green,
            ])
        if arr:
            lap_rows[str(code)] = arr

        # stints
        for _sn, grp in dl.groupby("Stint"):
            comp_raw = grp["Compound"].iloc[0]
            comp = COMPOUND_SHORT.get(str(comp_raw or "").upper())
            if not comp or comp == "U":
                continue
            life0 = grp["TyreLife"].iloc[0]
            stints.append({
                "code": str(code), "compound": comp,
                "from": int(grp["LapNumber"].min()), "to": int(grp["LapNumber"].max()),
                "used": bool(pd.notna(life0) and life0 > 1),
            })

        # pit lane durations: PitInTime on lap N -> PitOutTime on lap N+1
        dl_idx = dl.reset_index(drop=True)
        for i, l in dl_idx.iterrows():
            pit_in = l.get("PitInTime")
            if pd.isna(pit_in):
                continue
            lapn = l.get("LapNumber")
            dur = None
            if i + 1 < len(dl_idx):
                pit_out = dl_idx.iloc[i + 1].get("PitOutTime")
                if pd.notna(pit_out):
                    d = (pit_out - pit_in).total_seconds()
                    if 0 < d < 180:
                        dur = r3(d)
            st = str(l.get("TrackStatus") or "")
            pits.append({
                "code": str(code),
                "lap": int(lapn) if pd.notna(lapn) else None,
                "dur": dur,
                "neutral": 1 if ("4" in st or "6" in st or "7" in st) else 0,
            })

    stints.sort(key=lambda s: (s["code"], s["from"]))
    pits.sort(key=lambda p: (p["lap"] or 0, p["code"]))

    return {
        "totalLaps": total,
        "laps": {k: lap_rows[k] for k in sorted(lap_rows)},
        "stints": stints,
        "pitStops": pits,
        "trackStatus": track_status_bands(laps, total),
        "raceControl": build_race_control(session),
    }


# ---------------------------------------------------------------- quali


def _seg_columns(res):
    """Q1/Q2/Q3 columns present in results (SQ sessions also use Q1..Q3)."""
    return [c for c in ("Q1", "Q2", "Q3") if res is not None and c in res.columns]


def build_quali_session(session):
    laps = session.laps
    res = session.results
    seg_cols = _seg_columns(res)

    results = []
    if res is not None and len(res) > 0:
        for _, r in res.iterrows():
            code = str(r.get("Abbreviation") or "").strip()
            if not code:
                continue
            row = {"code": code}
            for c in seg_cols:
                row[c.lower()] = secs(r.get(c))
            results.append(row)

    # sectors of each driver's overall fastest lap
    sectors = []
    fastest_by = {}
    for code in laps["Driver"].dropna().unique():
        dl = laps.pick_drivers(code)
        try:
            fl = dl.pick_fastest()
        except Exception:
            fl = None
        if fl is None or pd.isna(fl.get("LapTime")):
            continue
        fastest_by[str(code)] = fl
        s = [secs(fl.get("Sector1Time")), secs(fl.get("Sector2Time")), secs(fl.get("Sector3Time"))]
        # session-best sector times across all non-deleted laps: the "ideal lap"
        # basis (best-lap sectors alone always sum to the best lap itself)
        try:
            valid = dl[dl["Deleted"] != True] if "Deleted" in dl.columns else dl  # noqa: E712 — pandas elementwise
        except Exception:
            valid = dl
        bs = []
        for col in ("Sector1Time", "Sector2Time", "Sector3Time"):
            v = valid[col].dropna() if col in valid.columns else []
            bs.append(secs(v.min()) if len(v) else None)
        sectors.append({
            "code": str(code), "lap": secs(fl.get("LapTime")), "s": s, "bs": bs,
            "st": r3(fl.get("SpeedST")), "fl": r3(fl.get("SpeedFL")),
        })
    sectors.sort(key=lambda x: (x["lap"] is None, x["lap"]))

    # all timed laps (for track evolution): [sessMin, lapSec, compound, deleted]
    laps_all = {}
    for code in laps["Driver"].dropna().unique():
        arr = []
        for _, l in laps.pick_drivers(code).iterrows():
            t = secs(l.get("LapTime"))
            start = l.get("LapStartTime")
            if t is None or pd.isna(start):
                continue
            deleted = 1 if bool(l.get("Deleted")) else 0
            comp = COMPOUND_SHORT.get(str(l.get("Compound") or "").upper(), "U")
            accurate = bool(l.get("IsAccurate"))
            if not accurate and not deleted:
                continue
            arr.append([round(start.total_seconds() / 60.0, 2), t, comp, deleted])
        if arr:
            laps_all[str(code)] = arr

    out = {
        "results": results,
        "sectors": sectors,
        "lapsAll": {k: laps_all[k] for k in sorted(laps_all)},
        "raceControl": build_race_control(session),
    }

    # --- telemetry-derived extras: pole-lap traces + minisector dominance + track outline
    top = [s["code"] for s in sectors[:3]]
    tel = {}
    for code in top:
        fl = fastest_by.get(code)
        if fl is None:
            continue
        try:
            t = fl.get_telemetry().add_distance()
        except Exception:
            continue
        if t is None or len(t) < 50:
            continue
        tel[code] = t

    if len(tel) >= 2:
        codes = [c for c in top if c in tel][:3]
        lap_len = float(min(tel[c]["Distance"].max() for c in codes))

        # pole lap speed traces: front two, resampled on a common distance grid
        a, b = codes[0], codes[1]
        step = max(10.0, lap_len / 400.0)
        grid = np.arange(0.0, lap_len, step)

        def resample(code, col):
            d = tel[code]["Distance"].to_numpy(dtype=float)
            v = tel[code][col]
            if hasattr(v, "dt"):
                v = v.dt.total_seconds()
            v = v.to_numpy(dtype=float)
            ok = ~np.isnan(d) & ~np.isnan(v)
            return np.interp(grid, d[ok], v[ok])

        spd_a = resample(a, "Speed")
        spd_b = resample(b, "Speed")
        t_a = resample(a, "Time")
        t_b = resample(b, "Time")
        t_a -= t_a[0]
        t_b -= t_b[0]
        delta = t_b - t_a  # positive: b behind a
        # Distance integration drifts a tenth or two between cars (sampling
        # starts before/after the line) — anchor the end of the delta trace to
        # the official lap-time difference with a linear-in-distance correction.
        lap_a = secs(fastest_by[a].get("LapTime"))
        lap_b = secs(fastest_by[b].get("LapTime"))
        if lap_a is not None and lap_b is not None and len(delta) > 1:
            target = lap_b - lap_a
            drift = target - float(delta[-1])
            delta = delta + drift * (grid / grid[-1])

        corners = []
        try:
            ci = session.get_circuit_info()
            for _, c in ci.corners.iterrows():
                num = c.get("Number")
                letter = str(c.get("Letter") or "")
                corners.append({
                    "name": f"T{int(num)}{letter}" if pd.notna(num) else letter or "?",
                    "d": r3(c.get("Distance")),
                })
        except Exception:
            pass

        out["poleTel"] = {
            "a": a, "b": b, "step": r3(step), "len": r3(lap_len),
            "speedA": [round(float(x), 1) for x in spd_a],
            "speedB": [round(float(x), 1) for x in spd_b],
            "delta": [round(float(x), 3) for x in delta],
            "corners": corners,
        }

        # minisector dominance among top 3
        n_seg = 25
        bounds = np.linspace(0.0, lap_len, n_seg + 1)
        seg_times = {}
        for code in codes:
            d = tel[code]["Distance"].to_numpy(dtype=float)
            tt = tel[code]["Time"].dt.total_seconds().to_numpy(dtype=float)
            ok = ~np.isnan(d) & ~np.isnan(tt)
            d, tt = d[ok], tt[ok]
            tb = np.interp(bounds, d, tt)
            seg_times[code] = np.diff(tb)
        owners = []
        for i in range(n_seg):
            owners.append(min(codes, key=lambda c: seg_times[c][i]))
        out["dominance"] = {"n": n_seg, "codes": codes, "owners": owners}

        # track outline from the pole lap's GPS, normalized into a 1000x700 box
        try:
            pos = tel[codes[0]]
            x = pos["X"].to_numpy(dtype=float)
            y = pos["Y"].to_numpy(dtype=float)
            dist = pos["Distance"].to_numpy(dtype=float)
            ok = ~np.isnan(x) & ~np.isnan(y) & ~np.isnan(dist)
            x, y, dist = x[ok], y[ok], dist[ok]
            try:
                rot = float(session.get_circuit_info().rotation) * math.pi / 180.0
            except Exception:
                rot = 0.0
            xr = x * math.cos(rot) - y * math.sin(rot)
            yr = x * math.sin(rot) + y * math.cos(rot)
            yr = -yr  # SVG y grows downward
            # resample ~240 points evenly by distance
            n_pts = 240
            dg = np.linspace(dist.min(), dist.max(), n_pts)
            xs = np.interp(dg, dist, xr)
            ys = np.interp(dg, dist, yr)
            w, h = xs.max() - xs.min(), ys.max() - ys.min()
            scale = min(900.0 / w, 620.0 / h) if w > 0 and h > 0 else 1.0
            xs = (xs - xs.min()) * scale + 50.0
            ys = (ys - ys.min()) * scale + 40.0
            out["track"] = {
                "pts": [[round(float(px), 1), round(float(py), 1)] for px, py in zip(xs, ys)],
                "len": r3(lap_len),
            }
        except Exception:
            pass

    return out


# ---------------------------------------------------------------- practice


def build_practice_session(session):
    laps = session.laps

    laps_all = {}
    best = []
    long_runs = []
    traps = []
    for code in laps["Driver"].dropna().unique():
        dl = laps.pick_drivers(code).sort_values("LapNumber")
        arr = []
        best_t = None
        for _, l in dl.iterrows():
            t = secs(l.get("LapTime"))
            start = l.get("LapStartTime")
            if t is None or pd.isna(start):
                continue
            if not bool(l.get("IsAccurate")):
                continue
            comp = COMPOUND_SHORT.get(str(l.get("Compound") or "").upper(), "U")
            arr.append([round(start.total_seconds() / 60.0, 2), t, comp])
            if best_t is None or t < best_t:
                best_t = t
        if arr:
            laps_all[str(code)] = arr
        if best_t is not None:
            best.append({"code": str(code), "t": best_t})

        # long runs: stints with >= 6 accurate laps -> average
        for _sn, grp in dl.groupby("Stint"):
            g = grp[grp["IsAccurate"] == True]  # noqa: E712
            ts = [secs(v) for v in g["LapTime"] if secs(v) is not None]
            if len(ts) >= 6:
                comp = COMPOUND_SHORT.get(str(grp["Compound"].iloc[0] or "").upper(), "U")
                long_runs.append({
                    "code": str(code), "c": comp, "laps": len(ts),
                    "avg": r3(sum(ts) / len(ts)),
                })

        st_max = dl["SpeedST"].max() if "SpeedST" in dl.columns else None
        fl_max = dl["SpeedFL"].max() if "SpeedFL" in dl.columns else None
        if pd.notna(st_max) or pd.notna(fl_max):
            traps.append({"code": str(code),
                          "st": r3(st_max) if pd.notna(st_max) else None,
                          "fl": r3(fl_max) if pd.notna(fl_max) else None})

    best.sort(key=lambda x: x["t"])
    long_runs.sort(key=lambda x: x["avg"])
    traps.sort(key=lambda x: (x["st"] is None, -(x["st"] or 0)))

    return {
        "order": best,
        "lapsAll": {k: laps_all[k] for k in sorted(laps_all)},
        "longRuns": long_runs,
        "speedTraps": traps,
        "raceControl": build_race_control(session),
    }


# ---------------------------------------------------------------- orchestration


SESSION_ORDER = ("fp1", "fp2", "fp3", "sprintQuali", "sprint", "q", "race")


def session_schedule(bundle_entry, year, rnd):
    """[(session_id, start_datetime_utc)] for the weekend, in canonical order.

    Bundle session times are authoritative (they match the site's session
    tables). Any session the bundle leaves without a usable date+time is filled
    from the FastF1 event schedule — so a *partial* bundle no longer suppresses
    the fetch of the sessions it omits. Older bundles (2020-2021) carry
    practice/quali dates but no times; without this merge only the race entered
    the schedule and every practice/quali session was silently skipped."""
    times = {}
    sess = (bundle_entry or {}).get("sessions") or {}
    for sid in SESSION_ORDER:
        v = sess.get(sid)
        if v and v.get("date") and v.get("time"):
            t = str(v["time"]).replace("Z", "+00:00")
            try:
                times[sid] = datetime.fromisoformat(f'{v["date"]}T{t}')
            except ValueError:
                pass
    # Fill any session the bundle didn't fully specify from the FastF1 schedule.
    if len(times) < len(SESSION_ORDER):
        f1_to_bundle = {"Practice 1": "fp1", "Practice 2": "fp2", "Practice 3": "fp3",
                        "Sprint Qualifying": "sprintQuali", "Sprint Shootout": "sprintQuali",
                        "Sprint": "sprint", "Qualifying": "q", "Race": "race"}
        try:
            ev = fastf1.get_event(year, rnd)
        except Exception:
            ev = None
        for i in range(1, 6):
            if ev is None:
                break
            try:
                name = ev.get(f"Session{i}")
                date = ev.get(f"Session{i}DateUtc")
            except Exception:
                continue
            sid = f1_to_bundle.get(str(name))
            if sid and sid not in times and pd.notna(date):
                times[sid] = date.to_pydatetime().replace(tzinfo=timezone.utc)
    return [(sid, times[sid]) for sid in SESSION_ORDER if sid in times]


def is_finished(start_utc, sid, now):
    if start_utc.tzinfo is None:
        start_utc = start_utc.replace(tzinfo=timezone.utc)
    end = start_utc + timedelta(minutes=SESSION_MINUTES.get(sid, 90) + GRACE_MINUTES)
    return now >= end


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=False)
    path.write_text(text + "\n", encoding="utf-8")
    return len(text)


def fetch_session(year, rnd, sid, colors, refs):
    """Load one session via FastF1 and build its JSON payload."""
    stype = SESSION_TYPE[sid]
    need_tel = stype == "quali"
    session = fastf1.get_session(year, rnd, SESSION_IDS[sid])
    session.load(telemetry=need_tel, weather=True, messages=True)
    if session.laps is None or len(session.laps) == 0:
        raise RuntimeError(f"no laps for {sid}")

    if stype == "race":
        body = build_race_session(session)
    elif stype == "quali":
        body = build_quali_session(session)
    else:
        body = build_practice_session(session)

    payload = {
        "schema": SCHEMA,
        "type": stype,
        "session": sid,
        "drivers": build_drivers(session, colors, refs),
        "weather": build_weather(session),
    }
    payload.update(body)
    return payload


def process_weekend(year, rnd, only_session=None, force=False):
    bundle = load_bundle(year)
    entry = bundle_calendar_entry(bundle, rnd)
    colors = team_color_map(bundle)
    refs = driver_ref_map(bundle)
    sched = session_schedule(entry, year, rnd)
    if not sched:
        print(f"  {year} R{rnd}: no session schedule found — skipping")
        return False

    now = datetime.now(timezone.utc)
    out_dir = OUT_ROOT / str(year) / str(rnd)
    wrote_any = False
    have = []

    for sid, start in sched:
        out_path = out_dir / f"{sid}.json"
        if only_session and sid != only_session:
            if out_path.exists():
                have.append(sid)
            continue
        if not is_finished(start, sid, now):
            print(f"  {sid}: not finished yet ({start.isoformat()}) — skipping")
            continue
        if out_path.exists() and not force:
            print(f"  {sid}: already on disk — skipping (use --force to refetch)")
            have.append(sid)
            continue
        try:
            print(f"  {sid}: fetching…")
            payload = fetch_session(year, rnd, sid, colors, refs)
            n = write_json(out_path, payload)
            print(f"  {sid}: wrote {out_path.relative_to(REPO_ROOT)} ({n/1024:.0f} KB)")
            have.append(sid)
            wrote_any = True
        except Exception as e:  # noqa: BLE001 — one bad session must not kill the weekend
            print(f"  {sid}: FAILED — {e}", file=sys.stderr)

    if not have:
        return wrote_any

    # manifest (rewritten every run so hasData/schedule stay current)
    manifest = {
        "schema": SCHEMA,
        "year": year, "round": rnd,
        "name": (entry or {}).get("name"),
        "sprintWeekend": bool((entry or {}).get("sprint")),
        "sessions": [
            {
                "id": sid,
                "label": SESSION_LABELS[sid],
                "start": (start if start.tzinfo else start.replace(tzinfo=timezone.utc))
                .astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
                "hasData": (out_dir / f"{sid}.json").exists(),
            }
            for sid, start in sched
        ],
    }
    write_json(out_dir / "index.json", manifest)
    print(f"  manifest: {sorted(have)}")
    return wrote_any


def auto_rounds(now=None):
    """(year, [rounds]) worth checking: completed rounds of the current season
    whose weekend has begun and that are missing at least one session file."""
    now = now or datetime.now(timezone.utc)
    year = now.year
    bundle = load_bundle(year)
    if not bundle:
        print(f"No season bundle for {year}")
        return year, []
    todo = []
    for e in bundle.get("calendar", []):
        rnd = int(e.get("round", 0))
        sched = session_schedule(e, year, rnd)
        if not sched:
            continue
        pending = []
        for sid, start in sched:
            if is_finished(start, sid, now) and not (OUT_ROOT / str(year) / str(rnd) / f"{sid}.json").exists():
                pending.append(sid)
        if pending:
            todo.append(rnd)
    return year, todo


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("year", nargs="?", type=int)
    ap.add_argument("round", nargs="?", type=int)
    ap.add_argument("--session", choices=sorted(SESSION_IDS.keys()), help="only this session")
    ap.add_argument("--force", action="store_true", help="refetch even if the file exists")
    ap.add_argument("--auto", action="store_true",
                    help="scan the current-season bundle for completed sessions missing on disk")
    args = ap.parse_args()

    CACHE_DIR.mkdir(exist_ok=True)
    # force_renew bypasses FastF1's HTTP cache for the sessions we actually
    # fetch. This is essential on --auto (and honoured on --force): when a
    # session is polled BEFORE F1 publishes its timing archive, FastF1 caches
    # the empty "not ready" API responses. Without renewal, every later run
    # (including CI, which restores .fastf1-cache from a persistent Actions
    # cache) re-serves that stale empty and the session never loads even once
    # its data goes live — the poll gets stuck forever. We only load sessions
    # not already on disk, so renewing costs nothing for already-fetched ones.
    fresh = args.auto or args.force
    fastf1.Cache.enable_cache(str(CACHE_DIR), force_renew=fresh)

    if args.auto:
        year, rounds = auto_rounds()
        if not rounds:
            print("Nothing to fetch — all completed sessions already on disk.")
            return 0
        print(f"Auto mode: {year} rounds {rounds}")
        for rnd in rounds:
            print(f"{year} R{rnd}:")
            process_weekend(year, rnd)
        return 0

    if not args.year or not args.round:
        ap.error("year and round required (or use --auto)")
    print(f"{args.year} R{args.round}:")
    process_weekend(args.year, args.round, only_session=args.session, force=args.force)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
