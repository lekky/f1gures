import { barRowsCard, loadFace } from './og-shared.mjs';

// Fallback short code from a team name (e.g. "Red Bull" -> "RED").
function shortFromName(name) {
  return (name || '').replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase();
}

/**
 * Current-season championship top-3 as bar rows.
 * @param {object} p
 * @param {'drivers'|'constructors'} p.kind
 * @param {number} p.year
 * @param {Array} p.rows  driver kind: {name, teamName, color, points, faceRef}
 *                        team kind:   {name, color, points, short}
 */
export async function renderStandingsOg({ kind, year, rows }) {
  const isDrivers = kind === 'drivers';
  const top = rows.slice(0, 3);

  const faces = isDrivers ? await Promise.all(top.map((r) => loadFace(r.faceRef, 96, 96))) : [];

  const barRows = top.map((r, i) => ({
    rank: i + 1,
    name: r.name,
    sub: isDrivers ? r.teamName : r.nat || null,
    color: r.color,
    img: isDrivers ? faces[i] : null,
    chip: isDrivers ? null : { color: r.color, code: r.short || shortFromName(r.name) },
    valueMain: r.points,
    valueUnit: 'pts',
  }));

  return barRowsCard({
    kicker: `${year} ${isDrivers ? "Drivers’ Championship" : "Constructors’ Championship"}`,
    title: `Championship standings · Top 3`,
    rows: barRows,
  });
}
