// Build a 2-3 sentence natural-language career summary for a driver.
// Returns null when the driver has zero races (data integrity guard).

export function buildDriverSummary(driver, currentYear) {
  if (!driver || driver.career?.races == null || driver.career.races === 0) return null;

  const fullName = `${driver.forename} ${driver.surname}`;
  const isActive = driver.career.lastYear != null && driver.career.lastYear >= currentYear;
  const verb = isActive ? 'is' : 'was';
  const compete = isActive ? 'has competed' : 'competed';
  const yearsLabel = driver.career.firstYear === driver.career.lastYear
    ? `${driver.career.firstYear}`
    : `between ${driver.career.firstYear} and ${driver.career.lastYear}`;

  const championshipYears = (driver.perSeason || [])
    .filter(s => s.position === 1)
    .map(s => s.year)
    .sort((a, b) => a - b);

  const teams = Array.from(new Set((driver.perSeason || [])
    .map(s => s.constructorName)
    .filter(Boolean)));

  const sentences = [];
  sentences.push(`${fullName} ${verb} a ${driver.nationality || ''} Formula 1 driver who ${compete} ${yearsLabel}.`.replace(/\s+/g, ' '));

  let stats = '';
  if (driver.career.championships > 0 && championshipYears.length > 0) {
    const titlesWord = driver.career.championships === 1 ? 'World Drivers\' Championship' : 'World Drivers\' Championships';
    stats += `${fullName.split(' ').slice(-1)[0]} won ${driver.career.championships} ${titlesWord} (${championshipYears.join(', ')}) `;
  }
  stats += `across ${driver.career.races} races, taking ${driver.career.wins} wins, ${driver.career.podiums} podiums and ${driver.career.poles} pole positions`;
  if (teams.length > 0 && teams.length <= 4) {
    stats += ` for ${teams.join(', ')}`;
  }
  stats += '.';
  sentences.push(stats);

  if (driver.career.championships >= 3) {
    sentences.push(`${fullName.split(' ').slice(-1)[0]} is widely regarded as one of the greatest drivers in the sport's history.`);
  }

  return sentences.join(' ');
}
