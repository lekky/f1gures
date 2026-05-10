// Build a 2-3 sentence natural-language career summary for a driver.
// Returns null when the driver has zero races (data integrity guard).

export function buildDriverSummary(driver, currentYear) {
  if (!driver || driver.career?.races == null || driver.career.races === 0) return null;

  const fullName = `${driver.forename} ${driver.surname}`;
  const surname = driver.surname || fullName.split(' ').slice(-1)[0];
  const isActive = driver.career.lastYear != null && driver.career.lastYear >= currentYear;
  const verb = isActive ? 'is' : 'was';
  const compete = isActive ? 'has competed' : 'competed';
  const yearsLabel = driver.career.firstYear === driver.career.lastYear
    ? `${driver.career.firstYear}`
    : isActive
      ? `since ${driver.career.firstYear}`
      : `between ${driver.career.firstYear} and ${driver.career.lastYear}`;

  const championshipYears = (driver.perSeason || [])
    .filter(s => s.position === 1)
    .map(s => s.year)
    .sort((a, b) => a - b);

  // perSeason is sorted newest-first by build-archive.mjs; sort ascending here so
  // the team list reads chronologically (McLaren → Mercedes → Ferrari, not the reverse).
  const teams = Array.from(new Set([...(driver.perSeason || [])]
    .sort((a, b) => a.year - b.year)
    .map(s => s.constructorName)
    .filter(Boolean)));

  const sentences = [];
  sentences.push(`${fullName} ${verb} a ${driver.nationality || ''} Formula 1 driver who ${compete} ${yearsLabel}.`.replace(/\s+/g, ' '));

  let stats = '';
  if (driver.career.championships > 0 && championshipYears.length > 0) {
    const titlesWord = driver.career.championships === 1 ? 'World Drivers\' Championship' : 'World Drivers\' Championships';
    stats += `${surname} won ${driver.career.championships} ${titlesWord} (${championshipYears.join(', ')}) `;
  }
  stats += `across ${driver.career.races} races, taking ${driver.career.wins} wins, ${driver.career.podiums} podiums and ${driver.career.poles} pole positions`;
  // For drivers with 1-4 teams, list them all. For 5+, list the first 3 chronologically
  // then "and N other teams" - keeps the sentence readable without losing all team info.
  if (teams.length > 0 && teams.length <= 4) {
    stats += ` for ${teams.join(', ')}`;
  } else if (teams.length >= 5) {
    const head = teams.slice(0, 3).join(', ');
    stats += ` for ${head} and ${teams.length - 3} other teams`;
  }
  stats += '.';
  sentences.push(stats);

  if (driver.career.championships >= 3) {
    sentences.push(`${surname} is widely regarded as one of the greatest drivers in the sport's history.`);
  }

  return sentences.join(' ');
}
