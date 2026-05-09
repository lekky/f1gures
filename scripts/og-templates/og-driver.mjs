import { ogCard, ogBrand, ogTitle, ogSubtitle, COLORS } from './og-shared.mjs';

export function renderDriverOg(driver) {
  const fullName = `${driver.forename} ${driver.surname}`;
  const headlineParts = [];
  if (driver.career.championships > 0) {
    headlineParts.push(`${driver.career.championships}× Champion`);
  }
  headlineParts.push(`${driver.career.wins} wins`);
  headlineParts.push(`${driver.career.poles} poles`);
  const headline = headlineParts.join(' · ');

  const yearsLabel = driver.career.firstYear === driver.career.lastYear
    ? `${driver.career.firstYear}`
    : `${driver.career.firstYear}–${driver.career.lastYear}`;

  const top = {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column' },
      children: [
        {
          type: 'div',
          props: {
            style: { fontSize: 28, fontWeight: 600, color: COLORS.accent, textTransform: 'uppercase', letterSpacing: '0.08em' },
            children: 'F1 Driver',
          },
        },
        ogTitle(fullName),
        ogSubtitle(`${driver.nationality || ''} · ${yearsLabel}`.trim()),
      ],
    },
  };

  const bottom = {
    type: 'div',
    props: {
      style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' },
      children: [
        {
          type: 'div',
          props: {
            style: { fontSize: 38, fontWeight: 700, color: COLORS.text },
            children: headline,
          },
        },
        ogBrand(),
      ],
    },
  };

  return ogCard([top, bottom]);
}
