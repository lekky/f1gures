// Provisional race classification derived from FastF1 session data.
//
// Jolpica, our results source, can lag a race by hours - on 2026-09-06 the
// Italian GP finished ~15:00 UTC and Jolpica was still serving "12/13 rounds,
// +quali for round 13" at 19:14. FastF1 reads F1's own live timing and lands
// within minutes of the flag (that race's session file was committed at 17:29).
// So on a race evening the finishing order sits in
// public/data/fastf1/<year>/<round>/race.json while the season bundle still has
// the round un-run and the race page renders an empty holding tab.
//
// This turns that session file into archive-shaped rows so the page can show
// the order straight away, clearly marked provisional.
//
// Deliberately partial. FastF1 gives us no grid slots, classification status or
// gaps, and POINTS ARE NEVER COMPUTED HERE - scoring lives in
// src/lib/seasonStats.mjs and stays there (see CLAUDE.md; three independent
// copies once produced three different totals for the same driver). Anything we
// don't actually know stays null so the table renders a dash rather than a
// guess.
//
// The output is attached to a holding-page race doc as `provisionalResults`,
// never as `results`. The standings, championship, records, circuit-history and
// driver-doc passes all key off `results` ("in results" means "race
// completed"), so a provisional order cannot reach career stats by
// construction. It is replaced wholesale the moment Jolpica publishes the real
// classification and the round moves into bundle.results.

/**
 * @param {object} raceSession parsed public/data/fastf1/<y>/<r>/race.json
 * @returns {Array<object>} archive-shaped result rows, sorted by position.
 *   Empty when the session carries no usable finishing positions.
 */
export function buildProvisionalResults(raceSession) {
  const drivers = raceSession?.drivers;
  if (!Array.isArray(drivers) || drivers.length === 0) return [];

  const laps = raceSession.laps && typeof raceSession.laps === 'object' ? raceSession.laps : {};

  return drivers
    .map((d) => {
      if (!d || !d.code) return null;
      const position = Number(d.position);
      if (!Number.isFinite(position) || position <= 0) return null;
      const lapRows = Array.isArray(laps[d.code]) ? laps[d.code] : null;
      return {
        position,
        positionText: String(position),
        driverRef: d.ref || null,
        driverName: d.name || d.code,
        code: d.code,
        constructorRef: d.teamId || null,
        constructorName: d.team || null,
        constructorColor: d.color || null,
        // Not knowable from a FastF1 race session - see the note above.
        grid: null,
        points: null,
        laps: lapRows ? lapRows.length : null,
        time: null,
        status: null,
        fastestLapTime: null,
        fastestLapRank: null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.position - b.position);
}
