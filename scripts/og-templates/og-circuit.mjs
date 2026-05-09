import { ogCard, ogBrand, ogTitle, ogSubtitle, COLORS } from './og-shared.mjs';

export function renderCircuitOg(circuit) {
  const yearsLabel = circuit.firstYear === circuit.lastYear
    ? `${circuit.firstYear}`
    : `${circuit.firstYear}–${circuit.lastYear}`;

  const top = {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column' },
      children: [
        {
          type: 'div',
          props: {
            style: { fontSize: 28, fontWeight: 600, color: COLORS.accent, textTransform: 'uppercase', letterSpacing: '0.08em' },
            children: 'F1 Circuit',
          },
        },
        ogTitle(circuit.name),
        ogSubtitle(`${circuit.flag || ''} ${circuit.location || ''}, ${circuit.countryName || ''}`.replace(/^,\s*/, '').trim()),
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
          props: { style: { fontSize: 38, fontWeight: 700 }, children: `${circuit.raceCount} F1 races · ${yearsLabel}` },
        },
        ogBrand(),
      ],
    },
  };

  return ogCard([top, bottom]);
}
