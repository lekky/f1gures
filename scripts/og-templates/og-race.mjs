import { ogCard, ogBrand, ogTitle, ogSubtitle, COLORS } from './og-shared.mjs';

// race shape: { name, year, results[], circuit: { name, flag, countryName } }
export function renderRaceOg(race) {
  const winner = race.results?.find(r => r.position === 1) || null;

  const top = {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column' },
      children: [
        {
          type: 'div',
          props: {
            style: { fontSize: 28, fontWeight: 600, color: COLORS.accent, textTransform: 'uppercase', letterSpacing: '0.08em' },
            children: `${race.year} · Round ${race.round}`,
          },
        },
        ogTitle(race.name),
        race.circuit?.name ? ogSubtitle(`${race.circuit.flag || ''} ${race.circuit.name}`.trim()) : null,
      ].filter(Boolean),
    },
  };

  const bottom = {
    type: 'div',
    props: {
      style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' },
      children: [
        winner ? {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', gap: 4 },
            children: [
              { type: 'div', props: { style: { fontSize: 20, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }, children: 'Winner' } },
              { type: 'div', props: { style: { fontSize: 44, fontWeight: 700 }, children: winner.driverName } },
              winner.constructorName ? { type: 'div', props: { style: { fontSize: 22, color: COLORS.muted }, children: winner.constructorName } } : null,
            ].filter(Boolean),
          },
        } : { type: 'div', props: { children: '' } },
        ogBrand(),
      ],
    },
  };

  return ogCard([top, bottom]);
}
