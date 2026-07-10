import { barRowsCard, loadFace } from './og-shared.mjs';

function shortFromName(name) {
  return (name || '').replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase();
}

// Split a valueLabel like "106 wins" into the leading number and trailing unit.
function splitValue(row) {
  if (row.valueLabel) {
    const m = String(row.valueLabel).match(/^([\d.,:]+)\s*(.*)$/);
    if (m) return { main: m[1], unit: m[2] || '' };
    return { main: row.valueLabel, unit: '' };
  }
  return { main: String(row.value ?? ''), unit: '' };
}

/**
 * Records leaderboard top-3 as bar rows.
 * @param {object} topic  a records topic doc (title, subjectType, allTime.top50, ...)
 */
export async function renderRecordsOg(topic) {
  const isDriver = topic.subjectType === 'driver';
  const rows = (topic.allTime?.top50 || []).slice(0, 3);

  const faces = isDriver ? await Promise.all(rows.map((r) => loadFace(r.driverRef, 96, 96))) : [];

  const barRows = rows.map((r, i) => {
    const { main, unit } = splitValue(r);
    return {
      rank: r.rank ?? i + 1,
      name: r.name,
      sub: r.teamName || (isDriver ? null : r.nationality) || null,
      color: r.teamColor,
      img: isDriver ? faces[i] : null,
      chip: isDriver ? null : { color: r.teamColor, code: shortFromName(r.name) },
      valueMain: main,
      valueUnit: unit,
    };
  });

  return barRowsCard({
    kicker: 'F1 Records',
    title: `${topic.title} · All time`,
    rows: barRows,
  });
}
