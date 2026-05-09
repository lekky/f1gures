// Build a 2-3 sentence natural-language summary of a race for SEO/snippet use.
// Returns null when the race has no results yet (future race).
//
// Input shape matches `RacePage.astro`'s `race` prop.

export function buildRaceSummary(race) {
  if (!race?.results?.length) return null;

  const winner = race.results.find(r => r.position === 1);
  const second = race.results.find(r => r.position === 2);
  const third = race.results.find(r => r.position === 3);
  if (!winner?.driverName) return null;

  const circuitName = race.circuit?.name || null;
  const dateText = race.date ? formatDateLong(race.date) : null;
  const winnerStartLabel = (() => {
    if (winner.grid == null) return null;
    if (winner.grid === 1) return 'starting from pole position';
    return `starting from P${winner.grid} on the grid`;
  })();

  const sentences = [];

  let s1 = `${winner.driverName} won the ${race.name} ${race.year}`;
  if (circuitName) s1 += ` at ${circuitName}`;
  if (dateText) s1 += ` on ${dateText}`;
  if (winnerStartLabel) s1 += `, ${winnerStartLabel}`;
  s1 += '.';
  sentences.push(s1);

  const podiumParts = [];
  if (second?.driverName) {
    podiumParts.push(`${second.driverName} finished second${second.constructorName ? ` for ${second.constructorName}` : ''}`);
  }
  if (third?.driverName) {
    podiumParts.push(`${third.driverName} completing the podium${third.constructorName ? ` for ${third.constructorName}` : ''}`);
  }
  if (podiumParts.length > 0) {
    sentences.push(podiumParts.join(', with ') + '.');
  }

  const fastest = race.results.find(r => r.fastestLapRank === 1 && r.fastestLapTime);
  if (fastest?.driverName && fastest?.fastestLapTime) {
    sentences.push(`${fastest.driverName} set the fastest lap with a time of ${fastest.fastestLapTime}.`);
  }

  if (race.sprint?.length > 0) {
    const sprintWinner = race.sprint.find(r => r.position === 1);
    if (sprintWinner?.driverName) {
      sentences.push(`It was a sprint weekend, with ${sprintWinner.driverName} winning the sprint race.`);
    }
  }

  return sentences.join(' ');
}

function formatDateLong(iso) {
  // Match shared.jsx fmtDateLong. Avoid importing JSX into a build-time helper.
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}
